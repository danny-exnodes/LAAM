import { auth } from "@/auth";
import { TEMPLATES } from "@/lib/workflow/templates";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const list = TEMPLATES.map(({ id, name, description, moatLeaning }) => ({
    id,
    name,
    description,
    moatLeaning,
  }));

  return new Response(JSON.stringify(list), { headers: { "content-type": "application/json" } });
}
