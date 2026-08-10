// Cloud-first internal-model router.
//
// "Internal" LLM tasks have NO user-facing model picker: the chat history summarizer
// (SP-3), workflow agent nodes, and the AI workflow authoring helpers (generate /
// review). They were hard-pinned to the local Ollama model (`DEFAULT_CHAT_MODEL`).
// After the cloud pivot (local Qwen shut off, chat moved to BytePlus) that pin broke
// them silently: every long chat stopped summarizing (fail-soft) and every agent-step
// workflow hard-broke on `Ollama <status>`.
//
// This module resolves ONE internal model and dispatches the call to the right
// provider, so these paths work whichever model is configured. Resolution priority:
//   1. INTERNAL_MODEL env   — explicit operator override (force any provider/model)
//   2. BYTEPLUS_API_KEY set — cloud-first: use the default BytePlus model
//   3. CEREBRAS_API_KEY set — cloud-first: use the default Cerebras model
//   4. ANTHROPIC_API_KEY set — fall back to Claude (text-only paths only)
//   5. DEFAULT_CHAT_MODEL   — local Ollama ($0); the unchanged local-only path
//
// A local-only deployment (no cloud key) therefore keeps the free local path exactly
// as before; a deployment with a cloud key gets cloud-first internal ops for free.
// BytePlus keeps precedence over Cerebras (unchanged default for existing deployments
// that already set both) — an operator wanting Cerebras preferred sets INTERNAL_MODEL.
import type { ChatMessage, OllamaChatResponse } from "@/lib/agent/orchestrator";
import { BYTEPLUS_MODELS, isBytePlusModel, byteplusChat } from "./byteplus";
import { CEREBRAS_MODELS, isCerebrasModel, cerebrasChat } from "./cerebras";
import { CLAUDE_MODELS, isClaudeModel, claudeStream } from "./claude";
import { ollamaChat } from "./ollama";

const DEFAULT_LOCAL = "qwen3-vl:8b-instruct-q8_0";

/** Resolve the single model used for background/internal LLM tasks (see file header). */
export function resolveInternalModel(): string {
  const explicit = process.env.INTERNAL_MODEL?.trim();
  if (explicit) return explicit;
  if (process.env.BYTEPLUS_API_KEY) return BYTEPLUS_MODELS[0];
  if (process.env.CEREBRAS_API_KEY) return CEREBRAS_MODELS[0];
  if (process.env.ANTHROPIC_API_KEY) return CLAUDE_MODELS[0];
  return process.env.DEFAULT_CHAT_MODEL ?? DEFAULT_LOCAL;
}

// Collect a streaming provider (Claude) into a single string — internal callers want
// the whole completion, not a stream.
async function collect(gen: AsyncGenerator<{ delta?: string }>): Promise<string> {
  let out = "";
  for await (const ev of gen) if (ev.delta) out += ev.delta;
  return out;
}

/**
 * One NON-streaming completion with NO tools — summaries and AI authoring.
 * Provider-aware. Defaults to {@link resolveInternalModel}.
 */
export async function callModelText(prompt: string, model: string = resolveInternalModel()): Promise<string> {
  const messages: ChatMessage[] = [{ role: "user", content: prompt }];
  if (isBytePlusModel(model)) {
    const res = await byteplusChat({ model, messages });
    return res.message?.content ?? "";
  }
  if (isCerebrasModel(model)) {
    const res = await cerebrasChat({ model, messages });
    return res.message?.content ?? "";
  }
  if (isClaudeModel(model)) {
    return collect(claudeStream({ model, messages }));
  }
  const res = await ollamaChat({ model, messages });
  return res.message?.content ?? "";
}

/**
 * One NON-streaming completion WITH tools — workflow agent rounds + the final text
 * round. Returns the Ollama-shaped response so `runToolRounds` / `extractToolTurns`
 * consume it unchanged across providers.
 *
 * Claude is a deliberate no-tool MVS provider and cannot drive tool steps → fail loud
 * with operator guidance (never silently degrade a workflow run).
 *
 * `format` (Ollama JSON-schema) is forwarded only to the local path; BytePlus
 * structured output is provider-quirky and the agent node already self-repairs invalid
 * JSON, so it is best-effort there.
 */
export async function callModelChat(
  messages: ChatMessage[],
  tools: unknown[],
  format?: object,
  model: string = resolveInternalModel(),
): Promise<OllamaChatResponse> {
  if (isBytePlusModel(model)) {
    return byteplusChat({ model, messages, tools });
  }
  if (isCerebrasModel(model)) {
    return cerebrasChat({ model, messages, tools });
  }
  if (isClaudeModel(model)) {
    throw new Error(
      `INTERNAL_MODEL=${model}: Claude is a no-tool provider and cannot run workflow/agent tool steps. ` +
        `Set INTERNAL_MODEL to a BytePlus, Cerebras, or local model for internal/workflow operations.`,
    );
  }
  return ollamaChat({ model, messages, tools, format });
}

/**
 * Structured one-shot for AI workflow authoring (`generate`). Returns the raw JSON
 * string from the model; the caller parses → coerceGraph → assertRunnable.
 */
export async function callModelGenerate(
  messages: ChatMessage[],
  format: object,
  model: string = resolveInternalModel(),
): Promise<string> {
  if (isBytePlusModel(model)) {
    const res = await byteplusChat({ model, messages });
    return res.message?.content ?? "";
  }
  if (isCerebrasModel(model)) {
    const res = await cerebrasChat({ model, messages });
    return res.message?.content ?? "";
  }
  if (isClaudeModel(model)) {
    return collect(claudeStream({ model, messages }));
  }
  const res = await ollamaChat({ model, messages, format, temperature: 0.2 });
  return res.message?.content ?? "";
}
