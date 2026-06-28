// previewOutput — PURE. Code-derived, length-bounded preview of a workflow step's
// REAL output, for the editor's per-node output popover (carried additively on the
// workflow_run_step SSE frame). Rule 13: this truncates the actual persisted value;
// the preview is never re-generated/“remembered” by an LLM.

export const OUTPUT_PREVIEW_MAX = 280;

export function previewOutput(output: unknown, max: number = OUTPUT_PREVIEW_MAX): string {
  if (output === null || output === undefined) return "";
  let s: string;
  if (typeof output === "string") s = output;
  else {
    try {
      s = JSON.stringify(output);
    } catch {
      s = String(output);
    }
  }
  s = s.trim();
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - 1)) + "…";
}
