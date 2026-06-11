import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "./context";

describe("buildSystemPrompt", () => {
  const now = Date.UTC(2026, 5, 4); // 2026-06-04
  test("có ngày, render CÓ NHÓM đọc/ghi với tên đúng nhóm, chỉ dẫn ngôn ngữ", () => {
    const p = buildSystemPrompt({
      lang: "vi",
      now,
      tools: [
        { name: "laam_list_agents", kind: "read" },
        { name: "demo_create_task", kind: "write" },
      ],
    });
    expect(p).toContain("2026-06-04");
    expect(p).toContain("tiếng Việt");
    // QW-1: hai tiêu đề nhóm xuất hiện, tên tool nằm ĐÚNG nhóm của nó.
    expect(p).toContain("Công cụ ĐỌC");
    expect(p).toContain("Công cụ GHI");
    // read tool đứng sau tiêu đề ĐỌC, trước tiêu đề GHI (tách nhóm thật sự, không trộn).
    expect(p.indexOf("laam_list_agents")).toBeGreaterThan(p.indexOf("Công cụ ĐỌC"));
    expect(p.indexOf("laam_list_agents")).toBeLessThan(p.indexOf("Công cụ GHI"));
    // write tool nằm sau tiêu đề GHI.
    expect(p.indexOf("demo_create_task")).toBeGreaterThan(p.indexOf("Công cụ GHI"));
  });
  test("không có tool → không có cụm gọi công cụ; tiếng Anh", () => {
    const p = buildSystemPrompt({ lang: "en", now, tools: [] });
    expect(p).not.toContain("công cụ");
    expect(p).not.toContain("Công cụ");
    expect(p).toContain("English");
  });
  test("F1: có tool → ép gọi tool cho write-intent + cấm tuyên bố ghi thành công khi chưa có kết quả tool", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [{ name: "demo_create_task", kind: "write" }] });
    expect(p).toContain("BẮT BUỘC gọi công cụ"); // write-intent must emit a tool_call
    expect(p).toContain("TUYỆT ĐỐI"); // hard prohibition
    expect(p).toContain("thành công"); // ...on claiming a write succeeded without a tool result
  });
  test("QW-5: few-shot luồng ghi CHỈ nhắc demo_create_task (không dùng connector thật)", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [{ name: "demo_create_task", kind: "write" }] });
    expect(p).toContain("Ví dụ:");
    expect(p).toContain("demo_create_task");
    // mẫu không được trỏ tới bất kỳ connector ghi thật nào (an toàn write-test).
    expect(p).not.toContain("trello_create_card");
    expect(p).not.toContain("gmail_send");
  });
  test("tương thích ngược: vẫn nhận string[] (coi là tool ĐỌC)", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: ["laam_list_agents"] });
    expect(p).toContain("Công cụ ĐỌC");
    expect(p).toContain("laam_list_agents");
    expect(p).not.toContain("Công cụ GHI"); // không có write → không render tiêu đề GHI
  });
  test("dạy hợp đồng khối ```chart và ```map (rich-render) — kể cả khi không có tool", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [] });
    expect(p).toContain("```chart");
    expect(p).toContain("```map");
    // map dùng tên địa điểm (client tự tra toạ độ) — không bắt model bịa polyline
    expect(p).toContain("directions");
  });
});
