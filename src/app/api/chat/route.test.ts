import { describe, expect, test, vi } from "vitest";
import { INTERNAL_TOOLS, modelToolSchemas } from "@/lib/agent/registry";

// Importing the route module pulls in @/auth (next-auth) and @/db — stub both so
// the module loads under vitest. _db is swappable (getter) so the POST tool-loop
// test can install a chainable fake while the pure-helper tests keep {}.
vi.mock("@/auth", () => ({ auth: vi.fn(async () => null) }));
let _db: unknown = {};
vi.mock("@/db", () => ({ get db() { return _db; } }));
// Connector store hits Postgres; POST awaits mcpReadAllow without try/catch.
vi.mock("@/lib/connectors", () => ({
  chatTools: vi.fn(async () => []),
  mcpReadAllow: vi.fn(async () => new Set<string>()),
  execute: vi.fn(async () => ({})),
}));
// C1 contract: spy PASS-THROUGH quanh runToolRounds (giữ behavior thật) để assert
// "model claude KHÔNG vào tool-loop ở MVS / model Ollama CÓ" — anti-regression cho FULL.
const orch = vi.hoisted(() => ({ runToolRounds: vi.fn() }));
vi.mock("@/lib/agent/orchestrator", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/agent/orchestrator")>();
  orch.runToolRounds.mockImplementation(actual.runToolRounds);
  return { ...actual, runToolRounds: orch.runToolRounds };
});
// C1 review hardening: spy PASS-THROUGH quanh claudeStream (giữ adapter thật) để
// (a) soi messages/signal route compose, (b) ép lỗi BadRequest-like pre-delta /
// mid-stream theo từng test mà không cần network.
const llm = vi.hoisted(() => ({ claudeStream: vi.fn() }));
vi.mock("@/lib/llm/claude", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm/claude")>();
  llm.claudeStream.mockImplementation(actual.claudeStream);
  return { ...actual, claudeStream: llm.claudeStream };
});

import { auth } from "@/auth";
import { sealPendingWrite } from "@/lib/agent/safety/token";
import { POST, buildOllamaPayload, isConfirmBody, imagesError, resolveAgentBase } from "./route";

const mockAuth = vi.mocked(auth);

const defaults = { model: "gemma4:e4b", system: "DEFAULT SYS" };
const history = [
  { role: "user", content: "hi" },
  { role: "assistant", content: "hello" },
];

describe("buildOllamaPayload", () => {
  test("applies defaults when model/system/opts omitted", () => {
    const p = buildOllamaPayload({}, history, defaults);
    expect(p.model).toBe("gemma4:e4b");
    expect(p.stream).toBe(true);
    // system prepended, then history
    expect(p.messages[0]).toEqual({ role: "system", content: "DEFAULT SYS" });
    expect(p.messages.slice(1)).toEqual(history);
    // no temperature/top_p provided → options has neither key
    expect(p.options).not.toHaveProperty("temperature");
    expect(p.options).not.toHaveProperty("top_p");
  });

  test("passes through model and system overrides", () => {
    const p = buildOllamaPayload(
      { model: "qwen3-vl:8b", system: "CUSTOM" },
      history,
      defaults,
    );
    expect(p.model).toBe("qwen3-vl:8b");
    expect(p.messages[0]).toEqual({ role: "system", content: "CUSTOM" });
  });

  test("maps temperature and topP into options.temperature/top_p", () => {
    const p = buildOllamaPayload(
      { temperature: 0.2, topP: 0.5 },
      history,
      defaults,
    );
    expect(p.options.temperature).toBe(0.2);
    expect(p.options.top_p).toBe(0.5);
  });

  test("ignores empty-string model/system (falls back to defaults)", () => {
    const p = buildOllamaPayload({ model: "  ", system: "  " }, history, defaults);
    expect(p.model).toBe("gemma4:e4b");
    expect(p.messages[0]).toEqual({ role: "system", content: "DEFAULT SYS" });
  });

  test("ignores non-number temperature/topP", () => {
    const p = buildOllamaPayload(
      { temperature: "hot" as unknown as number, topP: NaN },
      history,
      defaults,
    );
    expect(p.options).not.toHaveProperty("temperature");
    expect(p.options).not.toHaveProperty("top_p");
  });

  test("sets options.num_ctx from defaults.numCtx (vá tràn context — Ollama mặc định 4096)", () => {
    const p = buildOllamaPayload({}, history, { ...defaults, numCtx: 16384 });
    expect(p.options.num_ctx).toBe(16384);
    // không truyền numCtx → không set (giữ default của Ollama)
    expect(buildOllamaPayload({}, history, defaults).options).not.toHaveProperty("num_ctx");
  });

  test("presence_penalty: default server-side khi FE vắng; body override (chống lặp Qwen3-Q8)", () => {
    // luôn set để giảm lặp; default 0.2 khi không gửi
    expect(buildOllamaPayload({}, history, defaults).options.presence_penalty).toBe(0.2);
    // body override (kể cả 0)
    expect(buildOllamaPayload({ presencePenalty: 0 }, history, defaults).options.presence_penalty).toBe(0);
    expect(buildOllamaPayload({ presencePenalty: 0.3 }, history, defaults).options.presence_penalty).toBe(0.3);
  });
});

