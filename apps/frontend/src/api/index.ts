import apiClient from './client';
import type {
  AppLanguageCode,
  Block,
  BodySite,
  CreateEmployeeDto,
  CreateOrderDto,
  Doctor,
  Employee,
  EmployeeRole,
  Order,
  OrderMaterials,
  OrderWithDetails,
  PaginatedResult,
  Patient,
  PatientSummaryCatalogEntry,
  PatientSummaryDefinition,
  PatientSummaryLanguageCode,
  PatientSummaryValues,
  Report,
  ReportTemplate,
  ReportTemplateType,
  ResolvedPatientSummary,
  Slide,
  Specimen,
  SpecimenType,
  TemplateCatalogEntry,
  TemplateDefinition,
  TemplateKind,
  AncillaryOrderable,
  AncillaryPanel,
  AncillaryOrder,
  AncillaryCategory,
  AncillaryOrderStatus,
  DataImportEntity,
  ImportPreview,
  ImportResult,
} from '@lis/shared';

// Queue rows include patient, doctor, and specimens (with body-site / specimen-type)
// but not reports. Defined locally so consumers get autocompletion on the common fields.
export interface QueueOrder extends Order {
  patient: Patient;
  doctor: Doctor;
  specimens: Array<Specimen & { bodySite?: BodySite; specimenType?: SpecimenType }>;
}

export interface HistologyQueueOrder extends QueueOrder {
  specimens: Array<
    Specimen & {
      bodySite?: BodySite;
      specimenType?: SpecimenType;
      blocks: Array<Block & { slides: Slide[] }>;
    }
  >;
}

export interface CreateDoctorPayload {
  lastName: string;
  firstName: string;
}

export interface CreateDraftReportPayload {
  diagnosis?: string;
  comment?: string;
  reportTemplateId?: number;
  gross?: string;
  grossPayload?: string;
  synopticPayload?: string;
  pathologistEmployeeId?: number;
  // ISO timestamp of the draft as the client loaded it. When the server still
  // sees that timestamp the update succeeds; otherwise it returns 409 DRAFT_STALE.
  expectedUpdatedAt?: string;
}

export interface SignOutReportPayload {
  diagnosis: string;
  comment?: string;
  reportTemplateId?: number;
  gross?: string;
  grossPayload?: string;
  synopticPayload?: string;
  pathologistEmployeeId: number;
  expectedUpdatedAt?: string;
}

export interface SessionEmployee {
  employeeId: number;
  userName: string;
  role: string;
  defaultLanguage: AppLanguageCode;
}

export interface AppMeta {
  /** True when this deployment holds synthetic demo data, not real records. */
  demoMode: boolean;
}

export const metaApi = {
  // Unauthenticated, so the login page can render the demo notice too.
  get: (): Promise<AppMeta> =>
    apiClient.get<{ data: AppMeta }>('/meta').then((r) => r.data.data),
};

export const authApi = {
  login: (payload: { employeeId?: number; newEmployee?: CreateEmployeeDto }) =>
    apiClient.post<{ data: Employee }>('/auth/login', payload).then((r) => r.data.data),

  logout: () => apiClient.post('/auth/logout'),

  me: () =>
    apiClient.get<{ data: SessionEmployee }>('/auth/me').then((r) => r.data.data),
};

