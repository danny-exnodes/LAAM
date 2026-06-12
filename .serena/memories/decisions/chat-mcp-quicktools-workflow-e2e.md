# E2E findings + plan: MCP tool-triggering · quick-tools · workflow nodes · mobile (2026-06-12)

**Nguồn:** E2E thật qua Claude-in-Chrome trên host Windows, tài khoản user đã login + MCP **DAAB** đã cấu hình, tailnet `https://danny-gaming-pc.tail41dda4.ts.net:8443` (serve dev/current code). Đọc lịch sử hội thoại "check mcp DAAB" + survey UI. Nền: [[chat-tool-selection]].

## DAAB là gì
MCP server **knowledge-graph** (≈32 tool `mcp__daab__kg_*`: kg_query, kg_search, kg_store_concept/decision/discovery, kg_get_node/neighbors/context, kg_traverse, kg_ingest_*, kg_update_*, …). Có thể là `ennamkg-*` (docker images ennamkg-kg-server/indexer/dashboard) expose qua MCP. Nhiều tool đòi `project_id` = **UUID**.

## #1 Tool-triggering — FAILURE MODES (evidence-based, KHÔNG đoán)
Tool MCP **CÓ** được gọi thật (kg_search trả lỗi thật "project_id không đúng UUID", rồi "không có kết quả 'cá hồi'" khi có UUID). Nhưng KHÔNG đáng tin vì:
1. **Không suy ra được param đục (UUID).** `project_id` là UUID → model không thể đoán; gọi thiếu → lỗi, hoặc bịa UUID. User phải dán tay `1f991b74-…`. ⇒ đây là cốt lõi than phiền "agent không tự suy đoán biến số".
2. **Chọn sai biến thể tool.** Hỏi kg_query → chạy kg_search (32 tool kg_* gần trùng tên → nhiễu selection).
3. **Narrate-but-stop.** Có lúc chỉ in "Chạy … với tham số đã cho" (18 token) rồi dừng, không hoàn tất loop → phải re-prompt.
4. **Hallucinate tool-list.** Hỏi "check tools của DAAB" → bịa **79 tool** trộn LAAM-internal + connectors + DAAB, gán hết là "của DAAB". Model KHÔNG biết tool nào thuộc server/nhóm nào.
5. **Quá tải selection.** 79 tool >> mức ~16-47 mà eval từng đo (bare-write 100%@16). Flat prompt 79 tool → ambiguity bùng nổ.

**Hệ quả thiết kế:** đòn bẩy mạnh nhất KHÔNG phải tune prompt (đã học: prompt-tune trên 1-probe noisy = bẫy, xem [[chat-tool-selection]]) mà là **để user CHỌN tool tường minh + UI dẫn nhập required-args** (nhất là param đục như project_id). Đây nối thẳng #2.

## #2 Quick-tools — BASELINE
Gõ `/` đầu dòng → "LỆNH NHANH" chỉ **5 lệnh app**: /moi (chat mới) /xoa (xoá) /dung (stop) /xuat (export) /caidat (settings). **KHÔNG có** lệnh gọi tool. Quá nghèo.
**Hướng:** picker kiểu ChatGPT, **gom nhóm Internal / Connectors / MCP-(per server, vd DAAB) / App-commands**; chọn tool → chèn "tool intent" + (then) form/hint **required args** (project_id, idList, …) để model không phải đoán. Đây vừa fix UX vừa fix reliability #1.

## #3 Workflow node library — BASELINE
`THƯ VIỆN NODE` chỉ **4 node**: Agent (AI step), Connector (gọi tool app đã kết nối), Điều kiện (true/false), Lặp (Foreach). **THIẾU:**
- **MCP node** — gọi tool 1 MCP server (vd DAAB kg_query) trong workflow. Hiện chỉ Connector (app connectors), không reach MCP.
- **Agent presets / Custom Agent** — chỉ có Agent generic. User muốn: agent-type với prompt dựng sẵn theo vị trí, HOẶC tạo **Custom Agent** (lưu lại tái dùng). Cân nhắc bảng `custom_agent` (per-user: name, systemPrompt, model?, toolset?) + node Agent referencing nó.

