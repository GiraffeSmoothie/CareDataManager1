/*
import { 
  type User, type PersonInfo, type MasterData, type CaseNote, type Document
} from "@shared/schema";

// In-memory storage
const store = {
  users: [] as User[],
  personInfo: [] as PersonInfo[],
  masterData: [] as MasterData[],
  caseNotes: [] as CaseNote[],
  documents: [] as Document[]
};

let nextId = 1;

export const storage = {
  async updateMasterDataStatus(id: number, status: string) {
    const result = await db.update(masterData)
      .set({ status })
      .where(eq(masterData.id, id))
      .returning();
    return result[0];
  },
  // User operations
  async createUser(user: { username: string; password: string }): Promise<User> {
    const created = { ...user, id: nextId++ } as User;
    store.users.push(created);
    return created;
  },

  async getUser(id: number): Promise<User | undefined> {
    return store.users.find(user => user.id === id);
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    return store.users.find(user => user.username === username);
  },

  // Person info operations
  async createPersonInfo(info: Omit<PersonInfo, "id">): Promise<PersonInfo> {
    const created = { ...info, id: nextId++ } as PersonInfo;
    store.personInfo.push(created);
    return created;
  },

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    return store.personInfo;
  },

  async getPersonInfoById(id: number): Promise<PersonInfo | undefined> {
    return store.personInfo.find(person => person.id === id);
  },

  // Master data operations
  async createMasterData(data: Omit<MasterData, "id">): Promise<MasterData> {
    const created = { ...data, id: nextId++ } as MasterData;
    store.masterData.push(created);
    return created;
  },

  async getAllMasterData(): Promise<MasterData[]> {
    return store.masterData;
  },

  async getMasterDataById(id: number): Promise<MasterData | undefined> {
    return store.masterData.find(data => data.id === id);
  },

  async getMasterDataByMemberId(memberId: number): Promise<MasterData[]> {
    return store.masterData.filter(data => data.memberId === memberId);
  },

  // Case notes operations
  async createCaseNote(note: Omit<CaseNote, "id" | "createdAt">): Promise<CaseNote> {
    const created = { ...note, id: nextId++, createdAt: new Date() } as CaseNote;
    store.caseNotes.push(created);
    return created;
  },

  async getCaseNotesByMemberId(memberId: number): Promise<CaseNote[]> {
    return store.caseNotes.filter(note => note.memberId === memberId);
  },

  // Document operations
  async createDocument(doc: Omit<Document, "id" | "uploadedAt">): Promise<Document> {
    const created = { ...doc, id: nextId++, uploadedAt: new Date() } as Document;
    store.documents.push(created);
    return created;
  },

  async getDocumentsByMemberId(memberId: number): Promise<Document[]> {
    return store.documents.filter(doc => doc.memberId === memberId);
  },

  async getDocumentById(id: number): Promise<Document | undefined> {
    return store.documents.find(doc => doc.id === id);
  }
};
*/


import { Pool } from 'pg';
import { User, PersonInfo, MasterData, CaseNote, Document } from '@shared/schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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
    const result = await pool.query(
      `INSERT INTO person_info (
        title, first_name, middle_name, last_name, date_of_birth, email,
        home_phone, mobile_phone, address_line1, address_line2, address_line3,
        post_code, mailing_address_line1, mailing_address_line2, mailing_address_line3,
        mailing_post_code, use_home_address, next_of_kin_name, next_of_kin_address,
        next_of_kin_email, next_of_kin_phone, hcp_level, hcp_end_date, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24) RETURNING *`,
      Object.values(data)
    );
    return result.rows[0];
  },

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    const result = await pool.query('SELECT * FROM person_info');
    return result.rows;
  },

  async getPersonInfoById(id: number): Promise<PersonInfo | null> {
    const result = await pool.query('SELECT * FROM person_info WHERE id = $1', [id]);
    return result.rows[0] || null;
  },

  async createMasterData(data: Omit<MasterData, 'id'>): Promise<MasterData> {
    const result = await pool.query(
      'INSERT INTO master_data (service_category, service_type, service_provider, active, member_id, created_by) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      Object.values(data)
    );
    return result.rows[0];
  },

  async getAllMasterData(): Promise<MasterData[]> {
    const result = await pool.query('SELECT * FROM master_data');
    return result.rows;
  },

  async getMasterDataByMemberId(memberId: number): Promise<MasterData[]> {
    const result = await pool.query('SELECT * FROM master_data WHERE member_id = $1', [memberId]);
    return result.rows;
  },

  async updateMasterDataStatus(id: number, status: string): Promise<void> {
    await pool.query('UPDATE master_data SET status = $1 WHERE id = $2', [status, id]);
  },

  async createCaseNote(data: Omit<CaseNote, 'id'>): Promise<CaseNote> {
    const result = await pool.query(
      'INSERT INTO case_notes (member_id, note, created_by) VALUES ($1, $2, $3) RETURNING *',
      Object.values(data)
    );
    return result.rows[0];
  },

  async getCaseNotesByMemberId(memberId: number): Promise<CaseNote[]> {
    const result = await pool.query('SELECT * FROM case_notes WHERE member_id = $1', [memberId]);
    return result.rows;
  },

  async createDocument(data: Omit<Document, 'id'>): Promise<Document> {
    const result = await pool.query(
      'INSERT INTO documents (member_id, document_name, document_type, filename, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      Object.values(data)
    );
    return result.rows[0];
  },

  async getDocumentsByMemberId(memberId: number): Promise<Document[]> {
    const result = await pool.query('SELECT * FROM documents WHERE member_id = $1', [memberId]);
    return result.rows;
  }
};
