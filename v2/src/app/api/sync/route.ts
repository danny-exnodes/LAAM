import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { publish } from "@/lib/events-bus";
import { syncLocalMonitoring } from "@/lib/sync";

// POST /api/sync — scan local transcripts → Postgres. Auth required.
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await syncLocalMonitoring();
    // Fan the change out to open SSE clients so /agents refreshes live.
    publish({ type: "sync" });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 },
    );
  }
}
