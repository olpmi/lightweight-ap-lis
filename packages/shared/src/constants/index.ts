export const EMPLOYEE_ROLES = {
  PATHOLOGIST: 'Pathologist',
  TECHNOLOGIST: 'Technologist',
} as const;

export const ORDER_ID_PREFIX = 'SU';
export const ORDER_ID_SEQUENCE_LENGTH = 7;

export const FILE_TYPES = {
  WORKSHEET_PDF: 'worksheet_pdf',
  REFERENCE_STRIPS_PDF: 'reference_strips_pdf',
  REPORT_PDF: 'report_pdf',
  AMENDED_PDF: 'amended_pdf',
} as const;

export const SEX_OPTIONS = ['Male', 'Female', 'Other', 'Unknown'] as const;

export const SLIDE_TYPES = ['H&E', 'Unstained', 'IHC', 'Special stain', 'Other'] as const;
