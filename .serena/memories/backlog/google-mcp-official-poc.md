# Backlog: PoC Google official Workspace MCP (track A1) — CHỜ ĐIỀU KIỆN

**Verdict 06-11 (plan v2.3, panel 3 vai):** GIỮ REST connectors làm primary. KHÔNG thay bằng MCP
(official Gmail MCP **không có send** → mất gmail_send đã gate recipient+workflowSafe; đang
Developer Preview không SLA). MCP-client adapter generic ĐÃ SHIP từ P6 `e3e7ed0`
(client/discovery fail-closed/SSRF/store mã hoá/UI McpServersSection) — "API mới dạng MCP"
phần lớn là việc TRUYỀN THÔNG/DOC, không phải build.

## Điều kiện kích hoạt PoC A1 (đủ HẾT mới làm, timebox 1 ngày, nhánh vứt đi)
1. Operator enroll Google Workspace Developer Preview (quyết định account: công ty exnodes.vn hay personal?).
2. Trả lời được: official MCP endpoint (gmailmcp.googleapis.com/mcp/v1) có nhận access-token
   PKCE thường (flow hiện tại của LAAM) gắn Authorization header không?
   **KILL-SWITCH: nếu bắt buộc DCR/OAuth-MCP flow riêng → A1 vô hiệu, đóng backlog này.**
3. Nêu được ≥1 tool official MCP mà REST connector CHƯA có và team thật sự cần.
4. PoC dùng access token mint TAY dán vào — KHÔNG build dynamic-token provider trước khi
   quyết định giữ integration. (Token Google sống ~1h — static bearer chết, biết trước.)

## Lưu ý kèm theo
- MCP tool ngoài mặc định kind=write fail-closed (discovery.ts:50-52) → mọi call qua confirm-card
  nếu không bật trustReadHints — adoption risk chính, không phải footnote.
- Endpoint official: gmailmcp/drivemcp/calendarmcp/chatmcp/people .googleapis.com/mcp/v1 (5 server,
  Streamable HTTP, OAuth 2.0 3-legged). Nguồn: developers.google.com/workspace/guides/configure-mcp-servers.
- Đánh giá lại option thay-READ-bằng-MCP khi official GA + đủ tool surface (send).
