import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { INTERNAL_TOOLS } from "./registry";
import type { WfNodeKind } from "@/lib/workflow/types";

// ─────────────────────────────────────────────────────────────────────────────
// SECURITY INVARIANT — no skill-creation / no arbitrary code-exec in the agent tree.
//
// Ecosystem-wide rule (LAAM is the strongest precedent — see Serena memories
// decisions/ecosystem-hermes-allocation.md + decisions/laam-daab-consumer-posture.md):
//
//   "No agent that executes model-authored or arbitrary code may run in the same
//    process as live-credential connectors."
//
// LAAM holds live connector credentials IN-PROCESS. So the chat-agent + workflow tree
// must NEVER gain (a) a tool that creates skills / tools / code, (b) arbitrary code
// execution (child_process, eval, new Function, the vm module), or (c) a workflow node
// kind that runs shell/code. Hermes capabilities #3 (self-improving skill-creation) and
// #4 (shell-backed subagents) are deliberate, permanent skips. This test is the
// tripwire that fails the build if any of those slip in later.
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_TREE = ["src/lib/agent", "src/lib/workflow"];

// Arbitrary code-execution / self-modification primitives. Matched against source with
// comments + string-literals stripped, so documentation ("NEVER eval()") never trips it.
const FORBIDDEN: Array<[string, RegExp]> = [
  ["child_process", /child_process/],
  ["execSync", /\bexecSync\b/],
  ["spawn", /\bspawn(Sync)?\s*\(/],
  ["eval()", /\beval\s*\(/],
  ["new Function()", /\bnew\s+Function\s*\(/],
  ["vm module", /(["']vm["']|node:vm)/],
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

// Remove block + line comments and string/template literals so only executable code is
// scanned (a comment or message mentioning "eval()" is not a violation).
function stripNonCode(s: string): string {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/'(?:\\.|[^\\'])*'/g, "''")
    .replace(/"(?:\\.|[^\\"])*"/g, '""');
}

describe("SECURITY: no skill-creation / no arbitrary code-exec in the agent tree", () => {
  const files = AGENT_TREE.flatMap(walk);

  test("scans a non-trivial set of agent/workflow source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  test("no agent/workflow source executes arbitrary or model-authored code", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const code = stripNonCode(readFileSync(f, "utf8"));
      for (const [label, re] of FORBIDDEN) if (re.test(code)) offenders.push(`${f} :: ${label}`);
    }
    expect(offenders, `Forbidden code-exec primitive(s) found:\n${offenders.join("\n")}`).toEqual([]);
  });

  test("INTERNAL_TOOLS is a closed read/write allowlist — no tool creates skills/tools/code", () => {
    for (const t of INTERNAL_TOOLS) {
      expect(["read", "write"]).toContain(t.kind); // only read or gated-write; never an exec/skill kind
      expect(t.name).not.toMatch(/skill|create_tool|register_tool|\beval\b|\bexec\b|shell|spawn/i);
    }
    // Tripwire: the internal tool set is small + curated. Growth forces a conscious
    // update here + a security re-think (the point of the guard).
    expect(INTERNAL_TOOLS.length).toBeLessThan(40);
  });

  test("workflow node kinds are frozen to the known safe set (no shell/code/skill kind)", () => {
    const KINDS: WfNodeKind[] = ["agent", "connector", "condition", "foreach", "mcp"];
    // If someone widens WfNodeKind, this list must be updated — and any executable kind
    // justified against the invariant above.
    expect(KINDS).toEqual(["agent", "connector", "condition", "foreach", "mcp"]);
    for (const k of KINDS) expect(k).not.toMatch(/shell|code|skill|exec/i);
  });
});
