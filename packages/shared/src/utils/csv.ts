/**
 * Minimal RFC 4180 CSV reader.
 *
 * Hand-rolled rather than pulled from npm for two reasons. The import feature
 * needs the source *line* of every record so a per-row error can name a line the
 * user can find in their spreadsheet — and a record containing a quoted newline
 * makes "record index" and "line number" diverge, which is exactly the case
 * off-the-shelf row indexes get wrong. And a lab roster is a few thousand short
 * rows of already-in-memory text, comfortably inside what a single-pass scanner
 * handles, so a dependency would buy nothing while adding to the image's CVE
 * surface (this repo reviews every one of those individually — see .trivyignore).
 *
 * Handles: UTF-8 BOM, LF / CRLF / lone-CR terminators, quoted fields containing
 * the delimiter or a newline, doubled quotes (`""` -> `"`), blank lines, and a
 * missing final newline. Rows are returned with their raggedness intact —
 * deciding what a short row means belongs to the caller.
 */

/** A whole-file problem: there is nothing to preview, so parsing gives up. */
export class CsvFormatError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'CsvFormatError';
  }
}

export interface CsvRecord {
  /** 1-based line in the source where this record starts (header is line 1). */
  line: number;
  values: string[];
}

export interface CsvTable {
  headers: string[];
  headerLine: number;
  rows: CsvRecord[];
}

/** Byte-order mark. Built from its code point so it is visible in a diff. */
const BOM = String.fromCharCode(0xfeff);

/** `  Date Of Birth ` -> `date_of_birth`; `Last-Name` -> `last_name`. */
export function normalizeHeader(raw: string): string {
  return (raw.startsWith(BOM) ? raw.slice(1) : raw)
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

export function parseCsvRecords(text: string, delimiter = ','): CsvRecord[] {
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const records: CsvRecord[] = [];
  let values: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1; // line the cursor is on
  let recordLine = 1; // line the current record began on
  let i = 0;

  const endRecord = (): void => {
    values.push(field);
    field = '';
    // A wholly empty line is a separator or a trailing newline, not a
    // one-column record. Emitting it would put "expected 5 columns, found 1" on
    // every file that ends with a newline, i.e. all of them.
    const blank = values.length === 1 && values[0].trim() === '';
    if (!blank) records.push({ line: recordLine, values });
    values = [];
  };

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && src[i + 1] === '\n') i += 1;
        field += '\n'; // normalize embedded terminators
        line += 1;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    // A quote opens a quoted field only at the start of one. A stray quote
    // mid-field (Excel happily emits `O"Brien` when someone types it) is taken
    // literally rather than throwing out the whole file.
    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === delimiter) {
      values.push(field);
      field = '';
      i += 1;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      i += 1;
      endRecord();
      line += 1;
      recordLine = line;
      continue;
    }

    field += ch;
    i += 1;
  }

  if (inQuotes) {
    throw new CsvFormatError(
      'Unterminated quoted field — check for an unmatched " character',
      recordLine,
    );
  }
  if (field.length > 0 || values.length > 0) endRecord();

  return records;
}

/**
 * Parse into a header + data rows, with the header names normalized.
 *
 * Throws `CsvFormatError` for problems that make the file as a whole
 * unprocessable; anything row-specific is left for the caller to report.
 */
export function parseCsv(
  text: string,
  options: { delimiter?: string; maxRows?: number } = {},
): CsvTable {
  const records = parseCsvRecords(text, options.delimiter ?? ',');
  if (records.length === 0) throw new CsvFormatError('The file is empty', 1);

  const [header, ...rows] = records;
  const headers = header.values.map(normalizeHeader);

  const duplicate = headers.find((h, idx) => headers.indexOf(h) !== idx);
  if (duplicate) {
    throw new CsvFormatError(`Column '${duplicate}' appears more than once`, header.line);
  }
  if (headers.some((h) => h === '')) {
    throw new CsvFormatError('One of the columns has an empty name', header.line);
  }
  if (rows.length === 0) {
    throw new CsvFormatError('The file has a header row but no data rows', header.line);
  }
  if (options.maxRows != null && rows.length > options.maxRows) {
    throw new CsvFormatError(
      `The file has ${rows.length} data rows; the maximum per upload is ${options.maxRows}. Split it into smaller files.`,
      header.line,
    );
  }

  return { headers, headerLine: header.line, rows };
}
