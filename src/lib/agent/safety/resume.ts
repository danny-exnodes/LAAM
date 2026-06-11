// Turn-2 resume after the user confirms a pending write. Executes the SIGNED
// write exactly once in code (never re-asks the model — Rule 13), then builds a
// synthetic conversation for a final TEXT-ONLY completion that reports the
// result. Turn-1 reads are intentionally dropped (they only served to propose the
// write). Double-execute is structurally impossible: a single direct dispatch +
// a tools-less request (no loop). (Spec §6.3.)
import type { ChatMessage } from "../orchestrator";
import type { PendingWrite } from "./token";

// history already ends with the persisted proposal assistant message (never empty
// — see route suspend). We append the executed write as an assistant tool_call +
// its tool result so the model, given NO tools, just narrates the outcome.
export function buildResumeMessages(
  system: string,
  history: ChatMessage[],
  signed: PendingWrite,
  result: unknown,
): ChatMessage[] {
  return [
    { role: "system", content: system },
    ...history,
    {
      role: "assistant",
      content: "",
      tool_calls: [{ function: { name: signed.name, arguments: signed.args } }],
    },
    // Nhãn [Kết quả <tool>] thay vì JSON trần: model (nhất là Claude — role:"tool"
    // bị adapter map thành user text) biết blob này là gì để tường thuật đúng.
    // JSON.stringify(undefined) là undefined → guard "null" (không rò content rỗng).
    { role: "tool", content: `[Kết quả ${signed.name}]: ${JSON.stringify(result) ?? "null"}` },
  ];
}

// The resume final request carries NO tools field → structurally cannot dispatch
// another tool_call (text-only). Mirrors the normal stream payload otherwise.
export function buildResumeRequest(model: string, messages: ChatMessage[], options: Record<string, unknown>) {
  return { model, messages, options, stream: true as const };
}

export type ResumeDeps = {
  dispatch: (name: string, args: Record<string, unknown>) => Promise<unknown>; // withSafety + confirmedAction
  isNonceUsed: (nonce: string) => Promise<boolean>;
  recordWrite: (x: { nonce: string; tool: string; args: Record<string, unknown> }) => Promise<void>;
};

export type ResumeOutcome =
  | { status: "rejected"; reason: string }
  | { status: "cancelled" }
  | { status: "executed"; messages: ChatMessage[]; result: unknown };

export async function runResume(
  signed: PendingWrite,
  approve: boolean,
  system: string,
  history: ChatMessage[],
  deps: ResumeDeps,
): Promise<ResumeOutcome> {
  if (!approve) return { status: "cancelled" };
  if (await deps.isNonceUsed(signed.nonce)) return { status: "rejected", reason: "hành động đã được xử lý" };
  const result = await deps.dispatch(signed.name, signed.args);
  await deps.recordWrite({ nonce: signed.nonce, tool: signed.name, args: signed.args });
  return { status: "executed", messages: buildResumeMessages(system, history, signed, result), result };
}
