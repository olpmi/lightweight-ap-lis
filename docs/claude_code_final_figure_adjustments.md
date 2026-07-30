# Claude Code Instructions: Final Manuscript Figure Adjustments

## Objective

Apply the final corrections to the manuscript figure set so that all screenshots are internally consistent, clinically credible, fully localized where intended, and ready for integration into the manuscript.

The current figure organization is:

- Figure 3: Structured accessioning
- Figure 4: Processing and material tracking
- Figure 5: Ancillary testing and result entry
- Figure 6: Report versioning
- Figure 7: Multilingual interfaces
- Supplementary Figure S1: Patient-facing summaries
- Supplementary Figure S2: Template configuration
- Supplementary Figure S3: Ancillary-test configuration

The preferred final organization is to merge the report-history screenshot into Figure 5 as Panel C, then renumber the multilingual figure as Figure 6.

---

## 1. Reconcile Cytology Material Counts Across Figures 3 and 4

### Current inconsistency

The screenshots currently describe different specimen preparations for the same synthetic case:

- Figure 3B shows:
  - 2 smears
  - 0 ThinPrep preparations
  - 0 cell blocks
- Figure 4A states:
  - one cell block and two smears were prepared
- Figure 4B shows:
  - two blocks
  - three H&E slides

These values must be reconciled before publication.

### Required correction

Use one clinically and structurally coherent cytology preparation across every screenshot of case `CN-26-111`.

A recommended example is:

- Smears: 2
- ThinPrep: 0
- Cell blocks: 1
- Processing description:
  - “Received 250 mL of turbid straw-colored pleural fluid. Centrifuged; one cell block and two smears prepared.”

The material hierarchy should then represent the preparation according to the application’s actual data model:

- one cell block with its associated H&E slide;
- two direct smear slides represented as direct cytology slides if supported;
- do not create two tissue blocks merely to account for two direct smears.

### Implementation rule

Do not alter screenshot text in post-processing to create consistency. Update the deterministic synthetic fixture and recapture every affected panel through the application.

### Verification

Before export, confirm that all of the following agree:

- accessioning preparation counts;
- processing/gross description;
- number of blocks;
- number of slides;
- slide labels and types;
- material summary;
- ancillary-test source block.

---

## 2. Improve Synthetic Names Without Using Real Data

### Current issue

Names such as `Last, First` and `Clinician, Referring` clearly avoid real identifiers but look like unresolved placeholders.

### Required correction

Use realistic but explicitly synthetic names consistently across all screenshots.

Recommended examples:

- Patient: Grace Achieng
- Clinician: Joseph Mwangi
- Pathologist: Alice Smith

Use the same patient, clinician, date of birth, accession, and registration date in all panels showing the same case.

### Metadata

Document in the figure-generation README that all displayed names and identifiers are deterministic synthetic data.

---

## 3. Figure 3: Structured Accessioning

### Required content

Figure 3 should continue to show:

- Panel A: patient and referring-clinician entry
- Panel B: case type, specimen site, organ, and cytology preparation details

### Optional improvement

Include the `Create Case` button if it can be shown without reducing text legibility.

### Final caption

> **Figure 3. Structured cytology accessioning.** (A) Entry of synthetic patient and referring-clinician information. (B) Selection of case type, specimen site, organ, and cytology preparation details. All displayed names and data are synthetic.

---

## 4. Figure 4: Processing and Material Tracking

### Required corrections

- Update the processing description and material hierarchy so they match the final preparation counts from Section 1.
- Retain the clarified labels:
  - `Blocks to add`
  - `Slides to add`
- Ensure the visible block and slide identifiers represent the true underlying material relationships.
- Avoid showing a direct cytology slide as block-derived unless that is how the application actually models it.

### Final caption

> **Figure 4. Processing documentation and diagnostic-material tracking.** (A) Clinical history, gross-processing documentation, and generated material identifiers for the synthetic cytology case. (B) Deterministic block and slide identifiers maintained within the material hierarchy. All displayed data are synthetic.

---

