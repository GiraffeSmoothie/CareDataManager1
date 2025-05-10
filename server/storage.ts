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

// Initialize database and run migrations
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


// Input validation helper
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

// SQL injection prevention helper
function sanitizeInput(input: string): string {
  // Remove any dangerous SQL characters
  return input.replace(/['";\\]/g, '');
}

// Database error handler
function handleDatabaseError(error: any, operation: string): never {
  console.error(`Database error during ${operation}:`, error);
  if (error.code === '23505') { // Unique violation
    throw new Error('Duplicate entry found');
  }
  if (error.code === '23503') { // Foreign key violation
    throw new Error('Referenced record not found');
  }
  throw new Error(`Database error during ${operation}`);
}

export interface NewServiceCaseNote {
  serviceId: number;
  noteText: string;
  createdBy: number;
}

const SALT_ROUNDS = 10;

export class Storage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

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
        updateFields.push(`password = $${paramCount}`);
        values.push(data.password);
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

  // Person operations with validation
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
        createdBy
      } = data;

      const result = await this.pool.query(
        `INSERT INTO person_info (
          title, first_name, middle_name, last_name, date_of_birth, email,
          home_phone, mobile_phone, address_line1, address_line2, address_line3,
          post_code, mailing_address_line1, mailing_address_line2, mailing_address_line3,
          mailing_post_code, use_home_address, next_of_kin_name, next_of_kin_address,
          next_of_kin_email, next_of_kin_phone, hcp_level, hcp_start_date, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
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
          createdBy
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'createPersonInfo');
    }
  }

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    try {
      const result = await this.pool.query('SELECT * FROM person_info');
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
        createdBy: row.created_by || null
      }));
    } catch (error) {
      handleDatabaseError(error, 'getAllPersonInfo');
    }
  }

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
        createdBy: row.created_by || null
      };
    } catch (error) {
      handleDatabaseError(error, 'getPersonInfoById');
    }
  }

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
        createdBy
      } = data;

      const result = await this.pool.query(
        `UPDATE person_info SET
          title = $1, first_name = $2, middle_name = $3, last_name = $4,
          date_of_birth = $5, email = $6, home_phone = $7, mobile_phone = $8,
          address_line1 = $9, address_line2 = $10, address_line3 = $11,
          post_code = $12, status = $13
        WHERE id = $14
        RETURNING *`);
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
        createdBy: row.created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'updatePersonInfo');
    }
  }

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

      const result = await this.pool.query(
        'INSERT INTO master_data (service_category, service_type, service_provider, active, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider || '',
          data.active ?? true,
          data.createdBy
        ]
      );

      return {
        id: result.rows[0].id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider || undefined,
        active: result.rows[0].active,
        createdBy: result.rows[0].created_by,
        createdAt: result.rows[0].created_at
      };
    } catch (error) {
      handleDatabaseError(error, 'createMasterData');
    }
  }

  async getAllMasterData(): Promise<MasterData[]> {
    try {
      const result = await this.pool.query('SELECT * FROM master_data ORDER BY id DESC');
      return result.rows.map(row => ({
        id: row.id,
        serviceCategory: row.service_category,
        serviceType: row.service_type,
        serviceProvider: row.service_provider,
        active: row.active,
        createdBy: row.created_by,
        createdAt: row.created_at
      }));
    } catch (error) {
      handleDatabaseError(error, 'getAllMasterData');
    }
  }

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
          active = $4
        WHERE id = $5 RETURNING *`,
        [
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider || '',
          data.active,
          id
        ]
      );

      if (result.rows.length === 0) {
        throw new Error('Master data record not found');

      }
    });

    values.push(id);
    const query = `
      UPDATE master_data 
      SET ${updates.join(', ')} 
      WHERE id = $${paramCount} 
      RETURNING *
    `;

    const result = await this.pool.query(query, values);
    return result.rows[0];
  }


      return {
        id: result.rows[0].id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider || undefined,
        active: result.rows[0].active,
        createdBy: result.rows[0].created_by,
        createdAt: result.rows[0].created_at
      };
    } catch (error) {
      handleDatabaseError(error, 'updateMasterData');
    }
  }

  async createDocument(data: Omit<Document, 'id'>): Promise<Document> {
    try {
      const result = await this.pool.query(
        'INSERT INTO documents (client_id, document_name, document_type, filename, file_path, created_by, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [data.clientId, data.documentName, data.documentType, data.filename, data.filePath, data.createdBy, data.uploadedAt]
      );
      return {
        id: result.rows[0].id,
        clientId: result.rows[0].client_id,
        documentName: result.rows[0].document_name,
        documentType: result.rows[0].document_type,
        filename: result.rows[0].filename,
        filePath: result.rows[0].file_path,
        uploadedAt: result.rows[0].uploaded_at,
        createdBy: result.rows[0].created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'createDocument');
    }
  }

  async getDocumentsByClientId(clientId: number): Promise<Document[]> {
    if (!validateInput(clientId, 'id')) {
      throw new Error('Invalid client ID format');
    }

    try {
      const result = await this.pool.query('SELECT * FROM documents WHERE client_id = $1', [clientId]);
      return result.rows.map(row => ({
        id: row.id,
        clientId: row.client_id,
        documentName: row.document_name,
        documentType: row.document_type,
        filename: row.filename,
        filePath: row.file_path,
        uploadedAt: row.uploaded_at,
        createdBy: row.created_by
      }));
    } catch (error) {
      handleDatabaseError(error, 'getDocumentsByClientId');
    }
  }

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

  async createClientService(data: Omit<ClientService, 'id'>): Promise<ClientService> {
    try {
      const serviceDaysArray = Array.isArray(data.serviceDays) ? data.serviceDays : [data.serviceDays];
      
      const result = await this.pool.query(
        `INSERT INTO client_services (
          client_id, service_category, service_type, service_provider,
          service_start_date, service_days, service_hours, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          data.clientId,
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider,
          new Date(data.serviceStartDate),
          serviceDaysArray,
          data.serviceHours,
          data.status || 'Planned',
          data.createdBy
        ]
      );
      
      return {
        id: result.rows[0].id,
        clientId: result.rows[0].client_id,
        serviceCategory: result.rows[0].service_category,
        serviceType: result.rows[0].service_type,
        serviceProvider: result.rows[0].service_provider,
        serviceStartDate: result.rows[0].service_start_date,
        serviceDays: result.rows[0].service_days,
        serviceHours: result.rows[0].service_hours,
        status: result.rows[0].status,
        createdAt: result.rows[0].created_at,
        createdBy: result.rows[0].created_by
      };
    } catch (error) {
      handleDatabaseError(error, 'createClientService');
    }
  }

  async getClientServicesByClientId(clientId: number): Promise<ClientService[]> {
    if (!validateInput(clientId, 'id')) {
      throw new Error('Invalid client ID format');
    }

    try {
      const result = await this.pool.query('SELECT * FROM client_services WHERE client_id = $1', [clientId]);
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
        createdBy: row.created_by
      }));
    } catch (error) {
      handleDatabaseError(error, 'getClientServicesByClientId');
    }
  }

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

      // Return the complete segment info
      return {
        ...segmentResult.rows[0],
        company_name: data.company_name
      };
    } catch (error) {
      handleDatabaseError(error, 'updateServiceCaseNote');
    }
  }

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
  }

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
            contact_person_email = $6
        WHERE company_id = $7 RETURNING *`,
        [
          data.company_name,
          data.registered_address,
          data.postal_address,
          data.contact_person_name,
          data.contact_person_phone,
          data.contact_person_email,
          id
        ]
      );
      return result.rows[0];
    } catch (error) {
      handleDatabaseError(error, 'updateCompany');
    }
  }

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
}

export const storage = new Storage(pool);

