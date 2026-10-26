# Larvis Display Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Larvis (`/constellation`) hiển thị bảng/biểu đồ trên một panel kính giữa màn hình, còn giọng nói chỉ đọc phần văn xuôi — không đọc cú pháp markdown.

**Architecture:** Descriptor dữ liệu (`ViewDescriptor`) đến từ hai nguồn: (A) code suy ra từ tool result trong `runToolRounds`, gom cả lượt rồi phát **một** frame `{t:"view"}` ở cuối qua giao thức frame U+001E sẵn có; (B) khi lượt không gọi tool nào, client tách bảng GFM / block ` ```chart ` ra khỏi câu trả lời trước khi đưa vào TTS. A luôn thắng B. Panel là component client thuần, không persist.

**Tech Stack:** Next.js 16 App Router · React 19 · TypeScript strict · Tailwind v4 · recharts (qua `ChartBlock` sẵn có) · Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-04-larvis-display-panel-design.md`

## Global Constraints

- **Rule 5:** dựng descriptor bằng code, không hỏi model. Không phân loại ý định.
- **Rule 13:** số liệu trên panel phải là số code lấy được từ tool result, không phải số model kể lại.
- **Rule 3:** sửa tối thiểu. Không refactor `ChartBlock`, `MarkdownView`, `drilldown.ts` (ngoài đúng 1 dòng `export`), `stripForSpeech`.
- **`stripForSpeech` không được đổi hành vi** — `ConstellationV2Client.tsx` vẫn dùng nó và v2 chưa có panel.
- **Phạm vi:** chỉ `/constellation` (v1). Không đụng `ChatClient.tsx`, không đụng `/constellation-v2`.
- **Ngưỡng cố định:** `MAX_ROWS = 50` (dòng giữ trong descriptor), `MAX_CHART_ROWS = 25` (trên mức này không gợi ý chart).
- **i18n:** mọi chuỗi hiển thị/đọc mới phải có đủ **vi / en / zh** trong `src/i18n/dictionaries/constellation.ts`.
- **A11y:** panel dùng `role="region"` + `aria-label`, **không** `role="dialog"` (nó không modal).
- **Test:** Vitest, file `.test.ts(x)` đặt cạnh file nguồn. Chạy `npx vitest run <path>`.
- **Kiểu:** TypeScript strict — không `any`, dùng `unknown` + thu hẹp kiểu.
- **Commit:** conventional commits, tiếng Việt ở phần body nếu cần giải thích.

---

## File Structure

| File | Trạng thái | Trách nhiệm |
|---|---|---|
| `src/lib/agent/view.ts` | tạo | Kiểu `ViewDescriptor` + `deriveFromToolResult` + `pickTurnView` (thuần, không React, không I/O) |
| `src/lib/agent/view.test.ts` | tạo | Test cho trên |
| `src/lib/agent/drilldown.ts` | sửa 1 dòng | `export` hàm `unwrap` dưới tên `unwrapToolResult` |
| `src/lib/agent/orchestrator.ts` | sửa | Gom descriptor suốt lượt, gọi `onView` đúng 1 lần khi kết thúc |
| `src/lib/chat/frames.ts` | sửa | Thêm biến thể `{ t: "view"; d: ViewDescriptor }` |
| `src/app/api/chat/route.ts` | sửa | Truyền `onView`, nhét frame `view` vào `leadingFrames` (2 chỗ) |
| `src/lib/chat/voice.ts` | sửa | Thêm `extractForSpeech` (nguồn B) — `stripForSpeech` giữ nguyên |
| `src/lib/chat/view-render.ts` | tạo | `descriptorToChartRaw` — serialize descriptor → JSON Chart.js cho `ChartBlock` |
| `src/components/constellation/DisplayPanel.tsx` | tạo | Panel + bảng + pill + đóng/mở + mật độ + a11y |
| `src/components/constellation/useConstellationChat.ts` | sửa | Bắt frame `view`, gọi `onView` |
| `src/components/constellation/ConstellationClient.tsx` | sửa | State panel, ưu tiên A/B, chèn câu chỉ dẫn, render `DisplayPanel` + pill |
| `src/i18n/dictionaries/constellation.ts` | sửa | 6 khoá mới × 3 ngôn ngữ |
| `CHANGELOG.md` · `README.md` | sửa | Ghi tính năng |

---

## Task 1: `ViewDescriptor` + suy descriptor từ tool result

**Files:**
- Create: `src/lib/agent/view.ts`
- Create: `src/lib/agent/view.test.ts`
- Modify: `src/lib/agent/drilldown.ts:61` (đổi `function unwrap` → `export function unwrapToolResult`, cập nhật 1 chỗ gọi trong file)

**Interfaces:**
- Consumes: `unwrapToolResult(result: unknown): unknown` từ `drilldown.ts`
- Produces:
  - `type ViewDescriptor` (xem code Step 3)
  - `deriveFromToolResult(toolName: string, result: unknown, at: number): ViewDescriptor | null`
  - `pickTurnView(views: ViewDescriptor[]): ViewDescriptor | null`
  - hằng `MAX_ROWS = 50`, `MAX_CHART_ROWS = 25`

- [ ] **Step 1: Mở `export` cho `unwrapToolResult`**

Trong `src/lib/agent/drilldown.ts`, đổi khai báo (khoảng dòng 61):

```ts
// MCP trả kết quả dạng { text: "<chuỗi JSON>" }; tool nội bộ trả object thuần. Nhận cả hai.
export function unwrapToolResult(result: unknown): unknown {
```

Rồi sửa chỗ gọi duy nhất trong file (tìm bằng `grep -n "unwrap(" src/lib/agent/drilldown.ts`) từ `unwrap(` thành `unwrapToolResult(`.

- [ ] **Step 2: Viết test thất bại**

Tạo `src/lib/agent/view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { deriveFromToolResult, pickTurnView, MAX_ROWS } from "./view";

const AT = 1_700_000_000_000;

describe("deriveFromToolResult", () => {
  it("mảng object đồng nhất → table, cột lấy từ khoá của dòng đầu", () => {
    const d = deriveFromToolResult("kg_list_stores", [
      { store_id: "PH-005", variance: 1015 },
      { store_id: "PH-003", variance: 542 },
    ], AT);
    expect(d?.kind).toBe("table");
    expect(d?.columns?.map((c) => c.key)).toEqual(["store_id", "variance"]);
    expect(d?.rows).toHaveLength(2);
    expect(d?.source).toEqual({ type: "tool", toolName: "kg_list_stores", at: AT });
  });

  it("cột số canh phải, cột chữ canh trái — để bảng đọc được khi liếc", () => {
    const d = deriveFromToolResult("t", [
      { name: "a", n: 1 },
      { name: "b", n: 2 },
    ], AT);
    expect(d?.columns).toEqual([
      { key: "name", label: "name", align: "left" },
      { key: "n", label: "n", align: "right" },
    ]);
  });

  it("có cột số + cột nhãn và đủ ngắn → gợi ý bar chart", () => {
    const d = deriveFromToolResult("t", [
      { store: "PH-005", variance: 1015 },
      { store: "PH-003", variance: 542 },
    ], AT);
    expect(d?.chart).toEqual({ type: "bar", labelKey: "store", valueKey: "variance" });
  });

  it("quá 25 dòng thì KHÔNG gợi ý chart — bar 26 cột là nhiễu, không phải thông tin", () => {
    const rows = Array.from({ length: 26 }, (_, i) => ({ store: `S${i}`, variance: i }));
    expect(deriveFromToolResult("t", rows, AT)?.chart).toBeUndefined();
  });

  it("mảng dài bị cắt còn MAX_ROWS và ghi lại tổng thật — không im lặng cắt bớt", () => {
    const rows = Array.from({ length: 666 }, (_, i) => ({ product: `P${i}`, qty: -i }));
    const d = deriveFromToolResult("t", rows, AT);
    expect(d?.rows).toHaveLength(MAX_ROWS);
    expect(d?.truncated).toEqual({ shown: MAX_ROWS, total: 666 });
  });

  it("kết quả MCP dạng { text: '<json>' } cũng nhận ra", () => {
    const raw = { text: JSON.stringify([{ a: "x", b: 1 }, { a: "y", b: 2 }]) };
    expect(deriveFromToolResult("t", raw, AT)?.kind).toBe("table");
  });

  it("mảng nằm sâu trong object cũng tìm ra (tool không neo cứng khoá)", () => {
    const raw = { ok: true, stores: [{ a: "x", b: 1 }, { a: "y", b: 2 }] };
    expect(deriveFromToolResult("t", raw, AT)?.rows).toHaveLength(2);
  });

  it("object đơn nhiều field → record", () => {
    const d = deriveFromToolResult("t", { store_id: "PH-001", city: "Frisco", open: true }, AT);
    expect(d?.kind).toBe("record");
    expect(d?.rows).toEqual([{ store_id: "PH-001", city: "Frisco", open: true }]);
  });

  it("một con số → stat", () => {
    expect(deriveFromToolResult("t", 666, AT)?.kind).toBe("stat");
  });

  it("shape không nhận ra → null, KHÔNG dựng panel rỗng", () => {
    expect(deriveFromToolResult("t", null, AT)).toBeNull();
    expect(deriveFromToolResult("t", { text: "không phải json" }, AT)).toBeNull();
    expect(deriveFromToolResult("t", [], AT)).toBeNull();
    expect(deriveFromToolResult("t", ["a", "b"], AT)).toBeNull();
  });

  it("mảng object nhưng khác bộ khoá → null (không phải bảng)", () => {
    expect(deriveFromToolResult("t", [{ a: 1 }, { b: 2 }], AT)).toBeNull();
  });
});

describe("pickTurnView", () => {
  const table = (name: string): ReturnType<typeof deriveFromToolResult> =>
    deriveFromToolResult(name, [{ a: "x", b: 1 }, { a: "y", b: 2 }], AT);

  it("lấy table CUỐI CÙNG — bước 2 của drilldown mới là thứ user hỏi", () => {
    const picked = pickTurnView([table("list")!, table("detail")!]);
    expect(picked?.source).toMatchObject({ toolName: "detail" });
  });

  it("không có table thì mới lấy record/stat cuối", () => {
    const rec = deriveFromToolResult("r", { a: 1, b: 2 }, AT)!;
    expect(pickTurnView([rec])?.kind).toBe("record");
  });

  it("table thắng record kể cả khi record đến sau", () => {
    const rec = deriveFromToolResult("r", { a: 1, b: 2 }, AT)!;
    expect(pickTurnView([table("t")!, rec])?.kind).toBe("table");
  });

  it("rỗng → null", () => {
    expect(pickTurnView([])).toBeNull();
  });
});
```

