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
// `values()` ghi lại row để assert phần đã persist.
function fakeChainDb(captured: { values: unknown[] }) {
  const make = () => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "orderBy", "limit", "leftJoin", "set", "returning"]) {
      c[m] = () => c;
    }
    c.values = (v: unknown) => {
      captured.values.push(v);
      return c;
    };
    c.then = (res?: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(res, rej);
    return c;
  };
  return { select: make, insert: make, update: make, delete: make };
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
