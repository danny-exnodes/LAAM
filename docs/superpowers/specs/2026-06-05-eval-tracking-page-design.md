# Eval Tracking Page — "Độ tin cậy Agent" (MVP, DB-backed)

> **Loại:** Design spec — trang theo dõi tiến bộ eval của Agent (investor-facing).
> **Ngày:** 2026-06-05 · **Vai trò:** technical consultant · **Trạng thái:** chờ user review.
> **Liên quan:** `decisions/harness-reliability-eval.md` · `backlog/harness-eval-next-phase.md` · eval harness (PR #2 `feat/harness-eval`) · scorecard `.serena/qa/eval-<date>.json`.

---

## 1. Bối cảnh & mục tiêu

Eval harness (PR #2) đã sinh **dữ liệu per-dimension có cấu trúc** mỗi lần `npm run eval` (`.serena/qa/eval-<date>.json` = `{meta:{k,model,at}, scores: ScenarioScore[]}`). Nhưng: (a) **không có lịch sử** (ghi đè theo ngày), (b) **không có UI** — số liệu chỉ nằm trong file.

**Mục tiêu:** một trang `/eval` trong app LAAM cho phép **xem tiến bộ reliability của Agent qua từng lần chạy/bước cải tiến**, đủ rõ + đáng tin để **trình nhà đầu tư** ("local agent đo được, đang lên").

Câu chuyện đầu tư = **đường trend đi lên + minh bạch per-dimension**, có **nhãn theo bước** ("bước 3: thêm timeline-tool → tool-selection 86%→100%").

## 2. Phi mục tiêu (YAGNI — MVP)

KHÔNG: export PDF · drill-down per-scenario · so sánh nhiều model · diff 2 run cạnh nhau · public/share-link không-auth · sửa eval logic. (→ Open questions, phase sau.)

## 3. Data model — bảng `eval_run` (migration `0004`, additive)

Đúng convention `chat_tool_call`/`agent_session` (text PK + `$defaultFn(crypto.randomUUID)`, `jsonb().$type<>`, `timestamp({mode:"date"})`):

```ts
export const evalRuns = pgTable("eval_run", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  ranAt: timestamp("ranAt", { mode: "date" }).notNull().defaultNow(),
  model: text("model").notNull(),
  k: integer("k").notNull().default(1),
  label: text("label"),       // EVAL_LABEL — "thêm timeline-tool"
  gitSha: text("gitSha"),     // commit lúc chạy (git rev-parse --short)
  totalScenarios: integer("totalScenarios").notNull().default(0),
  totalRuns: integer("totalRuns").notNull().default(0), // = scenarios × k
  // per-dimension aggregate (nguồn headline + trend — query rẻ, không phải bung scores)
  dims: jsonb("dims").$type<Record<string, { passed: number; total: number }>>().notNull(),
  // full per-scenario detail (nguồn bảng scorecard mới nhất)
  scores: jsonb("scores").$type<EvalScenarioScore[]>().notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
});
export type EvalRun = typeof evalRuns.$inferSelect;
```
`EvalScenarioScore` = bản sao type của `ScenarioScore` (eval) ở `scripts/eval/types.ts`: `{ id, capability, runs, perDim: Record<string,{passed,total}>, fails: string[], avgMs }`. **Quyết định D3:** khai báo type này trong `src/db/schema.ts` (hoặc `src/lib/eval-stats.ts`), KHÔNG import từ `scripts/eval/*` (app không phụ thuộc thư mục eval). `dims` lưu sẵn (denormalize) để trend query không phải reduce `scores` mỗi lần.

## 4. Persist mỗi run (eval → DB)

`scripts/eval/suite.eval.ts` afterAll hiện gọi `writeScorecard` (files). **Thêm:** insert 1 row `eval_run`.
- **Best-effort (D2):** bọc try/catch — DB sập/không có thì **vẫn ghi JSON, eval KHÔNG vỡ** (giữ tính chất "eval = đo, không phụ thuộc hạ tầng"). Log cảnh báo (Rule 12), không nuốt im.
- **Nhãn theo bước:** `label = process.env.EVAL_LABEL ?? null`; `gitSha` = `execSync("git rev-parse --short HEAD")` (try/catch, host có git).
- **`dims`** tính từ `scores` (sum `perDim` qua mọi scenario — chính là dòng TỔNG của `renderScorecard`). Tách hàm thuần `aggregateDims(scores)` dùng chung report + persist (DRY).
- Hàm `persistEvalRun(db, meta, scores)` đặt ở `scripts/eval/persist-run.ts` (host-side, import `@/db` + `@/db/schema`). suite.eval gọi sau `writeScorecard`.
- ⚠️ **Hệ quả:** `npm run eval` giờ ghi DB nếu có (host luôn có Postgres). Tài liệu hoá ở README eval.

## 5. Aggregation thuần — `src/lib/eval-stats.ts`

Tách logic số đo khỏi UI để **unit-test** (kiểu "eval-of-the-eval"). Input = `EvalRun[]` (DESC theo ranAt), output:
```ts
type EvalDashboard = {
  headline: { overallPct: number; deltaVsPrev: number | null; ranAt: Date; label: string | null; model: string };
  trend: { run: string /*nhãn|ngày*/; overall: number; perDim: Record<string, number> }[]; // ASC theo thời gian
  latest: { scores: EvalScenarioScore[]; dims: Record<string,{passed,total}> } | null;
  runs: { id: string; ranAt: Date; label: string|null; model: string; overallPct: number }[]; // DESC
};
```
- **`overallPct` (D1 — định nghĩa headline):** `sum(passed mọi dim) / sum(total mọi dim)` của run đó (trung thực, gồm cả write-intent). KHÔNG cherry-pick. Lý do: đường trend + minh bạch đáng tin hơn 100% chọn lọc; write-intent 0% được chú thích (§7).
- `deltaVsPrev` = headline.overall − overall(run trước) (null nếu chỉ 1 run).
- `perDim[dim]` = `passed/total*100` (null/—nếu dim đó run không chấm).
- Hàm con `aggregateDims(scores)` (dùng chung §4). Tất cả thuần → `eval-stats.test.ts`.

## 6. Trang `/eval` (server component)

`src/app/eval/page.tsx` — query `eval_run` trực tiếp (ORDER BY ranAt DESC) như `/agents` query sessions, đưa qua `buildEvalDashboard` (eval-stats) → render. Client component con cho chart (recharts cần "use client").

**Bố cục (trên→dưới):**
1. **Headline card:** `overallPct` to (vd "92%") + ▲/▼ `deltaVsPrev` + nhãn/model/ngày run mới nhất. (Empty-state nếu chưa có run: hướng dẫn chạy `npm run eval`.)
2. **Trend chart** (`src/components/eval/TrendChart.tsx`, recharts `LineChart`): x = run (nhãn||ngày), y = % (0–100), 1 đường/dimension + đường **overall đậm**. Dùng `useChartTheme` (dark-mode convention). Legend bật/tắt đường.
3. **Bảng scorecard mới nhất** (`LatestTable.tsx`): scenario × 7 cột dimension (giá trị `passed/total` + màu), như file .md.
4. **Danh sách run** (`RunList.tsx`): ngày · nhãn · model · overall% (mới→cũ).

**i18n (vi/en/zh):** thêm dict `src/i18n/dictionaries/eval.ts` — tiêu đề ("Độ tin cậy Agent" / "Agent Reliability" / "Agent 可靠性"), nhãn 7 dimension, headline, empty-state, chú thích write-intent. Wire 3 ngôn ngữ (theo i18n-pages convention).

**Nav + auth:** thêm item `/eval` vào nav (responsive — theo `responsive-conventions`). Sau `auth` (mọi role xem; read-only). Không thêm RBAC mới.

## 7. Trung thực với nhà đầu tư (xử lý write-intent 0%)

`write-intent 0%` hiện kèm **chú thích** (icon ℹ️/caption): *"By design — hành động write bị chặn bởi safety-gate; model không được tự thuật 'đã xong'. 0% ở đây xác nhận gate hoạt động."* → biến điểm-yếu-biểu-kiến thành **bằng chứng an toàn**. (Cùng lý do giữ `overallPct` trung thực thay vì loại write-intent.)

## 8. File structure (additive)

```
src/db/schema.ts                      # + bảng evalRuns + type EvalRun/EvalScenarioScore
drizzle/0004_*.sql                    # migration (generate → commit → migrate host)
scripts/eval/persist-run.ts          # persistEvalRun(db, meta, scores) + aggregateDims
scripts/eval/suite.eval.ts           # afterAll: + persistEvalRun (best-effort) + label/sha
src/lib/eval-stats.ts (+ .test.ts)   # buildEvalDashboard(rows) — THUẦN
src/app/eval/page.tsx                 # server component (query + render)
src/components/eval/{TrendChart,LatestTable,RunList,HeadlineCard}.tsx
src/i18n/dictionaries/eval.ts        # vi/en/zh
<nav component>                       # + item /eval
```

## 9. Testing

- **`eval-stats.test.ts`** (bắt buộc, thuần): rows giả nhiều run → `overallPct`/`deltaVsPrev`/`trend`/`latest` đúng; ca 0 run / 1 run (delta null) / dim thiếu ở vài run. Đây là "eval-of-the-eval".
- `aggregateDims` test (qua eval-stats hoặc persist-run).
- (Tuỳ) render-test nhẹ cho `page`/`HeadlineCard` (Testing Library, mock dashboard).
- Migration: `db:generate` → commit → `db:migrate` host.
- Verify thủ công: chạy `npm run eval` 2–3 lần (nhãn khác) → mở `/eval` → trend có nhiều điểm, headline + delta đúng.

## 10. Decision log

| # | Quyết định | Lý do |
|---|-----------|-------|
| D1 | **Headline `overallPct` = tổng passed / tổng graded (mọi dim, gồm write-intent).** | Trung thực > cherry-pick; trend + minh bạch đáng tin với nhà đầu tư; write-intent 0% được chú thích thành điểm-mạnh-an-toàn. |
| D2 | **Persist DB best-effort** (try/catch, vẫn ghi JSON). | Giữ eval = "đo, không phụ thuộc hạ tầng"; DB sập không làm hỏng lần đo. |
| D3 | **Type eval score khai báo lại trong app** (không import `scripts/eval/*`). | App không phụ thuộc thư mục eval (eval là tool host-side); JSONB shape là hợp đồng. |
| D4 | **`dims` denormalize** trong row. | Trend query rẻ (đọc dims qua mọi run) thay vì reduce `scores` mỗi lần. |
| D5 | **Nhãn + gitSha mỗi run.** | Biến scorecard thành câu-chuyện-theo-bước (nguồn giá trị đầu tư). |
| D6 | **MVP read-only, sau auth, mọi role.** | Đơn giản; chưa cần RBAC/public-share cho MVP. |

## 11. Success criteria

1. `npm run eval` → ghi 1 row `eval_run` (best-effort) + vẫn ghi JSON.
2. Chạy ≥2 lần (nhãn khác) → `/eval` hiện: headline `overallPct` + ▲/▼ đúng, **trend chart nhiều điểm** per-dimension + overall, bảng scorecard mới nhất, danh sách run.
3. write-intent 0% có chú thích "by design".
4. i18n vi/en/zh đủ; nav có `/eval`; sau auth.
5. `eval-stats.ts` có unit-test (headline/delta/trend đúng trên rows giả). `npm test` xanh. Migration `0004` chạy host.

## 12. Open questions / Future (KHÔNG trong MVP)

- Export PDF (jspdf có sẵn) — gửi nhà đầu tư offline.
- Drill-down per-scenario (xem `fails` chi tiết) · diff 2 run · so sánh nhiều model.
- Public/share-link read-only (demo không cần login) — cân nhắc bảo mật.
- Auto-run eval định kỳ (cron) ghi trend tự động (giao thoa trục **schedule** của roadmap).
- Annotation thủ công trên trend (đánh dấu mốc release).

## 13. Cô lập & coordination

- Trang **phụ thuộc dữ liệu eval** (PR #2 chưa merge). ⇒ **Khuyến nghị merge PR #2 → main trước**, rồi branch trang từ main (sạch, có sẵn eval). Hoặc branch từ `feat/harness-eval` nếu chưa muốn merge.
- Đụng `src/db/schema.ts` + migration (deploy-order: generate→commit→migrate host) + nav component (phối hợp nếu session khác đang sửa nav). Còn lại additive (page/lib/components/i18n mới).
- `agent-ops`: migration + `npm run eval` chạy host (user); agent verify bằng `npm test` (eval-stats) + targeted.
