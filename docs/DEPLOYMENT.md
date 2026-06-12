# Runbook triển khai LAAM (production, Windows host)

Tài liệu vận hành cho bản production tự host trên máy Windows (Ultra 9 / RTX 5070 Ti).
Đối tượng: operator deploy/nâng cấp/backup. Tài liệu sản phẩm: [`README.md`](../README.md).

---

## 1. Kiến trúc deploy

```
Internet ──(Tailscale Funnel :443)──► host :3900 ──► container laam-v2-app :3000
Tailnet  ──(Tailscale Serve  :8443)──► host :3100 (next dev — chỉ khi dev)

laam-v2-app ──in-network──► postgres:5432 · searxng:8080
laam-v2-app ──host.docker.internal──► Ollama :11434 · host-metrics :47600
```

| Thành phần | Chạy ở đâu | Cổng | Ghi chú |
|---|---|---|---|
| App `laam-app:latest` | Docker (`laam-v2-app`) | host **:3900** → container :3000 | Next.js standalone; image đã bake sẵn `tesseract` (vie+eng+chi_sim) |
| PostgreSQL 16 | Docker (`laam-v2-postgres`) | host **:5434** → container :5432 | App nối in-network `postgres:5432`; host port 5434 tránh đụng Postgres dự án khác |
| Adminer | Docker (`laam-v2-adminer`) | :8080 | DB UI (System: PostgreSQL, Server: `postgres`, User/Pass/DB: `laam`) |
| SearXNG | Docker (`laam-v2-searxng`) | **127.0.0.1:8888** → container :8080 | **localhost-only**, không expose; app nối in-network `searxng:8080`; thiếu → `web_search` fail-soft |
| Ollama | Native trên host (GPU) | :11434 | App gọi qua `host.docker.internal:11434` |
| Tailscale | Native trên host | serve :8443 → dev :3100; funnel :443 → prod :3900 | Xem cảnh báo bên dưới |

**Tailscale — hai chế độ khác nhau về phạm vi truy cập:**

```powershell
# DEV (tailnet-only): chỉ máy trong tailnet thấy được
tailscale serve --bg --https=8443 http://127.0.0.1:3100

# PROD (⚠️ PUBLIC): funnel mở ra Internet công cộng
tailscale funnel --bg --https=443 http://127.0.0.1:3900

tailscale serve status   # kiểm tra cấu hình hiện hành
```

> ⚠️ **`tailscale funnel` = PUBLIC Internet.** Bất kỳ ai có URL đều chạm được
> `/login` và `POST /api/register`. Khi bật funnel, **BẮT BUỘC** đặt
> `REGISTER_MODE=invite` hoặc `closed` (mục 2) — và cân nhắc dùng `tailscale serve`
> (tailnet-only) thay vì funnel nếu không thật sự cần truy cập từ ngoài tailnet.

---

## 2. Biến môi trường

Nguồn chân lý là `.env.example` — bảng dưới tóm tắt cho prod. App container đọc
`.env` qua `env_file` rồi bị compose **override** mấy biến in-network
(`DATABASE_URL` → `postgres:5432`, `OLLAMA_URL` → `host.docker.internal`,
`SEARXNG_URL` → `searxng:8080`, `AUTH_TRUST_HOST`, `AUTH_URL`, `NODE_ENV`) —
xem `docker-compose.yml` service `app`.

