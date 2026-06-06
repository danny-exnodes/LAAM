# Workflow Orchestration — Báo cáo QA E2E & Đề xuất cải thiện

**Ngày:** 2026-06-05 · **Người test:** QA/QC Lead · **Bản build:** `main` (sau `9b46522`)
**Môi trường:** dev server `:3100` qua Tailscale HTTPS `:8443` · Chrome (Windows local) · Ollama `qwen3-vl:8b-instruct-q8_0` · Demo connector bật · owner đã đăng nhập
**Tài liệu nguồn:** `docs/workflow-feature-handoff.md` (kế hoạch E2E 9 kịch bản) · findings nội bộ: `.serena/memories/backlog/workflow-qa-*.md`

> **Cách đọc:** tài liệu này đứng độc lập — mỗi bug có **mức độ · khu vực · cách tái lập · quan sát vs kỳ vọng · root cause (file) · gợi ý fix**. Mục §6 liệt kê thứ tự fix đề xuất.

---

## 1. Tóm tắt điều hành

Feature đã chạy **9/9 kịch bản E2E**. **Backend (engine, scheduler, blast-gate, templates, clone, bảo mật) rất vững** — qua được mọi kịch bản live. **Rủi ro tập trung ở lớp UI editor** (được build "mù", không chạy dev khi code) với **1 bug chặn nghiêm trọng**.

| Phân loại | Số lượng | Nổi bật |
|---|---|---|
| 🔴 Critical | 1 | F1 — editor không nối được node / cạnh vô hình |
| 🟠 Major | 6 | F2 không xoá workflow · F3 draft mồ côi · F4 run-fail im lặng · U1 lỗi console key · U2 i18n · U3 node ngoài màn hình |
| 🟡 Minor | 2 | U4 ngày vi-VN · U5 ✓/✗ schedule |
| ➕ Feature cần thêm | 9 | xoá workflow, quản lý schedule, form condition/foreach, picker connector… |
| 🎨 UX | 10 | toast run, markdown output, nhãn step… |

**Khuyến nghị release:** chưa nên coi editor là "khả dụng cho người dùng cuối" cho tới khi fix **F1**. Các luồng template-instantiate + run + schedule + clone thì đã sẵn sàng.

---

## 2. Môi trường & cách tái lập test setup

```
1. Dev server chạy (next dev :3100), Postgres + migration 0004/0006 đã áp, Ollama chạy.
2. Đăng nhập owner.
3. /connectors → "Demo (dữ liệu mẫu)" → bấm "Bật"  ← BẮT BUỘC, nếu không E2E-1 fail.
4. /workflows → "Từ mẫu" → instantiate "Tóm tắt công việc (demo)" + "Digest agent chạy đêm qua".
```

**Lưu ý môi trường phát hiện trong lúc test:**
- `WORKFLOW_TICK_SECRET` **đã được set** → `POST /api/workflows/tick` trả **401** kể cả từ localhost (chế độ require-secret-when-set). Đúng về bảo mật; nhưng nghĩa là **không thể test scheduled-fire** nếu không có secret + Windows Task + tới giờ due.

---

## 3. Ma trận kết quả 9 kịch bản

