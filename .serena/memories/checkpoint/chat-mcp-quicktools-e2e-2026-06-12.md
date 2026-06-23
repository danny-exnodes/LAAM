# Checkpoint: chat-mcp-quicktools-e2e — 2026-06-12

## What was done
- E2E THẬT qua Claude-in-Chrome (Browser 2 Windows-local, tài khoản user login + MCP **DAAB** cấu hình sẵn, tailnet `https://danny-gaming-pc.tail41dda4.ts.net:8443` = dev/current code).
- Investigate 4 mảng user yêu cầu: (#1) độ tin cậy agent trigger MCP tool trong chat, (#2) quick-tools, (#3) workflow node library, (#4) mobile node-bar.
- Findings + plan đầy đủ → `decisions/chat-mcp-quicktools-workflow-e2e.md` (đã update INDEX).

## Findings (tóm tắt — chi tiết ở decision file)
- **#1:** DAAB = MCP knowledge-graph (~32 tool `mcp__daab__kg_*`). Tool CÓ chạy thật. 4 failure mode: (a) không suy ra param đục UUID `project_id`; (b) chọn sai biến thể (kg_query→kg_search); (c) narrate-but-stop 18 token; (d) bịa danh-sách 79 tool trộn nhóm. ⇒ đòn bẩy = picker chọn tool tường minh + hint required-args, KHÔNG tune prompt.
- **#2:** quick-tools `/` chỉ 5 lệnh app (/moi/xoa/dung/xuat/caidat). Cần picker gom nhóm Internal/Connectors/MCP/app-cmd.
- **#3:** workflow node library chỉ 4 node (Agent/Connector/Điều kiện/Lặp). Thiếu MCP node + Custom Agent/preset.
- **#4:** desktop node-bar = sidebar trái dọc; mobile chưa đồng nhất (verify chi tiết lúc build).

## Current state
- CHỈ investigation + plan. **CHƯA code gì** cho 4 feature. User chọn **mở phiên mới tập trung** để build (option 2).
- main = e422ba7 (v2.4.1). Working tree còn việc Node 24 UNCOMMITTED của phiên "claude" khác (Dockerfile/package.json engines/lock) — KHÔNG đụng.

## Next steps (phiên build mới)
- Đọc `decisions/chat-mcp-quicktools-workflow-e2e.md` (plan P1–P4) + [[chat-tool-selection]] + [[workflows]] + [[connectors-mcp-client]].
- Build trong **worktree riêng** (shared checkout): P1 quick-tools picker → P2 workflow MCP node → P3 Custom Agent → P4 mobile parity. TDD + E2E re-test qua Claude-in-Chrome (DAAB, tránh write thật → Demo connector).
- Dọn: 1 workflow nháp trống "Workflow mới" (`f5af11d3-ddab-441e-ade5-469391aad4e2`) tạo lúc khảo sát — xoá.

## Blockers / Risks
- Prod đang v2.1.0 (docker laam-app cũ) — build không ảnh hưởng prod tới khi rebuild. Test trên dev tailnet 8443.
- Đo reliability phải multi-probe k cao, KHÔNG tune prompt trên 1-probe (bài học chat-tool-selection).