| Biến | Bắt buộc? | Mô tả | Khuyến nghị prod |
|---|---|---|---|
| `DATABASE_URL` | ✅ | Chuỗi nối Postgres | Host: `localhost:5434`; container đã được compose override → không cần sửa |
| `AUTH_SECRET` | ✅ | Ký JWT Auth.js | `openssl rand -base64 32`; **không** tái dùng cho biến khác |
| `AUTH_URL` | ✅ (prod) | URL public của app (Auth.js sau proxy HTTPS) | Compose đặt sẵn `https://danny-gaming-pc.tail41dda4.ts.net` — đổi nếu hostname khác |
| `REGISTER_MODE` | ✅ (prod) | `open` (mặc định) / `invite` / `closed`; giá trị lạ = `closed` (fail-closed) | **`invite` hoặc `closed`** — app public qua funnel, đừng để `open` |
| `REGISTER_INVITE_CODE` | Khi `mode=invite` | Mã mời; **rỗng/chưa đặt = từ chối mọi đăng ký** (fail-closed) | Chuỗi ngẫu nhiên dài, phát tay cho thành viên |
| `CONNECTOR_KEY` | ✅ (prod) | Khoá AES-256-GCM mã hoá credential connector at-rest | **Đặt RIÊNG, đừng dựa fallback `AUTH_SECRET`** — nếu fallback, xoay `AUTH_SECRET` sẽ làm toàn bộ credential không giải mã được |
| `WORKFLOW_TICK_SECRET` | ✅ **BẮT BUỘC** (prod) | Auth máy-gọi cho `POST /api/workflows/tick`. Khi secret ĐƯỢC set: **chỉ** header `x-workflow-tick-secret` khớp mới qua (không còn fallback localhost) | `openssl rand -base64 32`; cài tick task bằng `scripts/install-tick-task.ps1` (mục 6.1) |
| `WORKFLOW_RECIPIENT_ALLOWLIST` | Khi dùng `gmail_send` trong workflow | Allowlist domain/địa chỉ người nhận. **Rỗng = fail-closed: `gmail_send` không chạy được trong workflow** | Liệt kê hẹp nhất có thể, vd `exnodes.vn,alerts@partner.com`; đổi xong phải restart container (mục 4) |
| `OLLAMA_URL` | ✅ | Endpoint Ollama | Compose override `host.docker.internal:11434` — không cần sửa |
| `DEFAULT_CHAT_MODEL` | ✅ | Model chat mặc định | `gemma4:e4b` — **không** đặt `claude-*` (summarize/proactive chạy local; Claude chỉ chọn per-request từ picker) |
| `ANTHROPIC_API_KEY` | ⬜ | Key Anthropic (server-only, không bao giờ lộ xuống client) — đặt để bật model Claude trong picker chat (C1) | Tuỳ chọn; tính phí theo token vào key org (Sonnet 4.6 / Opus 4.8) — xem ghi chú `.env.example` |
| `CHAT_NUM_CTX` | ⬜ | Cửa sổ ngữ cảnh chat | `16384` (an toàn FP16 trên 16GB VRAM — xem ghi chú trong `.env.example`) |
| `CHAT_PRESENCE_PENALTY` | ⬜ | Sampler chống lặp từ | `0.2` |
| `PROACTIVE_STUCK_MIN` / `PROACTIVE_COST_USD` | ⬜ | Ngưỡng cảnh báo chủ động | Mặc định (kẹt 10′ / $1) |
| `SEARXNG_URL` | ⬜ | Endpoint SearXNG cho `web_search` | Compose override `searxng:8080`; thiếu → fail-soft |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Khi dùng connector Google | OAuth client dùng chung (operator đăng ký) | Xem checklist mục 8 |
| `OAUTH_PUBLIC_BASE_URL` | Khi dùng BẤT KỲ flow authorize nào | Base URL trình duyệt thấy (không trailing slash) — dùng chung cho MỌI provider OAuth + Trello | `https://<host>.ts.net` |
| `ATLASSIAN_OAUTH_CLIENT_ID` / `ATLASSIAN_OAUTH_CLIENT_SECRET` | Khi dùng OAuth Jira | App 3LO operator đăng ký (chỉ 1 callback/app → verify trên prod) | Xem checklist mục 8b |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | Khi dùng connector Slack | Slack app operator tạo (KHÔNG bật rotation/PKCE) | Xem checklist mục 8c |
| `TRELLO_API_KEY` | Khi dùng nút authorize 1-click Trello | API key từ Power-Up admin (key public-ish; nhập tay vẫn chạy nếu thiếu) | Xem checklist mục 8d |
| `ZALO_APP_ID` / `ZALO_APP_SECRET` | Khi dùng connector Zalo OA | App developers.zalo.me link OA (OA phải verified) | Xem checklist mục 8e |
| `HOST_METRICS_URL` / `HOST_METRICS_TOKEN` | ⬜ | Sampler phần cứng host | Compose override `host.docker.internal:47600`; token nếu muốn khoá |
| `LAAM_PROJECTS_DIR` / `LAAM_LOCAL_LOGS` | ⬜ | Nguồn transcript Claude / log model local | Mặc định `~/.claude/projects` và `~/.laam/local-logs` — chỉ đặt khi đường dẫn khác chuẩn |
| `NEXT_PUBLIC_CHAT_RENDERER` | ⬜ | Spike renderer chat (`streamdown`) | Để trống (mặc định react-markdown) |

