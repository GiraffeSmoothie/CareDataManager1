import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const masterData = pgTable("master_data", {
  id: serial("id").primaryKey(),
  careCategory: text("care_category").notNull(),
  careType: text("care_type").notNull(),
  description: text("description"),
  active: boolean("active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
});

// User schemas
export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

// Master data schemas
export const insertMasterDataSchema = createInsertSchema(masterData).omit({
  id: true,
  createdBy: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMasterData = z.infer<typeof insertMasterDataSchema>;
export type MasterData = typeof masterData.$inferSelect;

// Login session type
export interface Session {
  userId: number;
  username: string;
}
