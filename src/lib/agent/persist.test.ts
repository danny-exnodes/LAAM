import { describe, expect, test } from "vitest";
import { extractToolTurns } from "./persist";
import type { ChatMessage } from "./orchestrator";

const base: ChatMessage[] = [
  { role: "system", content: "S" },
  { role: "user", content: "hỏi" },
];

describe("extractToolTurns", () => {
  test("ghép tool_calls với tool result; tính ok/bytes/seq", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "laam_list_agents", arguments: { status: "running" } } }] },
      { role: "tool", content: JSON.stringify({ agents: [] }) },
      { role: "assistant", content: "xong" },
    ];
    const rows = extractToolTurns(convo, base.length);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ seq: 0, name: "laam_list_agents", ok: true });
    expect(rows[0].args).toEqual({ status: "running" });
    expect(rows[0].result).toEqual({ agents: [] });
    expect(rows[0].bytes).toBe(JSON.stringify({ agents: [] }).length);
  });

  test("arguments chuỗi JSON → parse; chuỗi hỏng → {}", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [
        { function: { name: "a", arguments: '{"x":1}' } },
        { function: { name: "b", arguments: "{hỏng" } },
      ] },
      { role: "tool", content: "{}" },
      { role: "tool", content: "{}" },
    ];
    const rows = extractToolTurns(convo, base.length);
    expect(rows[0].args).toEqual({ x: 1 });
    expect(rows[1].args).toEqual({});
  });

  test("result có key 'error' → ok=false", () => {
    const convo: ChatMessage[] = [
      ...base,
      { role: "assistant", content: "", tool_calls: [{ function: { name: "a", arguments: {} } }] },
      { role: "tool", content: JSON.stringify({ error: "không tìm thấy" }) },
    ];
    expect(extractToolTurns(convo, base.length)[0].ok).toBe(false);
  });

  test("chỉ text, không tool → []", () => {
    const convo: ChatMessage[] = [...base, { role: "assistant", content: "chào" }];
    expect(extractToolTurns(convo, base.length)).toEqual([]);
  });

  test("baseLen bỏ qua lịch sử cũ", () => {
    const convo: ChatMessage[] = [
      { role: "assistant", content: "", tool_calls: [{ function: { name: "old", arguments: {} } }] },
      { role: "tool", content: "{}" },
      { role: "user", content: "mới" },
      { role: "assistant", content: "trả lời" },
    ];
    expect(extractToolTurns(convo, 3)).toEqual([]);
  });
});
