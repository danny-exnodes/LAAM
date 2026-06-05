import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages, chatToolCalls } from "@/db/schema";
import { chatTools } from "@/lib/connectors";
import { buildSystemPrompt } from "@/lib/agent/context";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { runToolRounds, type ChatMessage, type OllamaChatResponse } from "@/lib/agent/orchestrator";
import { withSafety, PendingWriteSignal } from "@/lib/agent/safety/gate";
import { sealPendingWrite, openPendingWrite } from "@/lib/agent/safety/token";
import { buildPreview } from "@/lib/agent/safety/preview";
import { runResume, buildResumeRequest } from "@/lib/agent/safety/resume";
import { recordWrite, isNonceUsed } from "@/lib/agent/safety/audit";
import { encodeFrame, type ChatFrame } from "@/lib/chat/frames";
import { makeFrameCollector, deriveCitations } from "@/lib/chat/trace";
import { extractToolTurns } from "@/lib/agent/persist";
import { planHistory, summarizeMessages, type HistoryMsg } from "@/lib/agent/summarize";
import {
  detectAlerts,
  selectNewAlerts,
  formatProactiveNotice,
  type ProactiveState,
} from "@/lib/agent/proactive";
import { loadSessionRows } from "@/lib/agent/tools/laam/_load";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const SYSTEM =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích. " +
  "Dùng tiếng Việt khi người dùng dùng tiếng Việt.";
const PENDING_TTL_MS = 5 * 60_000; // §5: pending-write token expiry
// SP-4: tên internal tool — redact args theo set-membership (D-SP4-3) khi gom tool frames.
const INTERNAL_NAMES = new Set(INTERNAL_TOOLS.map((t) => t.name));

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

