# Claude Code Instructions: Generate Publication Figures with Playwright

## Objective

Create reproducible, publication-quality application figures for the Journal of Pathology Informatics manuscript using Playwright and the repository's deterministic synthetic dataset.

The figures must demonstrate that the prototype is implemented and functional. They must not contain real patient information, institutional credentials, local hostnames, developer browser chrome, debug overlays, or unpublished secrets.

---

## 1. Create a dedicated figure-generation workflow

Add a Playwright specification dedicated to manuscript figures, for example:

```text
apps/frontend/e2e/manuscript-figures.spec.ts
```

Add helper utilities under a clearly named path, such as:

```text
apps/frontend/e2e/helpers/manuscript-figures.ts
scripts/manuscript/compose-figures.ts
```

Add package scripts:

```json
{
  "scripts": {
    "figures:manuscript": "playwright test manuscript-figures.spec.ts",
    "figures:compose": "tsx scripts/manuscript/compose-figures.ts"
  }
}
```

The complete command should be documented as:

```bash
pnpm figures:manuscript
pnpm figures:compose
```

---

## 2. Use a deterministic synthetic environment

Before capture:

1. Start from a clean database.
2. Apply migrations.
3. Seed with the fixed LCG seed `42`.
4. Use only synthetic users, clinicians, patients, accessions, and report content.
5. Confirm that screenshots contain no data copied from a clinical system.
6. Fix dates and times or select stable seeded cases so the output is byte-stable where practical.
7. Disable network access to external services during capture unless explicitly required by the local stack.

Recommended workflow:

```bash
docker compose down -v
docker compose up -d postgres
pnpm prisma:migrate
pnpm prisma:seed
pnpm build
# start backend and production-built frontend
pnpm figures:manuscript
```

Adapt command names to the actual repository, but document the final working sequence.

---

## 3. Standardize browser and rendering settings

Use a fixed Chromium version managed by Playwright.

Recommended context:

```ts
const context = await browser.newContext({
  viewport: { width: 1800, height: 1200 },
  deviceScaleFactor: 2,
  locale: 'en-US',
  timezoneId: 'UTC',
  colorScheme: 'light',
  reducedMotion: 'reduce',
});
```

Requirements:

- capture in light mode unless the manuscript specifically needs dark mode;
- hide scrollbars where they obscure content;
- disable CSS transitions, animations, blinking cursors, and transient toasts;
- wait for fonts, queries, and layout stabilization;
- use a consistent window size for all panels;
- do not capture the browser toolbar or operating-system window frame;
- avoid full-page screenshots when they create unreadably tall figures;
- crop to the clinically relevant application region.

Inject a stabilization stylesheet before each capture:

