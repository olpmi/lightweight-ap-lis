/**
 * Demo lifecycle recorder.
 *
 * Records ONE long Playwright video per supported UI language that walks the
 * complete pathology case lifecycle:
 *
 *   1. Login from home
 *   2. Order Entry → create SU order with multiple Colon resection specimens
 *   3. Processing → clinical history, blocks, gross template, save
 *   4. Histology → advance H&E slides through MICROTOMY → SLIDE_STAIN → DISTRIBUTED
 *   5. Result page → Materials tab walk-through
 *   6. Result Entry → diagnosis, microscopic template, save draft
 *   7. Order Ancillary (IHC: MMR Panel + Molecular: BRAF), comment, sign prelim
 *   8. Histology IHC worklist → advance MMR through statuses
 *   9. Molecular send-out worklist → advance BRAF through statuses
 *  10. Re-open result page → Ancillary tab + Report History tab
 *  11. Update comment, preview PDF, sign out
 *
 * Output: apps/frontend/demo-videos/<lang>.webm
 *
 * Run (from repo root):
 *   PLAYWRIGHT_BACKEND_URL=http://localhost:3001 \
 *   npx playwright test --config=apps/frontend/playwright.config.ts \
 *       --project=chromium src/tests/e2e/demo-lifecycle.spec.ts
 *
 * NOTE: This is a *demo recorder*, not a strict assertion test. Steps that
 * depend on optional UI text or seed-dependent data are wrapped in try/catch
 * so the recording continues smoothly even when a single step misfires.
 */
import { test, expect, Page, BrowserContext, Locator } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs/promises';
import { fileURLToPath } from 'url';

// ─── Config ────────────────────────────────────────────────────────────────

const LANGS = ['en', 'fr', 'sw', 'ar', 'ur'] as const;
type Lang = (typeof LANGS)[number];

// __dirname shim for ESM (the frontend package is type:module).
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEMO_USER = process.env.DEMO_USER ?? 'asmith'; // Pathologist seed user
const VIDEO_DIR = path.resolve(__dirname, '../../../demo-videos');
const TMP_DIR = path.resolve(__dirname, '../../../demo-videos/.tmp');

const VIEWPORT = { width: 1280, height: 720 };
// Slow enough that a viewer can clearly follow the cursor and see results.
const PACE_MS = 1_100;
const SHORT_PAUSE = 600;
const LONG_PAUSE = 2_000;

// Disable Playwright's parallelism — we run language scenarios serially.
test.describe.configure({ mode: 'serial' });

// This is a demo recorder, not a CI test. It mutates the database (creates an
// order, sign-outs a report, etc.) and is too long for CI. Opt-in via env var.
const RUN_DEMO = !!process.env.RUN_DEMO;

// ─── Tiny helpers ──────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wrap a fragile UI step so a missed selector doesn't abort the recording. */
async function step(name: string, fn: () => Promise<void>): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(`  ▸ ${name}`);
  try {
    await fn();
    await sleep(PACE_MS);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`    ✗ skipped (${name}): ${(err as Error).message?.split('\n')[0]}`);
  }
}

async function clickIfVisible(loc: Locator, timeout = 2_000): Promise<boolean> {
  try {
    await loc.first().waitFor({ state: 'visible', timeout });
    await loc.first().click();
    return true;
  } catch {
    return false;
  }
}

/** Click first match for any of the candidate locators. */
async function clickAny(page: Page, candidates: Locator[], timeout = 2_000): Promise<boolean> {
  for (const c of candidates) {
    if (await clickIfVisible(c, timeout)) return true;
  }
  return false;
}

/** Smooth scroll the page so a viewer can absorb what's on screen. */
async function smoothScroll(page: Page, totalDeltaY: number, steps = 8): Promise<void> {
  const stepDelta = totalDeltaY / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, stepDelta);
    await sleep(180);
  }
}

// ─── Caption overlay ───────────────────────────────────────────────────────
//
// A fixed-position caption is injected into every page so the viewer of the
// recorded video sees a short description of the current scene. The caption
// text is persisted in localStorage so it survives page navigations (each
// route re-runs the init script and re-creates the overlay element).

const CAPTION_INIT_SCRIPT = `
  (function () {
    function ensureCaption() {
      if (document.getElementById('__demo_caption__')) return;
      if (!document.body) return;
      var el = document.createElement('div');
      el.id = '__demo_caption__';
      el.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'background:rgba(15,23,42,0.92);color:#fff;' +
        'font:600 18px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
        'padding:14px 22px;border-radius:10px;z-index:2147483647;' +
        'max-width:78%;text-align:center;pointer-events:none;' +
        'box-shadow:0 6px 18px rgba(0,0,0,0.45);' +
        'border:1px solid rgba(255,255,255,0.12);' +
        'letter-spacing:0.01em;';
      try {
        var stored = localStorage.getItem('__demoCaption__') || '';
        el.textContent = stored;
        if (!stored) el.style.display = 'none';
      } catch (e) { /* */ }
      document.body.appendChild(el);
    }
    if (document.body) ensureCaption();
    else document.addEventListener('DOMContentLoaded', ensureCaption);
    // Re-attach if React clears the body (rare, defensive).
    var iv = setInterval(ensureCaption, 800);
    setTimeout(function () { clearInterval(iv); }, 30000);
  })();
`;

/** Localised caption strings keyed by phase id. Kept terse so a single line fits. */
const CAPTIONS: Record<string, Record<Lang, string>> = {
  login:           { en: 'Sign in to the LIS',                              fr: 'Connexion au LIS',                                sw: 'Ingia kwenye LIS',                                  ar: 'تسجيل الدخول إلى نظام المختبر',                  ur: 'LIS میں سائن ان' },
  switchLang:      { en: 'Switch the interface language',                   fr: 'Changer la langue de l\'interface',               sw: 'Badilisha lugha ya kiolesura',                      ar: 'تغيير لغة الواجهة',                                ur: 'انٹرفیس کی زبان تبدیل کریں' },
  orderEntry:      { en: 'Order Entry — create a new surgical case',        fr: 'Saisie de commande — créer un nouveau cas',       sw: 'Ingiza Agizo — tengeneza kesi mpya',                ar: 'إدخال الطلب — إنشاء حالة جراحية جديدة',         ur: 'آرڈر اندراج — نیا سرجیکل کیس بنائیں' },
  processing:      { en: 'Processing — clinical history, blocks, gross',    fr: 'Macroscopie — histoire clinique, blocs, examen',  sw: 'Uchakataji — historia, vizuizi, uchunguzi mbaya',   ar: 'المعالجة — التاريخ والكتل والوصف العياني',     ur: 'پروسیسنگ — کلینیکل ہسٹری، بلاکس، گراس' },
  histologyHE:     { en: 'Histology — H&E slides through the lab',          fr: 'Histologie — lames H&E à travers le laboratoire', sw: 'Histolojia — slaidi za H&E katika maabara',         ar: 'علم الأنسجة — شرائح H&E عبر المختبر',           ur: 'ہسٹولوجی — H&E سلائیڈز لیب میں' },
  resultEntry:     { en: 'Result Entry — diagnosis & microscopic report',   fr: 'Saisie résultat — diagnostic & microscopie',      sw: 'Ingiza Matokeo — utambuzi na ripoti ya kioo',       ar: 'إدخال النتيجة — التشخيص والتقرير المجهري',      ur: 'نتیجہ اندراج — تشخیص اور خوردبینی رپورٹ' },
  ancillaryOrder:  { en: 'Order ancillary tests — IHC MMR + BRAF',          fr: 'Tests complémentaires — IHC MMR + BRAF',          sw: 'Vipimo vya ziada — IHC MMR + BRAF',                 ar: 'الاختبارات التكميلية — IHC MMR + BRAF',         ur: 'اضافی ٹیسٹ — IHC MMR + BRAF' },
  signPrelim:      { en: 'Preview PDF and sign preliminary report',         fr: 'Aperçu PDF et signature préliminaire',            sw: 'Hakiki PDF na saini ripoti ya awali',               ar: 'معاينة PDF وتوقيع التقرير الأولي',              ur: 'PDF پیش نظارہ اور پریلم سائن کریں' },
  histologyIHC:    { en: 'Histology IHC — cut, stain, distribute',          fr: 'IHC histologie — coupe, coloration, distribution', sw: 'IHC ya histolojia — kata, paka, sambaza',          ar: 'الكيمياء المناعية — قطع، صبغ، توزيع',          ur: 'IHC — کاٹیں، سٹین، تقسیم' },
  molecularSendOut:{ en: 'Molecular send-out — ship BRAF and receive results', fr: 'Envoi moléculaire — expédier BRAF, recevoir résultats', sw: 'Tuma molekuli — peleka BRAF, pokea matokeo',  ar: 'الإرسال الجزيئي — إرسال BRAF واستلام النتائج', ur: 'مالیکیولر — BRAF بھیجیں اور نتائج وصول کریں' },
  reviewAncillary: { en: 'Review ancillary results & report history',       fr: 'Examen des résultats et historique du rapport',   sw: 'Pitia matokeo ya ziada na historia',                ar: 'مراجعة النتائج التكميلية وسجل التقرير',         ur: 'اضافی نتائج اور رپورٹ ہسٹری کا جائزہ' },
  signOut:         { en: 'Final preview and sign out report',               fr: 'Aperçu final et signature du rapport',            sw: 'Hakiki ya mwisho na saini ripoti',                  ar: 'المعاينة النهائية وتوقيع التقرير',              ur: 'حتمی پیش نظارہ اور رپورٹ سائن آؤٹ' },
};

// ─── Localized free-text the demo types into the UI ───────────────────────
//
// All clinical narrative typed into the application (clinical history,
// diagnosis text, addendum/free-text comments) is translated per language so
// the recorded videos read naturally in every locale instead of showing
// English prose under a translated UI.

const CLINICAL_HISTORY: Record<Lang, string> = {
  en: '59-year-old patient, screening colonoscopy revealed a 4 cm mass in the sigmoid colon. Biopsy positive for adenocarcinoma. Resected for definitive treatment.',
  fr: 'Patient de 59 ans. Coloscopie de dépistage révélant une masse de 4 cm dans le côlon sigmoïde. Biopsie positive pour adénocarcinome. Résection pour traitement définitif.',
  sw: 'Mgonjwa wa miaka 59. Koloskopia ya uchunguzi ilibaini uvimbe wa sm 4 katika koloni ya sigmoidi. Biopsia chanya kwa adenocarcinoma. Imeondolewa kwa tiba kamili.',
  ar: 'مريض يبلغ من العمر 59 عامًا. كشف تنظير القولون عن كتلة بحجم 4 سم في القولون السيني. الخزعة إيجابية للسرطان الغدي. تم استئصالها للعلاج النهائي.',
  ur: '59 سالہ مریض۔ اسکریننگ کولونوسکوپی میں سگمائڈ کولن میں 4 سینٹی میٹر کا ماس دیکھا گیا۔ بایوپسی اڈینوکارسینوما کے لیے مثبت۔ حتمی علاج کے لیے ریسیکشن۔',
};