---

## 3. Triển khai lần đầu

```powershell
cd D:\Projects\personal_projects\LAAM

# 1) .env: copy template rồi điền các biến ✅ ở bảng trên
cp .env.example .env

# 2) Build image app (compose KHÔNG có khối build: — phải build tay, tag laam-app:latest)
docker build -t laam-app:latest .

# 3) Lên toàn bộ stack (postgres + adminer + searxng + app)
docker compose up -d

# 4) Áp migration TỪ HOST (DATABASE_URL trong .env trỏ localhost:5434)
npm run db:migrate

# 5) Tailscale (serve = tailnet-only, funnel = public — xem cảnh báo mục 1)
tailscale funnel --bg --https=443 http://127.0.0.1:3900

# 6) Cài tick task cho workflow scheduler (mục 6.1)
powershell -File scripts\install-tick-task.ps1
```

Mở `https://<host>/login` → **Đăng ký** tài khoản đầu tiên (**user đầu tiên = `owner`**;
`REGISTER_MODE=closed` vẫn cho bootstrap khi bảng user rỗng). Sau khi có owner,
khoá đăng ký lại nếu đang để `open`.

---

## 4. Nâng cấp (mỗi lần release)

```powershell
cd D:\Projects\personal_projects\LAAM
git pull                                  # hoặc merge branch release

docker build -t laam-app:latest .         # build image mới
npm run db:migrate                        # áp migration mới (idempotent, theo journal)
docker compose up -d app                  # thay container app (postgres giữ nguyên)
```

Rồi chạy checklist xác minh (mục 5). Lưu ý theo từng đợt:

- **Migration `0010` (R0 — indexes):** snapshot `drizzle/meta/0010_snapshot.json` được
  viết tay đối chiếu serializer drizzle-kit. Sau khi merge R0, chạy `npm run db:generate`
  trên host để **VERIFY drizzle báo "No schema changes"**. Nếu drizzle sinh ra file
  migration thừa → snapshot bị drift: **báo lại team, ĐỪNG commit file đó**.
- **Precondition P0a (chỉ lần đầu deploy bản có resume-spine ≥ 2.1.0):** **drain hết
  run đang `running` TRƯỚC khi deploy** — run mồ côi có-từ-trước-WAL không có idempotency
  row nên resume có thể re-send write đã commit. Đã thực hiện ngày 2026-06-10; ghi lại
  ở đây cho lần khôi phục từ backup cũ / dựng máy mới.
- **`gmail_send` / đổi `WORKFLOW_RECIPIENT_ALLOWLIST`:** env chỉ được đọc lúc process
  khởi động → **phải restart container** mới ăn: `docker compose up -d app` (hoặc
  `docker restart laam-v2-app`).

---

## 5. Xác minh sau deploy (checklist)

Chạy từ host, theo thứ tự:

```powershell
# 1) App lên + trang public trả 200
(Invoke-WebRequest http://localhost:3900/login -UseBasicParsing).StatusCode   # → 200

# 2) Auth.js hoạt động (chưa đăng nhập → JSON rỗng/null, miễn là 200)
(Invoke-WebRequest http://localhost:3900/api/auth/session -UseBasicParsing).StatusCode   # → 200

# 3) Đăng nhập THẬT qua trình duyệt: https://<host>/login → vào /dashboard

# 4) Ollama trả lời
Invoke-RestMethod http://localhost:11434/api/version   # → {"version":"..."}

# 5) OCR trong container (cần session — kiểm qua trình duyệt sau khi đăng nhập)
#    GET https://<host>/api/ocr  → {"available":true}

# 6) Workflow tick nhận secret (lấy secret từ .env)
Invoke-RestMethod -Method POST -Uri http://localhost:3900/api/workflows/tick `
  -Headers @{ 'x-workflow-tick-secret' = '<WORKFLOW_TICK_SECRET>' } -UseBasicParsing