- [ ] **Step 3: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/lib/agent/view.test.ts`
Expected: FAIL — `Failed to resolve import "./view"`.

- [ ] **Step 4: Viết `src/lib/agent/view.ts`**

```ts
// Descriptor hiển thị cho Larvis: dữ liệu bảng/biểu đồ tách khỏi lời nói.
// THUẦN — không React, không I/O, không gọi model (Rule 5). Số liệu ở đây do CODE
// lấy từ tool result, không phải do model kể lại (Rule 13).
import { unwrapToolResult } from "@/lib/agent/drilldown";

export const MAX_ROWS = 50; // giữ trong descriptor; dài hơn thì cắt + ghi `truncated`
export const MAX_CHART_ROWS = 25; // trên mức này bar chart thành nhiễu, không gợi ý nữa

export type ViewDescriptor = {
  kind: "table" | "chart" | "record" | "stat";
  title: string;
  source: { type: "tool"; toolName: string; at: number } | { type: "model" };
  columns?: { key: string; label: string; align?: "left" | "right" }[];
  rows?: Record<string, unknown>[];
  chart?: { type: "bar" | "line" | "pie"; labelKey: string; valueKey: string };
  truncated?: { shown: number; total: number };
};

type Row = Record<string, unknown>;

const isPlainObject = (v: unknown): v is Row =>
  !!v && typeof v === "object" && !Array.isArray(v);

// Mảng "dạng bảng" = ≥2 object thuần CÙNG bộ khoá. Khác bộ khoá ⇒ không phải bảng:
// dựng bảng từ đó sẽ đẻ ra ô trống rải rác, trông như dữ liệu thiếu chứ không phải
// dữ liệu khác hình dạng.
function asRows(v: unknown): Row[] | null {
  if (!Array.isArray(v) || v.length < 2 || !v.every(isPlainObject)) return null;
  const keys = Object.keys(v[0] as Row);
  if (!keys.length) return null;
  const sig = keys.join(" ");
  const same = (v as Row[]).every((r) => Object.keys(r).join(" ") === sig);
  return same ? (v as Row[]) : null;
}

// Mảng bảng có thể nằm ngay ở gốc hoặc dưới một khoá bất kỳ ({ ok, stores: [...] }).
// Không neo cứng tên khoá — cùng tinh thần findEntities() của drilldown.ts.
function findRows(payload: unknown): Row[] | null {
  const direct = asRows(payload);
  if (direct) return direct;
  if (!isPlainObject(payload)) return null;
  for (const value of Object.values(payload)) {
    const nested = asRows(value);
    if (nested) return nested;
  }
  return null;
}

const isNumeric = (rows: Row[], key: string) =>
  rows.every((r) => typeof r[key] === "number" && Number.isFinite(r[key] as number));

const isLabel = (rows: Row[], key: string) => rows.every((r) => typeof r[key] === "string");

export function deriveFromToolResult(
  toolName: string,
  result: unknown,
  at: number,
): ViewDescriptor | null {
  const payload = unwrapToolResult(result);
  if (payload === null || payload === undefined) return null;

  const source = { type: "tool", toolName, at } as const;

  const found = findRows(payload);
  if (found) {
    const keys = Object.keys(found[0]);
    const rows = found.slice(0, MAX_ROWS);
    const columns = keys.map((key) => ({
      key,
      label: key,
      align: isNumeric(found, key) ? ("right" as const) : ("left" as const),
    }));
    const labelKey = keys.find((k) => isLabel(found, k));
    const valueKey = keys.find((k) => isNumeric(found, k));
    const chart =
      labelKey && valueKey && found.length <= MAX_CHART_ROWS
        ? ({ type: "bar", labelKey, valueKey } as const)
        : undefined;
    return {
      kind: "table",
      title: toolName,
      source,
      columns,
      rows,
      ...(chart ? { chart } : {}),
      ...(found.length > MAX_ROWS ? { truncated: { shown: MAX_ROWS, total: found.length } } : {}),
    };
  }

  if (isPlainObject(payload)) {
    const keys = Object.keys(payload);
    if (keys.length < 2) return null; // 1 field không đáng chiếm cả màn hình
    return {
      kind: "record",
      title: toolName,
      source,
      columns: keys.map((key) => ({ key, label: key })),
      rows: [payload],
    };
  }

  if (typeof payload === "number" && Number.isFinite(payload)) {
    return { kind: "stat", title: toolName, source, rows: [{ value: payload }] };
  }

  return null;
}

// Một lượt có nhiều tool result (drilldown list → detail, tối đa DEFAULT_MAX_ROUNDS
// vòng). Chỉ MỘT panel được hiện, và là cái CUỐI CÙNG có dạng bảng/biểu đồ: bước
// liệt kê chỉ là phương tiện lấy id, bước chi tiết mới là thứ người dùng hỏi.
export function pickTurnView(views: ViewDescriptor[]): ViewDescriptor | null {
  for (let i = views.length - 1; i >= 0; i--) {
    if (views[i].kind === "table" || views[i].kind === "chart") return views[i];
  }
  return views.length ? views[views.length - 1] : null;
}
```

- [ ] **Step 5: Chạy test, xác nhận xanh**

Run: `npx vitest run src/lib/agent/view.test.ts`
Expected: PASS — 15 test.

- [ ] **Step 6: Xác nhận không vỡ drilldown**

Run: `npx vitest run src/lib/agent/drilldown.test.ts && npx tsc --noEmit`
Expected: drilldown PASS như trước; tsc sạch.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/view.ts src/lib/agent/view.test.ts src/lib/agent/drilldown.ts
git commit -m "feat(view): suy ViewDescriptor từ tool result bằng code

Luật thuần cấu trúc, không hỏi model (Rule 5). Cắt ở 50 dòng và ghi
truncated thay vì im lặng bớt. Mở export unwrapToolResult để dùng lại
bộ chuẩn hoá MCP/object của drilldown."
```

---

## Task 2: Orchestrator gom descriptor, phát đúng một lần

**Files:**
- Modify: `src/lib/agent/orchestrator.ts` (`ToolRoundsOpts` ~dòng 80-86; sau `dispatch` ~dòng 151-152; trước `return convo` ~dòng 199)
- Modify: `src/lib/agent/orchestrator.test.ts`

**Interfaces:**
- Consumes: `deriveFromToolResult`, `pickTurnView`, `ViewDescriptor` từ Task 1
- Produces: `ToolRoundsOpts.onView?: (d: ViewDescriptor) => void` — được gọi **tối đa một lần** mỗi lần chạy `runToolRounds`, sau khi vòng lặp kết thúc

- [ ] **Step 1: Viết test thất bại**

**Trước khi viết:** đọc đầu `src/lib/agent/orchestrator.test.ts` và dùng đúng helper dựng `deps` / khuôn mock `callOllama` đang có ở đó. Đoạn dưới là **ý định test và assertion cần đạt**, không phải khuôn mock chuẩn của file — kiểu `ConnectorTool` và `OllamaChatResponse` có shape riêng, ép `as never` bừa sẽ che mất lỗi thật:

