# Decision: AI Workflow Orchestration — kiến trúc + phasing

**Ngày:** 2026-06-05 · **Vai trò:** technical consultant · **Trạng thái:** ✅ user ký · CTO **ký cả 2 gate** (vá F1–F4 + PIN-D3a-sink) 06-05; refinement đã áp (spec §5.2 + plan Task 3/5 + nit §3.4); comms → `resolved/`. **Plan A0 sẵn sàng** (`docs/superpowers/plans/2026-06-05-ai-workflow-a0.md`, 8 task TDD). **Hết HOLD — chờ user chọn execution mode** (subagent-driven khuyến nghị) → worktree → A0.

**Tài liệu đầy đủ:** `docs/superpowers/specs/2026-06-05-ai-workflow-orchestration-design.md` (box "#3 KHÔNG bảo đảm", 4 bảng, 5 PIN, phasing A0→E). Đọc file đó để biết chi tiết — memo này chỉ pointer + chốt.

## Vấn đề
Build nền tảng *automation* (kéo-thả, schedule/recurring, log, template, quản lý realtime) chạy SONG SONG Harness roadmap. Nhận định lõi: KHÔNG phải 1 feature mà ~6 hệ con ⇒ phân rã lát-cắt-dọc, build **TRÊN** harness (SP-1→4 đã xong) thay vì dựng runtime mới.

## Chốt (decision log)
- **D-RUNTIME:** node executor = interface; v1 chỉ `kind:"harness"` (Ollama). Field `model` sẵn, UI-chọn + Claude Code SDK **hoãn**. (Pattern SP-1: đóng băng seam, build 1 impl.)
- **D-ENTITY:** entity = **node**. Connector node (xác định) + custom agent node (prompt). Mô hình n8n.
- **D-TOPOLOGY:** engine tuyến tính (A0/A1) → +`condition`/`foreach` (A2); **hoãn DAG**. (Trần tin cậy 8B + Rule 2.)
- **D-STATE:** blackboard untyped + `{{...}}` interpolation. `run_step`=truth bền, `context`=RAM (persist bản cuối capped).
- **#3 An toàn:** agent **read-only**; mọi write = connector node tường minh (consent design-time). **BOX: #3 chốt *tập loại-action*, KHÔNG chốt nội dung (agent soạn body) / đích (agent lái channelId).** Idiom `agent→condition→connector` cho hành động có điều kiện.
- **Blast-radius (mở rộng `safety/policy.ts`):** v1 workflow = `BLAST_LOW`-only (scheduled + manual); `BLAST_HIGH` fail-closed khắp nơi. **Manual-HIGH-preview hoãn §10** — verify code: suspend `gate.ts` = abort-turn-1-write (chat), KHÔNG continue run nhiều node (F1). Tier **code-defined**. Blast-radius ⊥ volume (foreach cap vẫn áp).
- **Scheduler:** durability = **DB-claim atomic** (claim+advance MỘT tx — chống cửa-tử kẹt-vĩnh-viễn); poke = **Windows Task Scheduler** (localhost/secret auth), app-layer realign; missed = skip/fire-once; **owner cred-missing/deactivate → run fail-closed + schedule auto-disable (F4; ⚠️ `users` chưa có cột active → user-deactivate cần thêm flag)**. ⛔ background-service → xin phép (chỉ đụng từ Phase B).
- **Snapshot-on-run:** graph *authored* tĩnh vào `workflow_run.graphSnapshot`; foreach/condition expansion ghi ở `run_step` (snapshot=kế hoạch, steps=thực tế). Cred đọc **tươi**, KHÔNG đóng băng secret vào snapshot.
- **Phasing:** A0 (slice mỏng: manual+1 agent+1 connector+log+SSE) → A1 (engine+`validateGraph`) → A2 (condition/foreach/bound) → B (scheduler+blast gate+**observability tối thiểu**) → C (template moat-seed+clone) → D (editor React Flow) → E (trang quản lý đầy đủ).
- **Moat = success metric:** ≥2/3 template seed đọc `agent_sessions`/`stats` LAAM. Flagship "8h sáng digest agent đêm qua".

## 5 PIN load-bearing (đúng-trên-sơ-đồ-sai-trong-code — xem spec)
- **D1** claim+advance trong **1 transaction** (tách bookkeeping/execution); `scheduledFor`=nextRunAt-floored; poke localhost; app sở hữu realign (OS catch-up TẮT).
- **D2** tier code-defined (không user-edit) · blast ⊥ volume · **manual-HIGH hoãn §10** (suspend `gate.ts` KHÔNG tái dùng được cho run — F1; tái dùng được: `buildPreview`+tier+nonce `resume.ts`).
- **D3** interpolation type: token-đơn → pass-through giữ type; embedded → coerce scalar, object→fail/stringify. Không bracket-index v1. `contains` string=substr / array=membership.
- **D4** snapshot = authored (KHÔNG resolve foreach/condition) · truncate 256KB chỉ `run_step.output`, KHÔNG cắt `context` RAM.
- **Phasing:** observability tối thiểu (list run + needs-attention) đi **cùng B**, không để E.

## Liên quan
[[agent-harness-architecture]] (nền) · [[poc-model-choice]] (8B, seam) · [[v2-app]] · [[agent-ops-rules]] (no-bg-service). Reframe #3 qua 3 vòng review; **pushback của reviewer chứa 1 claim sai (sub-agent fan-out); consultant verify `orchestrator.ts` & sửa**; bounding reframe theo `foreach`×inference. (CTO audit post-sign-off → vá F1–F4: xem comms `cto-to-consultant-workflow-spec-audit`.)
