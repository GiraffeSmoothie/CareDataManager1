import { pgTable, text, serial, integer, boolean, jsonb, date, timestamp, InferModel } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  role: text("role").default("user"),
  name: text("name").default(""),
});

export const personInfo = pgTable("person_info", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  firstName: text("first_name").notNull(),
  middleName: text("middle_name").default(""),
  lastName: text("last_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  email: text("email").notNull(),
  homePhoneCountryCode: text("home_phone_country_code").default("+61"),
  homePhone: text("home_phone").default(""),
  mobilePhoneCountryCode: text("mobile_phone_country_code").default("+61"),
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
  nextOfKinPhoneCountryCode: text("next_of_kin_phone_country_code").default("+61"),
  nextOfKinPhone: text("next_of_kin_phone").default(""),
  // HCP Information
  hcpLevel: text("hcp_level").default(""),
  hcpEndDate: text("hcp_end_date").default(""),
  status: text("status").default("New"),
  createdBy: integer("created_by").references(() => users.id),
});

export const masterData = pgTable("master_data", {
  id: serial("id").primaryKey(),
  serviceCategory: text("service_category").notNull(),
  serviceType: text("service_type").notNull(),
  serviceProvider: text("service_provider").notNull(),  
  active: boolean("active").notNull().default(true),
  createdBy: integer("created_by").references(() => users.id),
});

export const documents = pgTable("documents", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => personInfo.id).notNull(),
  documentName: text("document_name").notNull(),
  documentType: text("document_type").notNull(),
  filename: text("filename").notNull(),
  filePath: text("file_path"),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const memberServices = pgTable("member_services", {
  id: serial("id").primaryKey(),
  memberId: integer("member_id").references(() => personInfo.id).notNull(),
  serviceCategory: text("service_category").notNull(),
  serviceType: text("service_type").notNull(),
  serviceProvider: text("service_provider").notNull(),
  serviceStartDate: date("service_start_date").notNull(),
  serviceDays: text("service_days").array().notNull(),
  serviceHours: integer("service_hours").notNull(),
  status: text("status").default("New"),
  createdAt: timestamp("created_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id),
});

export const serviceCaseNotes = pgTable("service_case_notes", {
  id: serial("id").primaryKey(),
  serviceId: integer("service_id").references(() => memberServices.id).notNull(),
  noteText: text("note_text").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: integer("created_by").notNull().references(() => users.id),
  updatedBy: integer("updated_by").notNull().references(() => users.id),
});

// User schemas
export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "user"]).default("user")
});

// Master data schemas
export const insertMasterDataSchema = z.object({
  serviceCategory: z.string({
    required_error: "Service Category is required",
  }),
  serviceType: z.string({
    required_error: "Service Type is required",
  }),
  serviceProvider: z.string({
    required_error: "Service Provider is required",
  }),
  active: z.boolean().default(true),
  createdBy: z.number().optional(),
});

// Person info schemas
export const insertPersonInfoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional().default(""),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format")
    .refine((date) => !isNaN(Date.parse(date)), "Invalid date format"),
  email: z.string().email("Invalid email address"),
  homePhoneCountryCode: z.string().default("+61"),
  homePhone: z.string().optional().default(""),
  mobilePhoneCountryCode: z.string().default("+61"),
  mobilePhone: z.string().min(10, "Mobile phone must be at least 10 digits"),
  addressLine1: z.string().min(1, "Address line 1 is required"),
  addressLine2: z.string().optional().default(""),
  addressLine3: z.string().optional().default(""),
  postCode: z.string().min(1, "Post code is required"),
  mailingAddressLine1: z.string().optional().default(""),
  mailingAddressLine2: z.string().optional().default(""),
  mailingAddressLine3: z.string().optional().default(""),
  mailingPostCode: z.string().optional().default(""),
  useHomeAddress: z.boolean().default(true),
  nextOfKinName: z.string().optional().default(""),
  nextOfKinAddress: z.string().optional().default(""),
  nextOfKinEmail: z.string().email("Invalid email address").optional().default(""),
  nextOfKinPhoneCountryCode: z.string().default("+61"),
  nextOfKinPhone: z.string().optional().default(""),
  hcpLevel: z.string().optional().default(""),
  hcpEndDate: z.string().optional().default(""),
  status: z.enum(["New", "Active", "Paused", "Closed"]).default("New"),
});

// Document schema
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  uploadedAt: true,
  createdBy: true,
  filename: true, // This will be handled by the server
});

// Member services schema
export const insertMemberServiceSchema = z.object({
  memberId: z.number({
    required_error: "Member ID is required",
  }),
  serviceCategory: z.string({
    required_error: "Service Category is required",
  }),
  serviceType: z.string({
    required_error: "Service Type is required",
  }),
  serviceProvider: z.string({
    required_error: "Service Provider is required",
  }),
  serviceStartDate: z.string({
    required_error: "Start date is required",
  }),
  serviceDays: z.array(z.string()).min(1, "At least one service day is required"),
  serviceHours: z.number()
    .min(1, "Hours must be at least 1")
    .max(24, "Hours cannot exceed 24"),
  status: z.enum(["Planned", "In Progress", "Closed"]).default("Planned"),
  createdBy: z.number().optional(),
});

// Service case notes schema
export const insertServiceCaseNoteSchema = z.object({
  serviceId: z.number(),
  noteText: z.string(),
  createdBy: z.number()
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export type InsertMasterData = z.infer<typeof insertMasterDataSchema>;
export type MasterData = {
  id: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider?: string;
  active: boolean;
  createdBy: number;
  createdAt?: Date;
};

export type InsertPersonInfo = z.infer<typeof insertPersonInfoSchema>;
export type PersonInfo = typeof personInfo.$inferSelect;

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export type InsertMemberService = z.infer<typeof insertMemberServiceSchema>;
export type MemberService = typeof memberServices.$inferSelect;

export type ServiceCaseNote = typeof serviceCaseNotes.$inferSelect;
export type InsertServiceCaseNote = typeof serviceCaseNotes.$inferInsert;

export type NewServiceCaseNote = InferModel<typeof serviceCaseNotes, 'insert'>;

// Login session type
export interface Session {
  userId: number;
  username: string;
}