#    → 200 (JSON claimed/executed). 401 = secret sai/chưa set trong container.
```

Thêm khi có connector: `/connectors` → **Test** từng connector đang kết nối.

---

## 6. Vận hành

### 6.1 Workflow tick (Scheduled Task mỗi phút)

```powershell
# Idempotent — chạy lại an toàn. Secret đọc từ -Secret hoặc .env (không hardcode).
powershell -File scripts\install-tick-task.ps1            # mặc định port 3900 (prod)
powershell -File scripts\install-tick-task.ps1 -Port 3100 # dev
```

Sau khi **xoay `WORKFLOW_TICK_SECRET`**: sửa `.env`, restart container app, rồi chạy
lại script trên (task nhúng secret lúc cài). KHÔNG bật catch-up của OS — app tự realign
lịch bị lỡ.

### 6.2 Backup / restore Postgres

```powershell
# Backup thủ công (mặc định: backups\laam-<yyyyMMdd-HHmm>.sql, xoá bản >14 ngày)
powershell -File scripts\backup-db.ps1

# Đăng ký backup HẰNG NGÀY 02:00 (lệnh mẫu đầy đủ trong comment của script)
```

Restore (vào DB sạch — `docker compose down -v && docker compose up -d postgres` nếu
muốn làm lại từ đầu):

```powershell
cmd /c "docker exec -i laam-v2-postgres psql -U laam -d laam < backups\laam-<...>.sql"
```

Sau restore từ backup cũ: chạy `npm run db:migrate` để áp các migration còn thiếu,
và xem lại precondition P0a (mục 4) nếu backup chứa run `running`.

### 6.3 Logs

```powershell
docker logs -f laam-v2-app        # app (lỗi chat tool-loop: "[chat] tool-loop failed (conv=...)";
                                  #      client bấm Stop: "[chat] client aborted stream")
docker logs -f laam-v2-postgres
docker logs -f laam-v2-searxng
```

### 6.4 Host-metrics sampler

`node host-agent/laam-host-metrics.mjs` hiện chạy tay (foreground). Nên đăng ký chạy
nền bằng **NSSM** hoặc Windows Scheduled Task (At startup) — backlog đã ghi nhận,
chưa có script cài sẵn.

---

## 7. Troubleshooting

| Triệu chứng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| App không lên / restart loop | Thiếu biến ✅ trong `.env` (vd `AUTH_SECRET`); migration chưa áp; port 3900 bận | `docker logs laam-v2-app`; `npm run db:migrate`; `netstat -ano \| findstr :3900` |
| `npm ci` gãy khi `docker build` (alpine) | `package-lock.json` drift mất optional dep musl/WASM (`@emnapi`, `@tailwindcss/oxide`) — npm trên host Windows hay rớt chúng | Regen lock **TRONG alpine** (tiền lệ commit `f361801`): `docker run --rm -v ${PWD}:/app -w /app node:22-alpine npm install --package-lock-only` rồi commit lock |
| OCR báo `{"available":false}` | Image Docker **đã bake** tesseract → thường chỉ gặp khi chạy host trần (`next start` ngoài Docker) | Host trần: cài tesseract native (`setup-poc.ps1` đã làm); Docker: kiểm tra image build từ Dockerfile repo |
| Ollama trả **403** khi gọi qua tailnet | Ollama từ chối Host header lạ — gọi bằng **hostname** tailnet sẽ 403 | Dùng **IP tailnet** (vd `http://100.104.39.38:11434`), không dùng hostname |
| Tick trả **401** | Secret trong task ≠ secret container đang chạy (xoay secret nhưng chưa cài lại task / chưa restart app); hoặc `WORKFLOW_TICK_SECRET` chưa set mà gọi qua proxy (có `x-forwarded-*` → không được tin localhost) | Đồng bộ secret: sửa `.env` → restart app → chạy lại `install-tick-task.ps1` |

---

## 8. Checklist OAuth Google (operator, 1 lần)

1. **Console tạo OAuth client Web** + redirect URIs `<base>/api/connectors/google/callback` (+`http://localhost:3100/api/connectors/google/callback` cho dev).
2. **Consent screen External+Testing**, thêm scopes `calendar.readonly` / `calendar.events` / `drive.readonly` / `drive.file` / `gmail.readonly` / `gmail.send`, thêm test users.
3. Set `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` + `OAUTH_PUBLIC_BASE_URL`.
4. Restart app.
5. `/connectors` → **Kết nối** từng connector Google → **Test**.
6. `gmail.send` là **restricted scope** → reconnect để re-consent; lưu ý refresh token hết hạn ~7 ngày (External+Testing) → UI có `needs_reconnect`.

