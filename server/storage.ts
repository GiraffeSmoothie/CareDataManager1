import { Pool } from 'pg';
import { parse } from 'pg-connection-string';
import { User, PersonInfo, MasterData, Document, ClientService, ServiceCaseNote } from '@shared/schema';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import * as dotenv from 'dotenv';

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
  ...connectionOptions,
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

export interface NewServiceCaseNote {
  serviceId: number;
  noteText: string;
  createdBy: number;
}

export const storage = {
  async getAllUsers(): Promise<User[]> {
    try {
      const result = await pool.query('SELECT * FROM users');
      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        username: row.username,
        role: row.role,
        // We don't return the password for security reasons
      }));
    } catch (error) {
      console.error("Error in getAllUsers:", error);
      throw error;
    }
  },

  async getUserByUsername(username: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  },

  async getUserById(id: number): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async verifyPassword(username: string, password: string): Promise<boolean> {
    const user = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!user.rows[0]) return false;
    const hash = crypto.createHash('sha256').update(password).digest('hex');
    return user.rows[0].password === hash;
  },

  async updateUserPassword(id: number, newPassword: string): Promise<void> {
    const hash = crypto.createHash('sha256').update(newPassword).digest('hex');
    await pool.query('UPDATE users SET password = $1 WHERE id = $2', [hash, id]);
  },

  async createUser(user: { name: string; username: string; password: string; role?: string }): Promise<User> {
    try {
      console.log("Attempting to create user:", {
        name: user.name,
        username: user.username,
        role: user.role || 'user'
      });

      const result = await pool.query(
        'INSERT INTO users (name, username, password, role) VALUES ($1, $2, $3, $4) RETURNING *',
        [user.name, user.username, user.password, user.role || 'user']
      );

      console.log("User created successfully:", {
        id: result.rows[0]?.id,
        username: result.rows[0]?.username,
        role: result.rows[0]?.role
      });

      return result.rows[0];
    } catch (error) {
      console.error("Error in createUser:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      throw error;
    }
  },

  async createPersonInfo(data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
    try {
      console.log("Creating person info with data:", data);
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

      console.log("Destructured data successfully, executing SQL query...");
      const result = await pool.query(
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
      console.log("SQL query executed successfully, returning result:", result.rows[0]);
      return result.rows[0];
    } catch (error) {
      console.error("Error in createPersonInfo:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message);
        console.error("Stack trace:", error.stack);
      }
      throw error;
    }
  },

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    const result = await pool.query('SELECT * FROM person_info');
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
  },

  async getPersonInfoById(id: number): Promise<PersonInfo | null> {
    const result = await pool.query('SELECT * FROM person_info WHERE id = $1', [id]);
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
  },

  async updatePersonInfo(id: number, data: Omit<PersonInfo, 'id'>): Promise<PersonInfo> {
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

      const result = await pool.query(
        `UPDATE person_info SET
          title = $1, first_name = $2, middle_name = $3, last_name = $4,
          date_of_birth = $5, email = $6, home_phone = $7, mobile_phone = $8,
          address_line1 = $9, address_line2 = $10, address_line3 = $11,
          post_code = $12, mailing_address_line1 = $13, mailing_address_line2 = $14,
          mailing_address_line3 = $15, mailing_post_code = $16, use_home_address = $17,
          next_of_kin_name = $18, next_of_kin_address = $19, next_of_kin_email = $20,
          next_of_kin_phone = $21, hcp_level = $22, hcp_start_date = $23, status = $24
        WHERE id = $25
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
      console.error("Error in updatePersonInfo:", error);
      throw error;
    }
  },

  async checkDuplicateService(serviceCategory: string, serviceType: string, serviceProvider: string): Promise<boolean> {
    const result = await pool.query(
      'SELECT COUNT(*) FROM master_data WHERE service_category = $1 AND service_type = $2 AND service_provider = $3',
      [serviceCategory, serviceType, serviceProvider || '']
    );
    return parseInt(result.rows[0].count) > 0;
  },

  async createMasterData(data: Omit<MasterData, 'id'>): Promise<MasterData> {
    try {
      // Check for duplicates first
      const isDuplicate = await this.checkDuplicateService(
        data.serviceCategory, 
        data.serviceType, 
        data.serviceProvider || ''
      );
      
      if (isDuplicate) {
        throw new Error('A service with this combination of category, type, and provider already exists');
      }

      const result = await pool.query(
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
      console.error("Error in createMasterData:", error);
      throw error;
    }
  },

  async getAllMasterData(): Promise<MasterData[]> {
    const result = await pool.query('SELECT * FROM master_data ORDER BY id DESC');
    return result.rows.map(row => ({
      id: row.id,
      serviceCategory: row.service_category,
      serviceType: row.service_type,
      serviceProvider: row.service_provider,
      active: row.active,
      createdBy: row.created_by,
      createdAt: row.created_at
    }));
  },

  async updateMasterDataStatus(id: number, status: string): Promise<void> {
    await pool.query('UPDATE master_data SET status = $1 WHERE id = $2', [status, id]);
  },

  async updateMasterData(id: number, data: Omit<MasterData, 'id'>): Promise<MasterData> {
    try {
      const result = await pool.query(
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
      console.error("Error in updateMasterData:", error);
      throw error;
    }
  },

  async createDocument(data: Omit<Document, 'id'>): Promise<Document> {
    try {
      console.log("Creating document with data:", data);
      const result = await pool.query(
        'INSERT INTO documents (client_id, document_name, document_type, filename, file_path, created_by, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [data.clientId, data.documentName, data.documentType, data.filename, data.filePath, data.createdBy, data.uploadedAt]
      );
      
      console.log("Document created successfully:", result.rows[0]);
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
      console.error("Error in createDocument:", error);
      throw error;
    }
  },

  async getDocumentsByClientId(clientId: number): Promise<Document[]> {
    const result = await pool.query('SELECT * FROM documents WHERE client_id = $1', [clientId]);
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
  },

  async getDocumentByFilename(filename: string): Promise<Document | null> {
    const result = await pool.query('SELECT * FROM documents WHERE filename = $1 LIMIT 1', [filename]);
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
  },

  async getDocumentByFilePath(filePath: string): Promise<Document | null> {
    const result = await pool.query('SELECT * FROM documents WHERE file_path = $1 LIMIT 1', [filePath]);
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
  },

  async createClientService(data: Omit<ClientService, 'id'>): Promise<ClientService> {
    try {
      console.log("Creating client service with data:", data);
      
      // Ensure serviceDays is properly formatted as a PostgreSQL array
      const serviceDaysArray = Array.isArray(data.serviceDays) ? data.serviceDays : [data.serviceDays];
      
      const result = await pool.query(
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

      console.log("Client service created:", result.rows[0]);
      
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
      console.error("Error in createClientService:", error);
      throw error;
    }
  },

  async getClientServicesByClientId(clientId: number): Promise<ClientService[]> {
    const result = await pool.query('SELECT * FROM client_services WHERE client_id = $1', [clientId]);
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
  },

  async updateClientServiceStatus(id: number, status: string): Promise<void> {
    await pool.query(
      'UPDATE client_services SET status = $1 WHERE id = $2',
      [status, id]
    );
  },

  async getServiceCaseNote(serviceId: number): Promise<ServiceCaseNote | null> {
    try {
      const result = await pool.query(
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
      console.error("Error in getServiceCaseNote:", error);
      throw error;
    }
  },

  async createServiceCaseNote(data: NewServiceCaseNote): Promise<ServiceCaseNote> {
    try {
      const result = await pool.query(
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
      console.error("Error in createServiceCaseNote:", error);
      throw error;
    }
  },

  async updateServiceCaseNote(serviceId: number, data: { noteText: string; updatedBy: number }): Promise<ServiceCaseNote> {
    try {
      const result = await pool.query(
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
      console.error("Error in updateServiceCaseNote:", error);
      throw error;
    }
  },
};
