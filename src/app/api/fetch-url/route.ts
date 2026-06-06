import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { fetchReadable, isBlockedHost } from "@/lib/web/readable";

// Fetch a USER-SUPPLIED URL server-side and return its text, so the chat UI can read
// web pages. SSRF-guarded: only public http(s) hosts. The fetch/extract logic now
// lives in @/lib/web/readable (shared with the web_read harness tool). Re-export
// isBlockedHost so it stays unit-testable from the route.
export { isBlockedHost };

const MAX_TEXT = 12000; // UI cap (a human reads this); the web_read tool caps lower.

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as { url?: string } | null;
  const r = await fetchReadable(String(body?.url ?? ""), { maxText: MAX_TEXT });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json(r.data);
}
