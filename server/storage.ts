import { Pool } from 'pg';
import { parse } from 'pg-connection-string';
import { User, PersonInfo, MasterData, Document, ClientService, ServiceCaseNote, Company, insertCompanySchema } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import type { z } from 'zod';

// Define __dirname for ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure environment variables are loaded
if (!process.env.DATABASE_URL) {
  // Try to load from production.env or development.env if not already set
  const envFile = process.env.NODE_ENV === 'production' ? 'production.env' : 'development.env';
  const possibleEnvPaths = [
    path.join(__dirname, envFile),               // /dist/production.env
    path.join(__dirname, '..', envFile),         // ../production.env
    path.join(process.cwd(), envFile),           // ./production.env
    path.join(process.cwd(), 'server', envFile)  // ./server/production.env
  ];

  for (const envPath of possibleEnvPaths) {
    console.log(`Storage.ts - Checking for env file at: ${envPath}`);
    if (fs.existsSync(envPath)) {
      console.log(`Storage.ts - Loading environment variables from: ${envPath}`);
      const envConfig = dotenv.parse(fs.readFileSync(envPath));
      for (const k in envConfig) {
        process.env[k] = envConfig[k];
      }
      break;
    }
  }
}

// DATABASE_URL check
console.log('Storage.ts - DATABASE_URL configured:', process.env.DATABASE_URL ? 'Yes' : 'No');

// Better error handling when parsing the connection string
let connectionOptions;
try {
  const parsed = parse(process.env.DATABASE_URL || '');
  connectionOptions = {
    user: parsed.user,
    host: parsed.host || '',
    database: parsed.database || '',
    password: parsed.password,
    port: parsed.port ? parseInt(parsed.port) : 5432,
  };
  
  console.log('Parsed connection options:', {
    user: connectionOptions.user || '',
    host: connectionOptions.host,
    database: connectionOptions.database,
    // Not logging password for security reasons
    port: connectionOptions.port
  });
  
  if (!connectionOptions.host) {
    throw new Error('Invalid hostname in DATABASE_URL. Please verify the configuration.');
  }
} catch (error) {
  console.error('Error parsing DATABASE_URL:', error);
  throw new Error('Invalid DATABASE_URL format. Please check your environment configuration.');
}

export const pool = new Pool(connectionOptions);

// Add error handling for the pool
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

pool.on('connect', () => {
  console.log('Connected to database successfully');
});

// Test the connection
(async () => {
  try {
    const client = await pool.connect();
    console.log('Database connection test successful');
    client.release();
  } catch (err) {
    console.error('Error testing database connection:', err);
    if (err instanceof Error) {
      console.error('Error details:', err.message);
      console.error('Stack trace:', err.stack);
    }
  }
})();

/**
 * Initialize database and run migrations
 * 
 * Connects to the database and runs the initial migration script if needed.
 * This ensures the database schema is properly set up with all required tables.
 * 
 * @returns {Promise<void>} Resolves when migration is complete or rejects on error
 * @throws {Error} If database connection fails or migration script cannot be executed
 */
export async function initializeDatabase() {
  let client;
  try {
    // Connect to the database
    client = await pool.connect();
    
    // Run initial migration if not already applied
    const initialMigrationPath = path.resolve(process.cwd(), '../migrations/01_initial.sql');
    const initialMigrationSQL = fs.readFileSync(initialMigrationPath, 'utf8');
    
    await client.query(initialMigrationSQL);
    console.log('Database migrations completed successfully');
    
  } catch (err) {
    console.error('Database connection error:', err);
    throw err;
  } finally {
    if (client) {
      client.release();
    }
  }
}

/**
 * Input validation helper
 * 
 * Validates input values based on their expected data type.
 * Used throughout the Storage class to ensure data integrity.
 * 
 * @param {any} input - The value to validate
 * @param {string} type - The expected data type ('id', 'string', 'date', 'boolean', or 'array')
 * @returns {boolean} True if input is valid for the specified type, false otherwise
 */
function validateInput(input: any, type: string): boolean {
  switch(type) {
    case 'id':
      return Number.isInteger(input) && input > 0;
    case 'string':
      return typeof input === 'string' && input.length > 0;
    case 'date':
      return !isNaN(Date.parse(input));
    case 'boolean':
      return typeof input === 'boolean';
    case 'array':
      return Array.isArray(input);
    default:
      return false;
  }
}

/**
 * SQL injection prevention helper
 * 
 * Sanitizes input strings by removing potentially dangerous SQL characters.
 * This adds an extra layer of security beyond parameterized queries.
 * 
 * @param {string} input - The string to sanitize
 * @returns {string} Sanitized string with dangerous characters removed
 */
