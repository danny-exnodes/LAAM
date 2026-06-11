import { eq, asc } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { chatConversations, chatMessages, chatToolCalls } from "@/db/schema";
import { chatTools, mcpReadAllow } from "@/lib/connectors";
import { buildSystemPrompt } from "@/lib/agent/context";
import { INTERNAL_TOOLS, modelToolSchemas, makeDispatch } from "@/lib/agent/registry";
import { runToolRounds, type ChatMessage, type OllamaChatResponse } from "@/lib/agent/orchestrator";
import { withSafety, PendingWriteSignal } from "@/lib/agent/safety/gate";
import { sealPendingWrite, openPendingWrite } from "@/lib/agent/safety/token";
import { buildPreview } from "@/lib/agent/safety/preview";
import { runResume, buildResumeRequest } from "@/lib/agent/safety/resume";
import { recordWrite, isNonceUsed } from "@/lib/agent/safety/audit";
import { resolveKind } from "@/lib/agent/safety/policy";
import { looksLikeWriteIntent, guardWriteClaim } from "@/lib/agent/safety/write-claim-guard";
import { encodeFrame, type ChatFrame } from "@/lib/chat/frames";
import { deriveConvTitle } from "@/lib/chat/title";
import { makeFrameCollector, deriveCitations, summarizeArgs } from "@/lib/chat/trace";
import { extractToolTurns } from "@/lib/agent/persist";
import { planHistory, summarizeMessages, type HistoryMsg } from "@/lib/agent/summarize";
import {
  detectAlerts,
  selectNewAlerts,
  type ProactiveAlert,
  type ProactiveState,
} from "@/lib/agent/proactive";
import { loadSessionRows } from "@/lib/agent/tools/laam/_load";

const OLLAMA_URL = (process.env.OLLAMA_URL ?? "http://localhost:11434").replace(/\/$/, "");
const MODEL = process.env.DEFAULT_CHAT_MODEL ?? "gemma4:e4b";
const SYSTEM =
  "Bạn là LAAM, trợ lý nội bộ thân thiện. Trả lời ngắn gọn, chính xác, hữu ích. " +
  "Dùng tiếng Việt khi người dùng dùng tiếng Việt.";
const PENDING_TTL_MS = 5 * 60_000; // §5: pending-write token expiry
// R0: Ollama rớt GIỮA tool-loop (round ≥ 1) → user phải thấy lỗi thay vì im lặng.
// Server stream không có dictionary client → tri-lingual const (pattern SAFE_UNBACKED_WRITE).
const TOOL_LOOP_ERR: Record<"vi" | "en" | "zh", string> = {
  vi: `Không kết nối được Ollama (${OLLAMA_URL}) khi đang chạy công cụ. Vui lòng thử lại.`,
  en: `Lost connection to Ollama (${OLLAMA_URL}) while running tools. Please try again.`,
  zh: `调用工具时无法连接 Ollama（${OLLAMA_URL}）。请重试。`,
};
// SP-4: tên internal tool — redact args theo set-membership (D-SP4-3) khi gom tool frames.
const INTERNAL_NAMES = new Set(INTERNAL_TOOLS.map((t) => t.name));
// Cửa sổ ngữ cảnh model phục vụ. Ollama mặc định num_ctx=4096 BẤT KỂ model hỗ trợ tới ~128k+ →
// hội thoại dài / tool results làm prompt lấp đầy 4096, KHÔNG còn chỗ sinh ⇒ câu trả lời bị CẮT
// giữa chừng (tokensIn+tokensOut==num_ctx). Đặt rõ num_ctx (env CHAT_NUM_CTX); 16384 vừa 16GB.
const NUM_CTX = Math.max(2048, Number(process.env.CHAT_NUM_CTX) || 16384);
// Budget (chars) cho summary+replay history: chừa chỗ output + system + tool results TRONG num_ctx
// (~3.5 char/token; reserve 3072 tok output + 2560 tok system/tools) ⇒ replay không nuốt cả cửa sổ.
const REPLAY_BUDGET_CHARS = Math.max(8000, Math.floor((NUM_CTX - 3072 - 2560) * 3.5));
// Sampler (góp ý team): Qwen3-Q8 hay lặp từ khi để mặc định cao → presence_penalty 0.0–0.3 giảm
// lặp + ổn định JSON/code. Env CHAT_PRESENCE_PENALTY (default 0.2). Áp server-side để có hiệu lực
// NGAY (kể cả FE chưa gửi); `body.presencePenalty` override nếu có. (temperature default 0.6 ở DEFAULT_SETTINGS.)
const DEFAULT_PRESENCE_PENALTY = Number.isFinite(Number(process.env.CHAT_PRESENCE_PENALTY))
  ? Number(process.env.CHAT_PRESENCE_PENALTY)
  : 0.2;
