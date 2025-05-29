import { z } from "zod";

// Define only types and schemas for client-side usage
export type User = {
  id: number;
  username: string;
  password: string;
  role: string;
  name: string;
  company_id?: number;
  created_at?: Date;
  password_changed_at?: Date;
  force_password_change?: boolean;
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
  useHomeAddress?: boolean;  nextOfKinName?: string;
  nextOfKinRelationship?: string;
  nextOfKinAddress?: string;
  nextOfKinEmail?: string;
  nextOfKinPhoneCountryCode?: string;  nextOfKinPhone?: string;
  hcpLevel: string;
  hcpStartDate: string;
  status?: string;
  createdBy?: number;
  createdAt?: Date;
  updatedAt?: Date;
  segmentId?: number;
};

export type Document = {
  id: number;
  clientId: number;
  documentName: string;
  documentType: string;
  filename: string;
  filePath?: string;
  uploadedAt?: Date;
  createdBy?: number;
  segmentId?: number;
};

export type ClientService = {
  id: number;
  clientId: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  serviceStartDate: string;
  serviceDays: string[];
  serviceHours: number;
  status?: string;
  createdAt?: Date;
  createdBy?: number;
  segmentId?: number;
};

export type ServiceCaseNote = {
  id: number;
  serviceId: number;
  noteText: string;
  createdAt?: Date;
  updatedAt?: Date;
  createdBy: number;
  updatedBy: number;
  documents?: Document[]; // Optional array of attached documents
};

export type CaseNoteDocument = {
  id: number;
  caseNoteId: number;
  documentId: number;
  createdAt?: Date;
  createdBy: number;
};

export type MasterData = {
  id: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  active: boolean;
  createdBy?: number;
  createdAt?: Date;
  segmentId?: number;
};

export type Company = {
  company_id: number;
  company_name: string;
  registered_address: string;
  postal_address: string;
  contact_person_name: string;
  contact_person_phone: string;
  contact_person_email: string;
  created_at?: Date;
  created_by?: number;
};

export type Segment = {
  id: number;
  segment_name: string;
  company_id: number;
  created_at?: Date;
  created_by?: number;
};

// New types for creating records (without auto-generated fields)
export type NewCompany = {
  company_name: string;
  registered_address: string;
  postal_address: string;
  contact_person_name: string;
  contact_person_phone: string;
  contact_person_email: string;
  created_by?: number;
};

export type NewSegment = {
  segment_name: string;
  company_id: number;
  created_by?: number;
};

export type NewClientService = {
  clientId: number;
  serviceCategory: string;
  serviceType: string;
  serviceProvider: string;
  serviceStartDate: string;
  serviceDays: string[];
  serviceHours: number;
  status?: string;
  createdBy?: number;
  segmentId?: number;
};

// Export zod schemas if needed for validation on client
export const insertUserSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "user"]).default("user"),
  company_id: z.number().optional(),
});

export const insertPersonInfoSchema = z.object({
  title: z.string().min(1, "Title is required"),  
  firstName: z.string().min(1, "First name is required"),
  middleName: z.string().optional().default(""),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string()
    .regex(/^\d{2}-\d{2}-\d{4}$/, "Date must be in DD-MM-YYYY format")
    .refine((date) => {
      // Parse DD-MM-YYYY format
      const [day, month, year] = date.split('-').map(Number);
      const parsedDate = new Date(year, month - 1, day);
      return !isNaN(parsedDate.getTime()) && 
        parsedDate.getDate() === day &&
        parsedDate.getMonth() === month - 1 &&
        parsedDate.getFullYear() === year;
    }, "Invalid date format"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
  homePhone: z.string().optional().or(z.literal("")),
  mobilePhone: z.string().optional().or(z.literal("")),
  addressLine1: z.string().min(1, "Address Line 1 is required"),
  addressLine2: z.string().optional().or(z.literal("")),
  addressLine3: z.string().optional().or(z.literal("")),
  postCode: z.string().optional().or(z.literal("")),
  mailingAddressLine1: z.string().optional().or(z.literal("")),
  mailingAddressLine2: z.string().optional().or(z.literal("")),
  mailingAddressLine3: z.string().optional().or(z.literal("")),
  mailingPostCode: z.string().optional().or(z.literal("")),
  useHomeAddress: z.boolean().optional(),  nextOfKinName: z.string().optional().or(z.literal("")),
  nextOfKinRelationship: z.string().optional().or(z.literal("")),
  nextOfKinAddress: z.string().optional().or(z.literal("")),
  nextOfKinEmail: z.string().email().optional().or(z.literal("")),  
  nextOfKinPhone: z.string().optional().or(z.literal("")),
  hcpLevel: z.string().min(1, "HCP Level is required"),
  hcpStartDate: z.string().min(1, "HCP Start Date is required"),
  status: z.string().optional(),
  segmentId: z.number().nullable().optional()
});

export const insertDocumentSchema = z.object({
  clientId: z.number({
    required_error: "Client ID is required",
  }),
  documentName: z.string({
    required_error: "Document name is required",
  }).min(1, "Document name is required"),
  documentType: z.string({
    required_error: "Document type is required",
  }).min(1, "Document type is required"),
  filePath: z.string().optional(),
  segmentId: z.number().optional().nullable()
});

export const insertClientServiceSchema = z.object({
  clientId: z.number({
    required_error: "Client ID is required",
  }),
  serviceCategory: z.string({
    required_error: "Service Category is required",
  }),
  serviceType: z.string({
    required_error: "Service Type is required",
  }),
  serviceProvider: z.string({
    required_error: "Service Provider is required",  }),
  serviceStartDate: z.string({
    required_error: "Start date is required",
  }),  serviceDays: z.array(z.string()).min(1, "At least one service day is required"),
  serviceHours: z.number().refine(val => val >= 0.5 && val <= 24, {
    message: "Service hours must be between 0.5 and 24"
  }),
  status: z.string().optional(),
  createdBy: z.number().optional(),
  createdAt: z.date().optional(),
  segmentId: z.number().optional().nullable()
});

export const insertServiceCaseNoteSchema = z.object({
  serviceId: z.number(),
  noteText: z.string(),
  createdBy: z.number(),
  documentIds: z.array(z.number()).optional(), // Optional array of document IDs to attach
});

export const insertMasterDataSchema = z.object({
  serviceCategory: z.string({ required_error: "Please select a service category" }),
  serviceType: z.string({ required_error: "Please select a service type" }),
  serviceProvider: z.string({ required_error: "Please select or enter a service provider" }),
  active: z.boolean().default(true),
  createdBy: z.number().optional(),
  segmentId: z.number().nullable().optional(),
});

export const insertCompanySchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  registered_address: z.string().min(1, "Registered address is required"),
  postal_address: z.string().min(1, "Postal address is required"),
  contact_person_name: z.string().min(1, "Contact person name is required"),
  contact_person_phone: z.string()
    .min(1, "Contact person phone is required")
    .regex(/^\d{10}$/, "Phone number must be exactly 10 digits without any symbols"),
  contact_person_email: z.string().email("Invalid email address"),
  created_by: z.number().optional()
});

export const insertSegmentSchema = z.object({
  segment_name: z.string().min(1, "Segment name is required"),
  company_id: z.number({ required_error: "Company ID is required" }),
  created_by: z.number().optional()
});
