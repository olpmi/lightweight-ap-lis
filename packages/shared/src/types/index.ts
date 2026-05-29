// Domain types for the lightweight AP LIS

import type { AppLanguageCode } from '../templates/index.js';

export interface Doctor {
  doctorId: number;
  lastName: string;
  firstName: string;
}

export interface Patient {
  patientId: string;
  lastName: string;
  firstName: string;
  dateOfBirth: string; // ISO date string
  sex: string;
}

export interface EmployeeRole {
  employeeRoleId: number;
  roleName: string;
}

export interface Employee {
  employeeId: number;
  lastName: string;
  firstName: string;
  userName: string;
  employeeRoleId: number;
  defaultLanguage?: AppLanguageCode;
  employeeRole?: EmployeeRole;
}

export interface BodySite {
  bodySiteId: number;
  bodySiteName: string;
  description?: string | null;
}

export interface SpecimenType {
  specimenTypeId: number;
  specimenTypeName: string;
  description?: string | null;
}

export const REPORT_TEMPLATE_TYPES = ['final', 'preliminary', 'addendum', 'revision'] as const;
export type ReportTemplateType = (typeof REPORT_TEMPLATE_TYPES)[number];

export interface ReportTemplate {
  reportTemplateId: number;
  templateName: string;
  templateText?: string | null;
  isActive: boolean;
  type: ReportTemplateType;
}

export type OrderStatus = 'registered' | 'in_progress' | 'signed_out' | 'reactivated';

export interface Order {
  orderId: string;
  patientId: string;
  doctorId: number;
  caseType?: string | null;
  clinicalHistory?: string | null;
  registeredDate: string; // ISO datetime
  completedDate?: string | null;
  isReactivated: boolean;
  reactivatedFromReportId?: number | null;
  patient?: Patient;
  doctor?: Doctor;
}

export interface Specimen {
  specimenId: string;
  orderId: string;
  specimenCode: string;
  bodySiteId?: number | null;
  specimenTypeId?: number | null;
  bodySite?: BodySite;
  specimenType?: SpecimenType;
}

export interface Block {
  blockId: string;
  specimenId: string;
  blockNumber: number;
  createdDatetime?: string | null;
  discarded: boolean;
}

export interface Slide {
  slideId: string;
  blockId: string;
  slideNumber: number;
  slideType?: string | null;
  discarded: boolean;
}

export interface Report {
  reportId: number;
  orderId: string;
  versionNumber: number;
  diagnosis?: string | null;
  comment?: string | null;
  reportTemplateId?: number | null;
  gross?: string | null;
  grossPayload?: string | null;
  synopticPayload?: string | null;
  pathologistEmployeeId?: number | null;
  createdAt: string;
  signedOutDatetime?: string | null;
  isFinal: boolean;
  isPrelim: boolean;
  isAmendment: boolean;
  supersedesReportId?: number | null;
  pathologist?: Employee;
  reportTemplate?: ReportTemplate;
}

export interface ReportFile {
  reportFileId: number;
  reportId: number;
  fileType: string;
  fileName?: string | null;
  originalFileName?: string | null;
  mimeType: string;
  storagePath?: string | null;
  createdAt: string;
}

// DTO types (for API requests/responses)

export interface CreateOrderDto {
  patientId?: string;
  patientLastName?: string;
  patientFirstName?: string;
  patientDateOfBirth?: string;
  patientSex?: string;
  doctorId?: number;
  doctorLastName?: string;
  doctorFirstName?: string;
  caseType?: string;
  clinicalHistory?: string;
  registeredDate: string;
  specimens: CreateSpecimenDto[];
}

export interface CreateSpecimenDto {
  bodySiteId?: number;
  specimenTypeId?: number;
}

export interface CreateBlockDto {
  count: number;
}

export interface CreateSlideDto {
  count: number;
  slideType?: string;
}

export interface LoginDto {
  employeeId?: number;
  newEmployee?: CreateEmployeeDto;
}

export interface CreateEmployeeDto {
  lastName: string;
  firstName: string;
  userName: string;
  employeeRoleId: number;
  defaultLanguage?: AppLanguageCode;
}

export interface CreateDraftReportDto {
  diagnosis?: string;
  comment?: string;
  reportTemplateId?: number;
  gross?: string;
  grossPayload?: string;
  synopticPayload?: string;
  pathologistEmployeeId?: number;
}

export interface SignOutReportDto {
  diagnosis: string;
  comment?: string;
  reportTemplateId?: number;
  gross?: string;
  grossPayload?: string;
  synopticPayload?: string;
  pathologistEmployeeId: number;
}

export interface ReactivateOrderDto {
  isAmendment: boolean;
}

// API response wrapper
export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// Pagination
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderWithDetails extends Order {
  patient: Patient;
  doctor: Doctor;
  specimens: Specimen[];
  reports: Report[];
}

export interface OrderMaterials {
  specimens: Array<
    Specimen & {
      blocks: Array<Block & { slides: Slide[] }>;
    }
  >;
}

// ---------------------------------------------------------------------------
// Ancillary Testing
// ---------------------------------------------------------------------------

import type { AncillaryCategory, AncillaryOrderStatus } from '../constants/index.js';

export interface AncillaryOrderable {
  id: number;
  name: string;
  category: AncillaryCategory;
  isActive: boolean;
  sortOrder: number;
  panelItems?: Array<{ panelId: number }>;
}

export interface AncillaryPanelItem {
  panelId: number;
  orderableId: number;
  orderable?: AncillaryOrderable;
}

export interface AncillaryPanel {
  id: number;
  name: string;
  category: AncillaryCategory;
  isActive: boolean;
  sortOrder: number;
  items?: AncillaryPanelItem[];
}

export interface AncillaryOrder {
  id: number;
  orderId: string;
  blockId: string;
  orderableId: number;
  status: AncillaryOrderStatus;
  levelCount?: number | null;
  notes?: string | null;
  resultNotes?: string | null;
  orderedAt: string;
  inProgressAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  orderedById?: number | null;
  orderable?: AncillaryOrderable;
  orderedBy?: Employee;
  block?: {
    blockId: string;
    blockNumber: number;
    _count?: { slides: number };
    slides?: Array<{ slideId: string; slideNumber: number; discarded: boolean }>;
  } | null;
}

export interface CreateAncillaryOrderDto {
  orderId: string;
  blockId: string;
  orderableId: number;
  levelCount?: number;
  notes?: string;
}

export interface UpdateAncillaryOrderStatusDto {
  status: AncillaryOrderStatus;
  resultNotes?: string;
}

export interface CreateAncillaryOrderableDto {
  name: string;
  category: AncillaryCategory;
  sortOrder?: number;
}

export interface UpdateAncillaryOrderableDto {
  name?: string;
  category?: AncillaryCategory;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateAncillaryPanelDto {
  name: string;
  category: AncillaryCategory;
  orderableIds: number[];
  sortOrder?: number;
}

export interface UpdateAncillaryPanelDto {
  name?: string;
  category?: AncillaryCategory;
  orderableIds?: number[];
  sortOrder?: number;
  isActive?: boolean;
}
