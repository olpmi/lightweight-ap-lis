/**
 * Builds the single synthetic case that every manuscript figure panel follows.
 *
 * The seeded corpus cannot supply this case. No seeded case carries an
 * immunohistochemistry order (the seed only creates the routine per-block H&E),
 * and none combines multiple specimens, an ancillary order, a signed-out report,
 * an amendment and a resolvable patient summary at once. So the case is built
 * through the API — which is also faster and more legible than driving the same
 * setup through the interface.
 *
 * It is a cytology case on purpose: patient-facing summaries resolve from the
 * structured cytology templates, and the summary figures need that summary in
 * English and Kiswahili.
 *
 * Creation is idempotent. A case is identified by its synthetic patient surname,
 * so re-running the figures reuses the existing case rather than accumulating
 * duplicates.
 */
import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Deliberately unmistakable placeholders rather than plausible names.
 *
 * A figure in a published paper should not be able to be read as a real person's
 * record, however synthetic the data behind it is. Names that look like names
 * invite that reading; "Last, First" cannot be mistaken for anyone, and doubles as
 * a key to the surname-first display format. They are also distinctive enough for
 * the fixture to find its own case again on a re-run.
 */
export const FIGURE_PATIENT = {
  lastName: 'Achieng',
  firstName: 'Grace',
  dateOfBirth: '1968-03-12',
  sex: 'Female',
} as const;

export const FIGURE_CLINICIAN = {
  lastName: 'Mwangi',
  firstName: 'Joseph',
} as const;

/**
 * The preparation this case documents, in one place.
 *
 * Every figure that shows a count, a description or a material identifier derives
 * it from here, so accessioning, the gross description and the material hierarchy
 * cannot drift apart. Two direct smears and one cell block from a single pleural
 * fluid: the smears are the screening preparation, the cell block is what any
 * immunohistochemistry is then cut from.
 */
export const FIGURE_PREPARATION = {
  smearCount: 2,
  thinPrepCount: 0,
  cellBlockCount: 1,
} as const;

/**
 * Structured fluid-cytology content. The diagnostic category drives the
 * patient-facing summary, so it must be one of the template's own option values.
 */
export const FIGURE_REPORT = {
  templateKey: 'fluid_cytology/fluid_cytology',
  templateId: 'fluid_cytology_international_serous_fluid',
  title: 'FLUID CYTOLOGY REPORTING TEMPLATE',
  diagnosticCategory: 'V. Malignant (MAL)',
  diagnosis: 'Malignant cells consistent with metastatic adenocarcinoma.',
  // Says only what one marker can support. Estrogen receptor is expressed by
  // carcinomas of several origins, so it is consistent with a breast primary
  // rather than diagnostic of one, and the comment is written to match the single
  // stain the figure shows.
  comment:
    'Estrogen receptor is positive in the malignant cells. This is consistent with, but not specific for, a breast primary; correlation with the prior clinical history is recommended.',
  gross:
    'Received 250 mL of turbid straw-colored pleural fluid. Centrifuged; one cell block and two smears prepared.',
} as const;

export interface FigureCase {
  orderId: string;
  specimenIds: string[];
  blockIds: string[];
  /** Block the immunohistochemistry order is attached to. */
  ancillaryBlockId: string;
  ancillaryOrderId: number;
  ancillaryTestName: string;
  finalReportId: number;
  amendmentReportId: number;
}

interface ApiOptions {
  request: APIRequestContext;
  employeeId: number;
}

