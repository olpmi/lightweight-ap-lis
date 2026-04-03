import { z } from 'zod';

export const createEmployeeSchema = z.object({
  lastName: z.string().min(1, 'Last name is required').max(100),
  firstName: z.string().min(1, 'First name is required').max(100),
  userName: z
    .string()
    .min(1, 'Username is required')
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, hyphens, underscores'),
  employeeRoleId: z.number().int().positive('Employee role is required'),
});

export const loginSchema = z.union([
  z.object({
    employeeId: z.number().int().positive(),
    newEmployee: z.undefined().optional(),
  }),
  z.object({
    employeeId: z.undefined().optional(),
    newEmployee: createEmployeeSchema,
  }),
]);

export const createSpecimenSchema = z.object({
  bodySiteId: z.number().int().positive().optional(),
  specimenTypeId: z.number().int().positive().optional(),
});

export const createOrderSchema = z.object({
  // Patient - either existing patientId or new patient fields
  patientId: z.string().max(50).optional(),
  patientLastName: z.string().max(100).optional(),
  patientFirstName: z.string().max(100).optional(),
  patientDateOfBirth: z.string().optional(),
  patientSex: z.string().max(20).optional(),

  // Doctor - either existing doctorId or new doctor fields
  doctorId: z.number().int().positive().optional(),
  doctorLastName: z.string().max(100).optional(),
  doctorFirstName: z.string().max(100).optional(),

  caseType: z.string().max(50).optional(),
  clinicalHistory: z.string().optional(),
  registeredDate: z.string().optional(),

  specimens: z.array(createSpecimenSchema).min(1, 'At least one specimen is required'),
});

export const createBlocksSchema = z.object({
  count: z.number().int().min(1, 'At least 1 block required').max(50),
});

export const createSlidesSchema = z.object({
  count: z.number().int().min(1, 'At least 1 slide required').max(100),
  slideType: z.string().max(50).optional(),
});

export const createDraftReportSchema = z.object({
  diagnosis: z.string().optional(),
  comment: z.string().optional(),
  reportTemplateId: z.number().int().positive().optional(),
  gross: z.string().optional(),
  synopticData: z.string().optional(),
  pathologistEmployeeId: z.number().int().positive().optional(),
});

export const signOutReportSchema = z.object({
  diagnosis: z.string().min(1, 'Diagnosis is required for sign-out'),
  comment: z.string().optional(),
  reportTemplateId: z.number().int().positive().optional(),
  gross: z.string().min(1, 'Gross description is required for sign-out'),
  synopticData: z.string().optional(),
  pathologistEmployeeId: z.number().int().positive('Pathologist is required for sign-out'),
});

export const reactivateOrderSchema = z.object({
  reactivationType: z.enum(['revise', 'addend']),
});

export const querySchema = z.object({
  orderId: z.string().optional(),
  patientId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateBlocksInput = z.infer<typeof createBlocksSchema>;
export type CreateSlidesInput = z.infer<typeof createSlidesSchema>;
export type CreateDraftReportInput = z.infer<typeof createDraftReportSchema>;
export type SignOutReportInput = z.infer<typeof signOutReportSchema>;
export type ReactivateOrderInput = z.infer<typeof reactivateOrderSchema>;
export type QueryInput = z.infer<typeof querySchema>;
