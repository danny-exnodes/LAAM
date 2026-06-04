import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { list } from "@/lib/connectors";

// GET /api/connectors — list connectors for the logged-in user (masked creds
// only; never raw secrets). Any logged-in user.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ connectors: await list(session.user.id) });
}