describe("W3 vision: images vào payload Ollama", () => {
  // INTENT: ảnh raw phải tới ĐÚNG message user CUỐI (lượt hiện tại) theo format
  // Ollama {role:'user', content, images}. Gắn nhầm message cũ = model "nhìn"
  // ảnh ở sai lượt; system/assistant không bao giờ mang ảnh.
  test("gắn images vào message user CUỐI, không đụng message trước đó", () => {
    const hist = [
      { role: "user", content: "lượt cũ" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "ảnh này là gì?" },
    ];
    const p = buildOllamaPayload({ images: ["QUJD", "REVG"] }, hist, defaults);
    expect(p.messages[3]).toEqual({
      role: "user",
      content: "ảnh này là gì?",
      images: ["QUJD", "REVG"],
    });
    expect(p.messages[0]).not.toHaveProperty("images"); // system
    expect(p.messages[1]).not.toHaveProperty("images"); // user lượt cũ
    expect(p.messages[2]).not.toHaveProperty("images"); // assistant
  });

  // REGRESSION: không gửi ảnh (hoặc mảng rỗng) → payload Y HỆT trước W3 —
  // không message nào mọc key `images` (wire-format bất biến khi vắng ảnh).
  test("không ảnh / images:[] → payload y như cũ, không key images", () => {
    const before = buildOllamaPayload({}, history, defaults);
    expect(before.messages.every((m) => !("images" in m))).toBe(true);
    expect(buildOllamaPayload({ images: [] }, history, defaults)).toEqual(before);
  });

  // Cap server (trần cứng, VRAM 16GB + CHAT_NUM_CTX=16384): >2 ảnh, ảnh > ~2.8MB
  // base64, phần tử rỗng/không phải string, hoặc không phải mảng → lý do lỗi.
  test("imagesError: hợp lệ/vắng → null; vượt cap hay sai kiểu → lý do lỗi", () => {
    expect(imagesError(undefined)).toBeNull();
    expect(imagesError(["YQ==", "Yg=="])).toBeNull();
    expect(imagesError(["a", "b", "c"])).toMatch(/max 2/);
    expect(imagesError(["x".repeat(2_800_001)])).toMatch(/base64 chars/);
    expect(imagesError("not-an-array")).toMatch(/array/);
    expect(imagesError([""])).toMatch(/non-empty/);
  });

  // INTENT (quyết định W3): server REJECT 400, KHÔNG strip — client đã degrade
  // thân thiện (cap 2×2MB + notice i18n, rơi về OCR-text) nên request vượt cap
  // tới server = client phi chuẩn/bug; strip im lặng sẽ giấu bug (Rule 12).
  // Validate TRƯỚC mọi I/O: không gọi Ollama, không đụng DB.
  test("POST 3 ảnh → 400 REJECT, không gọi Ollama", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "đây là 3 ảnh", images: ["YQ==", "Yg==", "Yw=="] }),
        }),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/max 2/);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("harness wiring", () => {
  test("internal laam tools luôn có trong schema cho model (kể cả 0 connector)", () => {
    const names = modelToolSchemas(INTERNAL_TOOLS, []).map((t) => t.function.name);
    expect(names).toContain("laam_list_agents");
    expect(names).toContain("laam_find_stuck");
    expect(names.every((n) => typeof n === "string")).toBe(true);
  });
});

