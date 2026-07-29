# Claude Code Instructions: Update Manuscript Application Figures

## Objective

Regenerate the application screenshots and composite figures so they clearly demonstrate:

1. The end-to-end pathology workflow in the correct operational order.
2. Multilingual reporting, including a translated patient-facing summary.
3. Meaningful administrative configurability rather than empty configuration screens.

Use Playwright to generate every source screenshot reproducibly from synthetic data. Do not use clinical or patient-identifiable information.

---

## General requirements

### Synthetic data and consistency

- Use only deterministic synthetic/demo data.
- Prefer one synthetic case throughout all panels of a figure so the reader can follow the same case across modules.
- Use a case that supports multiple specimens, multiple blocks and slides, at least one ancillary test linked to a block, a completed report, a revision or addendum, a patient-facing summary, and display in English, Kiswahili, and Arabic.
- Ensure names, dates, identifiers, diagnoses, and clinical details are internally consistent and clinically plausible.
- Do not expose real hostnames, usernames, tokens, database information, or file paths.

### Capture settings

- Use a fixed Playwright viewport for all source screenshots, preferably `1920 x 1080`.
- Use `deviceScaleFactor: 2` where practical.
- Disable animations and transitions before capture.
- Wait for network idle, relevant API responses, fonts, and expanded controls to stabilize.
- Capture the smallest meaningful page region rather than the entire browser window.
- Remove unnecessary browser chrome and excessive whitespace.
- Keep navigation only where it helps orient the reader.
- Save lossless PNG source images.

### Typography and panel labels

- Add panel labels `A`, `B`, `C`, etc. outside each screenshot at the upper-left corner.
- Use the same font, weight, and label size across all figures.
- Keep labels away from interface controls and text.
- Ensure interface text remains legible at journal display size.
- Balance panel sizes so a queue screenshot does not dominate smaller workflow panels.

### Output structure

Use a reproducible directory structure such as:

```text
docs/manuscript/figures/
├── source/
│   ├── figure-3/
│   ├── figure-4/
│   └── figure-s1/
├── composites/
├── captions/
└── README.md
```

Recommended outputs:

```text
docs/manuscript/figures/composites/figure-3-workflow.png
docs/manuscript/figures/composites/figure-4-multilingual.png
docs/manuscript/figures/composites/figure-s1-configuration.png
```

Document the exact command, commit hash, viewport, browser version, and synthetic case identifier used to regenerate each figure.

---

# Figure 3: End-to-End Pathology Workflow

## Problem with the current figure

The current composite begins with the processing queue and then moves backward to order entry. Readers will interpret panel order as workflow order, so the arrangement is confusing. It also omits the ancillary-testing workflow despite ancillary testing being a substantive feature of the manuscript.

## Required content

Regenerate Figure 3 using the same synthetic case across panels.

### Preferred six-panel structure

- **A. Order entry and specimen registration**
  - Show completed patient, clinician, case-type, and specimen fields.
  - Show at least two specimens if practical.
  - Capture immediately before case creation or immediately after creation with the accession identifier visible.

- **B. Processing queue and gross examination**
  - Show the new case in the processing queue.
  - Make the target case easy to locate.
  - Prefer the processing-case/gross-examination screen rather than only a generic queue if space permits.
  - Include evidence of structured grossing or processing state.

- **C. Histology material tracking**
  - Show specimens, blocks, and slides for the same case.
  - Include multiple blocks or slides.
  - Show a meaningful H&E workflow status.
  - Keep deterministic specimen/block/slide identifiers legible.

- **D. Ancillary testing**
  - Show an ancillary test ordered against a specific originating block or material.
  - Include the test name, linked block, and workflow state.
  - Prefer a test that clearly demonstrates the slide pipeline, such as immunohistochemistry or a special stain.
  - If space permits, include both the order view and ancillary worklist status.

- **E. Result entry and sign-out**
  - Show structured result entry for the same case.
  - Include gross description, microscopic/structured fields, final diagnosis, and sign-out controls.
  - Demonstrate that reporting follows material readiness.

- **F. Report history and amendment/version control**
  - Show a final signed-out report and a subsequent revision or addendum draft.
  - Keep version, status, sign-out date, and report PDF link visible.
  - Demonstrate preservation of prior report versions.

### Workflow logic

Do not depict ancillary testing as an unrelated final step after sign-out. Represent it as a branch from histology or diagnostic workup that returns to result entry/sign-out:

```text
Order Entry → Processing/Grossing → Histology → Result Entry/Sign-out
                                      ↘
                                  Ancillary Testing
                                      ↗
```

The final panel may then show report history/amendment after sign-out.

