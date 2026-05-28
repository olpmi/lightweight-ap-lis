import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Deterministic pseudo-random helper (seeded, so results are repeatable)
// ---------------------------------------------------------------------------
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}
const rng = makeRng(42);
function pick<T>(arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}
function randInt(min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

// ---------------------------------------------------------------------------
// Lookup data
// ---------------------------------------------------------------------------
const BODY_SITES = [
  // Gastrointestinal (GI)
  'Esophagus', 'Stomach', 'Duodenum', 'Small bowel (jejunum/ileum)',
  'Colon', 'Rectum', 'Appendix', 'Anus',
  // Hepatobiliary & Pancreas
  'Liver', 'Gallbladder', 'Bile duct', 'Pancreas',
  // Breast
  'Breast', 'Axillary tissue',
  // Gynecologic
  'Cervix', 'Endometrium', 'Myometrium', 'Ovary', 'Fallopian tube', 'Vulva', 'Vagina',
  // Urologic (GU)
  'Prostate', 'Bladder', 'Kidney', 'Ureter', 'Testis', 'Epididymis', 'Penis',
  // Head & Neck
  'Oral cavity', 'Tongue', 'Salivary gland', 'Thyroid', 'Parathyroid',
  'Larynx', 'Pharynx', 'Nasal cavity / Sinus', 'Neck (soft tissue/unspecified)',
  // Respiratory
  'Lung', 'Pleura', 'Bronchus',
  // Skin
  'Skin',
  // Lymph Node / Hematolymphoid
  'Lymph node', 'Spleen', 'Bone marrow',
  // Bone & Soft Tissue
  'Bone', 'Soft tissue',
  // CNS
  'Brain', 'Spinal cord', 'Meninges',
  // Placenta / POC
  'Placenta', 'Products of conception',
  // Cytology (sites with no sub-organs)
  'GYN Cytology (Pap smears)', 'Urine Cytology', 'CSF (Cerebrospinal fluid)',
  // Cytology — Fluid Cytology sub-sites
  'Pleural fluid', 'Ascitic fluid', 'Pericardial fluid',
  // Cytology — Respiratory sub-sites
  'Sputum', 'Bronchial wash', 'Bronchial brush', 'BAL (bronchoalveolar lavage)',
  // Cytology — Body Fluid sub-sites
  'Synovial fluid', 'Cyst fluid', 'Other',
];

const SPECIMEN_TYPES = [
  { name: 'Biopsy', description: 'Small tissue biopsy' },
  { name: 'Excision', description: 'Surgical excision specimen' },
  { name: 'Resection', description: 'Large surgical resection' },
  { name: 'Cytology', description: 'Cytological specimen' },
  { name: 'Core needle biopsy', description: 'Core needle biopsy' },
  { name: 'Fine needle aspiration', description: 'FNA specimen' },
  { name: 'Curettage', description: 'Curettage specimen' },
  { name: 'Polypectomy', description: 'Polyp removal' },
  { name: 'Amputation', description: 'Amputation specimen' },
  { name: 'Bone marrow biopsy', description: 'Bone marrow trephine biopsy' },
];

const REPORT_TEMPLATES = [
  {
    name: 'Colon - Adenocarcinoma (CAP)',
    text: [
      '=== SYNOPTIC REPORT: COLON AND RECTUM ===',
      '',
      'PROCEDURE: [ ] Right hemicolectomy  [ ] Sigmoid colectomy  [ ] Anterior resection  [ ] Other: ___',
      '',
      'SPECIMEN INTEGRITY: [ ] Intact  [ ] Fragmented',
      '',
      'TUMOR SITE: [ ] Cecum  [ ] Ascending  [ ] Transverse  [ ] Descending  [ ] Sigmoid  [ ] Rectum',
      '',
      'TUMOR SIZE: ___ x ___ x ___ cm',
      '',
      'HISTOLOGIC TYPE: [ ] Adenocarcinoma, NOS  [ ] Mucinous adenocarcinoma (>50% mucinous)  [ ] Signet-ring cell',
      '',
      'HISTOLOGIC GRADE: [ ] Low grade (well/moderately differentiated)  [ ] High grade (poorly/undifferentiated)',
      '',
      'TUMOR CONFIGURATION: [ ] Polypoid  [ ] Ulcerative  [ ] Infiltrative  [ ] Other: ___',
      '',
      'DEPTH OF INVASION (pT):\n[ ] pTis - Carcinoma in situ\n[ ] pT1 - Submucosa\n[ ] pT2 - Muscularis propria\n[ ] pT3 - Through muscularis propria into pericolorectal tissues\n[ ] pT4a - Penetrates to surface of visceral peritoneum\n[ ] pT4b - Directly invades other organs/structures',
      '',
      'REGIONAL LYMPH NODES (pN):\nNumber examined: ___\nNumber positive: ___\n[ ] pN0  [ ] pN1a  [ ] pN1b  [ ] pN1c  [ ] pN2a  [ ] pN2b',
      '',
      'MARGINS:\n[ ] Proximal: Negative (distance ___ cm)  [ ] Positive\n[ ] Distal: Negative (distance ___ cm)  [ ] Positive\n[ ] Radial/Circumferential: Negative (distance ___ mm)  [ ] Positive',
      '',
      'LYMPHOVASCULAR INVASION: [ ] Not identified  [ ] Present',
      '',
      'PERINEURAL INVASION: [ ] Not identified  [ ] Present',
      '',
      'TUMOR DEPOSITS (pN1c): [ ] None  [ ] Present, number: ___',
      '',
      'ADDITIONAL PATHOLOGIC FINDINGS: ___',
    ].join('\n'),
  },
  {
    name: 'Breast - Invasive Carcinoma (CAP)',
    text: [
      '=== SYNOPTIC REPORT: BREAST ===',
      '',
      'PROCEDURE: [ ] Core needle biopsy  [ ] Excision  [ ] Segmental mastectomy  [ ] Simple mastectomy  [ ] Modified radical mastectomy',
      '',
      'SPECIMEN LATERALITY: [ ] Right  [ ] Left',
      '',
      'TUMOR SIZE (largest invasive focus): ___ cm',
      '',
      'HISTOLOGIC TYPE:\n[ ] Invasive carcinoma of no special type (NST/ductal)\n[ ] Invasive lobular carcinoma\n[ ] Mucinous carcinoma\n[ ] Other: ___',
      '',
      'NOTTINGHAM GRADE:\n  Tubule formation: ___ (1/2/3)\n  Nuclear pleomorphism: ___ (1/2/3)\n  Mitotic count: ___ (1/2/3)\n  Total: ___ / 9\n  Grade: [ ] 1 (3–5)  [ ] 2 (6–7)  [ ] 3 (8–9)',
      '',
      'DUCTAL CARCINOMA IN SITU (DCIS):\n[ ] Not identified  [ ] Present\n  Nuclear grade: [ ] Low  [ ] Intermediate  [ ] High\n  Necrosis: [ ] Absent  [ ] Present',
      '',
      'MARGINS:\n[ ] Negative (closest margin: ___, ___ mm)\n[ ] Positive (location: ___)',
      '',
      'LYMPH NODES (if submitted):\n  Number sentinel nodes examined: ___  Number positive: ___\n  Number non-sentinel nodes examined: ___  Number positive: ___',
      '',
      'LYMPHOVASCULAR INVASION: [ ] Not identified  [ ] Present',
      '',
      'PATHOLOGIC STAGE: pT___ pN___ (per AJCC 8th ed.)',
      '',
      'ANCILLARY STUDIES (if performed):\n  ER: [ ] Positive (___ %)  [ ] Negative\n  PR: [ ] Positive (___ %)  [ ] Negative\n  HER2 IHC: [ ] 0  [ ] 1+  [ ] 2+  [ ] 3+\n  Ki-67: ___ %',
    ].join('\n'),
  },
  {
    name: 'Prostate - Needle Biopsy (CAP)',
    text: [
      '=== SYNOPTIC REPORT: PROSTATE NEEDLE BIOPSY ===',
      '',
      'PROCEDURE: [ ] Needle core biopsy  [ ] TURP chips',
      '',
      'HISTOLOGIC TYPE:\n[ ] Acinar adenocarcinoma\n[ ] Ductal adenocarcinoma\n[ ] No malignancy identified',
      '',
      'GLEASON SCORE (if adenocarcinoma):\n  Primary pattern: ___  Secondary pattern: ___\n  Combined Gleason score: ___ / 10\n  Grade group: [ ] 1 (≤6)  [ ] 2 (3+4=7)  [ ] 3 (4+3=7)  [ ] 4 (8)  [ ] 5 (9–10)',
      '',
      'EXTENT OF CARCINOMA:\n  Number of positive cores: ___ / ___ total\n  Greatest % involvement in any single core: ___ %',
      '',
      'LOCATION OF POSITIVE CORES: ___',
      '',
      'PERINEURAL INVASION: [ ] Not identified  [ ] Present',
      '',
      'EXTRAPROSTATIC EXTENSION: [ ] Not identified  [ ] Present  [ ] Cannot be assessed',
      '',
      'SEMINAL VESICLE INVASION: [ ] Not identified  [ ] Present  [ ] Not submitted',
      '',
      'HIGH-GRADE PIN: [ ] Absent  [ ] Present',
      '',
      'OTHER FINDINGS: ___',
    ].join('\n'),
  },
  {
    name: 'Skin - Melanoma (CAP)',
    text: [
      '=== SYNOPTIC REPORT: MELANOMA ===',
      '',
      'PROCEDURE: [ ] Shave biopsy  [ ] Punch biopsy  [ ] Excision  [ ] Re-excision',
      '',
      'SPECIMEN SITE: ___',
      '',
      'HISTOLOGIC TYPE:\n[ ] Superficial spreading  [ ] Nodular  [ ] Lentigo maligna  [ ] Acral lentiginous\n[ ] Desmoplastic  [ ] Other: ___',
      '',
      'CLARK LEVEL: [ ] I  [ ] II  [ ] III  [ ] IV  [ ] V',
      '',
      'BRESLOW THICKNESS (pT): ___ mm\n[ ] pT1a (< 0.8 mm, no ulceration)\n[ ] pT1b (< 0.8 mm with ulceration, or 0.8–1.0 mm)\n[ ] pT2a (> 1.0–2.0 mm, no ulceration)\n[ ] pT2b (> 1.0–2.0 mm with ulceration)\n[ ] pT3a (> 2.0–4.0 mm, no ulceration)\n[ ] pT3b (> 2.0–4.0 mm with ulceration)\n[ ] pT4a (> 4.0 mm, no ulceration)\n[ ] pT4b (> 4.0 mm with ulceration)',
      '',
      'ULCERATION: [ ] Not identified  [ ] Present',
      '',
      'MITOTIC RATE: ___ /mm²',
      '',
      'MICROSATELLITES: [ ] Absent  [ ] Present',
      '',
      'TUMOR-INFILTRATING LYMPHOCYTES: [ ] Absent  [ ] Non-brisk  [ ] Brisk',
      '',
      'REGRESSION: [ ] Absent  [ ] Present',
      '',
      'PERIPHERAL MARGINS: [ ] Negative (closest: ___ mm)  [ ] Positive\nDEEP MARGIN: [ ] Negative (distance: ___ mm)  [ ] Positive',
      '',
      'LYMPHOVASCULAR INVASION: [ ] Not identified  [ ] Present',
      '',
      'ADDITIONAL FINDINGS: ___',
    ].join('\n'),
  },
  {
    name: 'Lung - Non-Small Cell Carcinoma (CAP)',
    text: [
      '=== SYNOPTIC REPORT: LUNG ===',
      '',
      'PROCEDURE: [ ] Core needle biopsy  [ ] Wedge resection  [ ] Lobectomy  [ ] Pneumonectomy',
      '',
      'TUMOR SITE: [ ] Right upper lobe  [ ] Right middle lobe  [ ] Right lower lobe  [ ] Left upper lobe  [ ] Left lower lobe',
      '',
      'TUMOR SIZE: ___ x ___ x ___ cm',
      '',
      'HISTOLOGIC TYPE:\n[ ] Adenocarcinoma\n  Predominant pattern: [ ] Lepidic  [ ] Acinar  [ ] Papillary  [ ] Micropapillary  [ ] Solid\n[ ] Squamous cell carcinoma\n[ ] Large cell carcinoma\n[ ] Other: ___',
      '',
      'HISTOLOGIC GRADE: [ ] Well differentiated  [ ] Moderately differentiated  [ ] Poorly differentiated',
      '',
      'PATHOLOGIC STAGE (pT):\n[ ] pTis  [ ] pT1a (≤1 cm)  [ ] pT1b (>1–2 cm)  [ ] pT1c (>2–3 cm)\n[ ] pT2a (>3–4 cm)  [ ] pT2b (>4–5 cm)  [ ] pT3 (>5–7 cm or invasion)  [ ] pT4',
      '',
      'MARGINS:\n[ ] Bronchial: Negative  [ ] Positive\n[ ] Vascular: Negative  [ ] Positive\n[ ] Parenchymal: Negative (distance ___ mm)  [ ] Positive',
      '',
      'LYMPH NODES (pN):\n  Number examined: ___  Number positive: ___\n  Stations involved: ___\n[ ] pN0  [ ] pN1  [ ] pN2  [ ] pN3',
      '',
      'LYMPHOVASCULAR INVASION: [ ] Not identified  [ ] Present',
      '',
      'VISCERAL PLEURAL INVASION: [ ] Not identified  [ ] Present',
      '',
      'NECROSIS: [ ] Absent  [ ] Present',
      '',
      'ADDITIONAL FINDINGS (emphysema, fibrosis, etc.): ___',
    ].join('\n'),
  },
];

type StructuredSeedValue = string | string[];

interface StructuredSeedReport {
  templateKey: string;
  templateId: string;
  title: string;
  diagnosis: string;
  synopticData: string;
  values: Record<string, StructuredSeedValue>;
}

const CYTOLOGY_STRUCTURED_REPORTS: StructuredSeedReport[] = [
  {
    templateKey: 'general_cytology/general_cytology',
    templateId: 'general_cytology',
    title: 'GENERAL CYTOLOGY REPORTING TEMPLATE',
    diagnosis: 'Positive for malignancy',
    synopticData: 'DIAGNOSTIC CATEGORY\nDiagnostic Category: Positive for malignancy',
    values: {
      'diagnostic_category.diagnostic_category': 'Positive for malignancy',
    },
  },
  {
    templateKey: 'fluid_cytology/fluid_cytology',
    templateId: 'fluid_cytology_international_serous_fluid',
    title: 'FLUID CYTOLOGY REPORTING TEMPLATE',
    diagnosis: 'Negative for malignancy',
    synopticData: 'DIAGNOSTIC CATEGORY\nDiagnostic Category: II. Negative for Malignancy (NFM)',
    values: {
      'diagnostic_category.diagnostic_category': 'II. Negative for Malignancy (NFM)',
    },
  },
  {
    templateKey: 'breast_cytology/breast_cytology',
    templateId: 'breast_cytology_yokohama',
    title: 'BREAST CYTOLOGY REPORTING TEMPLATE',
    diagnosis: 'Benign breast cytology',
    synopticData: 'DIAGNOSTIC CATEGORY (YOKOHAMA)\nDiagnostic Category (Yokohama): II: Benign',
    values: {
      'diagnostic_category.yokohama_category': 'II: Benign',
    },
  },
  {
    templateKey: 'salivary_gland_cytology/salivary_gland_cytology',
    templateId: 'salivary_gland_cytology_milan',
    title: 'SALIVARY GLAND CYTOLOGY REPORTING TEMPLATE',
    diagnosis: 'Suspicious for malignancy',
    synopticData: 'MILAN CATEGORY\nMilan Category: V. Suspicious for Malignancy',
    values: {
      'milan_category.milan_category': 'V. Suspicious for Malignancy',
    },
  },
  {
    templateKey: 'thyroid_cytology/thyroid_cytology',
    templateId: 'thyroid_cytology_bethesda_3rd_edition',
    title: 'THYROID CYTOLOGY REPORTING TEMPLATE',
    diagnosis: 'Benign thyroid cytology',
    synopticData: 'BETHESDA CATEGORY\nBethesda Category: II. Benign',
    values: {
      'bethesda_category.bethesda_category': 'II. Benign',
    },
  },
  {
    templateKey: 'cervical_cytology/cervical_cytology',
    templateId: 'cervical_cytology_pap_smear_bethesda',
    title: 'CERVICAL CYTOLOGY (PAP SMEAR) REPORTING TEMPLATE',
    diagnosis: 'Low-grade squamous intraepithelial lesion',
    synopticData: [
      'SPECIMEN ADEQUACY',
      'Specimen adequacy: Satisfactory for evaluation',
      '',
      'INTERPRETATION / RESULT (SELECT APPROPRIATE)',
      'Interpretation / Result: LSIL (Low-grade squamous intraepithelial lesion)',
    ].join('\n'),
    values: {
      'specimen_adequacy.adequacy_status': 'satisfactory_for_evaluation',
      'interpretation_result.interpretation_result': 'lsil',
    },
  },
];

function buildStructuredSeedPayload(template: StructuredSeedReport): string {
  return JSON.stringify({
    version: 1,
    templateKey: template.templateKey,
    templateId: template.templateId,
    title: template.title,
    kind: 'reporting',
    language: 'en',
    values: template.values,
  });
}

const EMPLOYEE_ROLES = ['Pathologist', 'Technologist'];

const EMPLOYEES = [
  { lastName: 'Smith', firstName: 'Dr. Alice', userName: 'asmith', role: 'Pathologist' },
  { lastName: 'Jones', firstName: 'Dr. Robert', userName: 'rjones', role: 'Pathologist' },
  { lastName: 'Williams', firstName: 'Dr. Carol', userName: 'cwilliams', role: 'Pathologist' },
  { lastName: 'Brown', firstName: 'Dr. Daniel', userName: 'dbrown', role: 'Pathologist' },
  { lastName: 'Davis', firstName: 'Maria', userName: 'mdavis', role: 'Technologist' },
  { lastName: 'Miller', firstName: 'James', userName: 'jmiller', role: 'Technologist' },
  { lastName: 'Wilson', firstName: 'Linda', userName: 'lwilson', role: 'Technologist' },
  { lastName: 'Moore', firstName: 'Thomas', userName: 'tmoore', role: 'Technologist' },
  { lastName: 'Taylor', firstName: 'Sarah', userName: 'staylor', role: 'Technologist' },
  { lastName: 'Anderson', firstName: 'Kevin', userName: 'kanderson', role: 'Technologist' },
];

const DOCTORS = [
  { lastName: 'Johnson', firstName: 'Dr. Emily' },
  { lastName: 'Garcia', firstName: 'Dr. Michael' },
  { lastName: 'Martinez', firstName: 'Dr. Jennifer' },
  { lastName: 'Lee', firstName: 'Dr. Christopher' },
  { lastName: 'Harris', firstName: 'Dr. Ashley' },
  { lastName: 'Thompson', firstName: 'Dr. Matthew' },
  { lastName: 'White', firstName: 'Dr. Jessica' },
  { lastName: 'Jackson', firstName: 'Dr. Joshua' },
];

const PATIENT_FIRST_NAMES = [
  'James', 'John', 'Robert', 'Michael', 'William', 'David', 'Richard', 'Joseph',
  'Thomas', 'Mary', 'Patricia', 'Jennifer', 'Linda', 'Barbara', 'Elizabeth',
  'Susan', 'Jessica', 'Sarah', 'Karen', 'Lisa', 'Nancy', 'Betty', 'Margaret',
  'Sandra', 'Ashley', 'Dorothy', 'Kimberly', 'Emily', 'Donna', 'Michelle',
];

const PATIENT_LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
];

