import { Pool, PoolConfig } from 'pg';
import { parse } from 'pg-connection-string';
import { User, PersonInfo, MasterData, Document, ClientService, ServiceCaseNote, Company, insertCompanySchema, Segment, NewCompany, NewSegment, NewClientService } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import type { z } from 'zod';
import { DefaultAzureCredential } from '@azure/identity';

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

// Check for Azure Managed Identity configuration
const azurePostgreSQLServerName = process.env.AZURE_POSTGRESQL_SERVER_NAME;
const azurePostgreSQLDatabaseName = process.env.AZURE_POSTGRESQL_DATABASE_NAME;
const azurePostgreSQLUserName = process.env.AZURE_POSTGRESQL_USER_NAME;

console.log('Storage.ts - Azure PostgreSQL config:', {
  serverName: azurePostgreSQLServerName ? 'configured' : 'not configured',
  databaseName: azurePostgreSQLDatabaseName ? 'configured' : 'not configured',
  userName: azurePostgreSQLUserName ? 'configured' : 'not configured'
});

console.log('Storage.ts - DATABASE_URL configured:', process.env.DATABASE_URL ? 'Yes' : 'No');

// Azure managed identity connection pool and token management
let connectionPool: Pool;
let azureCredential: DefaultAzureCredential | null = null;
let accessToken: string | null = null;
let tokenExpiryTime: Date | null = null;

/**
 * Get Azure AD access token for PostgreSQL
 * Handles token acquisition and refresh automatically
 */
async function getAzureAccessToken(): Promise<string> {
  if (!azureCredential) {
    azureCredential = new DefaultAzureCredential();
  }

  // Check if we have a valid token that won't expire in the next 5 minutes
  if (accessToken && tokenExpiryTime && tokenExpiryTime > new Date(Date.now() + 5 * 60 * 1000)) {
    return accessToken;
  }

  try {
    console.log('Acquiring Azure AD access token for PostgreSQL...');
    const tokenResponse = await azureCredential.getToken('https://ossrdbms-aad.database.windows.net/.default');
    
    if (!tokenResponse) {
      throw new Error('Failed to acquire access token');
    }

    accessToken = tokenResponse.token;
    tokenExpiryTime = tokenResponse.expiresOnTimestamp ? new Date(tokenResponse.expiresOnTimestamp) : new Date(Date.now() + 60 * 60 * 1000); // Default 1 hour
    
    console.log('Azure AD access token acquired successfully, expires at:', tokenExpiryTime.toISOString());
    return accessToken;
  } catch (error) {
    console.error('Failed to acquire Azure AD access token:', error);
    throw error;
  }
}

/**
 * Create database connection configuration
 * Supports both Azure Managed Identity and traditional connection strings
 */
async function createConnectionConfig(): Promise<PoolConfig> {
  // Try Azure Managed Identity first if configured
  if (azurePostgreSQLServerName && azurePostgreSQLDatabaseName && azurePostgreSQLUserName) {
    try {
      console.log('Using Azure Managed Identity for PostgreSQL authentication');
      
      const token = await getAzureAccessToken();
      
      const config: PoolConfig = {
        user: azurePostgreSQLUserName,
        host: `${azurePostgreSQLServerName}.postgres.database.azure.com`,
        database: azurePostgreSQLDatabaseName,
        password: token,
        port: 5432,        ssl: {
          rejectUnauthorized: false,
          ca: undefined,
          checkServerIdentity: () => undefined
        },// Connection pool settings for Azure
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased for Azure connectivity
        query_timeout: 10000,
        statement_timeout: 10000,
      };
      
      console.log('Azure Managed Identity connection config created:', {
        user: config.user,
        host: config.host,
        database: config.database,
        port: config.port,
        ssl: 'enabled'
      });
      
      return config;
    } catch (error) {
      console.log('Azure Managed Identity failed, falling back to DATABASE_URL:', error instanceof Error ? error.message : String(error));
      // Fall through to DATABASE_URL fallback
    }
  }

  // Fallback to traditional DATABASE_URL
  if (!process.env.DATABASE_URL) {
    throw new Error('Either Azure Managed Identity configuration (AZURE_POSTGRESQL_SERVER_NAME, AZURE_POSTGRESQL_DATABASE_NAME, AZURE_POSTGRESQL_USER_NAME) or DATABASE_URL must be provided');
  }

  console.log('Using traditional DATABASE_URL authentication');
  
  try {
    const parsed = parse(process.env.DATABASE_URL);
    
    // Check if we're connecting to Azure PostgreSQL
    const isAzurePostgreSQL = parsed.host?.includes('postgres.database.azure.com');
    
    const config: PoolConfig = {
      user: parsed.user,
      host: parsed.host || '',
      database: parsed.database || '',
      password: parsed.password,
      port: parsed.port ? parseInt(parsed.port) : 5432,
      // Add SSL configuration for Azure PostgreSQL
      ssl: isAzurePostgreSQL ? {
        rejectUnauthorized: false,
        ca: undefined,
        checkServerIdentity: () => undefined
      } : false,
    };
    
    console.log('Traditional connection config created:', {
      user: config.user || '',
      host: config.host,
      database: config.database,
      port: config.port,
      ssl: config.ssl ? 'enabled' : 'disabled'
    });
    
    if (!config.host) {
      throw new Error('Invalid hostname in DATABASE_URL. Please verify the configuration.');
    }
    
    return config;
  } catch (error) {
    console.error('Error parsing DATABASE_URL:', error);
    throw new Error('Invalid DATABASE_URL format. Please check your environment configuration.');
  }
}

