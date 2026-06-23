# Checkpoint: qa-e2e-workflow (QA/QC lead) — 2026-06-05

## What was done
- QA E2E **live** feature Workflows trên dev `:8443` (Tailscale), Browser 3 (Windows local), Ollama qwen3-vl. Chạy 9/9 kịch bản handoff (`docs/workflow-feature-handoff.md`).
- Boot Protocol đầy đủ (INDEX → `workflow-orchestration-architecture` → checkpoint `claude-workflow-06-05` → handoff doc → đọc source UI/route targeted).
- **Test setup:** bật Demo connector (handoff §4 yêu cầu; demo data, no credential, reversible).

## Kết quả 9 kịch bản
- E2E-1 manual demo ✅ (2.9s; lần đầu fail 23ms vì Demo connector chưa bật).
- E2E-2 moat digest ✅ (đọc `agent_sessions` thật, 24s, ID phiên thật).
- E2E-3 run-log ✅ · E2E-4 schedule ✅ (cron validate + tạo; tick→401=secret đã set) · E2E-5 condition ✅ live (foreach chỉ engine-test) · E2E-6 editor ⚠️ **F1 chí mạng** · E2E-7 clone ✅ (+round-trip Save giữ edge) · E2E-8 404 ✅ (caveat 2-account) · E2E-9 blast gate ✅ fail-closed.

## Findings → backlog/
- `workflow-qa-functional-bugs` — **F1🔴** editor thiếu `<Handle>` (không nối được/edge vô hình) · F2🟠 không xoá được workflow · F3🟠 `/new` insert trên GET (3 draft mồ côi) · F4🟠 run fail im lặng.
- `workflow-qa-ui-bugs` — U1🟠 React key console (`WorkflowDetailClient`) · U2🟠 `NodeConfigPanel` ngoài i18n · U3🟠 node mới ngoài màn hình · U4/U5 nhỏ.
- `workflow-qa-feature-upgrades` · `workflow-qa-ux-improvements`.

## Test data đã tạo (⚠️ KHÔNG xoá được qua UI — F2)
- Demo connector: bật (reversible "Ngắt" ở /connectors).
- Workflows: "…(bản sao)" `179ff5c1` (+schedule */5 + 2 run) · "QA — blast gate HIGH" `235d4669` (+1 run failed) · "QA — condition branch" `4c925954` (+1 run). + 1 run trên demo `c2dc5580`.
- 3× "Workflow mới" (Nháp) = pre-existing (bằng chứng F3).

## Next steps
- Ưu tiên fix **F1** (thêm Handle) — gỡ chặn editor multi-node + E2E-5 foreach UI + làm cạnh hiện.
- Dọn test data (cần DELETE endpoint F2 hoặc DB).
- Verify scheduled-fire thật (cần secret + Windows Task + tới giờ due).

## Blockers / Risks
- **F1 chặn dựng workflow nhiều-node qua UI** (chỉ template/1-node dùng được) — toàn bộ "kéo-thả" core.
- Tick yêu cầu `WORKFLOW_TICK_SECRET` (đã set) → QA không tự test fire được (không dùng secret).
- Build editor "mù" của dev → đây là lần QA visual đầu tiên; còn nhiều UX gap (xem ux file).
