import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages } from "@/db/schema";
import { chatTools } from "@/lib/connectors";
import { buildSystemPrompt } from "@/lib/agent/context";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { runToolRounds, type ChatMessage, type OllamaChatResponse } from "@/lib/agent/orchestrator";
import { withSafety, PendingWriteSignal } from "@/lib/agent/safety/gate";
import { sealPendingWrite, openPendingWrite } from "@/lib/agent/safety/token";
import { buildPreview } from "@/lib/agent/safety/preview";
import { runResume, buildResumeRequest } from "@/lib/agent/safety/resume";
import { recordWrite, isNonceUsed } from "@/lib/agent/safety/audit";
import { encodeFrame, SEP, type ChatFrame } from "@/lib/chat/frames";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const SYSTEM =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích. " +
  "Dùng tiếng Việt khi người dùng dùng tiếng Việt.";
const PENDING_TTL_MS = 5 * 60_000; // §5: pending-write token expiry

type ChatBody = {
  conversationId?: string;
  message?: string;
  model?: string;
  temperature?: number;
  topP?: number;
  system?: string;
};
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

// Đọc ngôn ngữ từ cookie laam_lang (i18n) — không phụ thuộc API next/headers async.
function readLang(req: Request): string {
  const m = (req.headers.get("cookie") ?? "").match(/(?:^|;\s*)laam_lang=([^;]+)/);
  const v = m ? decodeURIComponent(m[1]) : "vi";
  return ["vi", "en", "zh"].includes(v) ? v : "vi";
}

// Discriminate the union request body: { message } | { confirm:{token,approve} }.
export function isConfirmBody(body: unknown): body is { confirm: { token: string; approve: boolean } } {
  const c = (body as { confirm?: unknown } | null)?.confirm;
  return !!c && typeof (c as { token?: unknown }).token === "string";
}

// POST /api/chat — { message } streams a reply (running the gated tool-loop); a
// write proposal SUSPENDS the turn with a pending_write frame. { confirm } resumes
// a previously-proposed write. Persists user + assistant messages.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const userId = session.user.id;

  const rawBody = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (isConfirmBody(rawBody)) return handleConfirm(req, rawBody.confirm, userId);
  const body = rawBody as ChatBody;

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

  // Internal tools (LAAM) LUÔN có; connector tools nếu user đã kết nối.
  const now = Date.now();
  const lang = readLang(req);
  let connectorTools = [] as Awaited<ReturnType<typeof chatTools>>;
  try {
    connectorTools = await chatTools(userId);
  } catch {
    connectorTools = [];
  }
  const tools = modelToolSchemas(INTERNAL_TOOLS, connectorTools);

  // System prompt động (ghi đè default tĩnh trong buildOllamaPayload), trừ khi user tự đặt system.
  payload.messages[0] = {
    role: "system",
    content:
      typeof body.system === "string" && body.system.trim()
        ? body.system
        : buildSystemPrompt({ lang, now, toolNames: tools.map((t) => t.function.name) }),
  };

  // SP-2: the gate wraps dispatch. A read / confirmed write passes through; an
  // unconfirmed write THROWS PendingWriteSignal, which unwinds runToolRounds to here.
  const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }), {
    internal: INTERNAL_TOOLS,
  });
  const callOllama = async (
    messages: ChatMessage[],
    roundTools: typeof tools,
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
    payload.messages = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
  } catch (e) {
    if (e instanceof PendingWriteSignal) {
      // A write was proposed — suspend the turn and ask the user to confirm.
      return suspendForConfirm(e, convId, userId, now);
    }
    // Real tool-loop error (Ollama/connector) — stream a normal reply from the
    // original payload (fail-soft, as before).
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

  return streamOllama(ollamaRes, convId);
}

