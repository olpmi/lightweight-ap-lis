/**
 * Centralized TanStack Query keys.
 *
 * Use these factories instead of inline arrays so that:
 *   - invalidations in one place reliably hit reads elsewhere,
 *   - renaming a logical entity is a single-file change,
 *   - typos like `['ancillary-orderables']` vs `['ancillary_orderables']`
 *     are caught at compile time.
 *
 * Convention for resources with parameters:
 *   - `.all`      \u2014 the bare prefix key, used to invalidate every sub-query.
 *   - `.byId(id)` \u2014 the specific keyed query.
 *
 * `orderId` is typed `string | undefined` because most pages source it from
 * `useParams()` and gate the actual fetch via `enabled: Boolean(orderId)`.
 */

type OrderId = string | undefined;

export const qk = {
  // ----- Orders / case data --------------------------------------------------
  order: {
    all: ['order'] as const,
    byId: (orderId: OrderId) => ['order', orderId] as const,
  },
  reports: {
    all: ['reports'] as const,
    byOrder: (orderId: OrderId) => ['reports', orderId] as const,
  },
  materials: {
    all: ['materials'] as const,
    byOrder: (orderId: OrderId) => ['materials', orderId] as const,
  },

  // ----- Queues --------------------------------------------------------------
  processingQueue: {
    all: ['processing-queue'] as const,
    byParams: (page: number, showAll: boolean, search: string) =>
      ['processing-queue', page, showAll, search] as const,
  },
  resultQueue: {
    all: ['result-queue'] as const,
    byParams: (page: number, search: string) =>
      ['result-queue', page, search] as const,
  },
  histologyQueue: {
    all: ['histology-queue'] as const,
    byParams: (page: number, search: string, status: string, since: string | undefined) =>
      ['histology-queue', page, search, status, since] as const,
  },
  ancillaryQueue: {
    all: ['ancillary-queue'] as const,
    byFilters: (
      statusFilter: string,
      category: string,
      sinceDate: string | undefined,
      page: number,
    ) => ['ancillary-queue', statusFilter, category, sinceDate, page] as const,
  },

  // ----- Ancillary -----------------------------------------------------------
  // NOTE: a single canonical key for the orderables catalog so that mutations
  // on ConfigAncillaryPage invalidate the dialog's read on OrderAncillaryDialog.
  // Previously the dialog used 'ancillary-orderables' and the config page used
  // 'config-ancillary-orderables', requiring redundant cross-invalidations.
  ancillaryOrderables: ['ancillary-orderables'] as const,
  ancillaryPanels: ['ancillary-panels'] as const,
  ancillaryOrders: {
    all: ['ancillary-orders'] as const,
    byOrder: (orderId: OrderId) => ['ancillary-orders', orderId] as const,
  },
  ancillaryBlockCounts: {
    all: ['ancillary-block-counts'] as const,
    byOrder: (orderId: OrderId) => ['ancillary-block-counts', orderId] as const,
  },

  // ----- Lookups -------------------------------------------------------------
  bodySites: ['body-sites'] as const,
  specimenTypes: ['specimen-types'] as const,
  employeeRoles: ['employee-roles'] as const,
  employeeSearch: (q: string) => ['employee-search', q] as const,
  patientSearch: (q: string) => ['patient-search', q] as const,
  doctorSearch: (q: string) => ['doctor-search', q] as const,

  // ----- Templates / config --------------------------------------------------
  configTemplates: ['config-templates'] as const,
  configTemplateFiles: (templateKey: string) =>
    ['config-template-files', templateKey] as const,
  templateCatalog: (
    type: 'gross' | 'reporting',
    lang: string,
  ) => ['template-catalog', type, lang] as const,
  templateDefinition: (templateKey: string | undefined, lang: string) =>
    ['template-definition', templateKey, lang] as const,
  patientSummaryDefinition: (
    templateId: string | undefined,
    lang: string,
  ) => ['patient-summary-definition', templateId, lang] as const,
  patientSummaryCatalog: (lang?: string) =>
    ['patient-summary-catalog', lang] as const,
  reportLayouts: ['report-layouts'] as const,

  // ----- Misc ----------------------------------------------------------------
  query: (params: unknown, page: number) => ['query', params, page] as const,
  /** Deployment facts (demo mode). Fixed for the lifetime of the page load. */
  meta: ['meta'] as const,
} as const;

