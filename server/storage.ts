
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