## 8b. Checklist OAuth Atlassian/Jira (operator, 1 lần — tuỳ chọn, nhập tay vẫn chạy)

1. https://developer.atlassian.com/console/myapps → **Create → OAuth 2.0 integration**.
2. **Permissions**: thêm *Jira API* (classic scopes `read:jira-work`, `write:jira-work`, `read:jira-user`) + *User Identity API* (`read:me` — để hiện "đã kết nối là X").
3. **Authorization → Configure**: Callback URL = `<base>/api/connectors/atlassian/callback` (Atlassian chỉ cho **1 URL/app** → dùng prod base; dev dùng nhập tay site/email/API-token).
4. **Distribution → Enable sharing** (BẮT BUỘC — không bật thì chỉ account tạo app authorize được; điền vendor name + privacy URL).
5. **Settings**: copy Client ID/Secret → env `ATLASSIAN_OAUTH_CLIENT_ID` / `ATLASSIAN_OAUTH_CLIENT_SECRET`. Restart app.
6. Lưu ý: refresh token **xoay vòng, dùng-1-lần** (90 ngày không dùng thì chết) — LAAM tự persist + khoá chống đua; consent screen sẽ ghi "chưa được Atlassian review" (bình thường với app nội bộ).

## 8c. Checklist Slack (operator, 1 lần)

1. https://api.slack.com/apps → **Create New App → From scratch** → chọn workspace của team.
2. **OAuth & Permissions → Bot Token Scopes**: `channels:read`, `groups:read`, `channels:history`, `groups:history`, `chat:write`, `chat:write.public`.
3. Cùng trang → **Redirect URLs**: `<base>/api/connectors/slack/callback` (HTTPS bắt buộc).
4. **Basic Information → App Credentials**: copy Client ID/Secret → env `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET`. Restart app.
5. **KHÔNG bật** Token Rotation / PKCE / Public Distribution (đều là công tắc một-chiều có hại cho app nội bộ).
6. Sau khi user kết nối: mời bot vào kênh cần ĐỌC lịch sử (`/invite @LAAM`); bot token là chung cho cả workspace.

## 8d. Checklist Trello 1-click (operator, 1 lần — tuỳ chọn, nhập tay vẫn chạy)

1. https://trello.com/power-ups/admin → **New**: điền tên + Workspace, **bỏ trống** "Iframe connector URL" (trang `trello.com/app-key` cũ đã chết).
2. Tab **API Key** → **Generate a new API Key** → copy **API Key** (KHÔNG copy ô "Secret" — chỉ dùng cho OAuth1).
3. Cùng tab → **Allowed origins**: thêm origin LAAM **cả dev lẫn prod** (match theo scheme+host+port; thiếu → Trello chặn redirect SAU khi user đồng ý).
4. Env `TRELLO_API_KEY` (+`OAUTH_PUBLIC_BASE_URL`). Restart app → `/connectors` hiện nút "Kết nối với Trello".

## 8e. Checklist Zalo OA (operator, 1 lần)

1. Cần **OA đã xác thực** (giấy tờ DN tại oa.zalo.me); API gửi tin cần **gói trả phí** (vd Tăng trưởng ~2,5tr/năm — endpoint đọc chạy không cần gói).
2. https://developers.zalo.me → tạo app → copy App ID + Secret Key (Cài đặt).
3. Sản phẩm **Official Account**: link OA (account phải là admin OA) + **kích hoạt OA API** + đặt **Callback URL** = `<base>/api/connectors/zalo/callback` (1 URL → prod base).
4. Bật app **Live** → env `ZALO_APP_ID` / `ZALO_APP_SECRET`. Restart app.
5. Người bấm **Kết nối** trong LAAM phải là admin OA; team chỉ định MỘT admin đại diện (re-connect bởi admin khác có thể vô hiệu grant cũ — hành vi chưa verify, xem backlog).
6. ⚠ Endpoint Zalo lấy từ SDK chính thức (docs là SPA không crawl được) — lần kết nối thật đầu tiên cần thử **Test** + 1 lệnh đọc trước khi tin dùng.
