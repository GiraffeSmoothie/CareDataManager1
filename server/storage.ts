import { users, type User, type InsertUser, masterData, type MasterData, type InsertMasterData, personInfo, type PersonInfo, type InsertPersonInfo, caseNotes, type CaseNote, type InsertCaseNote, documents, type Document, type InsertDocument } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createMasterData(data: InsertMasterData & { createdBy: number }): Promise<MasterData>;
  getAllMasterData(): Promise<MasterData[]>;
  getMasterDataById(id: number): Promise<MasterData | undefined>;
  getMasterDataByMemberId(memberId: number): Promise<MasterData[]>;
  createPersonInfo(data: InsertPersonInfo & { createdBy: number }): Promise<PersonInfo>;
  getAllPersonInfo(): Promise<PersonInfo[]>;
  getPersonInfoById(id: number): Promise<PersonInfo | undefined>;
  createCaseNote(data: InsertCaseNote & { createdBy: number }): Promise<CaseNote>;
  getCaseNotesByMemberId(memberId: number): Promise<CaseNote[]>;
  createDocument(data: InsertDocument & { createdBy: number, filename: string }): Promise<Document>;
  getDocumentsByMemberId(memberId: number): Promise<Document[]>;
  getDocumentById(id: number): Promise<Document | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private masterData: Map<number, MasterData>;
  private personInfo: Map<number, PersonInfo>;
  private caseNotes: Map<number, CaseNote>;
  private documents: Map<number, Document>;
  userCurrentId: number;
  masterDataCurrentId: number;
  personInfoCurrentId: number;
  caseNoteCurrentId: number;
  documentCurrentId: number;

  constructor() {
    this.users = new Map();
    this.masterData = new Map();
    this.personInfo = new Map();
    this.caseNotes = new Map();
    this.documents = new Map();
    this.userCurrentId = 1;
    this.masterDataCurrentId = 1;
    this.personInfoCurrentId = 1;
    this.caseNoteCurrentId = 1;
    this.documentCurrentId = 1;
  }

  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.userCurrentId++;
    const user: User = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  async createMasterData(data: InsertMasterData & { createdBy: number }): Promise<MasterData> {
    const id = this.masterDataCurrentId++;
    const newMasterData: MasterData = { 
      ...data, 
      id,
      description: data.description || null,
      serviceProvider: data.serviceProvider || "",
      notes: data.notes || null,
      active: data.active ?? true,
      memberId: data.memberId || null
    };
    this.masterData.set(id, newMasterData);
    return newMasterData;
  }

  async getAllMasterData(): Promise<MasterData[]> {
    return Array.from(this.masterData.values());
  }

  async getMasterDataById(id: number): Promise<MasterData | undefined> {
    return this.masterData.get(id);
  }

  async getMasterDataByMemberId(memberId: number): Promise<MasterData[]> {
    return Array.from(this.masterData.values()).filter(
      (data) => data.memberId === memberId
    );
  }

  async createPersonInfo(data: InsertPersonInfo & { createdBy: number }): Promise<PersonInfo> {
    const id = this.personInfoCurrentId++;
    const newPersonInfo: PersonInfo = { 
      ...data, 
      id,
      middleName: data.middleName || null,
      homePhone: data.homePhone || null,
      addressLine2: data.addressLine2 || null,
      addressLine3: data.addressLine3 || null,
      useMailingAddress: data.useMailingAddress ?? false,
      mailingAddressLine1: data.mailingAddressLine1 || null,
      mailingAddressLine2: data.mailingAddressLine2 || null,
      mailingAddressLine3: data.mailingAddressLine3 || null,
      mailingPostCode: data.mailingPostCode || null,
      nokName: data.nokName || null,
      nokRelationship: data.nokRelationship || null,
      nokPhone: data.nokPhone || null,
      nokEmail: data.nokEmail || null,
      nokAddress: data.nokAddress || null,
      hcpLevel: data.hcpLevel || null,
      hcpStartDate: data.hcpStartDate || null,
      hcpEndDate: data.hcpEndDate || null
    };
    this.personInfo.set(id, newPersonInfo);
    return newPersonInfo;
  }

  async getAllPersonInfo(): Promise<PersonInfo[]> {
    return Array.from(this.personInfo.values());
  }

  async getPersonInfoById(id: number): Promise<PersonInfo | undefined> {
    return this.personInfo.get(id);
  }

  async createCaseNote(data: InsertCaseNote & { createdBy: number }): Promise<CaseNote> {
    const id = this.caseNoteCurrentId++;
    // Create with current timestamp
    const newCaseNote: CaseNote = {
      ...data,
      id,
      createdAt: new Date()
    };
    this.caseNotes.set(id, newCaseNote);
    return newCaseNote;
  }

  async getCaseNotesByMemberId(memberId: number): Promise<CaseNote[]> {
    return Array.from(this.caseNotes.values())
      .filter(note => note.memberId === memberId)
      .sort((a, b) => {
        // Sort by newest first
        if (a.createdAt && b.createdAt) {
          return b.createdAt.getTime() - a.createdAt.getTime();
        }
        return 0;
      });
  }

  async createDocument(data: InsertDocument & { createdBy: number, filename: string }): Promise<Document> {
    const id = this.documentCurrentId++;
    const newDocument: Document = {
      ...data,
      id,
      uploadedAt: new Date()
    };
    this.documents.set(id, newDocument);
    return newDocument;
  }

  async getDocumentsByMemberId(memberId: number): Promise<Document[]> {
    return Array.from(this.documents.values())
      .filter(doc => doc.memberId === memberId)
      .sort((a, b) => {
        // Sort by newest first
        if (a.uploadedAt && b.uploadedAt) {
          return b.uploadedAt.getTime() - a.uploadedAt.getTime();
        }
        return 0;
      });
  }

  async getDocumentById(id: number): Promise<Document | undefined> {
    return this.documents.get(id);
  }
}

export const storage = new MemStorage();