// FEAT-2: proactive alert thresholds are deployment-configurable via env
// (stuck-minutes / cost-USD). Unset → the module defaults (10′ / $1) apply.
const PROACTIVE_OPTS = {
  stuckMin: Number(process.env.PROACTIVE_STUCK_MIN) > 0 ? Number(process.env.PROACTIVE_STUCK_MIN) : undefined,
  costUsd: Number(process.env.PROACTIVE_COST_USD) > 0 ? Number(process.env.PROACTIVE_COST_USD) : undefined,
};

type ChatBody = {
  conversationId?: string;
  message?: string;
  titleHint?: string; // F4: raw user text for the conversation title (message includes attachment blocks)
  model?: string;
  temperature?: number;
  topP?: number;
  presencePenalty?: number;
  system?: string;
  images?: string[]; // W3 vision: raw base64 (không prefix data:), validate qua imagesError
};

// W3 vision caps (server, trần cứng): ≤2 ảnh/lượt, mỗi ảnh ≤ ~2.8MB base64
// (~2MB nhị phân ×4/3). VRAM 16GB (RTX 5070 Ti) + CHAT_NUM_CTX=16384: mỗi ảnh
// ngốn vision-token trong ctx LẪN VRAM decode cạnh KV-cache q8 — 2 ảnh là trần
// an toàn. Client (imageCap.ts) tự cap CHẶT HƠN (2MB/ảnh) kèm thông báo i18n.
const MAX_IMAGES_PER_TURN = 2;
const MAX_IMAGE_B64_CHARS = 2_800_000;