const DIAGNOSIS_TEXT: Record<Lang, string> = {
  en: 'Sigmoid colon, resection: invasive moderately differentiated adenocarcinoma, 3.8 cm, invading through muscularis propria into pericolic fat (pT3). 0/14 lymph nodes involved. Margins negative.',
  fr: 'Côlon sigmoïde, résection : adénocarcinome invasif modérément différencié, 3,8 cm, envahissant la musculeuse propre jusque dans la graisse péri-colique (pT3). 0/14 ganglions lymphatiques atteints. Marges négatives.',
  sw: 'Koloni ya sigmoidi, kuondolewa: adenocarcinoma yenye uvamizi yenye kutofautishwa kiasi, sm 3.8, ikivamia kupitia muscularis propria hadi mafuta ya peri-koloni (pT3). 0/14 tezi za limfu zimeathirika. Pembe ni hasi.',
  ar: 'القولون السيني، استئصال: سرطان غدي غازٍ متوسط التمايز، 3.8 سم، يخترق الطبقة العضلية المخصوصة إلى الدهون حول القولون (pT3). 0/14 من العقد الليمفاوية متأثرة. الحواف سلبية.',
  ur: 'سگمائڈ کولن، ریسیکشن: حملہ آور درمیانے درجے کا تفریق شدہ اڈینوکارسینوما، 3.8 سینٹی میٹر، مسکیولرس پروپرا کے ذریعے پیری کولک چربی میں حملہ آور (pT3)۔ 0/14 لمف نوڈز متاثر۔ مارجنز منفی۔',
};

const COMMENT_PENDING: Record<Lang, string> = {
  en: 'Ancillary studies pending: MMR IHC and BRAF V600E. Final report to follow.',
  fr: 'Études complémentaires en attente : IHC MMR et BRAF V600E. Rapport final à suivre.',
  sw: 'Vipimo vya ziada vinasubiri: IHC MMR na BRAF V600E. Ripoti ya mwisho itafuata.',
  ar: 'الدراسات التكميلية معلقة: الكيمياء المناعية MMR و BRAF V600E. سيتبع التقرير النهائي.',
  ur: 'اضافی مطالعات زیرِ التوا: MMR IHC اور BRAF V600E۔ حتمی رپورٹ بعد میں۔',
};

const COMMENT_FINAL: Record<Lang, string> = {
  en: 'MMR IHC retained for MLH1, MSH2, MSH6, PMS2 (mismatch-repair proficient). BRAF V600E not detected. Findings consistent with sporadic adenocarcinoma; no further screening indicated based on these markers.',
  fr: 'IHC MMR conservé pour MLH1, MSH2, MSH6, PMS2 (système de réparation des mésappariements compétent). BRAF V600E non détecté. Constatations compatibles avec un adénocarcinome sporadique ; aucun dépistage supplémentaire indiqué sur la base de ces marqueurs.',
  sw: 'IHC ya MMR imehifadhiwa kwa MLH1, MSH2, MSH6, PMS2 (mfumo wa kurekebisha hauna kasoro). BRAF V600E haijapatikana. Matokeo yanaendana na adenocarcinoma ya kawaida; hakuna uchunguzi zaidi unaoshauriwa kwa msingi wa alama hizi.',
  ar: 'الكيمياء المناعية لـ MMR محفوظة لـ MLH1 و MSH2 و MSH6 و PMS2 (نظام إصلاح عدم التطابق سليم). لم يُكتشف BRAF V600E. النتائج متوافقة مع سرطان غدي متفرق؛ لا يُشار إلى أي فحص إضافي بناءً على هذه العلامات.',
  ur: 'MLH1, MSH2, MSH6, PMS2 کے لیے MMR IHC برقرار (مسمیچ ریپیئر پروفیشنٹ)۔ BRAF V600E دریافت نہیں ہوا۔ نتائج اسپوریڈک اڈینوکارسینوما سے مطابقت رکھتے ہیں؛ ان مارکرز کی بنیاد پر مزید اسکریننگ کی ضرورت نہیں۔',
};

// Localized labels for the in-page report preview overlay (we render a custom
// HTML mockup of the PDF since headless Chromium does not display PDFs).
// Matches DEFAULT_REPORT_HTML_TEMPLATE in pdf.layout.service.ts so the demo
// preview visually mirrors the real preliminary/final report.
const PREVIEW_LABELS: Record<Lang, {
  reportTitle: string;
  draftPreview: string;
  version: string;
  patient: string;
  name: string;
  patientId: string;
  dateOfBirth: string;
  sex: string;
  clinician: string;
  clinicalHistory: string;
  grossDescription: string;
  diagnosis: string;
  comment: string;
  pathologistPreview: string;
  notSigned: string;
}> = {
  en: { reportTitle: 'Anatomic Pathology Report', draftPreview: 'Draft Preview', version: 'Version', patient: 'Patient', name: 'Name', patientId: 'Patient ID', dateOfBirth: 'Date of Birth', sex: 'Sex', clinician: 'Clinician', clinicalHistory: 'Clinical History', grossDescription: 'Gross Description', diagnosis: 'Diagnosis', comment: 'Comment', pathologistPreview: 'Pathologist (preview)', notSigned: '*** DRAFT PREVIEW — NOT A SIGNED REPORT ***' },
  fr: { reportTitle: 'Rapport d\'Anatomopathologie', draftPreview: 'Aperçu Provisoire', version: 'Version', patient: 'Patient', name: 'Nom', patientId: 'ID patient', dateOfBirth: 'Date de naissance', sex: 'Sexe', clinician: 'Clinicien', clinicalHistory: 'Histoire Clinique', grossDescription: 'Description Macroscopique', diagnosis: 'Diagnostic', comment: 'Commentaire', pathologistPreview: 'Pathologiste (aperçu)', notSigned: '*** APERÇU PROVISOIRE — RAPPORT NON SIGNÉ ***' },
  sw: { reportTitle: 'Ripoti ya Patholojia ya Anatomia', draftPreview: 'Hakiki ya Rasimu', version: 'Toleo', patient: 'Mgonjwa', name: 'Jina', patientId: 'Kitambulisho cha Mgonjwa', dateOfBirth: 'Tarehe ya Kuzaliwa', sex: 'Jinsia', clinician: 'Mtaalamu', clinicalHistory: 'Historia ya Kliniki', grossDescription: 'Maelezo ya Nje', diagnosis: 'Utambuzi', comment: 'Maoni', pathologistPreview: 'Mtaalamu wa Patholojia (hakiki)', notSigned: '*** HAKIKI YA RASIMU — SI RIPOTI ILIYOSAINIWA ***' },
  ar: { reportTitle: 'تقرير علم الأمراض التشريحي', draftPreview: 'معاينة المسودة', version: 'الإصدار', patient: 'المريض', name: 'الاسم', patientId: 'رقم المريض', dateOfBirth: 'تاريخ الميلاد', sex: 'الجنس', clinician: 'الطبيب', clinicalHistory: 'التاريخ السريري', grossDescription: 'الوصف العياني', diagnosis: 'التشخيص', comment: 'تعليق', pathologistPreview: 'أخصائي علم الأمراض (معاينة)', notSigned: '*** معاينة المسودة — وليست تقريرًا موقعًا ***' },
  ur: { reportTitle: 'اناٹومک پیتھالوجی رپورٹ', draftPreview: 'مسودہ پیش نظارہ', version: 'ورژن', patient: 'مریض', name: 'نام', patientId: 'مریض آئی ڈی', dateOfBirth: 'تاریخ پیدائش', sex: 'جنس', clinician: 'معالج', clinicalHistory: 'کلینیکل ہسٹری', grossDescription: 'گراس تفصیل', diagnosis: 'تشخیص', comment: 'تبصرہ', pathologistPreview: 'پیتھالوجسٹ (پیش نظارہ)', notSigned: '*** مسودہ پیش نظارہ — دستخط شدہ رپورٹ نہیں ***' },
};

/** Mutate the caption overlay (creating it if necessary) and persist in localStorage. */
async function setCaption(page: Page, text: string): Promise<void> {
  await page.evaluate((t) => {
    try { localStorage.setItem('__demoCaption__', t); } catch { /* */ }
    // Remove any duplicate caption elements (init script may have created
    // additional copies after navigation events).
    const all = document.querySelectorAll('#__demo_caption__');
    for (let i = 1; i < all.length; i++) all[i].remove();
    let el = document.getElementById('__demo_caption__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption__';
      el.style.cssText =
        'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);' +
        'background:rgba(15,23,42,0.92);color:#fff;' +
        'font:600 18px/1.35 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
        'padding:14px 22px;border-radius:10px;z-index:2147483647;' +
        'max-width:78%;text-align:center;pointer-events:none;' +
        'box-shadow:0 6px 18px rgba(0,0,0,0.45);' +
        'border:1px solid rgba(255,255,255,0.12);' +
        'letter-spacing:0.01em;';
      document.body.appendChild(el);
    }
    el.textContent = t;
    el.style.display = t ? '' : 'none';
  }, text).catch(() => { /* page closed */ });
}

/**
 * Run a high-level scene with a localized caption pinned to the bottom of the
 * screen for the duration of the scene's recorded steps.
 */
async function phase(page: Page, key: keyof typeof CAPTIONS, lang: Lang, fn: () => Promise<void>): Promise<void> {
  const text = CAPTIONS[key]?.[lang] ?? CAPTIONS[key]?.en ?? '';
  await setCaption(page, text);
  // Brief beat so the viewer can read the caption before the scene begins.
  await sleep(900);
  await fn();
}

// ─── Realistic field values for the seeded colon resection templates ──────
//
// `fillAllTemplateFields` previously typed the same placeholder into every
// text input. To make recorded videos look like real cases, we now match each
// field's visible <label> against the patterns below and substitute clinically
// plausible values for a sigmoid colon adenocarcinoma resection (which is the
// case the demo always creates).

interface FieldRule {
  // Match against label text, lowercased.
  match: RegExp;
  // Either a static value or a function returning a value.
  value: string;
}

