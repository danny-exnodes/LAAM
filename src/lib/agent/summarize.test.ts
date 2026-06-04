import { describe, expect, test, vi } from "vitest";
import { planHistory, summarizeMessages, type HistoryMsg } from "./summarize";

const mk = (id: string, role: string, content: string): HistoryMsg => ({ id, role, content });

describe("planHistory", () => {
  test("dưới ngân sách → không tóm tắt, replay toàn bộ live", () => {
    const msgs = [mk("1", "user", "a"), mk("2", "assistant", "b")];
    const p = planHistory(msgs, null, null, { budgetChars: 1000 });
    expect(p.needsSummary).toBe(false);
    expect(p.toReplay).toHaveLength(2);
    expect(p.toSummarize).toEqual([]);
  });

  test("trên ngân sách → gập phần cũ, giữ keepLast cuối", () => {
    const msgs = Array.from({ length: 10 }, (_, i) =>
      mk(String(i), i % 2 ? "assistant" : "user", "x".repeat(50)),
    );
    const p = planHistory(msgs, null, null, { budgetChars: 100, keepLast: 4 });
    expect(p.needsSummary).toBe(true);
    expect(p.toReplay).toHaveLength(4);
    expect(p.toSummarize).toHaveLength(6);
    expect(p.toReplay[0].id).toBe("6");
  });

  test("watermark → chỉ xét message sau watermark", () => {
    const msgs = [mk("1", "user", "a"), mk("2", "assistant", "b"), mk("3", "user", "c")];
    const p = planHistory(msgs, "tóm tắt cũ", "2", { budgetChars: 1000 });
    expect(p.toReplay.map((m) => m.id)).toEqual(["3"]);
  });

  test("live nhỏ hơn sàn → không gập dù quá ngân sách", () => {
    const msgs = [mk("1", "user", "x".repeat(999))];
    const p = planHistory(msgs, null, null, { budgetChars: 10, keepLast: 6 });
    expect(p.needsSummary).toBe(false);
    expect(p.toReplay).toHaveLength(1);
  });
});

describe("summarizeMessages", () => {
  test("gọi model với prevSummary + nội dung; trả về đã trim", async () => {
    const callModel = vi.fn(async () => "  BẢN TÓM TẮT  ");
    const out = await summarizeMessages([mk("1", "user", "việc A")], "trước đó", "vi", { callModel });
    expect(out).toBe("BẢN TÓM TẮT");
    const prompt = (callModel.mock.calls[0] as unknown as [string])[0];
    expect(prompt).toContain("trước đó");
    expect(prompt).toContain("việc A");
  });
});
