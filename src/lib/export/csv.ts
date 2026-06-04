// CSV serializer — ports the escaping rules from v1 public/export.js:
// every cell is quoted, internal double-quotes are doubled, rows join with CRLF.

// Quote a single value: stringify, wrap in quotes, double internal quotes.
function csvCell(v: unknown): string {
  if (v === null || v === undefined) v = "";
  return '"' + String(v).replace(/"/g, '""') + '"';
}

// Serialize rows to CSV. The header row is the `columns` array verbatim; each
// data row picks values by column key in column order (missing → empty cell).
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c])).join(","));
  }
  return lines.join("\r\n");
}
