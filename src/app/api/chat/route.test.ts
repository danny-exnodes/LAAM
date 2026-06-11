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

import { auth } from "@/auth";
import { POST, buildOllamaPayload, isConfirmBody, imagesError } from "./route";

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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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

  // PIN summarize: callModelText fetch OLLAMA — đưa model claude vào đó sẽ lỗi
  // MỌI lượt dài. Summarize phải chạy model local (MODEL env) bất kể chat model.
  test("SP-3 summarize được PIN về MODEL env (Ollama) kể cả khi chat model là Claude", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
      // ĐÚNG 1 lần fetch (summarize) — và payload mang MODEL env, KHÔNG phải model claude.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const sumBody = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body) as { model: string };
      expect(sumBody.model).toBe("gemma4:e4b");
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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
    mockAuth.mockResolvedValueOnce({ user: { id: "u1" } } as never);
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
