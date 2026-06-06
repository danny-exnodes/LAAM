# Spec: World-Tools Layer — mở rộng harness bằng họ tool web/util + đào sâu nội bộ

**Ngày:** 2026-06-06 · **Vai trò:** technical consultant · **Trạng thái:** spec — user đã auto-approve, vào implement.
**Nền:** [[agent-harness-architecture]] (6 lớp, SP-1→SP-4). Spec này KHÔNG đổi hợp đồng SP-1; chỉ thêm tool vào `INTERNAL_TOOLS`.

---

## 1. Vấn đề & mục tiêu

Harness sau SP-1→SP-4 đã có orchestrator + dispatch + guardrail + safety-gate + memory + UX-trace, nhưng bộ tool nội bộ **chỉ đọc dữ liệu LAAM** (`laam_list_agents/get_agent/query_stats/list_machines/find_stuck`). Agent **không đọc được web** (route `fetch-url` chỉ là action UI, chưa đăng ký làm tool), không search được phiên theo từ khoá, không đọc được timeline/audit, không tính toán số học tin cậy.

**Mục tiêu:** bổ sung một **lớp world-tools** — năng lực "thế giới" ($0, self-host) — gồm 3 họ:
- `web_*` — đọc/tìm web (SearXNG self-host).
- `laam_*` (mở rộng) — search phiên, timeline, audit.
- `util_*` — tiện ích deterministic (calc).

**Ràng buộc nền tảng (user chốt):** mọi backend phải **self-host + $0**. Không SaaS, không API trả phí. Đồng nhất triết lý với Ollama (model local) + Tesseract (OCR local).

## 2. Kiến trúc & taxonomy (Section 1 — đã duyệt)

Tool mới = thêm vào `INTERNAL_TOOLS` (registry là list phẳng), KHÔNG đụng nhánh connector.

| Họ | Prefix | Thư mục | `kind` | Gate SP-2? |
|---|---|---|---|---|
| Web/knowledge | `web_` | `src/lib/agent/tools/web/*` | read | không |
| Utility | `util_` | `src/lib/agent/tools/util/*` | read | không |
| Internal data (mở rộng) | `laam_` | `src/lib/agent/tools/laam/*` | read | không |
| Local sensitive (HOÃN) | `fs_`/`sys_` | `src/lib/agent/tools/sys/*` | write | bắt buộc |

**Wiring (1 điểm):**
```ts
// registry.ts
export const INTERNAL_TOOLS: Tool[] = [...LAAM_TOOLS, ...WEB_TOOLS, ...UTIL_TOOLS].map(guard);
```
Tự động hưởng: union schema cho model (`modelToolSchemas`), guardrail L4 (`guard`), SP-2 gate (`withSafety` chỉ chặn `kind:"write"` → read tool qua tự do), SP-4 trace (`INTERNAL_NAMES` tự gồm → args hiện trong trace, query/url không phải secret).

**KHÔNG đụng:** `types.ts` (hợp đồng đóng băng), `context.ts` (system prompt đã liệt kê tên tool + model thấy `description` qua schema), `orchestrator.ts`, `guardrails.ts`, nhánh connector.

## 3. Họ `web_*` (Section 2 — đã duyệt)

### Quyết định backend: SearXNG self-host
- ❌ Tavily/Brave/SerpAPI — trả phí, không self-host.
- ❌ DuckDuckGo HTML scrape — $0 nhưng không self-host, fragile (vỡ khi đổi HTML), ToS xám → để **fallback tuỳ chọn** (backlog), không phải xương sống.
- ✅ **SearXNG** — meta-search FOSS, self-host Docker, $0, JSON sạch (`format=json`), gom nhiều engine nên bền.

### `web_read` — *promote* từ `fetch-url`
- Tách lõi thuần ra `src/lib/web/readable.ts`: `isBlockedHost`, `htmlToText`, `fetchReadable({url, maxText, fetchImpl?})`. **Route `/api/fetch-url` import lại** (giữ hành vi y hệt, cap UI = 12000).
- Tool: `name:"web_read"`, `kind:"read"`, params `{url:string}`.
- ⚠️ **Cap text tool = 6000 ký tự** (KHÔNG 12000): `guard.boundOutput` cắt kết quả > **8192 bytes**; web_read trả `{url,title,text,truncated}` nên phải để text gọn dưới ngưỡng → vừa bound + bảo vệ context model. Route UI vẫn 12000 (người đọc).
- SSRF guard giữ nguyên (chặn localhost/private/IPv6).

### `web_search` — *build*, gọi SearXNG
- `src/lib/web/searxng.ts`: `searxngSearch(query, {count, baseUrl, fetchImpl})` → `{title,url,snippet}[]`. **fetchImpl injectable** để test không cần network.
- Tool: `name:"web_search"`, `kind:"read"`, params `{query:string, count?:number}` (default 5, cap 10).
- Cấu hình env: `SEARXNG_URL` (vd `http://searxng:8080`). Rỗng/không tới được → trả `{error}` (fail-soft; orchestrator không sập).
- Cặp `web_search` (tìm) → `web_read` (đọc sâu) = vòng research; mọi result có `url`.

### Hạ tầng (design artifact — KHÔNG tự `docker compose up`)
- `docker-compose.yml`: service `searxng` (image `searxng/searxng`), **bind localhost-only**, mount `./searxng/settings.yml`.
- `searxng/settings.yml`: **`search.formats: [html, json]`** (⚠️ SearXNG mặc định TẮT json → không bật thì `web_search` luôn lỗi); `server.limiter: false` (self-host đơn user); `server.secret_key` set.
- `.env.example`: thêm `SEARXNG_URL=`.
- Tôn trọng memory `no-background-services`: chỉ đưa vào compose, không khởi chạy.

