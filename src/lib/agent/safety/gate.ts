// L4 write-gate: a composable wrapper around SP-1's dispatch. Read / confirmed
// writes pass through, then get redacted + bounded (closing the SP-1 gap where
// connector results skip guard()/boundOutput). An unconfirmed write THROWS
// PendingWriteSignal, which propagates through runToolRounds (it calls dispatch
// with no try/catch) up to the route, which suspends the turn. Zero change to
// SP-1 contracts. (Spec §4.)
import type { Tool } from "../types";
import { boundOutput } from "../guardrails";
import { resolveKind } from "./policy";
import { redact } from "./redact";

export class PendingWriteSignal extends Error {
  readonly tool: string;
  readonly args: Record<string, unknown>;
  constructor(tool: string, args: Record<string, unknown>) {
    super(`pending write: ${tool}`);
    this.name = "PendingWriteSignal";
    this.tool = tool;
    this.args = args;
  }
}

function parseArgs(args: unknown): Record<string, unknown> {
  let a: unknown = args;
  if (typeof a === "string") {
    try {
      a = JSON.parse(a);
    } catch {
      a = {};
    }
  }
  return (a ?? {}) as Record<string, unknown>;
}

export type SafetyOptions = {
  internal: Tool[];
  // one-shot allowance used only by resume; matched by NAME (resume supplies the
  // exact signed args, so name-match is sufficient and avoids deep-equality risk).
  confirmedAction?: { name: string; args: Record<string, unknown> };
  // Per-user opt-in: MCP tool names trusted as read (skip the write gate). Computed
  // by the chat route from the user's MCP servers; absent everywhere else → MCP
  // tools fail-closed to write (gated).
  readAllow?: ReadonlySet<string>;
  // Per-result output bound (chars) fed to boundOutput — provider-aware. A large-context
  // cloud model (BytePlus/Claude) admits a whole master record intact; a 16k local model
  // keeps the tight default. Absent → boundOutput's own default (local-sized).
  maxBytes?: number;
};

export function withSafety(
  inner: (name: string, args: unknown) => Promise<unknown>,
  opts: SafetyOptions,
): (name: string, args: unknown) => Promise<unknown> {
  return async (name, args) => {
    const kind = resolveKind(name, opts.internal, opts.readAllow);
    const confirmed = opts.confirmedAction?.name === name;
    if (kind === "write" && !confirmed) {
      throw new PendingWriteSignal(name, parseArgs(args));
    }
    const result = await inner(name, args);
    return redact(boundOutput(result, opts.maxBytes));
  };
}
