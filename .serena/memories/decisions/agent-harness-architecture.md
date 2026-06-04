# Decision: Agent Harness — kiến trúc 6 lớp + build order

**Ngày:** 2026-06-04 · **Vai trò:** technical consultant · **Trạng thái:** roadmap đã viết, chờ user review chi tiết.

**Tài liệu đầy đủ:** `docs/superpowers/specs/2026-06-04-agent-harness-architecture.md`
(hiện trạng + 6 khoảng trống, hợp đồng từng lớp, success criteria từng SP, coordination, open questions). Đọc file đó để biết chi tiết — memo này chỉ là pointer + chốt quyết định.

## Vấn đề
Harness hiện tại = `/api/chat` + `lib/connectors` (tool-loop `runToolRounds`, native Ollama tool-calling, fail-soft, **chỉ tool connector ngoài**). Khoảng trống lớn nhất: **AI mù với chính dữ liệu LAAM** (không tool nào trỏ `agent_sessions`/`stats`/`machines`).

## Kiến trúc 6 lớp (dưới→trên)
L0 Orchestrator (tổng quát hoá runToolRounds) · L1 Context assembly (system prompt động) · L2 Tool dispatch (union schema + 1 hàm route) · L3 Internal tools (read-only) · L4 Guardrails (validate/ground/gate) · L5 Memory · L6 UX feedback.

## Build order
- **SP-1 Foundation** (L0+L1+L2+L3 read + L4 min) — lát cắt dọc, read-only, không đụng connectors/schema. Lấp nghịch lý lớn nhất + lập hợp đồng các lớp.
- **SP-2** Actions & safety (read/write + gate write).
- **SP-3** Memory & proactive (persist tool turns + summarize + chủ động báo stuck/cost-spike). ⚠️ đụng schema → migration.
- **SP-4** UX feedback (stream tool events → UI). ⚠️ đụng `components/chat/*` → phối hợp session FE.

## Decision log (chốt)
- **D1:** L2 = **hybrid dispatch hợp nhất, connectors GIỮ NGUYÊN.** Internal tools = module mới `src/lib/agent/tools/*` theo `Tool{name,description,parameters,kind:'read'|'write',handler(args,ctx)}`; model thấy union schema; 1 hàm `dispatch(ctx,name,args)` route internal-vs-connector; guardrail (L4) bọc đúng chokepoint này. *Lý do:* rủi ro thấp nhất cho 375 test + connector đang chạy; internal vs external khác bản chất (cred); 1 chokepoint guardrail; đảo/gộp được sau.
- **D2:** Orchestrator vào `src/lib/agent/*` thuần, `/api/chat` thành adapter mỏng; giữ bounded + tool-round non-streaming + stream câu cuối + fail-soft.
- **D3:** Model giữ nguyên `qwen3-vl:8b-instruct-q8_0` + native tool-calling, **không** smart-routing (đúng [[poc-model-choice]]).
- **D4:** Rule 13 (ground ID/tên từ DB) là guardrail hạng nhất ở L4.
- **D5:** SP-1 **không đụng schema** (persist tool turns để SP-3).
- **D6:** Internal tools **read-only trước**, write + gate ở SP-2.

## Liên quan
[[poc-model-choice]] · [[v2-architecture]] · [[v2-app]] · [[agent-ops-rules]]. Coordination: xem [[backlog/agent-harness-coordination]].
