# Decision: Tách feature "Machines" → Access / Monitoring / MCP-Server

**Ngày:** 2026-06-07 · **Vai trò:** technical consultant · **Trạng thái:** 🟡 PROPOSED — user (CTO) đang brainstorm, CHƯA chốt. Token model + open-Q còn mở.

## Vấn đề
"Machines" được thiết kế khi LAAM chỉ là *giám sát Claude agent local*. Khi đó `máy tính = collector = token = dòng ingest` là 1:1 sạch. Platform đã tiến hoá (chat harness SP1–4, connectors+OAuth, workflow durable, MCP **client**, world-tools) và hướng đi mới của user làm quan hệ đó vỡ:
1. **API key cho user** (cấp quyền truy cập platform qua key).
2. **MCP server** — LAAM expose ra cho AI agent hệ khác gọi *vào* (⚠️ NGƯỢC với MCP **client** hiện có ở [[connectors-mcp-client]]).
3. **Agent sinh từ Chat & Workflow** — chạy server-side, KHÔNG có máy nào.

## Chẩn đoán gốc — Machines gánh 3 nghĩa chồng nhau
- (a) máy tính dev vật lý (`hostname`, `id=local:<hostname>`)
- (b) credential của chương trình không-người (`tokenHash` sha256, bearer `/api/ingest`)
- (c) nhãn để ingest ghi vào (`agent_sessions.machineId`)

Bằng chứng: `/api/ingest` BỎ QUA Auth.js/RBAC (bearer→hashToken→tra `machines`, không user/role). `/machines` đã bị giáng xuống `/settings/machines` (chỉ redirect). Hardware Analytics ([[host-metrics-sampler]]) bị bolt-on — mối quan tâm thứ 4 (telemetry host Ollama), orthogonal.

Nguyên tắc khử nhiễu: tách **Principal/Token** (ai xác thực) × **Session** (đơn vị việc được giám sát) × **Source** (đến từ đâu).

## Đề xuất: 3 feature
- **A. Access & Tokens** — settings surface mới, tổng quát hoá machine token. Xương sống auth cho MCP-server + API. Collector token thành 1 *kind*.
- **B. Monitoring** — lên top-level, đa nguồn. `source`: `local-computer` (collector cũ → 1 tab) | `chat` | `workflow` | `api/mcp`. "Machines" (máy vật lý) thành *bộ lọc* trong tab local. KHÔNG merge cứng chat_*/workflow_* vào agent_sessions (lossy) → **read-model "monitored runs"** chuẩn hoá `{id,source,principal,status,startedAt,lastActivity,cost,tokens}`, click-through về detail từng nguồn. `agent_sessions.source` + `machineId` nullable = điểm mở rộng sẵn có.
- **C. MCP Server** — capability MỚI (khác MCP client). Expose `laam_*` tools cho agent ngoài, auth = API key (A), đi qua gate SP-2 sẵn có. Mỗi call mở 1 session được monitor (B) → khép vòng.

## Token model — trade-off (CHƯA CHỐT, user chọn "phân tích")
- **H1** 1 bảng `access_token` (kind discriminator): 1 chokepoint + 1 vòng đời revoke/rotate/expiry + gắn userId vào RBAC. Đổi: migration đụng machines/ingest, scopes đa hình cần resolver, ingest "as user".
- **H2** giữ `machines.tokenHash` + thêm `api_key` riêng: migration nhẹ nhất NHƯNG 2 (rồi 3) cơ chế bearer song song mãi — kiểu hybrid Rule 7 cấm.
- **H3 (RECOMMEND)** unified `access_token` + **gỡ token KHỎI machines** (machine = thực thể được giám sát thuần). Sửa tận gốc conflation (a)vs(b); enforce theo kind qua resolver (tiền lệ `resolveKind` connectors); migration vừa+bounded.
- Nuance: **sha256 ĐÚNG** (token random entropy cao, không phải password — không cần bcrypt); cần **unique index trên tokenHash**; thêm cột **prefix/last4** cho UI nhận diện key.

## Sequencing (cả 3 đều là đích — phụ thuộc cứng)
Access (precondition auth) → [MCP-server ∥ Monitoring read-model] → hội tụ (session api/mcp hiện trong Monitoring). Monitoring-unification độc lập auth nên parallel-safe.

## IA mới
Top-nav **Monitoring** (tab Local/Chat/Workflows/External) · Machines = filter trong tab Local · Hardware Analytics → panel Host/Infra · `/settings/machines` → `/settings/access`.

## Open questions (chờ user)
1. **Token model H1/H2/H3** (recommend H3).
2. Collector ingest **org-shared vs user-attributed** khi token gắn userId? (đụng cô lập dữ liệu [[v2-architecture]]: monitoring=org-shared, chat/connector=per-user).
3. MCP-server scope: expose tool nào (chỉ `laam_*` read? gồm connectors write?).
4. Giữ hay đổi tên "Machines" (đề xuất giữ cho tab Local, thuật ngữ chuyển sang Token/Session/Source ở tầng model).

## CTO review
Bản trình CTO tự-chứa (chờ verdict): [[comms/active/consultant-to-cto-machines-decomposition]].

## Liên quan
[[connectors-mcp-client]] · [[agent-harness-architecture]] · [[workflow-orchestration-architecture]] · [[v2-architecture]] · [[host-metrics-sampler]] · [[v2-app]].
