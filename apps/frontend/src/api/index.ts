import apiClient from './client';
import type {
  AppLanguageCode,
  Employee,
  EmployeeRole,
  PatientSummaryDefinition,
  ReportTemplate,
  ReportTemplateType,
  TemplateCatalogEntry,
  TemplateDefinition,
  TemplateKind,
} from '@lis/shared';

export interface SessionEmployee {
  employeeId: number;
  userName: string;
  role: string;
  defaultLanguage: AppLanguageCode;
}

export const authApi = {
  login: (payload: { employeeId?: number; newEmployee?: object }) =>
    apiClient.post<{ data: Employee }>('/auth/login', payload).then((r) => r.data.data),

  logout: () => apiClient.post('/auth/logout'),

  me: () =>
    apiClient.get<{ data: SessionEmployee }>('/auth/me').then((r) => r.data.data),
};

export const lookupApi = {
  bodySites: () => apiClient.get<{ data: object[] }>('/lookups/body-sites').then((r) => r.data.data),
  specimenTypes: () => apiClient.get<{ data: object[] }>('/lookups/specimen-types').then((r) => r.data.data),
  reportTemplates: () => apiClient.get<{ data: object[] }>('/lookups/report-templates').then((r) => r.data.data),
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
  employeeRoles: (): Promise<EmployeeRole[]> =>
    apiClient.get<{ data: EmployeeRole[] }>('/lookups/employee-roles').then((r) => r.data.data),
};

export const employeeApi = {
  search: (q: string): Promise<Employee[]> =>
    apiClient.get<{ data: Employee[] }>(`/employees/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
  create: (data: object): Promise<Employee> =>
    apiClient.post<{ data: Employee }>('/employees', data).then((r) => r.data.data),
  updateLanguage: (employeeId: number, language: string): Promise<void> =>
    apiClient.patch(`/employees/${employeeId}/language`, { language }).then(() => undefined),
};

export const doctorApi = {
  search: (q: string): Promise<object[]> =>
    apiClient.get<{ data: object[] }>(`/doctors/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
  create: (data: object): Promise<object> =>
    apiClient.post<{ data: object }>('/doctors', data).then((r) => r.data.data),
};

export const patientApi = {
  search: (q: string): Promise<object[]> =>
    apiClient.get<{ data: object[] }>(`/patients/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
};

export const orderApi = {
  create: (data: object): Promise<object> =>
    apiClient.post<{ data: object }>('/orders', data).then((r) => r.data.data),

  get: (orderId: string): Promise<object> =>
    apiClient.get<{ data: object }>(`/orders/${orderId}`).then((r) => r.data.data),

  list: (page = 1, pageSize = 20): Promise<{ data: object[]; total: number; page: number; pageSize: number }> =>
    apiClient.get(`/orders?page=${page}&pageSize=${pageSize}`).then((r) => r.data),

  query: (params: { orderId?: string; patientId?: string; page?: number; pageSize?: number }) => {
    const qs = new URLSearchParams();
    if (params.orderId) qs.set('orderId', params.orderId);
    if (params.patientId) qs.set('patientId', params.patientId);
    qs.set('page', String(params.page ?? 1));
    qs.set('pageSize', String(params.pageSize ?? 20));
    return apiClient.get(`/orders/query?${qs}`).then((r) => r.data);
  },

  processingQueue: (page = 1, pageSize = 20, showAll = false, search = '') =>
    apiClient
      .get(`/orders/processing-queue?page=${page}&pageSize=${pageSize}&showAll=${showAll}&search=${encodeURIComponent(search)}`)
      .then((r) => r.data),

  resultQueue: (page = 1, pageSize = 20, search = '') =>
    apiClient.get(`/orders/result-queue?page=${page}&pageSize=${pageSize}&search=${encodeURIComponent(search)}`).then((r) => r.data),

  materials: (orderId: string): Promise<{ data: object }> =>
    apiClient.get(`/orders/${orderId}/materials`).then((r) => r.data),

  worksheetPdfUrl: (orderId: string) => `/api/orders/${orderId}/worksheet-pdf`,
  referenceStripsPdfUrl: (orderId: string) => `/api/orders/${orderId}/reference-strips-pdf`,

  updateClinicalHistory: (orderId: string, clinicalHistory: string | null) =>
    apiClient.patch(`/orders/${orderId}/clinical-history`, { clinicalHistory }).then((r) => r.data),
};

export const specimenApi = {
  createBlocks: (specimenId: string, count: number): Promise<object[]> =>
    apiClient
      .post<{ data: object[] }>(`/specimens/${specimenId}/blocks`, { count })
      .then((r) => r.data.data),
};

export const blockApi = {
  createSlides: (blockId: string, count: number, slideType?: string): Promise<object[]> =>
    apiClient
      .post<{ data: object[] }>(`/blocks/${blockId}/slides`, { count, slideType })
      .then((r) => r.data.data),
  deleteBlock: (blockId: string): Promise<void> =>
    apiClient.delete(`/blocks/${blockId}`).then(() => undefined),
  deleteSlide: (blockId: string, slideId: string): Promise<void> =>
    apiClient.delete(`/blocks/${blockId}/slides/${slideId}`).then(() => undefined),
};

export const reportApi = {
  list: (orderId: string): Promise<object[]> =>
    apiClient.get<{ data: object[] }>(`/orders/${orderId}/reports`).then((r) => r.data.data),

  createDraft: (orderId: string, data: object): Promise<object> =>
    apiClient.post<{ data: object }>(`/orders/${orderId}/reports/draft`, data).then((r) => r.data.data),

  signOut: (reportId: number, data: object): Promise<object> =>
    apiClient.post<{ data: object }>(`/reports/${reportId}/signout`, data).then((r) => r.data.data),

  signPrelim: (reportId: number, data: object): Promise<object> =>
    apiClient.post<{ data: object }>(`/reports/${reportId}/signprelim`, data).then((r) => r.data.data),

  reactivate: (orderId: string, reactivationType: 'revise' | 'addend', reactivationReason: string): Promise<object> =>
    apiClient
      .post<{ data: object }>(`/orders/${orderId}/reactivate`, { reactivationType, reactivationReason })
      .then((r) => r.data.data),

  pdfUrl: (reportId: number) => `/api/reports/${reportId}/pdf`,
  patientSummaryPdfUrl: (reportId: number, language: AppLanguageCode) =>
    `/api/reports/${reportId}/patient-summary.pdf?language=${encodeURIComponent(language)}`,
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