### Alternative five-panel structure

If six panels make the text too small:

- A. Order entry
- B. Processing/grossing
- C. Histology/material tracking
- D. Ancillary testing
- E. Result entry with a report-history inset

Do not omit ancillary testing merely to preserve the existing four-panel layout.

## Suggested Figure 3 caption

> **Figure 3. End-to-end pathology workflow implemented in the prototype.** (A) Structured order entry and specimen registration; (B) processing and gross-examination workflow; (C) specimen, block, and slide tracking within the histology module; (D) block-linked ancillary testing; (E) structured result entry and report authorization; and (F) report-version history demonstrating finalized and amended reports. The same synthetic case is shown throughout where feasible. All displayed names and data are synthetic.

---

# Figure 4: Multilingual Reporting and Patient-Facing Summaries

## Strengths of the current figure

The current composite demonstrates English reporting, Kiswahili reporting, Arabic right-to-left rendering, and a patient-facing summary.

## Required improvement

The patient-summary panel is displayed only in English. Add at least one translated patient-facing summary so the figure directly demonstrates multilingual patient communication.

## Preferred layout

### Five-panel option

- **A. English result-entry interface**
- **B. Kiswahili result-entry interface**
- **C. Arabic result-entry interface with right-to-left rendering**
- **D. English patient-facing summary**
- **E. Kiswahili patient-facing summary**

### Four-panel option

If a four-panel layout is needed:

- A. English result entry
- B. Kiswahili result entry
- C. Arabic RTL result entry
- D. Side-by-side English and Kiswahili patient summaries within one panel

## Content requirements

- Use the same synthetic case and diagnosis in all panels.
- Keep the same report tab and approximately the same scroll position in the English, Kiswahili, and Arabic screenshots.
- Ensure the Arabic screenshot clearly demonstrates right-to-left page direction, mirrored navigation where implemented, correctly aligned controls, and readable Arabic text.
- Show a clinically coherent patient summary.
- Display the translated summary through the actual application workflow rather than editing screenshot text in post-processing.
- Prefer Kiswahili as the translated patient-summary example because it most directly supports the manuscript’s regional-use case.
- If the displayed translation was produced by the experimental local LLM rather than curated resources:
  - show any existing experimental or bilingual-verification notice;
  - do not imply that the translation is clinically validated;
  - document the translation method in the figure README.
- If the patient summary uses curated deterministic language resources, state that clearly and distinguish it from free-text LLM translation.

## Suggested Figure 4 caption

> **Figure 4. Multilingual reporting and patient-facing communication.** The same synthetic case is displayed in (A) English, (B) Kiswahili, and (C) Arabic, demonstrating consistent workflow behavior across languages and right-to-left rendering for Arabic. (D–E) English and Kiswahili patient-facing summaries generated from the structured diagnostic category. Curated language resources are maintained separately from workflow logic. Experimental model-based translations require bilingual verification and have not undergone formal clinical validation.

Adjust the final sentence if the patient-summary translation shown is entirely curated and does not use the experimental model.

---

# Supplementary Figure S1: Configuration Interfaces

## Problems with the current figure

The current configuration composite shows an unselected template, collapsed ancillary categories, excessive empty space, and navigation rather than meaningful configurability.

## Panel A: Template manager

Select and display a representative structured template.

Preferred examples:

- a recognizable cytology reporting template; or
- a structured gross-examination template for a common resection specimen.

Show as many of the following as the interface supports:

- template name and category;
- structured sections or fields;
- field type or allowed choices;
- required/optional state;
- ordering of fields;
- translation resources or language tabs;
- active/inactive status;
- save, preview, or version controls.

Crop to the selected template and editor. Do not leave most of the panel blank.

## Panel B: Ancillary-testing configuration

Show meaningful expanded content.

Required actions:

- Expand the **IHC** category to display representative individual orderables.
- Open the **Panels** tab.
- Expand at least one representative diagnostic panel, such as mismatch repair, breast biomarkers, lymphoma, or gastrointestinal stromal tumor.
- Show the panel’s constituent tests.
- Include configuration metadata such as local/send-out designation, active status, material type, or workflow type if available.

The final panel may use two vertically stacked screenshots if one screenshot cannot show both individual tests and panel composition clearly.

## Data-quality check

The current screenshot appears to contain both `H&E Levels` and `H&E` categories. Confirm whether these are intentionally distinct. If they are duplicates or legacy configuration artifacts, correct the configuration before capture. Do not include unexplained duplication in the manuscript figure.

## Suggested Supplementary Figure S1 caption