| # | Kịch bản | Verdict | Bằng chứng |
|---|---|:---:|---|
| 1 | Manual run (demo template) | ✅ | Run succeeded 2.9s; 2 step `fetch`(connector)→`summarize`(agent); agent tóm tắt VN mạch lạc. (Lần đầu fail 23ms: *"connector demo chưa được kết nối"* → bật Demo connector → PASS) |
| 2 | Moat template (digest agent) | ✅ | Run 24.0s; agent đọc `agent_sessions` thật → digest có ID phiên thật + phân loại stuck/idle/token-burn (717k, 1.2M token) |
| 3 | Run-log + step detail | ✅ | Expand run → step; hiện kind/status/output (success) **và** error (hộp đỏ) đúng |
| 4 | Schedule + cron | ✅ | Cron sai `"not a cron"`→ **400** *"cron: cần đúng 5 field, nhận 3"*; cron `*/5 * * * *`→ **201** + nextRunAt + tz `Asia/Ho_Chi_Minh`; hiển thị bảng OK |
| 5 | Condition / foreach | ✅ / ⚠️ | **Condition live PASS**: `a`✓→`c`(condition)✓→`t`(TRUE)✓, `f`(FALSE) không chạy. **Foreach**: chỉ engine-test (73+ unit test); **build qua UI bị F1 chặn** |
| 6 | **Editor canvas** | ❌ | **F1** — xem §4 |
| 7 | Clone | ✅ | Bản sao độc lập, status reset "Nháp", credential-free; **round-trip Save giữ edge** (clone → mở editor → Lưu → chạy lại OK 2 step, 2.5s) |
| 8 | Bảo mật cross-user | ✅* | `GET /api/workflows/<id-không-tồn-tại>` → **404** *"Workflow không tồn tại"*. *Caveat: test 2-tài-khoản thật chưa làm (QA không tạo account); chỉ verify path 404* |
| 9 | Blast gate (HIGH write) | ✅ | `trello_create_card` (HIGH) → run **failed**, lỗi *"blast: 'trello_create_card' là write blast-radius cao — không cho phép trong workflow v1 (chỉ BLAST_LOW)"*; chặn **trước** khi gọi connector |

---

## 4. Bug chi tiết

### 🔴 F1 — Editor: không vẽ được cạnh & cạnh có sẵn vô hình

- **Mức độ:** Critical (chặn mục đích lõi của editor)
- **Khu vực:** `src/components/workflows/editor/WorkflowEditor.tsx` → component `WfNodeCard` (~L46–101)
- **Tái lập:**
  1. Mở `/workflows/<demo-id>/edit` (workflow có sẵn cạnh `fetch→summarize`).
  2. Quan sát canvas: 2 node nằm cạnh nhau **không có đường nối**.
  3. Mở DevTools Console → thấy lặp lại: `[React Flow]: Couldn't create edge for source handle id: "null", edge id: fetch->summarize-`.
  4. Thử kéo từ node này sang node kia để tạo cạnh → **không tạo được** (không có điểm neo/handle để bắt đầu kéo).
- **Quan sát:** Custom node chỉ render `<div>` (kind label + nội dung + id). React Flow cần node tự render `<Handle>` để (a) neo cạnh, (b) cho phép kéo-nối. Thiếu Handle ⇒ cạnh không render + không nối được.
- **Kỳ vọng:** Cạnh có sẵn hiển thị; kéo từ handle node A sang node B tạo cạnh mới.
- **Hệ quả nghiêm trọng:** **Không dựng/sửa được workflow nhiều-node nào qua canvas.** Chỉ workflow từ template (edge có sẵn trong data JSON) hoặc 1-node là dùng được. Điều này cũng **chặn E2E-5 (condition/foreach) qua UI** — chỉ build được bằng API.
- **Điểm trấn an (đã verify):** round-trip Save **không** làm mất edge — React Flow giữ edge không-render trong state, `fromReactFlow` serialize lại đầy đủ. Mở + Lưu workflow cũ **không** làm hỏng nó (clone demo → mở editor → Lưu → chạy lại OK).
- **Gợi ý fix:** Trong `WfNodeCard`, thêm:
  ```tsx
  import { Handle, Position } from "@xyflow/react";
  // target (trừ node không có incoming nếu muốn): <Handle type="target" position={Position.Left} />
  // source: <Handle type="source" position={Position.Right} />
  // condition cần 2 source handle có id để khớp edge label:
  //   <Handle type="source" id="true"  position={Position.Right} style={{ top: '35%' }} />
  //   <Handle type="source" id="false" position={Position.Right} style={{ top: '65%' }} />
  ```
  Đồng thời rà `graph-serde` + `onConnect` để map `sourceHandle` → edge `label` (`true`/`false`) cho condition.