```ts
describe("onView", () => {
  const rows = (tag: string) => [{ name: `${tag}-1`, n: 1 }, { name: `${tag}-2`, n: 2 }];

  it("gọi ĐÚNG MỘT LẦN cho cả lượt, dù có nhiều tool result", async () => {
    const seen: unknown[] = [];
    let round = 0;
    await runToolRounds(
      [{ role: "user", content: "hỏi" }],
      [{ function: { name: "list" } }, { function: { name: "detail" } }] as never,
      {
        callOllama: async () => {
          round++;
          if (round === 1) return { message: { tool_calls: [{ function: { name: "list", arguments: {} } }] } } as never;
          if (round === 2) return { message: { tool_calls: [{ function: { name: "detail", arguments: {} } }] } } as never;
          return { message: { content: "xong" } } as never;
        },
        dispatch: async (name: string) => rows(name),
      },
      { onView: (d) => seen.push(d) },
    );
    expect(seen).toHaveLength(1);
  });

  it("chọn tool result CUỐI CÙNG — bước chi tiết, không phải bước liệt kê", async () => {
    const seen: { source?: unknown }[] = [];
    let round = 0;
    await runToolRounds(
      [{ role: "user", content: "hỏi" }],
      [{ function: { name: "list" } }, { function: { name: "detail" } }] as never,
      {
        callOllama: async () => {
          round++;
          if (round === 1) return { message: { tool_calls: [{ function: { name: "list", arguments: {} } }] } } as never;
          if (round === 2) return { message: { tool_calls: [{ function: { name: "detail", arguments: {} } }] } } as never;
          return { message: { content: "xong" } } as never;
        },
        dispatch: async (name: string) => rows(name),
      },
      { onView: (d) => seen.push(d) },
    );
    expect(seen[0].source).toMatchObject({ toolName: "detail" });
  });

  it("KHÔNG gọi khi lượt không có tool result nào dựng được descriptor", async () => {
    const seen: unknown[] = [];
    await runToolRounds(
      [{ role: "user", content: "chào" }],
      [],
      { callOllama: async () => ({ message: { content: "chào bạn" } }) as never, dispatch: async () => null },
      { onView: (d) => seen.push(d) },
    );
    expect(seen).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/lib/agent/orchestrator.test.ts -t onView`
Expected: FAIL — `onView` không tồn tại trong `ToolRoundsOpts` (lỗi kiểu) hoặc `seen` rỗng.

- [ ] **Step 3: Thêm import + trường opts**

Trong `src/lib/agent/orchestrator.ts`, thêm import cạnh import `drilldown` đang có:

```ts
import { deriveFromToolResult, pickTurnView, type ViewDescriptor } from "./view";
```

Thêm dòng cuối vào `ToolRoundsOpts`:

```ts
  // Panel hiển thị: gom descriptor suốt lượt, phát ĐÚNG 1 lần sau khi vòng lặp kết
  // thúc. Không phát sau mỗi dispatch — một lượt có thể có hàng chục tool result và
  // panel sẽ nhảy loạn rồi dừng ở kết quả tình cờ cuối cùng.
  onView?: (d: ViewDescriptor) => void;
```

- [ ] **Step 4: Gom sau mỗi `dispatch`**

Khai báo biến cạnh `const seen = new Map<string, number>();`:

```ts
  const views: ViewDescriptor[] = []; // gom cả lượt, chọn 1 ở cuối (pickTurnView)
```

Ngay sau dòng `convo.push({ role: "tool", content: JSON.stringify(result) });` (~dòng 152), thêm:

```ts
        if (opts.onView) {
          const view = deriveFromToolResult(name, result, Date.now());
          if (view) views.push(view);
        }
```

Và sau dòng tương ứng của nhánh drilldown (`convo.push({ role: "tool", content: JSON.stringify(detail) });`, ~dòng 169), thêm:

```ts
              if (opts.onView) {
                const detailView = deriveFromToolResult(plan.name, detail, Date.now());
                if (detailView) views.push(detailView);
              }
```

- [ ] **Step 5: Phát một lần trước khi trả về**

Đổi cuối hàm từ:

```ts
  return convo;
}
```

thành:

```ts
  const view = pickTurnView(views);
  if (view) opts.onView?.(view);
  return convo;
}
```

- [ ] **Step 6: Chạy test, xác nhận xanh**

Run: `npx vitest run src/lib/agent/orchestrator.test.ts && npx tsc --noEmit`
Expected: PASS toàn bộ file (cả test cũ), tsc sạch.

- [ ] **Step 7: Commit**

```bash
git add src/lib/agent/orchestrator.ts src/lib/agent/orchestrator.test.ts
git commit -m "feat(agent): onView — một lượt phát đúng một descriptor

Gom suốt vòng lặp rồi pickTurnView chọn table/chart cuối cùng, để cặp
drilldown list→detail hiện bước chi tiết chứ không phải bước liệt kê."
```

---

## Task 3: Frame `view` + route phát ở cuối lượt

**Files:**
- Modify: `src/lib/chat/frames.ts` (union `ChatFrame`)
- Modify: `src/lib/chat/frames.test.ts`
- Modify: `src/app/api/chat/route.ts` (2 chỗ gọi `runToolRounds`: ~635 BytePlus, ~848 Ollama; 2 mảng `leadingFrames`: ~798, ~964)