async function post<T>(options: ApiOptions, url: string, body: unknown): Promise<T> {
  const response = await options.request.post(url, { data: body });
  expect(response.ok(), `POST ${url} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function patch<T>(options: ApiOptions, url: string, body: unknown): Promise<T> {
  const response = await options.request.patch(url, { data: body });
  expect(response.ok(), `PATCH ${url} -> ${response.status()} ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function get<T>(options: ApiOptions, url: string): Promise<T> {
  const response = await options.request.get(url);
  expect(response.ok(), `GET ${url} -> ${response.status()}`).toBeTruthy();
  return (await response.json()) as T;
}

function structuredPayload(): string {
  return JSON.stringify({
    version: 1,
    templateKey: FIGURE_REPORT.templateKey,
    templateId: FIGURE_REPORT.templateId,
    title: FIGURE_REPORT.title,
    kind: 'reporting',
    language: 'en',
    values: {
      'specimen.fluid_type': 'pleural_fluid',
      'diagnostic_category.diagnostic_category': FIGURE_REPORT.diagnosticCategory,
    },
  });
}

/** Returns the existing figure case if one is already present. */
async function findExisting(options: ApiOptions): Promise<FigureCase | null> {
  const orders = await get<{ data: Array<{ orderId: string; patient: { lastName: string } }> }>(
    options,
    '/api/orders?page=1&pageSize=400'
  );
  const match = orders.data
    .filter((order) => order.patient?.lastName === FIGURE_PATIENT.lastName)
    .map((order) => order.orderId)
    .sort()
    .at(0);
  if (!match) return null;

  const [materials, reports, ancillary] = await Promise.all([
    get<{ data: { specimens: Array<{ specimenId: string; blocks: Array<{ blockId: string }> }> } }>(
      options,
      `/api/orders/${match}/materials`
    ),
    get<{ data: Array<{ reportId: number | string; versionNumber: number; isFinal: boolean }> }>(
      options,
      `/api/orders/${match}/reports`
    ),
    get<{ data: Array<{ id: number; blockId: string; orderable: { name: string; category: string } }> }>(
      options,
      `/api/ancillary/orders?orderId=${match}`
    ),
  ]);

  const specimens = materials.data.specimens ?? [];
  const ihc = ancillary.data.find((entry) => entry.orderable.category === 'IHC');
  const finalReport = reports.data.find((report) => report.isFinal);
  const amendment = reports.data.find((report) => report.versionNumber > 1);

  if (!ihc || !finalReport || !amendment) return null;

  return {
    orderId: match,
    specimenIds: specimens.map((specimen) => specimen.specimenId),
    blockIds: specimens.flatMap((specimen) => specimen.blocks.map((block) => block.blockId)),
    ancillaryBlockId: ihc.blockId,
    ancillaryOrderId: ihc.id,
    ancillaryTestName: ihc.orderable.name,
    finalReportId: Number(finalReport.reportId),
    amendmentReportId: Number(amendment.reportId),
  };
}

/**
 * Creates the figure case if it does not already exist, and returns its
 * identifiers either way.
 */
export async function ensureFigureCase(options: ApiOptions): Promise<FigureCase> {
  const existing = await findExisting(options);
  if (existing) return existing;

  // Two cytology specimens from one collection, which is clinically coherent for
  // a pleural fluid: the fluid itself plus a cell block from the same sample.
  const sites = await get<{ data: Array<{ bodySiteId: number; bodySiteName: string }> }>(
    options,
    '/api/lookups/body-sites'
  );
  const pickSite = (name: string): number => {
    const site = sites.data.find((entry) => entry.bodySiteName === name);
    expect(site, `Body site "${name}" is not in the lookup`).toBeTruthy();
    return site!.bodySiteId;
  };

  const specimenTypes = await get<{ data: Array<{ specimenTypeId: number; specimenTypeName: string }> }>(
    options,
    '/api/lookups/specimen-types'
  );
  // Named rather than positional: the first entry alphabetically is a biopsy,
  // which would read as clinically wrong against a pleural fluid.
  const cytologyType = specimenTypes.data.find((entry) => entry.specimenTypeName === 'Cytology');
  expect(cytologyType, 'Specimen type "Cytology" is not in the lookup').toBeTruthy();
  const specimenTypeId = cytologyType!.specimenTypeId;

  const created = await post<{
    data: { orderId: string; specimens: Array<{ specimenId: string }> };
  }>(options, '/api/orders', {
    patientLastName: FIGURE_PATIENT.lastName,
    patientFirstName: FIGURE_PATIENT.firstName,
    patientDateOfBirth: FIGURE_PATIENT.dateOfBirth,
    patientSex: FIGURE_PATIENT.sex,
    doctorLastName: FIGURE_CLINICIAN.lastName,
    doctorFirstName: FIGURE_CLINICIAN.firstName,
    caseType: 'Cytology',
    clinicalHistory:
      'Recurrent left pleural effusion. Prior left breast carcinoma treated three years ago.',
    registeredDate: new Date('2026-05-04T08:15:00Z').toISOString(),
    // One specimen — one pleural fluid — carrying the whole preparation. Splitting
    // the smears and the cell block across two specimens would say the laboratory
    // received two samples, which is not what happened and not what the gross
    // description says.
    specimens: [{ bodySiteId: pickSite('Pleural fluid'), specimenTypeId, ...FIGURE_PREPARATION }],
  });

  const orderId = created.data.orderId;
  const specimenIds = created.data.specimens.map((specimen) => specimen.specimenId);
  expect(specimenIds.length).toBe(1);
  const specimenId = specimenIds[0];

  // Materials, created the way the accessioning form itself creates them.
  //
  // OrderEntryPage turns the cytology counts into material: direct preparations
  // (smears, ThinPrep) go onto a single carrier block as typed slides, because a
  // slide in this schema always belongs to a block; each cell block is then a block
  // of its own. Reproducing that logic here rather than inventing a hierarchy keeps
  // the accessioning panel, the gross description and the material panel describing
  // the same preparation.
  const createBlocks = async (count: number) =>
    (
      await post<{ data: Array<{ blockId: string }> }>(
        options,
        `/api/specimens/${specimenId}/blocks`,
        { count }
      )
    ).data.map((block) => block.blockId);

  const directSlideCount = FIGURE_PREPARATION.smearCount + FIGURE_PREPARATION.thinPrepCount;
  const blockIds: string[] = [];

  let smearBlockId: string | null = null;
  if (directSlideCount > 0) {
    [smearBlockId] = await createBlocks(1);
    blockIds.push(smearBlockId);
    if (FIGURE_PREPARATION.smearCount > 0) {
      await post(options, `/api/blocks/${smearBlockId}/slides`, {
        count: FIGURE_PREPARATION.smearCount,
        slideType: 'Smear',
      });
    }
  }

  // The cell block, and the section cut from it. Immunohistochemistry is performed
  // on the cell block rather than on a direct smear, so this is the block the
  // ancillary order below attaches to.
  const [cellBlockId] = await createBlocks(FIGURE_PREPARATION.cellBlockCount);
  blockIds.push(cellBlockId);
  await post(options, `/api/blocks/${cellBlockId}/slides`, { count: 1, slideType: 'H&E' });

  // Immunohistochemistry against the cell block. This is the ancillary branch the
  // workflow figure needs, and the seed never creates one.
  const orderables = await get<{ data: Array<{ id: number; name: string; category: string }> }>(
    options,
    '/api/config/ancillary/orderables'
  );
  const ihcOrderable = orderables.data.find(
    (entry) => entry.category === 'IHC' && entry.name === 'ER'
  );
  expect(ihcOrderable, 'IHC orderable "ER" is not in the catalog').toBeTruthy();

  const ancillaryBlockId = cellBlockId;
  const placed = await post<{ data: Array<{ id: number }> }>(options, '/api/ancillary/orders', {
    orders: [{ orderId, blockId: ancillaryBlockId, orderableId: ihcOrderable!.id }],
  });
  const ancillaryOrderId = placed.data[0].id;

  // Run the immunohistochemistry to completion — DISTRIBUTED is the terminal state
  // in this pipeline, meaning the stained slide has reached the pathologist. The
  // report comments on the estrogen-receptor result, so a stain still shown as
  // mid-staining would contradict the report it is reported alongside.
  for (const status of ['MICROTOMY', 'SLIDE_STAIN', 'DISTRIBUTED']) {
    await patch(options, `/api/ancillary/orders/${ancillaryOrderId}/status`, { status });
  }

  // Distribute every block's routine H&E; sign-out requires it.
  for (const blockId of blockIds) {
    await patch(options, `/api/blocks/${blockId}/he-status`, { status: 'DISTRIBUTED' });
  }

  const draftBody = {
    diagnosis: FIGURE_REPORT.diagnosis,
    comment: FIGURE_REPORT.comment,
    gross: FIGURE_REPORT.gross,
    synopticPayload: structuredPayload(),
    pathologistEmployeeId: options.employeeId,
  };

  const draft = await post<{ data: { reportId: number | string } }>(
    options,
    `/api/orders/${orderId}/reports/draft`,
    draftBody
  );
  const finalReportId = Number(draft.data.reportId);

  await post(options, `/api/reports/${finalReportId}/signout`, draftBody);

  // Amend it, so the report-history panel shows a preserved final version beside
  // an open revision.
  const amendment = await post<{ data: { reportId: number | string } }>(
    options,
    `/api/orders/${orderId}/reactivate`,
    {
      reactivationType: 'revise',
      reactivationReason:
        'Immunohistochemistry received after sign-out; comment updated to record the estrogen-receptor result.',
    }
  );

  return {
    orderId,
    specimenIds,
    blockIds,
    ancillaryBlockId,
    ancillaryOrderId,
    ancillaryTestName: ihcOrderable!.name,
    finalReportId,
    amendmentReportId: Number(amendment.data.reportId),
  };
}
