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
**Ngày:** 2026-06-07 · **Từ:** CTO · **Trạng thái:** ✅ APPROVED — phân rã 3 feature **chốt**, 4 quyết định ra dưới đây. Consultant nâng memo PROPOSED→locked và viết plan P0 Access spine.

**Tiền đề:** đã tự verify lại 7 claim load-bearing từ code (schema.ts:99 · ingest route bỏ RBAC · /machines redirect · machineId/source nullable · sha256+thiếu unique index · `ConnectorTool.kind` · 2 memo client/host). Brief đứng vững. Đồng ý chẩn đoán: Machines gánh 3 nghĩa chồng → tách Principal/Token × Session × Source là đúng trục.

**Q1 — Token model → `H3` (unified `access_token`, gỡ token KHỎI machines).**
Đây là lựa chọn DUY NHẤT sửa tận gốc conflation (a)máy vs (b)credential — vốn là toàn bộ luận điểm của brief. H2 = 2–3 cơ chế bearer song song → **Rule 7 cấm hybrid**, loại. H1 = nửa vời (gộp bảng nhưng vẫn hàn token vào machine, conflation sống tiếp trong bảng mới). Chi phí migration của H3 chấp nhận được: <50 user, ta sở hữu mọi collector nên rotate token dễ. **Buộc kèm:** (1) unique index trên `access_token.tokenHash` (gap thật); (2) cột `prefix`/`last4` cho UI; (3) sha256 GIỮ NGUYÊN (token entropy cao, không phải password — không bcrypt); (4) ingest resolver phải **forward-compat trong giai đoạn chuyển**: tra `access_token` trước, migrate `machines.tokenHash`→`access_token(kind=collector)` rồi mới drop cột (không big-bang re-issue).

**Q2 🔴 — Ingest org-shared vs user-attributed → ATTRIBUTION ghi nhận, VISIBILITY theo nguồn.**
Đây là quyết định load-bearing và tôi chốt dứt khoát để không drift: **monitoring KHÔNG chuyển sang per-user isolation.** Lý do sống còn: value-prop của LAAM là *cả team xem agent chạy đa máy* — cô lập row-level theo user sẽ phá chính lý do tồn tại của feature (đồng đội không thấy agent của nhau). Vậy:
- `userId` trên token = **provenance/revoke/audit** (ai đăng ký collector, ai sở hữu key), KHÔNG phải khoá cô lập dữ liệu.
- **Visibility theo từng nguồn, đúng mô hình đang có** ([[v2-architecture]]): rows nguồn `local-computer`/`api-mcp` = **org-shared** (mọi member auth xem; viewer read-only); rows `chat`/`workflow` = **per-user** (chủ thấy của mình) vì `chat_*` vốn per-user.
- → Read-model "monitored runs" (feature B) **bắt buộc** phủ isolation per-source khi query, KHÔNG phẳng hoá thành 1 mức. Đây là invariant, viết vào spec B.

**Q3 — MCP-server scope → read-only `laam_*` TRƯỚC, write defer sau gate riêng.**
External agent = principal NGOÀI vùng tin cậy của ta. Cho nó kích connector write (gửi mail/tạo card) qua key của ta = blast-radius lớn qua trust boundary không kiểm soát. Khớp posture SP-2 (write surface tối thiểu, [[agent-harness-sp2-actions-safety]]) + YAGNI. **Ship read-only `laam_*`** (khép vòng với Monitoring B, an toàn tự nhiên). Write exposure = quyết định riêng SAU, kèm blast-radius gate + per-key scope grant. Cho phép A ship khái niệm `scope` ở mức read trước, chưa cần dựng trọn write-authz.

**Q4 — Naming → GIỮ "Machines" cho tab/filter Local; vocab mới chỉ ở tầng model/settings.**
"Machines" vẫn ĐÚNG cho surface đã thu hẹp (máy dev vật lý chạy collector). Không churn thuật ngữ user-facing khi từ vẫn đúng → tránh i18n churn vi/en/zh vô ích, reversible. `/settings/machines`→`/settings/access` OK (settings surface thật sự tổng quát hoá). Token/Session/Source/Access sống ở model+settings, không trồi lên nav.

**Sequencing — duyệt:** `Access (P0)` → [`MCP-server` ∥ `Monitoring read-model`]. P0 Access spine là precondition cứng, làm trước.

**Next:** consultant → (1) memo PROPOSED→**locked** ghi 4 verdict; (2) `superpowers:writing-plans` cho **P0 Access spine** (H3 migration forward-compat + unique index + prefix/last4 + ingest resolver). Spec B phải khắc invariant Q2 (visibility per-source). Đóng thread này → `comms/resolved/` sau khi memo locked.
<!-- /CTO verdict -->
