// Export utilities — pure serializers (csv/markdown/json) + browser download
// helpers. The download helpers create a Blob and click a transient <a download>
// (ported from v1 public/{export,chat-export}.js), and are no-ops on the server.

import { toCsv } from "./csv";
import { toMarkdown } from "./markdown";
import { toJson } from "./json";
import { savePdf } from "./pdf";

export { toCsv } from "./csv";
export { toMarkdown } from "./markdown";
export { toJson } from "./json";
export { makePdfBlob } from "./pdf";

// Shared Blob + anchor-click download. Guarded so it is a no-op outside a browser.
function downloadText(filename: string, text: string, mime: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  // Revoke after a tick so the download has started.
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {
      /* already removed */
    }
    URL.revokeObjectURL(url);
  }, 1500);
}

export function downloadCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns: string[],
): void {
  downloadText(filename, toCsv(rows, columns), "text/csv");
}

export function downloadJson(filename: string, data: unknown): void {
  downloadText(filename, toJson(data), "application/json");
}

export function downloadMarkdown(filename: string, md: string): void {
  downloadText(filename, md, "text/markdown");
}

export function downloadPdf(filename: string, title: string, body: string): void {
  savePdf(filename, title, body);
}