const SEX_OPTIONS = ['Male', 'Female'];

const DIAGNOSES = [
  'Squamous cell carcinoma, moderately differentiated',
  'Adenocarcinoma, well differentiated',
  'Basal cell carcinoma',
  'Invasive ductal carcinoma, grade 2',
  'Tubular adenoma with low-grade dysplasia',
  'Melanoma, superficial spreading type',
  'Follicular thyroid adenoma',
  'Leiomyoma',
  'No malignancy identified. Fibrocystic changes.',
  'Squamous metaplasia with reactive atypia',
  'High-grade squamous intraepithelial lesion (HSIL)',
  'Prostatic adenocarcinoma, Gleason score 3+4=7',
  'Renal cell carcinoma, clear cell type',
  'Urothelial carcinoma, high grade',
  'Endometrioid adenocarcinoma, FIGO grade 1',
];

const GROSS_DESCRIPTIONS = [
  'Received in formalin, labeled with patient name and accession number. The specimen consists of a single core of tissue measuring 1.2 cm in length and 0.1 cm in diameter. Representative sections submitted entirely.',
  'Received in formalin is a skin ellipse measuring 2.0 x 1.0 x 0.5 cm. The skin surface shows a 0.8 cm tan-brown lesion. Submitted in two cassettes.',
  'Received in formalin is a resection specimen measuring 15 x 8 x 5 cm and weighing 120 g. The specimen has been inked and serially sectioned.',
  'Received are multiple fragments of brownish-tan tissue measuring 1.5 x 1.0 x 0.5 cm in aggregate. Submitted entirely in one cassette.',
];

