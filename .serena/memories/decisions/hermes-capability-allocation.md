# Decision: Hermes Agent capability allocation to LAAM

**Ngày:** 2026-06-23 · **Vai trò:** platform capability allocator · **Trạng thái:** phân bổ (chờ user review). Khớp với envelope 8B/local-$0 + "OS is the only boundary".

## Bối cảnh
LAAM đã có: tool-loop run-until-done (`runToolRounds`), write-gate (SP-2 confirm-card), multi-provider (Ollama/Claude-MVS/BytePlus), **MCP client của DAAB** (`connectors-mcp-client`), `chat_conversation.summary` rolling per-conv, `laam_search_sessions` + `/api/search` (ILIKE, pg_trgm upgrade path documented), flat sub-agent list parse từ transcript, notification in-app + per-user SSE, collector đa máy.
LAAM **đã từ chối** autonomous skill-creation (L3) cho 8B/safety (`backlog/agent-self-improvement-loop.md`).

## Phân bổ 8 capability Hermes
1. **Cross-session memory (MEMORY.md/USER.md)** → ADOPT-NATIVE *lite* + CONSUME từ DAAB. P1. Bảng `agent_memory` per-user (key/value/scope jsonb, atomic upsert) bơm vào `buildSystemPrompt` (L1). World-model dài hạn = đẩy về DAAB KG qua MCP `kg_store_*` (Phase 4 của DAAB sở hữu). Tránh "self-nudge mỗi 10 turn" — dùng write-gate + dedup cứng.
2. **Session search (FTS5 trigram)** → ADOPT-NATIVE, P1. Đã có hạ tầng; nâng `/api/search` + `laam_search_sessions` từ ILIKE-title → **tsvector + pg_trgm GIN** trên `chat_message.content` (hiện chỉ match title). Postgres GIN trigram = tương đương FTS5-trigram cho CJK/vi. KHÔNG cần engine mới.
3. **Self-improvement / skill creation** → SKIP (đã chốt). L3 vi phạm Rule 5 + 8B bịa "đã tạo". Giữ L1-assisted (eval gợi ý, người duyệt) nếu có.
4. **Isolated parallel subagents** → DEFER, P2/later. GPU 16GB: mỗi child = KV-cache riêng → 2-3 child 8B đồng thời tràn VRAM (headroom ~0.6GB). Chỉ khả thi nếu fan-out sang provider cloud (BytePlus) HOẶC tác vụ tuần tự. Workflow `foreach` đã cho song song-mức-node. Monitoring view sub-agent flat-list đã có (`subagent-parent-link`).
5. **Provider-agnostic** → SKIP (đã có, convergent). 3 provider runtime-switchable.
6. **Multi-surface gateway (Telegram/Slack/…)** → DEFER → consume connector OAuth sẵn có, P2. LAAM là web+SSE; "1 agent 1 memory đa surface" map vào notification + connector. Bot inbound (Telegram/WhatsApp webhook→/api/chat) là tăng-trị thật nhưng cần memory (#1) trước.
7. **ACP adapter (IDE)** → SKIP. LAAM là monitoring/ops, không phải coding-agent; IDE đã có Claude Code. Trùng mục đích.
8. **Security model (OS-sandbox, không in-process cred)** → ADOPT-NATIVE (đã sống). LAAM connector live-cred + write-gate + SSRF + fail-closed MCP = đã theo nguyên tắc này. Củng cố lý do SKIP #3.

## Rào bất biến
- Không capability nào được nới write-gate hay chạy code tuỳ ý ở full privilege (Rule 5 + #8).
- Memory world-model lớn = DAAB lane (Phase 4), LAAM chỉ giữ memory "lite" cục bộ + ground-truth từ code (Rule 13).

## Liên quan
[[connectors-mcp-client]] · [[world-tools-layer]] · [[chat-context-window]] · [[agent-harness-sp3-memory-proactive]] · [[poc-host-and-ollama-ops]] · backlog [[agent-self-improvement-loop]].
