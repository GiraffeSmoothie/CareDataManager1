import { Pool } from 'pg';
import { User, PersonInfo, MasterData, Document, MemberService, ServiceCaseNote, InsertServiceCaseNote } from '@shared/schema';
import fs from 'fs';
import path from 'path';

let pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: 'CareDataManager1',
  password: 'postgres',
  port: 5432,
  ssl: false
});

// Initialize database and run migrations
export async function initializeDatabase() {
  let client;
  try {
    // Connect to the database
    client = await pool.connect();
    
    // Run initial migration if not already applied
    const initialMigrationPath = path.join(process.cwd(), 'migrations', '01_initial.sql');
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

export const storage = {
  async getUserByUsername(username: string): Promise<User | null> {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return result.rows[0] || null;
  },

  async createUser(user: { username: string; password: string }): Promise<User> {
    const result = await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING *',
      [user.username, user.password]
    );
    return result.rows[0];
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
        hcpEndDate,
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
          next_of_kin_email, next_of_kin_phone, hcp_level, hcp_end_date, status, created_by
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
          hcpEndDate,
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
      hcpEndDate: row.hcp_end_date,
      status: row.status,
      createdBy: row.created_by
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
      hcpEndDate: row.hcp_end_date,
      status: row.status,
      createdBy: row.created_by
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
        hcpEndDate,
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
          next_of_kin_phone = $21, hcp_level = $22, hcp_end_date = $23, status = $24
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
          hcpEndDate || '',
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
        hcpEndDate: row.hcp_end_date,
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
        'INSERT INTO documents (member_id, document_name, document_type, filename, file_path, created_by, uploaded_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [data.memberId, data.documentName, data.documentType, data.filename, data.filePath, data.createdBy, data.uploadedAt]
      );
      
      console.log("Document created successfully:", result.rows[0]);
      return {
        id: result.rows[0].id,
        memberId: result.rows[0].member_id,
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

  async getDocumentsByMemberId(memberId: number): Promise<Document[]> {
    const result = await pool.query('SELECT * FROM documents WHERE member_id = $1', [memberId]);
    return result.rows.map(row => ({
      id: row.id,
      memberId: row.member_id,
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
      memberId: row.member_id,
      documentName: row.document_name,
      documentType: row.document_type,
      filename: row.filename,
      filePath: row.file_path,
      uploadedAt: row.uploaded_at,
      createdBy: row.created_by
    };
  },

  async createMemberService(data: Omit<MemberService, 'id'>): Promise<MemberService> {
    try {
      const result = await pool.query(
        `INSERT INTO member_services (
          member_id, service_category, service_type, service_provider,
          service_start_date, service_days, service_hours, status, created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [
          data.memberId,
          data.serviceCategory,
          data.serviceType,
          data.serviceProvider,
          data.serviceStartDate,
          data.serviceDays,
          data.serviceHours,
          data.status || 'New',
          data.createdBy
        ]
      );

      return {
        id: result.rows[0].id,
        memberId: result.rows[0].member_id,
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
      console.error("Error in createMemberService:", error);
      throw error;
    }
  },

  async getMemberServicesByMemberId(memberId: number): Promise<MemberService[]> {
    const result = await pool.query('SELECT * FROM member_services WHERE member_id = $1', [memberId]);
    return result.rows.map(row => ({
      id: row.id,
      memberId: row.member_id,
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

  async updateMemberServiceStatus(id: number, status: string): Promise<void> {
    await pool.query(
      'UPDATE member_services SET status = $1 WHERE id = $2',
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