// Numeric field defaults (mm unless noted).
const NUMBER_RULES: FieldRule[] = [
  { match: /specimen length/i,                            value: '260' },
  { match: /distance to proximal margin/i,                value: '120' },
  { match: /distance to distal margin/i,                  value: '40' },
  { match: /distance to .*circumferential margin/i,       value: '6' },
  { match: /distance from dentate line/i,                 value: '0' },
  { match: /number identified/i,                          value: '14' },
  { match: /number positive/i,                            value: '0' },
  { match: /number examined/i,                            value: '14' },
  { match: /tumour deposits|tumor deposits/i,             value: '0' },
  { match: /mitotic count|mitoses/i,                      value: '6' },
  { match: /cold ischemic|cold ischaemic/i,               value: '20' },
  { match: /breslow|tumou?r thickness/i,                  value: '3' },
  { match: /percent|percentage|%|ki-?67/i,                value: '15' },
  { match: /greatest dimension.*cm|tumou?r size.*cm/i,    value: '3.8' },
  { match: /greatest dimension/i,                         value: '38' },
  { match: /additional dimension/i,                       value: '32' },
];

// Text/textarea field substitutions.
const TEXT_RULES: FieldRule[] = [
  { match: /procedure type/i,                             value: 'Sigmoid colectomy' },
  { match: /anatomical components/i,                      value: 'Segment of sigmoid colon, attached pericolic adipose tissue, vascular pedicle.' },
  { match: /tumou?r dimensions/i,                         value: '38 x 32 x 14' },
  { match: /tumor dimensions \(mm\)/i,                    value: '38 x 32 x 14' },
  { match: /additional dimensions/i,                      value: '3.2 x 1.4' },
  { match: /size range/i,                                 value: '3 – 9 mm' },
  { match: /^block.*tumou?r$|tumou?r.*block/i,            value: 'A1–A4: tumor with deepest invasion' },
  { match: /^proximal margin$/i,                          value: 'A5: proximal donut' },
  { match: /^distal margin$/i,                            value: 'A6: distal donut' },
  { match: /^circumferential margin$/i,                   value: 'A7: closest radial margin' },
  { match: /non-?neoplastic colon|non-?neoplastic mucosa/i, value: 'A8: uninvolved colon, away from tumor' },
  { match: /^lymph nodes$/i,                              value: 'A9–A12: peri-colic and apical nodes' },
  { match: /additional sections/i,                        value: 'A13: serosal aspect overlying tumor' },
  { match: /if present.*details|polyps.*details/i,        value: 'Two small sessile polyps, 4 mm and 6 mm, in non-tumoral colon.' },
  { match: /other relevant macroscopic|other findings/i,  value: 'No additional gross abnormalities. Pericolic fat without nodularity.' },
  // Microscopic-specific text fields:
  { match: /distance from invasive.*closest margin/i,     value: '55 mm (radial)' },
  { match: /distance to radial margin.*rectal/i,          value: 'Not applicable' },
  { match: /distance to distal margin.*rectal/i,          value: 'Not applicable' },
  { match: /number of lymph nodes with tumor/i,           value: '0' },
  { match: /number of lymph nodes examined/i,             value: '14' },
  { match: /number of tumor deposits/i,                   value: '0' },
  { match: /number of tumor buds/i,                       value: '3' },
  { match: /margin comment/i,                             value: 'All resection margins are free of invasive carcinoma; closest margin is the radial (circumferential) margin at 55 mm.' },
  { match: /regional lymph node comment|lymph node comment/i, value: '14 regional lymph nodes examined; all negative for metastatic carcinoma. No extranodal tumor deposits identified.' },
  { match: /tumor comment|tumour comment/i,               value: 'Invasive moderately differentiated adenocarcinoma extending through the muscularis propria into pericolic adipose tissue, with no evidence of lymphovascular or perineural invasion.' },
  { match: /^comment\(?s?\)?$/i,                          value: 'Findings consistent with primary sigmoid colon adenocarcinoma, pT3 N0. Recommend correlation with MMR/MSI status and clinical staging.' },
  { match: /cannot be determined/i,                       value: '' },
  { match: /other.*specify|specify.*other/i,              value: '' },
  // Generic fallbacks (broader patterns last):
  { match: /tumou?r site|^location|^site$/i,              value: 'Sigmoid colon' },
  { match: /diagnos/i,                                    value: 'Invasive moderately differentiated adenocarcinoma' },
  { match: /grade/i,                                      value: 'Moderately differentiated (G2)' },
  { match: /histologic.*type|histological.*type/i,        value: 'Adenocarcinoma, NOS' },
  { match: /^margins?$/i,                                 value: 'All surgical margins free of tumor' },
  { match: /comment|note|remark/i,                        value: 'Findings consistent with primary colorectal adenocarcinoma.' },
];

// Select/option preference rules.
//
// Each rule has a `detect` regex that matches against the English `data-value`
// attributes on `<li role="option">` items. The first rule whose detect regex
// matches ANY option in the open listbox wins, and `prefer` is the list of
// patterns to try (in order) against option values to choose what to click.
// Because option `data-value` is always English (regardless of UI language),
// these rules work in every language without translation tables.
interface SelectRule {
  detect: RegExp;
  prefer: RegExp[];
}
const SELECT_RULES: SelectRule[] = [
  // === Gross template selects (colon_rectum_resection_gross_tumor_v1) ===
  // tumor_perforation, invades_peritoneal_surface, forms_discrete_serosal_nodules
  { detect: /^Sigmoid colon$/, prefer: [/^Sigmoid colon$/i] },         // tumor_site
  { detect: /^Astride$|^Entirely below$/, prefer: [/^Entirely above$/i] }, // anterior peritoneal reflection (rectal-only)
  { detect: /^Incomplete \(Grade 1\)$/, prefer: [/^Complete \(Grade 3\)$/i] }, // mesorectum

  // === Microscopic template (colorectal_malignant_tumor_resection_v1) ===
  // procedure: detect by sigmoidectomy option
  { detect: /^Sigmoidectomy$/, prefer: [/^Sigmoidectomy$/i] },
  // macroscopic_mesorectum: detect by Cannot be determined; pick Not applicable
  { detect: /^Near complete$/, prefer: [/^Not applicable$/i] },
  // rectal_tumor_location: pick Not applicable (sigmoid, not rectal)
  { detect: /Straddles anterior peritoneal/, prefer: [/^Not applicable$/i] },
  // histologic_type: detect by Adenocarcinoma + Mucinous
  { detect: /^Mucinous adenocarcinoma$/, prefer: [/^Adenocarcinoma$/i] },
  // histologic_grade
  { detect: /^G2, moderately differentiated$/, prefer: [/^G2, moderately differentiated$/i] },
  // multiple_primary_sites
  { detect: /^Not applicable$.*Present|^Present$/, prefer: [/^Not applicable$/i] },
  // tumor_extent: detect by "Invades through muscularis propria into pericolic"
  { detect: /muscularis propria into pericolic/i, prefer: [/Invades through muscularis propria into pericolic/i] },
  // submucosal_invasion.status (pT1 only): pick Not applicable
  { detect: /Not applicable.*Not identified.*Present|^Not identified$.*Present|Less than 1 mm|Upper one third/, prefer: [/^Not applicable$/i, /Cannot be determined/i] },
  // macroscopic_tumor_perforation
  { detect: /^Not identified$.*Present.*Cannot be determined/, prefer: [/^Not identified$/i] },
  // lymphovascular: detect by Small vessel option (multi_select)
  { detect: /^Small vessel$|Large vessel \(venous\)/, prefer: [/^Not identified$/i] },
  // perineural_invasion
  { detect: /Cannot be determined$/, prefer: [/^Not identified$/i] },
  // tumor_budding_score
  { detect: /^Low \(0-4\)$/, prefer: [/^Low \(0-4\)$/i] },
  // polyp_origin: detect by Tubular adenoma option
  { detect: /^Tubular adenoma$/, prefer: [/^None identified$/i] },
  // treatment_effect
  { detect: /No known presurgical therapy/, prefer: [/No known presurgical therapy/i] },
  // margin_status_invasive
  { detect: /All margins negative for invasive carcinoma/, prefer: [/All margins negative for invasive carcinoma/i] },
  // closest_margin (multi_select): pick Proximal
  { detect: /^Radial \(circumferential\)$/, prefer: [/^Proximal$/i] },
  // non_invasive_margin_status (multi_select)
  { detect: /All margins negative for high-grade dysplasia/, prefer: [/All margins negative for high-grade dysplasia/i] },
  // regional_lymph_nodes.status
  { detect: /All regional lymph nodes negative for tumor/, prefer: [/All regional lymph nodes negative for tumor/i] },
  // tumor_deposits
  { detect: /^Not identified$/, prefer: [/^Not identified$/i] },
  // distant_metastasis.sites (multi_select)
  { detect: /Non-regional lymph node|^Liver$/, prefer: [/^Not applicable$/i] },
  // ptnm.modified_classification (multi_select)
  { detect: /\(post-neoadjuvant therapy\)|^r \(recurrence\)$/, prefer: [/^Not applicable$/i] },
  // pT_category
  { detect: /^pT4a$/, prefer: [/^pT3$/i] },
  // T_suffix
  { detect: /multiple primary synchronous tumors/i, prefer: [/^Not applicable$/i] },
  // pN_category
  { detect: /^pN2b$/, prefer: [/^pN0$/i] },
  // pM_category
  { detect: /^pM1c$/, prefer: [/^Not applicable$/i] },
  // additional_findings (multi_select)
  { detect: /^Crohn disease$|^Diverticulosis$/, prefer: [/^None identified$/i] },
];

function pickNumberValue(label: string): string {
  for (const r of NUMBER_RULES) if (r.match.test(label)) return r.value;
  return '';
}
function pickTextValue(label: string): string {
  for (const r of TEXT_RULES) if (r.match.test(label)) return r.value;
  // No generic placeholder — leaving the field empty keeps the report clean
  // when a label is unrecognised.
  return '';
}

/**
 * Choose preferred-option patterns by inspecting the open listbox's option
 * `data-value` attributes (which are always English, even in localized UIs).
 * Returns null when no rule matches any option in the listbox.
 */
function pickSelectOption(optionValues: string[]): RegExp[] | null {
  for (const rule of SELECT_RULES) {
    for (const v of optionValues) {
      if (rule.detect.test(v)) return rule.prefer;
    }
  }
  return null;
}

/**
 * Walk the visible accordion sections of a StructuredTemplateEditor and fill
 * every empty form input we recognise (text/number/date/textarea/select).
 * Designed to handle whatever fields the seeded templates expose without
 * needing template-specific field knowledge.
 */
