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

export const ANCILLARY_CATEGORIES = [
  'HE_LEVELS',
  'IHC',
  'SPECIAL_STAIN',
  'MOLECULAR',
  'SEND_OUT',
] as const;

export type AncillaryCategory = (typeof ANCILLARY_CATEGORIES)[number];

export const ANCILLARY_CATEGORY_LABELS: Record<AncillaryCategory, string> = {
  HE_LEVELS: 'H&E Levels',
  IHC: 'IHC',
  SPECIAL_STAIN: 'Special Stains',
  MOLECULAR: 'Molecular',
  SEND_OUT: 'Send-out',
};

export const ANCILLARY_ORDER_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETE',
  'CANCELLED',
] as const;

export type AncillaryOrderStatus = (typeof ANCILLARY_ORDER_STATUSES)[number];

export const CYTOLOGY_SITE_HIERARCHY: Record<string, readonly string[]> = {
  'GYN Cytology (Pap smears)': [],
  'Fine Needle Aspiration (FNA)': ['Lymph node', 'Thyroid', 'Breast', 'Salivary gland', 'Soft tissue'],
  'Fluid Cytology (Effusions)': ['Pleural fluid', 'Ascitic fluid', 'Pericardial fluid'],
  'Urine Cytology': [],
  'Respiratory Cytology': ['Sputum', 'Bronchial wash', 'Bronchial brush', 'BAL (bronchoalveolar lavage)'],
  'CSF (Cerebrospinal fluid)': [],
  'Body Fluid (Non-effusion)': ['Synovial fluid', 'Cyst fluid', 'Other'],
};

export const BODY_SITE_HIERARCHY: Record<string, readonly string[]> = {
  'Gastrointestinal (GI)': [
    'Esophagus', 'Stomach', 'Duodenum', 'Small bowel (jejunum/ileum)',
    'Colon', 'Rectum', 'Appendix', 'Anus',
  ],
  'Hepatobiliary & Pancreas': ['Liver', 'Gallbladder', 'Bile duct', 'Pancreas'],
  'Breast': ['Breast', 'Axillary tissue'],
  'Gynecologic': ['Cervix', 'Endometrium', 'Myometrium', 'Ovary', 'Fallopian tube', 'Vulva', 'Vagina'],
  'Urologic (GU)': ['Prostate', 'Bladder', 'Kidney', 'Ureter', 'Testis', 'Epididymis', 'Penis'],
  'Head & Neck': [
    'Oral cavity', 'Tongue', 'Salivary gland', 'Thyroid', 'Parathyroid',
    'Larynx', 'Pharynx', 'Nasal cavity / Sinus', 'Neck (soft tissue/unspecified)',
  ],
  'Respiratory (Lung & Pleura)': ['Lung', 'Pleura', 'Bronchus'],
  'Skin': ['Skin'],
  'Lymph Node / Hematolymphoid': ['Lymph node', 'Spleen', 'Bone marrow'],
  'Bone & Soft Tissue': ['Bone', 'Soft tissue'],
  'Central Nervous System (CNS)': ['Brain', 'Spinal cord', 'Meninges'],
  'Placenta / Products of Conception': ['Placenta', 'Products of conception'],
};
