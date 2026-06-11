// Bóc text đọc-được từ `word/document.xml` (phần body chính của 1 file .docx zip).
// THUẦN — test được không cần unzip. Gộp các run <w:t> theo từng đoạn <w:p>;
// <w:tab/> → tab, <w:br/> → xuống dòng; decode XML entity. KHÔNG phải bộ render
// docx đầy đủ (bảng mất cấu trúc ngang; header/footer/footnote nằm ở part khác) —
// đủ cho chat Q&A: model đọc nội dung text, không cần layout.

export const MAX_DOCX_CHARS = 50_000; // trần để text prepend không tràn ctx model

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => {
      try {
        return String.fromCodePoint(Number(d));
      } catch {
        return "";
      }
    })
    .replace(/&amp;/g, "&"); // &amp; CUỐI cùng (để "&amp;lt;" → "&lt;" literal)
}

export function docxXmlToText(xml: string): string {
  const paras = xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g) ?? [];
  const lines = paras.map((p) => {
    const s = p
      // Bỏ noise không phải nội dung hiển thị: field code + đoạn bị xoá (track-changes).
      .replace(/<w:instrText[\s\S]*?<\/w:instrText>/g, "")
      .replace(/<w:delText[\s\S]*?<\/w:delText>/g, "")
      // Marker inline (nằm GIỮA các <w:t> nên phải đổi tại chỗ, không bóc riêng).
      .replace(/<w:tab\b[^>]*\/?>/g, "\t")
      .replace(/<w:br\b[^>]*\/?>/g, "\n")
      // Unwrap <w:t> (giữ nội dung), rồi xoá MỌI tag còn lại (w:r, w:rPr…).
      .replace(/<w:t\b[^>]*>/g, "")
      .replace(/<\/w:t>/g, "")
      .replace(/<[^>]+>/g, "");
    return decodeXml(s);
  });
  let text = lines.join("\n").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_DOCX_CHARS) text = text.slice(0, MAX_DOCX_CHARS) + "\n…(đã cắt)";
  return text;
}
