import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CLAUDE_MODELS } from "@/lib/llm/claude";
import { BYTEPLUS_MODELS } from "@/lib/llm/byteplus";
import { CEREBRAS_MODELS } from "@/lib/llm/cerebras";

// GET /api/chat/info — the default chat model the UI should preselect.
// Ported from v1 (bin/laam.js); model comes from the same env as /api/chat.
// C1: + `claudeModels` — whitelist Claude cho model picker, CHỈ khi server có
// ANTHROPIC_API_KEY (đọc lúc request, không lúc import — testable & restart-free).
// + `byteplusModels` — same env-gated pattern, present only when BYTEPLUS_API_KEY set.
// + `cerebrasModels` — same env-gated pattern, present only when CEREBRAS_API_KEY set.

// Cloud-first default, mirroring the internal-model router (src/lib/llm/internal.ts):
// when the server holds a BYTEPLUS_API_KEY the picker preselects the default BytePlus
// model instead of the local Ollama one; a CEREBRAS_API_KEY (without BytePlus) does the
// same for Cerebras. A deployment with NO cloud key keeps the free local default exactly
// as before. Read at request time (like the key gating below) so it is testable and
// restart-free.
// Tradeoff: a cloud key wins over DEFAULT_CHAT_MODEL, so an operator cannot keep a cloud
// picker while forcing a local default — unset the key for a local-only chat.
function defaultChatModel(): string {
  if (process.env.BYTEPLUS_API_KEY) return BYTEPLUS_MODELS[0];
  if (process.env.CEREBRAS_API_KEY) return CEREBRAS_MODELS[0];
  return process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    model: defaultChatModel(),
    claudeModels: process.env.ANTHROPIC_API_KEY ? [...CLAUDE_MODELS] : [],
    byteplusModels: process.env.BYTEPLUS_API_KEY ? [...BYTEPLUS_MODELS] : [],
    cerebrasModels: process.env.CEREBRAS_API_KEY ? [...CEREBRAS_MODELS] : [],
  });
}
