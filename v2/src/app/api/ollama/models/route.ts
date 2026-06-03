import { NextResponse } from "next/server";
import { auth } from "@/auth";

// List the models Ollama has available (powers the chat model dropdown).
// Ported from v1 (bin/laam.js) but talks to Ollama directly via OLLAMA_URL
// rather than the v1 logging proxy. Returns model NAMES; fails soft with 502.

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`);
    const data = (await r.json()) as { models?: Array<{ name?: string }> };
    const models = Array.isArray(data?.models)
      ? data.models.map((m) => m?.name).filter((n): n is string => typeof n === "string")
      : [];
    return NextResponse.json({ models });
  } catch (e) {
    return NextResponse.json(
      { error: "Không lấy được danh sách mô hình: " + (e instanceof Error ? e.message : String(e)) },
      { status: 502 },
    );
  }
}