export const lookupApi = {
  bodySites: (): Promise<BodySite[]> =>
    apiClient.get<{ data: BodySite[] }>('/lookups/body-sites').then((r) => r.data.data),
  specimenTypes: (): Promise<SpecimenType[]> =>
    apiClient.get<{ data: SpecimenType[] }>('/lookups/specimen-types').then((r) => r.data.data),
  reportTemplates: (): Promise<ReportTemplate[]> =>
    apiClient.get<{ data: ReportTemplate[] }>('/lookups/report-templates').then((r) => r.data.data),
  templateCatalog: (params?: { language?: AppLanguageCode; kind?: TemplateKind }) => {
    const query = new URLSearchParams();
    if (params?.language) query.set('language', params.language);
    if (params?.kind) query.set('kind', params.kind);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get<{ data: TemplateCatalogEntry[] }>(`/lookups/template-catalog${suffix}`).then((r) => r.data.data);
  },
  templateDefinition: (templateKey: string, language?: AppLanguageCode) => {
    const query = new URLSearchParams({ templateKey });
    if (language) query.set('language', language);
    return apiClient
      .get<{ data: TemplateDefinition }>(`/lookups/template-definition?${query.toString()}`)
      .then((r) => r.data.data);
  },
  patientSummaryDefinition: (templateId: string, language?: AppLanguageCode) => {
    const query = new URLSearchParams({ templateId });
    if (language) query.set('language', language);
    return apiClient
      .get<{ data: PatientSummaryDefinition }>(`/lookups/patient-summary-definition?${query.toString()}`)
      .then((r) => r.data.data);
  },
  patientSummaryCatalog: (language?: PatientSummaryLanguageCode): Promise<PatientSummaryCatalogEntry[]> => {
    const query = new URLSearchParams();
    if (language) query.set('language', language);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiClient
      .get<{ data: PatientSummaryCatalogEntry[] }>(`/lookups/patient-summary-catalog${suffix}`)
      .then((r) => r.data.data);
  },
  patientSummaryResolve: (
    templateId: string,
    language: PatientSummaryLanguageCode,
    values: PatientSummaryValues,
  ): Promise<ResolvedPatientSummary | null> =>
    apiClient
      .post<{ data: ResolvedPatientSummary | null }>('/lookups/patient-summary-resolve', { templateId, language, values })
      .then((r) => r.data.data),
  employeeRoles: (): Promise<EmployeeRole[]> =>
    apiClient.get<{ data: EmployeeRole[] }>('/lookups/employee-roles').then((r) => r.data.data),
};