**Interfaces:**
- Consumes: `ViewDescriptor` (Task 1), `ToolRoundsOpts.onView` (Task 2)
- Produces: frame `{ t: "view"; d: ViewDescriptor }` đi qua `encodeFrame`/`splitFrames`, phát **sau** text, cùng chuỗi frame đuôi `cite` → `proactive` → `tokens`

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/lib/chat/frames.test.ts`:

```ts
it("frame view đi qua encode → splitFrames còn nguyên descriptor", () => {
  const d = {
    kind: "table" as const,
    title: "kg_list_stores",
    source: { type: "tool" as const, toolName: "kg_list_stores", at: 1 },
    columns: [{ key: "store", label: "store", align: "left" as const }],
    rows: [{ store: "PH-005" }],
  };
  const raw = "Đây là kết quả." + encodeFrame({ t: "view", d });
  const out = splitFrames(raw);
  expect(out.text).toBe("Đây là kết quả.");
  expect(out.frames).toEqual([{ t: "view", d }]);
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/lib/chat/frames.test.ts -t "frame view"`
Expected: FAIL — lỗi kiểu: `"view"` không gán được cho `ChatFrame`.

- [ ] **Step 3: Thêm biến thể vào union**

Trong `src/lib/chat/frames.ts`, thêm import ở đầu file:

```ts
import type { ViewDescriptor } from "@/lib/agent/view";
```

Và thêm nhánh vào union `ChatFrame`, ngay trước nhánh `proactive`:

```ts
  // Panel hiển thị (Larvis): bảng/biểu đồ render RIÊNG, không nối vào câu trả lời —
  // cùng tinh thần pending_write/proactive. Số liệu do code suy từ tool result
  // (Rule 13). Phát tối đa 1 lần mỗi lượt, ở cuối, cùng chuỗi frame đuôi.
  | { t: "view"; d: ViewDescriptor }
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run src/lib/chat/frames.test.ts`
Expected: PASS.

- [ ] **Step 5: Nối vào route — nhánh BytePlus**

Trong `src/app/api/chat/route.ts`, cạnh `let hitBackstop = false;` (~dòng 632) thêm:

```ts
        // Mảng chứ không phải `let x: ChatFrame | null` — biến chỉ được gán TRONG một
        // callback thì TypeScript thu hẹp kiểu về `null` ở chỗ đọc sau đó và `...(x ? …)`
        // sẽ báo lỗi. `const` + push không dính vấn đề đó.
        const viewFrames: ChatFrame[] = [];
```

Thêm vào object opts của `runToolRounds` (~dòng 635-640), ngay sau `onBackstop`:

```ts
            onView: (d) => { viewFrames.length = 0; viewFrames.push({ t: "view", d }); },
```

Và thêm vào mảng `leadingFrames` (~dòng 798), **trước** `cite`:

```ts
            ...viewFrames,
```

- [ ] **Step 6: Nối vào route — nhánh Ollama**

Lặp lại đúng ba sửa đổi trên cho nhánh thứ hai: khai báo `const viewFrames: ChatFrame[] = [];` cạnh `hitBackstop` của nhánh đó, `onView` trong opts `runToolRounds` (~dòng 848-853), và `...viewFrames,` vào `leadingFrames` (~dòng 964).

- [ ] **Step 7: Xác nhận build + test route**

Run: `npx tsc --noEmit && npx vitest run src/app/api/chat/route.test.ts`
Expected: tsc sạch; route test PASS (số lượt fetch không đổi — `onView` không thêm vòng model nào).

- [ ] **Step 8: Commit**

```bash
git add src/lib/chat/frames.ts src/lib/chat/frames.test.ts src/app/api/chat/route.ts
git commit -m "feat(chat): frame view — descriptor đi kèm chuỗi frame đuôi

Nối vào leadingFrames sẵn có (cite → proactive → tokens) nên không đẻ
cơ chế truyền mới, tránh rủi ro thứ tự của sse-block-ordering-bug."
```

---

## Task 4: `extractForSpeech` — nguồn B (lượt không gọi tool)

**Files:**
- Modify: `src/lib/chat/voice.ts`
- Modify: `src/lib/chat/voice.test.ts`

**Interfaces:**
- Consumes: `ViewDescriptor` (Task 1)
- Produces: `extractForSpeech(md: string): { speech: string; descriptors: ViewDescriptor[] }`
- **Bất biến:** `stripForSpeech` giữ nguyên chữ ký và hành vi cũ (v2 vẫn dùng)

- [ ] **Step 1: Viết test thất bại**

Thêm vào `src/lib/chat/voice.test.ts`:

```ts
import { extractForSpeech, stripForSpeech } from "./voice";

describe("extractForSpeech", () => {
  const TABLE = [
    "| Store | Variance |",
    "|---|---|",
    "| PH-005 | 1015 |",
    "| PH-003 | 542 |",
  ].join("\n");

  it("bảng GFM ra descriptor, và BIẾN MẤT khỏi lời nói", () => {
    const { speech, descriptors } = extractForSpeech(`Kết quả đây.\n\n${TABLE}\n\nHết.`);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].kind).toBe("table");
    expect(descriptors[0].source).toEqual({ type: "model" });
    expect(descriptors[0].columns?.map((c) => c.label)).toEqual(["Store", "Variance"]);
    expect(descriptors[0].rows).toEqual([
      { Store: "PH-005", Variance: "1015" },
      { Store: "PH-003", Variance: "542" },
    ]);
    expect(speech).toBe("Kết quả đây. Hết.");
  });

  it("block chart ra descriptor kind=chart và biến mất khỏi lời nói", () => {
    const md = 'Xem biểu đồ.\n\n```chart\n{"type":"bar","title":"T","data":{"labels":["a"],"datasets":[{"data":[1]}]}}\n```';
    const { speech, descriptors } = extractForSpeech(md);
    expect(descriptors).toHaveLength(1);
    expect(descriptors[0].kind).toBe("chart");
    expect(descriptors[0].title).toBe("T");
    expect(speech).toBe("Xem biểu đồ.");
  });

  it("REGRESSION — đây là chỗ VOICE_GUIDE đã thất bại 2 lần: lời nói không còn cú pháp bảng", () => {
    const { speech } = extractForSpeech(`## Tiêu đề\n\n${TABLE}\n\n**Đậm** xong.`);
    expect(speech).not.toMatch(/\|/);
    expect(speech).not.toMatch(/```/);
    expect(speech).not.toMatch(/[*#]/);
  });

  it("bảng SAI cú pháp (thiếu dòng ---) → không có descriptor, nội dung vẫn được đọc, không lọt ký tự |", () => {
    const broken = "| Store | Variance |\n| PH-005 | 1015 |";
    const { speech, descriptors } = extractForSpeech(`Trước.\n${broken}\nSau.`);
    expect(descriptors).toHaveLength(0);
    expect(speech).not.toMatch(/\|/);
    expect(speech).toMatch(/PH-005/);
  });

  it("stripForSpeech VẪN để lọt | ở bảng hỏng — lỗi có sẵn, extractForSpeech mới là chỗ được vá", () => {
    // Chốt ranh giới: constraint cấm đổi hành vi stripForSpeech (v2 đang dùng).
    // Test này tồn tại để lần sau ai đó "tiện tay sửa luôn" thì thấy đỏ và phải đọc lý do.
    expect(stripForSpeech("| a | b |\n| c | d |")).toMatch(/\|/);
  });

  it("không có bảng/chart → descriptors rỗng, lời nói y như stripForSpeech", () => {
    const md = "**Chào** bạn.\n\n- một\n- hai";
    expect(extractForSpeech(md)).toEqual({ speech: stripForSpeech(md), descriptors: [] });
  });

  it("stripForSpeech KHÔNG đổi hành vi — v2 vẫn cần bảng đọc thành văn xuôi", () => {
    expect(stripForSpeech(TABLE)).toMatch(/Store: PH-005/);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/lib/chat/voice.test.ts -t extractForSpeech`
Expected: FAIL — `extractForSpeech` chưa export.

- [ ] **Step 3: Tách phần dọn văn xuôi thành helper dùng chung**

Trong `src/lib/chat/voice.ts`, thêm ngay **trước** `stripForSpeech`:

```ts
// Phần dọn markdown dùng CHUNG cho stripForSpeech và extractForSpeech — hai hàm chỉ
// khác nhau ở chỗ bảng đi đâu (đọc thành văn xuôi vs. đẩy sang panel). Tách ra để
// chúng không trôi khác nhau theo thời gian.
function cleanProse(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s*[-*+]\s+/gm, "") // bullet markers
    .replace(/[*_~>]/g, "") // emphasis / blockquote marks
    .replace(/\s+/g, " ")
    .trim();
}
```

Và rút gọn `stripForSpeech` (giữ nguyên JSDoc đang có phía trên nó):

```ts
export function stripForSpeech(md: string): string {
  return cleanProse(tablesToProse(md));
}
```

- [ ] **Step 4: Chạy test cũ, xác nhận `stripForSpeech` không đổi**

Run: `npx vitest run src/lib/chat/voice.test.ts`
Expected: mọi test `stripForSpeech` cũ vẫn PASS; test `extractForSpeech` vẫn FAIL.

- [ ] **Step 5: Viết `extractForSpeech`**

Thêm vào cuối phần bảng của `src/lib/chat/voice.ts`, sau `tablesToProse`:

```ts
import type { ViewDescriptor } from "@/lib/agent/view";

// Chỉ nhận bảng GFM ĐÚNG cú pháp (có dòng separator). Bảng hỏng rơi xuống
// tablesToProse ở cuối hàm — nội dung vẫn được đọc, chỉ không lên panel.
function tableToDescriptor(headers: string[], dataRows: string[][]): ViewDescriptor | null {
  if (!headers.length || !dataRows.length) return null;
  const rows = dataRows.map((cells) =>
    Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""])),
  );
  const numeric = (key: string) =>
    rows.every((r) => r[key] !== "" && !Number.isNaN(Number(String(r[key]).replace(/[,\s]/g, ""))));
  return {
    kind: "table",
    title: headers.join(" · "),
    source: { type: "model" },
    columns: headers.map((h) => ({ key: h, label: h, align: numeric(h) ? "right" : "left" })),
    rows,
  };
}

const CHART_FENCE = /```chart\s*([\s\S]*?)```/g;

function chartToDescriptor(body: string): ViewDescriptor | null {
  try {
    const parsed = JSON.parse(body) as { type?: string; title?: string };
    if (!parsed || typeof parsed !== "object") return null;
    return {
      kind: "chart",
      title: typeof parsed.title === "string" ? parsed.title : "",
      source: { type: "model" },
      rows: [{ raw: body.trim() }], // ChartBlock nhận nguyên chuỗi JSON
    };
  } catch {
    return null; // JSON hỏng → không dựng panel; cleanProse sẽ nuốt block như code fence
  }
}

/**
 * extractForSpeech — tách phần NHÌN được (bảng GFM, block ```chart) ra khỏi câu trả
 * lời, trả về lời nói đã sạch cú pháp + danh sách descriptor cho panel.
 *
 * WHY: VOICE_GUIDE bảo model đừng xuất markdown và model phớt lờ (đã sửa prompt 2 lần,
 * xem checkpoint 2026-07-22 / 2026-08-03). Cắt bằng code là thứ chắc chắn (Rule 5).
 *
 * KHÁC stripForSpeech: hàm đó BIẾN bảng thành văn xuôi để đọc; hàm này BỎ bảng khỏi
 * lời nói vì nó sẽ hiện trên panel. Client nào không có panel phải dùng stripForSpeech.
 */
export function extractForSpeech(md: string): { speech: string; descriptors: ViewDescriptor[] } {
  const descriptors: ViewDescriptor[] = [];

  // 1) chart fences
  let rest = md.replace(CHART_FENCE, (_m, body: string) => {
    const d = chartToDescriptor(body);
    if (d) descriptors.push(d);
    return "\n";
  });

  // 2) bảng GFM đúng cú pháp
  const lines = rest.split("\n");
  const kept: string[] = [];
  let i = 0;
  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableCells(lines[i]);
      const dataRows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        dataRows.push(splitTableCells(lines[j]));
        j++;
      }
      const d = tableToDescriptor(headers, dataRows);
      if (d) {
        descriptors.push(d);
        i = j;
        continue; // bảng đã lên panel → bỏ khỏi lời nói
      }
    }
    kept.push(lines[i]);
    i++;
  }
  rest = kept.join("\n");

  // 3) dòng-bảng lạc (bảng thiếu separator, model viết hỏng) vẫn phải đọc được.
  //    cleanProse KHÔNG đụng tới ký tự "|" — đây là lỗ có sẵn của stripForSpeech, và ta
  //    chỉ vá ở đường mới này, không đụng stripForSpeech (v2 đang dùng).
  return { speech: cleanProse(strayTableRowsToProse(tablesToProse(rest))), descriptors };
}
```

Và thêm helper `strayTableRowsToProse` ngay phía trên `extractForSpeech`:

```ts
// "| PH-005 | 1015 |" → "PH-005, 1015". Chạy SAU tablesToProse nên chỉ còn lại những
// dòng-bảng lạc không thành bảng hợp lệ. Giữ nội dung, bỏ cú pháp — im lặng nuốt cả
// dòng sẽ làm user mất dữ liệu mà không biết.
function strayTableRowsToProse(md: string): string {
  return md.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (_m, inner: string) =>
    inner.split("|").map((c) => c.trim()).filter(Boolean).join(", "),
  );
}
```

> **Lưu ý cho người cài đặt:** `import type` phải nằm ở đầu file cùng các import khác, không để giữa file. Đoạn trên đặt `import type` cạnh code cho dễ đọc — khi cài đặt hãy chuyển dòng đó lên đầu `voice.ts`.

- [ ] **Step 6: Chạy test, xác nhận xanh**

Run: `npx vitest run src/lib/chat/voice.test.ts && npx tsc --noEmit`
Expected: PASS toàn bộ (cả test `stripForSpeech` cũ), tsc sạch.

- [ ] **Step 7: Commit**

```bash
git add src/lib/chat/voice.ts src/lib/chat/voice.test.ts
git commit -m "feat(voice): extractForSpeech — cắt bảng/chart khỏi lời nói

