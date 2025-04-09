import { pgTable, text, serial, integer, boolean, jsonb, date, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const personInfo = pgTable("person_info", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name").default(""),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  email: text("email").notNull(),
  homePhone: text("home_phone").default(""),
  mobilePhone: text("mobile_phone").notNull(),
  // Home Address
  addressLine1: text("address_line1").notNull(),
  addressLine2: text("address_line2").default(""),
  addressLine3: text("address_line3").default(""),
  postCode: text("post_code").notNull(),
  // Mailing Address
  mailingAddressLine1: text("mailing_address_line1").default(""),
  mailingAddressLine2: text("mailing_address_line2").default(""),
  mailingAddressLine3: text("mailing_address_line3").default(""),
  mailingPostCode: text("mailing_post_code").default(""),
  useHomeAddress: boolean("use_home_address").default(true),
  // Next of Kin Information
  nextOfKinName: text("next_of_kin_name").default(""),
  nextOfKinAddress: text("next_of_kin_address").default(""),
  nextOfKinEmail: text("next_of_kin_email").default(""),
  nextOfKinPhone: text("next_of_kin_phone").default(""),
  // HCP Information
  hcpLevel: text("hcp_level").default(""),
  hcpEndDate: text("hcp_end_date").default(""),
  createdBy: integer("created_by").references(() => users.id),
});

export const masterData = pgTable("master_data", {
  id: serial("id").primaryKey(),
  careCategory: text("care_category").notNull(),
  careType: text("care_type").notNull(),
  serviceProvider: text("service_provider").default(""),
  notes: text("notes").default(""),
  active: boolean("active").notNull().default(true),
  memberId: integer("member_id").references(() => personInfo.id),
  createdBy: integer("created_by").references(() => users.id),
});

export const caseNotes = pgTable("case_notes", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => personInfo.id).notNull(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => personInfo.id).notNull(),
  documentName: text("document_name").notNull(),
  documentType: text("document_type").notNull(),
  filename: text("filename").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
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

// Case notes schema
export const insertCaseNoteSchema = createInsertSchema(caseNotes).omit({
  id: true,
  createdAt: true,
  createdBy: true,
});

// Document schema
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
  createdBy: true,
  filename: true, // This will be handled by the server
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMasterData = z.infer<typeof insertMasterDataSchema>;
export type MasterData = typeof masterData.$inferSelect;

export type InsertPersonInfo = z.infer<typeof insertPersonInfoSchema>;
export type PersonInfo = typeof personInfo.$inferSelect;

export type InsertCaseNote = z.infer<typeof insertCaseNoteSchema>;
export type CaseNote = typeof caseNotes.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Login session type
export interface Session {
  userId: number;
  username: string;
}
