import { describe, expect, test, vi, beforeEach, afterEach } from "vitest";
vi.mock("@/db", () => ({ db: {} }));
import { pickEvalProvider } from "./provider";

// WHY: eval trước đây chỉ gọi Ollama, nên đo được model local — trong khi model đang dùng
// thật (`gpt-oss-120b`) chạy qua BytePlus. Đo sai provider = đo sai model = kết luận vô nghĩa.
describe("pickEvalProvider", () => {
  const saved = { ...process.env };
  beforeEach(() => { delete process.env.EVAL_PROVIDER; delete process.env.EVAL_MODEL; delete process.env.BYTEPLUS_API_KEY; });
  afterEach(() => { process.env = { ...saved }; });

  test("EVAL_PROVIDER=byteplus → dùng BytePlus, model lấy từ EVAL_MODEL", () => {
    process.env.EVAL_PROVIDER = "byteplus";
    process.env.EVAL_MODEL = "gpt-oss-120b";
    process.env.BYTEPLUS_API_KEY = "k";
    const p = pickEvalProvider();
    expect(p.provider).toBe("byteplus");
    expect(p.model).toBe("gpt-oss-120b");
  });

  test("mặc định (không set gì) → Ollama + DEFAULT_CHAT_MODEL: hành vi cũ giữ nguyên", () => {
    process.env.DEFAULT_CHAT_MODEL = "gemma4:e4b";
    const p = pickEvalProvider();
    expect(p.provider).toBe("ollama");
    expect(p.model).toBe("gemma4:e4b");
  });

  test("chọn byteplus nhưng THIẾU API key → ném ngay (fail loud, không lặng lẽ tụt về Ollama rồi đo nhầm model)", () => {
    process.env.EVAL_PROVIDER = "byteplus";
    expect(() => pickEvalProvider()).toThrow(/BYTEPLUS_API_KEY/);
  });
});