// POST /api/chat — { message } streams a reply (running the gated tool-loop); an
// unconfirmed write proposal SUSPENDS the turn with a pending_write frame (SP-2).
// { confirm } resumes a previously-proposed write. SP-3: summarizes long history,
// surfaces proactive alerts, persists tool turns. SP-4: streams tool-trace +
// citation + token frames. Persists user + assistant messages.
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

  // Resolve/create conversation; giữ summary/watermark/proactiveState (SP-3).
  let conversationId = body.conversationId;
  let convSummary: string | null = null;
  let convWatermark: string | null = null;
  let convProactive: ProactiveState | null = null;
  if (conversationId) {
    const rows = await db
      .select()
      .from(chatConversations)
      .where(eq(chatConversations.id, conversationId))
      .limit(1);
    if (!rows[0] || rows[0].userId !== userId) {
      return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
    }
    convSummary = rows[0].summary ?? null;
    convWatermark = rows[0].summarizedThroughId ?? null;
    convProactive = (rows[0].proactiveState as ProactiveState | null) ?? null;
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
    .select({ id: chatMessages.id, role: chatMessages.role, content: chatMessages.content })
    .from(chatMessages)
    .where(eq(chatMessages.conversationId, convId))
    .orderBy(asc(chatMessages.createdAt));

  const now = Date.now();
  const lang = readLang(req);

  // --- Summarize (SP-3): bound lịch sử replay theo char-budget. ---
  const plan = planHistory(history as HistoryMsg[], convSummary, convWatermark);
  let effectiveSummary = convSummary;
  if (plan.needsSummary) {
    try {
      effectiveSummary = await summarizeMessages(plan.toSummarize, convSummary, lang, {
        callModel: (prompt) => callModelText(prompt, model),
      });
      const through = plan.toSummarize[plan.toSummarize.length - 1]?.id ?? null;
      await db
        .update(chatConversations)
        .set({ summary: effectiveSummary, summarizedThroughId: through })
        .where(eq(chatConversations.id, convId));
    } catch (e) {
      console.error("[chat] summarize failed (fail-soft)", e); // giữ summary cũ; vẫn replay bounded
    }
  }

  const payload = buildOllamaPayload(
    body,
    plan.toReplay.map((m) => ({ role: m.role, content: m.content })),
    { model: MODEL, system: SYSTEM },
  );

  // Internal tools (LAAM) LUÔN có; connector tools nếu user đã kết nối.
  let connectorTools = [] as Awaited<ReturnType<typeof chatTools>>;
  try {
    connectorTools = await chatTools(userId);
  } catch {
    connectorTools = [];
  }
  const tools = modelToolSchemas(INTERNAL_TOOLS, connectorTools);

  // --- System prompt động + proactive notice COMPOSE-AROUND buildSystemPrompt (SP-3). ---
  const hasSystemOverride = typeof body.system === "string" && body.system.trim().length > 0;
  let systemContent = hasSystemOverride
    ? (body.system as string)
    : buildSystemPrompt({ lang, now, toolNames: tools.map((t) => t.function.name) });
  if (!hasSystemOverride) {
    try {
      const rows = await loadSessionRows();
      const { toSurface, newState } = selectNewAlerts(detectAlerts(rows, now), convProactive, now);
      const notice = formatProactiveNotice(toSurface, lang);
      if (notice) systemContent = systemContent + "\n\n" + notice;
      // Persist dedupe state when something surfaced OR pruning changed it (keep proactiveState bounded).
      const prevKeyCount = convProactive ? Object.keys(convProactive.surfaced ?? {}).length : 0;
      if (notice || Object.keys(newState.surfaced).length !== prevKeyCount) {
        await db
          .update(chatConversations)
          .set({ proactiveState: newState })
          .where(eq(chatConversations.id, convId));
      }
    } catch (e) {
      console.error("[chat] proactive detect failed (fail-soft)", e);
    }
  }
  payload.messages[0] = { role: "system", content: systemContent };

  // Summary làm system message #2 (sau persona), nếu có. (SP-3 — trước baseLen.)
  if (effectiveSummary) {
    payload.messages.splice(1, 0, {
      role: "system",
      content: "Bối cảnh hội thoại trước (tóm tắt): " + effectiveSummary,
    });
  }

  // SP-4: collector nối onEvent → gom tool frames (gán c, redact args). SP-2: gate bọc
  // dispatch — read/confirmed write đi qua (onEvent phát); unconfirmed write THROW
  // PendingWriteSignal (onEvent KHÔNG phát cho write — nó hiện thành pending_write frame).
  const { onEvent, frames: toolFrames } = makeFrameCollector(INTERNAL_NAMES);
  const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }, onEvent), {
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

  // baseLen chụp SAU summary+proactive, TRƯỚC runToolRounds (verdict A1 SP-3).
  const baseLen = payload.messages.length;
  let toolTurns: ReturnType<typeof extractToolTurns> = [];
  let cites: string[] = [];
  try {
    payload.messages = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
    toolTurns = extractToolTurns(payload.messages, baseLen); // SP-3: capture tool turns to persist
    cites = deriveCitations(payload.messages, baseLen); // SP-4: "Nguồn" từ tool có data
  } catch (e) {
    if (e instanceof PendingWriteSignal) {
      // SP-2: a write was proposed — suspend. SP-4: flush the read tool frames that ran
      // BEFORE the write (Task 3-C) so the trace isn't lost; the write itself surfaces
      // as the pending_write frame (onEvent didn't fire for it).
      return suspendForConfirm(e, convId, userId, now, toolFrames);
    }
    // Real tool-loop error (Ollama/connector) — stream a normal reply from the
    // original payload (fail-soft, as before). toolTurns/cites stay [].
  }

  const assistantMsgId = crypto.randomUUID();
  const trailingFrames: ChatFrame[] = [
    ...toolFrames,
    ...(cites.length ? [{ t: "cite", names: cites } as ChatFrame] : []),
  ];

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

  return streamOllama(ollamaRes, convId, {
    persist: { toolTurns, assistantMsgId },
    frames: trailingFrames,
  });
}

