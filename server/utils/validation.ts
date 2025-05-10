import { z } from 'zod';

// Common validation schemas
export const idSchema = z.number().int().positive();
export const emailSchema = z.string().email();
export const phoneSchema = z.string().regex(/^\+?[\d\s-()]+$/);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const nameSchema = z.string().min(1).max(100);

// Input validation for person info
export const personInfoSchema = z.object({
  title: z.string().min(1).max(10),
  firstName: nameSchema,
  middleName: nameSchema.optional(),
  lastName: nameSchema,
  dateOfBirth: dateSchema,
  email: emailSchema,
  homePhone: phoneSchema.optional(),
  mobilePhone: phoneSchema,
  addressLine1: z.string().min(1).max(100),
  addressLine2: z.string().optional(),
  addressLine3: z.string().optional(),
  postCode: z.string().min(1).max(20),
  status: z.enum(['Active', 'Inactive']).optional(),
});

// Input validation for user data
export const userSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8),
  name: nameSchema,
  role: z.enum(['admin', 'user']).optional(),
});

// Input validation for service data
export const serviceSchema = z.object({
  clientId: idSchema,
  serviceCategory: z.string().min(1),
  serviceType: z.string().min(1),
  serviceProvider: z.string().min(1),
  serviceStartDate: dateSchema,
  serviceDays: z.array(z.string()),
  serviceHours: z.number().int().min(1).max(24),
  status: z.enum(['Planned', 'In Progress', 'Closed']).optional(),
});

// Helper function to validate and sanitize input
export function validateAndSanitize<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}