import type { GraderResult, RunTrace } from "../types";

// Câu cuối có fenced ```chart / ```map (đầu một dòng)?
export function gradeRichBlock(trace: RunTrace, block: "chart" | "map"): GraderResult {
  const re = new RegExp("(^|\\n)\\s*```" + block + "\\b", "i");
  const pass = re.test(trace.finalText);
  return { dim: "rich-block", pass, detail: pass ? undefined : `không emit \`\`\`${block}` };
}
