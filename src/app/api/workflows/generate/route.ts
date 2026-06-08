import { auth } from "@/auth";
import { list } from "@/lib/connectors";
import { assertRunnable } from "@/lib/workflow/validate";
import { buildCatalog, generationSystem, coerceGraph, GRAPH_FORMAT, buildUserMessage } from "@/lib/workflow/generate";
import { callOllamaGenerate } from "@/lib/workflow/ollama";
import type { ChatMessage } from "@/lib/agent/orchestrator";

const MAX_PROMPT = 2000;
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// POST /api/workflows/generate — { prompt } → a proposed WorkflowGraph (NOT persisted;
// the editor loads it as an undoable proposal). Generation: Ollama structured output →
// coerceGraph → assertRunnable, with ONE self-repair retry. Never returns an invalid
// graph (Rule 13: the model proposes, code disposes).
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { prompt?: string; current?: unknown };
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return json({ error: "prompt rỗng" }, 400);
  if (prompt.length > MAX_PROMPT) return json({ error: "prompt quá dài" }, 400);

  const connectors = await list(session.user.id);
  const messages: ChatMessage[] = [
    { role: "system", content: generationSystem(buildCatalog(connectors)) },
    // refine (#3 stretch): when `current` is a non-empty graph, this becomes an edit instruction
    { role: "user", content: buildUserMessage(prompt, body.current) },
  ];

  let lastErr = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    let content: string;
    try {
      content = await callOllamaGenerate(messages, GRAPH_FORMAT);
    } catch {
      return json({ error: "Không gọi được model cục bộ" }, 502);
    }
    try {
      const graph = coerceGraph(JSON.parse(content));
      assertRunnable(graph);
      return json({ graph });
    } catch (e) {
      lastErr = e instanceof Error ? e.message : "invalid";
      // Self-repair: feed the validation error back once and let the model fix it.
      messages.push({ role: "assistant", content });
      messages.push({ role: "user", content: `Graph vừa rồi không hợp lệ: ${lastErr}. Sửa lại và CHỈ trả JSON.` });
    }
  }
  return json({ error: "Chưa tạo được flow hợp lệ — thử mô tả rõ hơn", detail: lastErr }, 422);
}
