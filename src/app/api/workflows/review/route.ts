import { auth } from "@/auth";
import { list } from "@/lib/connectors";
import { buildCatalog } from "@/lib/workflow/generate";
import { callOllamaChat } from "@/lib/workflow/ollama";
import type { ChatMessage } from "@/lib/agent/orchestrator";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// POST /api/workflows/review — { graph } → a plain-language review of the CURRENT editor
// graph (summary / issues / suggestions). Read-only; reuses the connector catalog + the
// chat model. Part of #3's "review" vision (the editor sends its unsaved working graph).
export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user?.id) return json({ error: "Unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { graph?: unknown };
  if (!body.graph || typeof body.graph !== "object") return json({ error: "thiếu graph" }, 400);

  const connectors = await list(session.user.id);
  const messages: ChatMessage[] = [
    {
      role: "system",
      content:
        "Bạn là chuyên gia tự động hoá workflow. Người dùng gửi một workflow dạng JSON " +
        "(nodes: agent/connector/condition/foreach; edges). Đánh giá NGẮN GỌN bằng tiếng Việt, " +
        "markdown, gồm đúng 3 mục: **Tóm tắt** (flow làm gì, 1–2 câu), **Vấn đề** (rủi ro/thiếu sót — " +
        "vd connector chưa kết nối, biến {{...}} tham chiếu sai, nhánh condition thiếu true/false), " +
        "**Gợi ý** (cải thiện cụ thể). KHÔNG bịa connector/tool ngoài danh sách dưới đây.\n\n" +
        "Connectors có sẵn:\n" +
        buildCatalog(connectors),
    },
    { role: "user", content: "```json\n" + JSON.stringify(body.graph) + "\n```" },
  ];

  try {
    const res = await callOllamaChat(messages, []);
    const review = res.message?.content?.trim() ?? "";
    if (!review) return json({ error: "Model không trả về nội dung" }, 502);
    return json({ review });
  } catch {
    return json({ error: "Không gọi được model cục bộ" }, 502);
  }
}