const COMMENTS = [
  'Results correlate with clinical presentation.',
  'Immunohistochemical stains performed.',
  'Please correlate with imaging findings.',
  'Compared with prior biopsy from same site.',
  '',
];

// ---------------------------------------------------------------------------
// Helper: next specimen code (A, B, ..., Z, AA, ...)
// ---------------------------------------------------------------------------
function nextSpecimenCode(existing: string[]): string {
  if (existing.length === 0) return 'A';
  const sorted = [...existing].sort((a, b) => {
    if (a.length !== b.length) return a.length - b.length;
    return a.localeCompare(b);
  });
  return incrementCode(sorted[sorted.length - 1]);
}

function incrementCode(code: string): string {
  const chars = code.split('');
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== 'Z') {
      chars[i] = String.fromCharCode(chars[i].charCodeAt(0) + 1);
      return chars.join('');
    }
    chars[i] = 'A';
    i--;
  }
  return 'A' + chars.join('');
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------
function generatePatientId(): string {
  return 'P' + String(Math.floor(rng() * 9000000 + 1000000));
}

function generateDob(): Date {
  const year = randInt(1940, 1990);
  const month = randInt(1, 12);
  const day = randInt(1, 28);
  return new Date(year, month - 1, day);
}

function subtractDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - days);
  return d;
}