describe("RBAC — viewer is read-only (chat creates conversations + runs tools)", () => {
  test("401 when unauthenticated", async () => {
    mockAuth.mockResolvedValueOnce(null as never);
    const res = await POST(
      new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ message: "hi" }) }),
    );
    expect(res.status).toBe(401);
  });

  test("viewer message POST → 403, never reaches Ollama (gate before any I/O)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "viewer" } } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", { method: "POST", body: JSON.stringify({ message: "hi" }) }),
      );
      expect(res.status).toBe(403);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test("viewer confirm POST → 403 (gate fires before the confirm-body branch executes a sealed write)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "viewer" } } as never);
    const res = await POST(
      new Request("http://x/api/chat", {
        method: "POST",
        body: JSON.stringify({ confirm: { token: "anything", approve: true } }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("SP-2 confirm body detection", () => {
  test("nhận diện body confirm", () => {
    expect(isConfirmBody({ confirm: { token: "t", approve: true } })).toBe(true);
  });
  test("body message thường → không phải confirm", () => {
    expect(isConfirmBody({ message: "hi" })).toBe(false);
    expect(isConfirmBody({})).toBe(false);
    expect(isConfirmBody({ confirm: null })).toBe(false);
  });
});

// P3 chat persona: a custom-agent preset's `system` becomes the persona base for
// buildSystemPrompt. INTENT being locked: precedence is override > persona > default.
// A full body.system override (confirm/workflow path) must SUPPRESS the persona; a
// missing/foreign/deleted agent (null) must fall back to the default base — chat
// never breaks on a stale selection.
describe("resolveAgentBase — custom-agent persona precedence", () => {
  const agent = { system: "Bạn là trợ lý kế toán. Trả lời theo chuẩn mực VAS." };

  test("custom agent + no system override → agent.system becomes the base", () => {
    expect(resolveAgentBase(false, agent)).toBe(agent.system);
  });

  test("body.system full-override wins → persona suppressed (base undefined)", () => {
    // confirm/workflow path sends body.system; it must NOT be shadowed by a persona.
    expect(resolveAgentBase(true, agent)).toBeUndefined();
  });

  test("missing/foreign/deleted agent (null) → default base (undefined), not a throw", () => {
    expect(resolveAgentBase(false, null)).toBeUndefined();
    expect(resolveAgentBase(false, undefined)).toBeUndefined();
  });

  test("agent with blank system → ignored (undefined), not an empty persona", () => {
    expect(resolveAgentBase(false, { system: "   " })).toBeUndefined();
  });
});

// Drizzle-shaped chainable fake: mọi builder method trả về chính nó, await → [].
// `values()` ghi lại row để assert phần đã persist. `selects` (optional): hàng đợi
// kết quả cho từng lần db.select() theo THỨ TỰ gọi (thiếu → []) — cho test cần
// conv row / history dài (C1 summarize-pin).
function fakeChainDb(captured: { values: unknown[] }, selects: unknown[][] = []) {
  let s = 0;
  const make = (rows?: unknown[]) => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit", "leftJoin", "set", "returning"]) {
      c[m] = () => c;
    }
    c.values = (v: unknown) => {
      captured.values.push(v);
      return c;
    };
    c.then = (res?: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(rows ?? []).then(res, rej);
    return c;
  };
  return { select: () => make(selects[s++]), insert: () => make(), update: () => make(), delete: () => make() };
}

describe("R0 tool-loop robustness", () => {
  // INTENT: Ollama có thể chết GIỮA tool-loop (sau khi tool frames đã phát live).
  // Trước fix, lỗi bị nuốt fail-soft → completion chạy lại từ messages gốc và
  // thường chết lần nữa → user không có phản hồi, stream treo dở. Người dùng PHẢI
  // nhận thông điệp lỗi và stream phải đóng sạch (persist lượt assistant lỗi).
  test("Ollama rớt ở round 2 → stream phát lỗi thân thiện, đóng SẠCH, không fail-soft sang completion", async () => {
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Round 1: model yêu cầu gọi tool (read nội bộ → loop sang round 2).
    // Round 2: Ollama rớt. Mock KHÔNG echo input — reply round 1 là tool_calls thuần.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          message: { content: "", tool_calls: [{ function: { name: "laam_list_agents", arguments: {} } }] },
        }),
      })
      .mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED"));
    vi.stubGlobal("fetch", fetchMock);

    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "liệt kê agent đang theo dõi" }),
        }),
      );
      expect(res.headers.get("x-conversation-id")).toBeTruthy();
      const text = await res.text(); // resolve ⇒ controller đã close (không treo, không unhandled rejection)
      // Round 1 đã phát tool frame live; round 2 chết → lỗi phải tới user.
      expect(text).toContain("laam_list_agents");
      expect(text).toContain("Không kết nối được Ollama");
      // KHÔNG fail-soft sang completion: đúng 2 lần gọi Ollama, không có lần 3.
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Lượt assistant (text lỗi) được persist → mở lại hội thoại không mất lượt.
      const assistantRows = captured.values.filter(
        (v) => (v as { role?: string }).role === "assistant",
      ) as { content?: string }[];
      expect(assistantRows.some((v) => String(v.content).includes("Không kết nối được Ollama"))).toBe(true);
      // Quan sát được trong log server (Rule 12 — fail loud).
      expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("tool-loop failed"), expect.anything());
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // BUG prod: upload PDF → ChatClient đọc file.text() ra rác nhị phân chứa NUL → message
  // có NUL → insert chatMessages (KHÔNG fail-soft, route.ts:217) ném vì Postgres TEXT không
  // lưu NUL → 500 "Lỗi server". Server PHẢI strip NUL trước persist (defense-in-depth).
  test("message chứa NUL (PDF đọc-nhầm-thành-text) → strip NUL trước persist, không crash", async () => {
    const NUL = String.fromCharCode(0);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Ollama không phải trọng tâm — reject để lượt kết thúc nhanh; điểm test = user msg đã persist.
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    try {
      const dirty = "tóm tắt file này: " + NUL + "%PDF-1.7" + NUL + "rác-nhị-phân" + NUL;
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: dirty }),
        }),
      );
      expect(res.status).not.toBe(500);
      await res.text();
      const userRows = captured.values.filter((v) => (v as { role?: string }).role === "user") as { content?: string }[];
      expect(userRows.length).toBeGreaterThan(0);
      for (const r of userRows) expect(String(r.content)).not.toContain(NUL); // Postgres lưu được
      expect(userRows.some((r) => String(r.content).includes("%PDF-1.7"))).toBe(true); // giữ phần text
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });
});

