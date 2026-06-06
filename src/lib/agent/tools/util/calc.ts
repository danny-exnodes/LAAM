import type { Tool } from "../../types";

// Deterministic arithmetic — NEVER eval()/Function(). Tokenize → shunting-yard → RPN.
// Supports + - * / % ^ and parentheses, decimals, and unary +/-. Rule 5: let code do
// the deterministic transform, not the LLM.

type Tok =
  | { t: "num"; v: number }
  | { t: "op"; v: string }
  | { t: "uop"; v: string }
  | { t: "lp" }
  | { t: "rp" };

const PREC: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2, "^": 3 };
const U_PREC = 4; // unary binds tighter than any binary op
const RIGHT = new Set(["^"]); // right-associative binary ops

export function tokenize(expr: string): Tok[] {
  const s = expr;
  const toks: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === " " || c === "\t") { i++; continue; }
    if ((c >= "0" && c <= "9") || c === ".") {
      let j = i;
      while (j < s.length && ((s[j] >= "0" && s[j] <= "9") || s[j] === ".")) j++;
      const num = Number(s.slice(i, j));
      if (!Number.isFinite(num)) throw new Error("số không hợp lệ: " + s.slice(i, j));
      toks.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (c === "(") { toks.push({ t: "lp" }); i++; continue; }
    if (c === ")") { toks.push({ t: "rp" }); i++; continue; }
    if (c in PREC) { toks.push({ t: "op", v: c }); i++; continue; }
    throw new Error("ký tự không hợp lệ: " + c);
  }
  return toks;
}

export function evalExpr(expr: string): number {
  const toks = tokenize(expr);
  if (!toks.length) throw new Error("biểu thức rỗng");

  const prec = (t: Tok) => (t.t === "uop" ? U_PREC : t.t === "op" ? PREC[t.v] : 0);
  const out: Tok[] = [];
  const ops: Tok[] = [];
  let prev: Tok | null = null;

  for (const raw of toks) {
    // A leading +/- — at the start, after another operator, or after '(' — is unary.
    const tok: Tok =
      raw.t === "op" && (raw.v === "-" || raw.v === "+") &&
      (!prev || prev.t === "op" || prev.t === "uop" || prev.t === "lp")
        ? { t: "uop", v: raw.v }
        : raw;

    if (tok.t === "num") {
      out.push(tok);
    } else if (tok.t === "uop") {
      ops.push(tok); // right-assoc + highest → nothing to pop first
    } else if (tok.t === "op") {
      while (ops.length) {
        const top = ops[ops.length - 1];
        if (top.t !== "op" && top.t !== "uop") break;
        const higher = prec(top) > prec(tok) || (prec(top) === prec(tok) && !RIGHT.has(tok.v));
        if (!higher) break;
        out.push(ops.pop()!);
      }
      ops.push(tok);
    } else if (tok.t === "lp") {
      ops.push(tok);
    } else {
      while (ops.length && ops[ops.length - 1].t !== "lp") out.push(ops.pop()!);
      if (!ops.length) throw new Error("thiếu dấu (");
      ops.pop(); // discard the '('
    }
    prev = tok;
  }
  while (ops.length) {
    const o = ops.pop()!;
    if (o.t === "lp") throw new Error("thiếu dấu )");
    out.push(o);
  }

  const st: number[] = [];
  for (const tok of out) {
    if (tok.t === "num") {
      st.push(tok.v);
    } else if (tok.t === "uop") {
      const a = st.pop();
      if (a === undefined) throw new Error("biểu thức không hợp lệ");
      st.push(tok.v === "-" ? -a : a);
    } else if (tok.t === "op") {
      const b = st.pop();
      const a = st.pop();
      if (a === undefined || b === undefined) throw new Error("biểu thức không hợp lệ");
      st.push(apply(tok.v, a, b));
    }
  }
  if (st.length !== 1) throw new Error("biểu thức không hợp lệ");
  if (!Number.isFinite(st[0])) throw new Error("kết quả không hữu hạn");
  return st[0];
}

function apply(op: string, a: number, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": if (b === 0) throw new Error("chia cho 0"); return a / b;
    case "%": if (b === 0) throw new Error("chia cho 0"); return a % b;
    case "^": return Math.pow(a, b);
    default: throw new Error("toán tử lạ: " + op);
  }
}

export const utilCalc: Tool = {
  name: "util_calc",
  description:
    "Tính một biểu thức số học chính xác: + - * / % ^ và ngoặc (vd '12.5 * (3 + 4) ^ 2'). " +
    "Dùng công cụ này thay vì tự nhẩm để tránh sai số.",
  kind: "read",
  parameters: {
    type: "object",
    properties: { expr: { type: "string", description: "biểu thức số học cần tính" } },
    required: ["expr"],
  },
  async handler(args) {
    const expr = String(args.expr ?? "").trim();
    try {
      return { expr, result: evalExpr(expr) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
};
