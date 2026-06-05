# Decision: Chat context window (num_ctx) + summarize headroom

**Ngày:** 2026-06-05 · **Trạng thái:** ✅ FIXED (`4f83fb6`). Bug do user báo ([:8443/chat] trả lời "đứt đoạn / cắt giữa chừng").

## Triệu chứng & chẩn đoán (từ export `chat.json`)
- Hội thoại dài → câu trả lời bị cắt giữa chừng; **tải lại trang thấy đủ** (DB lưu đủ).
- **Smoking gun:** mọi reply bị cắt có `tokensIn + tokensOut === 4096` CHÍNH XÁC.
- ⇒ **Tràn context window:** model phục vụ ở `num_ctx=4096`; prompt (history + tool results) lấp đầy → không còn chỗ SINH → cắt. KHÔNG phải lỗi frame/streaming (SP-4 là red herring — đã loại bằng cách đọc chat.json).

## Gốc rễ (2 lớp)
1. **Ollama mặc định `num_ctx=4096`** BẤT KỂ model hỗ trợ tới ~128k–256k (đây là lý do "tài liệu bảo ctx 250k" nhưng thực tế bị cắt ở 4096 — 250k là max của ARCHITECTURE, không phải default của RUNTIME). Route TRƯỚC ĐÂY không set `num_ctx` ⇒ luôn 4096.
2. **SP-3 summarize chưa chừa chỗ output:** budget cũ 16000 char (~4k token) ≈ cả cửa sổ; lại giữ `keepLast=6` lượt NGUYÊN VĂN (lượt tool như "liệt kê 10 agent" rất to) ⇒ prompt vẫn lấp đầy.

## Fix
- **`num_ctx` mọi lời gọi Ollama** (tool-loop, final stream, summarize, resume) qua env **`CHAT_NUM_CTX`** (default **16384** — vừa GPU 16GB cho 8B-q8; KV-cache tuyến tính theo ctx nên KHÔNG đặt 250k). Set ở `route.ts` (`NUM_CTX`), bơm vào `buildOllamaPayload.options.num_ctx` + `callModelText` + `buildResumeRequest`.
- **`planHistory` bound replay theo KÍCH THƯỚC** (char budget dẫn xuất từ num_ctx, reserve 3072 tok output + 2560 tok system/tools), KHÔNG còn "giữ N lượt cuối cố định" ⇒ 1 lượt tool khổng lồ không chiếm trọn cửa sổ. `MIN_KEEP=2` là sàn.
- Test: `summarize.test` (lượt gần-nhì khổng lồ → gập, replay ≤ budget) · `route.test` (options.num_ctx).

## Verify
- `tsc` sạch + 492 test main pass. **Runtime:** dev server :3100 (→:8443) HMR bản mới; user gửi lại trong hội thoại dài → trả lời đủ. Muốn override: thêm `CHAT_NUM_CTX` vào `.env` + restart dev (env cần restart; default 16384 đã chạy qua HMR).

## Follow-up (chưa làm)
- Tinh chỉnh char/token ratio (3.5) nếu tiếng Việt lệch; cap kích thước SUMMARY do model sinh; cân nhắc `num_predict` reserve.

## Liên quan
[[agent-harness-sp3-memory-proactive]] (summarize) · [[poc-model-choice]] · [[poc-host-and-ollama-ops]].