## #4 Mobile node-bar
Desktop: node library = **sidebar trái dọc** ("THƯ VIỆN NODE", icon+title+desc). Mobile: user báo CHƯA đồng nhất — cần đồng bộ với desktop (xác minh chi tiết mobile lúc build; nghi mobile dùng layout khác / thiếu). Tham chiếu [[workflows]] + WorkflowEditor.

## PLAN (đề xuất, phased — build trong worktree riêng)
- **P1 Quick-tools picker (chat)** — đòn bẩy chính cho #1. Group Internal/Connectors/MCP/app-cmd; chọn tool → hint required-args. Lớn nhất + giá trị nhất. Nguồn tool: registry internal + connectors đã kết nối + MCP discovery per-user (DAAB). i18n vi/en/zh.
- **P2 Workflow MCP node** — node mới gọi MCP tool (chọn server→tool→args), engine wire qua MCP client per-user. + node-config panel.
- **P3 Custom Agent** — bảng + CRUD UI (/settings hoặc trong workflow) + Agent node tham chiếu preset; vài preset dựng sẵn.
- **P4 Mobile node-bar parity** — đồng bộ layout node library desktop↔mobile trong WorkflowEditor.
- Mỗi P: TDD + verify + E2E re-test qua Claude-in-Chrome (tài khoản user, DAAB). Tránh write thật (dùng Demo connector cho write-gate).

## Ràng buộc
- ⛔ shared checkout → worktree + junction node_modules.
- Prod đang **v2.1.0** (docker laam-app:latest cũ) — build này KHÔNG ảnh hưởng prod tới khi rebuild; test trên dev tailnet 8443.
- KHÔNG prompt-tune trên 1-probe; nếu đo reliability phải multi-probe k cao (bài học [[chat-tool-selection]]).

## ✅ BUILT (2026-06-12, branch `worktree-quicktools-mcp-agent`, 13 commits, 1859 test + tsc sạch)
- **P1:** `GET /api/chat/tools` (catalog per-user, `buildCatalogGroups` pure trong `src/lib/chat/toolCatalog.ts`) · Composer slash-menu 2 tầng + chip required-args · `/api/chat` body `requestedTool` → **`seedRequestedTool` pre-dispatch deterministic** (orchestrator.ts) qua đúng `withSafety` dispatch — tool-frame/pending-write/persist/citations nguyên vẹn; Claude+requestedTool=400; tên tool ngoài union user = 400.
- **P2:** `WfMcpNode {server,tool,args}` · `runMcpNode` compose `mcp__<slug>__<tool>` · `assertMcpAllowed` (blast.ts): chỉ read trong `readAllow` chạy real-run, dry-run mock write · `/api/connectors/mcp` GET += `toolDetails` · editor McpForm (SchemaArgsForm dùng chung connector|mcp) · coerceGraph KHÔNG sinh mcp (Rule 13).
- **P3:** bảng `custom_agent` (migration **0015**) · CRUD `/api/custom-agents` (+[id]) · `src/lib/customAgents.ts` (ownership ở tầng query) · runtime resolve `customAgentId` → override system, **preset mất = fail-loud** · AgentForm preset select (ẩn system khi dùng preset) · `/settings/custom-agents` + 3 template · coerceGraph strip customAgentId (test chốt).
- **P4:** mobile palette derive từ `NODE_TYPES` export (NodesLibraryPanel) — kind mới tự parity 2 nơi.
- Dọn draft `f5af11d3-…` ✅ (DELETE 1, 0 schedule/run). Plan chi tiết: `docs/superpowers/plans/2026-06-12-chat-quicktools-mcp-custom-agent.md`.
- **CHƯA:** merge vào main (chờ user) · E2E live qua Claude-in-Chrome (cần dev server chạy code mới — user host) · redeploy prod.
