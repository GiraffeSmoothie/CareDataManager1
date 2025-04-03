import { users, type User, type InsertUser, masterData, type MasterData, type InsertMasterData } from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  createMasterData(data: InsertMasterData & { createdBy: number }): Promise<MasterData>;
  getAllMasterData(): Promise<MasterData[]>;
  getMasterDataById(id: number): Promise<MasterData | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User>;
  private masterData: Map<number, MasterData>;
  userCurrentId: number;
  masterDataCurrentId: number;

  constructor() {
    this.users = new Map();
    this.masterData = new Map();
    this.userCurrentId = 1;
    this.masterDataCurrentId = 1;
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
    const newMasterData: MasterData = { ...data, id };
    this.masterData.set(id, newMasterData);
    return newMasterData;
  }

  async getAllMasterData(): Promise<MasterData[]> {
    return Array.from(this.masterData.values());
  }

  async getMasterDataById(id: number): Promise<MasterData | undefined> {
    return this.masterData.get(id);
  }
}

export const storage = new MemStorage();