async function fillAllTemplateFields(page: Page, scope: Locator): Promise<void> {
  // Make sure every accordion section is expanded.
  const collapsed = scope.locator('.MuiAccordion-root .MuiAccordionSummary-root[aria-expanded="false"]');
  const collapsedN = await collapsed.count();
  for (let i = 0; i < collapsedN; i++) {
    await collapsed.nth(i).click().catch(() => {});
    await sleep(200);
  }

  // Fill every text/number/date input that's currently empty and not read-only.
  // Each field is wrapped in a TextField with an MUI <label> sibling whose
  // text we read to choose a clinically plausible value.
  const fieldWrappers = scope.locator('.MuiFormControl-root:has(input:not([type="hidden"]):not([readonly]))');
  const total = await fieldWrappers.count();
  for (let i = 0; i < total; i++) {
    const fc = fieldWrappers.nth(i);
    const inp = fc.locator('input:not([type="hidden"]):not([readonly])').first();
    if (!(await inp.isVisible().catch(() => false))) continue;
    const role = await inp.getAttribute('role');
    if (role === 'combobox') continue; // Selects handled below.
    const type = (await inp.getAttribute('type')) ?? 'text';
    const current = (await inp.inputValue().catch(() => '')) ?? '';
    if (current.trim() !== '') continue;
    const label = ((await fc.locator('label').first().innerText().catch(() => '')) ?? '').trim();
    try {
      if (type === 'number') {
        const v = pickNumberValue(label);
        if (v !== '') await inp.fill(v);
      } else if (type === 'date') {
        await inp.fill('2026-05-15');
      } else {
        const v = pickTextValue(label);
        if (v !== '') await inp.fill(v);
      }
      await sleep(120);
    } catch {
      /* skip non-fillable */
    }
  }

  // Fill every textarea that's empty.
  const taWrappers = scope.locator('.MuiFormControl-root:has(textarea:not([aria-hidden="true"]):not([readonly]))');
  const tN = await taWrappers.count();
  for (let i = 0; i < tN; i++) {
    const fc = taWrappers.nth(i);
    const ta = fc.locator('textarea:not([aria-hidden="true"]):not([readonly])').first();
    if (!(await ta.isVisible().catch(() => false))) continue;
    const v = (await ta.inputValue().catch(() => '')) ?? '';
    if (v.trim() !== '') continue;
    const label = ((await fc.locator('label').first().innerText().catch(() => '')) ?? '').trim();
    try {
      const value = pickTextValue(label);
      if (value !== '') await ta.fill(value);
      await sleep(120);
    } catch {
      /* */
    }
  }

  // Pick options for empty MUI Selects, preferring clinically plausible values.
  // We re-evaluate the empty selects on each pass since picking one option can
  // shift the DOM (e.g. revealing additional conditional sub-fields).
  for (let pass = 0; pass < 3; pass++) {
    const selectControls = scope.locator('.MuiFormControl-root:has([role="combobox"][aria-haspopup="listbox"])');
    const sN = await selectControls.count();
    let filledThisPass = 0;
    for (let i = 0; i < sN; i++) {
      const fc = selectControls.nth(i);
      const trig = fc.locator('[role="combobox"][aria-haspopup="listbox"]').first();
      if (!(await trig.isVisible().catch(() => false))) continue;
      const text = ((await trig.innerText().catch(() => '')) ?? '').trim();
      if (text !== '' && text !== '-') continue; // already chosen
      try {
        await trig.scrollIntoViewIfNeeded().catch(() => {});
        await trig.click({ timeout: 2_000 });
        const list = page.locator('ul[role="listbox"]');
        await list.waitFor({ state: 'visible', timeout: 2_000 });
        const opts = list.locator('li[role="option"]');
        const optN = await opts.count();
        // Snapshot option data-values up front so we can pick a rule by
        // detecting the field's English option set (locale-independent).
        const optionValues: string[] = [];
        for (let j = 0; j < optN; j++) {
          const v = (await opts.nth(j).getAttribute('data-value')) ?? '';
          if (v) optionValues.push(v);
        }
        const preferred = pickSelectOption(optionValues);
        let picked = false;
        if (preferred) {
          for (const pat of preferred) {
            for (let j = 0; j < optN; j++) {
              const o = opts.nth(j);
              const v = (await o.getAttribute('data-value')) ?? '';
              if (!v) continue;
              if (pat.test(v)) {
                await o.click({ timeout: 1_500 });
                picked = true;
                break;
              }
            }
            if (picked) break;
          }
        }
        if (!picked) {
          for (let j = 0; j < optN; j++) {
            const o = opts.nth(j);
            const v = await o.getAttribute('data-value');
            if (v && v !== '') {
              await o.click({ timeout: 1_500 });
              picked = true;
              break;
            }
          }
        }
        if (!picked) await page.keyboard.press('Escape');
        if (picked) filledThisPass++;
        await sleep(180);
        // Multi-select listboxes don't auto-close after a click; force-close.
        const stillOpen = await page.locator('ul[role="listbox"]').isVisible({ timeout: 100 }).catch(() => false);
        if (stillOpen) {
          await page.keyboard.press('Escape').catch(() => {});
          await sleep(180);
        }
      } catch {
        await page.keyboard.press('Escape').catch(() => {});
        await sleep(120);
      }
    }
    if (filledThisPass === 0) break;
  }
}

// ─── Domain helpers ────────────────────────────────────────────────────────

/**
 * Type the order's canonical id into the worklist's search box so subsequent
 * group-row actions are scoped to a single case. The search box on both
 * HistologyQueuePage and AncillaryQueuePage uses the same anc_searchPlaceholder
 * translation key, but its value differs across languages. Locating by the
 * leading <Search> startAdornment is locale-independent.
 */
async function filterWorklistByOrder(page: Page, orderId: string): Promise<void> {
  // The search field is the only TextField with a <Search> icon as its
  // startAdornment. We locate it via the FormControl that wraps both.
  const searchInput = page.locator(
    'div.MuiInputAdornment-positionStart svg[data-testid="SearchIcon"] >> xpath=ancestor::div[contains(@class,"MuiInputBase-root")][1]//input',
  ).first();
  if (await searchInput.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await searchInput.click();
    await searchInput.fill(orderId);
    await sleep(LONG_PAUSE);
  }
}

/** Expand the first collapsed group row on the current worklist table. */
async function expandFirstGroupRow(page: Page): Promise<void> {
  const collapsed = page.locator('table tbody tr svg[data-testid="KeyboardArrowRightIcon"]').first();
  if (await collapsed.isVisible({ timeout: 1_500 }).catch(() => false)) {
    await collapsed.click().catch(() => {});
    await sleep(SHORT_PAUSE);
  }
}

/**
 * Click the bulk action button on the first group row whose visible label
 * matches the regex; falls back to button index when the regex misses (e.g.
 * because the label is RTL/CJK and the regex doesn't cover it).
 */
async function clickGroupAction(page: Page, labelRegex: RegExp, fallbackIndex = 0): Promise<void> {
  const groupRow = page
    .locator('table tbody tr')
    .filter({ has: page.locator('.MuiChip-root[class*="colorPrimary"]') })
    .first();
  if (!(await groupRow.isVisible({ timeout: 2_000 }).catch(() => false))) return;
  const buttons = groupRow.locator('td:last-child button');
  const n = await buttons.count();
  for (let i = 0; i < n; i++) {
    const b = buttons.nth(i);
    const txt = ((await b.innerText().catch(() => '')) ?? '').trim();
    if (labelRegex.test(txt) && (await b.isEnabled().catch(() => false))) {
      await b.click().catch(() => {});
      await sleep(SHORT_PAUSE);
      return;
    }
  }
  // Fallback: click by positional index.
  const fb = buttons.nth(fallbackIndex);
  if (await fb.isEnabled().catch(() => false)) {
    await fb.click().catch(() => {});
  }
}

/**
 * Click ALL detail-row action buttons inside the first expanded group on the
 * current worklist table. Used by the ancillary send-out worklist where there
 * is no group-level bulk button and each material must be advanced row by row.
 */
async function clickAllDetailRowActions(page: Page): Promise<void> {
  // Detail rows are the rows that follow the group row but have no
  // colorPrimary chip — they each contain a Block chip and an action button.
  const allRows = page.locator('table tbody tr');
  const total = await allRows.count();
  for (let i = 0; i < total; i++) {
    const row = allRows.nth(i);
    const hasGroupChip = await row.locator('.MuiChip-root[class*="colorPrimary"]').count();
    if (hasGroupChip > 0) continue; // skip group rows
    if (!(await row.isVisible().catch(() => false))) continue;
    const btn = row.locator('td:last-child button').first();
    if (await btn.isEnabled().catch(() => false)) {
      await btn.click().catch(() => {});
      await sleep(700);
    }
  }
  await sleep(SHORT_PAUSE);
}

async function loginAs(page: Page, user: string): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('employee-search-input').fill(user);
  await page.waitForSelector(`[data-testid="employee-option-${user}"]`, { timeout: 10_000 });
  await page.getByTestId(`employee-option-${user}`).click();
  // Different roles land on different pages (Pathologist→/, others→/order-entry).
  // Wait for navigation away from /login and a stable post-login indicator.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  // Logout button text is localized (Logout / Toka / Déconnexion / تسجيل الخروج / لاگ آؤٹ),
  // so we don't assert on its name. Confirm via the language-agnostic AppShell language switcher.
  await page.locator('button[value="en"]').first().waitFor({ state: 'visible', timeout: 10_000 });
}

async function setUiLanguage(page: Page, lang: Lang): Promise<void> {
  // The language switcher is a ToggleButtonGroup of <ToggleButton value="xx">EN</ToggleButton>.
  // Clicking by `value` attribute is locale-independent.
  const btn = page.locator(`button[value="${lang}"]`).first();
  await btn.waitFor({ state: 'visible', timeout: 5_000 });
  await btn.click();
  // Confirm direction flip for RTL langs.
  if (lang === 'ar' || lang === 'ur') {
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 5_000 });
  }
}

/**
 * Resolve the visible click target for an MUI Select that exposes its testid
 * via `inputProps={{ 'data-testid': ... }}`. The testid lands on the hidden
 * native `<input>` — clicking it does nothing because the element is not
 * visible. The clickable wrapper is the sibling `[role="combobox"]` div.
 */
function muiSelectTrigger(page: Page, testId: string): Locator {
  return page
    .locator(`input[data-testid="${testId}"]`)
    .locator('xpath=preceding-sibling::div[@role="combobox"]');
}

/** Read the order id from the success alert after creating an order. */
async function readCreatedOrderId(page: Page): Promise<string | null> {
  const alert = page.getByTestId('order-success-alert');
  await alert.waitFor({ state: 'visible', timeout: 20_000 });
  const text = (await alert.innerText()) ?? '';
  // formatOrderIdDisplay renders e.g. "SU-26-5" (prefix-year-seq, seq unpadded).
  const m = text.match(/([A-Z]{2})-(\d{2})-(\d+)/);
  if (!m) return null;
  const [, prefix, year, seq] = m;
  // Canonical form expected by URLs and testids: SU{YY}{7-digit-seq}
  return `${prefix}${year}${seq.padStart(7, '0')}`;
}

// ─── Scenario steps ────────────────────────────────────────────────────────

