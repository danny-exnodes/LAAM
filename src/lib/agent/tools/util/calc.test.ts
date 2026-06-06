import { describe, expect, test } from "vitest";
import { evalExpr, utilCalc } from "./calc";
import type { ToolContext } from "../../types";

const ctx: ToolContext = { userId: "u1", now: 0, lang: "vi" };

describe("evalExpr", () => {
  test.each([
    ["1 + 2 * 3", 7], // precedence
    ["(1 + 2) * 3", 9], // parens
    ["2 ^ 3 ^ 2", 512], // ^ is right-associative → 2^(3^2)
    ["-2 ^ 2", -4], // standard math: ^ binds tighter than unary minus → -(2^2)
    ["-3 ^ 2", -9],
    ["2 ^ -2", 0.25], // ...but a minus in the EXPONENT is unary on the exponent → 2^(-2)
    ["10 % 3", 1], // modulo
    ["-5 + 3", -2], // leading unary minus
    ["2 * -3", -6], // unary minus after an operator
    ["3.5 * 2", 7], // decimals
    ["-(2 + 3)", -5], // unary minus before a group
  ])("%s = %d", (expr, want) => {
    expect(evalExpr(expr)).toBe(want);
  });

  test.each([
    "1 / 0", // division by zero
    "5 % 0", // modulo by zero
    "1 +", // dangling operator
    "(1 + 2", // unbalanced paren
    "abc", // invalid token
    "", // empty
  ])("throws on %j", (expr) => {
    expect(() => evalExpr(expr)).toThrow();
  });
});

describe("util_calc tool", () => {
  test("metadata: read tool named util_calc, expr required", () => {
    expect(utilCalc.name).toBe("util_calc");
    expect(utilCalc.kind).toBe("read");
    expect((utilCalc.parameters as { required?: string[] }).required).toContain("expr");
  });

  test("valid expression → { expr, result }", async () => {
    const out = (await utilCalc.handler({ expr: " 12.5 * (3 + 1) " }, ctx)) as { expr: string; result: number };
    expect(out.result).toBe(50);
    expect(out.expr).toBe("12.5 * (3 + 1)");
  });

  test("invalid expression → { error } (no result)", async () => {
    const out = (await utilCalc.handler({ expr: "2 +" }, ctx)) as { error?: string; result?: number };
    expect(out.error).toBeTruthy();
    expect(out.result).toBeUndefined();
  });
});
