# Báo cáo handoff: v1 → v2 — phần chưa migrate & quyết định cần xử lý

> Ngày: 2026-06-04 · main @ `8d27df0` · Dùng để bàn giao cho session khác xử lý.

## Bối cảnh
LAAM có 2 bản song song:
- **v1** (vanilla JS + Express, không DB) — đang chạy Docker cổng **:4317**. Code: `public/`, `bin/laam.js`, `lib/`, `proxy/`.
- **v2** (Next.js 16 + Postgres + Auth.js v5 + Drizzle, trong `v2/`) — đã merge vào **main** (commit `8d27df0`), chạy `cd v2 && npm run dev` → **:3000** (cần Docker Postgres + Ollama `gemma4:e4b`). Đã đạt parity Dashboard/Agents/Chat/Connectors/Graph; vừa fix 11 lỗi UI/chức năng (viền card, chart dark, full-width, grid 5/hàng, lucide icons, agents drawer + waterfall trục thời gian, connectors migration).
- **Lưu ý vận hành:** bảng `user` của v2 từng rỗng sau khi baseline reset DB → khiến chat/agents/connectors/machines "trông như hỏng". Khắc phục: đăng ký 1 tài khoản (người đầu tiên = `owner`).

## 1. Phần v1 CHƯA migrate sang v2 (4 mục)

| Phần | Code v1 | v2 | Ghi chú |
|---|---|---|---|
| **Search** (tìm full-text transcript) | `public/search.html` + `public/search.js` (144 dòng) + route `/api/search` + `lib/search.js` | ❌ Chưa có | Port nhanh: 1 lib + 1 endpoint + 1 page |
| **Office** (view 3D isometric "văn phòng agent") | `public/office.html` + `public/office.js` (523 dòng) | ❌ Chưa có | Nặng (canvas isometric) — port tốn công |
| **Proxy log Ollama** | `proxy/server.js` (:11435 → ghi `~/.laam/local-logs/`) | ❌ Không có | Xem mục 2 |
| **`/api/config` + `/api/health`** | `bin/laam.js` | ❌ Chưa có | Nhỏ; stuck-threshold ở v2 đang hardcode 10' |

**Đã có đủ ở v2:** dashboard, agents + session-detail (`/agents/[id]`), chat, connectors, graph, machines, `pricing.js`/`parser.js`/`localParser.js` (copy trong `v2/src/lib/monitoring/`), i18n (vi/en/zh), OCR, map helpers (geocode/route/reverse/nearby), export CSV/PDF/MD/JSON.

## 2. Phân tích Proxy — KẾT LUẬN: với v2 thì có thể BỎ

- v2 đặt `OLLAMA_URL=http://localhost:11434` → **gọi thẳng Ollama, KHÔNG qua proxy (:11435)**.
- Chat v2 lưu Postgres (`chatConversations`/`chatMessages`) → hiện ở `/chat`. **Không** tạo `agentSessions` → **không** hiện ở `/agents`/`/dashboard`.
- Proxy chỉ làm 1 việc: log Ollama vào `~/.laam/local-logs/` để traffic local-model hiện trong **màn hình giám sát**. Mà chat v2 vốn không feed vào màn hình giám sát.

**⇒ Proxy chỉ còn cần nếu** có công cụ KHÁC ngoài v2 gọi Ollama và muốn giám sát chúng. Nếu local-model chỉ dùng qua chat v2 → **bỏ proxy được**. Bỏ proxy: session "Ollama (local)" cũ vẫn còn trong DB, `syncLocalMonitoring` chỉ không thấy log mới (không lỗi).

## 3. Việc cần quyết định / xử lý
1. **Search** → migrate sang v2? (khuyến nghị: CÓ, chi phí thấp.)
2. **Office** → migrate hay bỏ? (tốn công; quyết theo mức độ thực sự dùng.)
3. **Proxy** → giữ (nếu giám sát Ollama từ nguồn ngoài v2) hay gỡ khỏi `docker-compose*.yml` + README?
4. **`/api/config` + `/api/health`** + bỏ hardcode stuck-threshold (đưa vào config) → làm khi rảnh.
5. **v1 (`public/` + `bin/laam.js`)** → archive bằng tag/branch SAU khi v2 deploy production + nghiệm thu; **chưa xoá vội** (v1 vẫn là bản chạy ổn định :4317).
6. (Tách biệt, không gấp) Chat v2 có nên tạo `agentSession` để xuất hiện trong dashboard giám sát không? Local = $0 nên độ ưu tiên thấp.

## 4. Residual v2 đã biết (không thuộc migration, ghi để đủ bức tranh)
- `cost-by-project` đang tính theo token (Stats thiếu field cost-per-project/day); `v2/src/components/cost-chart.tsx` cũ giờ orphan.
- `relTime` mới có tiếng Việt (`lib/format.ts` `ago()`); chưa i18n đa ngôn ngữ.
- Google connectors mới nhận OAuth access token dán tay; chưa có luồng OAuth thật.
- `fetch-url` chưa chặn DNS-rebinding.

## Tham chiếu nhanh
- Tri thức v2 (chi tiết): `.serena/memories/services/v2-app.md`, `.serena/memories/decisions/v2-dark-mode-theming.md`, `.serena/memories/decisions/v2-parity-gap.md`.
- Roadmap: `docs/v2-parity-roadmap.md`, spec: `docs/v2-plan.md`.
