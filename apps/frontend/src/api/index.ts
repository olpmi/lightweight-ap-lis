import apiClient from './client';
import type { Employee, EmployeeRole } from '@lis/shared';

export interface SessionEmployee {
  employeeId: number;
  userName: string;
  role: string;
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
  employeeRoles: (): Promise<EmployeeRole[]> =>
    apiClient.get<{ data: EmployeeRole[] }>('/lookups/employee-roles').then((r) => r.data.data),
};

export const employeeApi = {
  search: (q: string): Promise<Employee[]> =>
    apiClient.get<{ data: Employee[] }>(`/employees/search?q=${encodeURIComponent(q)}`).then((r) => r.data.data),
  create: (data: object): Promise<Employee> =>
    apiClient.post<{ data: Employee }>('/employees', data).then((r) => r.data.data),
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
};

export const reportApi = {
  list: (orderId: string): Promise<object[]> =>
    apiClient.get<{ data: object[] }>(`/orders/${orderId}/reports`).then((r) => r.data.data),

  createDraft: (orderId: string, data: object): Promise<object> =>
    apiClient.post<{ data: object }>(`/orders/${orderId}/reports/draft`, data).then((r) => r.data.data),

  signOut: (reportId: number, data: object): Promise<object> =>
    apiClient.post<{ data: object }>(`/reports/${reportId}/signout`, data).then((r) => r.data.data),

  reactivate: (orderId: string, reactivationType: 'revise' | 'addend'): Promise<object> =>
    apiClient
      .post<{ data: object }>(`/orders/${orderId}/reactivate`, { reactivationType })
      .then((r) => r.data.data),

  pdfUrl: (reportId: number) => `/api/reports/${reportId}/pdf`,
};
