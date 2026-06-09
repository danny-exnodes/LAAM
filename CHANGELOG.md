# Changelog

Mọi thay đổi đáng chú ý của **LAAM** được ghi ở đây.

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.0.0/),
phiên bản theo [Semantic Versioning](https://semver.org/lang/vi/).

---

## [Unreleased]

---

## [2.1.0] — 2026-06-09 — Durable AI Workflows, Gmail-send an toàn & World-Tools

> **LAAM v2.1** biến workflow thành **đáng tin cậy để chạy nền**: tự phục hồi sau
> crash, lập lịch cron, và — lần đầu — **ghi ra ứng dụng ngoài** (tạo card/issue,
> **gửi Gmail**) dưới các cổng an toàn **fail-closed**. Kèm **World-Tools** (web
> search/read, tính toán), loạt nâng cấp **Chat**, **Eval v2** (đo selection-at-scale)
> và **redesign "Matte Dark"** toàn platform. **1337 test xanh**, `tsc` sạch.

### Đã thêm — AI Workflow: connector writes trong workflow (HIGH-blast) + Gmail recipient-gate (2026-06-08/09)
- **Cờ tự-khai `workflowSafe`** (suy từ registry, **fail-closed** mặc định) thay `BLAST_LOW` hardcoded: một connector `write` chỉ chạy trong workflow khi tool tự khai `workflowSafe:true`. **Dry-run** preview mọi write (mock side-effect, không gửi thật); **real-run** enforce gate. Seam `dryRun` là hằng-số/run → không có đường real-run lọt nhánh mock.
- **Recipient-gate cho `gmail_send`** (tool tier-high-exfil **duy nhất** — đã verify gdrive/gcal chỉ ghi tài-nguyên-mình-sở-hữu): trong workflow chỉ gửi khi **mọi** người nhận (đã resolve) khớp **operator allowlist** `WORKFLOW_RECIPIENT_ALLOWLIST` (domain hoặc full-address, **không** author-widenable). **Fail-closed** (G4/G5): allowlist rỗng / 1 recipient ngoài danh sách → throw.
- **Chống RFC 2822 header-injection** — sửa ở tầng connector nên đóng **cả chat lẫn workflow**: **F1** reject CRLF ở `to`/`subject`; **F2** dựng lại `To:` từ parser canonical dùng-chung `parseRecipients` (chỉ chấp địa chỉ trần `local@domain`, loại display-name/comment/nhiều-`@`/CRLF) → "gate-thấy == Gmail-gửi", xoá parser-differential. `body` đa-dòng vẫn hợp lệ (digest).
- `gmail_send` đã **flip `workflowSafe:true`** (defense-in-depth 3 lớp: cờ code ⊥ operator allowlist ⊥ recipient khớp per-run); 9 tool tier-low (github/jira/trello/gcal/gdrive) vẫn fail-closed tới khi flip có chủ đích. Specs: `docs/superpowers/specs/2026-06-08-workflow-high-blast-design.md` + `2026-06-09-gmail-recipient-gate-design.md`.

### Đã đổi — Hạ tầng / vận hành
- **Postgres dev đổi host-port → `5434`** (container vẫn `5432`) tránh đụng Postgres dự án khác trên `:5432`. Cập nhật `DATABASE_URL` (`.env`/`.env.example`); override in-network của app container giữ nguyên `postgres:5432`.
- **Re-sync `package-lock.json` trong `node:22-alpine`** giữ các optional dep musl/WASM (`@emnapi`, `@tailwindcss/oxide`) mà npm host hay rớt → `npm ci` của Docker build không gãy.

### Đã đổi — Redesign giao diện "Matte Dark" (toàn platform, 2026-06-07)
- **Ngôn ngữ thị giác mới "Matte Dark"** (KHÔNG glassmorphism): bề mặt **đặc/matte** ngả cyan, chiều sâu từ **gradient nền + bloom** (không translucency/`backdrop-blur`). Accent thương hiệu **tím `#6d5efc` → cyan `#36a6d6`**; nền tối `#001616`; tránh màu chói (matte, gam lạnh).
- **Đòn bẩy token (áp toàn app, không sửa call-site):** retint cả thang `neutral` (~950 lượt dùng cho surface/border/text) sang họ teal, **giữ nguyên độ sáng từng nấc** ⇒ mọi `*-neutral-*` ngả cyan mà **tỉ lệ tương phản không đổi**. Đầu tối (800/900/950) canh thẳng với token `--surface-*`/`--bg-base`.
- **Token + primitives mới** (`src/app/globals.css`, `src/components/ui/`): `MatteCard` (đặc, khe `bloom`), `Bloom` (quầng sáng trang trí, `aria-hidden`+`pointer-events-none`), `MatteButton` (fill accent matte + focus-ring bắt buộc). Ambient `body::after` đổi xanh-dương → cyan/aqua. Metric tím → aqua (`ram`), node `connector` tím → cyan.
- **a11y là ràng buộc cứng** — đã verify WCAG: primary 17:1 (light) / 14.6:1 (dark), secondary 11.4/6.7:1, muted-500 4.9:1 (light), accent-link 6.1:1 (dark). `prefers-reduced-motion` tắt bloom/drift; bloom thuần trang trí.
- Light mode **giữ chạy được** (token re-map ở `:root`), dark là trọng tâm thiết kế. Preview tạm `/ui-preview`. Verify: **1125 test xanh**, `tsc` sạch. Quyết định: `.serena/memories/decisions/matte-dark-redesign.md`.

### Đã thêm — Eval v2: coverage world-tools + selection-at-scale (tooling, 2026-06-06)
- **E1 coverage:** grader `citesRealUrl` (Rule 13 cho URL → dim grounding) + 6 scenario đo world-tools (web research-loop/restraint, util_calc, laam search_sessions/get_timeline/query_audit). Eval lên **16 scenario**.
- **selection-at-scale:** suite riêng `npm run eval:scale` đo **đường cong selection vs #tool** (8/16/24/40, distractor = union prod THẬT internal+connector, Wilson CI 95%, **tách no-call vs wrong-call**). CTO nâng tầm = **cổng quyết định cho lộ trình connector** (crater → tool-subsetting trước GA).
- Đo-only · `scripts/eval/*` cô lập · **0 dep mới, không đụng harness prod**. Live run = host (`npm run eval` + `eval:scale`, cần Ollama). Verify: **1072 test xanh**, tsc sạch. Plan: `docs/superpowers/plans/2026-06-06-eval-v2-e1-selection-scale.md`.

### Đã thêm — AI Workflow P0a: Durable Resume Spine (reliability, 2026-06-06)
- **Crash-resume**: run bị gián đoạn (crash/restart) **tự tiếp tục** từ journal `workflow_run_step` — KHÔNG chạy lại node đã xong, KHÔNG gửi lại connector write. Phát hiện orphan ở **boot** (`instrumentation.register()`: run còn `running` lúc khởi động = mồ côi → `resumable`; giả định **1 process**), đánh thức qua tick poke.
- **Idempotency per-node (`workflow_node_idempotency`)**: key xác định `UNIQUE(runId, nodeId, iterIndex)` + claim nguyên tử `INSERT ON CONFLICT DO NOTHING RETURNING`. WAL — ghi ở **CẢ** lần chạy đầu (`executeRunRow`) **lẫn** resume → bảng là nguồn-chân-lý-duy-nhất cho writes: write đã `done` → replay output (không re-send); write `claimed`-chưa-record (crash giữa-gửi) → **fail-loud** (không đoán). **KHÔNG** tái dùng nonce `audit_log` (cửa-sổ-10′ + no-unique-index → vỡ với sleep nhiều ngày).
- **Truncation guard (PIN-D4b)**: rebuild ctx từ journal đã cắt 256KB → producer **read** truncated → re-run; **write** truncated → fail-loud (không để `{{steps.x.output.field}}` throw mơ hồ / ra `""`).
- **`tickResume`**: claim `resumable` **bounded + atomic** trong UPDATE (`id IN (SELECT … LIMIT 25 FOR UPDATE SKIP LOCKED)`) → không double-claim, không strand run thừa. Wire vào `POST /api/workflows/tick`.
- Engine A0 **bất biến** (toàn bộ resume ở run-layer). Migration `0008` (additive). Verify: **1085 test xanh**, `tsc` sạch. Plan: `docs/superpowers/plans/2026-06-06-workflow-p0a-resume-spine.md`.
- **Bước host (USER chạy — agent-ops):** `npm run db:migrate` áp **0008** (bảng `workflow_node_idempotency`); không backfill. Resume cưỡi tick poke có sẵn — KHÔNG service mới.
- **⚠️ Deploy precondition (1 lần):** **drain các run đang `running` TRƯỚC lần deploy P0a đầu tiên.** Run mồ côi có-từ-trước-WAL không có idempotency row → boot-sweep đánh `resumable` → resume có thể **re-send write đã commit**. Mọi run tạo sau P0a đều mang WAL → steady-state an toàn. (Review #2.)

### Đã thêm — Harness: World-Tools Layer (web/util tools, 2026-06-06)
- **`web_search`** (SearXNG self-host, **$0**, không SaaS) + **`web_read`** (promote `fetch-url` thành tool model gọi được): agent giờ **tự tìm & đọc web** trong tool-loop. Lõi fetch (`isBlockedHost` SSRF + html→text) tách `src/lib/web/readable.ts` dùng chung route + tool; tool cap text 6000 ký tự (vừa bound guard 8192).
- **`laam_search_sessions`** (tìm phiên theo từ khoá việc-đang-làm) · **`laam_get_timeline`** (timeline 1 phiên, host-only) · **`laam_query_audit`** (audit log gần nhất).
- **`util_calc`**: số học deterministic (shunting-yard parser, KHÔNG `eval`).
- Wiring: `INTERNAL_TOOLS = [...LAAM_TOOLS, ...WEB_TOOLS, ...UTIL_TOOLS]` — SP-2 gate / SP-4 trace tự áp (tool read-only nên qua gate tự do). **0 migration, 0 đổi hợp đồng SP-1.**
- Hạ tầng: service `searxng` trong `docker-compose` (localhost-only `:8888`) + `searxng/settings.yml` (bật JSON API) + `SEARXNG_URL` trong `.env.example`. **Chạy SearXNG = bước host (user)**; thiếu nó → `web_search` fail-soft.
- **An toàn (sau code-review)**: `web_read` theo dõi redirect **thủ công + re-validate mỗi hop** (chặn SSRF: 302 → host nội bộ / cloud-metadata `169.254.169.254` bị chặn, KHÔNG fetch); `util_calc` ưu tiên `^` theo chuẩn toán (`-2^2 = -4`, nhưng `2^-2 = 0.25`); SearXNG lọc kết quả không-URL **trước** khi cắt `count` (không thiếu hụt thầm lặng).
- Verify: toàn bộ **905 test xanh**, `tsc` sạch. Spec: `docs/superpowers/specs/2026-06-06-world-tools-layer-design.md`.

### Đã thêm — AI Workflow G2: Scheduler (Phase B, backend, 2026-06-05)
- **Lịch định kỳ (`workflow_schedule`)**: cron 5-field tự viết (`min hour dom month dow`; `*`, int, `*/n`, `a-b`, `a,b`), thuần, theo **giờ server-local** (tz/DST hoãn). Migration `0006`.
- **Claim nguyên tử (PIN-D1)**: `POST /api/workflows/tick` → `tickClaim` (INSERT run `queued` + advance `nextRunAt`/`lastRunAt`/`missedCount` trong **CÙNG MỘT transaction** — không có cửa "đã claim nhưng chưa advance" gây kẹt lịch vĩnh viễn) rồi `tickExecute` (chạy run `queued`). `scheduledFor` = `nextRunAt` đã lưu floored-đến-phút → unique `(scheduleId, scheduledFor)` dedupe các poke đua cùng slot.
- **Bỏ-lỡ = skip-realign**: tick trễ → fire **một** run, `nextRunAt` nhảy tới mốc cron strictly sau `now` (không dồn loạt run trễ), `missedCount += skippedSlots-1`.
- **Blast-radius gate (v1 LOW-only)**: `BLAST_LOW = {demo_create_task}`; mọi connector action `write` không thuộc allowlist → **HIGH → fail-closed throw** ở đường connector (cả manual lẫn scheduled). Reads + LOW writes qua.
- **Auth tick**: localhost HOẶC header `x-workflow-tick-secret === WORKFLOW_TICK_SECRET` — **KHÔNG** session (máy gọi). Đặt `WORKFLOW_TICK_SECRET` ở mọi deploy không-local (xem `.env.example`).
- **Observability**: `GET /api/workflows/runs` (?workflowId, ?status) + `GET /api/workflows/runs/[id]` (run + steps), đều kiểm tra sở hữu.
- **Host poke (chưa cài — bước thủ công)**: Windows Task Scheduler chạy mỗi phút gọi `POST http://localhost:3100/api/workflows/tick` (kèm header secret nếu đặt). KHÔNG bật catch-up của OS (app tự realign). Ví dụ tạo task:
  ```powershell
  # Chạy MỖI PHÚT; -UseBasicParsing để không cần IE engine. KHÔNG commit secret thật.
  $action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -WindowStyle Hidden -Command "Invoke-RestMethod -Method POST -Uri http://localhost:3100/api/workflows/tick -Headers @{''x-workflow-tick-secret''=$env:WORKFLOW_TICK_SECRET} -UseBasicParsing"'
  $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
  Register-ScheduledTask -TaskName 'LAAM-workflow-tick' -Action $action -Trigger $trigger -Description 'Poke LAAM workflow scheduler mỗi phút'
  ```
- Verify: `tsc` sạch; toàn bộ test `src/lib/workflow` xanh (A0+G1+G2). Backend-only, không UI. **`db:migrate` (áp 0006) + cài Task là bước host (user).**

### Đã thêm — Chat: nâng cấp sau E2E (2026-06-05, đợt 2)
- **Dọn dữ liệu cũ (S1)**: `POST /api/conversations {action:"backfill-titles"}` re-derive tiêu đề conv bị lẫn byte file (nút "Dọn tiêu đề" hiện khi có); badge **"trùng"** cảnh báo conv trùng tên (không tự xoá). Helper thuần `src/lib/chat/title.ts` (`retitleFromMessage`).
- **Proactive card (S2)**: dismiss **bền qua localStorage** (TTL 24h) + mỗi cảnh báo **click mở `/agents/[id]`** (thêm `key`+`sessionId` vào frame `proactive`).
- **Tool status realtime (S3)**: refactor `/api/chat` thành **một stream** phát frame tool **LIVE** ngay khi loop dispatch → UI hiện chip "đang gọi `<tool>`…" tức thì (trace hiện cả lúc đang chờ); suspend (`pending_write`) + persist dời vào trong stream; `streamOllama` giữ cho confirm round-trip. Bỏ `suspendForConfirm` (gộp inline).
- **Biểu đồ dễ đọc (S4)**: nhãn giá trị trên cột/đường (single-series), cao hơn (300px), cột bo góc.
- **Parse khoan dung (S5)**: `looseJsonParse` (bỏ dấu phẩy thừa / smart-quote / fence) cho ```chart/```map; lỗi → hiện raw; map có nút **"Thử lại"**.
- **Nearby (S6)**: prompt hướng dẫn `near` vs vị-trí-trình-duyệt; nút "Thử lại" khi từ chối định vị.
- **Token total ở header (S7)**: tổng token (miễn phí local) cho conv hiện hành.
- **Lang a11y (S8)**: aria-label bộ chọn ngôn ngữ i18n (native `<select>` vốn đã accessible bàn phím).
- **Smart rename (S9)**: hành động ✨ mỗi conv → `POST {action:"retitle",id}` đặt lại tên theo tin nhắn đầu.
- Verify: **toàn bộ test xanh**, `tsc` sạch, không đổi schema (pin/dismiss = localStorage).

### Đã sửa — Chat QA E2E (2026-06-05): lỗi giao diện & chức năng
- **U1** Composer lệch 144px + tràn dưới sidebar → thêm `relative` cho `<section>` (composer `absolute` neo đúng cột chat).
- **F1** Slash command `/moi /xoa /xuat /caidat` "chết" → nối handler từ ChatClient (trước chỉ `/dung` chạy). `/xuat` mở menu export (ChatExport thành controlled).
- **F3** OCR chết im lặng → thêm `GET /api/ocr` báo `{available}`; composer **chủ động báo trước** + bỏ qua call OCR khi thiếu tesseract (thay vì fail sau upload). *(Image Docker đã bake tesseract; host trần chạy `next start` thì chưa có — chạy bản Docker hoặc cài native.)*
- **F4** Tiêu đề hội thoại lẫn byte file đính kèm (`%PDF…`) → thêm `titleHint` (text user thật); fallback lấy **tên file**, không bao giờ là byte (Rule 13).
- **U2** Bỏ hardcode "Gemma" (empty-state/placeholder/export, cả vi/en/zh) → **tên model động** từ `/api/chat/info`, fallback trung tính.
- **U3** Nút header (giao diện/đồng bộ/tài khoản) nay **i18n** đủ vi/en/zh.
- **U-minor** Hết nháy "Chưa có cuộc trò chuyện" lúc mount → skeleton tới khi load xong.

### Đã thêm — Chat: rich-render, UX & nâng cấp
- **F2** Khôi phục render **biểu đồ/bản đồ**: dạy model hợp đồng khối ```` ```chart ````/```` ```map ```` trong system prompt; **giải mã địa lý phía client** (`/api/geocode|route|nearby`) từ tên địa điểm → marker + tuyến thật (model chỉ nêu **tên**, không bịa toạ độ — Rule 13). Module thuần `src/lib/chat/geo-resolve.ts`.
- **UX**: prompt mẫu **tự gửi** 1 chạm (UX-1); nhập URL **inline** thay `window.prompt` (UX-2); nút cuộn-đáy hiện khi rời đáy (UX-4); empty-state gợi ý **hội thoại gần đây** (UX-6); message actions hiện khi **focus bàn phím** (UX-7, a11y).
- **FEAT-1** Quản lý hội thoại: **nhóm theo thời gian** (Hôm nay/Hôm qua/7 ngày/Cũ hơn), **chọn nhiều — xoá hàng loạt**, **ghim lên đầu** (localStorage), **tìm theo nội dung tin nhắn** (`/api/conversations?q=`).
- **FEAT-2** Cảnh báo chủ động tách thành **card hệ thống riêng** (frame `proactive`, có nút bỏ qua) thay vì nhét vào câu trả lời của model; ngưỡng cấu hình qua env `PROACTIVE_STUCK_MIN`/`PROACTIVE_COST_USD`.
- **FEAT-3** Export **PDF** + **copy cả hội thoại** + **tổng token** (model local → miễn phí) trong menu xuất.
- **FEAT-4** Composer báo OCR off + chip đính kèm xem trước trích đoạn (hover).
- **FEAT-5** **Demo write-gate không cần credential**: tool `demo_create_task` (connector Demo) chạy đủ luồng gate → Confirm Card → execute offline. Doc: `docs/demo-connector-write-gate.md`.
- Verify: **540 test** xanh (từ 499), `tsc` sạch. Không đổi schema (pin = localStorage; không migration).

### Đã thêm — Agent Harness SP-3 (Memory & Proactive)
- **Lưu tool turns**: bảng mới `chat_tool_call` ghi lại từng lượt gọi công cụ (tên/args/kết quả/ok) trong một lượt chat — trước đây bị bỏ, chỉ lưu câu trả lời cuối. `chat_message` giữ nguyên (consumer hiện có không đổi).
- **Tóm tắt hội thoại dài**: khi lịch sử vượt ngân sách ký tự, các lượt cũ được **model tóm tắt** (cuộn) và giữ nguyên văn các lượt gần nhất — chat không vỡ context trên model local 16GB.
- **Cảnh báo chủ động**: trợ lý tự nêu trong chat khi có agent **đang kẹt** hoặc **chi phí cao** (ngưỡng tuyệt đối/burn-rate + dedupe theo hội thoại + cooldown 6h, không lặp mỗi lượt).
- Hạ tầng: migration **`0003`** (additive — `chat_tool_call` + cột `summary`/`summarizedThroughId`/`proactiveState` trên `chat_conversation`); module thuần `src/lib/agent/{persist,summarize,proactive}.ts` + loader chung `tools/laam/_load.ts`. **435 test** xanh, `tsc` sạch, `next build` xanh.
- ⚠️ **Cần chạy trên host:** `npm run db:migrate` (áp `0003`) trước khi chạy bản này.

### Changed
- **Tái cấu trúc repo:** v2 (Next.js) được đưa lên **root**; v1 (vanilla/Express) archive ở branch `archive/v1`. Root giờ là app v2.
- Gộp `.gitignore`; viết lại `CLAUDE.md`/`README` cho v2.

### Backlog (chưa migrate từ v1)
- Search, Office, proxy log Ollama, `/api/config` — xem `.serena/memories/backlog/v1-unported.md`.

---

## [2.0.0] — 2026-06-03 — Bản viết lại v2 (Next.js + Postgres, đa người dùng)

> **LAAM v2** (`v2/`) là bản viết lại local-first, đa máy, đa người dùng:
> **Next.js 16 + React 19 + Auth.js v5 + Drizzle + Postgres**. Đạt **parity tính
> năng** với app vanilla v1 trên 4 trang trọng tâm (Dashboard, Agents, Chat,
> Connectors) đồng thời thêm auth/RBAC, multi-machine và lưu trữ per-user.
> Thực hiện theo 5 wave (audit → hạ tầng → Agents → Dashboard → Chat → Connectors).
> **375 test** (Vitest + RTL), `next build` xanh.

### Đã thêm — Nền tảng (Wave 0)
- **i18n vi/en/zh** cho App Router (provider + `useT` + cookie `laam_lang`).
- **SSE real-time** `/api/events` + hook `useLiveSessions` (thay đồng bộ thủ công).
- **`/api/stats`** — port `lib/stats.js` thành `computeStats` có kiểu.
- **Rich render**: `MarkdownView` (react-markdown + remark-gfm + rehype-sanitize),
  ```chart``` (recharts), ```map``` (react-leaflet, SSR-safe), code highlight.
- **Export util**: CSV / Markdown / JSON / PDF (jsPDF).

### Đã thêm — Agents (Wave 1)
- Danh sách **live qua SSE** (bỏ "Đồng bộ" thủ công), gom theo project.
- Thanh lọc: tìm kiếm + project/model/status/branch/thời gian + xoá lọc.
- **Badge "nghi kẹt"** + thông báo trình duyệt, đồng hồ chạy theo giây/card.
- Chi tiết sub-agent; **waterfall tool-call** ở `/agents/[id]`; export CSV.

### Đã thêm — Dashboard (Wave 2)
- KPIs đầy đủ; doughnut status/model/branch; **timeline hoạt động 2 trục**.
- Bảng so sánh model; cost theo model; tokens theo project; top sessions.
- Tool leaderboard / errors / slowest; heatmap (hover + chú giải); export CSV/PDF.

### Đã thêm — Chat (Wave 3)
- 8 endpoint: `ollama/models`, `chat/info`, `fetch-url` (chặn SSRF), **`ocr`**
  (tesseract), `geocode/reverse/route/nearby`.
- `/api/chat` nhận **model / temperature / top-p / system prompt**.
- UI: rich render, settings panel, **đính kèm file/URL/ảnh + OCR** (drag-drop),
  message actions (copy/sửa/tạo lại/xoá) + timestamp, composer (slash menu/đếm
  token/phím tắt), sidebar (tìm/đổi tên/xoá), export MD/JSON.

### Đã thêm — Connectors (Wave 4)
- Framework `lib/connectors/`: **mã hoá AES-256-GCM**, lưu **per-user trong
  Postgres** (khác v1 dùng file cục bộ), các hàm user-scoped.
- 7 connector: demo · github · trello · jira · google-drive · google-calendar ·
  gmail (giữ nguyên tên tool như v1).
- Trang `/connectors` (kết nối/ngắt/kiểm tra) + nav link.
- **Vòng tool-calling** trong `/api/chat` (giữ nguyên đường đi khi không có connector).

### Bảo mật
- Credential connector **mã hoá at-rest per-user**; secret luôn **mask** khi hiển
  thị, không trả raw về browser. Khoá từ `CONNECTOR_KEY` (fallback `AUTH_SECRET`).

### Lưu ý nâng cấp
- Cần chạy migration trên host: `cd v2 && npm run db:generate && npm run db:migrate`
  (bảng `connector_credentials`). Đặt `CONNECTOR_KEY` cho production.
- Toàn bộ route hiện **dynamic** (root layout đọc cookie ngôn ngữ).

### Chưa làm (residual)
- Nghiệm thu runtime end-to-end (Ollama `gemma4:e4b` + `tesseract`); luồng OAuth
  thật cho Google; icon Lucide; cost theo project/ngày; relTime đa ngôn ngữ.

---

## [0.9.0] — 2026-06-03

> **Cột mốc "pre-connector".** LAAM đã chuyển hướng từ công cụ giám sát thuần tuý
> sang **trợ lý công việc hằng ngày** chạy hoàn toàn cục bộ (local, miễn phí). Toàn
> bộ nền tảng — giám sát, chat trợ lý đa phương thức, hạ tầng — đã hoàn thiện và
> chạy thật. Phần **connector** (Jira/Trello/GitHub/Google…) là cột mốc kế tiếp
> hướng tới `v1.0.0`, nên bản này là `0.9.0`.

### Đã thêm — Trợ lý Chat (`/chat`)
- **Chọn model** ngay trong chat: mặc định **`qwen3-vl:8b`** (general + tool-calling
  ổn định 18/18 + vision), kèm `gemma4:e4b` (mới nhất, nhanh nhất), `qwen3:8b`,
  `gemma3:4b`, các Qwen2.5 — tự khám phá qua `/api/ollama/models`. Chỉnh
  temperature / top-p / num_predict / system prompt theo từng hội thoại.
- **Render giàu** trong câu trả lời: Markdown (marked + DOMPurify chống XSS),
  **biểu đồ** (Chart.js), **bảng** GFM, **bản đồ** (Leaflet/OSM) với **marker SVG
  tự vẽ** (không phụ thuộc ảnh, chạy offline).
- **Bản đồ & chỉ đường thật**: geocode tên địa điểm (Nominatim), **định tuyến theo
  đường bộ thật** (OSRM), link mở Google Maps.
- **Nhận biết vị trí (location-awareness)**: tự xin GPS khi câu hỏi cần ("quanh
  đây / gần tôi / chỉ đường từ đây / toạ độ hiện tại"), reverse-geocode ra địa chỉ
  và **tiêm vào ngữ cảnh model** để trả lời thật; **tìm địa điểm quanh đây** (POI
  thật qua OSM Overpass) → marker + danh sách kèm khoảng cách.
- **OCR**: đọc **ảnh** (png/jpg/webp…) và **PDF scan** (không có lớp text) qua
  `tesseract` (vie + eng + chi_sim) để model text đọc được nội dung.
- **Đính kèm**: tải lên file (txt/md/csv/json/pdf/ảnh) và **đọc nội dung URL**
  (fetch phía server, có chặn SSRF).
- **Xuất hội thoại** ra Markdown / JSON; copy từng khối mã.
- **Lịch sử nhiều hội thoại** (đổi tên, tìm, xoá) lưu cục bộ.
- Kiến trúc **kernel + module** (`chat.js` + các `chat-*.js`) cho dễ mở rộng.

### Đã thêm — Giám sát (Monitoring)
- **Dashboard** (`/`): KPI tổng hợp, biểu đồ trạng thái/model/branch, **heatmap**
  giờ × thứ, bảng xếp hạng tool, so sánh model, **chi phí USD ước tính**, banner
  cảnh báo agent nghi kẹt, xuất **CSV / PDF**.
- **Agents** (`/agents`): theo dõi thời gian thực, gom theo project, **bộ lọc**
  (project/model/trạng thái/branch/thời gian), badge nguồn local, cảnh báo kẹt +
  thông báo trình duyệt.
- **Graph** (`/graph`): sơ đồ orchestrator → sub-agents (vis-network).
- **Session** (`/session`): chi tiết phiên + **waterfall** dòng thời gian tool-call.
- **Office** (`/office`): văn phòng **isometric** v2 — phòng theo project, agent đi
  lại/ghép cặp, kéo-thả xoay góc, HUD bật/tắt.
- Hai nguồn dữ liệu: transcript Claude Code (`~/.claude/projects`) **và** log model
  local (qua proxy) — đều gắn nhãn nguồn; model local chi phí **$0**.
- **Live update** qua SSE + file watcher (chokidar).

### Đã thêm — Hạ tầng & vận hành
- **Docker Compose**: Ollama + proxy ghi log + LAAM; override macOS giữ **GPU**
  (Ollama native) + proxy/laam trong Docker.
- **Proxy ghi log Ollama** (zero-dependency) trên `:11435` → đưa mọi lượt chat local
  vào LAAM như nguồn dữ liệu thứ hai.
- **HTTPS qua Tailscale serve** (`tailscale serve`) — cert Let's Encrypt hợp lệ trong
  tailnet → **secure context** cho GPS trên điện thoại (thay cho ngrok, đã tắt).
- **OCR**: cài `tesseract-ocr` + data vie/eng/chi_sim trong image.

### Đã thêm — Giao diện & quốc tế hoá
- **Đa ngôn ngữ** Tiếng Việt / English / 中文 (engine i18n nhẹ, đổi tức thì, lưu lựa
  chọn; font CJK fallback) — phủ mọi trang.
- **Bộ icon Lucide** vendored offline thay toàn bộ emoji/SVG tự chế, hợp theme
  sáng/tối, đồng nhất.
- **Responsive mobile** xuyên suốt; sửa loạt lỗi mobile của Chat (drawer nuốt click,
  map đè sidebar, route, ngôn ngữ trả lời).

### Kỹ thuật
- **Stack**: Node.js ≥ 18 (ESM) + Express; client **vanilla JS, không build step**;
  phụ thuộc runtime tối thiểu (`express`, `chokidar`). Mọi thư viện front-end vendored
  offline trong `public/vendor/` (Chart.js, vis-network, jsPDF, marked, DOMPurify,
  Leaflet, pdf.js, Lucide). Model local qua **Ollama** (GPU) + proxy.
- **Bảo mật**: DOMPurify cho mọi HTML từ model; `/api/fetch-url` chặn SSRF; geocode
  có User-Agent định danh + throttle; `.env`/secret **không commit** (đã .gitignore).

### Cách chạy nhanh
```bash
# Native (dev)
npm install && npm start            # → http://localhost:4317
# Model local: cài Ollama, `ollama pull qwen3-vl:8b`, chạy proxy/server.js (:11435)

# Docker (macOS, giữ GPU): Ollama native + proxy/laam trong Docker
ollama serve &
docker compose -f docker-compose.yml -f docker-compose.macos.yml up -d --build
# HTTPS qua tailnet: tailscale serve --bg http://127.0.0.1:4317
```

### Chưa có (kế tiếp → v1.0.0)
- **Connector thật**: trang `/connectors`, framework đăng ký connector như bộ *tools*
  cho model gọi qua chat (GitHub / Trello / Jira bằng token; Google Drive / Calendar /
  Gmail qua OAuth). Credential do người dùng cung cấp, lưu server-side, không commit.

---

[2.1.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v2.1.0
[2.0.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v2.0.0
[0.9.0]: https://github.com/danny-exnodes/LAAM/releases/tag/v0.9.0
