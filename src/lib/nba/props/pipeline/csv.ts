/**
 * Minimal RFC 4180 CSV reader: quoted fields, doubled quotes, embedded commas
 * and newlines, CRLF or LF, optional BOM. No type coercion; callers validate.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === "") inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (inQuotes) throw new Error("CSV ends inside a quoted field");
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export interface CsvTable {
  headers: string[];
  rows: Array<{ line: number; values: Record<string, string> }>;
}

/** Header names are lowercased and trimmed. Missing required columns and ragged rows are errors. */
export function readCsvTable(text: string, required: readonly string[]): CsvTable {
  const [head, ...body] = parseCsv(text);
  if (!head) throw new Error("CSV is empty");
  const headers = head.map((h) => h.trim().toLowerCase());
  const missing = required.filter((name) => !headers.includes(name));
  if (missing.length > 0) throw new Error(`CSV is missing required column(s): ${missing.join(", ")}`);
  if (new Set(headers).size !== headers.length) throw new Error("CSV has duplicate column names");
  return {
    headers,
    rows: body.map((cells, index) => {
      if (cells.length !== headers.length) throw new Error(`CSV line ${index + 2} has ${cells.length} fields, expected ${headers.length}`);
      return { line: index + 2, values: Object.fromEntries(headers.map((h, i) => [h, cells[i].trim()])) };
    }),
  };
}
