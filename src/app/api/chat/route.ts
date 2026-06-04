import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { chatTools, execute } from "@/lib/connectors";
import type { ConnectorTool } from "@/lib/connectors/types";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const SYSTEM =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích. " +
  "Dùng tiếng Việt khi người dùng dùng tiếng Việt.";

type ChatBody = {
  conversationId?: string;
  message?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  system?: string;
};
type ChatMessage = { role: string; content: string; tool_calls?: unknown[] };

// Build the Ollama /api/chat request payload from the request body, the
// conversation history, and the server defaults. Pure — no I/O — so the
// option mapping (temperature/top_p, model + system overrides, defaults) is
// unit-testable without a live Ollama. Absent numeric options are omitted so
// Ollama keeps its own defaults rather than receiving NaN/undefined.
export function buildOllamaPayload(
  body: ChatBody,
  historyMessages: ChatMessage[],
  defaults: { model: string; system: string },
) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const model = str(body.model) ?? defaults.model;
  const system = str(body.system) ?? defaults.system;

  const options: { temperature?: number; top_p?: number } = {};
  const t = num(body.temperature);
  if (t !== null) options.temperature = t;
  const p = num(body.topP);
  if (p !== null) options.top_p = p;

  return {
    model,
    messages: [{ role: "system", content: system }, ...historyMessages],
    options,
    stream: true as const,
  };
}

// --- Connector tool-calling loop -------------------------------------------
// When the user has connectors connected, the model may want to call their
// tools before answering. We run bounded NON-streaming rounds: ask Ollama with
// the tools exposed; if it returns tool_calls, run each via execute() and feed
// the results back; repeat. The returned message list is what the final
// (streaming) request sends. Factored out + dependency-injected so the round
// logic is unit-testable without a live Ollama or real connectors.

type OllamaToolCall = { function?: { name?: string; arguments?: unknown } };
type OllamaChatMessage = { role?: string; content?: string; tool_calls?: OllamaToolCall[] };
type OllamaChatResponse = { message?: OllamaChatMessage };

type ToolRoundsDeps = {
  // Non-streaming Ollama /api/chat call. `tools` is empty on the final round
  // (forces a text answer instead of another tool_call).
  callOllama: (messages: ChatMessage[], tools: ConnectorTool[]) => Promise<OllamaChatResponse>;
  execute: (toolName: string, args: unknown) => Promise<unknown>;
};

export async function runToolRounds(
  messages: ChatMessage[],
  tools: ConnectorTool[],
  deps: ToolRoundsDeps,
  maxRounds = 4,
): Promise<ChatMessage[]> {
  const convo: ChatMessage[] = messages.slice();
  for (let i = 0; i < maxRounds; i++) {
    const allowTools = i < maxRounds - 1; // last round must yield text
    const res = await deps.callOllama(convo, allowTools ? tools : []);
    const msg = res?.message ?? {};
    const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    if (allowTools && calls.length) {
      // Echo the assistant's tool_calls turn, then each tool result.
      convo.push({ role: "assistant", content: msg.content ?? "", tool_calls: calls });
      for (const tc of calls) {
        const name = tc.function?.name ?? "";
        const result = await deps.execute(name, tc.function?.arguments);
        convo.push({ role: "tool", content: JSON.stringify(result) });
      }
      continue;
    }
    break; // no tool_calls (or final round) → done
  }
  return convo;
}

// POST /api/chat — { conversationId?, message }. Streams the Gemma 4 reply
// (plain text tokens) and persists both the user + assistant messages.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const userId = session.user.id;

  const body = ((await req.json().catch(() => null)) ?? {}) as ChatBody;
  const message = (body.message ?? "").toString().trim();
  if (!message) {
    return new Response(JSON.stringify({ error: "Empty message" }), { status: 400 });
  }
  const model = typeof body.model === "string" && body.model.trim() ? body.model : MODEL;

  // Resolve or create the conversation (must belong to the user).
  let conversationId = body.conversationId;
  if (conversationId) {
    const rows = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!rows[0] || rows[0].userId !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
  } else {
    conversationId = crypto.randomUUID();
    await db.insert(chatConversations).values({
      id: conversationId,
      userId,
      title: message.slice(0, 60),
      model,
    });
  }
  const convId = conversationId;

  await db.insert(chatMessages).values({ conversationId: convId, role: "user", content: message });

  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(asc(chatMessages.createdAt));
  const payload = buildOllamaPayload(
    body,
    history.map((m) => ({ role: m.role, content: m.content })),
    { model: MODEL, system: SYSTEM },
  );

  // If the user has connectors connected, let the model call their tools first
  // (bounded, non-streaming rounds), then stream the final answer below with
  // the tool-augmented history. With no connectors this is skipped entirely —
  // the streaming + persistence path stays byte-for-byte identical.
  let tools: ConnectorTool[] = [];
  try {
    tools = await chatTools(userId);
  } catch {
    tools = []; // connector framework unavailable → behave as no-connector
  }
  if (tools.length) {
    const callOllama = async (
      messages: ChatMessage[],
      roundTools: ConnectorTool[],
    ): Promise<OllamaChatResponse> => {
      const r = await fetch(`${OLLAMA_URL}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: payload.model,
          messages,
          ...(roundTools.length ? { tools: roundTools } : {}),
          options: payload.options,
          stream: false,
        }),
      });
      if (!r.ok) throw new Error(`Ollama ${r.status}`);
      return (await r.json()) as OllamaChatResponse;
    };
    try {
      payload.messages = await runToolRounds(payload.messages, tools, {
        callOllama,
        execute: (name, args) => execute(userId, name, args),
      });
    } catch {
      // Tool loop failed (Ollama/connector error) — fall through and stream
      // a normal answer from the original payload rather than hard-failing.
    }
  }

  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    return new Response(
      `Không kết nối được Ollama (${OLLAMA_URL}). Đảm bảo Ollama đang chạy và đã 'ollama pull ${model}'.`,
      { status: 502, headers: { "x-conversation-id": convId } },
    );
  }
  if (!ollamaRes.ok || !ollamaRes.body) {
    const t = await ollamaRes.text().catch(() => "");
    return new Response(`Ollama lỗi ${ollamaRes.status}: ${t.slice(0, 200)}`, {
      status: 502,
      headers: { "x-conversation-id": convId },
    });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      let full = "";
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const t = line.trim();
            if (!t) continue;
            try {
              const j = JSON.parse(t);
              const tok = j?.message?.content ?? "";
              if (tok) {
                full += tok;
                controller.enqueue(encoder.encode(tok));
              }
            } catch {
              /* skip partial line */
            }
          }
        }
      } finally {
        if (full) {
          await db
            .insert(chatMessages)
            .values({ conversationId: convId, role: "assistant", content: full });
        }
        await db
          .update(chatConversations)
          .set({ updatedAt: new Date() })
          .where(eq(chatConversations.id, convId));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-conversation-id": convId,
      "cache-control": "no-cache",
    },
  });
}