// Stream Ollama tokens to the client, persist the assistant message, and emit the
// trailing {i,o} token-usage frame. Extracted from POST so the resume path reuses
// it. (Legacy single-SEP token frame, unchanged from SP-1; SP-4 migrates it to
// encodeFrame({t:"tokens"}) in their §3.)
function streamOllama(ollamaRes: Response, convId: string): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const reader = ollamaRes.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buf = "";
      let full = "";
      let tokensIn = 0;
      let tokensOut = 0;
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
              if (j?.done) {
                if (typeof j.prompt_eval_count === "number") tokensIn = j.prompt_eval_count;
                if (typeof j.eval_count === "number") tokensOut = j.eval_count;
              }
            } catch {
              /* skip partial line */
            }
          }
        }
      } finally {
        if (full) {
          await db.insert(chatMessages).values({
            conversationId: convId,
            role: "assistant",
            content: full,
            tokensIn,
            tokensOut,
          });
          try {
            controller.enqueue(encoder.encode(SEP + JSON.stringify({ i: tokensIn, o: tokensOut })));
          } catch {
            /* response already cancelled (client aborted) — nothing to send */
          }
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

// Stream a CODE-BUILT text plus an optional trailing frame, persisting the
// assistant message. Used for the suspend (proposal + pending_write) and the
// cancel/reject (plain text) turns.
function streamText(convId: string, text: string, frame?: ChatFrame): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(text));
      if (frame) controller.enqueue(enc.encode(encodeFrame(frame)));
      await db.insert(chatMessages).values({ conversationId: convId, role: "assistant", content: text });
      await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
      controller.close();
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

// Turn 1 suspend: a write was proposed. Build a CODE preview (never the model's
// prose — Rule 13), persist it as the (never-empty) proposal assistant message,
// seal the token, and emit the pending_write frame.
function suspendForConfirm(
  sig: PendingWriteSignal,
  convId: string,
  userId: string,
  now: number,
): Response {
  const preview = buildPreview(sig.tool, sig.args);
  const token = sealPendingWrite({
    v: 1,
    name: sig.tool,
    args: sig.args,
    conversationId: convId,
    userId,
    iat: now,
    exp: now + PENDING_TTL_MS,
    nonce: crypto.randomUUID(),
  });
  const frame: ChatFrame = {
    t: "pending_write",
    token,
    tool: sig.tool,
    title: preview.title,
    summary: preview.summary,
    fields: preview.fields,
  };
  return streamText(convId, preview.summary, frame);
}

// Turn 2 confirm: open the token, run the resume, stream the result (or cancel/reject).
async function handleConfirm(
  req: Request,
  confirm: { token: string; approve: boolean },
  userId: string,
): Promise<Response> {
  const now = Date.now();
  const opened = openPendingWrite(confirm.token, now);
  if (!opened.ok) {
    console.warn(`[safety] confirm token rejected: ${opened.error}`);
    return new Response(`Yêu cầu xác nhận không hợp lệ: ${opened.error}.`, { status: 400 });
  }
  const signed = opened.value;
  if (signed.userId !== userId) {
    console.warn("[safety] confirm token userId mismatch");
    return new Response("Yêu cầu xác nhận không hợp lệ.", { status: 403 });
  }
  const convId = signed.conversationId;

  const rows = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(asc(chatMessages.createdAt));
  const lang = readLang(req); // tri-lingual: narrate the result in the user's language
  const system = buildSystemPrompt({ lang, now, toolNames: [] });

  const gated = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }), {
    internal: INTERNAL_TOOLS,
    confirmedAction: { name: signed.name, args: signed.args },
  });
  const outcome = await runResume(
    signed,
    confirm.approve,
    system,
    rows.map((m) => ({ role: m.role, content: m.content })),
    {
      dispatch: (name, args) => gated(name, args),
      isNonceUsed: (nonce) => isNonceUsed(db, nonce, now),
      recordWrite: (x) => recordWrite(db, userId, x),
    },
  );

  if (outcome.status === "cancelled") return streamText(convId, "Đã huỷ hành động.");
  if (outcome.status === "rejected") return streamText(convId, `Không thực hiện được: ${outcome.reason}.`);

  // executed → a final TEXT-ONLY completion (no tools) narrating the result.
  let ollamaRes: Response;
  try {
    ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildResumeRequest(MODEL, outcome.messages, {})),
    });
  } catch {
    return new Response("Đã thực hiện hành động nhưng không tạo được phản hồi (Ollama).", {
      status: 502,
      headers: { "x-conversation-id": convId },
    });
  }
  if (!ollamaRes.ok || !ollamaRes.body) {
    return new Response(`Đã thực hiện hành động. (Ollama lỗi ${ollamaRes.status}.)`, {
      status: 502,
      headers: { "x-conversation-id": convId },
    });
  }
  return streamOllama(ollamaRes, convId);
}
