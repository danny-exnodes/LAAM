import { NextResponse } from "next/server";
import { auth } from "@/auth";

// GET /api/chat/info — the default chat model the UI should preselect.
// Ported from v1 (bin/laam.js); model comes from the same env as /api/chat.

const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ model: MODEL });
}