```ts
await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation: none !important;
      transition: none !important;
      caret-color: transparent !important;
    }
    ::-webkit-scrollbar { width: 0 !important; height: 0 !important; }
  `,
});
```

Wait for:

```ts
await page.waitForLoadState('networkidle');
await page.evaluate(() => document.fonts.ready);
```

Use explicit locator waits instead of arbitrary timeouts.

---

## 4. Capture the recommended manuscript panels

Create individual high-resolution PNG panels first. Do not add panel letters inside Playwright screenshots; add them during composition so they are consistent.

### Figure 3: Implemented pathology workflow

Capture four panels:

- **Figure 3A - Dashboard / work-queue overview**
  - Show processing, histology, result, and ancillary queue counts.
  - Use a synthetic user and stable seeded counts.
  - Ensure no temporary error banner or developer control is visible.

- **Figure 3B - Structured accessioning**
  - Show the surgical pathology order-entry form with synthetic patient and specimen data.
  - Include body site, specimen type, clinical history, and cold ischemia time if available.
  - Do not show any autocomplete menu covering the form.

- **Figure 3C - Material hierarchy and histology state**
  - Open a seeded case with multiple specimens, blocks, and slides.
  - Show deterministic identifiers and H&E status transitions clearly.
  - Prefer a case whose material hierarchy fits without horizontal scrolling.

- **Figure 3D - Reporting and version governance**
  - Show the report editor or history view with draft/preliminary/final/amendment information.
  - Use synthetic diagnostic text.
  - If the interface cannot show content and version history legibly at once, capture two panels and revise the composite layout.

### Figure 4: Multilingual and patient-facing outputs

Capture three or four panels:

- **Figure 4A - English structured report view**
- **Figure 4B - Kiswahili interface or translated output**
- **Figure 4C - Arabic or Urdu right-to-left interface**
- **Figure 4D - Rule-based patient-facing summary**

For the experimental LLM translation panel:

- clearly label the output as experimental in the application if such a label exists;
- do not imply validation;
- use a source report containing synthetic text only;
- include the bilingual-verification warning if implemented;
- keep the source-language report authoritative.

### Optional supplementary figure

Capture a configuration page showing:

- report templates;
- ancillary orderables/panels; or
- active report-layout configuration.

Use this as a supplementary figure only if it adds information not visible in Figures 3-4.

---

## 5. Use stable locators and seeded records

Do not rely on fragile CSS class names or text that changes with localization.

Prefer:

```ts
page.getByRole(...)
page.getByLabel(...)
page.getByTestId(...)
```

Add manuscript-specific `data-testid` attributes only when existing accessible locators are insufficient. Keep those IDs semantically named and useful for normal testing.

Select cases by deterministic identifiers from the seeded corpus. Document each selected accession in a code comment and in a generated manifest.

Example manifest:

```json
{
  "figure3A": { "route": "/dashboard", "caseId": null },
  "figure3B": { "route": "/orders/new", "caseId": null },
  "figure3C": { "route": "/histology/SU260000123", "caseId": "SU260000123" },
  "figure3D": { "route": "/results/SU260000123", "caseId": "SU260000123" }
}
```

Generate the manifest automatically at:

```text
docs/manuscript/figures/figure-manifest.json
```

---

## 6. Screenshot implementation pattern

Use locator screenshots when possible:

```ts
await page.getByTestId('main-content').screenshot({
  path: 'docs/manuscript/figures/figure-3c-material-hierarchy.png',
  animations: 'disabled',
});
```

Before capture:

- close open menus and dialogs not part of the panel;
- remove transient snackbar messages;
- ensure loading indicators are absent;
- ensure table rows are not partially clipped;
- verify all text is rendered and legible;
- mask only synthetic values that are visually distracting, not data required to understand the workflow.

Do not use Playwright masking as a substitute for removing PHI. The test database itself must be synthetic.

---

## 7. Compose multi-panel figures reproducibly

Use a committed Node script with `sharp` or another repository-approved image library. Do not compose the final figure manually in PowerPoint or an image editor.

Recommended outputs:

```text
docs/manuscript/figures/figure-3-workflow.png
docs/manuscript/figures/figure-4-multilingual.png
```

Composition requirements:

- white background;
- consistent margins and gutters;
- panel labels `A`, `B`, `C`, `D` in a consistent sans-serif font;
- no decorative borders unless needed to distinguish white panels;
- no stretching or non-uniform scaling;
- preserve native screenshot aspect ratios;
- final width at least 3000 pixels for a two-column journal figure;
- text legible when rendered at approximately 170-180 mm page width;
- export lossless PNG and optionally TIFF if required by the journal;
- retain individual source panels.

Do not invent a DPI value without controlling physical dimensions. Store pixel dimensions and generate a TIFF with appropriate metadata only if the journal requires it.

---

## 8. Add automated visual checks

The figure test should fail if:

- the expected route returns an error;
- an error alert is visible;
- a loading spinner remains;
- the selected case is absent;
- required labels are missing;
- the page contains obvious placeholder strings such as `undefined`, `null`, or `NaN`;
- the right-to-left panel does not set `document.documentElement.dir` to `rtl`;
- the source-language or bilingual-verification warning is missing from the experimental translation panel, if that warning is an implemented requirement.

Example checks:

```ts
await expect(page.getByRole('alert')).toHaveCount(0);
await expect(page.locator('body')).not.toContainText(/undefined|null|NaN/);
await expect(page.getByTestId('main-content')).toBeVisible();
```

Store Playwright traces only on failure and ensure traces contain synthetic data only.

---

## 9. Generate figure captions and provenance automatically

Create:

```text
docs/manuscript/figures/captions.md
docs/manuscript/figures/provenance.md
```

For each figure, record:

- panel description;
- route;
- seeded accession or configuration record;
- language;
- capture commit SHA;
- Playwright and Chromium versions;
- viewport and device scale factor;
- capture date;
- command used;
- SHA-256 checksum of each output file.

Suggested Figure 3 caption:

> **Figure 3. Implemented pathology workflow in the prototype APLIS.** (A) Dashboard and work-queue overview. (B) Structured surgical pathology accessioning. (C) Hierarchical specimen, block, and slide tracking with histology workflow status. (D) Version-controlled pathology reporting and sign-out. All data are deterministic synthetic demonstration data.

Suggested Figure 4 caption:

> **Figure 4. Multilingual and patient-facing reporting framework.** (A) Structured report output in English. (B) Kiswahili interface or report output. (C) Right-to-left rendering in Arabic or Urdu. (D) Rule-based patient-facing summary linked to a structured diagnostic category. The experimental model-based translation feature is not clinically validated and requires bilingual verification.

---

## 10. CI artifact workflow

Add a manually triggered GitHub Actions workflow, for example:

```text
.github/workflows/manuscript-figures.yml
```

The workflow should:

1. start PostgreSQL;
2. migrate and seed the database;
3. build the production frontend/backend;
4. install the pinned Playwright browser;
5. run `pnpm figures:manuscript`;
6. run `pnpm figures:compose`;
7. generate the provenance manifest and checksums;
8. upload only the synthetic figure outputs as an artifact.

Do not run on every pull request unless the runtime is acceptable. A manual `workflow_dispatch` trigger is sufficient for manuscript releases.

---

## 11. Visual acceptance checklist

Inspect every final panel at 100% and at approximate journal display size.

- [ ] All content is synthetic.
- [ ] No browser chrome or developer tools are visible.
- [ ] No loading, error, or transient state is present.
- [ ] Text remains legible at journal width.
- [ ] Panel labels are consistent.
- [ ] Right-to-left layout is correct.
- [ ] Identifiers and workflow states are visible where relevant.
- [ ] Experimental translation is labeled and includes bilingual-verification language.
- [ ] Screenshots match the software release described in the manuscript.
- [ ] Figure captions make no clinical-effectiveness claims.
- [ ] Provenance and checksums were generated.

---

## 12. Deliverables from Claude Code

Return:

1. all new or modified test/script paths;
2. the deterministic seeded records used for each panel;
3. individual panel PNGs;
4. composed Figure 3 and Figure 4 PNGs;
5. `captions.md`;
6. `provenance.md`;
7. `figure-manifest.json`;
8. the exact command used to regenerate the figures;
9. the commit SHA used for capture; and
10. confirmation that the images contain no real patient data or secrets.