Thay vì năn nỉ model đừng xuất markdown (VOICE_GUIDE, hỏng 2 lần), code
tách ra và đẩy sang panel. stripForSpeech giữ nguyên cho v2."
```

---

## Task 5: Nối vào client — nhận frame, ưu tiên A, chèn câu chỉ dẫn

**Files:**
- Modify: `src/components/constellation/useConstellationChat.ts`
- Modify: `src/components/constellation/useConstellationChat.test.ts`
- Modify: `src/components/constellation/ConstellationClient.tsx` (~dòng 193-195 wiring hook; ~dòng 272-276 `speakReply`)
- Modify: `src/i18n/dictionaries/constellation.ts`
- Create: `src/lib/chat/speech-pointer.ts` + `src/lib/chat/speech-pointer.test.ts`

**Interfaces:**
- Consumes: `extractForSpeech` (Task 4), frame `view` (Task 3)
- Produces:
  - `useConstellationChat({ ..., onView })` — `onView: (d: ViewDescriptor) => void`
  - `withPointer(speech: string, hasView: boolean, pointer: string): string`
  - khoá i18n: `constellation.viewPointer`, `constellation.viewPill`, `constellation.viewClose`, `constellation.viewSourceAi`, `constellation.viewDensity`, `constellation.viewTruncated`

- [ ] **Step 1: Viết test thất bại cho `withPointer`**

Tạo `src/lib/chat/speech-pointer.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { withPointer } from "./speech-pointer";

