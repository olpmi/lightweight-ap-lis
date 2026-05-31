/**
 * i18n audit: traverses key pages of the application in each non-English
 * language and prints visible text that still contains English-looking
 * content. Use as a guide for finding hardcoded strings — false positives are
 * expected (proper nouns, English-derived medical jargon, codes, etc.).
 *
 * Run:
 *   cd apps/frontend
 *   $env:RUN_I18N_AUDIT=1; npx playwright test --config=playwright.config.ts \
 *     --project=chromium src/tests/e2e/i18n-audit.spec.ts --reporter=list
 *
 * Output: apps/frontend/i18n-audit.json
 */
import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPORT_PATH = path.resolve(__dirname, '../../../i18n-audit.json');

const RUN = !!process.env.RUN_I18N_AUDIT;

const LANGS = ['fr', 'sw', 'ar', 'ur'] as const;
type Lang = (typeof LANGS)[number];

const ROUTES = [
  '/',
  '/order-entry',
  '/processing',
  '/histology',
  '/ancillary',
  '/result',
  '/query',
];

// Words/phrases that, if present on a non-English page, almost certainly
// indicate an untranslated string. We use whole-word boundaries to avoid
// matching abbreviations or codes that happen to contain these letters.
const ENGLISH_MARKERS = [
  /\bSomething went wrong\b/,
  /\bConfirm Delete\b/,
  /\bPatient Summary\b/,
  /\bWhat This Means\b/,
  /\bPossible Next Steps\b/,
  /\bInactive\b/,
  /\bActive\b/,
  /\bShow all\b/i,
  /\bPage \d+\b/,
  /\bof \d+\b/,
  /\bNo (matching )?(cases|results) found\b/i,
  /\bLoading\.\.\./i,
  /\bSign out\b/i,
  /\bSign preliminary\b/i,
  /\bPreview PDF\b/i,
  /\bSave draft\b/i,
  /\bAdd Slides\b/i,
  /\bAll regional/i,
  /\bResection\b/,
  /\bBiopsy\b/,
  /\bCytology\b/,
];

// English stop-words used to decide whether a chunk of visible text is mostly
// English. Each match contributes one point; chunks with >= 2 unique matches
// are flagged.
const ENGLISH_STOPWORDS =
  /\b(the|and|or|of|in|with|to|for|from|on|by|please|please\.|must|cannot|not|are|was|were|been|being|click|select|search|results?|status|patient|order|case|case\.|name|please\b|page|next|previous)\b/gi;

function classifyLang(s: string): 'rtl' | 'cyrillic' | 'latin' | 'mixed' {
  if (/[\u0600-\u06FF]/.test(s)) return 'rtl';
  if (/[\u0400-\u04FF]/.test(s)) return 'cyrillic';
  return 'latin';
}

async function loginAndSwitch(page: Page, lang: Lang): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('employee-search-input').fill('asmith');
  await page.waitForSelector('[data-testid="employee-option-asmith"]', { timeout: 10_000 });
  await page.getByTestId('employee-option-asmith').click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
  const btn = page.locator(`button[value="${lang}"]`).first();
  await btn.waitFor({ state: 'visible', timeout: 10_000 });
  await btn.click();
  if (lang === 'ar' || lang === 'ur') {
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl', { timeout: 5_000 });
  }
}

interface Finding {
  lang: Lang;
  route: string;
  text: string;
  reason: string;
}

async function auditPage(page: Page, lang: Lang, route: string): Promise<Finding[]> {
  await page.goto(route).catch(() => {});
  await page.waitForTimeout(1500);

  // Toggle "Show all" if present so worklists populate.
  await page.locator('[data-testid="show-all-toggle"]').first().click({ timeout: 1000 }).catch(() => {});
  await page.waitForTimeout(800);

  // Pull every visible text node from the page (excluding script/style).
  const texts: string[] = await page.evaluate(() => {
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    let node: Node | null = walker.nextNode();
    while (node) {
      const t = (node.textContent ?? '').trim();
      if (t.length >= 4) {
        const parent = (node as Text).parentElement;
        if (parent) {
          const tag = parent.tagName;
          if (tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'NOSCRIPT') {
            const style = window.getComputedStyle(parent);
            if (style.visibility !== 'hidden' && style.display !== 'none') {
              out.push(t);
            }
          }
        }
      }
      node = walker.nextNode();
    }
    return out;
  });

  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const raw of texts) {
    const t = raw.trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    if (t.length > 200) continue; // very long blocks (templates) rarely useful
    // Marker-based hits.
    for (const m of ENGLISH_MARKERS) {
      if (m.test(t)) {
        findings.push({ lang, route, text: t, reason: `marker:${m.source}` });
        break;
      }
    }
    // Heuristic: on RTL languages, Latin text > 4 chars with 2+ stopwords is suspicious.
    if (lang === 'ar' || lang === 'ur') {
      if (classifyLang(t) === 'latin' && t.length >= 8) {
        const matches = t.match(ENGLISH_STOPWORDS);
        const unique = matches ? new Set(matches.map((s) => s.toLowerCase())).size : 0;
        if (unique >= 2) {
          findings.push({ lang, route, text: t, reason: `stopwords:${unique}` });
        }
      }
    }
    // For sw/fr, look for 3+ English stopwords (more conservative).
    if (lang === 'fr' || lang === 'sw') {
      const matches = t.match(ENGLISH_STOPWORDS);
      const unique = matches ? new Set(matches.map((s) => s.toLowerCase())).size : 0;
      if (unique >= 3 && /^[A-Za-z\s.,'"\-/&()0-9:%]+$/.test(t)) {
        findings.push({ lang, route, text: t, reason: `stopwords:${unique}` });
      }
    }
  }
  return findings;
}

test.describe.configure({ mode: 'serial' });

test('i18n audit', async ({ browser }) => {
  test.skip(!RUN, 'Set RUN_I18N_AUDIT=1 to run this audit.');
  test.setTimeout(15 * 60_000);
  const allFindings: Finding[] = [];
  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(10_000);
    try {
      await loginAndSwitch(page, lang);
      for (const route of ROUTES) {
        const found = await auditPage(page, lang, route);
        allFindings.push(...found);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`audit ${lang} aborted: ${(err as Error).message}`);
    }
    await ctx.close();
  }
  // Group by text for readability.
  const grouped: Record<string, { reason: string; routes: Record<Lang, string[]> }> = {};
  for (const f of allFindings) {
    if (!grouped[f.text]) grouped[f.text] = { reason: f.reason, routes: { fr: [], sw: [], ar: [], ur: [] } };
    if (!grouped[f.text].routes[f.lang].includes(f.route)) grouped[f.text].routes[f.lang].push(f.route);
  }
  await fs.writeFile(REPORT_PATH, JSON.stringify(grouped, null, 2), 'utf8');
  // eslint-disable-next-line no-console
  console.log(`\nFound ${Object.keys(grouped).length} suspicious strings; report saved to ${REPORT_PATH}\n`);
  for (const [text, info] of Object.entries(grouped).slice(0, 50)) {
    const langs = (Object.keys(info.routes) as Lang[]).filter((l) => info.routes[l].length).join(',');
    // eslint-disable-next-line no-console
    console.log(`  [${langs}] ${text.slice(0, 100)}  (${info.reason})`);
  }
});
