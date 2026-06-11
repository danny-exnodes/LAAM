import { NextResponse } from "next/server";
import { auth } from "@/auth";

// GET /api/config — client-relevant runtime config (port of the v1 /api/config
// handler). Session-protected; the shape is a flat object so future keys can
// be added without breaking consumers. Currently only `stuckMin`: the stuck
// threshold in minutes, from LAAM_STUCK_MIN (default 10, clamped to 1..120).

const DEFAULT_STUCK_MIN = 10;
const MIN_STUCK_MIN = 1;
const MAX_STUCK_MIN = 120;

// Parse a raw LAAM_STUCK_MIN value; non-numeric/empty → default, out-of-range → clamped.
export function readStuckMin(raw: string | undefined = process.env.LAAM_STUCK_MIN): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return DEFAULT_STUCK_MIN;
  return Math.min(MAX_STUCK_MIN, Math.max(MIN_STUCK_MIN, n));
}

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ stuckMin: readStuckMin() });
}
