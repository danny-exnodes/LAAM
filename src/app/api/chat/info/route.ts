import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { CLAUDE_MODELS } from "@/lib/llm/claude";
import { BYTEPLUS_MODELS } from "@/lib/llm/byteplus";

// GET /api/chat/info — the default chat model the UI should preselect.
// Ported from v1 (bin/laam.js); model comes from the same env as /api/chat.
// C1: + `claudeModels` — whitelist Claude cho model picker, CHỈ khi server có
// ANTHROPIC_API_KEY (đọc lúc request, không lúc import — testable & restart-free).
// + `byteplusModels` — same env-gated pattern, present only when BYTEPLUS_API_KEY set.

const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    model: MODEL,
    claudeModels: process.env.ANTHROPIC_API_KEY ? [...CLAUDE_MODELS] : [],
    byteplusModels: process.env.BYTEPLUS_API_KEY ? [...BYTEPLUS_MODELS] : [],
  });
}
