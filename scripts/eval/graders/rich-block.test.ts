import { describe, expect, test } from "vitest";
import { gradeRichBlock } from "./rich-block";
import type { RunTrace } from "../types";

const trace = (finalText: string): RunTrace => ({ convo: [], calls: [], rounds: 1, finalText, ms: 0 });

describe("gradeRichBlock", () => {
  test("pass khi có fenced chart", () =>
    expect(gradeRichBlock(trace('Đây:\n```chart\n{"type":"bar"}\n```'), "chart").pass).toBe(true));
  test("fail khi chỉ có text/ASCII (F2)", () =>
    expect(gradeRichBlock(trace("Quý 1: ####  Quý 2: ######"), "chart").pass).toBe(false));
});
