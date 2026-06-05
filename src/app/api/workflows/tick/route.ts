import { NextResponse } from "next/server";
import { db } from "@/db";
import { publish } from "@/lib/events-bus";
import { tickClaim, tickExecute } from "@/lib/workflow/schedule";
import { buildRunNode } from "@/lib/workflow/runtime";
import { isTickAuthorized } from "@/lib/workflow/tick-auth";

// POST /api/workflows/tick — máy gọi (Windows Task poke mỗi phút). KHÔNG session:
// auth = localhost HOẶC x-workflow-tick-secret === WORKFLOW_TICK_SECRET. Claim
// (atomic) các schedule due rồi execute các run queued. now = giờ server.
export async function POST(req: Request) {
  if (!isTickAuthorized(req.headers, { WORKFLOW_TICK_SECRET: process.env.WORKFLOW_TICK_SECRET })) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const now = new Date();
  const claimed = await tickClaim(db, now);
  // Execute SAU claim (pha tách rời, PIN-D1): chạy run queued (gồm vừa claim).
  const executed = await tickExecute(db, { db, publish, buildRunNode });
  return NextResponse.json({ ok: true, claimed: claimed.length, executed });
}
