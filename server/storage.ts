import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
const { Pool } = pg;
import { 
  users, personInfo, masterData, caseNotes, documents,
  type User, type PersonInfo, type MasterData, type CaseNote, type Document, type InsertUser, type InsertMasterData, type InsertPersonInfo, type InsertCaseNote, type InsertDocument
} from "@shared/schema";
import { eq } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool);

export const storage = {
  // User operations
  async createUser(user: { username: string; password: string }): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  },

  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  },

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  },

  // Person info operations
  async createPersonInfo(info: Omit<PersonInfo, "id">): Promise<PersonInfo> {
    const [created] = await db.insert(personInfo).values(info).returning();
    return created;
  },

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    return await db.select().from(personInfo);
  },

  async getPersonInfoById(id: number): Promise<PersonInfo | undefined> {
    const [person] = await db.select().from(personInfo).where(eq(personInfo.id, id));
    return person;
  },

  // Master data operations
  async createMasterData(data: Omit<MasterData, "id">): Promise<MasterData> {
    const [created] = await db.insert(masterData).values(data).returning();
    return created;
  },

  async getAllMasterData(): Promise<MasterData[]> {
    return await db.select().from(masterData);
  },

  async getMasterDataById(id: number): Promise<MasterData | undefined> {
    const [data] = await db.select().from(masterData).where(eq(masterData.id, id));
    return data;
  },

  async getMasterDataByMemberId(memberId: number): Promise<MasterData[]> {
    return await db.select().from(masterData).where(eq(masterData.memberId, memberId));
  },

  // Case notes operations
  async createCaseNote(note: Omit<CaseNote, "id" | "createdAt">): Promise<CaseNote> {
    const [created] = await db.insert(caseNotes).values(note).returning();
    return created;
  },

  async getCaseNotesByMemberId(memberId: number): Promise<CaseNote[]> {
    return await db.select().from(caseNotes).where(eq(caseNotes.memberId, memberId));
  },

  // Document operations
  async createDocument(doc: Omit<Document, "id" | "uploadedAt">): Promise<Document> {
    const [created] = await db.insert(documents).values(doc).returning();
    return created;
  },

  async getDocumentsByMemberId(memberId: number): Promise<Document[]> {
    return await db.select().from(documents).where(eq(documents.memberId, memberId));
  },
  async getDocumentById(id: number): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }
};