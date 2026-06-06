import type { GraderResult, RunTrace } from "../types";

const URL_RE = /https?:\/\/[^\s)\]<>"']+/g;

export function extractUrls(text: string): string[] {
  return (text.match(URL_RE) ?? []).map((u) => u.replace(/[.,;:]+$/, ""));
}

// Rule 13 cho URL: model phải trích URL THẬT từ kết quả tool, không bịa. Trả dim `grounding`
// (cố ý — đây là một dạng grounding, slot vào cột ground sẵn có, KHÔNG thêm cột/DimKey).
// Pass nếu: có ≥1 URL trong câu trả lời VÀ mọi URL trích được đều thuộc tập `real`.
export function gradeCitesRealUrl(trace: RunTrace, real: string[]): GraderResult {
  const set = new Set(real);
  const found = extractUrls(trace.finalText);
  if (found.length === 0) return { dim: "grounding", pass: false, detail: "không dẫn URL (kỳ vọng dẫn nguồn web)" };
  const bogus = found.filter((u) => !set.has(u));
  if (bogus.length) return { dim: "grounding", pass: false, detail: "bịa URL: " + bogus.slice(0, 3).join(", ") };
  return { dim: "grounding", pass: true };
}