// ---------------------------------------------------------------------------
// Main seed
// ---------------------------------------------------------------------------
async function main() {
  console.log('🌱 Seeding database...');

  // 1. Employee roles
  const roleRecords: Record<string, number> = {};
  for (const roleName of EMPLOYEE_ROLES) {
    const role = await prisma.employeeRole.upsert({
      where: { roleName },
      create: { roleName },
      update: {},
    });
    roleRecords[roleName] = role.employeeRoleId;
  }
  console.log('  ✓ Employee roles');

  // 2. Employees
  const employeeRecords: Array<{ employeeId: bigint; role: string }> = [];
  for (const emp of EMPLOYEES) {
    const record = await prisma.employee.upsert({
      where: { userName: emp.userName },
      create: {
        lastName: emp.lastName,
        firstName: emp.firstName,
        userName: emp.userName,
        employeeRoleId: roleRecords[emp.role],
      },
      update: {},
    });
    employeeRecords.push({ employeeId: record.employeeId, role: emp.role });
  }
  const pathologists = employeeRecords.filter((e) => e.role === 'Pathologist');
  console.log('  ✓ Employees');

  // 3. Doctors
  const doctorIds: bigint[] = [];
  for (const doc of DOCTORS) {
    const record = await prisma.doctor.create({ data: doc });
    doctorIds.push(record.doctorId);
  }
  console.log('  ✓ Doctors');

  // 4. Body sites
  const bodySiteIds: number[] = [];
  for (const name of BODY_SITES) {
    const record = await prisma.bodySite.upsert({
      where: { bodySiteName: name },
      create: { bodySiteName: name },
      update: {},
    });
    bodySiteIds.push(record.bodySiteId);
  }
  console.log('  ✓ Body sites');

  // 5. Specimen types
  const specimenTypeIds: number[] = [];
  for (const st of SPECIMEN_TYPES) {
    const record = await prisma.specimenType.upsert({
      where: { specimenTypeName: st.name },
      create: { specimenTypeName: st.name, description: st.description },
      update: {},
    });
    specimenTypeIds.push(record.specimenTypeId);
  }
  console.log('  ✓ Specimen types');

  // 6. Report templates
  const templateIds: number[] = [];
  for (const tpl of REPORT_TEMPLATES) {
    const record = await prisma.reportTemplate.upsert({
      where: { templateName: tpl.name },
      create: { templateName: tpl.name, templateText: tpl.text },
      update: {},
    });
    templateIds.push(record.reportTemplateId);
  }
  console.log('  ✓ Report templates');

  // 7. Patients (50 synthetic)
  const patientIds: string[] = [];
  for (let i = 0; i < 50; i++) {
    const pid = generatePatientId();
    const existing = await prisma.patient.findUnique({ where: { patientId: pid } });
    if (existing) {
      patientIds.push(existing.patientId);
      continue;
    }
    await prisma.patient.create({
      data: {
        patientId: pid,
        lastName: pick(PATIENT_LAST_NAMES),
        firstName: pick(PATIENT_FIRST_NAMES),
        dateOfBirth: generateDob(),
        sex: pick(SEX_OPTIONS),
      },
    });
    patientIds.push(pid);
  }
  console.log('  ✓ Patients');

  // 8. Order sequence bootstrap for year 25
  for (const prefix of ['SU', 'CN']) {
    await prisma.orderSequenceYear.upsert({
      where: { yearTwoDigit_prefix: { yearTwoDigit: 25, prefix } },
      create: { yearTwoDigit: 25, prefix, lastValue: 0 },
      update: {},
    });
  }

  // 9. Orders, specimens, blocks, slides, reports
  const now = new Date();
  const ORDER_COUNT = 300;

  // Look up HE orderable (inserted by migration) for auto-creating H&E orders per block
  const heOrderable = await prisma.ancillaryOrderable.findFirst({ where: { category: 'HE', isActive: true } });

  for (let i = 0; i < ORDER_COUNT; i++) {
    // Generate order ID by_prefix: { yearTwoDigit: 25, prefix: 'SU' }rementing the sequence
    const seq = await prisma.orderSequenceYear.update({
      where: { yearTwoDigit_prefix: { yearTwoDigit: 25, prefix: 'SU' } },
      data: { lastValue: { increment: 1 } },
    });
    const orderId = `SU25${String(seq.lastValue).padStart(7, '0')}`;

    // Determine the "age" of the case in days (0 = today, older = past)
    const ageDays = randInt(0, 180);
    const registeredDate = subtractDays(now, ageDays);

    const patientId = pick(patientIds);
    const doctorId = pick(doctorIds);
    const caseType = pick(['Surgical Pathology', 'Cytology', 'Surgical Pathology']);

    // Create the order
    await prisma.order.create({
      data: {
        orderId,
        patientId,
        doctorId,
        caseType,
        clinicalHistory: pick([
          'Rule out malignancy',
          'Suspicious lesion on imaging',
          'Symptomatic patient',
          'Routine screening',
          'Follow-up biopsy',
          '',
        ]),
        registeredDate,
      },
    });

    // Determine case stage based on age and random distribution
    // Stages: registered-only (no materials), has materials (blocks/slides), signed-out, reactivated
    let stage: 'registered_only' | 'materials' | 'signed_out' | 'reactivated';
    const r = rng();
    if (ageDays < 5) {
      stage = r < 0.5 ? 'registered_only' : 'materials';
    } else if (ageDays < 30) {
      stage = r < 0.2 ? 'materials' : r < 0.6 ? 'signed_out' : 'signed_out';
    } else {
      stage = r < 0.05 ? 'materials' : r < 0.1 ? 'reactivated' : 'signed_out';
    }

    // Always create specimens first
    const specimenCount = randInt(1, stage === 'registered_only' ? 2 : 3);
    const specCodes: string[] = [];
    const specimenIds: string[] = [];

    for (let s = 0; s < specimenCount; s++) {
      const code = nextSpecimenCode(specCodes);
      specCodes.push(code);
      const specimenId = `${orderId}-${code}`;
      await prisma.specimen.create({
        data: {
          specimenId,
          orderId,
          specimenCode: code,
          bodySiteId: pick(bodySiteIds),
          specimenTypeId: pick(specimenTypeIds),
        },
      });
      specimenIds.push(specimenId);
    }

    if (stage === 'registered_only') continue;

    // Create blocks and slides
    for (const specimenId of specimenIds) {
      const blockCount = randInt(1, 3);
      for (let b = 1; b <= blockCount; b++) {
        const specCode = specimenId.split('-').slice(1).join('-');
        const blockId = `${orderId}-${specCode}${b}`;
        await prisma.block.create({
          data: {
            blockId,
            specimenId,
            blockNumber: b,
            createdDatetime: subtractDays(registeredDate, -randInt(1, 3)),
          },
        });

        if (heOrderable) {
          await prisma.ancillaryOrder.create({
            data: { orderId, blockId, orderableId: heOrderable.id, status: 'MICROTOMY' },
          });
        }

        const slideCount = randInt(1, 3);
        for (let sl = 1; sl <= slideCount; sl++) {
          const slideId = `${orderId}-${specCode}${b}-S${sl}`;
          await prisma.slide.create({
            data: {
              slideId,
              blockId,
              slideNumber: sl,
              slideType: pick(['H&E', 'H&E', 'H&E', 'Unstained', 'Special stain']),
            },
          });
        }
      }
    }

    if (stage === 'materials') continue;

    // Create a signed-out report
    const pathologist = pick(pathologists);
    const signedOutDate = subtractDays(registeredDate, -randInt(3, 14));
    const structuredReport = caseType === 'Cytology' ? pick(CYTOLOGY_STRUCTURED_REPORTS) : null;
    const report = await prisma.report.create({
      data: {
        orderId,
        versionNumber: 1,
        diagnosis: structuredReport?.diagnosis ?? pick(DIAGNOSES),
        comment: pick(COMMENTS),
        gross: pick(GROSS_DESCRIPTIONS),
        reportTemplateId: structuredReport ? undefined : pick(templateIds),
        synopticData: structuredReport?.synopticData,
        synopticPayload: structuredReport ? buildStructuredSeedPayload(structuredReport) : undefined,
        pathologistEmployeeId: pathologist.employeeId,
        createdAt: signedOutDate,
        signedOutDatetime: signedOutDate,
        isFinal: true,
      },
    });

    // Update order completed date
    await prisma.order.update({
      where: { orderId },
      data: { completedDate: signedOutDate },
    });

    if (stage === 'reactivated') {
      // Mark order reactivated and create v2 draft
      await prisma.order.update({
        where: { orderId },
        data: {
          isReactivated: true,
          reactivatedFromReportId: report.reportId,
          completedDate: null,
        },
      });

      await prisma.report.create({
        data: {
          orderId,
          versionNumber: 2,
          diagnosis: report.diagnosis ?? undefined,
          comment: report.comment ?? undefined,
          gross: report.gross ?? undefined,
          synopticData: report.synopticData ?? undefined,
          synopticPayload: report.synopticPayload ?? undefined,
          reportTemplateId: report.reportTemplateId ?? undefined,
          pathologistEmployeeId: pathologist.employeeId,
          createdAt: new Date(),
          isFinal: false,
          reactivationType: 'revise',
          supersedesReportId: report.reportId,
        },
      });
    }
  }

  console.log(`  ✓ ${ORDER_COUNT} orders with specimens, materials, and reports`);

  // ---------------------------------------------------------------------------
  // 10. Ancillary orderables and panels (default catalog)
  // ---------------------------------------------------------------------------

  // Helper to upsert an orderable and return its id
  async function upsertOrderable(name: string, category: 'HE_LEVELS' | 'IHC' | 'SPECIAL_STAIN' | 'MOLECULAR' | 'SEND_OUT', sortOrder: number): Promise<number> {
    const record = await prisma.ancillaryOrderable.upsert({
      where: { name_category: { name, category } },
      create: { name, category, sortOrder },
      update: { sortOrder },
    });
    return record.id;
  }

  // H&E Levels
  const heLevelsId = await upsertOrderable('H&E Levels', 'HE_LEVELS', 0);

  // Special Stains
  const specialStainNames = [
    'Periodic Acid Schiff (PAS)',
    'Grocott (GMS)',
    'Ziehl-Neelsen (ZN)',
    'Silver stain',
    'Reticulin',
  ];
  const specialStainIds: Record<string, number> = {};
  for (let i = 0; i < specialStainNames.length; i++) {
    specialStainIds[specialStainNames[i]] = await upsertOrderable(specialStainNames[i], 'SPECIAL_STAIN', i);
  }

  // IHC individual stains
  const ihcStainNames = [
    'ER', 'PR', 'HER2', 'Ki67',
    'CD20', 'CD3',
    'CD10', 'BCL6', 'MUM1', 'BCL2', 'Cyclin D1', 'CD30', 'CD15', 'Pax5',
    'CD117', 'DOG1',
    'MLH1', 'PMS2', 'MSH2', 'MSH6',
    'Synaptophysin', 'Chromogranin',
    'p16',
    'Desmin', 'Myogenin', 'S100', 'CD99',
  ];
  const ihcIds: Record<string, number> = {};
  for (let i = 0; i < ihcStainNames.length; i++) {
    ihcIds[ihcStainNames[i]] = await upsertOrderable(ihcStainNames[i], 'IHC', i);
  }

  // Molecular individual tests
  const molecularTestNames = [
    '22C3 (PD-L1)', 'SP263 (PD-L1)',
    'EGFR', 'Gene Fusion Panel',
    'MSI (Microsatellite Instability)', 'KRAS', 'NRAS', 'BRAF',
  ];
  const molecularIds: Record<string, number> = {};
  for (let i = 0; i < molecularTestNames.length; i++) {
    molecularIds[molecularTestNames[i]] = await upsertOrderable(molecularTestNames[i], 'MOLECULAR', i);
  }

  // Send-out tests
  const sendOutNames = ['Histology Review', 'Histology & IHC Review', 'Molecular Send-out'];
  for (let i = 0; i < sendOutNames.length; i++) {
    await upsertOrderable(sendOutNames[i], 'SEND_OUT', i);
  }

  // IHC Panels
  const ihcPanels: Array<{ name: string; stains: string[] }> = [
    { name: 'Breast Panel', stains: ['ER', 'PR', 'HER2', 'Ki67'] },
    { name: 'Lymphoma Starter Panel', stains: ['CD20', 'CD3', 'Ki67'] },
    { name: 'Lymphoma Extended Panel', stains: ['CD10', 'BCL6', 'MUM1', 'BCL2', 'Cyclin D1', 'CD30', 'CD15', 'Pax5'] },
    { name: 'GIST Panel', stains: ['CD117', 'DOG1'] },
    { name: 'MMR Panel', stains: ['MLH1', 'PMS2', 'MSH2', 'MSH6'] },
    { name: 'Gastric Panel', stains: ['HER2'] },
    { name: 'Neuroendocrine Panel', stains: ['Synaptophysin', 'Chromogranin', 'Ki67'] },
    { name: 'Head & Neck Panel', stains: ['p16'] },
    { name: 'Soft Tissue Core Panel', stains: ['Desmin', 'Myogenin', 'S100', 'CD99'] },
  ];

  for (let pi = 0; pi < ihcPanels.length; pi++) {
    const p = ihcPanels[pi];
    const panel = await prisma.ancillaryPanel.upsert({
      where: { name_category: { name: p.name, category: 'IHC' } },
      create: { name: p.name, category: 'IHC', sortOrder: pi },
      update: { sortOrder: pi },
    });
    for (const stain of p.stains) {
      const orderableId = ihcIds[stain];
      if (orderableId) {
        await prisma.ancillaryPanelItem.upsert({
          where: { panelId_orderableId: { panelId: panel.id, orderableId } },
          create: { panelId: panel.id, orderableId },
          update: {},
        });
      }
    }
  }

  // Molecular Panels
  const molecularPanels: Array<{ name: string; tests: string[] }> = [
    { name: 'PDL1 Panel', tests: ['22C3 (PD-L1)', 'SP263 (PD-L1)'] },
    { name: 'Lung Panel', tests: ['EGFR', 'Gene Fusion Panel'] },
    { name: 'Colorectal Panel', tests: ['MSI (Microsatellite Instability)', 'KRAS', 'NRAS', 'BRAF'] },
  ];

  for (let pi = 0; pi < molecularPanels.length; pi++) {
    const p = molecularPanels[pi];
    const panel = await prisma.ancillaryPanel.upsert({
      where: { name_category: { name: p.name, category: 'MOLECULAR' } },
      create: { name: p.name, category: 'MOLECULAR', sortOrder: pi },
      update: { sortOrder: pi },
    });
    for (const test of p.tests) {
      const orderableId = molecularIds[test];
      if (orderableId) {
        await prisma.ancillaryPanelItem.upsert({
          where: { panelId_orderableId: { panelId: panel.id, orderableId } },
          create: { panelId: panel.id, orderableId },
          update: {},
        });
      }
    }
  }

  // Suppress unused variable warning
  void heLevelsId;

  console.log('  ✓ Ancillary orderables and panels');
  console.log('✅ Seed complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
