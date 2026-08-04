import { describe, test, expect, afterEach } from "vitest";
import { replayBudgetFor, DEFAULT_CLOUD_REPLAY_BUDGET_CHARS } from "./replay-budget";

const LOCAL = 37_000;

afterEach(() => {
  delete process.env.CLOUD_REPLAY_BUDGET_CHARS;
});

describe("replayBudgetFor", () => {
  // WHY: budget local (từ num_ctx 16k) áp cho cloud từng làm hội thoại phân tích bị nén
  // summary từ ~turn 15 — cloud model PHẢI nhận budget lớn hơn hẳn, không phải budget local.
  test("model BytePlus → budget cloud (lớn hơn hẳn local)", () => {
    expect(replayBudgetFor("gpt-oss-120b", LOCAL)).toBe(DEFAULT_CLOUD_REPLAY_BUDGET_CHARS);
    expect(replayBudgetFor("gpt-oss-120b", LOCAL)).toBeGreaterThan(LOCAL * 3);
  });

  test("model Claude → budget cloud", () => {
    expect(replayBudgetFor("claude-opus-4-8", LOCAL)).toBe(DEFAULT_CLOUD_REPLAY_BUDGET_CHARS);
  });

  test("model local → giữ nguyên budget local (num_ctx 16k là ràng buộc THẬT)", () => {
    expect(replayBudgetFor("gemma4:e4b", LOCAL)).toBe(LOCAL);
    expect(replayBudgetFor("qwen3-vl:8b-instruct-q8_0", LOCAL)).toBe(LOCAL);
  });

  test("env CLOUD_REPLAY_BUDGET_CHARS override được (tăng fidelity/chấp nhận cost)", () => {
    process.env.CLOUD_REPLAY_BUDGET_CHARS = "300000";
    expect(replayBudgetFor("gpt-oss-120b", LOCAL)).toBe(300_000);
  });

  // Floor: env đặt NHỎ hơn local cũng không được tụt dưới local — cloud không bao giờ
  // nhớ ít hơn model local trong cùng điều kiện.
  test("env nhỏ hơn budget local → floor về budget local", () => {
    process.env.CLOUD_REPLAY_BUDGET_CHARS = "1000";
    expect(replayBudgetFor("gpt-oss-120b", LOCAL)).toBe(LOCAL);
  });
});