## 4. Họ `laam_*` mở rộng (Section 3)

⚠️ **Thực địa:** DB chỉ lưu *summary* phiên; text transcript đầy đủ nằm ở file `.jsonl` tại `transcriptPath` (**host-only**).

### `laam_search_sessions` — search phiên theo từ khoá (DB-backed)
- Đổi tên từ ý tưởng "search_transcripts": search **summary** (`latestActivity`, project, model, status) trong `agent_session`, KHÔNG full-text transcript (host-only, nặng → backlog).
- Khác `list_agents` (lọc status/machine): đây là **khớp từ khoá** trên `latestActivity` ("agent đang sửa bug auth").
- params `{query:string, limit?:number}`. Logic shape thuần `shapeSearch(rows, now)` → test được.
- Chạy đa máy, $0.

### `laam_get_timeline` — timeline 1 phiên
- Bọc parser sẵn có (`getTimeline`/`getLocalTimeline` theo `source`), đọc `transcriptPath`.
- ⚠️ **host-only**: phiên ingest từ máy khác không có `transcriptPath` live → trả `{timeline:[], note:"host-only"}`.
- **Trim last ~25 event** (tránh `_truncated` của guard 8192).
- params `{id:string}`.

### `laam_query_audit` — đọc audit_log
- Đọc `audit_log` (`action`/`target`/`createdAt`) gần nhất, optional lọc theo `action`.
- params `{limit?:number, action?:string}`. Trả "ai làm gì gần đây" (connector write, safety gate).

## 5. Họ `util_*` (Section 4)

### `util_calc` — số học deterministic
- Parser biểu thức an toàn (**KHÔNG `eval`/`Function`**): tokenize + shunting-yard, hỗ trợ `+ - * / % ^ ( )` + số thập phân/âm. Thuần → test đầy đủ.
- params `{expr:string}` → `{expr, result}` hoặc `{error}`.
- Rule 5: code làm transform deterministic, không để LLM tự tính.

### ~~`util_now`~~ — **BỎ (YAGNI)**
System prompt đã chèn "Hôm nay là `<date>`" (`buildSystemPrompt`) → thừa.

## 6. An toàn & hoãn (Section 5)

- Họ `fs_*`/`sys_*` (đọc file / chạy lệnh sandbox) = `kind:"write"` → **tự động qua SP-2 gate** (không cần hạ tầng mới). **HOÃN** sang slice sau (YAGNI + rủi ro path-traversal/RCE cần thiết kế gate riêng).
- Read tool mới: không secret, không side-effect, bound output 8192, validate args (guard) → rủi ro thấp.

## 7. Build order (Section 6)

Mỗi phase độc lập, test xanh trước khi sang phase kế:
- **W1 web** — `readable.ts` (+ refactor route) · `searxng.ts` · `web_read` · `web_search` · infra compose/settings/env.
- **W2 internal** — `laam_search_sessions` · `laam_get_timeline` · `laam_query_audit`.
- **W3 util** — `util_calc`.
- **W4 wiring** — compose 3 họ vào `INTERNAL_TOOLS`; cập nhật `INTERNAL_NAMES` tự động.
- **W5 docs+eval** — CHANGELOG/README/Serena; (stretch) thêm web tool vào `scripts/eval/union-tools.ts` + 1 scenario grounding.

## 8. Chiến lược test (TDD)

Pattern hiện có: `vi.mock("@/db", () => ({db:{}}))` + test **hàm thuần đã tách**, không test handler-gọi-DB.
- `readable.ts`: SSRF (`isBlockedHost`) + `htmlToText` (di trú test từ `route.test.ts`) + `fetchReadable` với `fetchImpl` giả.
- `searxng.ts`: mapping result + count cap + lỗi (fetchImpl giả trả JSON/þrow).
- `util_calc`: bảng biểu thức (đúng/sai/chia 0/ưu tiên toán tử/ngoặc).
- `laam_*`: hàm shape (`shapeSearch`, trim timeline, shape audit).
- **Rule 13 (eval, stretch):** mock SearXNG trả URL khác để bắt model "chuẩn hoá" link khi trích nguồn.

Không cần Postgres/Ollama/network để test.

## 9. Quyết định chốt (forks resolved)

| # | Fork | Chốt | Lý do |
|---|---|---|---|
| W-D1 | web_search backend | **SearXNG self-host** | user ràng buộc self-host+$0 |
| W-D2 | web_read text cap | **6000** (tool) / 12000 (route UI) | guard bound 8192 + bảo vệ context |
| W-D3 | "search transcript" | **search summary (DB)**; transcript-grep → backlog | text transcript host-only/nặng |
| W-D4 | util_now | **bỏ** | date đã ở system prompt |
| W-D5 | fs/sys tools | **hoãn** | YAGNI + cần thiết kế gate riêng |
| W-D6 | URL-level citations | **backlog**; cite-by-name tự chạy | tránh đụng SP-4 đã test |
| W-D7 | schema | **0 migration** | tool read-only trên bảng có sẵn |

## 10. Ngoài phạm vi / backlog

- Full-text grep transcript `.jsonl` (host-only).
- DuckDuckGo fallback khi SearXNG down.
- URL-level "Nguồn:" (enhance `deriveCitations` đọc result `url`).
- `fs_read`/`sys_exec` gated.
- Eval scenarios web (nếu không kịp W5).
- OCR/geo *promote* (đã có route; promote tương tự web_read — slice riêng).

## Liên quan
[[agent-harness-architecture]] · [[agent-harness-sp2-actions-safety]] (gate) · [[agent-harness-sp4-ux-feedback]] (trace/cite) · [[harness-reliability-eval]] (eval) · [[poc-model-choice]] · [[v2-app]].
