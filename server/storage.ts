import { users, type User, type InsertUser, masterData, type MasterData, type InsertMasterData, personInfo, type PersonInfo, type InsertPersonInfo, caseNotes, type CaseNote, type InsertCaseNote } from "@shared/schema";

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
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private masterData: Map<number, MasterData>;
  private personInfo: Map<number, PersonInfo>;
  private caseNotes: Map<number, CaseNote>;
  userCurrentId: number;
  masterDataCurrentId: number;
  personInfoCurrentId: number;
  caseNoteCurrentId: number;

  constructor() {
    this.users = new Map();
    this.masterData = new Map();
    this.personInfo = new Map();
    this.caseNotes = new Map();
    this.userCurrentId = 1;
    this.masterDataCurrentId = 1;
    this.personInfoCurrentId = 1;
    this.caseNoteCurrentId = 1;
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
    const newPersonInfo: PersonInfo = { ...data, id };
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
}

export const storage = new MemStorage();