/**
 * Initialize database connection pool with managed identity support
 */
async function initializeConnectionPool(): Promise<Pool> {
  const connectionConfig = await createConnectionConfig();
  const pool = new Pool(connectionConfig);
  
  // Add error handling for the pool
  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
    // If it's an authentication error and we're using managed identity, try to refresh the token
    if (azurePostgreSQLServerName && azureCredential && err.message.includes('authentication')) {
      console.log('Authentication error detected, will refresh token on next connection');
      // Reset token to force refresh
      accessToken = null;
      tokenExpiryTime = null;
    }
  });

  pool.on('connect', () => {
    console.log('Connected to database successfully');
  });

  // For Azure Managed Identity, set up token refresh mechanism
  if (azurePostgreSQLServerName && azureCredential) {
    // Refresh token every 45 minutes (tokens expire after 1 hour)
    setInterval(async () => {
      try {
        console.log('Refreshing Azure AD access token...');
        await getAzureAccessToken();
        
        // For production, you might want to implement connection pool refresh
        // when tokens are refreshed to ensure all connections use the new token
        console.log('Azure AD access token refreshed successfully');
      } catch (error) {
        console.error('Failed to refresh Azure AD access token:', error);
        // Reset token variables to force re-authentication on next request
        accessToken = null;
        tokenExpiryTime = null;
      }
    }, 45 * 60 * 1000); // 45 minutes
  }

  return pool;
}

// Initialize connection pool lazily
let connectionPoolPromise: Promise<Pool> | null = null;

async function getConnectionPool(): Promise<Pool> {
  if (!connectionPoolPromise) {
    connectionPoolPromise = initializeConnectionPool();
  }
  return connectionPoolPromise;
}

