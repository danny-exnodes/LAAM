import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/db";
import { searchAll } from "@/lib/search";

// GET /api/search?q= — global search across agent sessions (org-shared),
// the caller's chat conversations and the caller's workflows. Session-protected
// (NOT in auth.config isPublic); scoping happens in lib/search.searchAll.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const results = await searchAll(db, q, session.user.id);
  return NextResponse.json(results);
}