> **Supplementary Figure S1. Configuration interfaces for structured reporting and ancillary testing.** (A) Template manager displaying a selected structured pathology template and its configurable reporting elements. (B) Ancillary-testing configuration displaying expanded individual orderables and a representative diagnostic panel with its constituent tests. These interfaces allow pathology content and ancillary catalogs to be modified without changing the underlying workflow code.

---

# Playwright Implementation Guidance

## Recommended test organization

Create dedicated opt-in figure specifications separate from verification tests, for example:

```text
apps/frontend/e2e/manuscript/
├── figure-3-workflow.spec.ts
├── figure-4-multilingual.spec.ts
└── figure-s1-configuration.spec.ts
```

Figure-generation specs should not inflate the automated verification test count.

Example environment gate:

```ts
test.skip(
  process.env.GENERATE_MANUSCRIPT_FIGURES !== "1",
  "Run only when generating manuscript figures"
);
```

Recommended command:

```bash
GENERATE_MANUSCRIPT_FIGURES=1 pnpm playwright test apps/frontend/e2e/manuscript
```

Provide a PowerShell equivalent in the repository README.

## Stable state preparation

Use API helpers or deterministic fixtures to prepare the figure case before opening the browser. Avoid long UI-only setup sequences when an API fixture can create the same reproducible state.

Suggested fixture flow:

1. Reset or seed the dedicated figure database.
2. Create or identify one synthetic case.
3. Populate specimens, blocks, and slides.
4. Set appropriate processing and histology states.
5. Place an ancillary order against a specific block.
6. Create structured result content.
7. Sign out a final report and generate a PDF.
8. Reactivate the case and create a revision/addendum draft.
9. Ensure patient-summary output is available.
10. Ensure all six language resources are loaded.

Record the synthetic accession used.

## Screenshot utility

Implement a helper that:

- applies the fixed viewport;
- disables animation;
- waits for fonts;
- hides transient notifications;
- removes cursor/focus artifacts unless important;
- captures a locator rather than the whole page;
- writes an adjacent metadata JSON file.

Suggested metadata:

```json
{
  "figure": "Figure 3",
  "panel": "A",
  "commit": "<git commit>",
  "caseId": "<synthetic accession>",
  "viewport": {"width": 1920, "height": 1080},
  "deviceScaleFactor": 2,
  "browser": "<Playwright Chromium version>",
  "route": "/order-entry",
  "generatedAt": "<ISO timestamp>"
}
```

## Composite generation

Use a committed script, for example:

```text
scripts/build-manuscript-figures.ts
```

Requirements:

- deterministic panel order;
- consistent margins and gutters;
- no arbitrary stretching;
- preserved screenshot aspect ratio;
- programmatic panel labels;
- white or transparent background;
- publication-ready resolution;
- PNG output and, if feasible, PDF or SVG output.

Do not assemble final figures manually unless every manual step is documented and reproducible.

---

# Visual Quality Checklist

- [ ] Figure 3 begins with order entry, not the processing queue.
- [ ] Figure 3 follows the workflow in a clinically logical sequence.
- [ ] Figure 3 includes ancillary testing linked to a block/material.
- [ ] Figure 3 shows result entry/sign-out and report history/versioning.
- [ ] The same synthetic case is used throughout each figure where feasible.
- [ ] Figure 4 includes a translated patient-facing summary.
- [ ] Arabic right-to-left rendering is clearly visible and correct.
- [ ] Any LLM-generated translation is labeled as experimental and requiring bilingual verification.
- [ ] Supplementary Figure S1 shows a selected template with editable content.
- [ ] Supplementary Figure S1 shows expanded ancillary tests and at least one expanded panel.
- [ ] No unexplained duplicate categories appear in the configuration screenshot.
- [ ] All names and data are synthetic.
- [ ] Interface text remains readable at expected journal display size.
- [ ] Empty space and irrelevant navigation are minimized.
- [ ] Every source screenshot and final composite is generated by a committed script.
- [ ] Figure captions distinguish implemented, experimental, and unvalidated features accurately.
- [ ] Source PNGs, composites, captions, metadata, and regeneration instructions are committed.

---

# Deliverables

Claude Code should return:

1. Updated Playwright figure-generation specifications.
2. Deterministic fixture/API helpers required for the figure case.
3. Publication-quality source screenshots for every panel.
4. Revised composite figures:
   - `figure-3-workflow.png`
   - `figure-4-multilingual.png`
   - `figure-s1-configuration.png`
5. A figure-generation README with exact reproduction commands.
6. Final proposed captions in Markdown.
7. A short summary of files changed, the synthetic case used, how each correction was addressed, and any remaining limitation.