// Initialize the connection pool and test it with retry logic
async function initializeAndTestConnection() {
  const maxRetries = 5;
  const retryDelay = 2000; // Start with 2 seconds
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`Database connection attempt ${attempt}/${maxRetries}...`);
      connectionPool = await getConnectionPool();
      const client = await connectionPool.connect();
      console.log('Database connection test successful');
      
      // Log which authentication method is being used
      if (azurePostgreSQLServerName && azureCredential) {
        console.log('✅ Successfully connected to PostgreSQL using Azure Managed Identity');
      } else {
        console.log('✅ Successfully connected to PostgreSQL using traditional authentication');
      }
      
      client.release();
      return; // Success, exit retry loop
    } catch (err) {
      console.error(`Database connection attempt ${attempt}/${maxRetries} failed:`, err);
      
      if (attempt === maxRetries) {
        console.error('❌ All database connection attempts failed. Application may not function properly.');
        if (err instanceof Error) {
          console.error('Final error details:', err.message);
          console.error('Stack trace:', err.stack);
        }
        // Don't throw error - let app start and retry later
        return;
      }
      
      // Exponential backoff: wait longer between retries
      const delayMs = retryDelay * Math.pow(2, attempt - 1);
      console.log(`Retrying in ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      
      // Reset connection pool to force fresh connection
      connectionPoolPromise = null;
    }
  }
}

// Initialize connection pool in background
initializeAndTestConnection().catch(console.error);

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
    const poolInstance = await getConnectionPool();
    client = await poolInstance.connect();
    
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
  documentIds?: number[]; // Optional array of document IDs to attach
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
   */  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    if (!validateInput(id, 'id') || !validateInput(newPassword, 'string')) {
      throw new Error('Invalid ID or password format');
    }

    try {
      const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
      await this.pool.query(
        'UPDATE users SET password = $1, password_changed_at = NOW(), force_password_change = FALSE WHERE id = $2',
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
    }  }
  /**
   * Update user force password change flag
   * 
   * Sets whether a user should be forced to change their password on next login.
   * Used during initial admin setup or when password policies require password changes.
   * 
   * @param {string} username - Username of the user to update
   * @param {boolean} forceChange - Whether to force password change on next login
   * @returns {Promise<void>} Resolves when force password change flag is updated
   * @throws {Error} If username format is invalid or database update fails
   */
  async updateUserForcePasswordChange(username: string, forceChange: boolean): Promise<void> {
    if (!validateInput(username, 'string')) {
      throw new Error('Invalid username format');
    }

    try {
      await this.pool.query(
        'UPDATE users SET force_password_change = $1 WHERE username = $2',
        [forceChange, username]
      );
    } catch (error) {
      handleDatabaseError(error, 'updateUserForcePasswordChange');
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
        }        const result = await client.query(
          'INSERT INTO users (name, username, password, role, company_id, created_at, password_changed_at, force_password_change) VALUES ($1, $2, $3, $4, $5, NOW(), NOW(), $6) RETURNING id, name, username, role, company_id, created_at, password_changed_at, force_password_change',
          [user.name, user.username, user.password, user.role || 'user', user.company_id, false]
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
   */  async createPersonInfo(data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
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
        nextOfKinRelationship,
        nextOfKinAddress,
        nextOfKinEmail,
        nextOfKinPhone,
        hcpLevel,
        hcpStartDate,
        status,
        createdBy,
        segmentId
      } = data;

      const result = await this.pool.query(        `INSERT INTO person_info (
          title, first_name, middle_name, last_name, date_of_birth, email,
          home_phone, mobile_phone, address_line1, address_line2, address_line3,
          post_code, mailing_address_line1, mailing_address_line2, mailing_address_line3,
          mailing_post_code, use_home_address, next_of_kin_name, next_of_kin_relationship, next_of_kin_address,
          next_of_kin_email, next_of_kin_phone, hcp_level, hcp_start_date, status, created_by, segment_id
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27)
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
          mailingAddressLine3,          mailingPostCode,
          useHomeAddress,
          nextOfKinName,
          nextOfKinRelationship,
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
      
      const result = await this.pool.query(query, params);      return result.rows.map(row => ({
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
        nextOfKinRelationship: row.next_of_kin_relationship || null,
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
   */  async getPersonInfoById(id: number): Promise<PersonInfo | null> {
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
        nextOfKinRelationship: row.next_of_kin_relationship || null,
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
        mailingPostCode,        useHomeAddress,
        nextOfKinName,
        nextOfKinRelationship,
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
          next_of_kin_name = $18, next_of_kin_relationship = $19, next_of_kin_address = $20, next_of_kin_email = $21,
          next_of_kin_phone = $22, hcp_level = $23, hcp_start_date = $24, status = $25,
          segment_id = $26
        WHERE id = $27
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
          mailingPostCode || '',          useHomeAddress,
          nextOfKinName || '',
          nextOfKinRelationship || '',
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
        mailingPostCode: row.mailing_post_code,        useHomeAddress: row.use_home_address,
        nextOfKinName: row.next_of_kin_name,
        nextOfKinRelationship: row.next_of_kin_relationship,
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
   * Get master data by ID
   * 
   * Retrieves a specific master data record by its unique ID.
   * Used for fetching individual service definitions and audit logging.
   * 
   * @param {number} id - ID of the master data record to retrieve
   * @returns {Promise<MasterData | null>} Master data record if found, null otherwise
   * @throws {Error} If ID format is invalid or database query fails
   */
  async getMasterDataById(id: number): Promise<MasterData | null> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid ID format');
    }

    try {
      const result = await this.pool.query('SELECT * FROM master_data WHERE id = $1', [id]);
      if (!result.rows[0]) return null;
      
      const row = result.rows[0];
      return {
        id: row.id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        active: row.active,
        createdBy: row.created_by,
        createdAt: row.created_at,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'getMasterDataById');
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
    }    try {
      await this.pool.query('UPDATE master_data SET status = $1 WHERE id = $2', [status, id]);
    } catch (error) {
      handleDatabaseError(error, 'updateMasterDataStatus');
    }
  }

  /**
   * Check if master data exists
   * 
   * Verifies if a specific combination of service category, type, and provider exists
   * in the master data table. Used to validate service assignments before creating
   * client service records.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check
   * @param {string} serviceProvider - Service provider to check
   * @param {number} [segmentId] - Optional segment ID to filter by
   * @returns {Promise<boolean>} True if the combination exists, false otherwise
   * @throws {Error} If input validation fails or database query fails
   */
  async checkMasterDataExists(
    serviceCategory: string, 
    serviceType: string, 
    serviceProvider: string,
    segmentId?: number
  ): Promise<boolean> {
    if (!validateInput(serviceCategory, 'string') || 
        !validateInput(serviceType, 'string') || 
        !validateInput(serviceProvider, 'string')) {
      throw new Error('Invalid service data format');
    }

    try {      let queryText = `
        SELECT COUNT(*) 
        FROM master_data 
        WHERE service_category = $1 
        AND service_type = $2 
        AND service_provider = $3
        AND active = true
      `;
      const params: any[] = [serviceCategory, serviceType, serviceProvider || ''];
      
      if (segmentId !== undefined) {
        queryText += ' AND (segment_id = $4 OR segment_id IS NULL)';
        params.push(segmentId);
      }
      
      const result = await this.pool.query(queryText, params);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      handleDatabaseError(error, 'checkMasterDataExists');
      throw error;
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
   * Get document by client ID and filename
   * 
   * Retrieves a document record by its client ID and filename.
   * Used to check if a file with the same name already exists for a specific client.
   * 
   * @param {number} clientId - ID of the client to search documents for
   * @param {string} filename - Name of the file to search for
   * @returns {Promise<Document | null>} Document record if found, null otherwise
   * @throws {Error} If input format is invalid or database query fails
   */
  async getDocumentByClientAndFilename(clientId: number, filename: string): Promise<Document | null> {
    if (!validateInput(clientId, 'id') || !validateInput(filename, 'string')) {
      throw new Error('Invalid client ID or filename format');
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM documents WHERE client_id = $1 AND filename = $2 LIMIT 1',
        [clientId, filename]
      );
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
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'getDocumentByClientAndFilename');
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
   * Get client services that reference specific master data
   * 
   * Retrieves all client services that use a specific combination of service category,
   * type, provider, and segment. Used to provide feedback when master data updates fail
   * due to foreign key constraints.
   * 
   * @param {string} serviceCategory - Service category to check
   * @param {string} serviceType - Service type to check  
   * @param {string} serviceProvider - Service provider to check
   * @param {number | null} segmentId - Segment ID to check (null for global services)
   * @returns {Promise<any[]>} Array of client services that reference this master data
   * @throws {Error} If database query fails
   */
  async getClientServicesReferencingMasterData(
    serviceCategory: string,
    serviceType: string,
    serviceProvider: string,
    segmentId: number | null
  ): Promise<any[]> {
    if (!validateInput(serviceCategory, 'string') || !validateInput(serviceType, 'string') || !validateInput(serviceProvider, 'string')) {
      throw new Error('Invalid input parameters');
    }

    try {
      const query = `
        SELECT cs.id, cs.client_id, p.first_name, p.last_name, cs.service_start_date, cs.status
        FROM client_services cs
        JOIN person_info p ON cs.client_id = p.id
        WHERE cs.service_category = $1 
          AND cs.service_type = $2 
          AND cs.service_provider = $3
          AND (cs.segment_id = $4 OR (cs.segment_id IS NULL AND $4 IS NULL))
        ORDER BY p.first_name, p.last_name
      `;
      
      const result = await this.pool.query(query, [serviceCategory, serviceType, serviceProvider, segmentId]);
      
      return result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        clientName: `${row.first_name} ${row.last_name}`,
        serviceStartDate: row.service_start_date,
        status: row.status
      }));
    } catch (error) {
      handleDatabaseError(error, 'getClientServicesReferencingMasterData');
      throw error;
    }
  }

  /**
   * AUDIT LOGGING METHODS
   * 
   * Methods for tracking user activities, errors, and system events
   * for compliance, debugging, and monitoring purposes.
   */

  /**
   * Log user activity for audit trail
   */  async logUserActivity(logData: {
    userId?: number;
    username?: string;
    action: string;
    resourceType?: string;
    resourceId?: string;
    details?: any;
    ipAddress?: string;
    userAgent?: string;
    timestamp?: Date;
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO audit_logs (
          user_id,
          username,
          action,
          resource_type,
          resource_id,
          ip_address,
          user_agent,
          created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        logData.userId || null,
        logData.username || null,
        logData.action,
        logData.resourceType || null,
        logData.resourceId || null,
        logData.ipAddress || null,
        logData.userAgent || null,
        logData.timestamp || new Date(),
        logData.details ? JSON.stringify(this.filterSensitiveData(logData.details)) : '{}'
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error('Failed to log user activity:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }
  /**
   * Log system errors for debugging and monitoring
   */
  async logError(errorData: {
    errorType: string;
    errorCode?: string;
    errorMessage: string;
    stackTrace?: string;
    userId?: number;
    username?: string;
    method?: string;
    endpoint?: string;
    ipAddress?: string;
    userAgent?: string;
    companyId?: number;
    segmentId?: number;
    requestData?: any;
    requestHeaders?: any;
    sessionId?: string;
    severity?: string;
    resolved?: boolean;
    resolvedAt?: Date;
    resolvedBy?: number;
    metadata?: any;
    timestamp?: Date;
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO error_logs (
          user_id,
          username,
          error_type,
          error_code,
          error_message,
          stack_trace,
          method,
          endpoint,
          ip_address,
          user_agent,
          company_id,
          segment_id,
          request_data,
          request_headers,
          session_id,
          severity,
          resolved,
          resolved_at,
          resolved_by,
          created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      `;

      const values = [
        errorData.userId || null,
        errorData.username || null,
        errorData.errorType,
        errorData.errorCode || null,
        errorData.errorMessage,
        errorData.stackTrace || null,
        errorData.method || null,
        errorData.endpoint || null,
        errorData.ipAddress || null,
        errorData.userAgent || null,
        errorData.companyId || null,
        errorData.segmentId || null,
        errorData.requestData ? JSON.stringify(this.filterSensitiveData(errorData.requestData)) : null,
        errorData.requestHeaders ? JSON.stringify(this.filterSensitiveHeaders(errorData.requestHeaders)) : null,
        errorData.sessionId || null,
        errorData.severity || 'ERROR',
        errorData.resolved || false,
        errorData.resolvedAt || null,
        errorData.resolvedBy || null,
        errorData.timestamp || new Date(),
        errorData.metadata ? JSON.stringify(this.filterSensitiveData(errorData.metadata)) : null
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error('Failed to log error:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }
  /**
   * Log login attempts and authentication events
   */
  async logLogin(loginData: {
    username?: string;
    userId?: number;
    loginType: 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | 'TOKEN_REFRESH';
    failureReason?: string;
    ipAddress?: string;
    userAgent?: string;
    sessionId?: string;
    companyId?: number;
    timestamp?: Date;
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO login_logs (
          username,
          user_id,
          login_type,
          failure_reason,
          ip_address,
          user_agent,
          session_id,
          company_id,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `;

      const values = [
        loginData.username || null,
        loginData.userId || null,
        loginData.loginType,
        loginData.failureReason || null,
        loginData.ipAddress || null,
        loginData.userAgent || null,
        loginData.sessionId || null,
        loginData.companyId || null,
        loginData.timestamp || new Date()
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error('Failed to log login attempt:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }
  /**
   * Log performance metrics
   */
  async logPerformance(perfData: {
    endpoint: string;
    method: string;
    userId?: number;
    companyId?: number;
    responseTimeMs: number;
    responseStatus: number;
    memoryUsageMb?: number;
    cpuUsagePercent?: number;
    databaseQueryCount?: number;
    databaseTimeMs?: number;
    cacheHits?: number;
    cacheMisses?: number;
    requestSizeBytes?: number;
    responseSizeBytes?: number;
    metadata?: any;
    timestamp?: Date;
  }): Promise<void> {
    try {
      const query = `
        INSERT INTO performance_logs (
          endpoint,
          method,
          user_id,
          company_id,
          response_time_ms,
          response_status,
          memory_usage_mb,
          cpu_usage_percent,
          database_query_count,
          database_time_ms,
          cache_hits,
          cache_misses,
          request_size_bytes,
          response_size_bytes,
          created_at,
          metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      `;

      const values = [
        perfData.endpoint,
        perfData.method,
        perfData.userId || null,
        perfData.companyId || null,
        perfData.responseTimeMs,
        perfData.responseStatus,
        perfData.memoryUsageMb || null,
        perfData.cpuUsagePercent || null,
        perfData.databaseQueryCount || null,
        perfData.databaseTimeMs || null,
        perfData.cacheHits || null,
        perfData.cacheMisses || null,
        perfData.requestSizeBytes || null,
        perfData.responseSizeBytes || null,
        perfData.timestamp || new Date(),
        perfData.metadata ? JSON.stringify(this.filterSensitiveData(perfData.metadata)) : null
      ];

      await this.pool.query(query, values);
    } catch (error) {
      console.error('Failed to log performance data:', error);
      // Don't throw error to avoid breaking the main operation
    }
  }

  /**
   * Retrieve audit logs with filtering
   */
  async getAuditLogs(filters: {
    userId?: number;
    username?: string;
    action?: string;
    resourceType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}): Promise<any[]> {
    try {
      let query = 'SELECT * FROM audit_logs WHERE 1=1';
      const params: any[] = [];
      let paramIndex = 1;

      if (filters.userId) {
        query += ` AND user_id = $${paramIndex}`;
        params.push(filters.userId);
        paramIndex++;
      }

      if (filters.username) {
        query += ` AND username = $${paramIndex}`;
        params.push(filters.username);
        paramIndex++;
      }

      if (filters.action) {
        query += ` AND action = $${paramIndex}`;
        params.push(filters.action);
        paramIndex++;
      }

      if (filters.resourceType) {
        query += ` AND resource_type = $${paramIndex}`;
        params.push(filters.resourceType);
        paramIndex++;
      }

      if (filters.startDate) {
        query += ` AND timestamp >= $${paramIndex}`;
        params.push(filters.startDate);
        paramIndex++;
      }

      if (filters.endDate) {
        query += ` AND timestamp <= $${paramIndex}`;
        params.push(filters.endDate);
        paramIndex++;
      }

      query += ' ORDER BY timestamp DESC';

      if (filters.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(filters.limit);
        paramIndex++;
      }

      if (filters.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(filters.offset);
        paramIndex++;
      }

      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      handleDatabaseError(error, 'getAuditLogs');
      return [];
    }
  }

  /**
   * Filter sensitive data from logs
   */
  private filterSensitiveData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    const filtered = { ...data };
    const sensitiveFields = ['password', 'token', 'authorization', 'secret', 'key', 'ssn', 'creditCard'];
    
    for (const field of sensitiveFields) {
      if (filtered[field]) {
        filtered[field] = '[REDACTED]';
      }
    }
    
    return filtered;
  }

  /**
   * Filter sensitive headers from logs
   */
  private filterSensitiveHeaders(headers: any): any {
    if (!headers || typeof headers !== 'object') {
      return headers;
    }

    const filtered = { ...headers };
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    
    for (const header of sensitiveHeaders) {
      if (filtered[header]) {
        filtered[header] = '[REDACTED]';
      }
    }
    
    return filtered;
  }

  /**
   * Get all segments by company
   * 
   * Retrieves all segments belonging to a specific company.
   * Returns segments sorted alphabetically by name.
   * 
   * @param {number} companyId - ID of the company whose segments to retrieve
   * @returns {Promise<Segment[]>} Array of segment records for the company
   * @throws {Error} If database query fails
   */
  async getAllSegmentsByCompany(companyId: number): Promise<Segment[]> {
    if (!validateInput(companyId, 'id')) {
      throw new Error('Invalid company ID format');
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM segments WHERE company_id = $1 ORDER BY segment_name',
        [companyId]
      );
      
      return result.rows.map(row => ({
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      }));
    } catch (error) {
      handleDatabaseError(error, 'getAllSegmentsByCompany');
      throw error;
    }
  }

  /**
   * Get segment by ID
   * 
   * Retrieves a specific segment record by its unique ID.
   * Used for segment access validation and segment management.
   * 
   * @param {number} id - ID of the segment to retrieve
   * @returns {Promise<Segment | null>} Segment record if found, null otherwise
   * @throws {Error} If database query fails
   */
  async getSegmentById(id: number): Promise<Segment | null> {
    if (!validateInput(id, 'id')) {
      throw new Error('Invalid segment ID format');
    }

    try {
      const result = await this.pool.query(
        'SELECT * FROM segments WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by      };
    } catch (error) {
      handleDatabaseError(error, 'getSegmentById');
      throw error;
    }
  }

  /**
   * Creates a new case note for a service with optional document attachments.
   * Uses a transaction to ensure data consistency when linking documents.
   * 
   * @param {NewServiceCaseNote} caseNoteData - Case note data
   * @returns {Promise<ServiceCaseNote>} Created case note with linked documents
   * @throws {Error} If validation fails or database query fails
   */
  async createServiceCaseNote(caseNoteData: NewServiceCaseNote): Promise<ServiceCaseNote> {
    if (!validateInput(caseNoteData.serviceId, 'id') || 
        !validateInput(caseNoteData.noteText, 'string') || 
        !validateInput(caseNoteData.createdBy, 'id')) {
      throw new Error('Invalid case note data format');
    }

    try {
      return await this.withTransaction(async (client) => {
        // Create the case note
        const caseNoteResult = await client.query(
          `INSERT INTO service_case_notes (service_id, note_text, created_by, updated_by, created_at, updated_at) 
           VALUES ($1, $2, $3, $3, NOW(), NOW()) 
           RETURNING id, service_id, note_text, created_at, updated_at, created_by, updated_by`,
          [caseNoteData.serviceId, caseNoteData.noteText, caseNoteData.createdBy]
        );

        const caseNote = caseNoteResult.rows[0];
        const documents: Document[] = [];

        // Link documents if provided
        if (caseNoteData.documentIds && caseNoteData.documentIds.length > 0) {
          for (const documentId of caseNoteData.documentIds) {
            // Verify document exists and user has access
            const docCheck = await client.query(
              'SELECT id FROM documents WHERE id = $1',
              [documentId]
            );
            
            if (docCheck.rows.length === 0) {
              throw new Error(`Document with ID ${documentId} not found`);
            }

            // Link document to case note
            await client.query(
              `INSERT INTO case_note_documents (case_note_id, document_id, created_by) 
               VALUES ($1, $2, $3)`,
              [caseNote.id, documentId, caseNoteData.createdBy]
            );

            // Get document details for response
            const docResult = await client.query(
              `SELECT id, client_id, document_name, document_type, filename, file_path, uploaded_at, created_by, segment_id 
               FROM documents WHERE id = $1`,
              [documentId]
            );

            if (docResult.rows.length > 0) {
              const docRow = docResult.rows[0];
              documents.push({
                id: docRow.id,
                clientId: docRow.client_id,
                documentName: docRow.document_name,
                documentType: docRow.document_type,
                filename: docRow.filename,
                filePath: docRow.file_path,
                uploadedAt: docRow.uploaded_at,
                createdBy: docRow.created_by,
                segmentId: docRow.segment_id
              });
            }
          }
        }

        return {
          id: caseNote.id,
          serviceId: caseNote.service_id,
          noteText: caseNote.note_text,
          createdAt: caseNote.created_at,
          updatedAt: caseNote.updated_at,
          createdBy: caseNote.created_by,
          updatedBy: caseNote.updated_by,
          documents: documents.length > 0 ? documents : undefined
        };
      });
    } catch (error) {
      handleDatabaseError(error, 'createServiceCaseNote');
      throw error;
    }
  }

  /**
   * Get service case notes by service ID
   * 
   * Retrieves all case notes for a specific service, including linked documents.
   * Orders notes by creation date (newest first).
   * 
   * @param {number} serviceId - ID of the service
   * @returns {Promise<ServiceCaseNote[]>} Array of case notes with documents
   * @throws {Error} If validation fails or database query fails
   */
  async getServiceCaseNotesByServiceId(serviceId: number): Promise<ServiceCaseNote[]> {
    if (!validateInput(serviceId, 'id')) {
      throw new Error('Invalid service ID format');
    }

    try {
      // Get case notes
      const notesResult = await this.pool.query(
        `SELECT id, service_id, note_text, created_at, updated_at, created_by, updated_by 
         FROM service_case_notes 
         WHERE service_id = $1 
         ORDER BY created_at DESC`,
        [serviceId]
      );

      const notes: ServiceCaseNote[] = [];

      for (const noteRow of notesResult.rows) {
        // Get linked documents for each note
        const documentsResult = await this.pool.query(
          `SELECT d.id, d.client_id, d.document_name, d.document_type, d.filename, d.file_path, d.uploaded_at, d.created_by, d.segment_id
           FROM documents d
           INNER JOIN case_note_documents cnd ON d.id = cnd.document_id
           WHERE cnd.case_note_id = $1
           ORDER BY cnd.created_at ASC`,
          [noteRow.id]
        );

        const documents: Document[] = documentsResult.rows.map(docRow => ({
          id: docRow.id,
          clientId: docRow.client_id,
          documentName: docRow.document_name,
          documentType: docRow.document_type,
          filename: docRow.filename,
          filePath: docRow.file_path,
          uploadedAt: docRow.uploaded_at,
          createdBy: docRow.created_by,
          segmentId: docRow.segment_id
        }));

        notes.push({
          id: noteRow.id,
          serviceId: noteRow.service_id,
          noteText: noteRow.note_text,
          createdAt: noteRow.created_at,
          updatedAt: noteRow.updated_at,
          createdBy: noteRow.created_by,
          updatedBy: noteRow.updated_by,
          documents: documents.length > 0 ? documents : undefined
        });
      }

      return notes;
    } catch (error) {
      handleDatabaseError(error, 'getServiceCaseNotesByServiceId');
      throw error;
    }
  }  // COMPANY MANAGEMENT METHODS
  
  /**
   * Gets all companies from the database.
   * 
   * @returns {Promise<Company[]>} Array of all companies
   * @throws {Error} Database operation error
   */
  async getAllCompanies(): Promise<Company[]> {
    try {
      const result = await this.pool.query(
        `SELECT company_id, company_name, registered_address, postal_address, 
                contact_person_name, contact_person_phone, contact_person_email, 
                created_at, created_by 
         FROM companies ORDER BY company_name`
      );

      return result.rows.map(row => ({
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      }));
    } catch (error) {
      handleDatabaseError(error, 'getAllCompanies');
      throw error;
    }
  }

  /**
   * Creates a new company.
   * 
   * @param {NewCompany} companyData - Company data to create
   * @returns {Promise<Company>} Created company
   * @throws {Error} Database operation error
   */
  async createCompany(companyData: NewCompany): Promise<Company> {
    validateInput(companyData, 'Company data is required');

    try {
      const result = await this.pool.query(
        `INSERT INTO companies (company_name, registered_address, postal_address, 
                               contact_person_name, contact_person_phone, contact_person_email, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING company_id, company_name, registered_address, postal_address, 
                   contact_person_name, contact_person_phone, contact_person_email, 
                   created_at, created_by`,
        [
          companyData.company_name,
          companyData.registered_address,
          companyData.postal_address,
          companyData.contact_person_name,
          companyData.contact_person_phone,
          companyData.contact_person_email,
          companyData.created_by || null
        ]
      );

      const row = result.rows[0];
      return {
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'createCompany');
      throw error;
    }
  }

  /**
   * Gets a company by ID.
   * 
   * @param {number} companyId - Company ID
   * @returns {Promise<Company | null>} Company data or null if not found
   * @throws {Error} Database operation error
   */
  async getCompanyById(companyId: number): Promise<Company | null> {
    validateInput(companyId, 'Company ID is required');

    try {
      const result = await this.pool.query(
        `SELECT company_id, company_name, registered_address, postal_address, 
                contact_person_name, contact_person_phone, contact_person_email, 
                created_at, created_by 
         FROM companies WHERE company_id = $1`,
        [companyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'getCompanyById');
      throw error;
    }
  }

  /**
   * Updates a company.
   * 
   * @param {number} companyId - Company ID to update
   * @param {Partial<NewCompany>} updates - Company data to update
   * @returns {Promise<Company>} Updated company
   * @throws {Error} Database operation error
   */
  async updateCompany(companyId: number, updates: Partial<NewCompany>): Promise<Company> {
    validateInput(companyId, 'Company ID is required');
    validateInput(updates, 'Update data is required');

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.company_name !== undefined) {
      updateFields.push(`company_name = $${paramCount}`);
      values.push(updates.company_name);
      paramCount++;
    }
    if (updates.registered_address !== undefined) {
      updateFields.push(`registered_address = $${paramCount}`);
      values.push(updates.registered_address);
      paramCount++;
    }
    if (updates.postal_address !== undefined) {
      updateFields.push(`postal_address = $${paramCount}`);
      values.push(updates.postal_address);
      paramCount++;
    }
    if (updates.contact_person_name !== undefined) {
      updateFields.push(`contact_person_name = $${paramCount}`);
      values.push(updates.contact_person_name);
      paramCount++;
    }
    if (updates.contact_person_phone !== undefined) {
      updateFields.push(`contact_person_phone = $${paramCount}`);
      values.push(updates.contact_person_phone);
      paramCount++;
    }
    if (updates.contact_person_email !== undefined) {
      updateFields.push(`contact_person_email = $${paramCount}`);
      values.push(updates.contact_person_email);
      paramCount++;
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(companyId);

    try {
      const result = await this.pool.query(
        `UPDATE companies SET ${updateFields.join(', ')} WHERE company_id = $${paramCount}
         RETURNING company_id, company_name, registered_address, postal_address, 
                   contact_person_name, contact_person_phone, contact_person_email, 
                   created_at, created_by`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Company not found');
      }

      const row = result.rows[0];
      return {
        company_id: row.company_id,
        company_name: row.company_name,
        registered_address: row.registered_address,
        postal_address: row.postal_address,
        contact_person_name: row.contact_person_name,
        contact_person_phone: row.contact_person_phone,
        contact_person_email: row.contact_person_email,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'updateCompany');
      throw error;
    }
  }

  // SEGMENT MANAGEMENT METHODS

  /**
   * Creates a new segment.
   * 
   * @param {NewSegment} segmentData - Segment data to create
   * @returns {Promise<Segment>} Created segment
   * @throws {Error} Database operation error
   */
  async createSegment(segmentData: NewSegment): Promise<Segment> {
    validateInput(segmentData, 'Segment data is required');

    try {
      const result = await this.pool.query(
        `INSERT INTO segments (segment_name, company_id, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, segment_name, company_id, created_at, created_by`,
        [segmentData.segment_name, segmentData.company_id, segmentData.created_by || null]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'createSegment');
      throw error;
    }
  }

  /**
   * Updates a segment.
   * 
   * @param {number} segmentId - Segment ID to update
   * @param {Partial<NewSegment>} updates - Segment data to update
   * @returns {Promise<Segment>} Updated segment
   * @throws {Error} Database operation error
   */
  async updateSegment(segmentId: number, updates: Partial<NewSegment>): Promise<Segment> {
    validateInput(segmentId, 'Segment ID is required');
    validateInput(updates, 'Update data is required');

    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (updates.segment_name !== undefined) {
      updateFields.push(`segment_name = $${paramCount}`);
      values.push(updates.segment_name);
      paramCount++;
    }
    if (updates.company_id !== undefined) {
      updateFields.push(`company_id = $${paramCount}`);
      values.push(updates.company_id);
      paramCount++;
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(segmentId);

    try {
      const result = await this.pool.query(
        `UPDATE segments SET ${updateFields.join(', ')} WHERE id = $${paramCount}
         RETURNING id, segment_name, company_id, created_at, created_by`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Segment not found');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        segment_name: row.segment_name,
        company_id: row.company_id,
        created_at: row.created_at,
        created_by: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'updateSegment');
      throw error;
    }
  }

  // CLIENT SERVICE MANAGEMENT METHODS

  /**
   * Updates a client service status.
   * 
   * @param {number} clientServiceId - Client service ID to update
   * @param {string} status - New status
   * @returns {Promise<ClientService>} Updated client service
   * @throws {Error} Database operation error
   */
  async updateClientServiceStatus(clientServiceId: number, status: string): Promise<ClientService> {
    validateInput(clientServiceId, 'Client service ID is required');
    validateInput(status, 'Status is required');

    try {
      const result = await this.pool.query(
        `UPDATE client_services 
         SET status = $1 
         WHERE id = $2
         RETURNING id, client_id, service_category, service_type, service_provider, 
                   service_start_date, service_days, service_hours, status, 
                   created_at, created_by, segment_id`,
        [status, clientServiceId]
      );

      if (result.rows.length === 0) {
        throw new Error('Client service not found');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: Array.isArray(row.service_days) ? row.service_days : [],
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'updateClientServiceStatus');
      throw error;
    }
  }

  /**
   * Gets client services with optional filtering.
   * 
   * @param {number} [clientId] - Optional client ID to filter by
   * @param {number} [serviceId] - Optional service ID to filter by (unused in current schema)
   * @param {string} [status] - Optional status to filter by
   * @returns {Promise<ClientService[]>} Array of client services
   * @throws {Error} Database operation error
   */
  async getClientServices(clientId?: number, serviceId?: number, status?: string): Promise<ClientService[]> {
    const conditions: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (clientId !== undefined) {
      conditions.push(`client_id = $${paramCount}`);
      values.push(clientId);
      paramCount++;
    }
    if (status !== undefined) {
      conditions.push(`status = $${paramCount}`);
      values.push(status);
      paramCount++;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    try {
      const result = await this.pool.query(
        `SELECT id, client_id, service_category, service_type, service_provider, 
                service_start_date, service_days, service_hours, status, 
                created_at, created_by, segment_id
         FROM client_services ${whereClause} ORDER BY created_at DESC`,
        values
      );

      return result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        serviceStartDate: row.service_start_date,
        serviceDays: Array.isArray(row.service_days) ? row.service_days : [],
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,
        segmentId: row.segment_id
      }));
    } catch (error) {
      handleDatabaseError(error, 'getClientServices');
      throw error;
    }
  }

  /**
   * Creates a new client service.
   * 
   * @param {NewClientService} clientServiceData - Client service data to create
   * @returns {Promise<ClientService>} Created client service
   * @throws {Error} Database operation error
   */
  async createClientService(clientServiceData: NewClientService): Promise<ClientService> {
    validateInput(clientServiceData, 'Client service data is required');

    try {
      const result = await this.pool.query(
        `INSERT INTO client_services (client_id, service_category, service_type, service_provider, 
                                     service_start_date, service_days, service_hours, status, 
                                     created_by, segment_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, client_id, service_category, service_type, service_provider, 
                   service_start_date, service_days, service_hours, status, 
                   created_at, created_by, segment_id`,
        [
          clientServiceData.clientId,
          clientServiceData.serviceCategory,
          clientServiceData.serviceType,
          clientServiceData.serviceProvider,
          clientServiceData.serviceStartDate,
          clientServiceData.serviceDays,
          clientServiceData.serviceHours,
          clientServiceData.status || 'active',
          clientServiceData.createdBy || null,
          clientServiceData.segmentId || null
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
        serviceDays: Array.isArray(row.service_days) ? row.service_days : [],
        serviceHours: row.service_hours,
        status: row.status,
        createdAt: row.created_at,
        createdBy: row.created_by,      segmentId: row.segment_id
      };
    } catch (error) {
      handleDatabaseError(error, 'createClientService');
      throw error;
    }
  }

  /**
   * Gets the count of case notes for a specific service
   * 
   * @param {number} serviceId - The ID of the service to count notes for
   * @returns {Promise<number>} Number of case notes for the service
   * @throws {Error} If serviceId is invalid or database error occurs
   */
  async getServiceCaseNotesCount(serviceId: number): Promise<number> {
    if (!validateInput(serviceId, 'id')) {
      throw new Error('Invalid service ID format');
    }

    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count 
         FROM service_case_notes 
         WHERE service_id = $1`,
        [serviceId]
      );

      return parseInt(result.rows[0].count) || 0;
    } catch (error) {
      console.error(`Error getting case notes count for service ${serviceId}:`, error);
      throw handleDatabaseError(error, `Failed to get case notes count for service ${serviceId}`);
    }
  }
}

// Storage instance management
let storageInstance: Storage | null = null;

/**
 * Get the singleton Storage instance
 * Lazily initializes the storage instance with the connection pool
 */
export async function getStorage(): Promise<Storage> {
  if (!storageInstance) {
    const pool = await getConnectionPool();
    storageInstance = new Storage(pool);
  }
  return storageInstance;
}

// Export a function to get the connection pool
export async function getPool(): Promise<Pool> {
  return getConnectionPool();
}

// Export a query function for backward compatibility
export async function query(text: string, params?: any[]): Promise<any> {
  const pool = await getConnectionPool();
  return pool.query(text, params);
}