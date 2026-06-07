# Consultant → CTO: Machines feature review — đề xuất tách Access / Monitoring / MCP-Server

**Ngày:** 2026-06-07 · **Từ:** consultant · **Tới:** CTO · **Trạng thái:** 🔴 OPEN — chờ CTO verdict.
**Bối cảnh đầy đủ:** [[decisions/machines-decomposition]]. File này = bản trình CTO tự-chứa (rule được mà không cần đào thêm).

---

## 1. Executive summary
Feature **Machines** **không còn fit** hiện trạng platform. Không phải vì thiết kế sai, mà vì nó **gánh 3 khái niệm đã tách nhau ra** kể từ khi LAAM vượt khỏi "giám sát Claude local". Đề xuất **tách thành 3 feature** và **tổng quát machine token thành xương sống API-key** để đỡ được hướng đi mới (API key cho user, LAAM-as-MCP-server, monitor agent từ chat/workflow).

**1 quyết định load-bearing CTO cần ra trước:** monitoring data sẽ **org-shared** (như nay) hay **user-attributed** khi token gắn `userId`? Câu này định hình toàn bộ mô hình quyền của Monitoring mới.

## 2. Hiện trạng — verified từ code (không phải prose)
- `machines` (schema.ts:99) = `{id, name, hostname, ownerUserId, tokenHash, lastSeen}`. Một `machine` mang **3 nghĩa chồng nhau**: (a) máy tính vật lý · (b) credential của collector · (c) nhãn để ingest ghi vào (`agent_sessions.machineId`).
- **`/api/ingest` (route.ts:10-25) BỎ QUA Auth.js/RBAC** — chỉ `bearer → hashToken → tra machines.tokenHash`, không user/role. → machine token là credential của *chương trình*, không phải *user*.
- **`/machines` đã bị giáng** xuống `/settings/machines` (page.tsx chỉ `redirect`). Team đã ngầm thừa nhận nó hết hạng-nhất.
- **3 kho session rời nhau:** transcript→`agent_sessions` (source `claude|local`) · chat→`chat_*` · workflow→`workflow_runs/steps`. `/agents` chỉ đọc `agent_sessions`. KHÔNG có view thống nhất.
- **Hardware Analytics** ([[host-metrics-sampler]]) bolt-on lên /machines = mối quan tâm **thứ 4** (telemetry host Ollama), orthogonal.
- ⚠️ Hôm nay LAAM là MCP **client** ([[connectors-mcp-client]] — hút tool *vào* chat). Hướng mới là MCP **server** (agent ngoài gọi *vào*) — build **ngược chiều, hoàn toàn mới**.

## 3. Đề xuất — tách 3 feature (nguyên tắc khử nhiễu: Principal/Token × Session × Source)
| Feature | Nội dung | Ghi chú |
|---|---|---|
| **A. Access & Tokens** | Tổng quát machine token → `access_token` (kind collector/api/mcp). Xương sống auth cho MCP-server + per-user API. | Tái dùng pattern `machine-token.ts` |
| **B. Monitoring** | Lên top-level, đa nguồn. `source`: local-computer (collector→1 tab) / chat / workflow / api-mcp. Machines = *filter* trong tab local. | **Read-model "monitored runs"** phủ 3 kho, KHÔNG merge cứng (lossy) |
| **C. MCP Server** | LAAM expose `laam_*` tools ra ngoài, auth = API key (A), qua gate SP-2 sẵn có. Mỗi call mở 1 session monitor (B) → khép vòng. | Khác MCP client |

## 4. Token model — trade-off (consultant recommend H3)
- **H1** 1 bảng `access_token` (kind discriminator): 1 chokepoint auth + 1 vòng đời revoke/rotate/expiry + gắn RBAC. Đổi: migration đụng machines/ingest.
- **H2** giữ machines.tokenHash + thêm `api_key` riêng: nhẹ trước mắt NHƯNG **2→3 cơ chế bearer song song mãi** (hybrid Rule 7 cấm).
- **H3 ✅ RECOMMEND** unified `access_token` + **gỡ token KHỎI machines** (machine = thực thể giám sát thuần). **Sửa tận gốc** conflation (a)vs(b); enforce theo kind qua resolver (tiền lệ `resolveKind` connectors); migration vừa+bounded.
- Nuance: sha256 ĐÚNG (token entropy cao, không phải password); cần **unique index trên tokenHash**; thêm **prefix/last4** cho UI nhận diện key.

## 5. Sequencing (cả 3 đều là đích — phụ thuộc cứng)
`Access` (precondition auth) → [`MCP-server` ∥ `Monitoring read-model`] → hội tụ (session api/mcp hiện trong Monitoring). Monitoring-unification độc lập auth → parallel-safe.

## 6. IA mới
Top-nav **Monitoring** (tab Local/Chat/Workflows/External) · Machines = filter tab Local · Hardware Analytics → panel Host/Infra · `/settings/machines` → `/settings/access`.

## 7. CTO cần ra quyết định (4)
1. **Token model:** H1 / H2 / **H3 (recommend)**?
2. 🔴 **Ingest org-shared vs user-attributed** khi token gắn userId? (đụng cô lập dữ liệu [[v2-architecture]]: monitoring=org-shared, chat/connector=per-user). **Load-bearing.**
3. **MCP-server scope:** chỉ `laam_*` read-only (an toàn) hay gồm connectors write (cần gate + blast-radius)?
4. **Naming:** giữ "Machines" cho tab Local hay đổi hẳn thuật ngữ?

## 8. Next step sau verdict
CTO chốt 4 quyết định → consultant nâng [[decisions/machines-decomposition]] PROPOSED→locked → (nếu OK) `writing-plans`/spec cho **P0 Access spine** trước (precondition của MCP-server + per-user API).

---
### CTO VERDICT
<!-- CTO append tại đây -->
