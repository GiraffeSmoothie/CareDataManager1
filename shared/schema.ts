import { pgTable, text, serial, integer, boolean, jsonb, date } from "drizzle-orm/pg-core";
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

export const personInfo = pgTable("person_info", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  email: text("email").notNull(),
  contactNumber: text("contact_number").notNull(),
  address: text("address").notNull(),
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

// Person info schemas
export const insertPersonInfoSchema = createInsertSchema(personInfo).omit({
  id: true,
  createdBy: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMasterData = z.infer<typeof insertMasterDataSchema>;
export type MasterData = typeof masterData.$inferSelect;

export type InsertPersonInfo = z.infer<typeof insertPersonInfoSchema>;
export type PersonInfo = typeof personInfo.$inferSelect;

// Login session type
export interface Session {
  userId: number;
  username: string;
}