// ---------------------------------------------------------------------------
// C1 — Claude provider MVS (chat + stream only; KHÔNG tools/vision; KHÔNG tự
// fallback Ollama). Các test dưới dùng adapter THẬT (src/lib/llm/claude) — không
// network vì ANTHROPIC_API_KEY bị stub rỗng ⇒ ClaudeUnavailableError('auth')
// TRƯỚC khi chạm SDK.
// ---------------------------------------------------------------------------
describe("C1 Claude provider MVS", () => {
  test("model bắt đầu 'claude' nhưng NGOÀI whitelist → 400, không silent fallback, không đụng DB/Ollama", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ message: "hi", model: "claude-haiku-4-5" }),
        }),
      );
      expect(res.status).toBe(400);
      expect(((await res.json()) as { error: string }).error).toMatch(/claude/i);
      expect(fetchMock).not.toHaveBeenCalled();
      // 400 phải xảy ra TRƯỚC khi tạo conversation / persist message.
      expect(captured.values).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
      _db = {};
    }
  });

  test("model claude hợp lệ nhưng server KHÔNG có ANTHROPIC_API_KEY → notice tri-lingual (persist), KHÔNG gọi Ollama, KHÔNG token frame", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "xin chào", model: "claude-sonnet-4-6" }),
        }),
      );
      expect(res.headers.get("x-conversation-id")).toBeTruthy();
      const text = await res.text(); // resolve ⇒ stream đóng SẠCH
      expect(text).toContain("Không gọi được Claude API");
      expect(text).toContain("auth"); // code lỗi hiển thị để user/ops phân biệt
      expect(text).not.toContain('"t":"tokens"'); // không có completion → không token frame
      expect(fetchMock).not.toHaveBeenCalled(); // QUYẾT ĐỊNH MVS: không retry Ollama tự động
      const assistantRows = captured.values.filter(
        (v) => (v as { role?: string }).role === "assistant",
      ) as { content?: string }[];
      expect(assistantRows.some((v) => String(v.content).includes("Không gọi được Claude API"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // Summarize runs on the INTERNAL model (cloud-first router, lib/llm/internal.ts),
  // NOT the user's chat model. With no cloud key in the test env the router resolves to
  // the local model (DEFAULT_CHAT_MODEL) — so summarize never tries to summarize a long
  // history with the (here unavailable) Claude chat model.
  test("SP-3 summarize uses the internal model, not the chat model (Claude)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    vi.stubEnv("INTERNAL_MODEL", "");
    vi.stubEnv("DEFAULT_CHAT_MODEL", "qwen-local");
    // Ép budget replay cloud xuống floor (= budget local) để fixture ~50k chars vẫn
    // vượt ngưỡng và kích summarize — test này kiểm MODEL nào summarize, không kiểm
    // NGƯỠNG cloud (ngưỡng có test riêng ở lib/chat/replay-budget.test.ts).
    vi.stubEnv("CLOUD_REPLAY_BUDGET_CHARS", "1");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const big = "x".repeat(10_000);
    const longHistory = [
      { id: "m1", role: "user", content: big },
      { id: "m2", role: "assistant", content: big },
      { id: "m3", role: "user", content: big },
      { id: "m4", role: "assistant", content: big },
      { id: "m5", role: "user", content: big },
      { id: "m6", role: "user", content: "câu hỏi mới" },
    ];
    const convRow = { id: "c1", userId: "u1", summary: null, summarizedThroughId: null, proactiveState: null };
    const captured = { values: [] as unknown[] };
    // select #1 = conv lookup, select #2 = history, còn lại (proactive…) → [].
    _db = fakeChainDb(captured, [[convRow], longHistory]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // fetch #1 = summarize (Ollama, non-stream). Claude path sau đó KHÔNG fetch (auth notice).
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: "tóm tắt cũ" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ conversationId: "c1", message: "câu hỏi mới", model: "claude-sonnet-4-6" }),
        }),
      );
      await res.text();
      // EXACTLY 1 fetch (summarize) — payload carries the internal model, NOT claude.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const sumBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { model: string };
      expect(sumBody.model).toBe("qwen-local");
      expect(sumBody.model).not.toContain("claude");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // Contract (anti-regression cho FULL sau này): MVS Claude KHÔNG vào tool-loop;
  // đường Ollama giữ nguyên tool-loop.
  test("contract: runToolRounds KHÔNG được gọi cho model claude; CÓ được gọi cho model Ollama", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // --- nhánh Claude ---
    orch.runToolRounds.mockClear();
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    _db = fakeChainDb({ values: [] });
    vi.stubGlobal("fetch", vi.fn());
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "hi", model: "claude-opus-4-8" }),
        }),
      );
      await res.text();
      expect(orch.runToolRounds).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
    // --- nhánh Ollama ---
    orch.runToolRounds.mockClear();
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    _db = fakeChainDb({ values: [] });
    const ndjson = JSON.stringify({ message: { content: "chào" }, done: true, prompt_eval_count: 1, eval_count: 2 }) + "\n";
    const fetchMock = vi
      .fn()
      // round 1 tool-loop: không tool_calls → loop kết thúc
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: { content: "" } }) })
      // completion cuối: NDJSON stream
      .mockResolvedValueOnce({
        ok: true,
        body: {
          getReader: () => {
            let sent = false;
            return {
              read: async () => {
                if (sent) return { done: true as const, value: undefined };
                sent = true;
                return { done: false as const, value: new TextEncoder().encode(ndjson) };
              },
            };
          },
        },
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "hi" }),
        }),
      );
      await res.text();
      expect(orch.runToolRounds).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });
});