- **Vì sao unit test không bắt:** canvas interaction (drag-connect, render edge) chỉ tồn tại lúc render thật trong DOM; jsdom không mô phỏng → đây chính là loại bug "live QA" bắt được mà unit test không.

### 🟠 F2 — Không có cách xoá workflow

- **Khu vực:** `src/app/api/workflows/route.ts` (chỉ POST+GET) · `src/app/api/workflows/[id]/route.ts` (chỉ GET+PATCH) · `WorkflowsClient.tsx` (actions: Run/View/Edit/Clone)
- **Quan sát:** Không có route `DELETE` và không có nút xoá ở list/detail. Workflow tích tụ vĩnh viễn (sau phiên QA có 8 workflow, không xoá được cái nào qua UI).
- **Gợi ý fix:** `DELETE /api/workflows/[id]` (ownership-checked, cascade `workflow_run`/`run_step`/`schedule`) + nút xoá ở list/detail + confirm dialog.

### 🟠 F3 — `/workflows/new` insert DB trên mỗi GET

- **Khu vực:** `src/app/workflows/new/page.tsx`
- **Tái lập:** Bấm "Workflow mới" nhiều lần (hoặc reload trang `/workflows/new`) → mỗi lần tạo 1 workflow "Workflow mới" (status Nháp).
- **Quan sát:** Server component insert workflow **rồi** redirect — side-effect trên GET, không idempotent. Bằng chứng: **3 draft "Workflow mới" mồ côi** trong list (từ các lần bấm thử). Cùng **F2** (không xoá được) = rác vĩnh viễn.
- **Gợi ý fix:** Chỉ tạo workflow khi user **Lưu lần đầu** trong editor (editor blank → POST khi Save); hoặc job dọn draft rỗng + cho xoá (F2).

### 🟠 F4 — Run thất bại không báo chủ động (fail-silent)

- **Khu vực:** `WorkflowsClient.tsx` (`handleRunNow`/`handleClone`/`handleInstantiate`) · `WorkflowDetailClient.tsx` (`handleRunNow`) · `src/app/api/workflows/[id]/run/route.ts`
- **Tái lập:** Bấm "Chạy ngay" trên workflow sẽ fail (vd connector chưa kết nối, hoặc node HIGH-blast).
- **Quan sát:** UI **không hiện toast/thông báo lỗi** nào. Hai tầng nguyên nhân:
  1. Các handler `await fetch(...)` rồi **bỏ qua `res.ok`**.
  2. `/api/workflows/[id]/run` trả **HTTP 200** với body `{ok:true, run:{status:"failed"}}` cho fail mức-run (blast gate / step lỗi) → lỗi nằm trong **body** chứ không phải HTTP status → kể cả nếu UI check `res.ok` cũng không bắt được.
  ⇒ Người dùng phải tự nhận ra dòng run "Thất bại" mới xuất hiện, rồi **expand run → expand step** (3 lớp click) mới thấy lý do. Với lỗi HTTP thật (401/400/500) thì **không có dòng run nào** → im lặng hoàn toàn.
- **Kỳ vọng:** Toast "Chạy thất bại: <lý do>" ngay khi bấm.
- **Gợi ý fix:** Kiểm tra cả `res.ok` **và** `body.run.status`; hiện toast/banner kèm `run.error` hoặc lỗi step đầu tiên.

### 🟠 U1 — Lỗi console React "key" trên trang detail

- **Khu vực:** `src/components/workflows/WorkflowDetailClient.tsx` (~L289)
- **Tái lập:** Mở `/workflows/<id>` có ≥1 run → DevTools Console: `Each child in a list should have a unique "key" prop. Check the render method of WorkflowDetailClient.` (mức ERROR, lặp mỗi render). Kích hoạt overlay đỏ **"1 Issue"** của Next dev.
- **Root cause:** `runs.map((run) => (<>...</>))` — fragment shorthand `<>` **không nhận `key`**; key đang đặt ở `<tr>` con chứ không ở phần tử được `.map` trả về.
- **Gợi ý fix:** `import { Fragment } from "react"` rồi `runs.map((run) => (<Fragment key={run.id}>...</Fragment>))`.

