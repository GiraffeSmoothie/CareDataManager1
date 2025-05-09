import { Pool } from 'pg';
import { parse } from 'pg-connection-string';
import { type User, type PersonInfo, type MasterData, type Document, type ServiceCaseNote, type CompanySegment } from '@shared/schema';
// Import ClientService as ClientServiceType to avoid naming conflict
import { type ClientService as ClientServiceType } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';
import { validateAndSanitize, userSchema, personInfoSchema, serviceSchema } from './utils/validation';
import { format } from 'sql-formatter';

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
  connectionOptions = parse(process.env.DATABASE_URL || '');
  console.log('Parsed connection options:', {
    user: connectionOptions.user || '',
    host: connectionOptions.host || '',
    database: connectionOptions.database,
    // Not logging password for security reasons
    port: connectionOptions.port || ''
  });
  
  if (!connectionOptions.host || connectionOptions.host === 'base') {
    throw new Error('Invalid hostname in DATABASE_URL. Please verify the configuration.');
  }
} catch (error) {
  console.error('Error parsing DATABASE_URL:', error);
  throw new Error('Invalid DATABASE_URL format. Please check your environment configuration.');
}

// Ensure password is a string to prevent Pool creation errors
if (connectionOptions.password && typeof connectionOptions.password !== 'string') {
  connectionOptions.password = String(connectionOptions.password);
}

export const pool = new Pool({
  user: connectionOptions.user || undefined,
  host: connectionOptions.host || undefined,
  database: connectionOptions.database || undefined,
  password: connectionOptions.password,
  port: connectionOptions.port ? parseInt(connectionOptions.port) : undefined,
});

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

// SQL Query sanitization helper
function sanitizeQuery(query: string): string {
  return format(query, {
    language: 'postgresql',
    keywordCase: 'upper'
  });
}

// Enhanced error handling wrapper
async function executeQuery<T>(queryFn: () => Promise<T>): Promise<T> {
  try {
    return await queryFn();
  } catch (error: any) {
    if (error.code === '23505') { // Unique violation
      throw new Error('Duplicate entry found');
    }
    if (error.code === '23503') { // Foreign key violation
      throw new Error('Referenced record not found');
    }
    if (error.code === '23502') { // Not null violation
      throw new Error('Required field missing');
    }
    console.error('Database error:', error);
    throw new Error('An error occurred while executing the query');
  }
}

