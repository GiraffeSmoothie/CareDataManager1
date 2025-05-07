import { z } from "zod";

// Define only types and schemas for client-side usage
export type User = {
  id: number;
  username: string;
  password: string;
  role: string;
  name: string;
};

export type PersonInfo = {
  id: number;
  title: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  homePhoneCountryCode?: string;
  homePhone?: string;
  mobilePhoneCountryCode?: string;
  mobilePhone: string;
  addressLine1: string;
  addressLine2?: string;
  addressLine3?: string;
  postCode: string;
  mailingAddressLine1?: string;
  mailingAddressLine2?: string;
  mailingAddressLine3?: string;
  mailingPostCode?: string;
  useHomeAddress?: boolean;
  nextOfKinName?: string;
  nextOfKinAddress?: string;
  nextOfKinEmail?: string;
  nextOfKinPhoneCountryCode?: string;
  nextOfKinPhone?: string;
  hcpLevel?: string;
  hcpEndDate?: string;
  status?: string;
};

export type Document = {
  id: number;
  memberId: number;
  documentName: string;
  documentType: string;
  filename: string;
  filePath?: string;
  uploadedAt?: Date;
  createdBy?: number;
};

export type MemberService = {
  id: number;
  memberId: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  serviceStartDate: string;
  serviceDays: string[];
  serviceHours: number;
  status?: string;
  createdAt?: Date;
  createdBy?: number;
};

export type ServiceCaseNote = {
  id: number;
  serviceId: number;
  noteText: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy: number;
  updatedBy: number;
};

export type MasterData = {
  id: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  active: boolean;
  createdBy?: number;
};

// Export zod schemas if needed for validation on client
export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "user"]).default("user"),
});

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

export const insertDocumentSchema = z.object({
  memberId: z.number({
    required_error: "Member ID is required",
  }),
  documentName: z.string({
    required_error: "Document name is required",
  }),
  documentType: z.string({
    required_error: "Document type is required",
  }),
  filePath: z.string().optional(),
});

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
});

export const insertServiceCaseNoteSchema = z.object({
  serviceId: z.number(),
  noteText: z.string(),
  createdBy: z.number(),
});

export const insertMasterDataSchema = z.object({
  serviceCategory: z.string({ required_error: "Please select a service category" }),
  serviceType: z.string({ required_error: "Please select a service type" }),
  serviceProvider: z.string({ required_error: "Please select or enter a service provider" }),
  active: z.boolean().default(true),
  createdBy: z.number().optional(),
});
