// PDF export — generic title + body document via jspdf (v1 public/export.js used
// jspdf for its dashboard report; the locked signature here is the generic form).
import { jsPDF } from "jspdf";

const MARGIN = 40;

// Build a PDF Blob: bold title, then the body text wrapped to the page width and
// paginated. Pure (no DOM side effects) so it is unit-testable in jsdom.
export function makePdfBlob(title: string, body: string): Blob {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottom = pageHeight - MARGIN;
  let y = 50;

  if (title) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(String(title), MARGIN, y);
    y += 26;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  const lines: string[] = doc.splitTextToSize(String(body), pageWidth - MARGIN * 2);
  for (const ln of lines) {
    if (y > bottom) {
      doc.addPage();
      y = 50;
    }
    doc.text(ln, MARGIN, y);
    y += 16;
  }

  return doc.output("blob");
}

// Save the PDF via the browser (no-op on the server).
export function savePdf(filename: string, title: string, body: string): void {
  if (typeof window === "undefined") return;
  const doc = makePdfBlob(title, body);
  const url = URL.createObjectURL(doc);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {
      /* already removed */
    }
    URL.revokeObjectURL(url);
  }, 1500);
}
