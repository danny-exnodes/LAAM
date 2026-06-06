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
  test("F1: có tool → ép gọi tool cho write-intent + cấm tuyên bố ghi thành công khi chưa có kết quả tool", () => {
    const p = buildSystemPrompt({ lang: "vi", now, toolNames: ["gcal_create_event"] });
    expect(p).toContain("BẮT BUỘC gọi công cụ"); // write-intent must emit a tool_call
    expect(p).toContain("TUYỆT ĐỐI"); // hard prohibition
    expect(p).toContain("thành công"); // ...on claiming a write succeeded without a tool result
  });
  test("dạy hợp đồng khối ```chart và ```map (rich-render) — kể cả khi không có tool", () => {
    const p = buildSystemPrompt({ lang: "vi", now, toolNames: [] });
    expect(p).toContain("```chart");
    expect(p).toContain("```map");
    // map dùng tên địa điểm (client tự tra toạ độ) — không bắt model bịa polyline
    expect(p).toContain("directions");
  });
});