describe("withPointer", () => {
  it("có panel → nối câu chỉ dẫn vào cuối", () => {
    expect(withPointer("PH-005 lệch nhiều nhất.", true, "Bảng đang hiện trên màn hình."))
      .toBe("PH-005 lệch nhiều nhất. Bảng đang hiện trên màn hình.");
  });

  it("KHÔNG panel → tuyệt đối không nói câu đó (9/21 lượt đo được trả về rỗng)", () => {
    expect(withPointer("Xin lỗi, chưa có dữ liệu.", false, "Bảng đang hiện trên màn hình."))
      .toBe("Xin lỗi, chưa có dữ liệu.");
  });

  it("lời nói rỗng → không tự đẻ ra câu nói chỉ để trỏ panel", () => {
    expect(withPointer("", true, "Bảng đang hiện trên màn hình.")).toBe("");
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/lib/chat/speech-pointer.test.ts`
Expected: FAIL — không resolve được `./speech-pointer`.

- [ ] **Step 3: Viết `src/lib/chat/speech-pointer.ts`**

```ts
// Câu trỏ panel do CODE chèn, không phải model nói (Rule 5). Điều kiện là "có
// descriptor", biết được ngay lúc lắp lời nói — KHÔNG phải "panel đã render", thứ mà
// pipeline nói không thể biết (TTS_PREBUFFER_SECONDS = 3, ~4.3s tới audio đầu).
// Không nhắc vị trí ("bên phải") vì panel nằm giữa và bố cục đổi theo thiết bị.
export function withPointer(speech: string, hasView: boolean, pointer: string): string {
  if (!speech || !hasView) return speech;
  return `${speech} ${pointer}`;
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run src/lib/chat/speech-pointer.test.ts`
Expected: PASS.

- [ ] **Step 5: Thêm 6 khoá i18n × 3 ngôn ngữ**

Thêm vào `src/i18n/dictionaries/constellation.ts`, trước dấu `};` cuối:

```ts
  "constellation.viewPointer": {
    vi: "Bảng đang hiện trên màn hình.",
    en: "The table is on screen now.",
    zh: "表格已显示在屏幕上。",
  },
  "constellation.viewPill": { vi: "Xem bảng", en: "View table", zh: "查看表格" },
  "constellation.viewClose": { vi: "Đóng bảng", en: "Close table", zh: "关闭表格" },
  "constellation.viewSourceAi": { vi: "AI tổng hợp", en: "AI generated", zh: "AI 生成" },
  "constellation.viewDensity": { vi: "Đổi mật độ hiển thị", en: "Toggle density", zh: "切换显示密度" },
  "constellation.viewTruncated": { vi: "{shown}/{total} dòng", en: "{shown}/{total} rows", zh: "{shown}/{total} 行" },
```

- [ ] **Step 6: Viết test thất bại cho hook**

Thêm vào `src/components/constellation/useConstellationChat.test.ts` (theo đúng khuôn mock `fetch` + stream đã có trong file):

```ts
it("frame view được chuyển ra onView", async () => {
  const seen: unknown[] = [];
  const d = { kind: "table", title: "t", source: { type: "tool", toolName: "t", at: 1 }, rows: [{ a: 1 }] };
  // mockStream: dùng cùng helper dựng ReadableStream mà các test khác trong file dùng,
  // body = "Xong." + encodeFrame({ t: "view", d })
  // ... render hook với { onText: () => {}, onPendingWrite: () => {}, onView: (v) => seen.push(v) }
  // ... await send({ message: "hỏi" })
  expect(seen).toEqual([d]);
});
```

> Điền phần `...` theo đúng helper stream có sẵn ở đầu file test — đọc test `pending_write` đang có và sao chép khuôn.

- [ ] **Step 7: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/components/constellation/useConstellationChat.test.ts -t "frame view"`
Expected: FAIL — hook chưa nhận `onView`.

- [ ] **Step 8: Nối `onView` vào hook**

Trong `src/components/constellation/useConstellationChat.ts`:

thêm import:

```ts
import type { ViewDescriptor } from "@/lib/agent/view";
```

thêm vào signature tham số (cạnh `onPendingWrite`):

```ts
  onView,
  onTurnStart,
```

và vào phần kiểu:

```ts
  onView?: (d: ViewDescriptor) => void;
  // Bắn đúng một lần ở đầu MỖI lượt gửi. Client dùng nó để reset cờ "lượt này đã có
  // nguồn A chưa". Đặt ở đây chứ không ở chỗ gọi vì client có HAI đường gửi (nút gửi
  // và đường thoại) — reset ở một đường sẽ để cờ bẩn cho đường kia.
  onTurnStart?: () => void;
```

thêm ngay dòng đầu trong thân `consume`, trước `setStreaming(true)`:

```ts
      onTurnStart?.();
```

đổi vòng lọc frame:

```ts
          for (const f of frames) {
            if (f.t === "pending_write") onPendingWrite(f as unknown as PendingWrite);
            else if (f.t === "view") onView?.(f.d);
          }
```

và thêm cả hai vào mảng dependency của `useCallback` (`[onText, onPendingWrite, onView, onTurnStart]`).

- [ ] **Step 9: Chạy test, xác nhận xanh**

Run: `npx vitest run src/components/constellation/useConstellationChat.test.ts`
Expected: PASS.

- [ ] **Step 10: Nối vào `ConstellationClient` — state + speech**

Trong `src/components/constellation/ConstellationClient.tsx`:

thêm import:

```ts
import { extractForSpeech } from "@/lib/chat/voice";
import { withPointer } from "@/lib/chat/speech-pointer";
import type { ViewDescriptor } from "@/lib/agent/view";
```

thêm state cạnh các state khác:

```ts
  // Panel hiển thị. `view` là descriptor của lượt gần nhất (luôn thay thế, không xếp
  // chồng). `viewClosed` là user đã bấm × — đóng chỉ thu gọn, không xoá dữ liệu.
  const [view, setView] = useState<ViewDescriptor | null>(null);
  const [viewClosed, setViewClosed] = useState(false);
  const viewFromToolRef = useRef(false); // lượt này đã có nguồn A chưa (A thắng B)
  // Câu trỏ panel đọc qua ref để speakReply KHÔNG phải nhận `t` làm dependency —
  // useT trả hàm mới mỗi lần render, thêm nó vào deps sẽ làm speakReply đổi identity
  // liên tục và kéo theo mọi effect/ref phụ thuộc nó.
  const pointerRef = useRef("");
  pointerRef.current = t("constellation.viewPointer");
```

đổi wiring hook (~dòng 193-195):

```ts
  const chat = useConstellationChat({
    onText: (text) => { fullReplyRef.current = text; },
    onPendingWrite: setPendingWrite,
    onTurnStart: () => { viewFromToolRef.current = false; },
    onView: (d) => { viewFromToolRef.current = true; setView(d); setViewClosed(false); },
  });
```

đổi 3 dòng đầu của `speakReply` (~dòng 272-276) từ:

```ts
    const spoken = stripForSpeech(text);
    if (!spoken) return;
    const segments = splitForSpeech(spoken);
```

thành:

```ts
    // Tách phần NHÌN được ra trước, rồi mới chèn câu trỏ panel, rồi mới cắt segment.
    // Thứ tự này bắt buộc: đảo lại thì soft cap 280 ký tự của splitForSpeech sẽ băm
    // bảng thành mảnh và đọc to "| PH-005 | 1015 |".
    const { speech, descriptors } = extractForSpeech(text);
    // Nguồn A (frame view từ tool result) luôn thắng nguồn B (bảng model tự viết):
    // số của A do code lấy được, số của B là model kể lại (Rule 13). Nhưng bảng của B
    // vẫn phải bị cắt khỏi lời nói — đó là việc extractForSpeech vừa làm ở trên.
    if (!viewFromToolRef.current && descriptors.length) {
      setView(descriptors[0]);
      setViewClosed(false);
    }
    const hasView = viewFromToolRef.current || descriptors.length > 0;
    const spoken = withPointer(speech, hasView, pointerRef.current);
    if (!spoken) return;
    const segments = splitForSpeech(spoken);
```

**Không** thêm dependency nào vào `useCallback` bọc `speakReply` — mọi thứ mới đều đọc qua ref. Việc reset cờ đầu lượt do `onTurnStart` lo (Step 8), phủ cả hai đường gửi.

- [ ] **Step 11: Xác nhận không vỡ**

Run: `npx tsc --noEmit && npx vitest run src/components/constellation/`
Expected: tsc sạch; test constellation PASS (3 lỗi `ConstellationClient.test.tsx` **có sẵn từ trước** — xác nhận bằng `git stash && npx vitest run src/components/constellation/ && git stash pop` nếu nghi ngờ).

- [ ] **Step 12: Commit**

```bash
git add src/lib/chat/speech-pointer.ts src/lib/chat/speech-pointer.test.ts \
        src/components/constellation/useConstellationChat.ts \
        src/components/constellation/useConstellationChat.test.ts \
        src/components/constellation/ConstellationClient.tsx \
        src/i18n/dictionaries/constellation.ts
git commit -m "feat(constellation): nhận descriptor, ưu tiên nguồn tool, chèn câu trỏ panel

Câu trỏ do code chèn và chỉ khi có descriptor — 9/21 lượt đo được trả
về rỗng, để model tự nói thì user nhìn sang màn hình trống."
```

---

## Task 6: `DisplayPanel` + pill + đóng/mở

**Files:**
- Create: `src/lib/chat/view-render.ts`
- Create: `src/lib/chat/view-render.test.ts`
- Create: `src/components/constellation/DisplayPanel.tsx`
- Create: `src/components/constellation/DisplayPanel.test.tsx`
- Modify: `src/components/constellation/ConstellationClient.tsx` (render panel + pill ~dòng 517-580)
- Modify: `CHANGELOG.md`, `README.md`

**Interfaces:**
- Consumes: `ViewDescriptor` (Task 1), khoá i18n (Task 5), `ChartBlock` từ `@/components/render/ChartBlock`
- Produces:
  - `descriptorToChartRaw(d: ViewDescriptor): string | null`
  - `<DisplayPanel view density onClose onToggleDensity agentLabel />`

- [ ] **Step 1: Viết test thất bại cho serializer**

Tạo `src/lib/chat/view-render.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { descriptorToChartRaw } from "./view-render";
import type { ViewDescriptor } from "@/lib/agent/view";

const base: ViewDescriptor = {
  kind: "table",
  title: "variance",
  source: { type: "tool", toolName: "t", at: 1 },
  columns: [
    { key: "store", label: "store", align: "left" },
    { key: "variance", label: "variance", align: "right" },
  ],
  rows: [{ store: "PH-005", variance: 1015 }, { store: "PH-003", variance: 542 }],
  chart: { type: "bar", labelKey: "store", valueKey: "variance" },
};

describe("descriptorToChartRaw", () => {
  it("dựng đúng JSON Chart.js mà ChartBlock đang chờ", () => {
    const parsed = JSON.parse(descriptorToChartRaw(base)!);
    expect(parsed).toEqual({
      type: "bar",
      title: "variance",
      data: {
        labels: ["PH-005", "PH-003"],
        datasets: [{ label: "variance", data: [1015, 542] }],
      },
    });
  });

  it("descriptor kind=chart (nguồn B) trả nguyên chuỗi model đã viết", () => {
    const d: ViewDescriptor = {
      kind: "chart", title: "T", source: { type: "model" },
      rows: [{ raw: '{"type":"bar"}' }],
    };
    expect(descriptorToChartRaw(d)).toBe('{"type":"bar"}');
  });

  it("không có chart → null (panel chỉ hiện bảng)", () => {
    expect(descriptorToChartRaw({ ...base, chart: undefined })).toBeNull();
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/lib/chat/view-render.test.ts`
Expected: FAIL — không resolve được `./view-render`.

- [ ] **Step 3: Viết `src/lib/chat/view-render.ts`**

```ts
// ChartBlock có chữ ký ({ raw }: { raw: string }) và tự looseJsonParse — nên descriptor
// phải được serialize NGƯỢC về JSON kiểu Chart.js. Đổi ChartBlock để nhận object sẽ
// kéo theo recharts + useChartTheme + test của nó; serialize ở đây rẻ hơn nhiều.
import type { ViewDescriptor } from "@/lib/agent/view";

export function descriptorToChartRaw(d: ViewDescriptor): string | null {
  if (d.kind === "chart") {
    const raw = d.rows?.[0]?.raw;
    return typeof raw === "string" ? raw : null;
  }
  if (!d.chart || !d.rows?.length) return null;
  const { type, labelKey, valueKey } = d.chart;
  return JSON.stringify({
    type,
    title: d.title,
    data: {
      labels: d.rows.map((r) => String(r[labelKey] ?? "")),
      datasets: [{ label: valueKey, data: d.rows.map((r) => Number(r[valueKey] ?? 0)) }],
    },
  });
}
```

- [ ] **Step 4: Chạy test, xác nhận xanh**

Run: `npx vitest run src/lib/chat/view-render.test.ts`
Expected: PASS.

- [ ] **Step 5: Viết test thất bại cho component**

Tạo `src/components/constellation/DisplayPanel.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DisplayPanel } from "./DisplayPanel";
import type { ViewDescriptor } from "@/lib/agent/view";

const view: ViewDescriptor = {
  kind: "table",
  title: "variance",
  source: { type: "tool", toolName: "kg_stats", at: Date.parse("2026-08-04T08:42:00Z") },
  columns: [
    { key: "store", label: "Store", align: "left" },
    { key: "variance", label: "Variance", align: "right" },
  ],
  rows: [
    { store: "PH-005", variance: 1015 },
    { store: "PH-003", variance: 542 },
    { store: "PH-001", variance: 515 },
    { store: "PH-004", variance: 492 },
  ],
  truncated: { shown: 4, total: 666 },
};

const noop = () => {};

describe("DisplayPanel", () => {
  it("là region, KHÔNG phải dialog — panel không modal, gắn dialog là nói dối screen reader", () => {
    render(<DisplayPanel view={view} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getByRole("region")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hiện đủ dòng ở mật độ detail", () => {
    render(<DisplayPanel view={view} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getAllByRole("row")).toHaveLength(5); // 1 header + 4 dữ liệu
  });

  it("mật độ focus chỉ 3 dòng — liếc mắt đọc được, không phải bảng đầy", () => {
    render(<DisplayPanel view={view} density="focus" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getAllByRole("row")).toHaveLength(4); // 1 header + 3 dữ liệu
  });

  it("nói rõ đã cắt bớt — im lặng cắt sẽ khiến user tưởng chỉ có 4 dòng", () => {
    render(<DisplayPanel view={view} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />);
    expect(screen.getByText(/4\/666/)).toBeTruthy();
  });

  it("badge nguồn tool hiện nhãn agent; nguồn model hiện 'AI tổng hợp' — hai mức tin cậy khác nhau", () => {
    const { rerender } = render(
      <DisplayPanel view={view} density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB" />,
    );
    expect(screen.getByText(/DAAB/)).toBeTruthy();
    rerender(
      <DisplayPanel
        view={{ ...view, source: { type: "model" } }}
        density="detail" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
      />,
    );
    // 3 ngôn ngữ vì test không cố định cookie laam_lang; điều được khẳng định là
    // nhãn agent BIẾN MẤT — không được để bảng model tự viết trông như bảng từ DB.
    expect(screen.getByText(/AI tổng hợp|AI generated|AI 生成/)).toBeTruthy();
    expect(screen.queryByText(/DAAB/)).toBeNull();
  });

  it("chart-only descriptor (nguồn B) vẫn render ở mật độ focus — không để panel rỗng", () => {
    render(
      <DisplayPanel
        view={{ kind: "chart", title: "T", source: { type: "model" }, rows: [{ raw: '{"type":"bar","data":{"labels":["a"],"datasets":[{"data":[1]}]}}' }] }}
        density="focus" onClose={noop} onToggleDensity={noop} agentLabel="DAAB"
      />,
    );
    expect(screen.getByRole("region")).not.toBeEmptyDOMElement();
  });

  it("nút × gọi onClose", () => {
    const onClose = vi.fn();
    render(<DisplayPanel view={view} density="detail" onClose={onClose} onToggleDensity={noop} agentLabel="DAAB" />);
    fireEvent.click(screen.getByRole("button", { name: /Đóng bảng|Close table/ }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Esc gọi onClose", () => {
    const onClose = vi.fn();
    render(<DisplayPanel view={view} density="detail" onClose={onClose} onToggleDensity={noop} agentLabel="DAAB" />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("click ra ngoài KHÔNG đóng — user chạm màn hình lúc đang nói là chuyện thường", () => {
    const onClose = vi.fn();
    render(
      <div data-testid="outside">
        <DisplayPanel view={view} density="detail" onClose={onClose} onToggleDensity={noop} agentLabel="DAAB" />
      </div>,
    );
    fireEvent.click(screen.getByTestId("outside"));
    expect(onClose).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Chạy test, xác nhận đỏ**

Run: `npx vitest run src/components/constellation/DisplayPanel.test.tsx`
Expected: FAIL — không resolve được `./DisplayPanel`.

- [ ] **Step 7: Viết `src/components/constellation/DisplayPanel.tsx`**

```tsx
"use client";

// Panel kính nổi giữa màn hình Larvis: bảng/biểu đồ tách khỏi lời nói.
// KHÔNG modal — user phải vừa nhìn vừa nói tiếp, nên không focus-trap, không backdrop
// chặn click, và role là "region" chứ không phải "dialog".
import { useEffect } from "react";
import { X, Rows3 } from "lucide-react";
import { ChartBlock } from "@/components/render/ChartBlock";
import { descriptorToChartRaw } from "@/lib/chat/view-render";
import { useT } from "@/i18n/useT";
import { constellation } from "@/i18n/dictionaries/constellation";
import type { ViewDescriptor } from "@/lib/agent/view";

export type Density = "focus" | "detail";

const FOCUS_ROWS = 3; // liếc mắt đọc được; detail hiện hết những gì descriptor giữ

export function DisplayPanel({
  view,
  density,
  onClose,
  onToggleDensity,
  agentLabel,
}: {
  view: ViewDescriptor;
  density: Density;
  onClose: () => void;
  onToggleDensity: () => void;
  agentLabel: string;
}) {
  const t = useT(constellation);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = view.rows ?? [];
  const shown = density === "focus" ? rows.slice(0, FOCUS_ROWS) : rows;
  const columns = view.columns ?? [];
  const chartRaw = descriptorToChartRaw(view);

  // Ranh giới tin cậy: số từ tool là số code lấy được; số từ model là model kể lại.
  // Hai thứ đó không được trông giống nhau trên màn hình.
  // Chỉ đếm dòng khi dòng có nghĩa. Descriptor kind="chart" (nguồn B) có đúng 1 "dòng"
  // là chuỗi JSON — in "· 1 ·" ra badge là con số vô nghĩa, tệ hơn không in.
  const countable = view.kind === "table" || view.kind === "record";
  const badge =
    view.source.type === "tool"
      ? [
          agentLabel,
          countable ? String(rows.length) : null,
          new Date(view.source.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        ].filter(Boolean).join(" · ")
      : t("constellation.viewSourceAi");

  return (
    <section
      role="region"
      aria-label={view.title}
      className="pointer-events-auto absolute left-[11%] right-[11%] top-[13%] z-30 rounded-2xl border border-[#5bd6ff]/30 bg-[#08182a]/[0.92] p-4 text-[#eaf6ff] shadow-[0_0_0_1.5px_rgba(255,196,80,0.45),0_0_30px_rgba(255,196,80,0.30),0_18px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl"
    >
      <div className="mb-2 flex items-start gap-2">
        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/15 px-2 py-0.5 text-[10px] text-emerald-300">
          {badge}
        </span>
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{view.title}</h2>
        <button
          type="button"
          onClick={onToggleDensity}
          aria-label={t("constellation.viewDensity")}
          className="rounded-full border border-[#5bd6ff]/30 p-1 text-[#a9e9ff] hover:bg-white/5"
        >
          <Rows3 size={14} />
        </button>
        <button
          type="button"
          onClick={onClose}
          aria-label={t("constellation.viewClose")}
          className="rounded-full border border-[#5bd6ff]/30 p-1 text-[#a9e9ff] hover:bg-white/5"
        >
          <X size={14} />
        </button>
      </div>

      {columns.length > 0 && (
        <div className="max-h-[38vh] overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th
                    key={c.key}
                    className={`border-b border-white/10 pb-1 font-medium text-[#a9e9ff] ${c.align === "right" ? "text-right" : "text-left"}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={`border-b border-dashed border-white/10 py-1 ${c.align === "right" ? "text-right tabular-nums" : "text-left"}`}
                    >
                      {String(r[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view.truncated && (
        <p className="mt-1 text-[11px] text-[#a9e9ff]/70">
          {t("constellation.viewTruncated", {
            shown: String(view.truncated.shown),
            total: String(view.truncated.total),
          })}
        </p>
      )}

      {/* Ở mật độ focus thường giấu chart cho gọn — TRỪ khi descriptor chỉ có chart
          (nguồn B, block ```chart không kèm bảng): giấu nốt thì panel rỗng trơn. */}
      {chartRaw && (density === "detail" || columns.length === 0) && (
        <div className="mt-2 h-40">
          <ChartBlock raw={chartRaw} />
        </div>
      )}
    </section>
  );
}
```

> **Kiểm trước khi viết (3 lệnh, đừng bỏ):**
> 1. `grep -n "useT" src/components/constellation/ConstellationClient.tsx` — dùng đúng đường import đó.
> 2. `grep -n "export function ChartBlock" src/components/render/ChartBlock.tsx` — xác nhận named export.
> 3. `grep -rn "useT" src/components/constellation/*.test.tsx src/components/chat/*.test.tsx | head` — xem component test hiện có phải bọc provider i18n không. **Nếu có, bọc y hệt trong `DisplayPanel.test.tsx`**; nếu không, `useT` tự đọc cookie và render trần là đủ. Đừng đoán.

- [ ] **Step 8: Chạy test, xác nhận xanh**

Run: `npx vitest run src/components/constellation/DisplayPanel.test.tsx`
Expected: PASS — 8 test.

- [ ] **Step 9: Render panel + pill trong `ConstellationClient`**

Thêm state mật độ cạnh `view`/`viewClosed` (Task 5):

```ts
  const [density, setDensity] = useState<Density>("detail");
```

Thêm import:

```ts
import { DisplayPanel, type Density } from "./DisplayPanel";
```

Tính nhãn agent. **`selectedAgentId` là ID, không phải tên hiển thị** — đưa thẳng vào badge sẽ ra một chuỗi id trên màn hình. Tra danh sách node để lấy tên; trước khi viết, chạy `grep -n "selectedAgentId\|agents\b" src/components/constellation/ConstellationClient.tsx | head` để biết mảng node tên gì và trường tên là gì, rồi:

```ts
  // Nhãn nguồn cho badge: tên hiển thị của agent đang chọn; không có thì lùi về tên
  // tool (thà hiện "kg_list_projects" còn hơn hiện một UUID).
  const agentLabel =
    agents.find((a) => a.id === selectedAgentId)?.name ??
    (view?.source.type === "tool" ? view.source.toolName : "");
```

Render panel — đặt **sau** `ConstellationNodes` và **trước** cụm dock, bên trong `<section>` gốc:

```tsx
        {view && !viewClosed && (
          <DisplayPanel
            view={view}
            density={density}
            onClose={() => setViewClosed(true)}
            onToggleDensity={() => setDensity((d) => (d === "detail" ? "focus" : "detail"))}
            agentLabel={agentLabel}
          />
        )}
```

Thêm pill vào **đầu** cụm ở dòng ~572 (ngay trước `<select>`), chỉ khi panel đang đóng:

```tsx
            {view && viewClosed && (
              <button
                type="button"
                onClick={() => setViewClosed(false)}
                className="shrink-0 rounded-full border border-[#ffd479]/55 bg-[#ffc450]/15 px-3 py-2 text-[12px] text-[#ffe2a6] transition-colors hover:bg-[#ffc450]/25"
              >
                ▦ {t("constellation.viewPill")} · {view.rows?.length ?? 0}
              </button>
            )}
```

- [ ] **Step 10: Xác nhận toàn cục**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc sạch; build xanh; test suite chỉ còn các lỗi **có sẵn từ trước** (`ConstellationClient.test.tsx` ×3, `search.test.ts` ×4 — con số này ghi trong checkpoint 2026-08-03; nếu khác, dừng lại và điều tra thay vì bỏ qua).

- [ ] **Step 11: Ghi tài liệu**

`CHANGELOG.md`, mục `[Unreleased]` → `### Added`:

```markdown
- **Larvis display panel**: bảng/biểu đồ của câu trả lời hiện trên panel kính giữa màn hình `/constellation`, giọng nói chỉ đọc phần diễn giải. Dữ liệu panel do code suy từ tool result (badge nguồn) hoặc tách từ bảng markdown model viết. Đóng bằng `×`/`Esc`, thu về pill cạnh ô chọn model.
```

`README.md`: thêm một đoạn ngắn vào phần mô tả `/constellation` với cùng nội dung trên, viết bằng tiếng Việt theo giọng văn sẵn có của file.

- [ ] **Step 12: Commit**

```bash
git add src/lib/chat/view-render.ts src/lib/chat/view-render.test.ts \
        src/components/constellation/DisplayPanel.tsx \
        src/components/constellation/DisplayPanel.test.tsx \
        src/components/constellation/ConstellationClient.tsx \
        CHANGELOG.md README.md
git commit -m "feat(constellation): DisplayPanel — bảng/biểu đồ cho chế độ giọng nói

Panel kính giữa màn hình, không modal (region chứ không phải dialog),
đóng thu về pill cạnh ô chọn model. Bảng dựng markup riêng; chart
serialize sang JSON Chart.js để dùng lại ChartBlock nguyên vẹn."
```

---

## Kiểm thử thủ công cuối cùng

> ⚠️ **Next 16 khoá thư mục — không chạy được hai instance trong cùng thư mục.** User đang có server ở `:3100`. Muốn kiểm tay thì **tắt server đó trước**, hoặc copy repo sang thư mục khác rồi chạy ở port riêng (`npx next dev -p 3101`). Đừng vừa `npm run dev` vừa để `:3100` sống — nó sẽ fail và mất thời gian truy nguyên nhân sai chỗ.

Sau Task 6, chạy dev server và kiểm bằng tay tại `/constellation`:

1. Hỏi "cửa hàng nào lệch kho nhiều nhất" ở chế độ **giọng nói** → panel hiện bảng + bar chart, badge có nhãn agent, và Larvis **không** đọc ký tự `|` nào.
2. Nghe kỹ câu cuối: phải có "Bảng đang hiện trên màn hình."
3. Hỏi một câu chit-chat ("chào bạn") → **không** panel, và **không** có câu trỏ panel.
4. Hỏi "so sánh iPhone và Android" (không gọi tool) → panel hiện với badge `AI tổng hợp`.
5. Bấm `×` → panel thu về pill cạnh `gpt-oss-120b`; bấm pill → bung lại; bấm `Esc` khi mở → đóng; click ra nền → **không** đóng.
6. Hỏi tiếp một câu có dữ liệu khác → panel tự mở lại với nội dung mới.
7. Thu hẹp cửa sổ xuống < 768px → kiểm panel không tràn, toggle mật độ đổi được số dòng.

---

## Self-Review

**Spec coverage:**

| Yêu cầu trong spec | Task |
|---|---|
| `ViewDescriptor`, badge = ranh giới tin cậy | 1, 6 |
| Nguồn A: luật cấu trúc, 50 dòng, `truncated`, chart ≤ 25 dòng | 1 |
| Một lượt một panel, chọn table/chart cuối | 1 (`pickTurnView`), 2 |
| Nguồn B: tách bảng GFM + ```chart, giữ `tablesToProse` fallback | 4 |
| `stripForSpeech` không đổi hành vi (v2) | 4 (Step 3 + test chốt) |
| Luật ưu tiên A > B, nhưng vẫn cắt bảng khỏi speech | 5 (Step 10) |
| Frame `view` + nối vào `leadingFrames` | 3 |
| Không persist descriptor | (mặc định — không có bước nào ghi DB) |
| Câu chỉ dẫn: code chèn, gate theo `descriptors.length`, không nhắc vị trí | 5 |
| Thứ tự extract → chèn → split → TTS | 5 (Step 10) |
| Panel: token màu, không full-height, không modal | 6 |
| Đóng `×`/`Esc`, click ngoài không đóng, pill chỉ khi đóng | 6 |
| Luôn hiện lượt mới nhất | 5 (`setView` + `setViewClosed(false)`) |
| 2 mật độ, toggle trong header panel, breakpoint | 6 (toggle) — **xem ghi chú dưới** |
| i18n 3 ngôn ngữ | 5 |
| A11y `role="region"`, button có aria-label | 6 |
| CHANGELOG + README | 6 |

**Sai lệch có chủ ý so với spec (ghi rõ để không tưởng là quên):**

- Spec nói mật độ mặc định theo breakpoint và nhớ qua `localStorage`. Plan chỉ làm **toggle thủ công, mặc định `detail`**. Lý do: breakpoint + persist là hai thứ thêm bề mặt test mà chưa có bằng chứng cần (YAGNI, Rule 2). Nếu dùng thật thấy vướng thì thêm sau, đúng một commit nhỏ.
- Viền panel **chưa** thở theo âm thanh. Đây là phần trang trí, phụ thuộc `useAudioAnalyser` và không có test khách quan; tách khỏi plan này để panel lên được sớm. Ghi vào backlog sau khi merge.

**Placeholder scan:** ba chỗ yêu cầu người cài đặt tự tra repo trước khi viết, đều kèm lệnh `grep` cụ thể — Task 2 Step 1 (khuôn mock `deps`), Task 5 Step 6 (khuôn mock stream), Task 6 Step 7 + Step 9 (đường import `useT`, provider i18n trong test, tên mảng node). Đây là cố ý: viết cứng khuôn mock mà không đọc file thật sẽ đẻ ra test không chạy, và `as never` bừa sẽ che mất lỗi kiểu thật. Mọi bước khác đều có code đầy đủ.

**Lỗi đã bắt được ở vòng rà thứ hai (ghi lại để không ai "sửa ngược"):**

1. `let turnView: ChatFrame | null` chỉ được gán trong callback → TypeScript thu hẹp về `null` ở chỗ đọc. Đổi sang `const viewFrames: ChatFrame[]`.
2. `cleanProse` **không** gỡ ký tự `|`, nên bảng hỏng vẫn lọt pipe ra loa — test ban đầu khẳng định điều code không làm. Thêm `strayTableRowsToProse`, và chỉ ở đường `extractForSpeech`.
3. Reset cờ `viewFromToolRef` ở `handleSend` bỏ sót đường gửi thứ hai (đường thoại) → cờ bẩn sang lượt sau. Chuyển vào `onTurnStart` trong hook.
4. `t` làm dependency của `speakReply` khiến callback đổi identity mỗi render. Đọc qua `pointerRef`.
5. Descriptor `kind: "chart"` (chỉ có chart, không cột) render rỗng ở mật độ `focus`. Sửa điều kiện + thêm test.
6. Badge in `· 1 ·` cho descriptor chart (1 "dòng" là chuỗi JSON). Chỉ đếm khi `table`/`record`.
7. `selectedAgentId` là ID chứ không phải tên hiển thị → badge sẽ hiện UUID. Tra tên từ danh sách node.
8. `npm run dev` sẽ fail nếu server `:3100` của user đang chạy (Next 16 khoá thư mục).

**Type consistency:** `ViewDescriptor` khai báo ở Task 1 và được dùng nguyên vẹn ở Task 2/3/4/5/6. `descriptorToChartRaw` dùng `d.rows[0].raw` cho `kind: "chart"` — khớp với chỗ Task 4 ghi `rows: [{ raw: body.trim() }]`. `Density` export từ `DisplayPanel.tsx` và import lại ở `ConstellationClient.tsx`. `onView` cùng chữ ký ở `ToolRoundsOpts` (Task 2) và `useConstellationChat` (Task 5).