## 5. Figure 5: Ancillary Testing, Reporting, and Versioning

### Preferred restructuring

Merge the current report-history screenshot into Figure 5 as Panel C.

The final layout should be:

- Panel A: block-linked ancillary testing
- Panel B: structured result entry and report authorization
- Panel C: report history showing the original final report and a subsequent revision draft

This will eliminate the need for a separate sparse Figure 6 and reduce the total number of main figures.

### Clinical credibility correction

The current ancillary display shows only ER, while the diagnostic comment states that immunohistochemistry supports metastatic adenocarcinoma of breast origin.

ER alone is not sufficiently specific to establish breast origin.

Use one of these approaches:

#### Preferred

Display a clinically plausible breast-oriented panel, for example:

- ER
- GATA3
- TRPS1 or mammaglobin/GCDFP-15, depending on what is available in the test catalog

Then use a cautious comment such as:

> “The immunohistochemical findings, interpreted with the clinical history, support metastatic breast carcinoma.”

#### Acceptable alternative

If only ER is shown, remove the claim that immunohistochemistry establishes breast origin and use a narrower statement consistent with the displayed result.

### Workflow consistency

- The ancillary order must remain linked to the same source block shown in Figure 4.
- The ancillary state shown should be consistent with the diagnostic result-entry timing.
- The final report timestamp and the report-history timestamp should match.
- Version 1 must remain finalized and available as a PDF.
- Version 2 must remain a separate unsigned revision draft.

### Final caption

> **Figure 5. Ancillary testing, diagnostic reporting, and report-version governance.** (A) An immunohistochemical study linked to its originating tissue block and tracked through an explicit workflow state. (B) Structured result entry and report-authorization controls for the same synthetic case. (C) Report history preserving the original finalized report and PDF while representing a subsequent revision as a separate draft version. All displayed names and data are synthetic.

---

## 6. Renumber the Multilingual Figure

If report history is merged into Figure 5:

- Renumber the current Figure 7 as Figure 6.
- Update filenames, captions, manuscript references, and figure-generation metadata accordingly.

Recommended filename:

```text
figure-6-multilingual-interface.png
```

---

## 7. Multilingual Interface Figure

### Current issue

The current Arabic and Kiswahili panels primarily demonstrate navigation, metadata, and buttons. Too little translated diagnostic content is visible.

### Required correction

Shift the crop downward, reduce the case-header height, or otherwise reframe each panel so that it includes:

- the translated final-diagnosis heading;
- at least part of the translated diagnosis;
- the translated comment heading or structured-template content.

### Arabic panel

Confirm that the final screenshot correctly demonstrates:

- right-to-left page flow;
- expected alignment of labels and controls;
- appropriate ordering of mixed Arabic and Latin-script content;
- stable accession and version identifiers;
- no bidirectional-text rendering defects.

The keyboard-layout information banner may be removed from the manuscript screenshot unless keyboard behavior is specifically discussed in the manuscript.

### Kiswahili panel

Confirm that:

- `MUHTASARI WA MGONJWA` is fully visible;
- diagnostic headings and content are shown;
- no important tab or button text is truncated.

### Final caption

> **Figure 6. Multilingual pathology-reporting interfaces.** The same synthetic case is displayed in (A) Arabic and (B) Kiswahili, demonstrating right-to-left rendering for Arabic and consistent case identifiers, report-version state, workflow controls, and structured reporting behavior across languages. Interface and structured-template translations use curated language resources. All displayed names and data are synthetic.

---

## 8. Supplementary Figure S1: Patient-Facing Summaries

### Required localization correction

The Kiswahili summary now has localized title and section headings, but the following patient-visible controls remain in English:

- `OPEN PDF`
- `DOWNLOAD PDF`

Translate these controls in the Kiswahili view.

The language abbreviations `EN` and `SW` should remain unchanged.

### Translation review

Before final capture:

- perform bilingual clinical review of the Kiswahili title, headings, explanatory text, next steps, and disclaimer;
- document the reviewer and review date internally;
- do not state or imply that the screenshot constitutes formal validation.

