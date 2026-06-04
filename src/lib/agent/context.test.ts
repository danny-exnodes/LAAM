import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "./context";

describe("buildSystemPrompt", () => {
  const now = Date.UTC(2026, 5, 4); // 2026-06-04
  test("có ngày, danh sách tool, chỉ dẫn ngôn ngữ", () => {
    const p = buildSystemPrompt({ lang: "vi", now, toolNames: ["laam_list_agents"] });
    expect(p).toContain("2026-06-04");
    expect(p).toContain("laam_list_agents");
    expect(p).toContain("tiếng Việt");
  });
  test("không có tool → không có cụm gọi công cụ; tiếng Anh", () => {
    const p = buildSystemPrompt({ lang: "en", now, toolNames: [] });
    expect(p).not.toContain("công cụ");
    expect(p).toContain("English");
  });
});
