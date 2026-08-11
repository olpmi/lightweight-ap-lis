import { describe, it, expect } from 'vitest';
import { CsvFormatError, normalizeHeader, parseCsv, parseCsvRecords } from '@lis/shared';

const BOM = String.fromCharCode(0xfeff);

describe('normalizeHeader', () => {
  it('trims, lower-cases, and converts spaces and hyphens to underscores', () => {
    expect(normalizeHeader('  Date Of Birth ')).toBe('date_of_birth');
    expect(normalizeHeader('Last-Name')).toBe('last_name');
    expect(normalizeHeader('SEX')).toBe('sex');
  });

  it('strips a leading byte-order mark', () => {
    expect(normalizeHeader(`${BOM}patient_id`)).toBe('patient_id');
  });

  it('drops characters that are neither alphanumeric nor underscore', () => {
    expect(normalizeHeader('e-mail?')).toBe('e_mail');
  });
});

describe('parseCsvRecords', () => {
  it('treats LF, CRLF and lone CR as the same terminator', () => {
    const expected = [
      { line: 1, values: ['a', 'b'] },
      { line: 2, values: ['c', 'd'] },
    ];
    expect(parseCsvRecords('a,b\nc,d')).toEqual(expected);
    expect(parseCsvRecords('a,b\r\nc,d')).toEqual(expected);
    expect(parseCsvRecords('a,b\rc,d')).toEqual(expected);
  });

  it('keeps a comma inside a quoted field', () => {
    expect(parseCsvRecords('last_name,first_name\n"Smith, Jr.",Sean')[1].values).toEqual([
      'Smith, Jr.',
      'Sean',
    ]);
  });

  it('unescapes a doubled quote', () => {
    expect(parseCsvRecords('name\n"O""Brien"')[1].values).toEqual(['O"Brien']);
  });

  it('takes a stray mid-field quote literally rather than throwing', () => {
    // Excel emits this when someone types a quote inside an unquoted cell.
    expect(parseCsvRecords('name\nO"Brien')[1].values).toEqual(['O"Brien']);
  });

  it('keeps a quoted newline in one record and still reports the next line correctly', () => {
    // The property that makes the per-row error report usable: after a record
    // spanning two physical lines, the following record's reported line is
    // still the line the user sees in their spreadsheet.
    const records = parseCsvRecords('a\n"one\ntwo"\nlast');
    expect(records).toHaveLength(3);
    expect(records[1].values).toEqual(['one\ntwo']);
    expect(records[2]).toEqual({ line: 4, values: ['last'] });
  });

  it('produces no phantom row for a trailing newline', () => {
    expect(parseCsvRecords('a,b\nc,d\n')).toHaveLength(2);
  });

  it('skips blank interior lines but keeps line numbering', () => {
    const records = parseCsvRecords('a\n\nc');
    expect(records).toHaveLength(2);
    expect(records[1]).toEqual({ line: 3, values: ['c'] });
  });

  it('returns ragged rows intact for the caller to judge', () => {
    expect(parseCsvRecords('a,b,c\n1,2')[1].values).toEqual(['1', '2']);
  });

  it('throws for an unterminated quoted field, naming the line it began on', () => {
    try {
      parseCsvRecords('a,b\n"never closed');
      expect.unreachable('expected CsvFormatError');
    } catch (err) {
      expect(err).toBeInstanceOf(CsvFormatError);
      expect((err as CsvFormatError).line).toBe(2);
    }
  });
});

describe('parseCsv', () => {
  it('normalizes headers and strips the BOM', () => {
    const table = parseCsv(`${BOM}Last Name,First-Name\nSmith,Ada`);
    expect(table.headers).toEqual(['last_name', 'first_name']);
    expect(table.rows[0].values).toEqual(['Smith', 'Ada']);
  });

  it('rejects a duplicate column name', () => {
    expect(() => parseCsv('a,A\n1,2')).toThrow(CsvFormatError);
  });

  it('rejects an empty column name', () => {
    expect(() => parseCsv('a,,c\n1,2,3')).toThrow(CsvFormatError);
  });

  it('rejects an empty file and a header-only file', () => {
    expect(() => parseCsv('')).toThrow(CsvFormatError);
    expect(() => parseCsv('a,b\n')).toThrow(CsvFormatError);
  });

  it('rejects a file over maxRows, reporting the actual count', () => {
    const csv = ['a', ...Array.from({ length: 5 }, (_, i) => String(i))].join('\n');
    expect(() => parseCsv(csv, { maxRows: 4 })).toThrow(/5 data rows/);
  });
});