### Final caption

> **Supplementary Figure S1. Multilingual patient-facing summaries.** The same structured cytology diagnosis is presented using deterministic, category-based explanatory content in (A) English and (B) Kiswahili. These summaries supplement but do not replace the authorized pathology report or clinician-patient communication. All displayed data are synthetic.

---

## 9. Supplementary Figures S2 and S3

### Supplementary Figure S2

No substantive visual change is required.

Confirm that the caption accurately describes the interface as a JSON-backed template editor rather than a completely no-code editor.

Recommended caption:

> **Supplementary Figure S2. Structured reporting-template configuration.** The template manager displays a selected fluid-cytology reporting template, its JSON-backed structured definition, available language resources, and a rendered preview. Template content can be maintained independently of the core workflow implementation.

### Supplementary Figure S3

No substantive visual change is required.

Confirm that:

- only the intended `H&E Levels` category is present;
- no duplicate or legacy H&E category remains in the underlying catalog;
- the displayed panel composition matches the current application configuration.

Recommended caption:

> **Supplementary Figure S3. Ancillary-testing catalog configuration.** (A) Expanded immunohistochemistry orderables within the ancillary-testing manager. (B) Preconfigured diagnostic panels linking named panels to their constituent immunohistochemical or molecular tests. The catalog can be modified without changing the core workflow implementation.

---

## 10. Manuscript Integration

Add or revise a short implementation-results paragraph such as:

> Representative application interfaces are shown in Figures 3–6. Figures 3–5 follow the same synthetic case through structured accessioning, processing, material tracking, block-linked ancillary testing, result entry, report authorization, and report revision. Figure 6 demonstrates Kiswahili and Arabic interface localization. Multilingual patient-facing summaries and administrative configuration interfaces are shown in Supplementary Figures S1–S3.

Update all figure references after renumbering.

---

## 11. Final Visual and Data Checklist

Before generating the final composites, confirm:

- [ ] The same accession is used across Figures 3–6.
- [ ] Patient and clinician names are realistic synthetic names rather than placeholders.
- [ ] Cytology preparation counts agree across order entry, processing, and material tracking.
- [ ] Direct smears and cell-block-derived slides are represented according to the real data model.
- [ ] The ancillary order is linked to a visible source block.
- [ ] The displayed ancillary tests support the wording of the diagnostic comment.
- [ ] The final report timestamp agrees with the report-history table.
- [ ] The original final report is preserved when the revision draft is created.
- [ ] Report history is merged into Figure 5 as Panel C unless there is a compelling layout reason not to do so.
- [ ] The multilingual figure shows translated diagnostic content, not only navigation controls.
- [ ] Arabic right-to-left rendering is correct.
- [ ] Kiswahili labels are not truncated.
- [ ] Kiswahili patient-summary controls are fully localized.
- [ ] All displayed data are synthetic.
- [ ] Every caption states that displayed data are synthetic where applicable.
- [ ] All screenshots are generated through committed Playwright scripts.
- [ ] No screenshot text is altered manually in post-processing.
- [ ] Filenames, figure numbers, captions, manuscript citations, and metadata all agree.

---

## 12. Required Deliverables

Return:

1. Updated deterministic synthetic fixture.
2. Updated Playwright screenshot-generation specifications.
3. Revised source screenshots.
4. Final composite images:
   - `figure-3-accessioning.png`
   - `figure-4-processing-materials.png`
   - `figure-5-ancillary-reporting-versioning.png`
   - `figure-6-multilingual-interface.png`
   - `figure-s1-patient-summaries.png`
   - `figure-s2-template-configuration.png`
   - `figure-s3-ancillary-configuration.png`
5. Updated caption Markdown file.
6. Updated figure-generation README.
7. A concise change summary documenting:
   - how cytology material counts were reconciled;
   - which ancillary markers were displayed;
   - how report history was merged;
   - what multilingual content was added;
   - which remaining labels were localized;
   - the commit hash used for final figure generation.