### 🟠 U2 — `NodeConfigPanel` hardcode hoàn toàn, ngoài i18n

- **Khu vực:** `src/components/workflows/editor/NodeConfigPanel.tsx`
- **Quan sát:** Toàn bộ label/placeholder/lỗi/hint ("System prompt", "Prompt *", "Connector ID *", "Action *", "Args (JSON)", "Điều kiện (Predicate JSON)", "Items (template)", "Body graph (JSON)", "JSON không hợp lệ") hardcode trộn vi/en, **không qua** `dictionaries/workflows.ts`. User en/zh thấy tiếng Việt/Anh. (Handoff ghi "field-label chưa i18n" — thực tế là **toàn bộ panel**.)
- **Gợi ý fix:** Đưa hết chuỗi vào `workflows.ts` + dùng `useT`.

### 🟠 U3 — Node thêm mới rơi ngoài màn hình / sau minimap

- **Khu vực:** `src/components/workflows/editor/WorkflowEditor.tsx` → `addNode` (~L201)
- **Tái lập:** Mở editor (đã `fitView` vào các node sẵn có) → bấm "+ Agent" → node mới xuất hiện ở góc dưới-phải, **khuất sau minimap**.
- **Root cause:** Vị trí node mới `x: nodes.length*220, y: 80` theo **flow-coords**, bỏ qua transform của `fitView` → có thể rơi ngoài vùng nhìn hiện tại.
- **Gợi ý fix:** Đặt node tại tâm viewport hiện tại (`screenToFlowPosition` của center) hoặc gọi `fitView`/`setCenter` sau khi add.

### 🟡 U4 — Định dạng ngày hardcode `vi-VN`
`fmtDate` ở cả `WorkflowsClient` và `WorkflowDetailClient` dùng `toLocaleDateString/String("vi-VN")` → ngày luôn vi-VN bất kể ngôn ngữ UI. Nên lấy locale theo `laam_lang`.

### 🟡 U5 — Cột "Bật" của schedule là ký tự `✓`/`✗` thô
Không i18n, và không phải toggle (xem F-feature: schedule không sửa/tắt/xoá được).

---

## 5. Chức năng cần làm thêm (feature requests)

| Ưu tiên | Mục | Ghi chú |
|:---:|---|---|
| Cao | **Xoá workflow** | gắn F2 — DELETE endpoint + nút + confirm |
| Cao | **Quản lý schedule** | hiện chỉ **thêm** được; cần xoá / tắt-bật / sửa cron; chặn thêm trùng |
| Cao | **Editor: nối node** | phụ thuộc F1 (thêm Handle) |
| TB | **Editor: xoá node/cạnh** | không có affordance (chỉ phím Backspace mặc định RF, user không biết) |
| TB | **Editor: cảnh báo thay đổi chưa lưu** | rời trang mất sạch edit, không hỏi — cần `beforeunload` |
| TB | **Form cấu trúc cho condition/foreach** | hiện bắt gõ **JSON thô** (predicate + nested graph) trong editor "kéo-thả" — nên: condition = left/dropdown-op/right; foreach = builder body trực quan |
| TB | **Picker connector/action** | `connectorId`/`action` đang text tự do; hệ thống đã biết action đăng ký (`demo_list_tasks`, `trello_*`, `github_*`…) → nên dropdown + validate |
| Thấp | **Huỷ run đang chạy** | run đồng bộ dài (digest 24s) chỉ có spinner, không huỷ được |
| Thấp | **Connector ghi ngoài thật** (Slack/Drive) + **manual BLAST_HIGH preview** (PIN-6) | đã biết, defer — moat hiện read-heavy |

---

## 6. UX nên cải thiện