// ---------------------------------------------------------------------------
// C1 review hardening (follow-up 22ddf44): tool-less prompt, abort propagation,
// fail-loud trên lỗi bất ngờ (không bao giờ đóng stream 0 byte), omit tokens
// frame khi usage chưa tới.
// ---------------------------------------------------------------------------
describe("C1 review hardening", () => {
  // Helper: POST 1 lượt chat với model claude (key rỗng trừ khi claudeStream bị mock).
  function claudePost(body: Record<string, unknown>) {
    return POST(
      new Request("http://x/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
        body: JSON.stringify({ model: "claude-sonnet-4-6", ...body }),
      }),
    );
  }

  // IMPORTANT 2: Claude KHÔNG có tools ở MVS → system prompt phải render TOOL-LESS.
  // Prompt liệt kê tool + "BẮT BUỘC gọi công cụ" cho model không có tool ⇒ Claude
  // bịa cú pháp tool / claim sai. (handleConfirm đã dùng tools:[] — main turn phải vậy.)
  test("IMPORTANT 2: system prompt cho Claude KHÔNG chứa tên tool / 'BẮT BUỘC' (tool-less render)", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    llm.claudeStream.mockClear();
    _db = fakeChainDb({ values: [] });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn());
    try {
      const res = await claudePost({ message: "xin chào" });
      await res.text();
      expect(llm.claudeStream).toHaveBeenCalledTimes(1);
      const arg = llm.claudeStream.mock.calls[0][0] as { messages: { role: string; content: string }[] };
      expect(arg.messages[0].role).toBe("system");
      expect(arg.messages[0].content).not.toContain("laam_list_agents");
      expect(arg.messages[0].content).not.toContain("BẮT BUỘC");
      // vẫn là persona LAAM thật (không phải prompt rỗng)
      expect(arg.messages[0].content).toContain("LAAM");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // IMPORTANT 3 (nửa route): req.signal phải đi tới adapter — bấm Stop hủy LUÔN
  // request Anthropic đang tính phí (adapter forward tiếp cho SDK — test ở claude.test.ts).
  test("IMPORTANT 3: route truyền req.signal vào claudeStream", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    llm.claudeStream.mockClear();
    _db = fakeChainDb({ values: [] });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn());
    try {
      const res = await claudePost({ message: "xin chào" });
      await res.text();
      const arg = llm.claudeStream.mock.calls[0][0] as { signal?: unknown };
      expect(arg.signal).toBeInstanceOf(AbortSignal);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // CRITICAL 1b (main turn): lỗi KHÔNG-unavailable (vd 400 first-message-must-be-user
  // do planHistory cắt cửa sổ) TRƯỚC delta đầu — trước fix chỉ console.error rồi đóng
  // stream 0 BYTE, không persist gì ⇒ user thấy bong bóng rỗng LẶP LẠI MỌI LƯỢT
  // (watermark đứng yên). Phải fail loud: notice code 'api' + persist (Rule 12).
  test("CRITICAL 1b: lỗi bất ngờ TRƯỚC delta đầu → notice 'api' trong body + persist assistant, không 0-byte", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.claudeStream.mockImplementationOnce(async function* () {
      throw Object.assign(new Error('messages: first message must use the "user" role'), { status: 400 });
    });
    vi.stubGlobal("fetch", vi.fn());
    try {
      const res = await claudePost({ message: "xin chào" });
      const text = await res.text();
      expect(text).toContain("Không gọi được Claude API");
      expect(text).toContain("api"); // mã lỗi hiển thị để user/ops phân biệt
      expect(text).not.toContain('"t":"tokens"'); // không completion → không token frame
      const assistantRows = captured.values.filter(
        (v) => (v as { role?: string }).role === "assistant",
      ) as { content?: string }[];
      expect(assistantRows.some((v) => String(v.content).includes("Không gọi được Claude API"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // MINOR 4: đứt GIỮA stream — usage chưa bao giờ tới. Lượt này CÓ tính phí thật ở
  // Anthropic; phát {t:"tokens"} 0/0 là $0 GIẢ. Phải: giữ partial (persist + đã stream
  // live), OMIT frame tokens, persist KHÔNG kèm tokensIn/Out 0/0.
  test("MINOR 4: lỗi giữa stream → partial giữ nguyên, OMIT frame tokens, persist không tokens 0/0", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.claudeStream.mockImplementationOnce(async function* () {
      yield { delta: "một phần trả lời " };
      throw Object.assign(new Error("overloaded"), { status: 529 });
    });
    vi.stubGlobal("fetch", vi.fn());
    try {
      const res = await claudePost({ message: "xin chào" });
      const text = await res.text();
      expect(text).toContain("một phần trả lời ");
      expect(text).not.toContain('"t":"tokens"');
      const row = captured.values.find(
        (v) => (v as { role?: string }).role === "assistant",
      ) as Record<string, unknown>;
      expect(String(row.content)).toContain("một phần trả lời ");
      expect(row).not.toHaveProperty("tokensIn");
      expect(row).not.toHaveProperty("tokensOut");
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // CRITICAL 1b (resume): write ĐÃ thực thi rồi mới stream tường thuật — Claude rớt
  // TRƯỚC delta (kể cả lỗi bất ngờ, không chỉ unavailable) thì user vẫn PHẢI biết
  // hành động đã chạy (mất tường thuật ≠ mất hành động) + notice được persist.
  test("CRITICAL 1b (resume): streamClaudeCompletion rớt trước delta → 'Đã thực hiện hành động' + notice 'api' + persist", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    // select #1 = history (handleConfirm); các select sau (audit nonce window) → [].
    _db = fakeChainDb(captured, [
      [
        { role: "user", content: "tạo card Mua sữa" },
        { role: "assistant", content: 'Tạo card "Mua sữa" trong danh sách l1.' },
      ],
    ]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    llm.claudeStream.mockImplementationOnce(async function* () {
      throw Object.assign(new Error("bad request"), { status: 400 });
    });
    vi.stubGlobal("fetch", vi.fn());
    const now = Date.now();
    const token = sealPendingWrite({
      v: 1,
      name: "trello_create_card",
      args: { idList: "l1", name: "Mua sữa" },
      conversationId: "c1",
      userId: "u1",
      iat: now,
      exp: now + 60_000,
      nonce: crypto.randomUUID(),
      model: "claude-sonnet-4-6", // C1: confirm narrate bằng model lượt gốc → đường Claude
    });
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ confirm: { token, approve: true } }),
        }),
      );
      const text = await res.text();
      expect(text).toContain("Đã thực hiện hành động");
      expect(text).toContain("Không gọi được Claude API");
      expect(text).not.toContain('"t":"tokens"'); // usage chưa tới → omit (MINOR 4)
      const assistantRows = captured.values.filter(
        (v) => (v as { role?: string }).role === "assistant",
      ) as { content?: string }[];
      expect(assistantRows.some((v) => String(v.content).includes("Đã thực hiện hành động"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });
});

// ---------------------------------------------------------------------------
// R4 — a CONFIRMED write must land in chat_tool_call. Previously handleConfirm
// streamed the narration without `persist`, so the executed write surfaced a
// trace frame but never persisted a tool turn (documented gap). The tool turn is
// the LAST two resume messages [assistant{tool_calls:[write]}, tool{result}].
// ---------------------------------------------------------------------------
describe("R4 — confirmed write persists chat_tool_call", () => {
  test("Ollama confirm → tool turn row inserted (name)", async () => {
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    // select #1 = history (handleConfirm); isNonceUsed audit-window select → [].
    _db = fakeChainDb(captured, [[{ role: "user", content: "tạo task" }, { role: "assistant", content: 'Tạo "X".' }]]);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Resume narration = a one-line Ollama NDJSON stream.
    const ndjson = JSON.stringify({ message: { content: "Đã tạo." }, done: true, prompt_eval_count: 1, eval_count: 1 }) + "\n";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let sent = false;
          return { read: async () => sent ? { done: true as const, value: undefined } : (sent = true, { done: false as const, value: new TextEncoder().encode(ndjson) }) };
        },
      },
    }));
    const now = Date.now();
    const token = sealPendingWrite({
      v: 1, name: "demo_create_task", args: { title: "X" },
      conversationId: "c1", userId: "u1", iat: now, exp: now + 60_000,
      nonce: crypto.randomUUID(), model: "qwen3-vl:8b-instruct-q8_0", // Ollama → Ollama resume path
    });
    try {
      const res = await POST(new Request("http://x/api/chat", {
        method: "POST", headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
        body: JSON.stringify({ confirm: { token, approve: true } }),
      }));
      await res.text();
      // chatToolCalls insert is the only ARRAY of rows captured; find our tool by name.
      const toolRows = captured.values
        .filter((v): v is { name?: string }[] => Array.isArray(v))
        .flat()
        .filter((r): r is { name?: string } => !!r && typeof r === "object" && "name" in r);
      expect(toolRows.some((r) => r.name === "demo_create_task")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      errSpy.mockRestore();
      _db = {};
    }
  });
});

// ---------------------------------------------------------------------------
// BytePlus provider — FULL agent (user's choice). Unlike Claude's no-tool MVS,
// a BytePlus model runs the SAME gated tool-loop as Ollama, then streams the final
// completion. Uses the REAL adapter (src/lib/llm/byteplus) over a mocked fetch so the
// OpenAI-compat wire is exercised end-to-end.
// ---------------------------------------------------------------------------
describe("BytePlus provider (full agent — tool-loop + streaming)", () => {
  const BP_MODEL = "gpt-oss-120b";

  // CONTRACT (differentiator vs Claude): a BytePlus model MUST enter runToolRounds
  // (full agent), then stream. byteplusChat for the round (no tool_calls → loop ends),
  // byteplusStream for the completion; usage → a {t:"tokens"} frame.
  test("runs the tool-loop (runToolRounds called) then streams; token frame from usage", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "bp-key");
    orch.runToolRounds.mockClear();
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    _db = fakeChainDb({ values: [] });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const sse =
      'data: {"choices":[{"delta":{"content":"chào"}}]}\n\n' +
      'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":3}}\n\n' +
      "data: [DONE]\n\n";
    const fetchMock = vi
      .fn()
      // round 1: OpenAI non-stream, NO tool_calls
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "" } }] }) })
      // round 2: G4 grounding guard hỏi lại ĐÚNG một lần khi vòng 0 không chạm tool nào;
      // vẫn không tool_calls → loop kết thúc (chitchat không bị ép gọi tool).
      .mockResolvedValueOnce({ ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "" } }] }) })
      // final completion: OpenAI SSE
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            let sent = false;
            return { read: async () => (sent ? { done: true as const, value: undefined } : ((sent = true), { done: false as const, value: new TextEncoder().encode(sse) })) };
          },
        },
      });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "xin chào", model: BP_MODEL }),
        }),
      );
      expect(res.headers.get("x-conversation-id")).toBeTruthy();
      const text = await res.text();
      expect(orch.runToolRounds).toHaveBeenCalledTimes(1); // full agent (Claude would be 0)
      expect(fetchMock.mock.calls[0][0]).toContain("/chat/completions"); // BytePlus, not Ollama
      expect(text).toContain("chào"); // streamed delta reached the user
      expect(text).toContain('"t":"tokens"'); // usage → token frame
      expect(fetchMock).toHaveBeenCalledTimes(3); // round + G4 hỏi lại 1 lần + completion, no Ollama
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // Fail loud (Rule 12): a BytePlus model with NO server key → adapter throws 'auth'
  // BEFORE any network; the route surfaces a tri-lingual coded notice + persists it,
  // never a silent Ollama fallback.
  test("no BYTEPLUS_API_KEY → coded notice (persisted), no fetch, no Ollama fallback", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "xin chào", model: BP_MODEL }),
        }),
      );
      const text = await res.text();
      expect(text).toContain("Không gọi được BytePlus API");
      expect(text).toContain("auth");
      expect(fetchMock).not.toHaveBeenCalled();
      const assistantRows = captured.values.filter((v) => (v as { role?: string }).role === "assistant") as { content?: string }[];
      expect(assistantRows.some((v) => String(v.content).includes("Không gọi được BytePlus API"))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  // Fixture SSE cho gọi byteplusStream giả — chuỗi các `data:` frame + [DONE].
  function sseBody(sse: string) {
    return {
      getReader: () => {
        let sent = false;
        return { read: async () => (sent ? { done: true as const, value: undefined } : ((sent = true), { done: false as const, value: new TextEncoder().encode(sse) })) };
      },
    };
  }
  const noToolRound = { ok: true, status: 200, text: async () => "", json: async () => ({ choices: [{ message: { role: "assistant", content: "" } }] }) };
  // Round 1 + G4 grounding-guard hỏi lại (round 2) — cả hai không tool_calls → tool-loop kết
  // thúc, y hệt test "runs the tool-loop..." ở trên. Đơn giản hoá phần chung cho 2 test dưới.
  function bareTurnFetch(...finals: unknown[]) {
    return vi.fn().mockResolvedValueOnce(noToolRound).mockResolvedValueOnce(noToolRound).mockResolvedValueOnce(finals[0]).mockResolvedValueOnce(finals[1]);
  }

  // D2b — soi ra qua investigation "final-completion trả rỗng": byteplusStream() (bước hoàn
  // tất, KHÔNG có tools trong request — lib/llm/byteplus.ts:242-247) chỉ đọc delta.content;
  // nếu model tự sinh tool_calls (hoặc chỉ reasoning_content) ở BƯỚC NÀY, generator không yield
  // gì → `full` rỗng. route.ts ĐÃ có phòng thủ (comment "ONE-SHOT RETRY" + "Fail loud") nhưng
  // KHÔNG có test nào xác nhận — hai test này đóng lỗ hổng đó (Rule 9: test phải đỏ nếu logic
  // retry/fail-loud bị xoá, không chỉ đo hành vi hiện tại).
  test("D2b: hoàn tất đầu tiên RỖNG (model burn hết vào reasoning) → retry 1 lần, dùng nội dung retry", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "bp-key");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    _db = fakeChainDb({ values: [] });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Hoàn tất lần 1: chỉ reasoning_content, KHÔNG content → full rỗng sau vòng này.
    const emptySse = 'data: {"choices":[{"delta":{"reasoning_content":"đang nghĩ..."}}]}\n\n' + "data: [DONE]\n\n";
    // Retry (sau SYNTH_NUDGE): có content thật.
    const retrySse = 'data: {"choices":[{"delta":{"content":"Câu trả lời sau khi nhắc lại."}}]}\n\n' + "data: [DONE]\n\n";
    const fetchMock = bareTurnFetch({ ok: true, status: 200, body: sseBody(emptySse) }, { ok: true, status: 200, body: sseBody(retrySse) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "xin chào", model: BP_MODEL }),
        }),
      );
      const text = await res.text();
      expect(fetchMock).toHaveBeenCalledTimes(4); // round + G4 + hoàn tất rỗng + retry
      expect(text).toContain("Câu trả lời sau khi nhắc lại.");
      expect(text).not.toContain("không trả về nội dung"); // KHÔNG rơi vào fail-loud — retry đã cứu được
      // Retry phải kèm SYNTH_NUDGE ("KHÔNG gọi thêm công cụ") — nudge sai thì retry cũng dễ rỗng lại.
      const retryBody = JSON.parse(fetchMock.mock.calls[3][1].body as string);
      expect(retryBody.messages.at(-1).content).toContain("KHÔNG gọi thêm công cụ");
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });

  test("D2b: CẢ hoàn tất lẫn retry đều RỖNG → fail loud (notice rõ ràng), KHÔNG bong bóng rỗng lặng lẽ", async () => {
    vi.stubEnv("BYTEPLUS_API_KEY", "bp-key");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1", role: "member" } } as never);
    const captured = { values: [] as unknown[] };
    _db = fakeChainDb(captured);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const emptySse = "data: [DONE]\n\n"; // không delta nào — mô phỏng model tự sinh tool_calls dù không có tools
    const fetchMock = bareTurnFetch({ ok: true, status: 200, body: sseBody(emptySse) }, { ok: true, status: 200, body: sseBody(emptySse) });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const res = await POST(
        new Request("http://x/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json", cookie: "laam_lang=vi" },
          body: JSON.stringify({ message: "xin chào", model: BP_MODEL }),
        }),
      );
      const text = await res.text();
      expect(fetchMock).toHaveBeenCalledTimes(4); // round + G4 + hoàn tất rỗng + retry rỗng, KHÔNG lặp mãi
      expect(text).toContain("không trả về nội dung"); // EMPTY_REPLY — Rule 12, không phải bong bóng trắng
      const assistantRows = captured.values.filter((v) => (v as { role?: string }).role === "assistant") as { content?: string }[];
      expect(assistantRows.some((v) => String(v.content).includes("không trả về nội dung"))).toBe(true); // persist, không mất lượt
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
      errSpy.mockRestore();
      _db = {};
    }
  });
});
