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

export const SLIDE_TYPES = ['H&E', 'Unstained', 'IHC', 'Special stain', 'Other', 'Smear'] as const;

export const ANCILLARY_CATEGORIES = [
  'HE_LEVELS',
  'IHC',
  'SPECIAL_STAIN',
  'MOLECULAR',
  'SEND_OUT',
  'HE',
] as const;

export type AncillaryCategory = (typeof ANCILLARY_CATEGORIES)[number];

export const ANCILLARY_CATEGORY_LABELS: Record<AncillaryCategory, string> = {
  HE_LEVELS: 'H&E Levels',
  IHC: 'IHC',
  SPECIAL_STAIN: 'Special Stains',
  MOLECULAR: 'Molecular',
  SEND_OUT: 'Send-out',
  HE: 'H&E',
};

export const ANCILLARY_ORDER_STATUSES = [
  'PULL_BLOCK',
  'MICROTOMY',
  'SLIDE_STAIN',
  'DISTRIBUTED',
  'CANCELLED',
  'PULL_MATERIAL',
  'MATERIAL_SENT',
  'MATERIAL_RETURNED',
] as const;

export type AncillaryOrderStatus = (typeof ANCILLARY_ORDER_STATUSES)[number];

export const HISTOLOGY_ORDER_STATUSES = ['PULL_BLOCK', 'MICROTOMY', 'SLIDE_STAIN', 'DISTRIBUTED', 'CANCELLED'] as const;
export const SENDOUT_ORDER_STATUSES = ['PULL_MATERIAL', 'MATERIAL_SENT', 'MATERIAL_RETURNED', 'CANCELLED'] as const;

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
  'Breast': [
    'Left Breast', 'Right Breast', 'Breast',
    'Left Axillary tissue', 'Right Axillary tissue', 'Axillary tissue',
  ],
  'Gynecologic': [
    'Cervix', 'Endometrium', 'Myometrium',
    'Left Ovary', 'Right Ovary', 'Ovary',
    'Left Fallopian tube', 'Right Fallopian tube', 'Fallopian tube',
    'Vulva', 'Vagina',
  ],
  'Urologic (GU)': [
    'Prostate', 'Bladder',
    'Left Kidney', 'Right Kidney', 'Kidney',
    'Left Ureter', 'Right Ureter', 'Ureter',
    'Left Testis', 'Right Testis', 'Testis',
    'Left Epididymis', 'Right Epididymis', 'Epididymis',
    'Penis',
  ],
  'Head & Neck': [
    'Oral cavity', 'Tongue',
    'Left Salivary gland', 'Right Salivary gland', 'Salivary gland',
    'Thyroid', 'Parathyroid',
    'Larynx', 'Pharynx', 'Nasal cavity / Sinus', 'Neck (soft tissue/unspecified)',
  ],
  'Respiratory (Lung & Pleura)': [
    'Left Lung', 'Right Lung', 'Lung',
    'Left Pleura', 'Right Pleura', 'Pleura',
    'Left Bronchus', 'Right Bronchus', 'Bronchus',
  ],
  'Skin': ['Skin'],
  'Lymph Node / Hematolymphoid': ['Lymph node', 'Spleen', 'Bone marrow'],
  'Bone & Soft Tissue': ['Bone', 'Soft tissue'],
  'Central Nervous System (CNS)': ['Brain', 'Spinal cord', 'Meninges'],
  'Placenta / Products of Conception': ['Placenta', 'Products of conception'],
};
