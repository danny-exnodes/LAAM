# 🔴 MCP read tools đọc monitoring org-shared (chưa cô lập per-user)

**Phát hiện khi build admin-provisioning (v2.4.1).** Các tool `laam_*` qua MCP/chat đọc dữ liệu giám sát mà **KHÔNG** lọc `ctx.userId`:
- `laam_search_sessions` (`where(ilike latestActivity)`), `laam_get_timeline`/`laam_get_agent` (`where(eq id)`), `laam_list_agents` (status/machine), `laam_find_stuck` (`where(ne status done)`).

Tức là **bất kỳ token api/mcp** đọc được toàn bộ agent_session của tổ chức. Hiện đúng với quyết định Q2 (monitoring local/claude = org-shared, value-prop team) nên KHÔNG phải lỗ hổng hôm nay. NHƯNG:

- `userId` trên access_token được mô tả là "isolation key cho MCP" — đó là **dành sẵn, chưa kích hoạt**. Khi thêm tool MCP trả dữ liệu **per-user** (chat/workflow riêng tư), PHẢI lọc `ctx.userId` ở các tool đó, và **re-evaluate token admin đã cấp** (token cấp cho X sẽ thừa hưởng tầm dữ liệu của X).
- `laam_query_audit` đã được đóng riêng ở v2.4.1 (principal-scope). Phần còn lại của họ `laam_*` chưa.

**Việc cần làm khi per-user MCP data GA:** thêm tầng visibility theo `ctx.userId` cho tool nào trả dữ liệu per-user; giữ org-shared cho monitoring thuần. Xem `decisions/access-provisioning.md` + `machines-decomposition.md` (Q2).