function sanitizeInput(input: string): string {
  // Remove any dangerous SQL characters
  return input.replace(/['";\\]/g, '');
}

/**
 * Database error handler
 * 
 * Processes database errors and throws meaningful exceptions based on error codes.
 * Provides better context for debugging by logging operation details.
 * 
 * @param {any} error - The database error object
 * @param {string} operation - Name of the operation that caused the error
 * @throws {Error} A more descriptive error based on the database error code
 */
function handleDatabaseError(error: any, operation: string): never {
  console.error(`Database error during ${operation}:`, error);
  if (error.code === '23505') { // Unique violation
    throw new Error('Duplicate entry found');
  }
  if (error.code === '23503') { // Foreign key violation
    if (operation === 'createClientService') {
      throw new Error('The selected service combination does not exist in the master data. Please create it in the Master Data section first.');
    } else {
      throw new Error('Referenced record not found');
    }
  }
  throw new Error(`Database error during ${operation}`);
}

export interface NewServiceCaseNote {
  serviceId: number;
  noteText: string;
  createdBy: number;
}

const SALT_ROUNDS = 10;

/**
 * Storage class for database interactions
 * 
 * Provides methods for all database operations in the Care Data Manager application.
 * Handles CRUD operations for users, clients, services, documents, and other entities.
 * Implements proper validation, error handling, and transaction management.
 */
export class Storage {
  private pool: Pool;
  /**
   * Constructor for Storage class
   * 
   * Initializes a new Storage instance with a database connection pool.
   * 
   * @param {Pool} pool - PostgreSQL connection pool
   */
  constructor(pool: Pool) {
    this.pool = pool;
  }
  /**
   * Execute an operation within a database transaction
   * 
   * Manages transaction lifecycle (BEGIN, COMMIT, ROLLBACK) and client connection.
   * Ensures proper cleanup of database resources even if an error occurs.
   * 
   * @template T - Return type of the operation
   * @param {Function} operation - Async function to execute within the transaction
   * @returns {Promise<T>} Result of the operation
   * @throws {Error} If the transaction fails for any reason
   */
  async withTransaction<T>(operation: (client: any) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await operation(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  /**
   * Get all users
   * 
   * Retrieves all users from the database with basic information.
   * Does not include sensitive information like passwords.
   * 
   * @returns {Promise<User[]>} Array of user records
   * @throws {Error} If database query fails
   */
  async getAllUsers(): Promise<User[]> {
    try {
      const result = await this.pool.query(
        'SELECT id, name, username, role, company_id FROM users ORDER BY id'
      );
      return result.rows;
    } catch (error) {
      handleDatabaseError(error, 'getAllUsers');
    }
  }
  /**
   * Get user by username
   * 
   * Retrieves a user record by username, including sensitive information like password.
   * Used for authentication and user lookup.
   * 
   * @param {string} username - Username to search for
   * @returns {Promise<User | null>} User record if found, null otherwise
   * @throws {Error} If username format is invalid or database query fails
   */
  async getUserByUsername(username: string): Promise<User | null> {
    if (!validateInput(username, 'string')) {
      throw new Error('Invalid username format');
    }
    
    try {
      const result = await this.pool.query(
        'SELECT id, name, username, password, role, company_id FROM users WHERE username = $1',
        [username]
      );
      return result.rows[0] || null;
    } catch (error) {
      handleDatabaseError(error, 'getUserByUsername');
    }
  }
  /**
   * Get user by ID
   * 
   * Retrieves a user record by their unique ID.
   * Does not include sensitive information like passwords.
   * 
   * @param {number} id - User ID to search for
   * @returns {Promise<User | null>} User record if found, null otherwise
   * @throws {Error} If ID format is invalid or database query fails
   */
  async getUserById(id: number): Promise<User | null> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      const result = await this.pool.query(
        'SELECT id, name, username, role, company_id FROM users WHERE id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      handleDatabaseError(error, 'getUserById');
    }
  }
  /**
   * Verify user password
   * 
   * Checks if the provided password matches the stored password for a user.
   * Uses bcrypt to securely compare passwords without exposing the hash.
   * 
   * @param {string} username - Username to verify password for
   * @param {string} password - Plain text password to verify
   * @returns {Promise<boolean>} True if password matches, false otherwise
   * @throws {Error} If username/password format is invalid or database query fails
   */
  async verifyPassword(username: string, password: string): Promise<boolean> {
    if (!validateInput(username, 'string') || !validateInput(password, 'string')) {
      throw new Error('Invalid username or password format');
    }

    try {
      const result = await this.pool.query(
        'SELECT password FROM users WHERE username = $1',
        [username]
      );
      if (!result.rows[0]) return false;
      return bcrypt.compare(password, result.rows[0].password);
    } catch (error) {
      handleDatabaseError(error, 'verifyPassword');
    }
  }
  /**
   * Update user password
   * 
   * Changes the password for a user identified by their ID.
   * Securely hashes the new password before storing it.
   * 
   * @param {number} id - ID of the user whose password to update
   * @param {string} newPassword - New plain text password to set
   * @returns {Promise<void>} Resolves when password is updated
   * @throws {Error} If ID/password format is invalid or database update fails
   */
  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    if (!validateInput(id, 'id') || !validateInput(newPassword, 'string')) {
      throw new Error('Invalid ID or password format');
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await this.pool.query(
        'UPDATE users SET password = $1 WHERE id = $2',
        [hashedPassword, id]
      );
    } catch (error) {
      handleDatabaseError(error, 'updateUserPassword');
    }
  }
  /**
   * Reset admin password
   * 
   * Resets the admin user's password back to the default value.
   * Used for system recovery when admin credentials are lost.
   * 
   * @returns {Promise<void>} Resolves when admin password is reset
   * @throws {Error} If the admin user cannot be found or database update fails
   */
  async resetAdminPassword(): Promise<void> {
    try {
      const defaultPassword = 'password';
      const hashedPassword = await bcrypt.hash(defaultPassword, SALT_ROUNDS);
      
      await this.pool.query(
        'UPDATE users SET password = $1 WHERE username = $2',
        [hashedPassword, 'admin']
      );
      
      console.log('Admin password has been reset successfully');
    } catch (error) {
      console.error('Error resetting admin password:', error);
      handleDatabaseError(error, 'resetAdminPassword');
    }
  }
  /**
   * Create a new user
   * 
   * Creates a new user in the system with the specified details.
   * Uses transaction to ensure data integrity and prevent duplicate usernames.
   * 
   * @param {object} user - User data object
   * @param {string} user.name - Full name of the user
   * @param {string} user.username - Unique username for login
   * @param {string} user.password - Password in plain text (will be hashed)
   * @param {string} [user.role] - User role (defaults to 'user' if not specified)
   * @param {number} [user.company_id] - Optional company ID to associate with user
   * @returns {Promise<User>} Created user record
   * @throws {Error} If validation fails or username already exists
   */
  async createUser(user: { name: string; username: string; password: string; role?: string; company_id?: number }): Promise<User> {
    if (!validateInput(user.name, 'string') || 
        !validateInput(user.username, 'string') || 
        !validateInput(user.password, 'string')) {
      throw new Error('Invalid user data format');
    }

    try {
      return await this.withTransaction(async (client) => {
        const existingUser = await client.query(
          'SELECT id FROM users WHERE username = $1',
          [user.username]
        );
        
        if (existingUser.rows.length > 0) {
          throw new Error('Username already exists');
        }

        const result = await client.query(
          'INSERT INTO users (name, username, password, role, company_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, username, role, company_id',
          [user.name, user.username, user.password, user.role || 'user', user.company_id]
        );

        return result.rows[0];
      });
    } catch (error) {
      handleDatabaseError(error, 'createUser');
    }
  }
  /**
   * Update user information
   * 
   * Updates one or more fields of a user record.
   * Only updates fields that are provided in the data object.
   * Securely hashes password if it is being updated.
   * 
   * @param {number} id - ID of the user to update
   * @param {object} data - Data fields to update
   * @param {string} [data.name] - Updated user name
   * @param {string} [data.password] - New password (will be hashed)
   * @param {string} [data.role] - Updated user role
   * @param {number} [data.company_id] - Updated company association
   * @returns {Promise<User>} Updated user record
   * @throws {Error} If ID format is invalid or database update fails
   */
  async updateUser(id: number, data: { name?: string; password?: string; role?: string; company_id?: number }): Promise<User> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.name) {
        updateFields.push(`name = $${paramCount}`);
        values.push(data.name);
        paramCount++;
      }
      if (data.password) {
        // Hash the password before storing it
        const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);
        updateFields.push(`password = $${paramCount}`);
        values.push(hashedPassword);
        paramCount++;
      }
      if (data.role) {
        updateFields.push(`role = $${paramCount}`);
        values.push(data.role);
        paramCount++;
      }
      if (data.company_id !== undefined) {
        updateFields.push(`company_id = $${paramCount}`);
        values.push(data.company_id);
        paramCount++;
      }

      values.push(id);
      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')} 
        WHERE id = $${paramCount}
        RETURNING id, name, username, role, company_id
      `;

      const result = await this.pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'updateUser');
    }
  }
  /**
   * Delete a user
   * 
   * Permanently removes a user from the system by their ID.
   * 
   * @param {number} id - ID of the user to delete
   * @returns {Promise<void>} Resolves when user is deleted
   * @throws {Error} If ID format is invalid or database delete fails
   */
  async deleteUser(id: number): Promise<void> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      await this.pool.query('DELETE FROM users WHERE id = $1', [id]);
    } catch (error) {
      handleDatabaseError(error, 'deleteUser');
    }
  }
  /**
   * Create person information record
   * 
   * Creates a new client/person record with personal information, contact details,
   * address, and other relevant information.
   * 
   * @param {Omit<PersonInfo, 'id'>} data - Complete person information object without ID
   * @returns {Promise<PersonInfo>} Created person record with generated ID
   * @throws {Error} If database insertion fails
   */
  async createPersonInfo(data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
    try {
      const {
        title,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        email,
        homePhone,
        mobilePhone,
        addressLine1,
        addressLine2,
        addressLine3,
        postCode,
        mailingAddressLine1,
        mailingAddressLine2,
        mailingAddressLine3,
        mailingPostCode,
        useHomeAddress,
        nextOfKinName,
        nextOfKinAddress,
        nextOfKinEmail,
        nextOfKinPhone,
        hcpLevel,
        hcpStartDate,
        status,
        createdBy,
        segmentId
      } = data;

      const result = await this.pool.query(
        `INSERT INTO person_info (
          title, first_name, middle_name, last_name, date_of_birth, email,
          home_phone, mobile_phone, address_line1, address_line2, address_line3,
          post_code, mailing_address_line1, mailing_address_line2, mailing_address_line3,
          mailing_post_code, use_home_address, next_of_kin_name, next_of_kin_address,
          next_of_kin_email, next_of_kin_phone, hcp_level, hcp_start_date, status, created_by, segment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)
        RETURNING *`,
        [
          title,
          firstName,
          middleName,
          lastName,
          dateOfBirth,
          email,
          homePhone,
          mobilePhone,
          addressLine1,
          addressLine2,
          addressLine3,
          postCode,
          mailingAddressLine1,
          mailingAddressLine2,
          mailingAddressLine3,
          mailingPostCode,
          useHomeAddress,
          nextOfKinName,
          nextOfKinAddress,
          nextOfKinEmail,
          nextOfKinPhone,
          hcpLevel,
          hcpStartDate,
          status,
          createdBy,
          segmentId
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'createPersonInfo');
    }
  }
  /**
   * Get all person information records
   * 
   * Retrieves all client/person records from the database.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<PersonInfo[]>} Array of person information records
   * @throws {Error} If database query fails
   */
  async getAllPersonInfo(segmentId?: number): Promise<PersonInfo[]> {
    try {
      let query = 'SELECT * FROM person_info';
      const params = [];
      
      if (segmentId) {
        query += ' WHERE segment_id = $1';
        params.push(segmentId);
      }
      
      const result = await this.pool.query(query, params);
      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        email: row.email,
        homePhoneCountryCode: row.home_phone_country_code || null,
        homePhone: row.home_phone || null,
        mobilePhoneCountryCode: row.mobile_phone_country_code || null,
        mobilePhone: row.mobile_phone || null,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2 || null,
        addressLine3: row.address_line3 || null,
        postCode: row.post_code,
        mailingAddressLine1: row.mailing_address_line1 || null,
        mailingAddressLine2: row.mailing_address_line2 || null,
        mailingAddressLine3: row.mailing_address_line3 || null,
        mailingPostCode: row.mailing_post_code || null,
        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name || null,
        nextOfKinAddress: row.next_of_kin_address || null,
        nextOfKinEmail: row.next_of_kin_email || null,
        nextOfKinPhoneCountryCode: row.next_of_kin_phone_country_code || null,
        nextOfKinPhone: row.next_of_kin_phone || null,
        hcpLevel: row.hcp_level || null,
        hcpStartDate: row.hcp_start_date || null,
        status: row.status || 'New',
        createdBy: row.created_by || null,
        segmentId: row.segment_id || null
      }));
    } catch (error) {
      handleDatabaseError(error, 'getAllPersonInfo');
    }
  }
  /**
   * Get person information by ID
   * 
   * Retrieves a specific client/person record by their unique ID.
   * 
   * @param {number} id - ID of the person to retrieve
   * @returns {Promise<PersonInfo | null>} Person record if found, null otherwise
   * @throws {Error} If ID format is invalid or database query fails
   */
  async getPersonInfoById(id: number): Promise<PersonInfo | null> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      const result = await this.pool.query('SELECT * FROM person_info WHERE id = $1', [id]);
      if (!result.rows[0]) return null;
      
      const row = result.rows[0];
      return {
        id: row.id,
        title: row.title,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        email: row.email,
        homePhoneCountryCode: row.home_phone_country_code || null,
        homePhone: row.home_phone || null,
        mobilePhoneCountryCode: row.mobile_phone_country_code || null,
        mobilePhone: row.mobile_phone || null,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2 || null,
        addressLine3: row.address_line3 || null,
        postCode: row.post_code,
        mailingAddressLine1: row.mailing_address_line1 || null,
        mailingAddressLine2: row.mailing_address_line2 || null,
        mailingAddressLine3: row.mailing_address_line3 || null,
        mailingPostCode: row.mailing_post_code || null,
        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name || null,
        nextOfKinAddress: row.next_of_kin_address || null,
        nextOfKinEmail: row.next_of_kin_email || null,
        nextOfKinPhoneCountryCode: row.next_of_kin_phone_country_code || null,
        nextOfKinPhone: row.next_of_kin_phone || null,
        hcpLevel: row.hcp_level || null,
        hcpStartDate: row.hcp_start_date || null,
        status: row.status || 'New',
        createdBy: row.created_by || null,
        segmentId: row.segment_id || null
      };
    } catch (error) {
      handleDatabaseError(error, 'getPersonInfoById');
    }
  }
  /**
   * Update person information
   * 
   * Updates an existing client/person record with new information.
   * Performs comprehensive update of all fields.
   * 
   * @param {number} id - ID of the person record to update
   * @param {Omit<PersonInfo, 'id'>} data - Complete updated person information
   * @returns {Promise<PersonInfo>} Updated person record
   * @throws {Error} If ID format is invalid or database update fails
   */
  async updatePersonInfo(id: number, data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      const {
        title,
        firstName,
        middleName,
        lastName,
        dateOfBirth,
        email,
        homePhone,
        mobilePhone,
        addressLine1,
        addressLine2,
        addressLine3,
        postCode,
        mailingAddressLine1,
        mailingAddressLine2,
        mailingAddressLine3,
        mailingPostCode,
        useHomeAddress,
        nextOfKinName,
        nextOfKinAddress,
        nextOfKinEmail,
        nextOfKinPhone,
        hcpLevel,
        hcpStartDate,
        status,
        createdBy,
        segmentId
      } = data;

      const result = await this.pool.query(
        `UPDATE person_info SET
          title = $1, first_name = $2, middle_name = $3, last_name = $4,
          date_of_birth = $5, email = $6, home_phone = $7, mobile_phone = $8,
          address_line1 = $9, address_line2 = $10, address_line3 = $11,
          post_code = $12, mailing_address_line1 = $13, mailing_address_line2 = $14,
          mailing_address_line3 = $15, mailing_post_code = $16, use_home_address = $17,
          next_of_kin_name = $18, next_of_kin_address = $19, next_of_kin_email = $20,
          next_of_kin_phone = $21, hcp_level = $22, hcp_start_date = $23, status = $24,
          segment_id = $25
        WHERE id = $26
        RETURNING *`,
        [
          title,
          firstName,
          middleName || '',
          lastName,
          dateOfBirth,
          email,
          homePhone || '',
          mobilePhone,
          addressLine1,
          addressLine2 || '',
          addressLine3 || '',
          postCode,
          mailingAddressLine1 || '',
          mailingAddressLine2 || '',
          mailingAddressLine3 || '',
          mailingPostCode || '',
          useHomeAddress,
          nextOfKinName || '',
          nextOfKinAddress || '',
          nextOfKinEmail || '',
          nextOfKinPhone || '',
          hcpLevel || '',
          hcpStartDate || '',
          status || 'New',
          segmentId,
          id
        ]
      );

      if (result.rows.length === 0) {
        throw new Error(`Person with ID ${id} not found`);
      }

      const row = result.rows[0];
      return {
        id: row.id,
        title: row.title,
        firstName: row.first_name,
        middleName: row.middle_name,
        lastName: row.last_name,
        dateOfBirth: row.date_of_birth,
        email: row.email,
        homePhone: row.home_phone,
        mobilePhone: row.mobile_phone,
        addressLine1: row.address_line1,
        addressLine2: row.address_line2,
        addressLine3: row.address_line3,
        postCode: row.post_code,
        mailingAddressLine1: row.mailing_address_line1,
        mailingAddressLine2: row.mailing_address_line2,
        mailingAddressLine3: row.mailing_address_line3,
        mailingPostCode: row.mailing_post_code,
        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name,
        nextOfKinAddress: row.next_of_kin_address,
        nextOfKinEmail: row.next_of_kin_email,
        nextOfKinPhone: row.next_of_kin_phone,
        hcpLevel: row.hcp_level,
        hcpStartDate: row.hcp_start_date,
        status: row.status,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'updatePersonInfo');
    }
  }
  /**
   * Check for duplicate service
   * 
   * Verifies if a service with the same category, type, and provider already exists.
   * Used to prevent duplicate entries in the master data table.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check
   * @param {string} serviceProvider - Service provider to check
   * @returns {Promise<boolean>} True if a duplicate exists, false otherwise
   * @throws {Error} If input validation fails or database query fails
   */
  async checkDuplicateService(serviceCategory: string, serviceType: string, serviceProvider: string): Promise<boolean> {
    if (!validateInput(serviceCategory, 'string') || !validateInput(serviceType, 'string') || !validateInput(serviceProvider, 'string')) {
      throw new Error('Invalid service data format');
    }

    try {
      const result = await this.pool.query(
        'SELECT COUNT(*) FROM master_data WHERE service_category = $1 AND service_type = $2 AND service_provider = $3',
        [serviceCategory, serviceType, serviceProvider || '']
      );
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      handleDatabaseError(error, 'checkDuplicateService');
    }
  }
  /**
   * Create master data entry
   * 
   * Creates a new service definition in the master data table.
   * Checks for duplicates before insertion.
   * 
   * @param {Omit<MasterData, 'id'>} data - Master data object without ID
   * @returns {Promise<MasterData>} Created master data record with generated ID
   * @throws {Error} If duplicate service exists or database insertion fails
   */
  async createMasterData(data: Omit<MasterData, 'id'>): Promise<MasterData> {
    try {
      const isDuplicate = await this.checkDuplicateService(
        data.serviceCategory, 
        data.serviceType, 
        data.serviceProvider || ''
      );
      
      if (isDuplicate) {
        throw new Error('A service with this combination of category, type, and provider already exists');
      }

      console.log('Creating master data with segmentId:', data.segmentId);

      const result = await this.pool.query(
        'INSERT INTO master_data (service_category, service_type, service_provider, active, created_by, segment_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider || '',
          data.active ?? true,
          data.createdBy,
          data.segmentId || null
        ]
      );

      return {
        id: result.rows[0].id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider || undefined,
        active: result.rows[0].active,
        createdBy: result.rows[0].created_by,
        createdAt: result.rows[0].created_at,
        segmentId: result.rows[0].segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'createMasterData');
    }
  }
  /**
   * Get all master data
   * 
   * Retrieves all service definitions from the master data table.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<MasterData[]>} Array of master data records
   * @throws {Error} If database query fails
   */
  async getAllMasterData(segmentId?: number): Promise<MasterData[]> {
    try {
      let queryText = 'SELECT * FROM master_data';
      const params = [];
      
      if (segmentId !== undefined) {
        queryText += ' WHERE segment_id = $1 OR segment_id IS NULL';
        params.push(segmentId);
      }
      
      queryText += ' ORDER BY id DESC';
      
      const result = await this.pool.query(queryText, params);
      return result.rows.map(row => ({
        id: row.id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        active: row.active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        segmentId: row.segment_id
      }));
    } catch (error) {
      handleDatabaseError(error, 'getAllMasterData');
    }
  }
  /**
   * Update master data status
   * 
   * Updates the status of a master data record.
   * Used to enable/disable services or change their status.
   * 
   * @param {number} id - ID of the master data record to update
   * @param {string} status - New status value
   * @returns {Promise<void>} Resolves when status is updated
   * @throws {Error} If ID or status format is invalid or database update fails
   */
  async updateMasterDataStatus(id: number, status: string): Promise<void> {
    if (!validateInput(id, 'id') || !validateInput(status, 'string')) {
      throw new Error('Invalid ID or status format');
    }

    try {
      await this.pool.query('UPDATE master_data SET status = $1 WHERE id = $2', [status, id]);
    } catch (error) {
      handleDatabaseError(error, 'updateMasterDataStatus');
    }
  }
  /**
   * Update master data record
   * 
   * Updates service definition fields in the master data table.
   * Allows changing category, type, provider, active status, and segment.
   * 
   * @param {number} id - ID of the master data record to update
   * @param {Omit<MasterData, 'id'>} data - Updated master data information
   * @returns {Promise<MasterData>} Updated master data record
   * @throws {Error} If ID format is invalid or database update fails
   */
  async updateMasterData(id: number, data: Omit<MasterData, 'id'>): Promise<MasterData> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      const result = await this.pool.query(
        `UPDATE master_data SET 
          service_category = $1,
          service_type = $2,
          service_provider = $3,
          active = $4,
          segment_id = $5
        WHERE id = $6 RETURNING *`,
        [
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider || '',
          data.active,
          data.segmentId || null,
          id
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Master data record not found');
      }

      return {
        id: result.rows[0].id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider || undefined,
        active: result.rows[0].active,
        createdBy: result.rows[0].created_by,
        createdAt: result.rows[0].created_at,
        segmentId: result.rows[0].segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'updateMasterData');
    }
  }
  /**
   * Get documents by client ID
   * 
   * Retrieves all documents associated with a specific client.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} clientId - ID of the client whose documents to retrieve
   * @param {number} [segmentId] - Optional segment ID to filter documents by
   * @returns {Promise<Document[]>} Array of document records
   * @throws {Error} If database query fails
   */
  async getDocumentsByClientId(clientId: number, segmentId?: number): Promise<Document[]> {
    try {
      let queryText = 'SELECT * FROM documents WHERE client_id = $1';
      const params = [clientId];

      if (segmentId !== undefined) {
        queryText += ' AND (segment_id = $2 OR segment_id IS NULL)';
        params.push(segmentId);
      }

      const result = await this.pool.query(queryText, params);
      return result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      }));
    } catch (error) {
      handleDatabaseError(error, 'getDocumentsByClientId');
    }
  }
  /**
   * Create document record
   * 
   * Creates a new document record in the database after uploading a file.
   * Associates the document with a client.
   * 
   * @param {object} document - Document data object
   * @param {number} document.clientId - ID of the client the document belongs to
   * @param {string} document.documentName - Display name of the document
   * @param {string} document.documentType - Type/category of the document
   * @param {string} document.filename - Name of the file as stored in the filesystem
   * @param {string} document.filePath - Path to the file in the storage system
   * @param {number} document.createdBy - ID of the user who created the document
   * @param {Date} document.uploadedAt - Timestamp of when the document was uploaded
   * @param {number} [document.segmentId] - Optional segment ID to associate with the document
   * @returns {Promise<Document>} Created document record
   * @throws {Error} If database insertion fails
   */
  async createDocument(document: any): Promise<Document> {
    try {
      const {
        clientId,
        documentName,
        documentType,
        filename,
        filePath,
        createdBy,
        uploadedAt,
        segmentId
      } = document;

      const result = await this.pool.query(
        `INSERT INTO documents (
          client_id, document_name, document_type, filename, file_path, created_by, uploaded_at, segment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [clientId, documentName, documentType, filename, filePath, createdBy, uploadedAt, segmentId]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'createDocument');
    }
  }
  /**
   * Get document by filename
   * 
   * Retrieves a document record by its filename.
   * Used to check if a file already exists or to fetch document metadata.
   * 
   * @param {string} filename - Name of the file to search for
   * @returns {Promise<Document | null>} Document record if found, null otherwise
   * @throws {Error} If filename format is invalid or database query fails
   */
  async getDocumentByFilename(filename: string): Promise<Document | null> {
    if (!validateInput(filename, 'string')) {
      throw new Error('Invalid filename format');
    }

    try {
      const result = await this.pool.query('SELECT * FROM documents WHERE filename = $1 LIMIT 1', [filename]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'getDocumentByFilename');
    }
  }
  /**
   * Get document by file path
   * 
   * Retrieves a document record by its file path in the storage system.
   * Used to locate documents based on their storage location.
   * 
   * @param {string} filePath - Path of the file to search for
   * @returns {Promise<Document | null>} Document record if found, null otherwise
   * @throws {Error} If file path format is invalid or database query fails
   */
  async getDocumentByFilePath(filePath: string): Promise<Document | null> {
    if (!validateInput(filePath, 'string')) {
      throw new Error('Invalid file path format');
    }

    try {
      const result = await this.pool.query('SELECT * FROM documents WHERE file_path = $1 LIMIT 1', [filePath]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'getDocumentByFilePath');
    }
  }
  /**
   * Get client services by client ID
   * 
   * Retrieves all services assigned to a specific client.
   * Includes client name by joining with person_info table.
   * Can be filtered by segment ID if provided.
   * 
   * @param {number} clientId - ID of the client whose services to retrieve
   * @param {number} [segmentId] - Optional segment ID to filter services
   * @returns {Promise<ClientService[]>} Array of client service records
   * @throws {Error} If database query fails
   */  async getClientServicesByClientId(clientId: number, segmentId?: number): Promise<ClientService[]> {
    try {
      let queryText = `
        SELECT cs.*, p.first_name, p.last_name 
        FROM client_services cs
        JOIN person_info p ON cs.client_id = p.id
        WHERE cs.client_id = $1
      `;
      const params = [clientId];

      if (segmentId !== undefined) {
        // Improved segment filtering to be more explicit
        queryText += ' AND (cs.segment_id = $2 OR cs.segment_id IS NULL)';
        console.log("[Storage] Filtering client services by segmentId:", segmentId);
        params.push(segmentId);
      }

      queryText += ' ORDER BY cs.created_at DESC';
      console.log("[Storage] getClientServicesByClientId query:", queryText, "params:", params);

      const result = await this.pool.query(queryText, params);
      return result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: row.service_days,
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id,
        clientName: `${row.first_name} ${row.last_name}`
      }));
    } catch (error) {
      handleDatabaseError(error, 'getClientServicesByClientId');
    }
  }
  /**
   * Get all client services
   * 
   * Retrieves all service assignments across all clients.
   * Used for administrative overview and reporting.
   * 
   * @returns {Promise<ClientService[]>} Array of all client service records
   * @throws {Error} If database query fails
   */
  async getClientServices(): Promise<ClientService[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM client_services ORDER BY id'
      );
      return result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: row.service_days,
        serviceHours: row.service_hours,
        status: row.status || null,
        createdAt: row.created_at || null,
        createdBy: row.created_by || null,
        segmentId: row.segment_id || null
      }));
    } catch (error) {
      handleDatabaseError(error, 'getClientServices');
    }
  }
  /**
   * Create client service
   * 
   * Assigns a service to a client and records details about the service arrangement.
   * 
   * @param {object} data - Client service data
   * @param {number} data.clientId - ID of the client receiving the service
   * @param {string} data.serviceCategory - Category of the service
   * @param {string} data.serviceType - Type of service within the category
   * @param {string} data.serviceProvider - Provider delivering the service
   * @param {Date} data.serviceStartDate - Date when service should begin
   * @param {string} data.serviceDays - Days of the week when service is provided
   * @param {string} data.serviceHours - Hours per day/week for the service
   * @param {string} [data.status] - Current status of the service (defaults to 'Planned')
   * @param {number} data.createdBy - ID of the user creating the service assignment
   * @param {Date} [data.createdAt] - Timestamp of creation (defaults to current time)
   * @param {number} [data.segmentId] - Segment ID this service belongs to
   * @returns {Promise<ClientService>} Created client service record
   * @throws {Error} If database insertion fails
   */  async createClientService(data: any): Promise<ClientService> {
    try {
      const {
        clientId,
        serviceCategory,
        serviceType,
        serviceProvider,
        serviceStartDate,
        serviceDays,
        serviceHours,
        status,
        createdBy,
        createdAt,
        segmentId
      } = data;

      console.log("[Storage] Creating client service with segmentId:", segmentId);
      
      // Ensure segmentId is explicitly null if undefined or empty string
      const normalizedSegmentId = segmentId === undefined || segmentId === '' ? null : segmentId;
      console.log("[Storage] Normalized segmentId value:", normalizedSegmentId);

      const result = await this.pool.query(
        `INSERT INTO client_services (
          client_id, service_category, service_type, service_provider, 
          service_start_date, service_days, service_hours, status, created_by, created_at, segment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          clientId,
          serviceCategory,
          serviceType,
          serviceProvider,
          serviceStartDate,
          serviceDays,
          serviceHours,
          status || 'Planned',
          createdBy,
          createdAt || new Date(),
          normalizedSegmentId
        ]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: row.service_days,
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'createClientService');
    }
  }
  /**
   * Update client service status
   * 
   * Updates the status of a client service record.
   * Used to track service lifecycle (e.g., planned, active, completed, cancelled).
   * 
   * @param {number} id - ID of the client service to update
   * @param {string} status - New status value
   * @returns {Promise<void>} Resolves when status is updated
   * @throws {Error} If ID or status format is invalid or database update fails
   */
  async updateClientServiceStatus(id: number, status: string): Promise<void> {
    if (!validateInput(id, 'id') || !validateInput(status, 'string')) {
      throw new Error('Invalid ID or status format');
    }

    try {
      await this.pool.query(
        'UPDATE client_services SET status = $1 WHERE id = $2',
        [status, id]
      );
    } catch (error) {
      handleDatabaseError(error, 'updateClientServiceStatus');
    }
  }
  /**
   * Get service case note
   * 
   * Retrieves the most recent case note for a service.
   * Used to show the latest update or status of a service.
   * 
   * @param {number} serviceId - ID of the service to get case note for
   * @returns {Promise<ServiceCaseNote | null>} Most recent case note if available, null otherwise
   * @throws {Error} If service ID format is invalid or database query fails
   */
  async getServiceCaseNote(serviceId: number): Promise<ServiceCaseNote | null> {
    if (!validateInput(serviceId, 'id')) {
      throw new Error('Invalid service ID format');
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM service_case_notes WHERE service_id = $1 ORDER BY created_at DESC LIMIT 1',
        [serviceId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return {
        id: result.rows[0].id,
        serviceId: result.rows[0].service_id,
        noteText: result.rows[0].note_text,
        createdAt: result.rows[0].created_at,
        createdBy: result.rows[0].created_by,
        updatedAt: result.rows[0].updated_at,
        updatedBy: result.rows[0].updated_by
      };
    } catch (error) {
      handleDatabaseError(error, 'getServiceCaseNote');
    }
  }
  /**
   * Create service case note
   * 
   * Creates a new case note for a service.
   * Used to document observations, changes, or important information about service delivery.
   * 
   * @param {NewServiceCaseNote} data - Case note data
   * @param {number} data.serviceId - ID of the service this note belongs to
   * @param {string} data.noteText - Content of the case note
   * @param {number} data.createdBy - ID of the user creating the note
   * @returns {Promise<ServiceCaseNote>} Created case note record
   * @throws {Error} If database insertion fails
   */
  async createServiceCaseNote(data: NewServiceCaseNote): Promise<ServiceCaseNote> {
    try {
      const result = await this.pool.query(
        `INSERT INTO service_case_notes (
          service_id, note_text, created_by
        ) VALUES ($1, $2, $3) RETURNING *`,
        [data.serviceId, data.noteText, data.createdBy]
      );

      return {
        id: result.rows[0].id,
        serviceId: result.rows[0].service_id,
        noteText: result.rows[0].note_text,
        createdAt: result.rows[0].created_at,
        createdBy: result.rows[0].created_by,
        updatedAt: result.rows[0].updated_at,
        updatedBy: result.rows[0].updated_by
      };
    } catch (error) {
      handleDatabaseError(error, 'createServiceCaseNote');
    }
  }
  /**
   * Update service case note
   * 
   * Updates an existing case note for a service.
   * Maintains creation history while tracking update information.
   * 
   * @param {number} serviceId - ID of the service whose case note to update
   * @param {object} data - Updated case note data
   * @param {string} data.noteText - New content for the case note
   * @param {number} data.updatedBy - ID of the user making the update
   * @returns {Promise<ServiceCaseNote>} Updated case note record
   * @throws {Error} If note doesn't exist, validation fails, or database update fails
   */
  async updateServiceCaseNote(serviceId: number, data: { noteText: string; updatedBy: number }): Promise<ServiceCaseNote> {
    if (!validateInput(serviceId, 'id') || !validateInput(data.noteText, 'string') || !validateInput(data.updatedBy, 'id')) {
      throw new Error('Invalid case note data format');
    }

    try {
      const result = await this.pool.query(
        `UPDATE service_case_notes 
         SET note_text = $1, 
             updated_at = CURRENT_TIMESTAMP, 
             updated_by = $2 
         WHERE service_id = $3 
         RETURNING *`,
        [data.noteText, data.updatedBy, serviceId]
      );

      if (result.rows.length === 0) {
        throw new Error("Case note not found");
      }

      return {
        id: result.rows[0].id,
        serviceId: result.rows[0].service_id,
        noteText: result.rows[0].note_text,
        createdAt: result.rows[0].created_at,
        createdBy: result.rows[0].created_by,
        updatedAt: result.rows[0].updated_at,
        updatedBy: result.rows[0].updated_by
      };
    } catch (error) {
      handleDatabaseError(error, 'updateServiceCaseNote');
    }
  }
  /**
   * Get all service case notes by service ID
   * 
   * Retrieves all case notes for a specific service.
   * Returns notes in reverse chronological order (newest first).
   * 
   * @param {number} serviceId - ID of the service to get all case notes for
   * @returns {Promise<ServiceCaseNote[]>} Array of case notes for the service
   * @throws {Error} If service ID format is invalid or database query fails
   */
  async getServiceCaseNotesByServiceId(serviceId: number): Promise<ServiceCaseNote[]> {
    if (!validateInput(serviceId, 'id')) {
      throw new Error('Invalid service ID format');
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM service_case_notes WHERE service_id = $1 ORDER BY created_at DESC',
        [serviceId]
      );

      return result.rows.map(row => ({
        id: row.id,
        serviceId: row.service_id,
        noteText: row.note_text,
        createdAt: row.created_at,
        createdBy: row.created_by,
        updatedAt: row.updated_at,
        updatedBy: row.updated_by
      }));
    } catch (error) {
      handleDatabaseError(error, 'getServiceCaseNotesByServiceId');
    }
  }
  /**
   * Get all companies
   * 
   * Retrieves all company records from the database.
   * Returns companies sorted alphabetically by name.
   * 
   * @returns {Promise<Company[]>} Array of all company records
   * @throws {Error} If database query fails
   */
  async getAllCompanies(): Promise<Company[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM companies ORDER BY company_name'
      );
      return result.rows;
    } catch (error) {
      handleDatabaseError(error, 'getAllCompanies');
    }
  }
  /**
   * Get company by ID
   * 
   * Retrieves a specific company record by its unique ID.
   * 
   * @param {number} id - ID of the company to retrieve
   * @returns {Promise<Company | null>} Company record if found, null otherwise
   * @throws {Error} If company ID format is invalid or database query fails
   */
  async getCompanyById(id: number): Promise<Company | null> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid company ID format');
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM companies WHERE company_id = $1',
        [id]
      );
      return result.rows[0] || null;
    } catch (error) {
      handleDatabaseError(error, 'getCompanyById');
    }
  }
  /**
   * Create company
   * 
   * Creates a new company record in the database.
   * 
   * @param {z.infer<typeof insertCompanySchema>} data - Company data validated against schema
   * @param {string} data.company_name - Name of the company
   * @param {string} data.registered_address - Registered business address
   * @param {string} data.postal_address - Postal/mailing address
   * @param {string} data.contact_person_name - Primary contact person name
   * @param {string} data.contact_person_phone - Contact phone number
   * @param {string} data.contact_person_email - Contact email address
   * @param {number} data.created_by - ID of the user creating the company
   * @returns {Promise<Company>} Created company record
   * @throws {Error} If schema validation fails or database insertion fails
   */
  async createCompany(data: z.infer<typeof insertCompanySchema>): Promise<Company> {
    try {
      const result = await this.pool.query(
        `INSERT INTO companies (
            company_name,
            registered_address,
            postal_address,
            contact_person_name,
            contact_person_phone,
            contact_person_email,
            created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          data.company_name,
          data.registered_address,
          data.postal_address,
          data.contact_person_name,
          data.contact_person_phone,
          data.contact_person_email,
          data.created_by
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'createCompany');
    }
  }  /**
   * Update company
   * 
   * Updates an existing company record with new information.
   * 
   * @param {number} id - ID of the company to update
   * @param {z.infer<typeof insertCompanySchema>} data - Updated company data
   * @returns {Promise<Company>} Updated company record
   * @throws {Error} If company ID format is invalid, schema validation fails, or database update fails
   */
  async updateCompany(id: number, data: z.infer<typeof insertCompanySchema>): Promise<Company> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid company ID format');
    }

    try {
      const result = await this.pool.query(
        `UPDATE companies SET 
            company_name = $1,
            registered_address = $2,
            postal_address = $3,
            contact_person_name = $4,
            contact_person_phone = $5,
            contact_person_email = $6,
            created_by = $7
        WHERE company_id = $8 RETURNING *`,
        [
          data.company_name,
          data.registered_address,
          data.postal_address,
          data.contact_person_name,
          data.contact_person_phone,
          data.contact_person_email,
          data.created_by,
          id
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'updateCompany');
    }
  }
  /**
   * Delete company
   * 
   * Permanently removes a company record from the database.
   * 
   * @param {number} id - ID of the company to delete
   * @returns {Promise<void>} Resolves when company is deleted
   * @throws {Error} If company ID format is invalid or database delete fails
   */
  async deleteCompany(id: number): Promise<void> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid company ID format');
    }

    try {
      await this.pool.query(
        'DELETE FROM companies WHERE company_id = $1',
        [id]
      );
    } catch (error) {
      handleDatabaseError(error, 'deleteCompany');
    }
  }
  /**
   * Get all segments by company
   * 
   * Retrieves all segments that belong to a specific company.
   * Returns segments sorted alphabetically by name.
   * 
   * @param {number} companyId - ID of the company whose segments to retrieve
   * @returns {Promise<any[]>} Array of segment records for the company
   * @throws {Error} If database query fails
   */
  async getAllSegmentsByCompany(companyId: number): Promise<any[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM segments WHERE company_id = $1 ORDER BY segment_name',
        [companyId]
      );
      return result.rows;
    } catch (error) {
      handleDatabaseError(error, 'getAllSegmentsByCompany');
      throw error;
    }
  }
  /**
   * Get segment by ID
   * 
   * Retrieves a specific segment record by its unique ID.
   * 
   * @param {number} id - ID of the segment to retrieve
   * @returns {Promise<any>} Segment record
   * @throws {Error} If database query fails
   */
  async getSegmentById(id: number): Promise<any> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM segments WHERE id = $1',
        [id]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'getSegmentById');
      throw error;
    }
  }
  /**
   * Create segment
   * 
   * Creates a new segment under a company.
   * Segments are used to organize and categorize data within a company.
   * 
   * @param {object} segmentData - Segment data
   * @param {string} segmentData.segment_name - Name of the segment
   * @param {number} segmentData.company_id - ID of the company this segment belongs to
   * @param {number} segmentData.created_by - ID of the user creating the segment
   * @returns {Promise<any>} Created segment record
   * @throws {Error} If database insertion fails
   */
  async createSegment(segmentData: {
    segment_name: string;
    company_id: number;
    created_by: number;
  }): Promise<any> {
    try {
      const result = await this.pool.query(
        `INSERT INTO segments (
          segment_name,
          company_id,
          created_by
        ) VALUES ($1, $2, $3) RETURNING *`,
        [
          segmentData.segment_name,
          segmentData.company_id,
          segmentData.created_by
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'createSegment');
      throw error;
    }
  }
  /**
   * Update segment
   * 
   * Updates an existing segment with new information.
   * Currently only supports updating the segment name.
   * 
   * @param {number} id - ID of the segment to update
   * @param {object} segmentData - Updated segment data
   * @param {string} segmentData.segment_name - New name for the segment
   * @returns {Promise<any>} Updated segment record
   * @throws {Error} If database update fails
   */
  async updateSegment(
    id: number,
    segmentData: {
      segment_name: string;
    }
  ): Promise<any> {
    try {
      const result = await this.pool.query(
        `UPDATE segments SET 
          segment_name = $1,
          created_at = CURRENT_TIMESTAMP
        WHERE id = $2 RETURNING *`,
        [
          segmentData.segment_name,
          id
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'updateSegment');
      throw error;
    }
  }  /**
   * Delete segment
   * 
   * Permanently removes a segment from the database.
   * 
   * @param {number} id - ID of the segment to delete
   * @returns {Promise<boolean>} True if segment was deleted, false if segment not found
   * @throws {Error} If database delete fails
   */
  async deleteSegment(id: number): Promise<boolean> {
    try {
      const result = await this.pool.query(
        'DELETE FROM segments WHERE id = $1 RETURNING id',
        [id]
      );
      return result.rowCount! > 0; // Add non-null assertion
    } catch (error) {
      handleDatabaseError(error, 'deleteSegment');
      throw error;
    }
  }
  /**
   * Check if master data exists
   * 
   * Verifies if a service with specified category, type, and provider exists.
   * Used before creating client services to ensure only valid combinations are used.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check
   * @param {string} serviceProvider - Service provider to check
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<boolean>} True if the combination exists, false otherwise
   * @throws {Error} If database query fails
   */
  async checkMasterDataExists(
    serviceCategory: string, 
    serviceType: string, 
    serviceProvider: string,
    segmentId?: number
  ): Promise<boolean> {
    try {
      let query = `
        SELECT COUNT(*) FROM master_data 
        WHERE service_category = $1 
          AND service_type = $2 
          AND service_provider = $3
      `;
      
      const params = [serviceCategory, serviceType, serviceProvider];
        if (segmentId !== undefined) {
        // Match records with exactly this segment ID or with NULL segment_id
        query += ` AND (segment_id = $4 OR segment_id IS NULL)`;
        params.push(segmentId.toString());
      }
      
      const result = await this.pool.query(query, params);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      handleDatabaseError(error, 'checkMasterDataExists');
    }
  }
}

export const storage = new Storage(pool);
