/**
 * Script to generate all gross template i18n files in nested format.
 * Includes: title, field labels, option lists, other_specify labels, translated note defaults.
 * Run: node scripts/generate-i18n-nested.mjs
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = join(__dirname, '..', 'packages/shared/src/templates/assets');

function write(filePath, content) {
  writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n', 'utf8');
  console.log('Written:', filePath.replace(BASE, ''));
}

// ─── ENDOMETRIUM ─────────────────────────────────────────────────────────────
const endoBase = join(BASE, 'fgt.histology/fgt/gross');

const endoTitle = {
  ar: 'عينة استئصال بطانة الرحم (قالب الفحص العياني)',
  fr: 'Spécimen de résection de l\'endomètre (Modèle de macroscopie)',
  sw: 'Sampuli ya Upasuaji wa Endometriamu (Kiolezo cha Gross)',
  ur: 'اینڈومیٹریئم ریسیکشن نمونہ (گراسنگ ٹیمپلیٹ)',
};

const endoBody = {
  specimen: (t) => ({ label: t.specimen, fields: {
    anatomic_structures_included: { label: t.anatomic_structures_included },
    specimen_integrity: { label: t.specimen_integrity },
  }}),
  uterus: (t) => ({ label: t.uterus, fields: {
    uterus_dimensions_cm: { label: t.uterus_dimensions_cm },
    serosal_surface: { label: t.serosal_surface },
  }}),
  cervix: (t) => ({ label: t.cervix, fields: {
    dimensions: { label: t.dimensions },
    diameter_cm: { label: t.diameter_cm },
    length_cm: { label: t.length_cm },
    cervical_os: { label: t.cervical_os },
    portio_vaginalis: { label: t.portio_vaginalis },
  }}),
  vaginal_cuff: (t) => ({ label: t.vaginal_cuff, fields: {
    maximum_length_cm: { label: t.maximum_length_cm },
    minimum_length_cm: { label: t.minimum_length_cm },
    appearance: { label: t.appearance },
  }}),
  parametrium: (t) => ({ label: t.parametrium, fields: {
    left_parametrium_lateral_extent_cm: { label: t.left_parametrium_lateral_extent_cm },
    right_parametrium_lateral_extent_cm: { label: t.right_parametrium_lateral_extent_cm },
  }}),
  corpus: (t) => ({ label: t.corpus, fields: {
    endometrial_cavity_dimensions: { label: t.endometrial_cavity_dimensions },
    endometrial_thickness: { label: t.endometrial_thickness },
  }}),
  tumor: (t) => ({ label: t.tumor, fields: {
    tumor_site: { label: t.tumor_site },
    tumor_size_greatest_dimension_cm: { label: t.tumor_size_greatest_dimension_cm },
    tumor_size_additional_dimensions_cm: { label: t.tumor_size_additional_dimensions_cm },
    appearance: { label: t.appearance2 },
    myometrial_invasion_depth_cm: { label: t.myometrial_invasion_depth_cm },
    myometrial_thickness_cm: { label: t.myometrial_thickness_cm },
    lower_uterine_segment_involvement: { label: t.lower_uterine_segment_involvement },
    cervical_stromal_involvement: { label: t.cervical_stromal_involvement },
    distance_to_ectocervical_margin_cm: { label: t.distance_to_ectocervical_margin_cm },
    distance_to_paracervical_parametrial_margin_cm: { label: t.distance_to_paracervical_parametrial_margin_cm },
  }}),
  polyps: (t) => ({ label: t.polyps, fields: {
    location: { label: t.location },
    number: { label: t.number },
    dimensions: { label: t.dimensions },
    appearance: { label: t.appearance },
  }}),
  fibroids: (t) => ({ label: t.fibroids, fields: {
    location: { label: t.location },
    number: { label: t.number },
    dimensions: { label: t.dimensions },
    appearance: { label: t.appearance },
  }}),
  adnexa: (t) => ({ label: t.adnexa, fields: {
    left_fallopian_tube_dimensions: { label: t.left_fallopian_tube_dimensions },
    left_fallopian_tube_appearance: { label: t.left_fallopian_tube_appearance },
    left_ovary_dimensions: { label: t.left_ovary_dimensions },
    left_ovary_appearance: { label: t.left_ovary_appearance },
    right_fallopian_tube_dimensions: { label: t.right_fallopian_tube_dimensions },
    right_fallopian_tube_appearance: { label: t.right_fallopian_tube_appearance },
    right_ovary_dimensions: { label: t.right_ovary_dimensions },
    right_ovary_appearance: { label: t.right_ovary_appearance },
  }}),
  omentum: (t) => ({ label: t.omentum, fields: {
    dimensions: { label: t.dimensions },
    appearance: { label: t.appearance },
  }}),
  lymph_nodes: (t) => ({ label: t.lymph_nodes, fields: {
    left_pelvic_appearance: { label: t.left_pelvic },
    left_pelvic_number: { label: t.left_pelvic_number },
    left_pelvic_size_range: { label: t.left_pelvic_size_range },
    right_pelvic_appearance: { label: t.right_pelvic },
    right_pelvic_number: { label: t.right_pelvic_number },
    right_pelvic_size_range: { label: t.right_pelvic_size_range },
    left_para_aortic_appearance: { label: t.left_para_aortic },
    left_para_aortic_number: { label: t.left_para_aortic_number },
    left_para_aortic_size_range: { label: t.left_para_aortic_size_range },
    right_para_aortic_appearance: { label: t.right_para_aortic },
    right_para_aortic_number: { label: t.right_para_aortic_number },
    right_para_aortic_size_range: { label: t.right_para_aortic_size_range },
  }}),
  block_allocation_key: (t) => ({ label: t.block_allocation_key, fields: {
    full_thickness_endo_myometrium_with_tumor: { label: t.full_thickness_endo_myometrium_with_tumor },
    anterior_and_posterior_lower_uterine_segment: { label: t.anterior_and_posterior_lower_uterine_segment },
    anterior_and_posterior_cervix: { label: t.anterior_and_posterior_cervix },
    ectocervical_margin: { label: t.ectocervical_margin },
    left_parametrium_paracervical_margin: { label: t.left_parametrium_paracervical_margin },
    right_parametrium_paracervical_margin: { label: t.right_parametrium_paracervical_margin },
    left_fallopian_tube: { label: t.left_fallopian_tube },
    left_ovary: { label: t.left_ovary },
    right_fallopian_tube: { label: t.right_fallopian_tube },
    right_ovary: { label: t.right_ovary },
    omentum: { label: t.omentum_block },
    lymph_nodes: { label: t.lymph_nodes_block },
  }}),
  grossing: (t) => ({ label: t.grossing, fields: {
    grossed_by: { label: t.grossed_by },
    date: { label: t.date },
  }}),
};

const endoTranslations = {
  ar: {
    specimen: 'العينة', anatomic_structures_included: 'التراكيب التشريحية المشمولة في العينة المقدمة', specimen_integrity: 'سلامة العينة',
    uterus: 'الرحم', uterus_dimensions_cm: 'أبعاد الرحم (سم)', serosal_surface: 'السطح المصلي',
    cervix: 'عنق الرحم', dimensions: 'الأبعاد', diameter_cm: 'القطر (سم)', length_cm: 'الطول (سم)', cervical_os: 'فوهة عنق الرحم', portio_vaginalis: 'الجزء المهبلي من عنق الرحم',
    vaginal_cuff: 'قبة المهبل', maximum_length_cm: 'أقصى طول (سم)', minimum_length_cm: 'أدنى طول (سم)', appearance: 'المظهر',
    parametrium: 'المشيماء', left_parametrium_lateral_extent_cm: 'الامتداد الجانبي للمشيماء الأيسر (سم)', right_parametrium_lateral_extent_cm: 'الامتداد الجانبي للمشيماء الأيمن (سم)',
    corpus: 'جسم الرحم', endometrial_cavity_dimensions: 'أبعاد تجويف بطانة الرحم', endometrial_thickness: 'سماكة بطانة الرحم',
    tumor: 'الورم', tumor_site: 'موقع الورم', tumor_size_greatest_dimension_cm: 'أكبر بُعد (سم)', tumor_size_additional_dimensions_cm: 'أبعاد إضافية (سم)',
    appearance2: 'المظهر', myometrial_invasion_depth_cm: 'عمق الغزو (سم)', myometrial_thickness_cm: 'سماكة عضل الرحم (سم)',
    lower_uterine_segment_involvement: 'إصابة الجزء السفلي من الرحم', cervical_stromal_involvement: 'إصابة سدى عنق الرحم',
    distance_to_ectocervical_margin_cm: 'المسافة إلى هامش الجزء الخارجي لعنق الرحم (سم)', distance_to_paracervical_parametrial_margin_cm: 'المسافة إلى الهامش المجاور للرحم/المشيماء (سم)',
    polyps: 'السلائل', location: 'الموقع', number: 'العدد',
    fibroids: 'الأورام الليفية',
    adnexa: 'الزوائد الرحمية', left_fallopian_tube_dimensions: 'قناة فالوب اليسرى', left_fallopian_tube_appearance: 'مظهر قناة فالوب اليسرى',
    left_ovary_dimensions: 'المبيض الأيسر', left_ovary_appearance: 'مظهر المبيض الأيسر',
    right_fallopian_tube_dimensions: 'قناة فالوب اليمنى', right_fallopian_tube_appearance: 'مظهر قناة فالوب اليمنى',
    right_ovary_dimensions: 'المبيض الأيمن', right_ovary_appearance: 'مظهر المبيض الأيمن',
    omentum: 'الثرب',
    lymph_nodes: 'العقد اللمفاوية',
    left_pelvic: 'العقد اللمفاوية الحوضية اليسرى', left_pelvic_number: 'عدد العقد الحوضية اليسرى', left_pelvic_size_range: 'نطاق حجم العقد الحوضية اليسرى',
    right_pelvic: 'العقد اللمفاوية الحوضية اليمنى', right_pelvic_number: 'عدد العقد الحوضية اليمنى', right_pelvic_size_range: 'نطاق حجم العقد الحوضية اليمنى',
    left_para_aortic: 'العقد اللمفاوية المجاورة للشريان الأورطي اليسرى', left_para_aortic_number: 'عدد العقد المجاورة للشريان الأورطي اليسرى', left_para_aortic_size_range: 'نطاق حجم العقد المجاورة للشريان الأورطي اليسرى',
    right_para_aortic: 'العقد اللمفاوية المجاورة للشريان الأورطي اليمنى', right_para_aortic_number: 'عدد العقد المجاورة للشريان الأورطي اليمنى', right_para_aortic_size_range: 'نطاق حجم العقد المجاورة للشريان الأورطي اليمنى',
    block_allocation_key: 'مفتاح توزيع الكتل',
    full_thickness_endo_myometrium_with_tumor: 'بطانة/عضلة الرحم بكامل السماكة مع الورم',
    anterior_and_posterior_lower_uterine_segment: 'الجزء السفلي الأمامي والخلفي من الرحم',
    anterior_and_posterior_cervix: 'عنق الرحم الأمامي والخلفي', ectocervical_margin: 'هامش الجزء الخارجي لعنق الرحم',
    left_parametrium_paracervical_margin: 'الهامش المشيمائي/المجاور لعنق الرحم الأيسر',
    right_parametrium_paracervical_margin: 'الهامش المشيمائي/المجاور لعنق الرحم الأيمن',
    left_fallopian_tube: 'قناة فالوب اليسرى', left_ovary: 'المبيض الأيسر',
    right_fallopian_tube: 'قناة فالوب اليمنى', right_ovary: 'المبيض الأيمن',
    omentum_block: 'الثرب', lymph_nodes_block: 'العقد اللمفاوية',
    grossing: 'الفحص العياني', grossed_by: 'أُجري الفحص العياني بواسطة', date: 'التاريخ',
  },
  fr: {
    specimen: 'Spécimen', anatomic_structures_included: 'Structures anatomiques incluses dans le spécimen soumis', specimen_integrity: 'Intégrité du spécimen',
    uterus: 'Utérus', uterus_dimensions_cm: "Dimensions de l'utérus (cm)", serosal_surface: 'Surface séreuse',
    cervix: "Col de l'utérus", dimensions: 'Dimensions', diameter_cm: 'Diamètre (cm)', length_cm: 'Longueur (cm)', cervical_os: 'Orifice cervical', portio_vaginalis: 'Portion vaginale',
    vaginal_cuff: 'Manchon vaginal', maximum_length_cm: 'Longueur maximale (cm)', minimum_length_cm: 'Longueur minimale (cm)', appearance: 'Aspect',
    parametrium: 'Paramètre', left_parametrium_lateral_extent_cm: 'Extension latérale du paramètre gauche (cm)', right_parametrium_lateral_extent_cm: 'Extension latérale du paramètre droit (cm)',
    corpus: 'Corps utérin', endometrial_cavity_dimensions: 'Dimensions de la cavité endométriale', endometrial_thickness: "Épaisseur de l'endomètre",
    tumor: 'Tumeur', tumor_site: 'Site tumoral', tumor_size_greatest_dimension_cm: 'Plus grande dimension (cm)', tumor_size_additional_dimensions_cm: 'Dimensions supplémentaires (cm)',
    appearance2: 'Aspect', myometrial_invasion_depth_cm: "Profondeur d'invasion (cm)", myometrial_thickness_cm: 'Épaisseur du myomètre (cm)',
    lower_uterine_segment_involvement: "Atteinte du segment inférieur de l'utérus", cervical_stromal_involvement: 'Atteinte du stroma cervical',
    distance_to_ectocervical_margin_cm: 'Marge ectocervicale (cm)', distance_to_paracervical_parametrial_margin_cm: 'Marge paracervicale/paramétriale (cm)',
    polyps: 'Polypes', location: 'Localisation', number: 'Nombre',
    fibroids: 'Fibromes',
    adnexa: 'Annexes', left_fallopian_tube_dimensions: 'Trompe de Fallope gauche', left_fallopian_tube_appearance: 'Aspect de la trompe de Fallope gauche',
    left_ovary_dimensions: 'Ovaire gauche', left_ovary_appearance: "Aspect de l'ovaire gauche",
    right_fallopian_tube_dimensions: 'Trompe de Fallope droite', right_fallopian_tube_appearance: 'Aspect de la trompe de Fallope droite',
    right_ovary_dimensions: 'Ovaire droit', right_ovary_appearance: "Aspect de l'ovaire droit",
    omentum: 'Épiploon',
    lymph_nodes: 'Ganglions lymphatiques',
    left_pelvic: 'Ganglions lymphatiques pelviens gauches', left_pelvic_number: 'Nombre de ganglions pelviens gauches', left_pelvic_size_range: 'Plage de tailles des ganglions pelviens gauches',
    right_pelvic: 'Ganglions lymphatiques pelviens droits', right_pelvic_number: 'Nombre de ganglions pelviens droits', right_pelvic_size_range: 'Plage de tailles des ganglions pelviens droits',
    left_para_aortic: 'Ganglions lymphatiques para-aortiques gauches', left_para_aortic_number: 'Nombre de ganglions para-aortiques gauches', left_para_aortic_size_range: 'Plage de tailles des ganglions para-aortiques gauches',
    right_para_aortic: 'Ganglions lymphatiques para-aortiques droits', right_para_aortic_number: 'Nombre de ganglions para-aortiques droits', right_para_aortic_size_range: 'Plage de tailles des ganglions para-aortiques droits',
    block_allocation_key: "Clé d'attribution des blocs",
    full_thickness_endo_myometrium_with_tumor: 'Endomyomètre pleine épaisseur avec tumeur',
    anterior_and_posterior_lower_uterine_segment: "Segment inférieur antérieur et postérieur de l'utérus",
    anterior_and_posterior_cervix: 'Col antérieur et postérieur', ectocervical_margin: 'Marge ectocervicale',
    left_parametrium_paracervical_margin: 'Marge paramétriale/paracervicale gauche',
    right_parametrium_paracervical_margin: 'Marge paramétriale/paracervicale droite',
    left_fallopian_tube: 'Trompe de Fallope gauche', left_ovary: 'Ovaire gauche',
    right_fallopian_tube: 'Trompe de Fallope droite', right_ovary: 'Ovaire droit',
    omentum_block: 'Épiploon', lymph_nodes_block: 'Ganglions lymphatiques',
    grossing: 'Macroscopie', grossed_by: 'Macroscopie réalisée par', date: 'Date',
  },
  sw: {
    specimen: 'Sampuli', anatomic_structures_included: 'Miundo ya anatomia iliyojumuishwa katika sampuli iliyowasilishwa', specimen_integrity: 'Uadilifu wa sampuli',
    uterus: 'Mfuko wa uzazi', uterus_dimensions_cm: 'Vipimo vya mfuko wa uzazi (cm)', serosal_surface: 'Uso wa serosa',
    cervix: 'Mlango wa mfuko wa uzazi', dimensions: 'Vipimo', diameter_cm: 'Kipenyo (cm)', length_cm: 'Urefu (cm)', cervical_os: 'Tundu la mlango wa mfuko wa uzazi', portio_vaginalis: 'Sehemu ya uke ya mlango wa mfuko wa uzazi',
    vaginal_cuff: 'Kisiki cha uke', maximum_length_cm: 'Urefu wa juu zaidi (cm)', minimum_length_cm: 'Urefu wa chini zaidi (cm)', appearance: 'Mwonekano',
    parametrium: 'Tishu inayozunguka mfuko wa uzazi', left_parametrium_lateral_extent_cm: 'Upanuzi wa upande wa tishu inayozunguka mfuko wa uzazi (kushoto) (cm)', right_parametrium_lateral_extent_cm: 'Upanuzi wa upande wa tishu inayozunguka mfuko wa uzazi (kulia) (cm)',
    corpus: 'Mwili wa mfuko wa uzazi', endometrial_cavity_dimensions: 'Vipimo vya tundu la endometriamu', endometrial_thickness: 'Unene wa endometriamu',
    tumor: 'Uvimbe', tumor_site: 'Eneo la uvimbe', tumor_size_greatest_dimension_cm: 'Kipimo kikubwa zaidi (cm)', tumor_size_additional_dimensions_cm: 'Vipimo vya ziada (cm)',
    appearance2: 'Mwonekano', myometrial_invasion_depth_cm: 'Kina cha uvamizi (cm)', myometrial_thickness_cm: 'Unene wa myometriamu (cm)',
    lower_uterine_segment_involvement: 'Ushiriki wa sehemu ya chini ya mfuko wa uzazi', cervical_stromal_involvement: 'Ushiriki wa stroma ya mlango wa mfuko wa uzazi',
    distance_to_ectocervical_margin_cm: 'Umbali hadi kingo ya ectocervix (cm)', distance_to_paracervical_parametrial_margin_cm: 'Umbali hadi kingo ya paracervical/parametrial (cm)',
    polyps: 'Polipu', location: 'Mahali', number: 'Idadi',
    fibroids: 'Misuli ya nyuzi',
    adnexa: 'Viungo vya pembeni vya mfuko wa uzazi', left_fallopian_tube_dimensions: 'Mrija wa fallopian wa kushoto', left_fallopian_tube_appearance: 'Mwonekano wa mrija wa fallopian wa kushoto',
    left_ovary_dimensions: 'Ovari ya kushoto', left_ovary_appearance: 'Mwonekano wa ovari ya kushoto',
    right_fallopian_tube_dimensions: 'Mrija wa fallopian wa kulia', right_fallopian_tube_appearance: 'Mwonekano wa mrija wa fallopian wa kulia',
    right_ovary_dimensions: 'Ovari ya kulia', right_ovary_appearance: 'Mwonekano wa ovari ya kulia',
    omentum: 'Omentamu',
    lymph_nodes: 'Nodi za limfu',
    left_pelvic: 'Nodi za limfu za nyonga (kushoto)', left_pelvic_number: 'Idadi ya nodi za nyonga (kushoto)', left_pelvic_size_range: 'Kiwango cha ukubwa wa nodi za nyonga (kushoto)',
    right_pelvic: 'Nodi za limfu za nyonga (kulia)', right_pelvic_number: 'Idadi ya nodi za nyonga (kulia)', right_pelvic_size_range: 'Kiwango cha ukubwa wa nodi za nyonga (kulia)',
    left_para_aortic: 'Nodi za limfu za para-aortiki (kushoto)', left_para_aortic_number: 'Idadi ya nodi za para-aortiki (kushoto)', left_para_aortic_size_range: 'Kiwango cha ukubwa wa nodi za para-aortiki (kushoto)',
    right_para_aortic: 'Nodi za limfu za para-aortiki (kulia)', right_para_aortic_number: 'Idadi ya nodi za para-aortiki (kulia)', right_para_aortic_size_range: 'Kiwango cha ukubwa wa nodi za para-aortiki (kulia)',
    block_allocation_key: 'Ufunguo wa ugawaji wa vitalu',
    full_thickness_endo_myometrium_with_tumor: 'Endomyometriamu yote kwa unene kamili pamoja na uvimbe',
    anterior_and_posterior_lower_uterine_segment: 'Sehemu ya chini ya mfuko wa uzazi (mbele na nyuma)',
    anterior_and_posterior_cervix: 'Mlango wa mfuko wa uzazi (mbele na nyuma)', ectocervical_margin: 'Kingo ya ectocervix',
    left_parametrium_paracervical_margin: 'Kingo ya parametrial/paracervical (kushoto)',
    right_parametrium_paracervical_margin: 'Kingo ya parametrial/paracervical (kulia)',
    left_fallopian_tube: 'Mrija wa fallopian wa kushoto', left_ovary: 'Ovari ya kushoto',
    right_fallopian_tube: 'Mrija wa fallopian wa kulia', right_ovary: 'Ovari ya kulia',
    omentum_block: 'Omentamu', lymph_nodes_block: 'Nodi za limfu',
    grossing: 'Uchunguzi wa makroskopia', grossed_by: 'Imefanyiwa grossing na', date: 'Tarehe',
  },
  ur: {
    specimen: 'نمونہ', anatomic_structures_included: 'پیش کردہ نمونے میں شامل اناٹومیکل ڈھانچے', specimen_integrity: 'نمونے کی سالمیت',
    uterus: 'بچہ دانی', uterus_dimensions_cm: 'بچہ دانی کے ابعاد (سم)', serosal_surface: 'سیروسل سطح',
    cervix: 'سروکس', dimensions: 'ابعاد', diameter_cm: 'قطر (سم)', length_cm: 'لمبائی (سم)', cervical_os: 'سرویکل اوس', portio_vaginalis: 'پورٹیو ویجائنیلس',
    vaginal_cuff: 'ویجائنل کف', maximum_length_cm: 'زیادہ سے زیادہ لمبائی (سم)', minimum_length_cm: 'کم از کم لمبائی (سم)', appearance: 'ظاہری حالت',
    parametrium: 'پیرامیٹریئم', left_parametrium_lateral_extent_cm: 'بائیں پیرامیٹریئم کی جانبی حد (سم)', right_parametrium_lateral_extent_cm: 'دائیں پیرامیٹریئم کی جانبی حد (سم)',
    corpus: 'بچہ دانی کا جسم', endometrial_cavity_dimensions: 'اینڈومیٹریل گہا کے ابعاد', endometrial_thickness: 'اینڈومیٹریئم کی موٹائی',
    tumor: 'رسولی', tumor_site: 'رسولی کا مقام', tumor_size_greatest_dimension_cm: 'سب سے بڑا بُعد (سم)', tumor_size_additional_dimensions_cm: 'اضافی ابعاد (سم)',
    appearance2: 'ظاہری حالت', myometrial_invasion_depth_cm: 'انویژن کی گہرائی (سم)', myometrial_thickness_cm: 'مایومیٹریئم کی موٹائی (سم)',
    lower_uterine_segment_involvement: 'نچلے یوٹرائن سیگمنٹ کی شمولیت', cervical_stromal_involvement: 'سرویکل اسٹروما کی شمولیت',
    distance_to_ectocervical_margin_cm: 'ایکٹوسرویکل مارجن تک فاصلہ (سم)', distance_to_paracervical_parametrial_margin_cm: 'پیراسرویکل/پیرامیٹریل مارجن تک فاصلہ (سم)',
    polyps: 'پولیپس', location: 'مقام', number: 'تعداد',
    fibroids: 'فائبرائیڈز',
    adnexa: 'اینڈنیکسا', left_fallopian_tube_dimensions: 'بائیں فیلوپین ٹیوب', left_fallopian_tube_appearance: 'بائیں فیلوپین ٹیوب کی حالت',
    left_ovary_dimensions: 'بائیں بیضہ دانی', left_ovary_appearance: 'بائیں بیضہ دانی کی حالت',
    right_fallopian_tube_dimensions: 'دائیں فیلوپین ٹیوب', right_fallopian_tube_appearance: 'دائیں فیلوپین ٹیوب کی حالت',
    right_ovary_dimensions: 'دائیں بیضہ دانی', right_ovary_appearance: 'دائیں بیضہ دانی کی حالت',
    omentum: 'اومینٹم',
    lymph_nodes: 'لمف نوڈز',
    left_pelvic: 'بائیں پیلوک لمف نوڈز', left_pelvic_number: 'بائیں پیلوک لمف نوڈز کی تعداد', left_pelvic_size_range: 'بائیں پیلوک لمف نوڈز کا سائز',
    right_pelvic: 'دائیں پیلوک لمف نوڈز', right_pelvic_number: 'دائیں پیلوک لمف نوڈز کی تعداد', right_pelvic_size_range: 'دائیں پیلوک لمف نوڈز کا سائز',
    left_para_aortic: 'بائیں پیرا-آرٹک لمف نوڈز', left_para_aortic_number: 'بائیں پیرا-آرٹک لمف نوڈز کی تعداد', left_para_aortic_size_range: 'بائیں پیرا-آرٹک لمف نوڈز کا سائز',
    right_para_aortic: 'دائیں پیرا-آرٹک لمف نوڈز', right_para_aortic_number: 'دائیں پیرا-آرٹک لمف نوڈز کی تعداد', right_para_aortic_size_range: 'دائیں پیرا-آرٹک لمف نوڈز کا سائز',
    block_allocation_key: 'بلاک الاٹمنٹ کلید',
    full_thickness_endo_myometrium_with_tumor: 'رسولی کے ساتھ مکمل موٹائی کا اینڈو مایومیٹریئم',
    anterior_and_posterior_lower_uterine_segment: 'نچلے یوٹرائن سیگمنٹ کا اگلا اور پچھلا حصہ',
    anterior_and_posterior_cervix: 'سروکس کا اگلا اور پچھلا حصہ', ectocervical_margin: 'ایکٹوسرویکل مارجن',
    left_parametrium_paracervical_margin: 'بائیں پیرامیٹریل/پیراسرویکل مارجن',
    right_parametrium_paracervical_margin: 'دائیں پیرامیٹریل/پیراسرویکل مارجن',
    left_fallopian_tube: 'بائیں فیلوپین ٹیوب', left_ovary: 'بائیں بیضہ دانی',
    right_fallopian_tube: 'دائیں فیلوپین ٹیوب', right_ovary: 'دائیں بیضہ دانی',
    omentum_block: 'اومینٹم', lymph_nodes_block: 'لمف نوڈز',
    grossing: 'گراس', grossed_by: 'گراس کیا گیا بذریعہ', date: 'تاریخ',
  },
};

function buildEndoI18n(lang) {
  const t = endoTranslations[lang];
  const sections = {};
  for (const [key, builder] of Object.entries(endoBody)) {
    sections[key] = builder(t);
  }
  return { title: endoTitle[lang], ...sections };
}

for (const lang of ['ar', 'fr', 'sw', 'ur']) {
  write(join(endoBase, `endometrium_resection_gross.i18n_${lang}.json`), buildEndoI18n(lang));
}

// ─── OVARY ────────────────────────────────────────────────────────────────────
const ovaryProcs_ar = [
  'استئصال الرحم الكلي مع استئصال قناتي فالوب والمبيضين ثنائي الجانب',
  'استئصال الرحم الجذري', 'استئصال الرحم البسيط', 'استئصال الرحم فوق عنق الرحم',
  'استئصال قناتي فالوب والمبيضين ثنائي الجانب',
  'استئصال قناة فالوب والمبيض الأيمن', 'استئصال قناة فالوب والمبيض الأيسر',
  'استئصال قناة فالوب والمبيض، الجانب غير محدد',
  'استئصال المبيض الأيمن', 'استئصال المبيض الأيسر', 'استئصال المبيض، الجانب غير محدد',
  'استئصال قناتي فالوب ثنائي الجانب', 'استئصال قناة فالوب اليمنى', 'استئصال قناة فالوب اليسرى',
  'استئصال قناة فالوب، الجانب غير محدد', 'استئصال الثرب', 'خزعات صفاقية',
  'استئصال كتلة الورم الصفاقي لتقليل حجمه', 'غسل صفاقي', 'غسل حوضي',
  'سائل استسقائي', 'بزل جنبي (سائل جنبي)', 'أخرى (يُحدد)',
];
const ovaryProcs_fr = [
  'Hystérectomie totale avec salpingo-ovariectomie bilatérale', 'Hystérectomie radicale',
  'Hystérectomie simple', 'Hystérectomie supracervicale', 'Salpingo-ovariectomie bilatérale',
  'Salpingo-ovariectomie droite', 'Salpingo-ovariectomie gauche',
  'Salpingo-ovariectomie, côté non précisé', 'Ovariectomie droite', 'Ovariectomie gauche',
  'Ovariectomie, côté non précisé', 'Salpingectomie bilatérale', 'Salpingectomie droite',
  'Salpingectomie gauche', 'Salpingectomie, côté non précisé', 'Omentectomie',
  'Biopsies péritonéales', 'Réduction tumorale péritonéale', 'Lavage péritonéal',
  'Lavage pelvien', 'Liquide d\'ascite', 'Pleurocentèse (liquide pleural)', 'Autre (préciser)',
];
const ovaryProcs_sw = [
  'Kuondoa uterasi yote pamoja na mirija ya fallopian na ovari zote mbili',
  'Kuondoa uterasi kwa upana', 'Kuondoa uterasi kwa kawaida', 'Kuondoa uterasi huku shingo ya kizazi ikiachwa',
  'Kuondoa mirija ya fallopian na ovari zote mbili', 'Kuondoa mrija wa fallopian na ovari ya kulia',
  'Kuondoa mrija wa fallopian na ovari ya kushoto', 'Kuondoa mrija wa fallopian na ovari, upande haujabainishwa',
  'Kuondoa ovari ya kulia', 'Kuondoa ovari ya kushoto', 'Kuondoa ovari, upande haujabainishwa',
  'Kuondoa mirija yote miwili ya fallopian', 'Kuondoa mrija wa fallopian wa kulia',
  'Kuondoa mrija wa fallopian wa kushoto', 'Kuondoa mrija wa fallopian, upande haujabainishwa',
  'Kuondoa omentamu', 'Biopsi za peritoneum', 'Kupunguza mzigo wa uvimbe wa peritoneum',
  'Uoshaji wa peritoneum', 'Uoshaji wa nyonga', 'Majimaji ya ascites',
  'Pleurocentesis (majimaji ya pleura)', 'Nyingine (taja)',
];
const ovaryProcs_ur = [
  'کل ہسٹریکٹومی اور دونوں طرف سالپنگو-اوفوریکٹومی', 'ریڈیکل ہسٹریکٹومی',
  'سادہ ہسٹریکٹومی', 'سپرا سروائیکل ہسٹریکٹومی', 'دونوں طرف سالپنگو-اوفوریکٹومی',
  'دائیں طرف سالپنگو-اوفوریکٹومی', 'بائیں طرف سالپنگو-اوفوریکٹومی',
  'سالپنگو-اوفوریکٹومی، طرف متعین نہیں', 'دائیں اوفوریکٹومی', 'بائیں اوفوریکٹومی',
  'اوفوریکٹومی، طرف متعین نہیں', 'دونوں طرف سالپنگیکٹومی', 'دائیں سالپنگیکٹومی',
  'بائیں سالپنگیکٹومی', 'سالپنگیکٹومی، طرف متعین نہیں', 'اومینٹیکٹومی',
  'پیریٹونیل بایوپسیاں', 'پیریٹونیل ٹیومر ڈیبَلکنگ', 'پیریٹونیل واشنگ',
  'پیلوک واشنگ', 'ایسائٹک فلوئڈ', 'پلیوروسینٹیسس (پلیورل فلوئڈ)', 'دیگر (واضح کریں)',
];
const hystTypes_ar = ['بطني', 'مهبلي', 'مهبلي بمساعدة تنظير البطن', 'بالمنظار', 'بالمنظار بمساعدة الروبوت', 'أخرى (يُحدد)', 'غير محدد'];
const hystTypes_fr = ['Abdominale', 'Vaginale', 'Vaginale assistée par laparoscopie', 'Laparoscopique', 'Laparoscopique assistée par robot', 'Autre (préciser)', 'Non précisé'];
const hystTypes_sw = ['Kupitia tumbo', 'Kupitia uke', 'Kupitia uke, kwa msaada wa laparoskopia', 'Kwa laparoskopia', 'Kwa laparoskopia, kwa msaada wa roboti', 'Nyingine (taja)', 'Haijabainishwa'];
const hystTypes_ur = ['ایبڈومینل', 'ویجائنل', 'ویجائنل، لیپروسکوپک معاونت کے ساتھ', 'لیپروسکوپک', 'لیپروسکوپک، روبوٹک معاونت کے ساتھ', 'دیگر (واضح کریں)', 'متعین نہیں'];

function buildOvaryI18n({ title, procs, hystTypes, notApplicable,
  specimenLabel, specimenIntegrityNote, specimenIntegrityApplicability,
  otherSpecify,
  ovarianIntegrityLabel, ovaryIntegrityOpts, ruptureTimeOpts,
  rightOvary, leftOvary, ovaryUnspecified,
  ftIntegrityLabel, ftIntegrityOpts, rightFT, leftFT, ftUnspecified,
  uterusIntegrityLabel, uterusIntegrityOpts,
  blockLabel, blockFields,
  grossingLabel, grossedBy, date,
}) {
  return {
    title,
    specimen: { label: specimenLabel, fields: {
      procedure: { label: procs[0], options: procs.slice(1), other_specify: otherSpecify },
      hysterectomy_type: { label: hystTypes[0], options: hystTypes.slice(1), other_specify: otherSpecify },
      specimen_integrity_note: { label: specimenIntegrityNote },
      specimen_integrity_applicability: { label: specimenIntegrityApplicability, options: [notApplicable] },
    }},
    ovarian_integrity: { label: ovarianIntegrityLabel, fields: {
      right_ovary_present: { label: rightOvary },
      right_ovary_integrity: { label: rightOvary + ' – ' + ovaryIntegrityOpts[0], options: ovaryIntegrityOpts, other_specify: otherSpecify },
      right_ovary_time_of_rupture: { label: ruptureTimeOpts[0], options: ruptureTimeOpts },
      left_ovary_present: { label: leftOvary },
      left_ovary_integrity: { label: leftOvary + ' – ' + ovaryIntegrityOpts[0], options: ovaryIntegrityOpts, other_specify: otherSpecify },
      left_ovary_time_of_rupture: { label: ruptureTimeOpts[0], options: ruptureTimeOpts },
      ovary_laterality_not_specified_present: { label: ovaryUnspecified },
      ovary_laterality_not_specified_integrity: { label: ovaryUnspecified + ' – ' + ovaryIntegrityOpts[0], options: ovaryIntegrityOpts, other_specify: otherSpecify },
      ovary_laterality_not_specified_time_of_rupture: { label: ruptureTimeOpts[0], options: ruptureTimeOpts },
    }},
    fallopian_tube_integrity: { label: ftIntegrityLabel, fields: {
      right_fallopian_tube_present: { label: rightFT },
      right_fallopian_tube_integrity: { label: rightFT + ' – ' + ftIntegrityOpts[0], options: ftIntegrityOpts, other_specify: otherSpecify },
      left_fallopian_tube_present: { label: leftFT },
      left_fallopian_tube_integrity: { label: leftFT + ' – ' + ftIntegrityOpts[0], options: ftIntegrityOpts, other_specify: otherSpecify },
      fallopian_tube_laterality_not_specified_present: { label: ftUnspecified },
      fallopian_tube_laterality_not_specified_integrity: { label: ftUnspecified + ' – ' + ftIntegrityOpts[0], options: ftIntegrityOpts, other_specify: otherSpecify },
    }},
    uterus_integrity: { label: uterusIntegrityLabel, fields: {
      status: { label: uterusIntegrityLabel, options: uterusIntegrityOpts, other_specify: otherSpecify },
    }},
    block_allocation_key: { label: blockLabel, fields: blockFields },
    grossing: { label: grossingLabel, fields: {
      grossed_by: { label: grossedBy },
      date: { label: date },
    }},
  };
}

const ovaryBlockFields_ar = {
  tumor_representative_sections: { label: 'الورم (مقاطع ممثلة – مناطق صلبة وكيسية وحليمية)' },
  tumor_capsule_interface: { label: 'واجهة الورم مع المحفظة' },
  capsule_non_tumor_areas: { label: 'المحفظة (مناطق غير ورمية)' },
  fallopian_tube_fimbrial_end: { label: 'قناة فالوب (النهاية الخملية)' },
  fallopian_tube_cross_sections: { label: 'قناة فالوب (مقاطع عرضية)' },
  contralateral_ovary_if_present: { label: 'المبيض المقابل (إن وجد)' },
  endometrium: { label: 'بطانة الرحم' },
  myometrium: { label: 'عضل الرحم' },
  cervix: { label: 'عنق الرحم' },
  omentum: { label: 'الثرب' },
  lymph_nodes: { label: 'العقد اللمفية' },
};
const ovaryBlockFields_fr = {
  tumor_representative_sections: { label: 'Tumeur (sections représentatives – zones solides, kystiques, papillaires)' },
  tumor_capsule_interface: { label: 'Interface tumeur-capsule' },
  capsule_non_tumor_areas: { label: 'Capsule (zones non tumorales)' },
  fallopian_tube_fimbrial_end: { label: 'Trompe de Fallope (extrémité fimbriale)' },
  fallopian_tube_cross_sections: { label: 'Trompe de Fallope (coupes transversales)' },
  contralateral_ovary_if_present: { label: 'Ovaire controlatéral (si présent)' },
  endometrium: { label: 'Endomètre' },
  myometrium: { label: 'Myomètre' },
  cervix: { label: 'Col de l\'utérus' },
  omentum: { label: 'Épiploon' },
  lymph_nodes: { label: 'Ganglions lymphatiques' },
};
const ovaryBlockFields_sw = {
  tumor_representative_sections: { label: 'Uvimbe (sehemu wakilishi – maeneo imara, ya kisti, na papillari)' },
  tumor_capsule_interface: { label: 'Kiunganishi kati ya uvimbe na kapsuli' },
  capsule_non_tumor_areas: { label: 'Kapsuli (maeneo yasiyo na uvimbe)' },
  fallopian_tube_fimbrial_end: { label: 'Mrija wa fallopian (mwisho wa fimbria)' },
  fallopian_tube_cross_sections: { label: 'Mrija wa fallopian (sehemu za kukatiza)' },
  contralateral_ovary_if_present: { label: 'Ovari ya upande mwingine (ikiwa ipo)' },
  endometrium: { label: 'Endometriamu' },
  myometrium: { label: 'Myometriamu' },
  cervix: { label: 'Shingo ya kizazi' },
  omentum: { label: 'Omentamu' },
  lymph_nodes: { label: 'Tezi za limfu' },
};
const ovaryBlockFields_ur = {
  tumor_representative_sections: { label: 'ٹیومر (نمائندہ حصے – ٹھوس، سسٹک، پیپلیری علاقے)' },
  tumor_capsule_interface: { label: 'ٹیومر-کیپسول انٹرفیس' },
  capsule_non_tumor_areas: { label: 'کیپسول (غیر ٹیومر علاقے)' },
  fallopian_tube_fimbrial_end: { label: 'فیلوپیئن ٹیوب (فمبریئل اختتام)' },
  fallopian_tube_cross_sections: { label: 'فیلوپیئن ٹیوب (کراس سیکشنز)' },
  contralateral_ovary_if_present: { label: 'مخالف سمت کا اووری (اگر موجود ہو)' },
  endometrium: { label: 'اینڈومیٹریئم' },
  myometrium: { label: 'مایومیٹریئم' },
  cervix: { label: 'سروکس' },
  omentum: { label: 'اومینٹم' },
  lymph_nodes: { label: 'لمف نوڈز' },
};

write(join(endoBase, 'ovary_fallopian_tube_primary_peritoneum_gross.i18n_ar.json'), buildOvaryI18n({
  title: 'المبيض أو قناة فالوب أو الصفاق الأولي (قالب الفحص العياني)',
  otherSpecify: 'أخرى (يُحدد)',
  procs: ['الإجراء (اختر كل ما ينطبق)', ...ovaryProcs_ar],
  hystTypes: ['نوع استئصال الرحم', ...hystTypes_ar],
  notApplicable: 'غير منطبق',
  specimenLabel: 'العينة',
  specimenIntegrityNote: 'ملاحظة سلامة العينة',
  specimenIntegrityApplicability: 'انطباقية سلامة العينة',
  ovarianIntegrityLabel: 'سلامة المبيض',
  ovaryIntegrityOpts: ['المحفظة سليمة', 'المحفظة ممزقة', 'مجزأ', 'أخرى (يُحدد)'],
  ruptureTimeOpts: ['وقت التمزق', 'قبل الجراحة', 'أثناء الجراحة', 'غير معروف'],
  rightOvary: 'المبيض الأيمن', leftOvary: 'المبيض الأيسر', ovaryUnspecified: 'المبيض، الجهة غير محددة',
  ftIntegrityLabel: 'سلامة قناة فالوب',
  ftIntegrityOpts: ['المصلية سليمة', 'المصلية ممزقة', 'مجزأ', 'أخرى (يُحدد)'],
  rightFT: 'قناة فالوب اليمنى', leftFT: 'قناة فالوب اليسرى', ftUnspecified: 'قناة فالوب، الجهة غير محددة',
  uterusIntegrityLabel: 'سلامة الرحم',
  uterusIntegrityOpts: ['سليم', 'مفتوح', 'مجزأ بالتقطيع', 'أخرى (يُحدد)'],
  blockLabel: 'مفتاح توزيع القوالب', blockFields: ovaryBlockFields_ar,
  grossingLabel: 'الفحص العياني', grossedBy: 'تم الفحص العياني بواسطة', date: 'التاريخ',
}));

write(join(endoBase, 'ovary_fallopian_tube_primary_peritoneum_gross.i18n_fr.json'), buildOvaryI18n({
  title: 'Ovaire, trompe de Fallope ou péritoine primaire (Modèle macroscopique)',
  otherSpecify: 'Autre (préciser)',
  procs: ['Procédure (sélectionner toutes les réponses applicables)', ...ovaryProcs_fr],
  hystTypes: ["Type d'hystérectomie", ...hystTypes_fr],
  notApplicable: 'Non applicable',
  specimenLabel: 'Spécimen',
  specimenIntegrityNote: "Note d'intégrité du spécimen",
  specimenIntegrityApplicability: "Applicabilité de l'intégrité du spécimen",
  ovarianIntegrityLabel: "Intégrité de l'ovaire",
  ovaryIntegrityOpts: ['Capsule intacte', 'Capsule rompue', 'Fragmenté', 'Autre (préciser)'],
  ruptureTimeOpts: ['Moment de la rupture', 'Préopératoire', 'Intraopératoire', 'Inconnu'],
  rightOvary: 'Ovaire droit', leftOvary: 'Ovaire gauche', ovaryUnspecified: 'Ovaire, latéralité non précisée',
  ftIntegrityLabel: 'Intégrité de la trompe de Fallope',
  ftIntegrityOpts: ['Séreuse intacte', 'Séreuse rompue', 'Fragmenté', 'Autre (préciser)'],
  rightFT: 'Trompe de Fallope droite', leftFT: 'Trompe de Fallope gauche', ftUnspecified: 'Trompe de Fallope, latéralité non précisée',
  uterusIntegrityLabel: "Intégrité de l'utérus",
  uterusIntegrityOpts: ['Intact', 'Ouvert', 'Morcelé', 'Autre (préciser)'],
  blockLabel: "Clé d'attribution des blocs", blockFields: ovaryBlockFields_fr,
  grossingLabel: 'Macroscopie', grossedBy: 'Macroscopie réalisée par', date: 'Date',
}));

write(join(endoBase, 'ovary_fallopian_tube_primary_peritoneum_gross.i18n_sw.json'), buildOvaryI18n({
  title: 'Ovari au Mrija wa Fallopian au Peritoneum ya Msingi (Kiolezo cha Gross)',
  otherSpecify: 'Nyingine (taja)',
  procs: ['Utaratibu (chagua yote yanayohusika)', ...ovaryProcs_sw],
  hystTypes: ['Aina ya hysterectomy', ...hystTypes_sw],
  notApplicable: 'Haitumiki',
  specimenLabel: 'Sampuli',
  specimenIntegrityNote: 'Kumbuka kuhusu uadilifu wa sampuli',
  specimenIntegrityApplicability: 'Uhusu wa uadilifu wa sampuli',
  ovarianIntegrityLabel: 'Uadilifu wa ovari',
  ovaryIntegrityOpts: ['Kapsuli haijapasuka', 'Kapsuli imepasuka', 'Imevunjikavunjika', 'Nyingine (taja)'],
  ruptureTimeOpts: ['Wakati wa kupasuka', 'Kabla ya upasuaji', 'Wakati wa upasuaji', 'Haijulikani'],
  rightOvary: 'Ovari ya kulia', leftOvary: 'Ovari ya kushoto', ovaryUnspecified: 'Ovari, upande haujabainishwa',
  ftIntegrityLabel: 'Uadilifu wa mrija wa fallopian',
  ftIntegrityOpts: ['Serosa haijapasuka', 'Serosa imepasuka', 'Imevunjikavunjika', 'Nyingine (taja)'],
  rightFT: 'Mrija wa fallopian wa kulia', leftFT: 'Mrija wa fallopian wa kushoto', ftUnspecified: 'Mrija wa fallopian, upande haujabainishwa',
  uterusIntegrityLabel: 'Uadilifu wa uterasi',
  uterusIntegrityOpts: ['Nzima', 'Imefunguliwa', 'Imegawanywa vipandevipande', 'Nyingine (taja)'],
  blockLabel: 'Ufunguo wa ugawaji wa vitalu', blockFields: ovaryBlockFields_sw,
  grossingLabel: 'Uchunguzi wa makroskopia', grossedBy: 'Imefanyiwa grossing na', date: 'Tarehe',
}));

write(join(endoBase, 'ovary_fallopian_tube_primary_peritoneum_gross.i18n_ur.json'), buildOvaryI18n({
  title: 'بیضہ دانی یا فیلوپین ٹیوب یا بنیادی پیریٹونیئم (گراس ٹیمپلیٹ)',
  otherSpecify: 'دیگر (واضح کریں)',
  procs: ['طریقہ کار (جو لاگو ہوں سب منتخب کریں)', ...ovaryProcs_ur],
  hystTypes: ['ہسٹریکٹومی کی قسم', ...hystTypes_ur],
  notApplicable: 'لاگو نہیں',
  specimenLabel: 'نمونہ',
  specimenIntegrityNote: 'نمونے کی سالمیت کا نوٹ',
  specimenIntegrityApplicability: 'نمونے کی سالمیت کا اطلاق',
  ovarianIntegrityLabel: 'اووری کی سالمیت',
  ovaryIntegrityOpts: ['کیپسول سالم', 'کیپسول پھٹا ہوا', 'ٹکڑوں میں', 'دیگر (واضح کریں)'],
  ruptureTimeOpts: ['پھٹنے کا وقت', 'آپریشن سے پہلے', 'آپریشن کے دوران', 'نامعلوم'],
  rightOvary: 'دائیں اووری', leftOvary: 'بائیں اووری', ovaryUnspecified: 'اووری، طرف متعین نہیں',
  ftIntegrityLabel: 'فیلوپیئن ٹیوب کی سالمیت',
  ftIntegrityOpts: ['سیروسا سالم', 'سیروسا پھٹا ہوا', 'ٹکڑوں میں', 'دیگر (واضح کریں)'],
  rightFT: 'دائیں فیلوپیئن ٹیوب', leftFT: 'بائیں فیلوپیئن ٹیوب', ftUnspecified: 'فیلوپیئن ٹیوب، طرف متعین نہیں',
  uterusIntegrityLabel: 'بچہ دانی کی سالمیت',
  uterusIntegrityOpts: ['سالم', 'کھولی ہوئی', 'مورسیلیٹڈ', 'دیگر (واضح کریں)'],
  blockLabel: 'بلاک مختص کرنے کی کلید', blockFields: ovaryBlockFields_ur,
  grossingLabel: 'گراس', grossedBy: 'گراس کیا گیا بذریعہ', date: 'تاریخ',
}));

// ─── UTERINE CERVIX ───────────────────────────────────────────────────────────
const cervixProcs_ar = [
  'استئصال عنق الرحم',
  'استئصال الرحم الكلي مع استئصال البوقين والمبيضين ثنائي الجانب',
  'استئصال الرحم الجذري', 'استئصال الرحم البسيط',
  'استئصال أحشاء الحوض (حدد الأعضاء المشمولة)',
  'استئصال البوقين والمبيضين ثنائي الجانب', 'استئصال البوق والمبيض الأيمن', 'استئصال البوق والمبيض الأيسر',
  'استئصال البوق والمبيض، الجانب غير محدد', 'استئصال المبيض الأيمن', 'استئصال المبيض الأيسر',
  'استئصال المبيض، الجانب غير محدد', 'استئصال البوقين ثنائي الجانب',
  'استئصال البوق الأيمن', 'استئصال البوق الأيسر', 'استئصال البوق، الجانب غير محدد',
  'استئصال قبة المهبل', 'استئصال الثرب', 'أخرى (يرجى التحديد)',
];
const cervixProcs_fr = [
  'Trachélectomie', 'Hystérectomie totale avec salpingo-ovariectomie bilatérale',
  'Hystérectomie radicale', 'Hystérectomie simple', 'Exentération pelvienne (préciser les organes inclus)',
  'Salpingo-ovariectomie bilatérale', 'Salpingo-ovariectomie droite', 'Salpingo-ovariectomie gauche',
  'Salpingo-ovariectomie, côté non précisé', 'Ovariectomie droite', 'Ovariectomie gauche',
  'Ovariectomie, côté non précisé', 'Salpingectomie bilatérale',
  'Salpingectomie droite', 'Salpingectomie gauche', 'Salpingectomie, côté non précisé',
  'Résection du manchon vaginal', 'Omentectomie', 'Autre (préciser)',
];
const cervixProcs_sw = [
  'Trakelektomia',
  'Kuondolewa kabisa kwa kizazi pamoja na mirija ya falopio na ovari zote mbili',
  'Kuondolewa kwa kizazi kwa njia ya radical hysterectomy', 'Kuondolewa kwa kizazi kwa njia rahisi',
  'Kuondolewa kwa viungo vya nyonga (taja viungo vilivyojumuishwa)',
  'Kuondolewa kwa mirija ya falopio na ovari zote mbili', 'Kuondolewa kwa mrija wa falopio na ovari ya kulia',
  'Kuondolewa kwa mrija wa falopio na ovari ya kushoto',
  'Kuondolewa kwa mrija wa falopio na ovari, upande haujabainishwa',
  'Kuondolewa kwa ovari ya kulia', 'Kuondolewa kwa ovari ya kushoto',
  'Kuondolewa kwa ovari, upande haujabainishwa',
  'Kuondolewa kwa mirija yote miwili ya falopio', 'Kuondolewa kwa mrija wa falopio wa kulia',
  'Kuondolewa kwa mrija wa falopio wa kushoto', 'Kuondolewa kwa mrija wa falopio, upande haujabainishwa',
  'Utoaji wa sehemu ya mwisho ya uke', 'Omentektomia', 'Nyingine (eleza)',
];
const cervixProcs_ur = [
  'ٹریکلیکٹومی / سروکس کا اخراج',
  'کل ہسٹرکٹومی مع دونوں فیلوپین ٹیوبز اور بیضہ دانیوں کا اخراج',
  'ریڈیکل ہسٹرکٹومی', 'سادہ ہسٹرکٹومی', 'پیلوک ایکزینٹریشن (شامل اعضاء کی وضاحت کریں)',
  'دونوں طرف سالپنگو-اوفوریکٹومی', 'دائیں سالپنگو-اوفوریکٹومی', 'بائیں سالپنگو-اوفوریکٹومی',
  'سالپنگو-اوفوریکٹومی، طرف متعین نہیں', 'دائیں بیضہ دانی کا اخراج', 'بائیں بیضہ دانی کا اخراج',
  'بیضہ دانی کا اخراج، طرف متعین نہیں', 'دونوں فیلوپین ٹیوبز کا اخراج',
  'دائیں فیلوپین ٹیوب کا اخراج', 'بائیں فیلوپین ٹیوب کا اخراج', 'فیلوپین ٹیوب کا اخراج، طرف متعین نہیں',
  'ویجائنل کف ریسیکشن', 'اومینٹیکٹومی', 'دیگر (وضاحت کریں)',
];

const tumorSiteOpts_ar = ['الربع الأيسر العلوي (الأمامي) (من الساعة 12 إلى 3)', 'الربع الأيسر السفلي (الخلفي) (من الساعة 3 إلى 6)', 'الربع الأيمن السفلي (الخلفي) (من الساعة 6 إلى 9)', 'الربع الأيمن العلوي (الأمامي) (من الساعة 9 إلى 12)', 'أخرى (يرجى التحديد)', 'غير محدد'];
const tumorSiteOpts_fr = ['Quadrant supérieur gauche (antérieur) (12 à 3 heures)', 'Quadrant inférieur gauche (postérieur) (3 à 6 heures)', 'Quadrant inférieur droit (postérieur) (6 à 9 heures)', 'Quadrant supérieur droit (antérieur) (9 à 12 heures)', 'Autre (préciser)', 'Non précisé'];
const tumorSiteOpts_sw = ['Robo ya juu kushoto (mbele) (saa 12 hadi 3)', 'Robo ya chini kushoto (nyuma) (saa 3 hadi 6)', 'Robo ya chini kulia (nyuma) (saa 6 hadi 9)', 'Robo ya juu kulia (mbele) (saa 9 hadi 12)', 'Nyingine (eleza)', 'Haijabainishwa'];
const tumorSiteOpts_ur = ['بائیں اوپری (اگلا) ربع (12 سے 3 بجے)', 'بائیں نچلا (پچھلا) ربع (3 سے 6 بجے)', 'دائیں نچلا (پچھلا) ربع (6 سے 9 بجے)', 'دائیں اوپری (اگلا) ربع (9 سے 12 بجے)', 'دیگر (وضاحت کریں)', 'متعین نہیں'];

function buildCervixI18n({ title, procs, hystTypes, specimenLabel, tumorLabel,
  otherSpecify,
  tumorSiteLabel, tumorSiteOpts, tumorSizeLabel, sizeTypeLabel, sizeTypeOpts,
  greatestDimLabel, additionalDimLabel, cannotBeDeterminedLabel, noteLabel, noteValue,
  depthLabel, horizontalLabel, marginsLabel, ectocervLabel, endocervLabel, parametrialMarginLabel,
  piLabel, piStatusLabel, piStatusOpts, piLateralityLabel, piLateralityOpts,
  vciLabel, vciStatusLabel, vciStatusOpts,
  lnLabel, lnStatusLabel, lnStatusOpts, lnNumberLabel, lnSizeLabel,
  blockLabel, blockFields,
  grossingLabel, grossedBy, date,
}) {
  return {
    title,
    specimen: { label: specimenLabel, fields: {
      procedure: { label: procs[0], options: procs.slice(1), other_specify: otherSpecify },
      hysterectomy_type: { label: hystTypes[0], options: hystTypes.slice(1), other_specify: otherSpecify },
    }},
    tumor: { label: tumorLabel, fields: {
      tumor_site: { label: tumorSiteLabel, options: tumorSiteOpts, other_specify: otherSpecify },
      tumor_size: { label: tumorSizeLabel, fields: {
        size_type: { label: sizeTypeLabel, options: sizeTypeOpts },
        greatest_dimension_cm: { label: greatestDimLabel },
        additional_dimensions_cm: { label: additionalDimLabel },
        cannot_be_determined_explain: { label: cannotBeDeterminedLabel },
        note: { label: noteLabel, value: noteValue },
      }},
      depth_of_invasion_cm: { label: depthLabel },
      horizontal_extent_cm: { label: horizontalLabel },
    }},
    margins: { label: marginsLabel, fields: {
      ectocervical_margin_cm: { label: ectocervLabel },
      endocervical_margin_cm: { label: endocervLabel },
      parametrial_margin_cm: { label: parametrialMarginLabel },
    }},
    parametrial_involvement: { label: piLabel, fields: {
      status: { label: piStatusLabel, options: piStatusOpts },
      laterality: { label: piLateralityLabel, options: piLateralityOpts },
    }},
    vaginal_cuff_involvement: { label: vciLabel, fields: {
      status: { label: vciStatusLabel, options: vciStatusOpts },
    }},
    lymph_nodes: { label: lnLabel, fields: {
      status: { label: lnStatusLabel, options: lnStatusOpts },
      total_number_of_nodes: { label: lnNumberLabel },
      size_range: { label: lnSizeLabel },
    }},
    block_allocation_key: { label: blockLabel, fields: blockFields },
    grossing: { label: grossingLabel, fields: {
      grossed_by: { label: grossedBy },
      date: { label: date },
    }},
  };
}

const cervixBlockFields_ar = {
  tumor: { label: 'الورم' }, endocervical_margin: { label: 'هامش داخل عنق الرحم' },
  ectocervical_margin: { label: 'هامش خارج عنق الرحم' }, right_parametrium: { label: 'النسيج المجاور للرحم الأيمن' },
  left_parametrium: { label: 'النسيج المجاور للرحم الأيسر' }, vaginal_cuff_margin: { label: 'هامش قبة المهبل' },
  endometrium: { label: 'بطانة الرحم' }, myometrium: { label: 'عضل الرحم' },
  right_ovary: { label: 'المبيض الأيمن' }, left_ovary: { label: 'المبيض الأيسر' },
  right_fallopian_tube: { label: 'البوق الأيمن' }, left_fallopian_tube: { label: 'البوق الأيسر' },
  lymph_nodes: { label: 'العقد اللمفاوية' },
};
const cervixBlockFields_fr = {
  tumor: { label: 'Tumeur' }, endocervical_margin: { label: 'Marge endocervicale' },
  ectocervical_margin: { label: 'Marge ectocervicale' }, right_parametrium: { label: 'Paramètre droit' },
  left_parametrium: { label: 'Paramètre gauche' }, vaginal_cuff_margin: { label: 'Marge du manchon vaginal' },
  endometrium: { label: 'Endomètre' }, myometrium: { label: 'Myomètre' },
  right_ovary: { label: 'Ovaire droit' }, left_ovary: { label: 'Ovaire gauche' },
  right_fallopian_tube: { label: 'Trompe de Fallope droite' }, left_fallopian_tube: { label: 'Trompe de Fallope gauche' },
  lymph_nodes: { label: 'Ganglions lymphatiques' },
};
const cervixBlockFields_sw = {
  tumor: { label: 'Uvimbe' }, endocervical_margin: { label: 'Kingo ya endocervix' },
  ectocervical_margin: { label: 'Kingo ya ectocervix' }, right_parametrium: { label: 'Parametrium ya kulia' },
  left_parametrium: { label: 'Parametrium ya kushoto' }, vaginal_cuff_margin: { label: 'Kingo ya sehemu ya mwisho ya uke' },
  endometrium: { label: 'Endometrium' }, myometrium: { label: 'Myometrium' },
  right_ovary: { label: 'Ovari ya kulia' }, left_ovary: { label: 'Ovari ya kushoto' },
  right_fallopian_tube: { label: 'Mrija wa falopio wa kulia' }, left_fallopian_tube: { label: 'Mrija wa falopio wa kushoto' },
  lymph_nodes: { label: 'Tezi za limfu' },
};
const cervixBlockFields_ur = {
  tumor: { label: 'رسولی' }, endocervical_margin: { label: 'اینڈوسرویکل مارجن' },
  ectocervical_margin: { label: 'ایکٹوسرویکل مارجن' }, right_parametrium: { label: 'دائیں پیرامیٹریئم' },
  left_parametrium: { label: 'بائیں پیرامیٹریئم' }, vaginal_cuff_margin: { label: 'ویجائنل کف مارجن' },
  endometrium: { label: 'اینڈومیٹریئم' }, myometrium: { label: 'مایومیٹریئم' },
  right_ovary: { label: 'دائیں بیضہ دانی' }, left_ovary: { label: 'بائیں بیضہ دانی' },
  right_fallopian_tube: { label: 'دائیں فیلوپین ٹیوب' }, left_fallopian_tube: { label: 'بائیں فیلوپین ٹیوب' },
  lymph_nodes: { label: 'لمف نوڈز' },
};

write(join(endoBase, 'uterine_cervix_resection_gross.i18n_ar.json'), buildCervixI18n({
  title: 'استئصال عنق الرحم (قالب الفحص العياني)',
  otherSpecify: 'أخرى (يرجى التحديد)',
  noteValue: 'وفقًا لدليل التدريج AJCC، يُرسَم حجم الورم بالسنتيمترات. جميع الأبعاد مهمة؛ انظر تعريف سرطان الخلايا الحرشفية شديدة الغزو السطحي ضمن T1a1 / IA1.',
  procs: ['الإجراء (اختر كل ما ينطبق)', ...cervixProcs_ar],
  hystTypes: ['نوع استئصال الرحم', ...hystTypes_ar],
  specimenLabel: 'العينة', tumorLabel: 'الورم',
  tumorSiteLabel: 'موقع الورم (اختر كل ما ينطبق)', tumorSiteOpts: tumorSiteOpts_ar,
  tumorSizeLabel: 'حجم الورم', sizeTypeLabel: 'نوع حجم الورم',
  sizeTypeOpts: ['أكبر بُعد بالسنتيمتر (سم)', 'لا يمكن تحديده'],
  greatestDimLabel: 'أكبر بُعد (سم)', additionalDimLabel: 'أبعاد إضافية (سم)',
  cannotBeDeterminedLabel: 'لا يمكن تحديده (يرجى التوضيح)', noteLabel: 'ملاحظة حجم الورم',
  depthLabel: 'عمق الغزو اللحمي (سم)', horizontalLabel: 'الامتداد الأفقي (سم)',
  marginsLabel: 'الهوامش', ectocervLabel: 'هامش خارج عنق الرحم', endocervLabel: 'هامش داخل عنق الرحم', parametrialMarginLabel: 'هامش النسيج المجاور للرحم',
  piLabel: 'إصابة النسيج المجاور للرحم', piStatusLabel: 'إصابة النسيج المجاور للرحم', piStatusOpts: ['غير موجود', 'موجود'],
  piLateralityLabel: 'جانب الإصابة', piLateralityOpts: ['أيمن', 'أيسر', 'ثنائي الجانب'],
  vciLabel: 'إصابة قبة المهبل', vciStatusLabel: 'إصابة قبة المهبل', vciStatusOpts: ['غير موجود', 'موجود'],
  lnLabel: 'العقد اللمفاوية', lnStatusLabel: 'العقد اللمفاوية', lnStatusOpts: ['موجودة', 'غير موجودة'],
  lnNumberLabel: 'العدد الإجمالي للعقد', lnSizeLabel: 'مدى الحجم',
  blockLabel: 'مفتاح توزيع الكتل', blockFields: cervixBlockFields_ar,
  grossingLabel: 'الفحص العياني', grossedBy: 'تم الفحص العياني بواسطة', date: 'التاريخ',
}));

write(join(endoBase, 'uterine_cervix_resection_gross.i18n_fr.json'), buildCervixI18n({
  title: 'Résection du col utérin (Modèle macroscopique)',
  otherSpecify: 'Autre (préciser)',
  noteValue: "Selon le manuel de stadification AJCC, la taille de la tumeur est rapportée en centimètres. Toutes les dimensions sont importantes ; voir la définition du carcinome épidermoïde superficiellement invasif sous T1a1 / IA1.",
  procs: ['Procédure (sélectionner toutes les réponses applicables)', ...cervixProcs_fr],
  hystTypes: ["Type d'hystérectomie", ...hystTypes_fr],
  specimenLabel: 'Spécimen', tumorLabel: 'Tumeur',
  tumorSiteLabel: 'Site de la tumeur (sélectionner toutes les réponses applicables)', tumorSiteOpts: tumorSiteOpts_fr,
  tumorSizeLabel: 'Taille de la tumeur', sizeTypeLabel: 'Type de taille tumorale',
  sizeTypeOpts: ['Plus grande dimension en centimètres (cm)', 'Ne peut pas être déterminé'],
  greatestDimLabel: 'Plus grande dimension (cm)', additionalDimLabel: 'Dimensions supplémentaires (cm)',
  cannotBeDeterminedLabel: 'Ne peut pas être déterminé (expliquer)', noteLabel: 'Note sur la taille tumorale',
  depthLabel: "Profondeur d'invasion stromale (cm)", horizontalLabel: 'Étendue horizontale (cm)',
  marginsLabel: 'Marges', ectocervLabel: 'Marge ectocervicale', endocervLabel: 'Marge endocervicale', parametrialMarginLabel: 'Marge paramétriale',
  piLabel: 'Atteinte paramétriale', piStatusLabel: 'Atteinte paramétriale', piStatusOpts: ['Absente', 'Présente'],
  piLateralityLabel: 'Latéralité', piLateralityOpts: ['Droite', 'Gauche', 'Bilatérale'],
  vciLabel: 'Atteinte du manchon vaginal', vciStatusLabel: 'Atteinte du manchon vaginal', vciStatusOpts: ['Absente', 'Présente'],
  lnLabel: 'Ganglions lymphatiques', lnStatusLabel: 'Ganglions lymphatiques', lnStatusOpts: ['Présents', 'Absents'],
  lnNumberLabel: 'Nombre total de ganglions', lnSizeLabel: 'Plage de tailles',
  blockLabel: "Clé d'attribution des blocs", blockFields: cervixBlockFields_fr,
  grossingLabel: 'Macroscopie', grossedBy: 'Examiné macroscopiquement par', date: 'Date',
}));

write(join(endoBase, 'uterine_cervix_resection_gross.i18n_sw.json'), buildCervixI18n({
  title: 'Upasuaji wa Kizazi (Kiolezo cha Gross)',
  otherSpecify: 'Nyingine (eleza)',
  noteValue: 'Kulingana na Mwongozo wa Utaratibu wa AJCC, ukubwa wa uvimbe unaripotiwa kwa sentimita. Vipimo vyote ni muhimu; angalia ufafanuzi wa carcinoma ya seli za squamous inayovamia uso kwa kina kidogo chini ya T1a1 / IA1.',
  procs: ['Utaratibu (chagua yote yanayohusika)', ...cervixProcs_sw],
  hystTypes: ['Aina ya hysterectomy', ...hystTypes_sw],
  specimenLabel: 'Sampuli', tumorLabel: 'Uvimbe',
  tumorSiteLabel: 'Eneo la uvimbe (chagua yote yanayohusika)', tumorSiteOpts: tumorSiteOpts_sw,
  tumorSizeLabel: 'Ukubwa wa uvimbe', sizeTypeLabel: 'Aina ya ukubwa wa uvimbe',
  sizeTypeOpts: ['Kipimo kikubwa zaidi kwa sentimita (cm)', 'Haiwezi kubainishwa'],
  greatestDimLabel: 'Kipimo kikubwa zaidi (cm)', additionalDimLabel: 'Vipimo vya ziada (cm)',
  cannotBeDeterminedLabel: 'Haiwezi kubainishwa (eleza)', noteLabel: 'Kumbuka kuhusu ukubwa wa uvimbe',
  depthLabel: 'Kina cha uvamizi kwenye stroma (cm)', horizontalLabel: 'Ueneaji wa mlalo (cm)',
  marginsLabel: 'Kingo', ectocervLabel: 'Kingo ya ectocervix', endocervLabel: 'Kingo ya endocervix', parametrialMarginLabel: 'Kingo ya parametrium',
  piLabel: 'Ushiriki wa parametrium', piStatusLabel: 'Ushiriki wa parametrium', piStatusOpts: ['Haipo', 'Ipo'],
  piLateralityLabel: 'Upande', piLateralityOpts: ['Kulia', 'Kushoto', 'Pande zote mbili'],
  vciLabel: 'Ushiriki wa sehemu ya mwisho ya uke', vciStatusLabel: 'Ushiriki wa sehemu ya mwisho ya uke', vciStatusOpts: ['Haipo', 'Ipo'],
  lnLabel: 'Tezi za limfu', lnStatusLabel: 'Tezi za limfu', lnStatusOpts: ['Zipo', 'Hazipo'],
  lnNumberLabel: 'Jumla ya idadi ya tezi', lnSizeLabel: 'Kiwango cha ukubwa',
  blockLabel: 'Ufunguo wa ugawaji wa vitalu', blockFields: cervixBlockFields_sw,
  grossingLabel: 'Uchunguzi wa makroskopia', grossedBy: 'Imefanyiwa uchunguzi wa makroskopia na', date: 'Tarehe',
}));

write(join(endoBase, 'uterine_cervix_resection_gross.i18n_ur.json'), buildCervixI18n({
  title: 'یوٹرائن سروکس ریسیکشن (گراسنگ ٹیمپلیٹ)',
  otherSpecify: 'دیگر (واضح کریں)',
  noteValue: 'AJCC اسٹیجنگ مینوئل کے مطابق، ٹیومر کا سائز سینٹی میٹر میں رپورٹ کیا جاتا ہے۔ تمام ابعاد اہم ہیں؛ T1a1 / IA1 کے تحت سطحی طور پر ناگوار سکواموس سیل کارسینوما کی تعریف دیکھیں۔',
  procs: ['طریقۂ کار (جو لاگو ہوں منتخب کریں)', ...cervixProcs_ur],
  hystTypes: ['ہسٹرکٹومی کی قسم', ...hystTypes_ur],
  specimenLabel: 'نمونہ', tumorLabel: 'رسولی',
  tumorSiteLabel: 'رسولی کا مقام (جو لاگو ہوں منتخب کریں)', tumorSiteOpts: tumorSiteOpts_ur,
  tumorSizeLabel: 'رسولی کا سائز', sizeTypeLabel: 'رسولی کے سائز کی قسم',
  sizeTypeOpts: ['سب سے بڑا بُعد سینٹی میٹر (cm) میں', 'تعین نہیں کیا جا سکتا'],
  greatestDimLabel: 'سب سے بڑا بُعد (cm)', additionalDimLabel: 'اضافی ابعاد (cm)',
  cannotBeDeterminedLabel: 'تعین نہیں کیا جا سکتا (وضاحت کریں)', noteLabel: 'رسولی کے سائز کا نوٹ',
  depthLabel: 'اسٹروما میں انویژن کی گہرائی (cm)', horizontalLabel: 'افقی پھیلاؤ (cm)',
  marginsLabel: 'مارجنز', ectocervLabel: 'ایکٹوسرویکل مارجن', endocervLabel: 'اینڈوسرویکل مارجن', parametrialMarginLabel: 'پیرامیٹریل مارجن',
  piLabel: 'پیرامیٹریل شمولیت', piStatusLabel: 'پیرامیٹریل شمولیت', piStatusOpts: ['غیر موجود', 'موجود'],
  piLateralityLabel: 'پیرامیٹریل جانب', piLateralityOpts: ['دائیں', 'بائیں', 'دونوں طرف'],
  vciLabel: 'ویجائنل کف شمولیت', vciStatusLabel: 'ویجائنل کف شمولیت', vciStatusOpts: ['غیر موجود', 'موجود'],
  lnLabel: 'لمف نوڈز', lnStatusLabel: 'لمف نوڈز', lnStatusOpts: ['موجود', 'غیر موجود'],
  lnNumberLabel: 'نوڈز کی کل تعداد', lnSizeLabel: 'سائز کی حد',
  blockLabel: 'بلاک الاٹمنٹ کلید', blockFields: cervixBlockFields_ur,
  grossingLabel: 'گراس', grossedBy: 'گراس کیا گیا بذریعہ', date: 'تاریخ',
}));

// ─── COLON & RECTUM ───────────────────────────────────────────────────────────
const colonBase = join(BASE, 'gi.histology/gi/gross');
const tumorSiteColon_ar = ['الأعور', 'القولون الصاعد', 'الثنية الكبدية', 'القولون المستعرض', 'الثنية الطحالية', 'القولون النازل', 'القولون السيني', 'القولون المستقيمي السيني', 'المستقيم'];
const tumorSiteColon_fr = ['Cæcum', 'Côlon ascendant', 'Angle hépatique', 'Côlon transverse', 'Angle splénique', 'Côlon descendant', 'Côlon sigmoïde', 'Jonction rectosigmoïdienne', 'Rectum'];
const tumorSiteColon_sw = ['Sekamu', 'Koloni inayopanda', 'Mpindo wa hepatiki', 'Koloni ya kuvuka', 'Mpindo wa spleniki', 'Koloni inayoshuka', 'Koloni ya sigmoid', 'Koloni ya rekto-sigmoid', 'Rektamu'];
const tumorSiteColon_ur = ['سیکم', 'ایسینڈنگ کولون', 'ہیپاٹک فلیکشر', 'ٹرانسورس کولون', 'سپلینک فلیکشر', 'ڈیسینڈنگ کولون', 'سگموئڈ کولون', 'ریکٹو سگموئڈ کولون', 'ریکٹم'];
const mesoOpts_ar = ['غير كاملة (الدرجة 1)', 'شبه كاملة (الدرجة 2)', 'كاملة (الدرجة 3)'];
const mesoOpts_fr = ['Incomplète (Grade 1)', 'Presque complète (Grade 2)', 'Complète (Grade 3)'];
const mesoOpts_sw = ['Haujakamilika (Daraja 1)', 'Karibu kamili (Daraja 2)', 'Kamili (Daraja 3)'];
const mesoOpts_ur = ['نامکمل (گریڈ 1)', 'تقریباً مکمل (گریڈ 2)', 'مکمل (گریڈ 3)'];
const reflOpts_ar = ['كله فوقه', 'يمتد عبره', 'كله تحته'];
const reflOpts_fr = ['Entièrement au-dessus', 'À cheval', 'Entièrement au-dessous'];
const reflOpts_sw = ['Wote uko juu yake', 'Uko juu na chini yake', 'Wote uko chini yake'];
const reflOpts_ur = ['مکمل طور پر اوپر', 'دونوں طرف پھیلی ہوئی', 'مکمل طور پر نیچے'];

function buildColonI18n({ title, specimenLabel, procedureTypeLabel, specimenLengthLabel, anatomicalComponentsLabel,
  tumorLabel, perforationLabel, absentLabel, presentLabel, tumorDimsLabel, tumorSiteLabel, tumorSiteOpts,
  invadesPeritonealLabel, yesLabel, noLabel, serosaNodulesLabel,
  marginsLabel, proximalMarginLabel, distalMarginLabel, circumMarginLabel,
  rectalLabel, mesorectumLabel, mesorectumOpts, reflLabel, reflOpts, dentateLabel,
  polypsLabel, polypsStatusLabel, polypsDetailsLabel, lymphNodesLabel, lnNumberLabel, lnSizeLabel,
  otherFindingsLabel, findingsLabel, blockKeyLabel, blockFields,
  grossingLabel, grossedByLabel, dateLabel,
}) {
  return {
    title,
    specimen: { label: specimenLabel, fields: {
      procedure_type: { label: procedureTypeLabel },
      specimen_length_mm: { label: specimenLengthLabel },
      anatomical_components_included: { label: anatomicalComponentsLabel },
    }},
    tumor: { label: tumorLabel, fields: {
      tumor_perforation: { label: perforationLabel, options: [absentLabel, presentLabel] },
      tumor_dimensions_mm: { label: tumorDimsLabel },
      tumor_site: { label: tumorSiteLabel, options: tumorSiteOpts },
      invades_peritoneal_surface: { label: invadesPeritonealLabel, options: [yesLabel, noLabel] },
      forms_discrete_serosal_nodules: { label: serosaNodulesLabel, options: [yesLabel, noLabel] },
    }},
    margins: { label: marginsLabel, fields: {
      distance_to_proximal_margin_mm: { label: proximalMarginLabel },
      distance_to_distal_margin_mm: { label: distalMarginLabel },
      distance_to_circumferential_margin_mm: { label: circumMarginLabel },
    }},
    rectal_tumor_only: { label: rectalLabel, fields: {
      mesorectum_intactness: { label: mesorectumLabel, options: mesorectumOpts },
      relationship_to_anterior_peritoneal_reflection: { label: reflLabel, options: reflOpts },
      distance_from_dentate_line_mm: { label: dentateLabel },
    }},
    polyps: { label: polypsLabel, fields: {
      status: { label: polypsStatusLabel, options: [absentLabel, presentLabel] },
      if_present_details: { label: polypsDetailsLabel },
    }},
    lymph_nodes: { label: lymphNodesLabel, fields: {
      number_identified: { label: lnNumberLabel },
      size_range_mm: { label: lnSizeLabel },
    }},
    other_findings: { label: otherFindingsLabel, fields: {
      findings: { label: findingsLabel },
    }},
    block_identification_key: { label: blockKeyLabel, fields: blockFields },
    grossing: { label: grossingLabel, fields: {
      grossed_by_initials: { label: grossedByLabel },
      date: { label: dateLabel },
    }},
  };
}

const colonBlockFields_ar = {
  tumor: { label: 'الورم' }, proximal_margin: { label: 'الهامش القريب' },
  distal_margin: { label: 'الهامش البعيد' }, circumferential_margin: { label: 'الهامش المحيطي' },
  non_neoplastic_colon: { label: 'القولون غير الورمي' }, lymph_nodes: { label: 'العقد اللمفاوية' },
  additional_sections: { label: 'مقاطع إضافية' },
};
const colonBlockFields_fr = {
  tumor: { label: 'Tumeur' }, proximal_margin: { label: 'Marge proximale' },
  distal_margin: { label: 'Marge distale' }, circumferential_margin: { label: 'Marge circonférentielle' },
  non_neoplastic_colon: { label: 'Côlon non néoplasique' }, lymph_nodes: { label: 'Ganglions lymphatiques' },
  additional_sections: { label: 'Sections supplémentaires' },
};
const colonBlockFields_sw = {
  tumor: { label: 'Uvimbe' }, proximal_margin: { label: 'Mpaka wa proksimali' },
  distal_margin: { label: 'Mpaka wa distali' }, circumferential_margin: { label: 'Mpaka wa mzunguko' },
  non_neoplastic_colon: { label: 'Koloni isiyo na neoplasia' }, lymph_nodes: { label: 'Nodi za limfu' },
  additional_sections: { label: 'Sehemu za ziada' },
};
const colonBlockFields_ur = {
  tumor: { label: 'رسولی' }, proximal_margin: { label: 'پروگزمل مارجن' },
  distal_margin: { label: 'ڈسٹل مارجن' }, circumferential_margin: { label: 'سرکمفرینشل مارجن' },
  non_neoplastic_colon: { label: 'غیر نیوپلاسٹک کولون' }, lymph_nodes: { label: 'لمف نوڈز' },
  additional_sections: { label: 'اضافی سیکشنز' },
};

write(join(colonBase, 'colon_rectum_resection_gross.i18n_ar.json'), buildColonI18n({
  title: 'استئصال القولون والمستقيم (قالب الفحص العياني)',
  specimenLabel: 'العينة', procedureTypeLabel: 'نوع الإجراء (كما ذكره الطبيب المعالج)', specimenLengthLabel: 'طول العينة (مم)', anatomicalComponentsLabel: 'المكونات التشريحية المشمولة (مع الحجم)',
  tumorLabel: 'الورم', perforationLabel: 'انثقاب الورم', absentLabel: 'غير موجود', presentLabel: 'موجود', tumorDimsLabel: 'أبعاد الورم (مم)',
  tumorSiteLabel: 'موقع الورم', tumorSiteOpts: tumorSiteColon_ar, invadesPeritonealLabel: 'يغزو الورم السطح البريتوني', yesLabel: 'نعم', noLabel: 'لا', serosaNodulesLabel: 'يشكل الورم عقيدات مصلية منفصلة',
  marginsLabel: 'الهوامش', proximalMarginLabel: 'المسافة إلى الهامش القريب (مم)', distalMarginLabel: 'المسافة إلى الهامش البعيد (مم)', circumMarginLabel: 'المسافة إلى الهامش المحيطي غير المغطى بالبريتون (مم)',
  rectalLabel: 'لأورام المستقيم فقط', mesorectumLabel: 'سلامة المساريقا المستقيمية', mesorectumOpts: mesoOpts_ar, reflLabel: 'علاقة الورم بالانعكاس البريتوني الأمامي', reflOpts: reflOpts_ar, dentateLabel: 'المسافة من الخط المسنن (مم)',
  polypsLabel: 'السلائل', polypsStatusLabel: 'السلائل', polypsDetailsLabel: 'إذا كانت موجودة (سجل العدد، ومدى الحجم، والمظهر العياني)',
  lymphNodesLabel: 'العقد اللمفاوية', lnNumberLabel: 'العدد المحدد', lnSizeLabel: 'مدى الحجم (مم)',
  otherFindingsLabel: 'ملاحظات عيانية أخرى ذات صلة', findingsLabel: 'ملاحظات عيانية أخرى ذات صلة',
  blockKeyLabel: 'مفتاح تعريف القوالب', blockFields: colonBlockFields_ar,
  grossingLabel: 'الفحص العياني', grossedByLabel: 'أُجري الفحص العياني بواسطة', dateLabel: 'التاريخ',
}));

write(join(colonBase, 'colon_rectum_resection_gross.i18n_fr.json'), buildColonI18n({
  title: 'Résection du côlon et du rectum (Modèle macroscopique)',
  specimenLabel: 'Spécimen', procedureTypeLabel: 'Type de procédure (tel qu\'indiqué par le clinicien)', specimenLengthLabel: 'Longueur du spécimen (mm)', anatomicalComponentsLabel: 'Composants anatomiques inclus (avec dimensions)',
  tumorLabel: 'Tumeur', perforationLabel: 'Perforation tumorale', absentLabel: 'Absente', presentLabel: 'Présente', tumorDimsLabel: 'Dimensions de la tumeur (mm)',
  tumorSiteLabel: 'Site de la tumeur', tumorSiteOpts: tumorSiteColon_fr, invadesPeritonealLabel: 'La tumeur envahit la surface péritonéale', yesLabel: 'Oui', noLabel: 'Non', serosaNodulesLabel: 'La tumeur forme des nodules séreux distincts',
  marginsLabel: 'Marges', proximalMarginLabel: 'Distance de la marge proximale (mm)', distalMarginLabel: 'Distance de la marge distale (mm)', circumMarginLabel: 'Distance de la marge circonférentielle non péritonisée (mm)',
  rectalLabel: 'Pour les tumeurs rectales uniquement', mesorectumLabel: 'Intégrité du mésorectum', mesorectumOpts: mesoOpts_fr, reflLabel: 'Relation de la tumeur avec la réflexion péritonéale antérieure', reflOpts: reflOpts_fr, dentateLabel: 'Distance de la ligne pectinée (mm)',
  polypsLabel: 'Polypes', polypsStatusLabel: 'Polypes', polypsDetailsLabel: 'Si présents (indiquer le nombre, la plage de tailles et l\'aspect macroscopique)',
  lymphNodesLabel: 'Ganglions lymphatiques', lnNumberLabel: 'Nombre identifié', lnSizeLabel: 'Plage de tailles (mm)',
  otherFindingsLabel: 'Autres constatations macroscopiques pertinentes', findingsLabel: 'Autres constatations macroscopiques pertinentes',
  blockKeyLabel: "Clé d'identification des blocs", blockFields: colonBlockFields_fr,
  grossingLabel: 'Macroscopie', grossedByLabel: 'Examiné macroscopiquement par', dateLabel: 'Date',
}));

write(join(colonBase, 'colon_rectum_resection_gross.i18n_sw.json'), buildColonI18n({
  title: 'Upasuaji wa Koloni na Rektamu (Kiolezo cha Gross)',
  specimenLabel: 'Sampuli', procedureTypeLabel: 'Aina ya upasuaji/utaratibu (kama ilivyoelezwa na daktari)', specimenLengthLabel: 'Urefu wa sampuli (mm)', anatomicalComponentsLabel: 'Sehemu za anatomia zilizojumuishwa (pamoja na ukubwa)',
  tumorLabel: 'Uvimbe', perforationLabel: 'Kutoboka kwa uvimbe', absentLabel: 'Hakupo', presentLabel: 'Kupo', tumorDimsLabel: 'Vipimo vya uvimbe (mm)',
  tumorSiteLabel: 'Eneo la uvimbe', tumorSiteOpts: tumorSiteColon_sw, invadesPeritonealLabel: 'Uvimbe umevamia uso wa peritoneamu', yesLabel: 'Ndiyo', noLabel: 'Hapana', serosaNodulesLabel: 'Uvimbe unatengeneza vinundu tofauti kwenye serosa',
  marginsLabel: 'Mipaka', proximalMarginLabel: 'Umbali hadi mpaka wa proksimali (mm)', distalMarginLabel: 'Umbali hadi mpaka wa distali (mm)', circumMarginLabel: 'Umbali hadi mpaka wa mzunguko usiofunikwa na peritoneum (mm)',
  rectalLabel: 'Kwa uvimbe wa rektamu pekee', mesorectumLabel: 'Ukamilifu wa mesorektamu', mesorectumOpts: mesoOpts_sw, reflLabel: 'Uhusiano wa uvimbe na mkunjo wa mbele wa peritoneamu', reflOpts: reflOpts_sw, dentateLabel: 'Umbali kutoka mstari wa dentate (mm)',
  polypsLabel: 'Polipu', polypsStatusLabel: 'Polipu', polypsDetailsLabel: 'Ikiwa zipo (andika idadi, kiwango cha ukubwa, na mwonekano wa macho)',
  lymphNodesLabel: 'Nodi za limfu', lnNumberLabel: 'Idadi iliyotambuliwa', lnSizeLabel: 'Kiwango cha ukubwa (mm)',
  otherFindingsLabel: 'Matokeo mengine muhimu ya uchunguzi wa macho', findingsLabel: 'Matokeo mengine muhimu ya uchunguzi wa macho',
  blockKeyLabel: 'Ufunguo wa utambulisho wa vitalu', blockFields: colonBlockFields_sw,
  grossingLabel: 'Uchunguzi wa macho', grossedByLabel: 'Imefanyiwa uchunguzi wa macho na', dateLabel: 'Tarehe',
}));

write(join(colonBase, 'colon_rectum_resection_gross.i18n_ur.json'), buildColonI18n({
  title: 'کولون اور ریکٹم ریسیکشن (گراسنگ ٹیمپلیٹ)',
  specimenLabel: 'نمونہ', procedureTypeLabel: 'طریقہ کار کی قسم (جیسا کہ معالج نے بیان کیا)', specimenLengthLabel: 'نمونے کی لمبائی (ملی میٹر)', anatomicalComponentsLabel: 'شامل اناٹومیکل اجزاء (سائز کے ساتھ)',
  tumorLabel: 'رسولی', perforationLabel: 'رسولی کا سوراخ/پرفوریشن', absentLabel: 'غیر موجود', presentLabel: 'موجود', tumorDimsLabel: 'رسولی کے ابعاد (ملی میٹر)',
  tumorSiteLabel: 'رسولی کا مقام', tumorSiteOpts: tumorSiteColon_ur, invadesPeritonealLabel: 'رسولی پیریٹونیل سطح میں داخل ہوتی ہے', yesLabel: 'ہاں', noLabel: 'نہیں', serosaNodulesLabel: 'رسولی الگ سیروسل نوڈیولز بناتی ہے',
  marginsLabel: 'مارجنز', proximalMarginLabel: 'قریبی مارجن تک فاصلہ (ملی میٹر)', distalMarginLabel: 'دور مارجن تک فاصلہ (ملی میٹر)', circumMarginLabel: 'محیطی مارجن تک فاصلہ (ملی میٹر)',
  rectalLabel: 'صرف ریکٹل رسولیوں کے لیے', mesorectumLabel: 'میسوریکٹم کی سالمیت', mesorectumOpts: mesoOpts_ur, reflLabel: 'رسولی کا anterior peritoneal reflection سے تعلق', reflOpts: reflOpts_ur, dentateLabel: 'ڈینٹیٹ لائن سے فاصلہ (ملی میٹر)',
  polypsLabel: 'پولیپس', polypsStatusLabel: 'پولیپس', polypsDetailsLabel: 'اگر موجود ہوں (تعداد، سائز کی حد، اور گراس ظاہری شکل درج کریں)',
  lymphNodesLabel: 'لمف نوڈز', lnNumberLabel: 'شناخت شدہ تعداد', lnSizeLabel: 'سائز کی حد (ملی میٹر)',
  otherFindingsLabel: 'دیگر متعلقہ گراس مشاہدات', findingsLabel: 'دیگر متعلقہ گراس مشاہدات',
  blockKeyLabel: 'بلاک شناختی کلید', blockFields: colonBlockFields_ur,
  grossingLabel: 'گراس', grossedByLabel: 'گراسنگ کرنے والا/والی', dateLabel: 'تاریخ',
}));

// ─── STOMACH ──────────────────────────────────────────────────────────────────
const resectionOpts_ar = ['استئصال المريء والمعدة', 'استئصال المعدة الكامل', 'استئصال جزئي للمعدة، قريب', 'استئصال جزئي للمعدة، بعيد', 'أخرى (يُحدد)'];
const resectionOpts_fr = ["Œsophago-gastrectomie", "Gastrectomie totale", "Gastrectomie subtotale, proximale", "Gastrectomie subtotale, distale", "Autre (préciser)"];
const resectionOpts_sw = ['Ukataji wa umio na tumbo', 'Ukataji kamili wa tumbo', 'Ukataji sehemu wa tumbo, upande wa karibu', 'Ukataji sehemu wa tumbo, upande wa mbali', 'Nyingine (taja)'];
const resectionOpts_ur = ['ایسوفاگو-گیسٹریکٹومی', 'مکمل گیسٹریکٹومی', 'جزوی گیسٹریکٹومی، قریبی حصہ', 'جزوی گیسٹریکٹومی، بعیدی حصہ', 'دیگر (وضاحت کریں)'];
const tumorSiteStomach_ar = ['الفؤاد', 'القاع', 'الجسم', 'الغار', 'البواب', 'الانحناء الصغير', 'الانحناء الكبير', 'الجدار الأمامي', 'الجدار الخلفي'];
const tumorSiteStomach_fr = ['Cardia', 'Fundus', 'Corps', 'Antre', 'Pylore', 'Petite courbure', 'Grande courbure', 'Paroi antérieure', 'Paroi postérieure'];
const tumorSiteStomach_sw = ['Kadia', 'Fundus', 'Mwili', 'Antrum', 'Pailorasi', 'Mpindo mdogo', 'Mpindo mkubwa', 'Ukuta wa mbele', 'Ukuta wa nyuma'];
const tumorSiteStomach_ur = ['کارڈیا', 'فنڈس', 'جسم', 'اینٹرم', 'پائلورس', 'چھوٹا خم', 'بڑا خم', 'اگلی دیوار', 'پچھلی دیوار'];
const morphOpts_ar = ['النوع 0-I (بارز)', 'النوع 0-IIa (مرتفع)', 'النوع 0-IIb (مسطح)', 'النوع 0-IIc (منخفض)', 'النوع 0-III (محفور)', 'النوع I (سليلي)', 'النوع II (فطري النمو)', 'النوع III (متقرح)', 'النوع IV (ارتشاحي)'];
const morphOpts_fr = ['Type 0-I (Proéminent)', 'Type 0-IIa (Surélevé)', 'Type 0-IIb (Plat)', 'Type 0-IIc (Déprimé)', 'Type 0-III (Excavé)', 'Type I (Polypoïde)', 'Type II (Bourgeonnant)', 'Type III (Ulcéré)', 'Type IV (Infiltrant)'];
const morphOpts_sw = ['Aina 0-I (uliojitokeza)', 'Aina 0-IIa (ulioinuka)', 'Aina 0-IIb (bapa)', 'Aina 0-IIc (uliozama)', 'Aina 0-III (uliochimbika)', 'Aina I (polipoidi)', 'Aina II (unaoota kama uyoga)', 'Aina III (wenye kidonda)', 'Aina IV (unaopenya)'];
const morphOpts_ur = ['قسم 0-I (ابھری ہوئی)', 'قسم 0-IIa (بلند)', 'قسم 0-IIb (چپٹی)', 'قسم 0-IIc (دبی ہوئی)', 'قسم 0-III (کھدی ہوئی)', 'قسم I (پولیپ نما)', 'قسم II (فنجی نما)', 'قسم III (زخم دار)', 'قسم IV (نفوذ کرنے والی)'];

function buildStomachI18n({ title, specimenLabel, resectionLabel, resectionOpts, otherSpecify,
  greaterCurvLabel, lesserCurvLabel, esophagusLabel, duodenumLabel,
  tumorLabel, macroSiteLabel, macroSiteOpts, morphLabel, morphOpts,
  tumorDimsLabel, proxDistLabel, distalDistLabel, lesserCurvDistLabel, greaterCurvDistLabel,
  lnLabel, lnNumberLabel, lnMinLabel, lnMaxLabel,
  blockKeyLabel, blockFields,
  grossingLabel, grossedByLabel, dateLabel,
}) {
  return {
    title,
    specimen: { label: specimenLabel, fields: {
      type_of_resection: { label: resectionLabel, options: resectionOpts, other_specify: otherSpecify },
      stomach_greater_curvature_mm: { label: greaterCurvLabel },
      stomach_lesser_curvature_mm: { label: lesserCurvLabel },
      esophagus_mm: { label: esophagusLabel },
      duodenum_mm: { label: duodenumLabel },
    }},
    tumor: { label: tumorLabel, fields: {
      macroscopic_tumor_site: { label: macroSiteLabel, options: macroSiteOpts },
      morphologic_classification: { label: morphLabel, options: morphOpts },
      tumor_dimensions_mm: { label: tumorDimsLabel },
      distance_to_proximal_margin_mm: { label: proxDistLabel },
      distance_to_distal_margin_mm: { label: distalDistLabel },
      distance_to_lesser_curvature_margin_mm: { label: lesserCurvDistLabel },
      distance_to_greater_curvature_margin_mm: { label: greaterCurvDistLabel },
    }},
    lymph_nodes: { label: lnLabel, fields: {
      number_identified: { label: lnNumberLabel },
      size_range_min_mm: { label: lnMinLabel },
      size_range_max_mm: { label: lnMaxLabel },
    }},
    block_identification_key: { label: blockKeyLabel, fields: blockFields },
    grossing: { label: grossingLabel, fields: {
      grossed_by: { label: grossedByLabel },
      date: { label: dateLabel },
    }},
  };
}

const stomachBlockFields_ar = {
  tumor_representative_sections: { label: 'الورم (مقاطع تمثيلية)' },
  proximal_margin: { label: 'الهامش القريب' }, distal_margin: { label: 'الهامش البعيد' },
  circumferential_non_peritonealised_margin: { label: 'الهامش المحيطي / غير المغطى بالبريتون' },
  non_neoplastic_stomach: { label: 'معدة غير ورمية' }, lymph_nodes: { label: 'العقد اللمفية' },
};
const stomachBlockFields_fr = {
  tumor_representative_sections: { label: 'Tumeur (coupes représentatives)' },
  proximal_margin: { label: 'Marge proximale' }, distal_margin: { label: 'Marge distale' },
  circumferential_non_peritonealised_margin: { label: 'Marge circonférentielle / non péritonisée' },
  non_neoplastic_stomach: { label: 'Estomac non néoplasique' }, lymph_nodes: { label: 'Ganglions lymphatiques' },
};
const stomachBlockFields_sw = {
  tumor_representative_sections: { label: 'Uvimbe (sehemu wakilishi)' },
  proximal_margin: { label: 'Mpaka wa karibu' }, distal_margin: { label: 'Mpaka wa mbali' },
  circumferential_non_peritonealised_margin: { label: 'Mpaka wa mzunguko / usiofunikwa na peritoneum' },
  non_neoplastic_stomach: { label: 'Tumbo lisilo na uvimbe' }, lymph_nodes: { label: 'Tezi za limfu' },
};
const stomachBlockFields_ur = {
  tumor_representative_sections: { label: 'رسولی (نمائندہ حصے)' },
  proximal_margin: { label: 'قریبی مارجن' }, distal_margin: { label: 'بعیدی مارجن' },
  circumferential_non_peritonealised_margin: { label: 'محیطی / غیر پیریٹونیلائزڈ مارجن' },
  non_neoplastic_stomach: { label: 'غیر رسولی معدہ' }, lymph_nodes: { label: 'لمف نوڈز' },
};

write(join(colonBase, 'stomach_resection_gross.i18n_ar.json'), buildStomachI18n({
  title: 'استئصال ورم المعدة (قالب الفحص العياني)',
  otherSpecify: 'أخرى (يُحدد)',
  specimenLabel: 'العينة', resectionLabel: 'نوع الاستئصال (اختر واحدًا)', resectionOpts: resectionOpts_ar,
  greaterCurvLabel: 'المعدة، الانحناء الكبير', lesserCurvLabel: 'المعدة، الانحناء الصغير', esophagusLabel: 'المريء', duodenumLabel: 'الاثنا عشر',
  tumorLabel: 'الورم', macroSiteLabel: 'الموقع العياني للورم (اختر كل ما ينطبق)', macroSiteOpts: tumorSiteStomach_ar, morphLabel: 'التصنيف الشكلي', morphOpts: morphOpts_ar,
  tumorDimsLabel: 'أبعاد الورم', proxDistLabel: 'الهامش القريب', distalDistLabel: 'الهامش البعيد', lesserCurvDistLabel: 'هامش الانحناء الصغير', greaterCurvDistLabel: 'هامش الانحناء الكبير',
  lnLabel: 'العقد اللمفية', lnNumberLabel: 'العدد المحدد', lnMinLabel: 'أدنى مدى الحجم (مم)', lnMaxLabel: 'أقصى مدى الحجم (مم)',
  blockKeyLabel: 'مفتاح تعريف الكتل', blockFields: stomachBlockFields_ar,
  grossingLabel: 'الفحص العياني', grossedByLabel: 'أُجري الفحص العياني بواسطة', dateLabel: 'التاريخ',
}));

write(join(colonBase, 'stomach_resection_gross.i18n_fr.json'), buildStomachI18n({
  title: 'Résection de tumeur gastrique (Modèle macroscopique)',
  otherSpecify: 'Autre (préciser)',
  specimenLabel: 'Spécimen', resectionLabel: 'Type de résection (sélectionner une réponse)', resectionOpts: resectionOpts_fr,
  greaterCurvLabel: 'Estomac, grande courbure', lesserCurvLabel: 'Estomac, petite courbure', esophagusLabel: 'Œsophage', duodenumLabel: 'Duodénum',
  tumorLabel: 'Tumeur', macroSiteLabel: 'Site macroscopique de la tumeur (sélectionner toutes les réponses applicables)', macroSiteOpts: tumorSiteStomach_fr, morphLabel: 'Classification morphologique', morphOpts: morphOpts_fr,
  tumorDimsLabel: 'Dimensions de la tumeur', proxDistLabel: 'Marge proximale', distalDistLabel: 'Marge distale', lesserCurvDistLabel: 'Marge de la petite courbure', greaterCurvDistLabel: 'Marge de la grande courbure',
  lnLabel: 'Ganglions lymphatiques', lnNumberLabel: 'Nombre identifié', lnMinLabel: 'Intervalle de taille minimum (mm)', lnMaxLabel: 'Intervalle de taille maximum (mm)',
  blockKeyLabel: "Clé d'identification des blocs", blockFields: stomachBlockFields_fr,
  grossingLabel: 'Macroscopie', grossedByLabel: 'Macroscopie réalisée par', dateLabel: 'Date',
}));

write(join(colonBase, 'stomach_resection_gross.i18n_sw.json'), buildStomachI18n({
  title: 'Upasuaji wa Uvimbe wa Tumbo (Kiolezo cha Gross)',
  otherSpecify: 'Nyingine (eleza)',
  specimenLabel: 'Sampuli', resectionLabel: 'Aina ya ukataji (chagua moja)', resectionOpts: resectionOpts_sw,
  greaterCurvLabel: 'Tumbo, mpindo mkubwa', lesserCurvLabel: 'Tumbo, mpindo mdogo', esophagusLabel: 'Umio', duodenumLabel: 'Duodenum',
  tumorLabel: 'Uvimbe', macroSiteLabel: 'Mahali pa uvimbe kwa macho (chagua yote yanayohusika)', macroSiteOpts: tumorSiteStomach_sw, morphLabel: 'Uainishaji wa kimuundo', morphOpts: morphOpts_sw,
  tumorDimsLabel: 'Vipimo vya uvimbe', proxDistLabel: 'Mpaka wa karibu', distalDistLabel: 'Mpaka wa mbali', lesserCurvDistLabel: 'Mpaka wa mpindo mdogo', greaterCurvDistLabel: 'Mpaka wa mpindo mkubwa',
  lnLabel: 'Tezi za limfu', lnNumberLabel: 'Idadi iliyotambuliwa', lnMinLabel: 'Kiwango cha chini cha ukubwa (mm)', lnMaxLabel: 'Kiwango cha juu cha ukubwa (mm)',
  blockKeyLabel: 'Ufunguo wa utambuzi wa bloki', blockFields: stomachBlockFields_sw,
  grossingLabel: 'Uchunguzi wa macho', grossedByLabel: 'Imefanyiwa gross na', dateLabel: 'Tarehe',
}));

write(join(colonBase, 'stomach_resection_gross.i18n_ur.json'), buildStomachI18n({
  title: 'گیسٹرک ٹیومر ریسیکشن (گراسنگ ٹیمپلیٹ)',
  otherSpecify: 'دیگر (واضح کریں)',
  specimenLabel: 'نمونہ', resectionLabel: 'ریسیکشن کی قسم (ایک منتخب کریں)', resectionOpts: resectionOpts_ur,
  greaterCurvLabel: 'معدہ، بڑا خم', lesserCurvLabel: 'معدہ، چھوٹا خم', esophagusLabel: 'غذائی نالی', duodenumLabel: 'گرہنی',
  tumorLabel: 'رسولی', macroSiteLabel: 'رسولی کا ظاہری مقام (تمام متعلقہ منتخب کریں)', macroSiteOpts: tumorSiteStomach_ur, morphLabel: 'مورفولوجیکل درجہ بندی', morphOpts: morphOpts_ur,
  tumorDimsLabel: 'رسولی کی پیمائشیں', proxDistLabel: 'قریبی مارجن', distalDistLabel: 'بعیدی مارجن', lesserCurvDistLabel: 'چھوٹے خم کا مارجن', greaterCurvDistLabel: 'بڑے خم کا مارجن',
  lnLabel: 'لمف نوڈز', lnNumberLabel: 'شناخت شدہ تعداد', lnMinLabel: 'سائز کی کم از کم حد (ملی میٹر)', lnMaxLabel: 'سائز کی زیادہ سے زیادہ حد (ملی میٹر)',
  blockKeyLabel: 'بلاک شناختی کلید', blockFields: stomachBlockFields_ur,
  grossingLabel: 'گراس', grossedByLabel: 'گراس کیا گیا از', dateLabel: 'تاریخ',
}));

console.log('\nAll i18n files written successfully!');