async function stepCreateOrder(page: Page): Promise<string | null> {
  await page.goto('/order-entry');
  await expect(page.getByTestId('page-title')).toBeVisible();

  // The MUI Select for Site is the first one inside the specimen card; we use
  // visible MenuItem text "Colon" because the Site dropdown is populated from
  // BODY_SITE_HIERARCHY (English keys) and the displayed text is localised but
  // the underlying value attribute equals the English key.
  await step('Pick patient', async () => {
    // Patient autocomplete is an MUI Autocomplete with an input (combobox role).
    const patientInput = page.getByRole('combobox').first();
    await patientInput.click();
    await patientInput.fill('a');
    // Wait for dropdown options.
    await page.waitForTimeout(800);
    const opt = page.locator('ul[role="listbox"] li[role="option"]').first();
    await opt.click({ timeout: 5_000 });
  });

  await step('Pick clinician', async () => {
    const inputs = page.getByRole('combobox');
    const doctorInput = inputs.nth(1);
    await doctorInput.click();
    await doctorInput.fill('a');
    await page.waitForTimeout(800);
    await page.locator('ul[role="listbox"] li[role="option"]').first().click({ timeout: 5_000 });
  });

  // Specimen A & B: Site=Gastrointestinal (GI), Organ=Colon, Type=Resection.
  //
  // Within the form, the elements that match `[role=combobox][aria-haspopup=listbox]`
  // are MUI Selects (NOT Autocompletes — those don't have aria-haspopup=listbox).
  // DOM order: [0]=case type, [1+]=specimen Site/Organ/Type triples.
  // Each surgical specimen contributes exactly 3 selects (Site, Organ, Type).
  for (let i = 0; i < 2; i++) {
    if (i > 0) {
      await step(`Add specimen ${String.fromCharCode(65 + i)}`, async () => {
        await page.getByTestId('add-specimen-btn').click();
        await sleep(400);
      });
    }

    const baseIdx = 1 + i * 3;

    await step(`Specimen ${String.fromCharCode(65 + i)}: Site=Gastrointestinal`, async () => {
      const site = page.locator('[role="combobox"][aria-haspopup="listbox"]').nth(baseIdx);
      await site.click();
      // Every language keeps the literal "(GI)" suffix in the localized site name.
      await page.locator('ul[role="listbox"] li[role="option"]', { hasText: /\(GI\)/ }).first().click({ timeout: 5_000 });
    });

    await step(`Specimen ${String.fromCharCode(65 + i)}: Organ=Colon`, async () => {
      const organ = page.locator('[role="combobox"][aria-haspopup="listbox"]').nth(baseIdx + 1);
      await organ.click();
      // Localized organ_colon falls back to English "Colon" in fr/ar/ur and
      // contains "Colon" in en/sw, so a substring match is universal.
      await page.locator('ul[role="listbox"] li[role="option"]', { hasText: /Colon/i }).first().click({ timeout: 5_000 });
    });

    await step(`Specimen ${String.fromCharCode(65 + i)}: Type=Resection`, async () => {
      const type = page.locator('[role="combobox"][aria-haspopup="listbox"]').nth(baseIdx + 2);
      await type.click();
      // en/sw: "Resection"  fr: "Résection"  ar: "قطع جراحي"  ur: "ریسیکشن".
      await page.locator('ul[role="listbox"] li[role="option"]', {
        hasText: /Resection|Résection|قطع|ریسیک/i,
      }).first().click({ timeout: 5_000 });
    });

    await step(`Specimen ${String.fromCharCode(65 + i)}: Cold ischemic time`, async () => {
      // The form has exactly one number input per surgical specimen card. Pick by index.
      const numbers = page.locator('input[type="number"]');
      await numbers.nth(i).fill('15');
    });
  }

  let orderId: string | null = null;
  await step('Submit order', async () => {
    await page.getByTestId('submit-order-btn').click();
    orderId = await readCreatedOrderId(page);
    // eslint-disable-next-line no-console
    console.log(`    ✓ created order ${orderId}`);
  });
  return orderId;
}

async function stepProcessing(page: Page, orderId: string, lang: Lang = 'en'): Promise<void> {
  await step('Open processing worklist', async () => {
    await page.goto('/processing');
    await expect(page.getByTestId('processing-queue-table')).toBeVisible();
  });

  await step('Open the case from worklist', async () => {
    // Toggle "Show all" so a fresh order assigned to no one shows up.
    await clickIfVisible(page.getByTestId('show-all-toggle'));
    await sleep(300);
    const row = page.locator(`[data-testid="queue-row-${orderId}"]`);
    if (await row.first().isVisible({ timeout: 2_000 }).catch(() => false)) {
      await row.first().click();
    } else {
      await page.goto(`/processing/${orderId}`);
    }
    await expect(page.getByTestId('order-id-heading')).toBeVisible({ timeout: 15_000 });
  });

  await step('Enter clinical history', async () => {
    // No testid; use the textarea inside the clinical-history card. It's the
    // first multiline TextField on the page.
    const textarea = page.locator('textarea').first();
    await textarea.click();
    await textarea.fill(CLINICAL_HISTORY[lang] ?? CLINICAL_HISTORY.en);
  });

  await step('Create blocks for specimen A (3 blocks)', async () => {
    // The BlockCount input is rendered next to the "Create Blocks" button.
    const createBtn = page.getByTestId('create-blocks-A');
    await createBtn.scrollIntoViewIfNeeded();
    // The number input immediately preceding the button.
    const countInput = createBtn.locator('xpath=preceding::input[@type="number"][1]');
    await countInput.fill('3');
    await createBtn.click();
    await sleep(800);
  });

  await step('Create blocks for specimen B (2 blocks)', async () => {
    const createBtn = page.getByTestId('create-blocks-B');
    if (await createBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      const countInput = createBtn.locator('xpath=preceding::input[@type="number"][1]');
      await countInput.fill('2');
      await createBtn.click();
      await sleep(800);
    }
  });

  await step('Scroll through created specimens / blocks for review', async () => {
    await smoothScroll(page, 400, 6);
    await sleep(LONG_PAUSE);
    await smoothScroll(page, 400, 6);
    await sleep(LONG_PAUSE);
    await smoothScroll(page, -800, 8);
  });

  await step('Pick gross template: Colon and Rectum Resection for Tumor', async () => {
    const trigger = muiSelectTrigger(page, 'processing-gross-template-select');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const list = page.locator('ul[role="listbox"]');
    await list.waitFor({ state: 'visible', timeout: 5_000 });
    // The catalog title is fully localised per language (e.g. fr: "Résection
    // du côlon et du rectum"). Try a multilingual regex first, then fall back
    // to the first non-empty option so the demo keeps moving.
    const colonRectumPattern =
      /Colon.*Rectum|Résection.*côlon|côlon.*rectum|القولون.*المستقيم|بری.*آنت|Utumbo.*mpana/i;
    const opt = list.locator('li[role="option"]', { hasText: colonRectumPattern }).first();
    if (await opt.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await opt.click();
    } else {
      // Fallback: first option whose value attribute is non-empty.
      const options = list.locator('li[role="option"]');
      const n = await options.count();
      for (let i = 0; i < n; i++) {
        const o = options.nth(i);
        const val = await o.getAttribute('data-value');
        if (val) {
          await o.click();
          break;
        }
      }
    }
    await sleep(800);
  });

  await step('Fill all gross template fields', async () => {
    // The StructuredTemplateEditor sits inside the gross card. Scope the
    // filler to the gross card by anchoring to the gross template select.
    const grossCard = page
      .locator('input[data-testid="processing-gross-template-select"]')
      .locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]');
    if ((await grossCard.count()) > 0) {
      await grossCard.first().scrollIntoViewIfNeeded();
      await fillAllTemplateFields(page, grossCard.first());
    }
    await sleep(SHORT_PAUSE);
  });

  await step('Save case', async () => {
    await page.getByTestId('save-case-btn').click();
    await sleep(1_500);
  });
}

