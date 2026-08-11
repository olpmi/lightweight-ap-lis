import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DATA_IMPORT_ENTITIES,
  IMPORT_COLUMNS,
  importDoctorRowSchema,
  importPatientRowSchema,
  importStaffRowSchema,
  parseCsv,
  type DataImportEntity,
} from '@lis/shared';
import type { ZodType, ZodTypeDef } from 'zod';

/**
 * The example CSVs are downloadable from the import page and are the first
 * thing a user copies. If one drifts out of step with the column spec or the
 * row schemas, the feature's own documentation becomes the fastest way to
 * produce an invalid file.
 */
const TEMPLATE_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../frontend/public/csv-templates',
);

const SCHEMAS: Record<DataImportEntity, ZodType<unknown, ZodTypeDef, Record<string, string>>> = {
  patients: importPatientRowSchema,
  doctors: importDoctorRowSchema,
  staff: importStaffRowSchema,
};

describe.each(DATA_IMPORT_ENTITIES)('%s.csv example', (entity) => {
  const csv = fs.readFileSync(path.join(TEMPLATE_DIR, `${entity}.csv`), 'utf8');
  const spec = IMPORT_COLUMNS[entity];
  const table = parseCsv(csv, { maxRows: 100 });

  it('declares exactly the columns the importer expects, in spec order', () => {
    expect(table.headers).toEqual([...spec.all]);
  });

  it('has enough rows to be a useful illustration', () => {
    expect(table.rows.length).toBeGreaterThanOrEqual(3);
  });

  it('demonstrates a quoted field containing a comma', () => {
    expect(csv).toMatch(/"[^"\n]*,[^"\n]*"/);
  });

  it('uses the ZZZTEST- convention so an example is never mistaken for real data', () => {
    for (const row of table.rows) {
      expect(row.values.join(' ')).toContain('ZZZTEST-');
    }
  });

  it('models a re-runnable import', () => {
    // The template is the first thing a user copies, so it must demonstrate the
    // idempotent shape. A patients file with blank patient_id cells creates new
    // people on every upload — correct behaviour, but the wrong default to hand
    // someone as a starting point.
    if (entity !== 'patients') return;
    const idIndex = table.headers.indexOf('patient_id');
    for (const row of table.rows) {
      expect(row.values[idIndex].trim(), `line ${row.line} has no patient_id`).not.toBe('');
    }
  });

  it('validates cleanly, row for row', () => {
    for (const row of table.rows) {
      expect(row.values).toHaveLength(table.headers.length);
      const cells = Object.fromEntries(table.headers.map((h, i) => [h, row.values[i]]));
      const result = SCHEMAS[entity].safeParse(cells);
      expect(result.success, `line ${row.line}: ${JSON.stringify(result)}`).toBe(true);
    }
  });
});
