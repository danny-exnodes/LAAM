import { describe, expect, test } from "vitest";
import { buildSystemPrompt } from "./context";

describe("buildSystemPrompt", () => {
  const now = Date.UTC(2026, 5, 4); // 2026-06-04
  test("có ngày, liệt kê tool (render phẳng), chỉ dẫn ngôn ngữ", () => {
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
    // Render phẳng: cả 2 tool liệt kê trong câu "có thể gọi các công cụ sau".
    expect(p).toContain("các công cụ sau");
    expect(p).toContain("laam_list_agents");
    expect(p).toContain("demo_create_task");
    // QW-1 grouping ĐÃ REVERT (chưa chứng minh + write-probe noisy) — không còn tiêu đề nhóm.
    expect(p).not.toContain("Công cụ ĐỌC");
    expect(p).not.toContain("Công cụ GHI");
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
  test("F3: có tool → ép gọi lại tool khi người dùng yêu cầu tìm/tra cứu LẠI, không dùng dữ liệu cũ trong hội thoại", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [{ name: "laam_list_agents", kind: "read" }] });
    expect(p).toContain("tìm") ;
    expect(p).toContain("lại"); // yêu cầu làm mới ("tìm lại", "tra cứu lại", "kiểm tra lại"...)
    expect(p).toContain("BẮT BUỘC gọi lại công cụ");
    expect(p).toContain("KHÔNG dùng lại kết quả cũ"); // cấm trả lời từ hội thoại/tóm tắt cũ
  });
  test("KHÔNG few-shot neo tool cụ thể (QW-5 đã gỡ — neo demo_create_task làm tụt write-selection 8B)", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [{ name: "trello_create_card", kind: "write" }] });
    expect(p).not.toContain("Ví dụ:"); // không few-shot
    expect(p).not.toContain("demo_create_task"); // không neo tool ngoài danh sách thật của lượt
    expect(p).toContain("trello_create_card"); // tool thật vẫn được liệt kê
  });
  test("tương thích ngược: vẫn nhận string[] (caller chưa cập nhật)", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: ["laam_list_agents"] });
    expect(p).toContain("các công cụ sau");
    expect(p).toContain("laam_list_agents");
  });
  test("dạy hợp đồng khối ```chart và ```map (rich-render) — kể cả khi không có tool", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [] });
    expect(p).toContain("```chart");
    expect(p).toContain("```map");
    // map dùng tên địa điểm (client tự tra toạ độ) — không bắt model bịa polyline
    expect(p).toContain("directions");
  });
  test("voice mode: dùng VOICE_GUIDE, bỏ hợp đồng render trực quan (chart/map)", () => {
    const p = buildSystemPrompt({ lang: "vi", now, tools: [], mode: "voice" });
    // Voice guide markers
    expect(p).toContain("giọng nói");        // "Đây là hội thoại bằng giọng nói…"
    expect(p).toContain("KHÔNG đọc ID");     // drop identifiers rule
    // Visual render contract must be gone — meaningless for TTS
    expect(p).not.toContain("```chart");
    expect(p).not.toContain("```map");
  });
  test("voice mode: giữ tiếng Việt (LANG_HINT không bị voice ghi đè) và giữ khối tool", () => {
    const p = buildSystemPrompt({
      lang: "vi",
      now,
      tools: [{ name: "laam_list_agents", kind: "read" }],
      mode: "voice",
    });
    expect(p).toContain("tiếng Việt");        // LANG_HINT preserved
    expect(p).toContain("các công cụ sau");   // tool clause preserved
    expect(p).toContain("laam_list_agents");
  });
  test("mode 'text' và mode vắng mặt: prompt y hệt nhau (regression backward-compat)", () => {
    const withText = buildSystemPrompt({ lang: "vi", now, tools: [], mode: "text" });
    const withNone = buildSystemPrompt({ lang: "vi", now, tools: [] });
    expect(withText).toBe(withNone);
    // và vẫn giữ hợp đồng render như cũ
    expect(withNone).toContain("```chart");
  });
});