export const employeeApi = {
  search: (q: string): Promise<Employee[]> =>
    apiClient.get<{ data: Employee[] }>(`/employees/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
  create: (data: CreateEmployeeDto): Promise<Employee> =>
    apiClient.post<{ data: Employee }>('/employees', data).then((r) => r.data.data),
  updateLanguage: (employeeId: number, language: string): Promise<void> =>
    apiClient.patch(`/employees/${employeeId}/language`, { language }).then(() => undefined),
};

export const doctorApi = {
  search: (q: string): Promise<Doctor[]> =>
    apiClient.get<{ data: Doctor[] }>(`/doctors/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
  create: (data: CreateDoctorPayload): Promise<Doctor> =>
    apiClient.post<{ data: Doctor }>('/doctors', data).then((r) => r.data.data),
};

export const patientApi = {
  search: (q: string): Promise<Patient[]> =>
    apiClient.get<{ data: Patient[] }>(`/patients/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
};

export const orderApi = {
  create: (data: CreateOrderDto): Promise<OrderWithDetails> =>
    apiClient.post<{ data: OrderWithDetails }>('/orders', data).then((r) => r.data.data),

  get: (orderId: string): Promise<OrderWithDetails> =>
    apiClient.get<{ data: OrderWithDetails }>(`/orders/${orderId}`).then((r) => r.data.data),

  list: (page = 1, pageSize = 20): Promise<PaginatedResult<QueueOrder>> =>
    apiClient.get<PaginatedResult<QueueOrder>>(`/orders?page=${page}&pageSize=${pageSize}`).then((r) => r.data),

  query: (params: { orderId?: string; patientId?: string; page?: number; pageSize?: number }): Promise<PaginatedResult<QueueOrder>> => {
    const qs = new URLSearchParams();
    if (params.orderId) qs.set('orderId', params.orderId);
    if (params.patientId) qs.set('patientId', params.patientId);
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    return apiClient.get<PaginatedResult<QueueOrder>>(`/orders/query?${qs}`).then((r) => r.data);
  },

  processingQueue: (page = 1, pageSize = 20, showAll = false, search = ''): Promise<PaginatedResult<QueueOrder>> =>
    apiClient
      .get<PaginatedResult<QueueOrder>>(`/orders/processing-queue?page=${page}&pageSize=${pageSize}&showAll=${showAll}&search=${encodeURIComponent(search)}`)
      .then((r) => r.data),

  resultQueue: (page = 1, pageSize = 20, search = ''): Promise<PaginatedResult<QueueOrder>> =>
    apiClient
      .get<PaginatedResult<QueueOrder>>(`/orders/result-queue?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`)
      .then((r) => r.data),

  histologyQueue: (page = 1, pageSize = 50, search = '', status = 'MICROTOMY', since?: string): Promise<PaginatedResult<HistologyQueueOrder>> => {
    const qs = new URLSearchParams();
    qs.set('page', String(page));
    qs.set('pageSize', String(pageSize));
    qs.set('search', search);
    qs.set('heStatus', status);
    if (since) qs.set('since', since);
    return apiClient
      .get<PaginatedResult<HistologyQueueOrder>>(`/orders/histology-queue?${qs.toString()}`)
      .then((r) => r.data);
  },

  materials: (orderId: string): Promise<{ data: OrderMaterials }> =>
    apiClient.get<{ data: OrderMaterials }>(`/orders/${orderId}/materials`).then((r) => r.data),

  worksheetPdfUrl: (orderId: string) => `/api/orders/${orderId}/worksheet-pdf`,
  referenceStripsPdfUrl: (orderId: string) => `/api/orders/${orderId}/reference-strips-pdf`,

  previewReportPdf: async (
    orderId: string,
    payload: { diagnosis: string; comment?: string; gross?: string; pathologistName?: string },
  ): Promise<void> => {
    const response = await apiClient.post<Blob>(
      `/orders/${orderId}/preview-report-pdf`,
      payload,
      { responseType: 'blob' },
    );
    const url = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
    window.open(url, '_blank');
    // Revoke after a short delay to free memory once the tab has had time to load.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },

  updateClinicalHistory: (orderId: string, clinicalHistory: string | null): Promise<{ data: Order }> =>
    apiClient.patch<{ data: Order }>(`/orders/${orderId}/clinical-history`, { clinicalHistory }).then((r) => r.data),

  updateStatus: (orderId: string, status: string): Promise<{ success: boolean; data: { status: string } }> =>
    apiClient
      .patch<{ success: boolean; data: { status: string } }>(`/orders/${orderId}/status`, { status })
      .then((r) => r.data),

  // --- Edit lock --------------------------------------------------------
  acquireLock: (orderId: string): Promise<OrderLockState> =>
    apiClient
      // Lock 409s are handled inline by useOrderLock — don't fire the global toast.
      .post<{ data: OrderLockState }>(`/orders/${orderId}/lock`, undefined, {
        headers: { 'x-silent-conflict': '1' },
      })
      .then((r) => r.data.data),

  getLock: (orderId: string): Promise<OrderLockState> =>
    apiClient.get<{ data: OrderLockState }>(`/orders/${orderId}/lock`).then((r) => r.data.data),

  releaseLock: (orderId: string): Promise<void> =>
    apiClient.delete(`/orders/${orderId}/lock`).then(() => undefined),
};

export interface OrderLockState {
  orderId: string;
  editingEmployeeId: number | null;
  editingEmployeeName: string | null;
  editingExpiresAt: string | null;
  ownedByRequester: boolean;
}

export const specimenApi = {
  createBlocks: (specimenId: string, count: number): Promise<Block[]> =>
    apiClient
      .post<{ data: Block[] }>(`/specimens/${specimenId}/blocks`, { count })
      .then((r) => r.data.data),
};

export const blockApi = {
  createSlides: (blockId: string, count: number, slideType?: string, opts?: { silentConflict?: boolean }): Promise<Slide[]> =>
    apiClient
      .post<{ data: Slide[] }>(
        `/blocks/${blockId}/slides`,
        { count, slideType },
        opts?.silentConflict ? { headers: { 'x-silent-conflict': '1' } } : undefined,
      )
      .then((r) => r.data.data),
  updateHeStatus: (blockId: string, status: string): Promise<Block> =>
    apiClient.patch<{ data: Block }>(`/blocks/${blockId}/he-status`, { status }).then((r) => r.data.data),
  discardBlock: (blockId: string): Promise<void> =>
    apiClient.patch(`/blocks/${blockId}/discard`).then(() => undefined),
  discardSlide: (blockId: string, slideId: string): Promise<void> =>
    apiClient.patch(`/blocks/${blockId}/slides/${slideId}/discard`).then(() => undefined),
};

export const reportApi = {
  list: (orderId: string): Promise<Report[]> =>
    apiClient.get<{ data: Report[] }>(`/orders/${orderId}/reports`).then((r) => r.data.data),

  createDraft: (orderId: string, data: CreateDraftReportPayload): Promise<Report> =>
    apiClient.post<{ data: Report }>(`/orders/${orderId}/reports/draft`, data).then((r) => r.data.data),

  signOut: (reportId: number, data: SignOutReportPayload): Promise<Report> =>
    apiClient.post<{ data: Report }>(`/reports/${reportId}/signout`, data).then((r) => r.data.data),

  signPrelim: (reportId: number, data: SignOutReportPayload): Promise<Report> =>
    apiClient.post<{ data: Report }>(`/reports/${reportId}/signprelim`, data).then((r) => r.data.data),

  reactivate: (orderId: string, reactivationType: 'revise' | 'addend', reactivationReason: string): Promise<Order> =>
    apiClient
      .post<{ data: Order }>(`/orders/${orderId}/reactivate`, { reactivationType, reactivationReason })
      .then((r) => r.data.data),

  pdfUrl: (reportId: number) => `/api/reports/${reportId}/pdf`,
  patientSummaryPdfUrl: (reportId: number, language: AppLanguageCode) =>
    `/api/reports/${reportId}/patient-summary.pdf?language=${encodeURIComponent(language)}`,
  patientSummaryPdfDownloadUrl: (reportId: number, language: AppLanguageCode) =>
    `/api/reports/${reportId}/patient-summary.pdf?language=${encodeURIComponent(language)}&download=1`,
};

export interface TemplateFilesResponse {
  coreJson: Record<string, unknown>;
  translations: Partial<Record<AppLanguageCode, Record<string, unknown>>>;
}

export interface SaveTemplatePayload {
  templateKey: string;
  family: string;
  kind: string;
  schemaStyle: string;
  title: string;
  coreJson: Record<string, unknown>;
  translations: Partial<Record<AppLanguageCode, Record<string, unknown>>>;
}

export const configApi = {
  listTemplates: (params?: { language?: AppLanguageCode; kind?: string }): Promise<TemplateCatalogEntry[]> => {
    const query = new URLSearchParams();
    if (params?.language) query.set('language', params.language);
    if (params?.kind) query.set('kind', params.kind);
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return apiClient.get<{ data: TemplateCatalogEntry[] }>(`/config/templates${suffix}`).then((r) => r.data.data);
  },

  getTemplateFiles: (templateKey: string): Promise<TemplateFilesResponse> => {
    const query = new URLSearchParams({ templateKey });
    return apiClient
      .get<{ data: TemplateFilesResponse }>(`/config/templates/files?${query.toString()}`)
      .then((r) => r.data.data);
  },

  updateTemplate: (payload: SaveTemplatePayload): Promise<void> =>
    apiClient.put('/config/templates/files', payload).then(() => undefined),

  createTemplate: (payload: SaveTemplatePayload): Promise<{ templateKey: string }> =>
    apiClient
      .post<{ data: { templateKey: string } }>('/config/templates/files', payload)
      .then((r) => r.data.data),
};

export interface CreateReportTemplatePayload {
  templateName: string;
  type: ReportTemplateType;
  templateText?: string;
}

export interface UpdateReportTemplatePayload {
  templateName?: string;
  type?: ReportTemplateType;
  templateText?: string;
  isActive?: boolean;
}

export const configReportTemplateApi = {
  list: (type?: ReportTemplateType): Promise<ReportTemplate[]> => {
    const suffix = type ? `?type=${encodeURIComponent(type)}` : '';
    return apiClient
      .get<{ data: ReportTemplate[] }>(`/config/report-templates${suffix}`)
      .then((r) => r.data.data);
  },

  create: (data: CreateReportTemplatePayload): Promise<ReportTemplate> =>
    apiClient
      .post<{ data: ReportTemplate }>('/config/report-templates', data)
      .then((r) => r.data.data),

  update: (id: number, data: UpdateReportTemplatePayload): Promise<ReportTemplate> =>
    apiClient
      .put<{ data: ReportTemplate }>(`/config/report-templates/${id}`, data)
      .then((r) => r.data.data),

  delete: (id: number): Promise<void> =>
    apiClient.delete(`/config/report-templates/${id}`).then(() => undefined),
};

// ---------------------------------------------------------------------------
// Report Layout API (PDF layout templates per report type)
// ---------------------------------------------------------------------------
export interface ReportLayout {
  reportLayoutId: number;
  reportType: 'final' | 'preliminary' | 'addendum' | 'revision';
  name: string;
  htmlTemplate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertReportLayoutPayload {
  reportType: 'final' | 'preliminary' | 'addendum' | 'revision';
  name: string;
  htmlTemplate: string;
  isActive?: boolean;
}

export const configReportLayoutApi = {
  list: (): Promise<ReportLayout[]> =>
    apiClient.get<ReportLayout[]>('/config/report-layouts').then((r) => r.data),

  get: (reportType: string): Promise<ReportLayout> =>
    apiClient.get<ReportLayout>(`/config/report-layouts/${reportType}`).then((r) => r.data),

  upsert: (payload: UpsertReportLayoutPayload): Promise<ReportLayout> =>
    apiClient.put<ReportLayout>('/config/report-layouts', payload).then((r) => r.data),

  reset: (reportType: string): Promise<ReportLayout> =>
    apiClient.post<ReportLayout>(`/config/report-layouts/${reportType}/reset`).then((r) => r.data),

  /** Returns the path for the preview endpoint (compatible with apiClient's baseURL). */
  previewUrl: (reportType: string): string => `/config/report-layouts/${reportType}/preview`,
};

// ---------------------------------------------------------------------------
// Ancillary Testing API
// ---------------------------------------------------------------------------

export interface CreateAncillaryOrderPayload {
  orderId: string;
  blockId: string;
  orderableId: number;
  levelCount?: number;
  notes?: string;
}

export interface UpdateAncillaryOrderStatusPayload {
  status: AncillaryOrderStatus;
  resultNotes?: string;
}

export interface CreateAncillaryOrderablePayload {
  name: string;
  category: AncillaryCategory;
  sortOrder?: number;
}

export interface UpdateAncillaryOrderablePayload {
  name?: string;
  category?: AncillaryCategory;
  sortOrder?: number;
  isActive?: boolean;
}

export interface CreateAncillaryPanelPayload {
  name: string;
  category: AncillaryCategory;
  orderableIds: number[];
  sortOrder?: number;
}

export interface UpdateAncillaryPanelPayload {
  name?: string;
  category?: AncillaryCategory;
  orderableIds?: number[];
  sortOrder?: number;
  isActive?: boolean;
}

export const ancillaryApi = {
  // Worklist
  getQueue: (filters?: { statuses?: AncillaryOrderStatus[]; category?: AncillaryCategory; categories?: AncillaryCategory[]; since?: string; page?: number; pageSize?: number; search?: string }): Promise<{ data: AncillaryOrder[]; total: number; page: number; pageSize: number }> => {
    const qs = new URLSearchParams();
    if (filters?.statuses?.length) qs.set('statuses', filters.statuses.join(','));
    if (filters?.categories?.length) qs.set('categories', filters.categories.join(','));
    else if (filters?.category) qs.set('category', filters.category);
    if (filters?.since) qs.set('since', filters.since);
    if (filters?.page) qs.set('page', String(filters.page));
    if (filters?.pageSize) qs.set('pageSize', String(filters.pageSize));
    if (filters?.search) qs.set('search', filters.search);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return apiClient.get<{ data: AncillaryOrder[]; total: number; page: number; pageSize: number }>(`/ancillary/queue${suffix}`).then((r) => r.data);
  },

  // Per-case orders
  getOrdersByCase: (orderId: string): Promise<AncillaryOrder[]> =>
    apiClient.get<{ data: AncillaryOrder[] }>(`/ancillary/orders?orderId=${encodeURIComponent(orderId)}`).then((r) => r.data.data),

  // Block-level badge counts for a case
  getBlockOrderCounts: (orderId: string): Promise<Record<string, number>> =>
    apiClient.get<{ data: Record<string, number> }>(`/ancillary/orders/block-counts?orderId=${encodeURIComponent(orderId)}`).then((r) => r.data.data),

  // Create (batch)
  createOrders: (orders: CreateAncillaryOrderPayload[]): Promise<AncillaryOrder[]> =>
    apiClient.post<{ data: AncillaryOrder[] }>('/ancillary/orders', { orders }).then((r) => r.data.data),

  // Status update
  updateStatus: (id: number, payload: UpdateAncillaryOrderStatusPayload): Promise<AncillaryOrder> =>
    apiClient.patch<{ data: AncillaryOrder }>(`/ancillary/orders/${id}/status`, payload).then((r) => r.data.data),

  // Config — orderables
  getOrderables: (): Promise<AncillaryOrderable[]> =>
    apiClient.get<{ data: AncillaryOrderable[] }>('/config/ancillary/orderables').then((r) => r.data.data),

  createOrderable: (payload: CreateAncillaryOrderablePayload): Promise<AncillaryOrderable> =>
    apiClient.post<{ data: AncillaryOrderable }>('/config/ancillary/orderables', payload).then((r) => r.data.data),

  updateOrderable: (id: number, payload: UpdateAncillaryOrderablePayload): Promise<AncillaryOrderable> =>
    apiClient.put<{ data: AncillaryOrderable }>(`/config/ancillary/orderables/${id}`, payload).then((r) => r.data.data),

  deleteOrderable: (id: number): Promise<void> =>
    apiClient.delete(`/config/ancillary/orderables/${id}`).then(() => undefined),

  // Config — panels
  getPanels: (): Promise<AncillaryPanel[]> =>
    apiClient.get<{ data: AncillaryPanel[] }>('/config/ancillary/panels').then((r) => r.data.data),

  createPanel: (payload: CreateAncillaryPanelPayload): Promise<AncillaryPanel> =>
    apiClient.post<{ data: AncillaryPanel }>('/config/ancillary/panels', payload).then((r) => r.data.data),

  updatePanel: (id: number, payload: UpdateAncillaryPanelPayload): Promise<AncillaryPanel> =>
    apiClient.put<{ data: AncillaryPanel }>(`/config/ancillary/panels/${id}`, payload).then((r) => r.data.data),

  deletePanel: (id: number): Promise<void> =>
    apiClient.delete(`/config/ancillary/panels/${id}`).then(() => undefined),
};


// ---------------------------------------------------------------------------
// CSV data import
// ---------------------------------------------------------------------------

/**
 * The CSV goes up as a raw `text/csv` body, so the per-request Content-Type
 * overrides the instance default set in client.ts. Axios passes string bodies
 * through untouched.
 */
const csvRequest = { headers: { 'Content-Type': 'text/csv' } } as const;

export const dataImportApi = {
  preview: (entity: DataImportEntity, csv: string): Promise<ImportPreview> =>
    apiClient
      .post<{ data: ImportPreview }>(`/config/data-import/${entity}/preview`, csv, csvRequest)
      .then((r) => r.data.data),

  commit: (entity: DataImportEntity, csv: string): Promise<ImportResult> =>
    apiClient
      .post<{ data: ImportResult }>(`/config/data-import/${entity}`, csv, csvRequest)
      .then((r) => r.data.data),
};