// W3 vision: validate body.images — optional/additive; null = hợp lệ (hoặc vắng),
// string = lý do lỗi → POST trả 400. QUYẾT ĐỊNH W3: vượt cap → 400 REJECT, KHÔNG
// strip — client đã degrade thân thiện (cap + notice, chỉ gửi OCR-text); request
// vượt cap tới đây = client phi chuẩn/bug, strip im lặng sẽ giấu nó (Rule 12).
// Pure để unit-test không cần dựng POST.
export function imagesError(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (!Array.isArray(v)) return "images must be an array";
  if (v.length > MAX_IMAGES_PER_TURN) return `images: max ${MAX_IMAGES_PER_TURN} per message`;
  for (const s of v) {
    if (typeof s !== "string" || !s) return "images: items must be non-empty base64 strings";
    if (s.length > MAX_IMAGE_B64_CHARS) return `images: each item must be <= ${MAX_IMAGE_B64_CHARS} base64 chars`;
  }
  return null;
}
// Build the Ollama /api/chat request payload from the request body, the
// conversation history, and the server defaults. Pure — no I/O — so the
// option mapping (temperature/top_p, model + system overrides, defaults) is
// unit-testable without a live Ollama. Absent numeric options are omitted so
// Ollama keeps its own defaults rather than receiving NaN/undefined.
export function buildOllamaPayload(
  body: ChatBody,
  historyMessages: ChatMessage[],
  defaults: { model: string; system: string; numCtx?: number },
) {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

  const model = str(body.model) ?? defaults.model;
  const system = str(body.system) ?? defaults.system;

  const options: { temperature?: number; top_p?: number; num_ctx?: number; presence_penalty?: number } = {};
  const t = num(body.temperature);
  if (t !== null) options.temperature = t;
  const p = num(body.topP);
  if (p !== null) options.top_p = p;
  if (defaults.numCtx && defaults.numCtx > 0) options.num_ctx = defaults.numCtx;
  // presence_penalty luôn được set: body override > default server-side (chống lặp Qwen3-Q8).
  options.presence_penalty = num(body.presencePenalty) ?? DEFAULT_PRESENCE_PENALTY;

  const messages: ChatMessage[] = [{ role: "system", content: system }, ...historyMessages];
  // W3 vision: gắn ảnh raw (base64, không prefix data:) vào message user CUỐI —
  // đúng format Ollama {role:'user', content, images}. Ảnh KHÔNG persist: lượt
  // sau replay chỉ còn OCR-text đã prefix trong content (flow cũ giữ nguyên).
  // Không có ảnh → không thêm key nào ⇒ payload y hệt trước (regression-safe).
  const imgs = Array.isArray(body.images)
    ? body.images.filter((s): s is string => typeof s === "string" && s.length > 0)
    : [];
  if (imgs.length) {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        messages[i] = { ...messages[i], images: imgs };
        break;
      }
    }
  }

  return {
    model,
    messages,
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
  // W3 vision: validate ảnh SỚM — trước mọi I/O DB/Ollama (xem imagesError về
  // quyết định 400-reject thay vì strip).
  const imgErr = imagesError(body.images);
  if (imgErr) {
    return new Response(JSON.stringify({ error: imgErr }), { status: 400 });
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
      title: deriveConvTitle(message, body.titleHint),
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

  // --- Summarize (SP-3): bound lịch sử replay theo char-budget dẫn xuất từ num_ctx. ---
  const plan = planHistory(history as HistoryMsg[], convSummary, convWatermark, {
    budgetChars: REPLAY_BUDGET_CHARS,
  });
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
    { model: MODEL, system: SYSTEM, numCtx: NUM_CTX },
  );

  // Internal tools (LAAM) LUÔN có; connector tools nếu user đã kết nối.
  let connectorTools = [] as Awaited<ReturnType<typeof chatTools>>;
  try {
    connectorTools = await chatTools(userId);
  } catch {
    connectorTools = [];
  }
  const tools = modelToolSchemas(INTERNAL_TOOLS, connectorTools);
  // MCP tools the user trusts as read (opt-in) → safety gate skips confirm for them; all
  // other MCP tools fail-closed to write.
  const readAllow = await mcpReadAllow(userId);

  // --- System prompt động + proactive notice COMPOSE-AROUND buildSystemPrompt (SP-3). ---
  const hasSystemOverride = typeof body.system === "string" && body.system.trim().length > 0;
  let systemContent = hasSystemOverride
    ? (body.system as string)
    : buildSystemPrompt({ lang, now, toolNames: tools.map((t) => t.function.name) });
  let proactiveSurfaced: ProactiveAlert[] = [];
  if (!hasSystemOverride) {
    try {
      const rows = await loadSessionRows();
      const { toSurface, newState } = selectNewAlerts(
        detectAlerts(rows, now, PROACTIVE_OPTS),
        convProactive,
        now,
      );
      // FEAT-2: surface as a distinct card (proactive frame) instead of appending
      // to the model's reply — keeps it visibly a system alert, not model prose.
      proactiveSurfaced = toSurface;
      // Persist dedupe state when something surfaced OR pruning changed it (keep proactiveState bounded).
      const prevKeyCount = convProactive ? Object.keys(convProactive.surfaced ?? {}).length : 0;
      if (toSurface.length || Object.keys(newState.surfaced).length !== prevKeyCount) {
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

  // baseLen chụp SAU summary+proactive, TRƯỚC tool-loop (verdict A1 SP-3).
  const baseLen = payload.messages.length;
  // S3 realtime: stream the WHOLE turn in one response — tool-call frames go out
  // LIVE as the loop dispatches them, then the completion streams, then trailing
  // cite/proactive/token frames. (handleConfirm still uses streamOllama.)
  // Write-intent detection uses the user's TYPED text (titleHint), not `message`,
  // which on attachment turns is prefixed with the extracted file content — avoids
  // buffering a summarize-turn just because an uploaded doc contains "tạo/create".
  const intentText = (typeof body.titleHint === "string" && body.titleHint.trim()) ? body.titleHint : message;
  return streamMainTurn({ convId, userId, userText: intentText, now, lang, payload, tools, baseLen, proactive: proactiveSurfaced, readAllow, reqSignal: req.signal });
}

// S3 — the main chat turn as a single live stream. Replaces the old "await the
// whole tool-loop, THEN stream" flow + suspendForConfirm: tool-call frames are
// emitted the instant the loop dispatches them, so the UI shows "đang gọi <tool>…"
// in real time. An unconfirmed write still suspends (pending_write frame). Mirrors
// streamOllama's token-read + persist; that fn stays for the confirm round-trip.
function streamMainTurn(opts: {
  convId: string;
  userId: string;
  userText: string;
  now: number;
  lang: string;
  payload: ReturnType<typeof buildOllamaPayload>;
  tools: ReturnType<typeof modelToolSchemas>;
  baseLen: number;
  proactive: ProactiveAlert[];
  readAllow: ReadonlySet<string>;
  reqSignal?: AbortSignal;
}): Response {
  const { convId, userId, userText, now, lang, payload, tools, baseLen, proactive, readAllow, reqSignal } = opts;
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (f: ChatFrame) => {
        try {
          controller.enqueue(enc.encode(encodeFrame(f)));
        } catch {
          /* client aborted */
        }
      };
      // LIVE tool frames: assign the call→result counter `c` + redact args, then
      // enqueue immediately (was collected and flushed only at the end).
      let c = -1;
      const onEvent = (e: { type: "tool_call"; name: string; args: unknown } | { type: "tool_result"; name: string; ok: boolean }) => {
        if (e.type === "tool_call") {
          c++;
          emit({ t: "tool", phase: "call", c, name: e.name, args: summarizeArgs(e.args, INTERNAL_NAMES.has(e.name)) });
        } else {
          emit({ t: "tool", phase: "result", c, name: e.name, ok: e.ok });
        }
      };
      const dispatch = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }, onEvent), {
        internal: INTERNAL_TOOLS,
        readAllow,
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

      let convo: ChatMessage[] = payload.messages;
      let toolTurns: ReturnType<typeof extractToolTurns> = [];
      let cites: string[] = [];
      try {
        convo = await runToolRounds(payload.messages, tools, { callOllama, dispatch });
        toolTurns = extractToolTurns(convo, baseLen);
        cites = deriveCitations(convo, baseLen);
      } catch (e) {
        if (e instanceof PendingWriteSignal) {
          // SP-2 suspend (inline): code-built preview + sealed token + pending_write
          // frame; the read tool frames already went out live. Persist the proposal.
          const preview = buildPreview(e.tool, e.args);
          const token = sealPendingWrite({
            v: 1,
            name: e.tool,
            args: e.args,
            conversationId: convId,
            userId,
            iat: now,
            exp: now + PENDING_TTL_MS,
            nonce: crypto.randomUUID(),
          });
          try {
            controller.enqueue(enc.encode(preview.summary));
          } catch {
            /* aborted */
          }
          emit({ t: "pending_write", token, tool: e.tool, title: preview.title, summary: preview.summary, fields: preview.fields });
          try {
            await db.insert(chatMessages).values({ conversationId: convId, role: "assistant", content: preview.summary });
            await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
          } catch (err) {
            console.error("[chat] suspend persist failed (fail-soft)", err);
          }
          controller.close();
          return;
        }
        // Lỗi THẬT giữa tool-loop (Ollama rớt / HTTP lỗi ở round ≥ 1). Fail-soft cũ
        // (complete từ messages gốc) thường chết thêm lần nữa → user không nhận được
        // phản hồi nào. Kết thúc SẠCH thay vì im lặng: text lỗi theo lang (pattern
        // catch main-turn bên dưới) + persist để history còn lượt này + close.
        console.error(`[chat] tool-loop failed (conv=${convId})`, e);
        const errText = TOOL_LOOP_ERR[lang as keyof typeof TOOL_LOOP_ERR] ?? TOOL_LOOP_ERR.vi;
        try {
          controller.enqueue(enc.encode(errText));
        } catch {
          /* aborted */
        }
        try {
          await db.insert(chatMessages).values({ conversationId: convId, role: "assistant", content: errText });
          await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
        } catch (err) {
          console.error("[chat] tool-loop error persist failed (fail-soft)", err);
        }
        controller.close();
        return;
      }

      // F1 (Rule 13): a write never executes in the main turn — it suspends above
      // (PendingWriteSignal). So any "đã tạo/gửi thành công" in this completion is
      // unbacked. Buffer write-intent turns (withhold live tokens) and replace an
      // unbacked success claim with an honest message before it reaches the user.
      const guardWrites = looksLikeWriteIntent(userText);
      const writeBacked = toolTurns.some(
        (tt) => tt.ok && resolveKind(tt.name, INTERNAL_TOOLS, readAllow) === "write",
      );

      let ollamaRes: Response;
      try {
        ollamaRes = await fetch(`${OLLAMA_URL}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ model: payload.model, messages: convo, options: payload.options, stream: true }),
        });
      } catch {
        try {
          controller.enqueue(enc.encode(`Không kết nối được Ollama (${OLLAMA_URL}).`));
        } catch {
          /* aborted */
        }
        controller.close();
        return;
      }
      if (!ollamaRes.ok || !ollamaRes.body) {
        try {
          controller.enqueue(enc.encode(`Ollama lỗi ${ollamaRes.status}.`));
        } catch {
          /* aborted */
        }
        controller.close();
        return;
      }

      const reader = ollamaRes.body.getReader();
      const decoder = new TextDecoder();
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
            const tl = line.trim();
            if (!tl) continue;
            try {
              const j = JSON.parse(tl);
              const tok = j?.message?.content ?? "";
              if (tok) {
                full += tok;
                // Withhold live tokens on write-intent turns; the vetted text is
                // emitted once below so an unbacked success claim never displays.
                if (!guardWrites) controller.enqueue(enc.encode(tok));
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
        // Abort observability: client hủy request giữa stream → 1 dòng warn có convId
        // (đọc log phân biệt "user bấm Stop" với lỗi server).
        if (reqSignal?.aborted) console.warn(`[chat] client aborted stream (conv=${convId})`);
        const assistantMsgId = crypto.randomUUID();
        // F1: vet a buffered write-intent completion before persisting/emitting it.
        // Non-guarded turns already streamed live (outText === full, not re-emitted).
        let outText = full;
        if (guardWrites && full) {
          const g = guardWriteClaim(full, { writeBacked, lang });
          outText = g.text;
          if (g.blocked) console.warn("[chat] F1 guard: blocked unbacked write-success claim");
          try {
            controller.enqueue(enc.encode(outText));
          } catch {
            /* aborted */
          }
        }
        if (full) {
          try {
            await db.insert(chatMessages).values({
              id: assistantMsgId,
              conversationId: convId,
              role: "assistant",
              content: outText,
              tokensIn,
              tokensOut,
            });
          } catch (e) {
            console.error("[chat] persist assistant failed (fail-soft)", e);
          }
          // Trailing frames (tool frames already emitted live): citations → proactive → tokens.
          try {
            if (cites.length) emit({ t: "cite", names: cites });
            if (proactive.length) {
              emit({
                t: "proactive",
                alerts: proactive.map((a) => ({
                  type: a.type,
                  key: a.key,
                  sessionId: a.sessionId,
                  project: a.project ?? a.sessionId,
                  minutesIdle: a.minutesIdle,
                  costUsd: a.costUsd,
                })),
              });
            }
            emit({ t: "tokens", i: tokensIn, o: tokensOut });
          } catch {
            /* aborted */
          }
          if (toolTurns.length) {
            try {
              await db.insert(chatToolCalls).values(
                toolTurns.map((tt) => ({
                  conversationId: convId,
                  messageId: assistantMsgId,
                  seq: tt.seq,
                  name: tt.name,
                  args: tt.args,
                  result: tt.result,
                  ok: tt.ok,
                  bytes: tt.bytes,
                })),
              );
            } catch (e) {
              console.error("[chat] persist tool turns failed (fail-soft)", e);
            }
          }
        }
        try {
          await db.update(chatConversations).set({ updatedAt: new Date() }).where(eq(chatConversations.id, convId));
        } catch {
          /* ignore */
        }
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
  const readAllow = await mcpReadAllow(userId);
  const gated = withSafety(makeDispatch(INTERNAL_TOOLS, { userId, now, lang }, onEvent), {
    internal: INTERNAL_TOOLS,
    confirmedAction: { name: signed.name, args: signed.args },
    readAllow,
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
      body: JSON.stringify(buildResumeRequest(MODEL, outcome.messages, { num_ctx: NUM_CTX })),
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
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], options: { num_ctx: NUM_CTX }, stream: false }),
  });
  if (!r.ok) throw new Error(`Ollama ${r.status}`);
  const j = (await r.json()) as OllamaChatResponse;
  return j?.message?.content ?? "";
}
