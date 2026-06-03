# Quyết định: Kiến trúc v2 (local-first, đa người dùng nội bộ)

Ngày chốt: 2026-06-03. Chi tiết đầy đủ: `docs/v2-plan.md`.

## Bối cảnh
LAAM v0.9.x là tool local 1 người (vanilla JS + Express, no DB). Nâng cấp để nhiều người nội bộ dùng + giám sát đa máy, NHƯNG giữ **local-first** (KHÔNG SaaS cloud). (Bản hướng SaaS từng cân nhắc đã bị bỏ.)

## Quyết định (đã khoá)
- **Mô hình:** local-first, 1 server nội bộ + **collector** trên từng máy dev (tailnet) → giám sát **đa máy**.
- **Frontend:** Next.js 16 (App Router, React 19, TypeScript).
- **DB:** PostgreSQL (Docker) + **Drizzle** ORM.
- **Auth:** Auth.js (NextAuth) + RBAC (owner/admin/member/viewer). **KHÔNG Supabase.**
- **Realtime:** SSE (giữ như hiện tại).
- **Model:** Gemma 4 (`gemma4:e4b`) mặc định + **smart-routing** sang tool-caller (vd `qwen3-vl:8b`) khi cần connector.
- **Inference:** Ollama local ở server (GPU dùng chung), gọi thẳng localhost.
- **Mở link nội bộ:** Tailscale Serve/Funnel; auth bắt buộc.
- **Quy mô:** < 50 user.
- **Cô lập data:** giám sát = chia sẻ tổ chức (gate theo role, lọc theo máy/owner); chat + connector creds = riêng từng user (mã hoá).

## Vận hành (đã chốt)
- Retention `events`: phân vùng theo tháng, giữ chi tiết 90 ngày rồi roll-up.
- Migrate: `connectors.json` → script gán admin (mã hoá per-user); chat `localStorage` → Export/Import.
- Concurrency <50: keep-alive model + queue, 1 GPU đủ.

## Lý do quan trọng
- Bỏ SaaS để khỏi cloud control-plane + relay inference (rủi ro lớn nhất) — app chạy ngay cạnh Ollama.
- `gemma4` rớt tool-call ~2/3 lần (commit `f1233a0` từng revert) → cần smart-routing giữ connectors hoạt động.

## Hệ quả cho công việc sau
- Lộ trình Phase 0→6 (xem `docs/v2-plan.md`). Phase 0 (UI/UX + gemma4 default) làm trên bản vanilla hiện tại.
