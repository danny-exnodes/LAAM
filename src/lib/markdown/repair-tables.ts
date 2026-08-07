// GFM requires a table's delimiter row to have exactly as many cells as its header. When it
// does not, remark stops seeing a table at all and the block degrades to a paragraph — where
// newlines render as spaces, so the rows arrive on screen as one run-on line of pipes.
//
// Measured 2026-08-07 in the demo UI: the model wrote `| Metric | Value |` over `|--------|`,
// and an eleven-row summary table rendered as a single paragraph. Nothing was wrong with the
// renderer and nothing was lost in transport — the cell count was off by one.
//
// Repaired in code, not by asking the model to type more carefully: a cell count is countable
// and a malformed delimiter row is not a judgement call (AGENTS Rule 5). PURE — no I/O.

const FENCE = /^\s*(```|~~~)/;

// A delimiter row is dashes, colons, pipes and spaces — and must contain BOTH a dash and a
// pipe. Requiring the pipe is what keeps a setext H2 (`---` under a line of text) from being
// mistaken for a table and rewritten into one.
const DELIMITER_ROW = /^[\s|:-]*$/;

const isDelimiterRow = (line: string) =>
  line.includes("|") && line.includes("-") && DELIMITER_ROW.test(line);

// A single delimiter cell: dashes, optionally anchored by a colon at either end.
const isDelimiterCell = (cell: string) => /^:?-+:?$/.test(cell.trim());

// Split a row into cells, dropping the optional leading and trailing pipe. `| a | b |` and
// `a | b` both yield two cells, which is how GFM counts them.
function cells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|");
}

// Rebuild a delimiter row at the header's width, carrying over whatever alignment the model
// did manage to write. Cells beyond what it wrote default to `---` (left, GFM's own default),
// so widening never invents an alignment the author did not ask for.
function delimiterRow(written: string[], width: number): string {
  const out: string[] = [];
  for (let i = 0; i < width; i++) {
    const w = written[i]?.trim() ?? "";
    const left = w.startsWith(":");
    const right = w.endsWith(":");
    out.push(`${left ? ":" : ""}---${right ? ":" : ""}`);
  }
  return `| ${out.join(" | ")} |`;
}

export function repairTableDelimiters(source: string): string {
  const lines = source.split("\n");
  let inFence = false;

  // From 0, not 1: a fence can open on the very first line, and skipping it would leave
  // inFence false for everything inside the block.
  for (let i = 0; i < lines.length; i++) {
    if (FENCE.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (i === 0 || inFence || !isDelimiterRow(lines[i])) continue;

    const header = lines[i - 1];
    if (!header.includes("|")) continue;

    const width = cells(header).length;
    const written = cells(lines[i]);
    // The count is only half the rule. GFM also requires EVERY delimiter cell to be dashes
    // with optional colons — measured live, "||---|---|…" counts correctly and is still
    // rejected, because its first cell is empty. Checking only the count passed it through.
    if (written.length === width && written.every(isDelimiterCell)) continue;

    lines[i] = delimiterRow(written, width);
  }

  return lines.join("\n");
}