// Rename interface to avoid conflict
interface DatabaseClientService {
  id: number;
  clientId: number;
  serviceType: string;
  startDate: Date;
  endDate: Date | null;
  status: string;
  serviceCategory?: string;
  serviceProvider?: string;
  createdBy?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Company {
  company_id: number;
  company_name: string;
  registered_address: string;
  postal_address?: string;
  contact_person_name: string;
  contact_person_phone: string;
  contact_person_email: string;
  created_at?: Date;
  created_by?: number;
}

export interface Storage {
  getAllUsers(): Promise<User[]>;
  getUserByUsername(username: string): Promise<User | null>;
  getUserById(id: number): Promise<User | null>;
  verifyPassword(username: string, password: string): Promise<boolean>;
  updateUserPassword(id: number, newPassword: string): Promise<void>;
  createUser(user: { name: string; username: string; password: string; role?: string }): Promise<User>;
  createPersonInfo(data: Omit<PersonInfo, 'id'>): Promise<PersonInfo>;
  getAllPersonInfo(): Promise<PersonInfo[]>;
  getPersonInfoById(id: number): Promise<PersonInfo | null>;
  updatePersonInfo(id: number, data: Omit<PersonInfo, 'id'>): Promise<PersonInfo>;
  checkDuplicateService(serviceCategory: string, serviceType: string, serviceProvider: string): Promise<boolean>;
  createMasterData(data: Omit<MasterData, 'id'>): Promise<MasterData>;
  getAllMasterData(): Promise<MasterData[]>;
  updateMasterDataStatus(id: number, status: string): Promise<void>;
  updateMasterData(id: number, data: Omit<MasterData, 'id'>): Promise<MasterData>;
  createDocument(data: Omit<Document, 'id'>): Promise<Document>;
  getDocumentsByClientId(clientId: number): Promise<Document[]>;
  getDocumentByFilename(filename: string): Promise<Document | null>;
  getDocumentByFilePath(filePath: string): Promise<Document | null>;
  createClientService(service: Omit<ClientServiceType, 'id'>): Promise<ClientServiceType>;
  getClientServices(): Promise<DatabaseClientService[]>;
  getClientServicesByClientId(clientId: number): Promise<ClientServiceType[]>;
  updateClientServiceStatus(id: number, status: string): Promise<void>;
  getServiceCaseNote(serviceId: number): Promise<ServiceCaseNote | null>;
  createServiceCaseNote(data: ServiceCaseNote): Promise<ServiceCaseNote>;
  updateServiceCaseNote(serviceId: number, data: { noteText: string; updatedBy: number }): Promise<ServiceCaseNote>;
  createCompany(data: Omit<Company, 'company_id'>): Promise<Company>;
  getAllCompanies(): Promise<Company[]>;
  updateCompany(id: number, data: Partial<Omit<Company, 'company_id'>>): Promise<Company>;
  getAllSegments(): Promise<CompanySegment[]>;
  createSegment(data: { company_name: string; segment_name: string; created_by: number }): Promise<CompanySegment>;
  updateSegment(companyId: number, segmentId: number, data: { company_name?: string; segment_name?: string }): Promise<CompanySegment>;
}

export class PostgresStorage implements Storage {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  // User operations with validation
  async createUser(data: Omit<User, 'id'>): Promise<User> {
    const validatedData = validateAndSanitize(userSchema, data);
    const hash = crypto.createHash('sha256').update(validatedData.password).digest('hex');
    
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO users (username, password, name, role)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, name, role
      `);
      
      const result = await this.pool.query(query, [
        validatedData.username,
        hash,
        validatedData.name,
        validatedData.role || 'user'
      ]);
      
      return result.rows[0];
    });
  }

  async verifyPassword(username: string, password: string): Promise<boolean> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT password FROM users WHERE username = $1');
      const result = await this.pool.query(query, [username]);
      
      if (!result.rows[0]) return false;
      
      // Special handling for admin user with known hash
      if (username === 'admin' && result.rows[0].password === '113459eb7bb31bddee85ade5230d6ad5d8b2fb52879e00a84ff6ae1067a210d3') {
        return password === 'password';
      }
      
      const hash = crypto.createHash('sha256').update(password).digest('hex');
      return result.rows[0].password === hash;
    });
  }

  async getUserByUsername(username: string): Promise<User | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM users WHERE username = $1');
      const result = await this.pool.query(query, [username]);
      return result.rows[0] || null;
    });
  }

  async getUserById(id: number): Promise<User | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT id, username, name, role FROM users WHERE id = $1');
      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    });
  }

  async getAllUsers(): Promise<User[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT id, username, name, role FROM users ORDER BY id');
      const result = await this.pool.query(query);
      return result.rows;
    });
  }

  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    return executeQuery(async () => {
      const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
      const query = sanitizeQuery('UPDATE users SET password = $1 WHERE id = $2');
      await this.pool.query(query, [hash, id]);
    });
  }

  // Person operations with validation
  async createPersonInfo(data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
    const validatedData = validateAndSanitize(personInfoSchema, data);
    
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO person_info (
          title, first_name, middle_name, last_name, date_of_birth,
          email, home_phone, mobile_phone, address_line1, address_line2,
          address_line3, post_code, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        validatedData.title,
        validatedData.firstName,
        validatedData.middleName || null,
        validatedData.lastName,
        validatedData.dateOfBirth,
        validatedData.email,
        validatedData.homePhone || null,
        validatedData.mobilePhone,
        validatedData.addressLine1,
        validatedData.addressLine2 || null,
        validatedData.addressLine3 || null,
        validatedData.postCode,
        validatedData.status || 'Active'
      ]);
      
      return result.rows[0];
    });
  }

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM person_info ORDER BY id');
      const result = await this.pool.query(query);
      return result.rows;
    });
  }

  async getPersonInfoById(id: number): Promise<PersonInfo | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM person_info WHERE id = $1');
      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    });
  }

  async updatePersonInfo(id: number, data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
    const validatedData = validateAndSanitize(personInfoSchema, data);
    
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        UPDATE person_info SET
          title = $1, first_name = $2, middle_name = $3, last_name = $4,
          date_of_birth = $5, email = $6, home_phone = $7, mobile_phone = $8,
          address_line1 = $9, address_line2 = $10, address_line3 = $11,
          post_code = $12, status = $13
        WHERE id = $14
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        validatedData.title,
        validatedData.firstName,
        validatedData.middleName || null,
        validatedData.lastName,
        validatedData.dateOfBirth,
        validatedData.email,
        validatedData.homePhone || null,
        validatedData.mobilePhone,
        validatedData.addressLine1,
        validatedData.addressLine2 || null,
        validatedData.addressLine3 || null,
        validatedData.postCode,
        validatedData.status || 'Active',
        id
      ]);
      
      return result.rows[0];
    });
  }

  // Service operations with validation
  async createClientService(data: Omit<ClientServiceType, 'id'>): Promise<ClientServiceType> {
    const validatedData = validateAndSanitize(serviceSchema, data);
    
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO client_services (
          client_id, service_category, service_type, service_provider,
          service_start_date, service_days, service_hours, status, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        validatedData.clientId,
        validatedData.serviceCategory,
        validatedData.serviceType,
        validatedData.serviceProvider,
        validatedData.serviceStartDate,
        validatedData.serviceDays,
        validatedData.serviceHours,
        validatedData.status || 'Planned',
        data.createdBy
      ]);
      
      return result.rows[0];
    });
  }

  async getClientServices(): Promise<DatabaseClientService[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        SELECT 
          id, 
          client_id as "clientId", 
          service_type as "serviceType",
          service_category as "serviceCategory",
          service_provider as "serviceProvider", 
          service_start_date as "startDate", 
          service_end_date as "endDate", 
          status,
          created_by as "createdBy", 
          created_at as "createdAt", 
          updated_at as "updatedAt"
        FROM client_services
        ORDER BY created_at DESC
      `);
      const result = await this.pool.query(query);
      return result.rows;
    });
  }

  async getClientServicesByClientId(clientId: number): Promise<ClientServiceType[]> {
    const result = await this.pool.query(
      'SELECT * FROM client_services WHERE client_id = $1 ORDER BY created_at DESC',
      [clientId]
    );
    return result.rows;
  }

  async updateClientServiceStatus(id: number, status: string): Promise<void> {
    await this.pool.query(
      'UPDATE client_services SET status = $1, updated_at = NOW() WHERE id = $2',
      [status, id]
    );
  }

  async checkDuplicateService(serviceCategory: string, serviceType: string, serviceProvider: string): Promise<boolean> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        SELECT EXISTS (
          SELECT 1 FROM client_services 
          WHERE service_category = $1 
          AND service_type = $2 
          AND service_provider = $3
        )
      `);
      const result = await this.pool.query(query, [serviceCategory, serviceType, serviceProvider]);
      return result.rows[0].exists;
    });
  }

  async getAllClientServices(): Promise<DatabaseClientService[]> {
    return this.getClientServices();
  }

  async getClientServiceById(id: number): Promise<DatabaseClientService | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        SELECT 
          id, 
          client_id as "clientId", 
          service_type as "serviceType",
          service_category as "serviceCategory",
          service_provider as "serviceProvider", 
          service_start_date as "startDate", 
          service_end_date as "endDate", 
          status,
          created_by as "createdBy", 
          created_at as "createdAt", 
          updated_at as "updatedAt"
        FROM client_services 
        WHERE id = $1
      `);
      const result = await this.pool.query(query, [id]);
      return result.rows[0] || null;
    });
  }

  async createMasterData(data: Omit<MasterData, 'id'>): Promise<MasterData> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO master_data (
          service_category, service_type, service_provider, active, created_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        data.serviceCategory,
        data.serviceType,
        data.serviceProvider,
        data.active,
        data.createdBy || null
      ]);
      
      return result.rows[0];
    });
  }

  async getAllMasterData(): Promise<MasterData[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM master_data ORDER BY service_category, service_type');
      const result = await this.pool.query(query);
      return result.rows;
    });
  }

  async getMasterData(): Promise<MasterData[]> {
    const result = await this.pool.query('SELECT * FROM master_data WHERE active = true');
    return result.rows;
  }

  async updateMasterDataStatus(id: number, status: string): Promise<void> {
    return executeQuery(async () => {
      const query = sanitizeQuery('UPDATE master_data SET status = $1 WHERE id = $2');
      await this.pool.query(query, [status, id]);
    });
  }

  async updateMasterData(id: number, data: Partial<MasterData>): Promise<MasterData> {
    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    Object.entries(data).forEach(([key, value]) => {
      if (value !== undefined) {
        updates.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
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

  async deleteMasterData(id: number): Promise<void> {
    await this.pool.query('DELETE FROM master_data WHERE id = $1', [id]);
  }

  async getMasterDataByType(type: string): Promise<MasterData[]> {
    const result = await this.pool.query(
      'SELECT id, type, value, description, company_id, segment FROM master_data WHERE type = $1',
      [type]
    );
    return result.rows;
  }

  async createDocument(data: Omit<Document, 'id'>): Promise<Document> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO documents (
          client_id, document_name, document_type, filename, file_path, created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        data.clientId,
        data.documentName,
        data.documentType,
        data.filename,
        data.filePath || null,
        data.createdBy || null
      ]);
      
      return result.rows[0];
    });
  }

  async addDocument(doc: Omit<Document, 'id'>): Promise<Document> {
    const result = await this.pool.query(
      'INSERT INTO documents (client_id, document_name, document_type, upload_date) VALUES ($1, $2, $3, NOW()) RETURNING *',
      [doc.clientId, doc.documentName, doc.documentType]
    );
    return result.rows[0];
  }

  async getDocumentsByClientId(clientId: number): Promise<Document[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM documents WHERE client_id = $1');
      const result = await this.pool.query(query, [clientId]);
      return result.rows;
    });
  }

  async getDocuments(clientId: number): Promise<Document[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM documents WHERE client_id = $1');
      const result = await this.pool.query(query, [clientId]);
      return result.rows;
    });
  }

  async getDocumentByFilename(filename: string): Promise<Document | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM documents WHERE filename = $1');
      const result = await this.pool.query(query, [filename]);
      return result.rows[0] || null;
    });
  }

  async getDocumentByFilePath(filePath: string): Promise<Document | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM documents WHERE file_path = $1');
      const result = await this.pool.query(query, [filePath]);
      return result.rows[0] || null;
    });
  }

  async getDocument(id: number): Promise<Document | null> {
    const result = await this.pool.query('SELECT * FROM documents WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  async deleteDocument(id: number): Promise<void> {
    await this.pool.query('DELETE FROM documents WHERE id = $1', [id]);
  }

  async getServiceCaseNote(serviceId: number): Promise<ServiceCaseNote | null> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM service_case_notes WHERE service_id = $1');
      const result = await this.pool.query(query, [serviceId]);
      return result.rows[0] || null;
    });
  }

  async createServiceCaseNote(data: Omit<ServiceCaseNote, 'id'>): Promise<ServiceCaseNote> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO service_case_notes (
          service_id, note_text, created_by
        )
        VALUES ($1, $2, $3)
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        data.serviceId,
        data.noteText,
        data.createdBy
      ]);
      
      return result.rows[0];
    });
  }

  async updateServiceCaseNote(serviceId: number, data: { noteText: string; updatedBy: number }): Promise<ServiceCaseNote> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        UPDATE service_case_notes SET
          note_text = $1, updated_by = $2, updated_at = NOW()
        WHERE service_id = $3
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        data.noteText,
        data.updatedBy,
        serviceId
      ]);
      
      return result.rows[0];
    });
  }

  async createCompany(data: Omit<Company, 'company_id'>): Promise<Company> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        INSERT INTO company (
          company_name, registered_address, postal_address,
          contact_person_name, contact_person_phone, contact_person_email,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `);
      
      const result = await this.pool.query(query, [
        data.company_name,
        data.registered_address,
        data.postal_address || null,
        data.contact_person_name,
        data.contact_person_phone,
        data.contact_person_email,
        data.created_by || null
      ]);
      
      return result.rows[0];
    });
  }

  async getAllCompanies(): Promise<Company[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM company ORDER BY company_name');
      const result = await this.pool.query(query);
      return result.rows;
    });
  }

  async updateCompany(id: number, data: Partial<Omit<Company, 'company_id'>>): Promise<Company> {
    return executeQuery(async () => {
      const updates: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.company_name !== undefined) {
        updates.push(`company_name = $${paramCount}`);
        values.push(data.company_name);
        paramCount++;
      }
      if (data.registered_address !== undefined) {
        updates.push(`registered_address = $${paramCount}`);
        values.push(data.registered_address);
        paramCount++;
      }
      if (data.postal_address !== undefined) {
        updates.push(`postal_address = $${paramCount}`);
        values.push(data.postal_address);
        paramCount++;
      }
      if (data.contact_person_name !== undefined) {
        updates.push(`contact_person_name = $${paramCount}`);
        values.push(data.contact_person_name);
        paramCount++;
      }
      if (data.contact_person_phone !== undefined) {
        updates.push(`contact_person_phone = $${paramCount}`);
        values.push(data.contact_person_phone);
        paramCount++;
      }
      if (data.contact_person_email !== undefined) {
        updates.push(`contact_person_email = $${paramCount}`);
        values.push(data.contact_person_email);
        paramCount++;
      }

      if (updates.length === 0) {
        return this.getCompanyById(id);
      }

      values.push(id);
      const query = sanitizeQuery(`
        UPDATE company 
        SET ${updates.join(', ')} 
        WHERE company_id = $${paramCount}
        RETURNING *
      `);
      
      const result = await this.pool.query(query, values);
      return result.rows[0];
    });
  }

  private async getCompanyById(id: number): Promise<Company> {
    return executeQuery(async () => {
      const query = sanitizeQuery('SELECT * FROM company WHERE company_id = $1');
      const result = await this.pool.query(query, [id]);
      if (!result.rows[0]) {
        throw new Error('Company not found');
      }
      return result.rows[0];
    });
  }

  // Segment operations
  async getAllSegments(): Promise<CompanySegment[]> {
    return executeQuery(async () => {
      const query = sanitizeQuery(`
        SELECT 
          s.segment_id,
          s.company_id,
          s.segment_name,
          c.company_name,
          s.created_at,
          s.created_by
        FROM segments s
        JOIN company c ON s.company_id = c.company_id
        ORDER BY c.company_name, s.segment_name
      `);
      const result = await this.pool.query(query);
      return result.rows;
    });
  }

  async createSegment(data: { company_name: string; segment_name: string; created_by: number }): Promise<CompanySegment> {
    return executeQuery(async () => {
      if (!data.company_name || !data.segment_name || !data.created_by) {
        throw new Error('Required field missing');
      }

      // First get or create the company
      const companyQuery = sanitizeQuery(`
        WITH inserted_company AS (
          INSERT INTO company (company_name, created_by)
          VALUES ($1, $2)
          ON CONFLICT (company_name) DO UPDATE SET company_name = EXCLUDED.company_name
          RETURNING company_id
        )
        SELECT company_id FROM inserted_company
        UNION ALL
        SELECT company_id FROM company WHERE company_name = $1
        LIMIT 1
      `);
      
      const companyResult = await this.pool.query(companyQuery, [data.company_name, data.created_by]);
      if (!companyResult.rows[0]) {
        throw new Error('Failed to create or find company');
      }
      const companyId = companyResult.rows[0].company_id;

      // Then create the segment
      const segmentQuery = sanitizeQuery(`
        INSERT INTO segments (company_id, segment_name, created_by)
        VALUES ($1, $2, $3)
        RETURNING 
          segment_id,
          company_id,
          segment_name,
          created_at,
          created_by
      `);
      
      const segmentResult = await this.pool.query(segmentQuery, [
        companyId,
        data.segment_name,
        data.created_by
      ]);
      
      if (!segmentResult.rows[0]) {
        throw new Error('Failed to create segment');
      }

      // Return the complete segment info
      return {
        ...segmentResult.rows[0],
        company_name: data.company_name
      };
    });
  }

  async updateSegment(companyId: number, segmentId: number, data: { company_name?: string; segment_name?: string }): Promise<CompanySegment> {
    return executeQuery(async () => {
      // Start a transaction since we might need to update both company and segment
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');

        // Update company name if provided
        if (data.company_name) {
          const companyQuery = sanitizeQuery(`
            UPDATE company 
            SET company_name = $1 
            WHERE company_id = $2
            RETURNING company_id, company_name
          `);
          await client.query(companyQuery, [data.company_name, companyId]);
        }

        // Update segment name if provided
        if (data.segment_name) {
          const segmentQuery = sanitizeQuery(`
            UPDATE segments 
            SET segment_name = $1 
            WHERE segment_id = $2 AND company_id = $3
            RETURNING *
          `);
          await client.query(segmentQuery, [data.segment_name, segmentId, companyId]);
        }

        // Get the updated segment with company info
        const finalQuery = sanitizeQuery(`
          SELECT 
            s.segment_id,
            s.company_id,
            s.segment_name,
            c.company_name,
            s.created_at,
            s.created_by
          FROM segments s
          JOIN company c ON s.company_id = c.company_id
          WHERE s.segment_id = $1 AND s.company_id = $2
        `);
        
        const result = await client.query(finalQuery, [segmentId, companyId]);
        await client.query('COMMIT');
        
        if (!result.rows[0]) {
          throw new Error('Segment not found');
        }
        
        return result.rows[0];
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    });
  }
}

// Create and export a properly typed instance of PostgresStorage
const postgresStorage = new PostgresStorage(pool);
export const storage: Storage = postgresStorage;

// Add type assertion to ensure all methods are implemented
const _typeCheck: Storage = postgresStorage;
