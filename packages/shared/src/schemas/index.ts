import { z } from 'zod';
import { APP_LANGUAGE_CODES } from '../templates/index.js';
import { REPORT_TEMPLATE_TYPES } from '../types/index.js';
import { ANCILLARY_CATEGORIES, ANCILLARY_ORDER_STATUSES, SEX_OPTIONS } from '../constants/index.js';

const appLanguageSchema = z.enum(APP_LANGUAGE_CODES);
const sexSchema = z.enum(SEX_OPTIONS);

export const createEmployeeSchema = z.object({
  lastName: z.string().min(1, 'Last name is required').max(100),
  firstName: z.string().min(1, 'First name is required').max(100),
  userName: z
    .string()
    .min(1, 'Username is required')
    .max(100)
    .regex(/^[a-zA-Z0-9._-]+$/, 'Username may only contain letters, numbers, dots, hyphens, underscores'),
  employeeRoleId: z.number().int().positive('Employee role is required'),
  defaultLanguage: appLanguageSchema.default('en').optional(),
  // Password is required in production; optional in dev/demo environments.
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
});

export const updateEmployeeLanguageSchema = z.object({
  language: appLanguageSchema,
});

export const loginSchema = z.union([
  z.object({
    employeeId: z.number().int().positive(),
    // Password required in production; optional elsewhere.
    password: z.string().min(1, 'Password is required').optional(),
    newEmployee: z.undefined().optional(),
  }),
  z.object({
    employeeId: z.undefined().optional(),
    password: z.undefined().optional(),
    newEmployee: createEmployeeSchema,
  }),
]);

export const createSpecimenSchema = z.object({
  bodySiteId: z.number().int().positive('Body site is required'),
  specimenTypeId: z.number().int().positive().optional(),
  coldIschemicTime: z.number().int().min(0).optional(),
});

export const createOrderSchema = z.object({
  // Patient - either existing patientId or new patient fields
  patientId: z.string().max(50).optional(),
  patientLastName: z.string().max(100).optional(),
  patientFirstName: z.string().max(100).optional(),
  patientDateOfBirth: z.string().optional(),
  patientSex: sexSchema.optional(),

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
  grossPayload: z.string().optional(),
  synopticPayload: z.string().optional(),
  pathologistEmployeeId: z.number().int().positive().optional(),
  // Optimistic-locking token: ISO timestamp of the draft the client loaded.
  // When provided and an editable draft already exists, the update only
  // succeeds if the row's updatedAt still matches; otherwise -> 409 DRAFT_STALE.
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const signOutReportSchema = z.object({
  diagnosis: z.string().min(1, 'Diagnosis is required for sign-out'),
  comment: z.string().optional(),
  reportTemplateId: z.number().int().positive().optional(),
  gross: z.string().min(1, 'Gross description is required for sign-out'),
  grossPayload: z.string().optional(),
  synopticPayload: z.string().optional(),
  pathologistEmployeeId: z.number().int().positive('Pathologist is required for sign-out'),
  // Optimistic-locking token, see createDraftReportSchema.
  expectedUpdatedAt: z.string().datetime().optional(),
});

export const reactivateOrderSchema = z.object({
  reactivationType: z.enum(['revise', 'addend']),
  reactivationReason: z.string().min(1, 'Explanation is required').optional(),
});

export const createReportTemplateSchema = z.object({
  templateName: z.string().min(1, 'Template name is required').max(255),
  type: z.enum(REPORT_TEMPLATE_TYPES),
  templateText: z.string().optional(),
});

export const updateReportTemplateSchema = z.object({
  templateName: z.string().min(1).max(255).optional(),
  type: z.enum(REPORT_TEMPLATE_TYPES).optional(),
  templateText: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const querySchema = z.object({
  orderId: z.string().optional(),
  patientId: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
export type UpdateEmployeeLanguageInput = z.infer<typeof updateEmployeeLanguageSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type CreateBlocksInput = z.infer<typeof createBlocksSchema>;
export type CreateSlidesInput = z.infer<typeof createSlidesSchema>;
export type CreateDraftReportInput = z.infer<typeof createDraftReportSchema>;
export type SignOutReportInput = z.infer<typeof signOutReportSchema>;
export type ReactivateOrderInput = z.infer<typeof reactivateOrderSchema>;
export type CreateReportTemplateInput = z.infer<typeof createReportTemplateSchema>;
export type UpdateReportTemplateInput = z.infer<typeof updateReportTemplateSchema>;
export type QueryInput = z.infer<typeof querySchema>;

// ---------------------------------------------------------------------------
// Ancillary Testing Schemas
// ---------------------------------------------------------------------------

export const createAncillaryOrderSchema = z.object({
  orderId: z.string().min(1),
  blockId: z.string().min(1),
  orderableId: z.number().int().positive(),
  levelCount: z.number().int().min(1).max(20).optional(),
  notes: z.string().optional(),
});

export const updateAncillaryOrderStatusSchema = z.object({
  status: z.enum(ANCILLARY_ORDER_STATUSES),
  resultNotes: z.string().optional(),
});

export const createAncillaryOrderableSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(ANCILLARY_CATEGORIES),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateAncillaryOrderableSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(ANCILLARY_CATEGORIES).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createAncillaryPanelSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.enum(ANCILLARY_CATEGORIES),
  orderableIds: z.array(z.number().int().positive()).min(1),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateAncillaryPanelSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.enum(ANCILLARY_CATEGORIES).optional(),
  orderableIds: z.array(z.number().int().positive()).min(1).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const createAncillaryOrdersBatchSchema = z.object({
  orders: z.array(createAncillaryOrderSchema).min(1),
});

export type CreateAncillaryOrderInput = z.infer<typeof createAncillaryOrderSchema>;
export type UpdateAncillaryOrderStatusInput = z.infer<typeof updateAncillaryOrderStatusSchema>;
export type CreateAncillaryOrderableInput = z.infer<typeof createAncillaryOrderableSchema>;
export type UpdateAncillaryOrderableInput = z.infer<typeof updateAncillaryOrderableSchema>;
export type CreateAncillaryPanelInput = z.infer<typeof createAncillaryPanelSchema>;
export type UpdateAncillaryPanelInput = z.infer<typeof updateAncillaryPanelSchema>;
export type CreateAncillaryOrdersBatchInput = z.infer<typeof createAncillaryOrdersBatchSchema>;
