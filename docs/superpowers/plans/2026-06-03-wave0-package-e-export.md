# Wave 0 — Package E: export utils (CSV/MD/JSON/PDF) — TDD sub-plan

> Owner: agent `export`. Parent: `2026-06-03-v2-wave0-foundation.md` (Package E).
> Scope: ONLY `v2/src/lib/export/{csv,markdown,json,pdf,index}.ts` + matching `*.test.ts`.
> Conforms to LOCKED signatures. No edits to package.json/vitest config/tsconfig.

## Locked signatures (from parent plan)
```ts
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string;
export function toMarkdown(conversation: { role: string; content: string }[]): string;
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns: string[]): void;
export function downloadJson(filename: string, data: unknown): void;
export function downloadMarkdown(filename: string, md: string): void;
export function downloadPdf(filename: string, title: string, body: string): void;
```

## v1 semantics being ported
- CSV (`public/export.js` `csvCell`/`csvRow`): quote EVERY value, double internal `"`, join cells with `,`, join rows with `\r\n`. `toCsv` header row = the `columns` array verbatim; each data row = `columns.map(c => row[c])`. null/undefined → empty.
- Markdown (`public/chat-export.js` `buildMarkdown`): each message → `**<Role>:**\n\n<content>`; sections joined by `\n\n---\n\n`. Role label: user→`Bạn`, assistant→`Trợ lý`, other→role as-is. Locked sig is simpler than v1 (no title/meta/attachments) — port the section shape only. Code fences inside content are passed through verbatim (no escaping).
- Download helpers (`downloadBlob` in both v1 files): `new Blob([text],{type})` → `URL.createObjectURL` → transient `<a download>` click → revoke. MUST guard `typeof window !== 'undefined'` (server-safe no-op).
- PDF (`public/export.js` `pdfReport` uses jspdf): locked sig is generic `downloadPdf(filename,title,body)` — title (bold, large) then body wrapped to page width via `doc.splitTextToSize`, paginated. jspdf v4: `import { jsPDF } from 'jspdf'`; `doc.output('blob')` → Blob; `doc.save(filename)` triggers browser download. Guard `typeof window`.

## Steps (TDD — test first, then implement)

- [ ] **csv.ts** — RED: `csv.test.ts` asserts header row = columns; a value with comma stays inside quotes; embedded `"` → doubled; embedded newline stays in a quoted cell; column ordering follows `columns` not row key order; empty `rows` → just the header line; null/undefined → empty quoted cell; rows joined with `\r\n`. GREEN: implement `toCsv`.
- [ ] **markdown.ts** — RED: `markdown.test.ts` asserts role headers (`**Bạn:**`, `**Trợ lý:**`), content present, sections joined by `---`, a ```code fence``` in content is preserved verbatim, empty conversation → `''`. GREEN: implement `toMarkdown`.
- [ ] **json.ts** — RED: `json.test.ts` asserts `downloadJson` creates a blob URL in jsdom (mock `URL.createObjectURL`) and is a no-op guard is testable; (json.ts holds `downloadJson`). GREEN.
- [ ] **index.ts** — RED: `index.test.ts` asserts `downloadCsv`/`downloadJson`/`downloadMarkdown` each call `URL.createObjectURL` (mocked) once and trigger an anchor click; re-exports `toCsv`/`toMarkdown`. GREEN: `index.ts` re-exports + the three text-blob download helpers + `downloadPdf`.
- [ ] **pdf.ts** — RED: `pdf.test.ts` asserts `makePdfBlob(title,body)` (internal) returns a non-empty Blob via jspdf. GREEN: implement `downloadPdf` + a testable blob builder.

## Design notes
- Put the three text-based download helpers (`downloadCsv/downloadJson/downloadMarkdown`) and `downloadPdf` in `index.ts` alongside re-exports — matches "browser helpers" row in parent file table. `csv.ts`/`markdown.ts`/`json.ts`/`pdf.ts` hold pure logic. To keep `downloadJson` colocated per parent's locked list note ("json.ts"), put `downloadJson` logic via a shared `downloadText` in index. json.ts holds `toJson(data)` pure serializer.
- A single private `downloadText(filename, text, mime)` in index.ts does the Blob+anchor dance with the `typeof window` guard, reused by csv/json/markdown helpers.
- pdf.ts exports `makePdfBlob(title, body): Blob | null` (pure, testable in jsdom — jspdf runs in jsdom) and `savePdf(filename,title,body)`. `downloadPdf` in index delegates to pdf.ts.

## Success criteria
`cd v2 && npx vitest run src/lib/export` → all green. Signatures match locked list exactly. Server-safe (window guards). No edits outside scope.