// Stream Ollama tokens to the client, persist the assistant message + (SP-3) the
// tool turns, and emit the trailing frames (SP-4: tool trace → citations → token
// usage, all via encodeFrame). Extracted from POST (SP-2) so the resume path reuses
// it. `persist` carries the SP-3 tool-turn rows + the assistant message id they FK
// to; `frames` are the trailing tool/cite frames (the {t:"tokens"} frame is appended
// here from the live token counts). The legacy single-SEP {i,o} frame is gone —
// ChatClient now parses every frame via splitFrames (SP-4 token-frame migrate).
function streamOllama(
  ollamaRes: Response,
  convId: string,
  opts: {
    persist?: { toolTurns: ReturnType<typeof extractToolTurns>; assistantMsgId: string };
    frames?: ChatFrame[];
  } = {},
): Response {
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
            // SP-3: when persisting tool turns we need a known id for the FK; the
            // resume path omits `persist` and lets the column default generate one.
            ...(opts.persist ? { id: opts.persist.assistantMsgId } : {}),
            conversationId: convId,
            role: "assistant",
            content: full,
            tokensIn,
            tokensOut,
          });
          // SP-4: trailing frames (bọc U+001E): tool trace → citations → token usage.
          // Fail-soft: enqueue lỗi (client aborted) → bỏ qua.
          try {
            const trailing: ChatFrame[] = [
              ...(opts.frames ?? []),
              { t: "tokens", i: tokensIn, o: tokensOut },
            ];
            for (const f of trailing) controller.enqueue(encoder.encode(encodeFrame(f)));
          } catch {
            /* response already cancelled (client aborted) — nothing to send */
          }
        }
        // SP-3: persist tool turns (main turn only; resume path omits `persist`).
        if (opts.persist && opts.persist.toolTurns.length) {
          try {
            await db.insert(chatToolCalls).values(
              opts.persist.toolTurns.map((t) => ({
                conversationId: convId,
                messageId: full ? opts.persist!.assistantMsgId : null,
                seq: t.seq,
                name: t.name,
                args: t.args,
                result: t.result,
                ok: t.ok,
                bytes: t.bytes,
              })),
            );
          } catch (e) {
            console.error("[chat] persist tool turns failed (fail-soft)", e);
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

// Stream a CODE-BUILT text plus trailing frames, persisting the assistant message.
// Used for the suspend (proposal + flushed read frames + pending_write) and the
// cancel/reject (plain text) turns. (SP-2 + SP-4 frames.)
function streamText(convId: string, text: string, frames: ChatFrame[] = []): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(enc.encode(text));
      for (const f of frames) controller.enqueue(enc.encode(encodeFrame(f)));
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
// seal the token, and emit the read tool frames (flush — Task 3-C) + pending_write
// frame. (SP-2 + SP-4.)
function suspendForConfirm(
  sig: PendingWriteSignal,
  convId: string,
  userId: string,
  now: number,
  toolFrames: ChatFrame[],
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
  const pendingFrame: ChatFrame = {
    t: "pending_write",
    token,
    tool: sig.tool,
    title: preview.title,
    summary: preview.summary,
    fields: preview.fields,
  };
  return streamText(convId, preview.summary, [...toolFrames, pendingFrame]);
}

// Turn 2 confirm: open the token, run the resume, stream the result (or cancel/reject).
// The resume reuses streamOllama WITHOUT `persist` — tool-turn persistence for the
// confirmed write is a documented follow-up (backlog: route-merge-reconciliation).
// SP-4: the confirmed write runs through makeDispatch(onEvent) so it surfaces a tool frame. (SP-2.)
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

  const { onEvent, frames: confirmFrames } = makeFrameCollector(INTERNAL_NAMES);
  const gated = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }, onEvent), {
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
  // SP-4: emit the confirmed write's tool frame (onEvent fired during runResume).
  return streamOllama(ollamaRes, convId, { frames: confirmFrames });
}

// Helper SP-3: gọi model 1 lần non-streaming (cho summarize). Hoisted — đặt cuối file OK.
async function callModelText(prompt: string, model: string): Promise<string> {
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream: false }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const j = (await r.json()) as OllamaChatResponse;
  return j?.message?.content ?? "";
}