async function advanceHistologyHE(page: Page, orderId: string): Promise<void> {
  await step('Open Histology worklist', async () => {
    await page.goto('/histology');
    await sleep(800);
  });

  // The HE worklist starts on the H&E tab (Tabs index 0). Status filter is a
  // MUI ToggleButtonGroup whose buttons carry value="MICROTOMY"|"SLIDE_STAIN"|"DISTRIBUTED",
  // which is locale-independent.
  await step('Switch to H&E tab', async () => {
    await page.locator('[role="tab"]').nth(0).click().catch(() => {});
    await sleep(SHORT_PAUSE);
  });

  // Filter the worklist to ONLY the order we just created. The HE worklist's
  // search box matches both the formatted display id (e.g. SU-26-200) and the
  // raw orderId substring, so typing the canonical id works.
  await step('Filter worklist to this case', async () => {
    await filterWorklistByOrder(page, orderId);
  });

  // Walk MICROTOMY → SLIDE_STAIN → DISTRIBUTED for our case only. We expand
  // the group row each time so per-block slide chips become visible while the
  // workflow advances.
  await step('Status filter: MICROTOMY', async () => {
    await page.locator('button[value="MICROTOMY"]').first().click().catch(() => {});
    await sleep(SHORT_PAUSE);
  });

  await step('Expand the order group to reveal blocks & slides', async () => {
    await expandFirstGroupRow(page);
    await smoothScroll(page, 200, 4);
  });

  await step('Add 1 slide to all blocks (group action)', async () => {
    await clickGroupAction(page, /^Add Slides|Add slides|Ongeza|Ajouter|إضافة|سلائیڈز/i, 0);
    await sleep(LONG_PAUSE);
  });

  await step('Advance all blocks: MICROTOMY → SLIDE_STAIN', async () => {
    await clickGroupAction(page, /Slide Stain|Stain|Painia|Coloration|تلوين|سٹین/i, 1);
    await sleep(LONG_PAUSE);
  });

  await step('Status filter: SLIDE_STAIN', async () => {
    await page.locator('button[value="SLIDE_STAIN"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
  });

  await step('Re-expand the order group at SLIDE_STAIN', async () => {
    await expandFirstGroupRow(page);
  });

  await step('Advance all blocks: SLIDE_STAIN → DISTRIBUTED', async () => {
    await clickGroupAction(page, /Distributed|Sambaza|Distribu|توزيع|تقسیم/i, 0);
    await sleep(LONG_PAUSE);
  });

  await step('Status filter: DISTRIBUTED (verify)', async () => {
    await page.locator('button[value="DISTRIBUTED"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await sleep(LONG_PAUSE);
  });
}

async function openResultCase(page: Page, orderId: string): Promise<void> {
  await step('Open Result queue', async () => {
    await page.goto('/result');
    await sleep(800);
  });

  await step('Click our case row', async () => {
    const row = page.locator(`[data-testid="result-row-${orderId}"]`);
    if (await row.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await row.first().click();
    } else {
      await page.goto(`/result/${orderId}`);
    }
    await expect(page.getByTestId('result-order-id')).toBeVisible({ timeout: 10_000 });
  });
}

async function selectResultTab(page: Page, index: number): Promise<void> {
  // ResultCasePage Tabs in DOM order: 0=result-entry, 1=materials, 2=ancillary, 3=report-history.
  const tab = page.locator('[role="tab"]').nth(index);
  await tab.click();
  await sleep(600);
}

async function viewMaterialsTab(page: Page): Promise<void> {
  await step('Switch to Materials tab', async () => {
    await selectResultTab(page, 1);
  });
  await step('Scroll through materials', async () => {
    await page.mouse.wheel(0, 300);
    await sleep(800);
    await page.mouse.wheel(0, 300);
    await sleep(800);
    await page.mouse.wheel(0, -600);
  });
}

async function fillResultEntry(page: Page, lang: Lang = 'en'): Promise<void> {
  await step('Switch to Result Entry tab', async () => {
    await selectResultTab(page, 0);
  });

  await step('Enter diagnosis: Colon adenocarcinoma', async () => {
    const diag = page.getByTestId('diagnosis-input');
    await diag.scrollIntoViewIfNeeded();
    await diag.click();
    await diag.fill(
      DIAGNOSIS_TEXT[lang] ?? DIAGNOSIS_TEXT.en
    );
  });

  await step('Pick microscopic template: Colorectal Malignant Tumor resection', async () => {
    const trigger = muiSelectTrigger(page, 'reporting-template-select');
    await trigger.scrollIntoViewIfNeeded();
    await trigger.click();
    const list = page.locator('ul[role="listbox"]');
    await list.waitFor({ state: 'visible', timeout: 5_000 });
    const colorectalPattern =
      /Colorectal|colorectal|colorect[à-ÿ]?|القولون|بری.*آنت|Utumbo.*mpana/i;
    const opt = list.locator('li[role="option"]', { hasText: colorectalPattern }).first();
    if (await opt.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await opt.click();
    } else {
      const options = list.locator('li[role="option"]');
      const n = await options.count();
      for (let i = 0; i < n; i++) {
        const o = options.nth(i);
        const val = await o.getAttribute('data-value');
        if (val) {
          await o.click();
          break;
        }
      }
    }
    await sleep(800);
  });

  await step('Fill all microscopic template fields', async () => {
    const microCard = page
      .locator('input[data-testid="reporting-template-select"]')
      .locator('xpath=ancestor::*[contains(@class,"MuiPaper-root")][1]');
    if ((await microCard.count()) > 0) {
      await microCard.first().scrollIntoViewIfNeeded();
      await fillAllTemplateFields(page, microCard.first());
    }
    await sleep(SHORT_PAUSE);
  });

  await step('Save draft (persist data for PDF preview)', async () => {
    await clickAny(page, [page.getByTestId('save-draft-btn'), page.getByTestId('save-exit-btn')]);
    await sleep(1_500);
  });
}

async function orderAncillary(page: Page): Promise<void> {
  await step('Open Order Ancillary dialog from Materials tab', async () => {
    await selectResultTab(page, 1); // materials
    await sleep(SHORT_PAUSE);
    const trigger = page.locator('button:has(svg[data-testid="BiotechIcon"])').first();
    if (await trigger.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await trigger.click();
    } else {
      await page.locator('[role="tabpanel"] button, .MuiPaper-root button').first().click().catch(() => {});
    }
    // Wait for the order-ancillary drawer to mount.
    await page.locator('[data-testid="anc-drawer"]').waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {});
    await sleep(LONG_PAUSE);
  });

  await step('Activate first block chip', async () => {
    const chip = page.locator('[data-testid="anc-drawer"] [data-testid^="anc-block-chip-"]').first();
    await chip.waitFor({ state: 'visible', timeout: 5_000 });
    await chip.scrollIntoViewIfNeeded();
    // Plain `click()` was not triggering React's onClick on the MUI Chip on
    // some hardware — fall back to dispatching a synthetic click event the
    // way React's synthetic event system listens for it.
    await chip.click({ force: true });
    await sleep(SHORT_PAUSE);
    // Verify the chip became active; if not, retry with a programmatic click.
    const active = await chip.evaluate((el) => el.className.includes('colorPrimary'));
    if (!active) {
      await chip.evaluate((el) => (el as HTMLElement).click());
      await sleep(SHORT_PAUSE);
    }
  });

  await step('Switch to IHC tab inside dialog', async () => {
    await page.locator('[data-testid="anc-drawer"] [data-testid="anc-tab-IHC"]').first().click({ timeout: 4_000 });
    await sleep(SHORT_PAUSE);
  });

  await step('Search MMR and add panel', async () => {
    const search = page.locator('[data-testid="anc-drawer"] input[placeholder]').first();
    await search.fill('MMR');
    await sleep(700);
    const addBtn = page.locator('[data-testid="anc-drawer"] [data-testid^="anc-add-panel-"]').first();
    if (await addBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
      await addBtn.click();
    } else {
      // Fallback: click each MMR gene chip.
      for (const gene of ['MLH1', 'PMS2', 'MSH2', 'MSH6']) {
        await page.locator(`[data-testid="anc-drawer"] .MuiChip-root`, { hasText: new RegExp(`^${gene}$`) })
          .first()
          .click({ timeout: 1_500 }).catch(() => {});
      }
    }
    await sleep(SHORT_PAUSE);
    await search.fill('');
    await sleep(300);
  });

  await step('Switch to Molecular tab', async () => {
    await page.locator('[data-testid="anc-drawer"] [data-testid="anc-tab-MOLECULAR"]').first().click({ timeout: 4_000 });
    await sleep(SHORT_PAUSE);
  });

  await step('Search BRAF and check it', async () => {
    const search = page.locator('[data-testid="anc-drawer"] input[placeholder]').first();
    await search.fill('BRAF');
    await sleep(700);
    const tests = page.locator('[data-testid="anc-drawer"] [data-testid^="anc-test-"]');
    const n = await tests.count();
    for (let i = 0; i < n; i++) {
      const t = tests.nth(i);
      const label = (await t.innerText().catch(() => '')) ?? '';
      if (/braf/i.test(label)) {
        await t.click({ timeout: 3_000 }).catch(() => {});
        break;
      }
    }
    await sleep(SHORT_PAUSE);
    await search.fill('');
    await sleep(300);
  });

  await step('Submit ancillary order', async () => {
    const submit = page.locator('[data-testid="anc-submit-btn"]');
    await submit.waitFor({ state: 'visible', timeout: 5_000 });
    for (let i = 0; i < 10; i++) {
      if (await submit.isEnabled().catch(() => false)) break;
      await sleep(300);
    }
    await submit.click({ timeout: 4_000 });
    await sleep(LONG_PAUSE);
    const drawer = page.locator('[data-testid="anc-drawer"]');
    if (await drawer.isVisible({ timeout: 500 }).catch(() => false)) {
      await page.keyboard.press('Escape').catch(() => {});
      await sleep(SHORT_PAUSE);
    }
  });
}

async function addPendingComment(page: Page, text: string): Promise<void> {
  await step(`Update comment: "${text.slice(0, 40)}…"`, async () => {
    await selectResultTab(page, 0); // result entry
    // Comment is the second visible <textarea> on the result-entry tab (1st = diagnosis).
    // We exclude hidden mirror textareas MUI uses for autoresize (those have aria-hidden).
    const textareas = page.locator('textarea:not([aria-hidden])');
    const count = await textareas.count();
    if (count >= 2) {
      const commentArea = textareas.nth(1);
      await commentArea.scrollIntoViewIfNeeded();
      await commentArea.click();
      await commentArea.fill(text);
    } else {
      // eslint-disable-next-line no-console
      console.warn(`    ⓘ only ${count} visible textareas on result-entry tab; comment skipped`);
    }
    await sleep(400);
    await clickAny(page, [page.getByTestId('save-draft-btn')]);
    await sleep(1_000);
  });
}

async function previewAndSignPrelim(page: Page): Promise<void> {
  await step('Preview report PDF', async () => {
    await clickAny(page, [page.getByTestId('preview-report-pdf-btn')]);
    // The init script intercepts window.open(blob:) and shows an HTML report
    // overlay populated from API data so the preview is captured in the video.
    await sleep(LONG_PAUSE);
    await page.evaluate(() => (window as unknown as { __waitDemoPdf?: () => Promise<void> }).__waitDemoPdf?.()).catch(() => {});
    // Hold the preview long enough for a viewer to read the report sections.
    await sleep(7_000);
    await page.evaluate(() => (window as unknown as { __closeDemoPdf?: () => void }).__closeDemoPdf?.()).catch(() => {});
    await sleep(SHORT_PAUSE);
  });

  await step('Sign preliminary', async () => {
    await clickAny(page, [page.getByTestId('sign-prelim-btn')]);
    await sleep(800);
    // confirmation dialog
    await clickAny(page, [
      page.getByRole('button', { name: /^(Sign|Confirm|Confirmer|توقيع|ٹھیک)/i }),
      page.locator('[role="dialog"] button').last(),
    ]);
    await sleep(1_500);
  });
}

/**
 * Generic worklist advancer: switch the status filter to `value`, expand any
 * collapsed group rows, then click each enabled action button on the action
 * column (last cell) of every visible row. This works for both the H&E
 * worklist and the IHC / Molecular ancillary tables, which all use a MUI
 * ToggleButtonGroup whose buttons carry the locale-independent `value=` attr.
 */
async function advanceWorklistPhase(
  page: Page,
  filterValue: string,
  opts: { addSlidesFirst?: boolean } = {},
): Promise<void> {
  // Switch the filter.
  const filterBtn = page.locator(`button[value="${filterValue}"]`).first();
  if (await filterBtn.isVisible({ timeout: 2_000 }).catch(() => false)) {
    await filterBtn.click().catch(() => {});
    await sleep(LONG_PAUSE);
  }

  // Expand any collapsed groups so per-block status chips/actions are visible.
  const collapsedToggles = page.locator('table tbody tr svg[data-testid="KeyboardArrowRightIcon"]');
  const cN = await collapsedToggles.count();
  for (let i = 0; i < Math.min(cN, 6); i++) {
    await collapsedToggles.nth(i).click().catch(() => {});
    await sleep(250);
  }

  if (opts.addSlidesFirst) {
    // First button on each group row is "Add Slides to All" when MICROTOMY.
    const groupRows = page.locator('table tbody tr').filter({ has: page.locator('.MuiChip-root[class*="colorPrimary"]') });
    const gN = await groupRows.count();
    for (let i = 0; i < Math.min(gN, 6); i++) {
      const btn = groupRows.nth(i).locator('td:last-child button').first();
      if (await btn.isEnabled().catch(() => false)) {
        await btn.click().catch(() => {});
        await sleep(700);
      }
    }
  }

  // Click the "advance" action on each group row. For MICROTOMY this is the
  // 2nd button (1st is Add Slides); for every other phase, the only enabled
  // group-action button advances the row.
  const groupRows = page.locator('table tbody tr').filter({ has: page.locator('.MuiChip-root[class*="colorPrimary"]') });
  const gN = await groupRows.count();
  for (let i = 0; i < Math.min(gN, 6); i++) {
    const row = groupRows.nth(i);
    const btns = row.locator('td:last-child button');
    const cnt = await btns.count();
    // Try each button in turn until one advances the row.
    for (let j = 0; j < cnt; j++) {
      const b = btns.nth(j);
      if (!(await b.isEnabled().catch(() => false))) continue;
      // Skip the first button on MICROTOMY rows (already-clicked Add Slides).
      if (opts.addSlidesFirst && j === 0) continue;
      await b.click().catch(() => {});
      await sleep(700);
      break;
    }
  }
  await sleep(LONG_PAUSE);
}

async function advanceMmrIhc(page: Page, orderId: string): Promise<void> {
  await step('Open Histology page → IHC tab', async () => {
    await page.goto('/histology');
    await sleep(LONG_PAUSE);
    // Tabs in order: HE (0), HE_LEVELS (1), IHC (2), SPECIAL_STAIN (3).
    await page.locator('[role="tab"]').nth(2).click().catch(() => {});
    await sleep(LONG_PAUSE);
  });

  await step('Filter IHC worklist to this case', async () => {
    await filterWorklistByOrder(page, orderId);
  });

  await step('IHC: PULL_BLOCK → MICROTOMY', async () => {
    await page.locator('button[value="PULL_BLOCK"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await clickGroupAction(page, /Microtomy|Mikrotomi|micro|قطع|مائیکروٹومی/i, 0);
    await sleep(LONG_PAUSE);
  });
  await step('IHC: MICROTOMY → SLIDE_STAIN (with slide cut)', async () => {
    await page.locator('button[value="MICROTOMY"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    // Add slides first, then advance.
    await clickGroupAction(page, /Add Slides|Ongeza|Ajouter|إضافة|سلائیڈز/i, 0);
    await sleep(LONG_PAUSE);
    await clickGroupAction(page, /Slide Stain|Stain|Painia|Coloration|تلوين|سٹین/i, 1);
    await sleep(LONG_PAUSE);
  });
  await step('IHC: SLIDE_STAIN → DISTRIBUTED', async () => {
    await page.locator('button[value="SLIDE_STAIN"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await clickGroupAction(page, /Distributed|Sambaza|Distribu|توزيع|تقسیم/i, 0);
    await sleep(LONG_PAUSE);
  });
  await step('IHC: switch to DISTRIBUTED filter (verify)', async () => {
    await page.locator('button[value="DISTRIBUTED"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await sleep(LONG_PAUSE);
  });
}

async function advanceBrafMolecular(page: Page, orderId: string): Promise<void> {
  await step('Open Molecular send-out worklist', async () => {
    await page.goto('/ancillary');
    await sleep(LONG_PAUSE);
    // Tabs: SEND_OUT (0), MOLECULAR (1).
    await page.locator('[role="tab"]').nth(1).click().catch(() => {});
    await sleep(LONG_PAUSE);
  });

  await step('Filter molecular worklist to this case', async () => {
    await filterWorklistByOrder(page, orderId);
  });

  // The send-out / molecular worklist has NO bulk-advance button on the group
  // row — each detail row's "Send Material" / "Mark Returned" button must be
  // clicked directly.
  await step('Molecular: send material (PULL_MATERIAL → MATERIAL_SENT)', async () => {
    await page.locator('button[value="PULL_MATERIAL"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await sleep(SHORT_PAUSE);
    await clickAllDetailRowActions(page);
    await sleep(LONG_PAUSE);
  });
  await step('Molecular: mark returned (MATERIAL_SENT → MATERIAL_RETURNED)', async () => {
    await page.locator('button[value="MATERIAL_SENT"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await sleep(SHORT_PAUSE);
    await clickAllDetailRowActions(page);
    await sleep(LONG_PAUSE);
  });
  await step('Molecular: switch to MATERIAL_RETURNED filter (verify)', async () => {
    await page.locator('button[value="MATERIAL_RETURNED"]').first().click().catch(() => {});
    await sleep(LONG_PAUSE);
    await expandFirstGroupRow(page);
    await sleep(LONG_PAUSE);
  });
}

async function viewAncillaryAndHistory(page: Page, orderId: string): Promise<void> {
  await step('Re-open result page', async () => {
    await page.goto(`/result/${orderId}`);
    await expect(page.getByTestId('result-order-id')).toBeVisible({ timeout: 10_000 });
  });
  await step('View Ancillary tab', async () => {
    await selectResultTab(page, 2);
    await sleep(2_000);
  });
  await step('View Report History tab', async () => {
    await selectResultTab(page, 3);
    await sleep(2_000);
  });
}

async function previewAndSignOut(page: Page): Promise<void> {
  await selectResultTab(page, 0);
  await step('Preview report PDF (final review)', async () => {
    await clickAny(page, [page.getByTestId('preview-report-pdf-btn')]);
    await sleep(LONG_PAUSE);
    await page.evaluate(() => (window as unknown as { __waitDemoPdf?: () => Promise<void> }).__waitDemoPdf?.()).catch(() => {});
    await sleep(8_000);
    await page.evaluate(() => (window as unknown as { __closeDemoPdf?: () => void }).__closeDemoPdf?.()).catch(() => {});
    await sleep(SHORT_PAUSE);
  });
  await step('Sign out report', async () => {
    await clickAny(page, [page.getByTestId('sign-out-btn')]);
    await sleep(800);
    await clickAny(page, [page.getByTestId('confirm-sign-out-btn')]);
    await sleep(2_000);
  });
}

// ─── The recorded scenario ─────────────────────────────────────────────────

async function recordLifecycle(context: BrowserContext, lang: Lang): Promise<void> {
  // Inject per-language preview labels first so the overlay init script picks
  // them up via window.__demoPreviewLabels.
  const previewLabels = PREVIEW_LABELS[lang] ?? PREVIEW_LABELS.en;
  const previewDir = (lang === 'ar' || lang === 'ur') ? 'rtl' : 'ltr';
  await context.addInitScript(({ labels, dir }) => {
    (window as unknown as { __demoPreviewLabels: unknown; __demoPreviewDir: string })
      .__demoPreviewLabels = labels;
    (window as unknown as { __demoPreviewLabels: unknown; __demoPreviewDir: string })
      .__demoPreviewDir = dir;
  }, { labels: previewLabels, dir: previewDir });
  // Inject the caption overlay + PDF preview interceptor on every page in
  // this context. The PDF interceptor builds a styled HTML "Anatomic Pathology
  // Report" card from live API data instead of opening the actual PDF
  // (headless Chromium does not render PDFs inside iframes, so the original
  // window.open(blob) overlay was blank).
  await context.addInitScript(`
    ${CAPTION_INIT_SCRIPT}
    (function () {
      function escapeHtml(s) {
        return String(s == null ? '' : s)
          .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
          .replace(/\\n/g, '<br>');
      }
      function formatOrderId(id) {
        // SU260000200 -> SU-26-200
        var m = String(id || '').match(/^([A-Z]{2})(\\d{2})(\\d+)$/);
        return m ? m[1] + '-' + m[2] + '-' + parseInt(m[3], 10) : id || '';
      }
      function readMicroFields() { return []; }
      function getOrderIdFromUrl() {
        var m = location.pathname.match(/\\/result\\/([A-Z]{2}\\d+)/);
        return m ? m[1] : '';
      }
      async function fetchOrder(orderId) {
        try {
          var r = await fetch('/api/orders/' + encodeURIComponent(orderId), { credentials: 'same-origin' });
          if (!r.ok) return null;
          var j = await r.json();
          return j.data || j;
        } catch (e) { return null; }
      }
      function readDiagnosis() {
        var ta = document.querySelector('[data-testid="diagnosis-input"]');
        if (!ta) return '';
        if (ta.tagName === 'TEXTAREA' || ta.tagName === 'INPUT') return ta.value || '';
        var inner = ta.querySelector('textarea, input');
        return inner ? inner.value || '' : (ta.textContent || '');
      }
      function readComment() {
        // The result-entry tab has two visible textareas; the 2nd is the comment.
        var ta = Array.prototype.slice.call(
          document.querySelectorAll('textarea:not([aria-hidden="true"])')
        ).filter(function (a) { return a.offsetParent !== null; });
        return ta.length >= 2 ? (ta[1].value || '') : '';
      }
      function fmtDate(iso) {
        if (!iso) return '';
        var d = new Date(iso);
        if (isNaN(d.getTime())) return iso;
        var yyyy = d.getFullYear();
        var mm = String(d.getMonth() + 1).padStart(2, '0');
        var dd = String(d.getDate()).padStart(2, '0');
        return yyyy + '-' + mm + '-' + dd;
      }
      async function showReportOverlay() {
        var orderId = getOrderIdFromUrl();
        var order = orderId ? await fetchOrder(orderId) : null;
        var diagnosis = readDiagnosis();
        var comment = readComment();
        // Localized section labels are injected by the test runner via
        // window.__demoPreviewLabels just before each language is recorded.
        var L = (window).__demoPreviewLabels || {
          reportTitle: 'Anatomic Pathology Report',
          draftPreview: 'Draft Preview',
          version: 'Version',
          patient: 'Patient', name: 'Name', patientId: 'Patient ID',
          dateOfBirth: 'Date of Birth', sex: 'Sex', clinician: 'Clinician',
          clinicalHistory: 'Clinical History', grossDescription: 'Gross Description',
          diagnosis: 'Diagnosis', comment: 'Comment',
          pathologistPreview: 'Pathologist (preview)',
          notSigned: '*** DRAFT PREVIEW \u2014 NOT A SIGNED REPORT ***'
        };
        var dir = (window).__demoPreviewDir || 'ltr';

        var existing = document.getElementById('__demo_pdf_overlay__');
        if (existing) existing.remove();
        var overlay = document.createElement('div');
        overlay.id = '__demo_pdf_overlay__';
        overlay.style.cssText =
          'position:fixed;inset:0;background:rgba(15,23,42,0.86);z-index:2147483646;' +
          'display:flex;align-items:flex-start;justify-content:center;padding:32px 32px 96px;';

        var card = document.createElement('div');
        // Mimic Letter page proportions and styling from pdf.layout.service.ts.
        card.style.cssText =
          'width:min(820px,94%);max-height:88vh;overflow:auto;background:#fff;color:#111;' +
          'border-radius:6px;box-shadow:0 14px 60px rgba(0,0,0,0.55);' +
          'font-family:Helvetica,Arial,sans-serif;font-size:11pt;line-height:1.45;' +
          'padding:50px;direction:' + dir + ';';

        var labelTopBadge = document.createElement('div');
        labelTopBadge.textContent = 'Report Preview';
        labelTopBadge.style.cssText =
          'position:absolute;top:18px;left:50%;transform:translateX(-50%);' +
          'color:#fff;font:600 16px system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
          'background:rgba(0,0,0,0.55);padding:6px 14px;border-radius:999px;';

        var patient = (order && order.patient) || {};
        var doctor = (order && order.doctor) || {};
        var clinicalHistory = (order && order.clinicalHistory) || '';
        var grossText = (order && order.gross) || '';
        var pathologistName = (order && order.pathologist && (
            ((order.pathologist.lastName || '') + (order.pathologist.firstName ? ', ' + order.pathologist.firstName : ''))
          )) || '';

        function fieldRow(label, value) {
          if (value == null || value === '') return '';
          return '<div style="display:flex;gap:8px;margin-' + (dir === 'rtl' ? 'right' : 'left') + ':10px;margin-bottom:2px">' +
            '<span style="font-weight:bold;white-space:nowrap">' + escapeHtml(label) + ':</span>' +
            '<span style="flex:1">' + escapeHtml(value) + '</span></div>';
        }
        function sectionLabel(text) {
          return '<div style="font-size:10pt;font-weight:bold;color:#333399;text-transform:uppercase;margin-top:14px;margin-bottom:4px">' +
            escapeHtml(text) + '</div>';
        }
        function bodyText(text) {
          return '<div style="margin-' + (dir === 'rtl' ? 'right' : 'left') + ':10px;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word">' +
            escapeHtml(text) + '</div>';
        }
        function diagnosisText(text) {
          return '<div style="margin-' + (dir === 'rtl' ? 'right' : 'left') + ':10px;font-weight:bold;white-space:pre-wrap;word-wrap:break-word;overflow-wrap:break-word">' +
            escapeHtml(text) + '</div>';
        }

        // Mirror DEFAULT_REPORT_HTML_TEMPLATE in pdf.layout.service.ts:
        //   header -> draft-preview type label -> case id -> version -> divider
        //   -> PATIENT (Name, Patient ID, Date of Birth, Sex, Clinician)
        //   -> DIAGNOSIS (bold) -> COMMENT (if present) -> GROSS (if present)
        //   -> signoff: "Pathologist (preview): <name>" + draft watermark
        var html =
          '<div style="font-size:14pt;font-weight:bold;color:#1a1a80;text-transform:uppercase">' + escapeHtml(L.reportTitle) + '</div>' +
          '<div style="font-size:12pt;font-weight:bold;margin-top:4px;color:#994d00">' + escapeHtml(L.draftPreview) + '</div>' +
          '<div style="font-size:20pt;font-weight:bold;margin-top:6px">' + escapeHtml(formatOrderId(orderId)) + '</div>' +
          '<p style="margin-top:4px;color:#444">' + escapeHtml(L.version) + ': 1</p>' +
          '<hr style="border:none;border-top:1.5px solid #111;margin:10px 0">' +
          sectionLabel(L.patient) +
          fieldRow(L.name, (patient.lastName || '') + (patient.firstName ? ', ' + patient.firstName : '')) +
          fieldRow(L.patientId, patient.patientId) +
          fieldRow(L.dateOfBirth, fmtDate(patient.dateOfBirth)) +
          fieldRow(L.sex, patient.sex) +
          fieldRow(L.clinician, (doctor.lastName || '') + (doctor.firstName ? ', ' + doctor.firstName : ''));

        html += sectionLabel(L.diagnosis) + diagnosisText(diagnosis || '');
        if (comment) {
          html += sectionLabel(L.comment) + bodyText(comment);
        }
        if (clinicalHistory) {
          html += sectionLabel(L.clinicalHistory) + bodyText(clinicalHistory);
        }
        if (grossText) {
          html += sectionLabel(L.grossDescription) + bodyText(grossText);
        }
        html +=
          '<div style="margin-top:20px;padding-top:10px;border-top:0.5px solid #777">';
        if (pathologistName) {
          html += '<div style="display:flex;gap:8px;margin-' + (dir === 'rtl' ? 'right' : 'left') + ':10px"><span style="font-weight:bold;white-space:nowrap">' +
            escapeHtml(L.pathologistPreview) + ':</span><span style="flex:1">' + escapeHtml(pathologistName) + '</span></div>';
        }
        html +=
          '<div style="margin-top:12px;text-align:center;font-size:10pt;color:#994d00;font-weight:bold">' +
            escapeHtml(L.notSigned) +
          '</div></div>';

        card.innerHTML = html;
        overlay.appendChild(card);
        overlay.appendChild(labelTopBadge);
        document.body.appendChild(overlay);
      }
      // Intercept blob: window.open calls (the PDF preview uses one) and
      // show our HTML overlay instead. Other window.open calls pass through.
      var origOpen = window.open;
      var pendingOverlay = null;
      window.open = function (url) {
        if (typeof url === 'string' && url.indexOf('blob:') === 0) {
          pendingOverlay = showReportOverlay();
          return { closed: false, close: function () {}, focus: function () {} };
        }
        return origOpen.apply(window, arguments);
      };
      window.__waitDemoPdf = function () {
        return Promise.resolve(pendingOverlay).then(function () { pendingOverlay = null; });
      };
      window.__closeDemoPdf = function () {
        var el = document.getElementById('__demo_pdf_overlay__');
        if (el) el.remove();
      };
    })();
  `);

  const page = await context.newPage();
  page.setDefaultTimeout(15_000);

  // 0. Login from home, switch language.
  await phase(page, 'login', lang, async () => {
    await step(`Login as ${DEMO_USER}`, async () => {
      await loginAs(page, DEMO_USER);
    });
  });
  await phase(page, 'switchLang', lang, async () => {
    await step(`Switch language to ${lang}`, async () => {
      await setUiLanguage(page, lang);
    });
  });

  // 1. Order Entry → create SU order.
  let orderId: string | null = null;
  await phase(page, 'orderEntry', lang, async () => {
    orderId = await stepCreateOrder(page);
  });
  if (!orderId) {
    // eslint-disable-next-line no-console
    console.warn(`  ⚠ could not capture order id for ${lang}; aborting downstream steps.`);
    await page.waitForTimeout(2_000);
    await page.close();
    return;
  }

  // 2-3. Processing.
  await phase(page, 'processing', lang, async () => {
    await stepProcessing(page, orderId!, lang);
  });

  // 4. Histology H&E (scoped to this case).
  await phase(page, 'histologyHE', lang, async () => {
    await advanceHistologyHE(page, orderId!);
  });

  // 5. Open result case + materials tab; 6. Result entry.
  await phase(page, 'resultEntry', lang, async () => {
    await openResultCase(page, orderId!);
    await viewMaterialsTab(page);
    await fillResultEntry(page, lang);
  });

  // 7. Order ancillary (IHC MMR + Molecular BRAF) + comment.
  await phase(page, 'ancillaryOrder', lang, async () => {
    await orderAncillary(page);
    await addPendingComment(
      page,
      COMMENT_PENDING[lang] ?? COMMENT_PENDING.en
    );
  });

  // 8. Preview PDF + sign prelim.
  await phase(page, 'signPrelim', lang, async () => {
    await previewAndSignPrelim(page);
  });

  // 9. Histology IHC worklist — advance MMR.
  await phase(page, 'histologyIHC', lang, async () => {
    await advanceMmrIhc(page, orderId!);
  });

  // 10. Molecular send-out — advance BRAF.
  await phase(page, 'molecularSendOut', lang, async () => {
    await advanceBrafMolecular(page, orderId!);
  });

  // 11. Re-open result page; view ancillary + report history.
  await phase(page, 'reviewAncillary', lang, async () => {
    await viewAncillaryAndHistory(page, orderId!);
    await addPendingComment(
      page,
      COMMENT_FINAL[lang] ?? COMMENT_FINAL.en
    );
  });

  // 12. Preview, sign out.
  await phase(page, 'signOut', lang, async () => {
    await previewAndSignOut(page);
  });

  await sleep(1_500);
  await page.close();
}

// ─── Test entry point ──────────────────────────────────────────────────────

test.beforeAll(async () => {
  await fs.mkdir(VIDEO_DIR, { recursive: true });
  await fs.mkdir(TMP_DIR, { recursive: true });
});

for (const lang of LANGS) {
  test(`demo lifecycle — ${lang}`, async ({ browser }, testInfo) => {
    test.skip(
      !RUN_DEMO,
      'Demo lifecycle recorder. Set RUN_DEMO=1 to record demo videos.',
    );
    testInfo.setTimeout(20 * 60_000); // 20 min budget per language

    const tmpDir = path.join(TMP_DIR, lang);
    await fs.mkdir(tmpDir, { recursive: true });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      recordVideo: { dir: tmpDir, size: VIEWPORT },
      // Each language run gets a clean storage state — fresh login.
      storageState: undefined,
    });

    let scenarioErr: Error | null = null;
    try {
      await recordLifecycle(context, lang);
    } catch (err) {
      scenarioErr = err as Error;
      // eslint-disable-next-line no-console
      console.error(`  ✗ ${lang} scenario aborted: ${(err as Error).message}`);
    }

    // Closing the context flushes the video file.
    await context.close();

    // Move the produced webm to demo-videos/<lang>.webm.
    //
    // Playwright creates one video file per Page. The scenario opens transient
    // tabs (e.g. PDF preview) which each get their own tiny video. We want the
    // largest one — that's the main page that drove the workflow.
    const target = path.join(VIDEO_DIR, `${lang}.webm`);
    try {
      const entries = await fs.readdir(tmpDir);
      const webms = entries.filter((f) => f.endsWith('.webm'));
      if (webms.length === 0) {
        // eslint-disable-next-line no-console
        console.warn(`  ⚠ no videos found in ${tmpDir} for ${lang}`);
      } else {
        const sized = await Promise.all(
          webms.map(async (f) => {
            const full = path.join(tmpDir, f);
            const s = await fs.stat(full);
            return { full, size: s.size };
          }),
        );
        sized.sort((a, b) => b.size - a.size);
        const main = sized[0].full;
        // Remove any pre-existing target — fs.rename on Windows fails on overwrite.
        await fs.rm(target, { force: true });
        await fs.copyFile(main, target);
        // eslint-disable-next-line no-console
        console.log(`  ✓ saved ${target} (${(sized[0].size / 1024 / 1024).toFixed(1)} MB)`);
      }
      // Clean up the tmp dir so leftover files from old runs don't shadow new ones.
      for (const f of entries) {
        await fs.rm(path.join(tmpDir, f), { force: true });
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(`  ✗ failed to move video for ${lang}: ${(e as Error).message}`);
    }

    if (scenarioErr) {
      // Don't fail the whole batch; log only.
      // The video still gets saved up to the failure point.
    }
  });
}
