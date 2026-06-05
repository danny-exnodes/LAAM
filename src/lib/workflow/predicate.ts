// G1: đánh giá Predicate (comparator + all/any) cho condition node. THUẦN, không
// eval/Function. Operand resolve qua resolveTemplate sink:"arg" (giữ type, fail-loud
// trên missing — TRỪ exists/not_exists, ops duy nhất missing là input hợp lệ → bắt
// throw, coi như not-exists). Xem plan Task 2.
import type { Predicate, Comparator, RunContext } from "./types";
import { resolveTemplate } from "./interpolate";

// Sentinel cho "đường dẫn missing" (phân biệt với giá trị undefined/null thật).
const MISSING = Symbol("missing");

// Resolve 1 operand. String chứa {{ → resolveTemplate(arg-sink, giữ type). Còn lại =
// literal. `tolerateMissing` (chỉ exists/not_exists): missing-path → MISSING thay vì throw.
function resolveOperand(v: unknown, ctx: RunContext, tolerateMissing: boolean): unknown {
  if (typeof v === "string" && v.includes("{{")) {
    try {
      return resolveTemplate(v, ctx, "arg");
    } catch (e) {
      if (tolerateMissing) return MISSING;
      throw e; // ops khác: fail-loud (AGENTS Rule 12)
    }
  }
  return v; // literal (number/boolean/array/object/string-không-template)
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== "object" || typeof b !== "object") return false;
  return JSON.stringify(a) === JSON.stringify(b); // mảng/đối tượng: so sánh sâu
}

function isComparator(p: Predicate): p is Comparator {
  return typeof (p as Comparator).op === "string";
}

export function evalPredicate(pred: Predicate, ctx: RunContext): boolean {
  if (!isComparator(pred)) {
    if ("all" in pred) return pred.all.every((p) => evalPredicate(p, ctx));
    return pred.any.some((p) => evalPredicate(p, ctx)); // "any" in pred
  }

  const op = pred.op;
  const existsOp = op === "exists" || op === "not_exists";
  const l = resolveOperand(pred.left, ctx, existsOp);

  switch (op) {
    case "exists":
      return l !== MISSING && l != null;
    case "not_exists":
      return l === MISSING || l == null;
  }

  // Ops còn lại cần right; resolve (fail-loud trên missing như left).
  const r = resolveOperand(pred.right, ctx, false);
  switch (op) {
    case "eq":
      return deepEq(l, r);
    case "ne":
      return !deepEq(l, r);
    case "gt":
      return (l as number | string) > (r as number | string);
    case "lt":
      return (l as number | string) < (r as number | string);
    case "gte":
      return (l as number | string) >= (r as number | string);
    case "lte":
      return (l as number | string) <= (r as number | string);
    case "contains":
      if (Array.isArray(l)) return l.some((x) => deepEq(x, r));
      return String(l).includes(String(r));
    case "not_contains":
      if (Array.isArray(l)) return !l.some((x) => deepEq(x, r));
      return !String(l).includes(String(r));
  }
  // op hết case → fail-loud (không nuốt op lạ).
  throw new Error(`predicate: op không hỗ trợ "${op as string}"`);
}
