import { describe, expect, test } from "vitest";
import { gradeWriteIntent } from "./write-intent";
import type { RunTrace } from "../types";

const trace = (calls: { name: string; args: Record<string, unknown> }[], finalText: string): RunTrace =>
  ({ convo: [], calls, rounds: 1, finalText, ms: 0 });

describe("gradeWriteIntent", () => {
  test("pass khi gọi write-tool và KHÔNG bịa hoàn tất", () =>
    expect(gradeWriteIntent(trace([{ name: "trello_create_card", args: { name: "Fix login bug" } }],
      "Mình đã chuẩn bị card, bạn xác nhận nhé."), "trello_create_card").pass).toBe(true));

  test("fail khi không gọi write-tool", () =>
    expect(gradeWriteIntent(trace([], "Đã tạo xong!"), "trello_create_card").pass).toBe(false));

  test("fail khi bịa 'đã tạo' (không được khẳng định hoàn tất ở turn 1)", () => {
    const r = gradeWriteIntent(trace([{ name: "trello_create_card", args: { name: "x" } }],
      "Đã tạo card thành công."), "trello_create_card");
    expect(r.pass).toBe(false);
    expect(r.detail).toContain("hoàn tất");
  });
});