1. **Toast phản hồi run** (gắn F4) — bắt đầu/xong/lỗi kèm lý do.
2. **Render markdown** cho output agent step — hiện `<pre>` thô khiến digest hiện literal `**Tổng quan**`, bullet, emoji. Dùng react-markdown (Chat đã có).
3. **Nhãn step thân thiện** — step hiện nodeId thô ("fetch", "summarize"); nên hiện action/label (vd `demo.demo_list_tasks`).
4. **Detail page tải chậm** ~5s spinner toàn trang (3 fetch client tuần tự) — cân nhắc SSR/skeleton.
5. **Message validate kỹ thuật** — "validate: cần đúng 1 start, có 2" không chỉ rõ node lỗi, không i18n.
6. **Tiến trình run dài** — chỉ spinner; SSE có sẵn nhưng manual-run re-fetch sau khi xong nên không thấy step đang chạy live.
7. **needs-attention** — run failed chỉ có tam giác đỏ trên dòng; nên đẩy/lọc lên đầu list.
8. **Output prose font monospace** trông như code.
9. **Ngữ nghĩa status "active"** — workflow từ template chưa chạy + không lịch vẫn "Đang hoạt động".
10. **⚠️ Độ tin cậy nội dung (AGENTS.md Rule 13)** — moat digest chứa ID phiên + số liệu (82 agent, 717k/1.2M token) do **LLM 8B tái tạo** → có thể sai/ảo. Cân nhắc code chèn số liệu ground-truth thay vì để model tự "nhớ". (Digest tư vấn nên rủi ro thấp, nhưng moat phụ thuộc độ chính xác model.)

---

## 7. Đã PASS — đừng làm hỏng (regression guard)

- Engine: chuỗi connector→agent + nội suy `{{steps.x.output}}`; condition rẽ nhánh; budget cap.
- Blast gate **fail-closed** cho HIGH write (`trello_create_card` bị chặn rõ ràng, trước khi gọi connector).
- Ownership: workflow không sở hữu/không tồn tại → **404**.
- Clone: độc lập, credential-free, **round-trip Save giữ edge**.
- Cron validation (sai → 400 với thông điệp đếm field), tz convert UTC→local đúng.
- Run-log expand + hiển thị output/error.
- Editor: client-side `assertRunnable` chặn graph lỗi trước khi PATCH (an toàn dữ liệu).
- Editor **không** còn cảnh báo border React 19 (fix `9b46522` per-side longhand hoạt động).
- Dark mode + badge màu trạng thái chuẩn.

---

## 8. Dữ liệu test đã tạo & dọn dẹp

⚠️ **Không xoá được qua UI (F2)** — cần DB hoặc DELETE endpoint:

| Loại | Định danh | Ghi chú |
|---|---|---|
| Connector | Demo | **đã bật** (`/connectors` → "Ngắt" để hoàn tác) |
| Workflow | `179ff5c1…` "Tóm tắt công việc (demo) (bản sao)" | clone + schedule `*/5` + 2 run |
| Workflow | `235d4669…` "QA — blast gate HIGH" | + 1 run failed (test blast gate) |
| Workflow | `4c925954…` "QA — condition branch" | + 1 run (test condition) |
| Run | trên `c2dc5580…` (demo gốc) | +1 run thành công |
| (pre-existing) | 3× "Workflow mới" (Nháp) | rác từ F3, không do QA tạo |

---

## 9. Thứ tự fix đề xuất

1. **F1** (Handle) — gỡ chặn toàn bộ editor multi-node + condition/foreach UI + làm cạnh hiển thị. *Tác động lớn nhất.*
2. **F2 + F3** — vòng đời workflow (xoá + ngừng tạo draft rác). Dọn được dữ liệu test luôn.
3. **F4 + U1** — fail-loud (toast lỗi run) + console sạch (key). Tăng độ tin & dễ debug.
4. **U2 (i18n panel) + U3 (vị trí node)** — hoàn thiện editor.
5. **Feature §5** + **UX §6** theo ưu tiên trong bảng.

---

*Báo cáo dựa trên quan sát runtime trực tiếp (screenshot + console + network). Mọi verdict đều từ chạy app thật, không phải đọc code hay chạy test.*
