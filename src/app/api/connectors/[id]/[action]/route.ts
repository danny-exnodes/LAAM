import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { connect, disconnect, testConnector } from "@/lib/connectors";

// POST /api/connectors/:id/:action — connect / disconnect / test a connector
// for the logged-in user. The framework results are already secret-safe; we
// never echo the submitted credential fields back to the browser.
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; action: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const { id, action } = await params;

  switch (action) {
    case "connect": {
      const body = (await req.json().catch(() => ({}))) as {
        fields?: Record<string, string>;
      };
      return NextResponse.json(await connect(userId, id, body.fields ?? {}));
    }
    case "disconnect":
      return NextResponse.json(await disconnect(userId, id));
    case "test":
      return NextResponse.json(await testConnector(userId, id));
    default:
      return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  }
}
