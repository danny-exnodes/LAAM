# Decision: World-Tools Layer — họ tool web/util + đào sâu nội bộ

**Ngày:** 2026-06-06 · **Vai trò:** technical consultant · **Trạng thái:** IMPLEMENTED trên `worktree-world-tools` (897 test xanh, tsc sạch, **chưa merge**).

**Spec đầy đủ:** `docs/superpowers/specs/2026-06-06-world-tools-layer-design.md` (đọc file đó để biết chi tiết; memo này = pointer + chốt).

## Vấn đề
Tool nội bộ harness chỉ đọc dữ liệu LAAM; agent **không đọc/tìm web** (route `fetch-url` chỉ là action UI), không search phiên theo từ khoá, không timeline/audit, không tính toán tin cậy.

## Kiến trúc
3 họ tool mới, tất cả `kind:"read"`, gộp 1 dòng vào registry:
`INTERNAL_TOOLS = [...LAAM_TOOLS, ...WEB_TOOLS, ...UTIL_TOOLS].map(guard)`.
- `web_*` — `web_search` (SearXNG self-host) + `web_read` (promote fetch-url). Lõi `src/lib/web/{readable,searxng}.ts`.
- `util_*` — `util_calc` (shunting-yard, không eval).
- `laam_*` (mở rộng) — `search_sessions` · `get_timeline` (host-only) · `query_audit`.
KHÔNG đụng: connector, `types.ts` (hợp đồng SP-1), gate SP-2 (read qua tự do), SP-4 trace (tự gồm), **schema (0 migration)**.

## Chốt (forks)
- **W-D1** web_search backend = **SearXNG self-host** (ràng buộc user: self-host + $0). DDG scrape / Tavily-Brave = loại.
- **W-D2** web_read cap text **6000** (vừa bound guard 8192; route UI giữ 12000).
- **W-D3** "search transcript" = search **summary DB** (transcript-grep `.jsonl` host-only → backlog).
- **W-D4** bỏ `util_now` (date đã ở system prompt). **W-D5** hoãn `fs_/sys_` (gated). **W-D6** URL-citation backlog (cite-by-name tự chạy). **W-D7** 0 migration.

## Hạ tầng (host bật, KHÔNG tự chạy)
`docker-compose` service `searxng` (localhost-only `:8888`) + `searxng/settings.yml` (bật JSON, sửa `secret_key`) + `SEARXNG_URL`. Thiếu → web_search fail-soft.

## Liên quan
[[agent-harness-architecture]] · [[agent-harness-sp2-actions-safety]] · [[agent-harness-sp4-ux-feedback]] · [[harness-reliability-eval]] · [[poc-model-choice]]. Followups: [[world-tools-followups]].
