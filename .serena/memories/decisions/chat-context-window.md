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

## Sampler (góp ý team Qwen3-Q8 — commit `b3db3a7`)
- **`presence_penalty`** wired server-side ở `buildOllamaPayload` (default **0.2**, env `CHAT_PRESENCE_PENALTY`, `body.presencePenalty` override) — áp NGAY cho mọi câu chat (FE chưa cần gửi). Giảm lặp từ + ổn định JSON/code.
- **`temperature` default 0.6** (DEFAULT_SETTINGS, trong dải team 0.4–0.7).
- Follow-up: UI slider presence_penalty (defer — session FE/chat-ux active).

## Ollama setup = NATIVE trên host (KHÔNG phải Docker)
- **Đã xác minh:** API `:11434` do `ollama.exe` native (`C:\Users\ADMIN\AppData\Local\Programs\Ollama`). `docker-compose.yml` CHỈ chạy Postgres+Adminer+app; comment ghi rõ "Ollama stays native on the host (GPU)". App container tới Ollama qua `host.docker.internal:11434` (line 54). KHÔNG có ollama container.
- **Bật ctx lớn = bật KV-cache quant trên Ollama:** `setx OLLAMA_FLASH_ATTENTION 1` + `setx OLLAMA_KV_CACHE_TYPE q8_0` → **restart Ollama** (quit tray + relaunch; setx chỉ áp process mới). q8 KV halves KV (~144KB→72KB/token FP16→q8).

## Verify (đã chạy thật)
- `tsc` sạch + **499 test main pass**.
- **Runtime VRAM (đã đo, RTX 5070 Ti 16GB):** load `qwen3-vl:8b-instruct-q8_0` @ **num_ctx=49152 + q8 KV** = **11.74 GB, 100% on GPU** (không spill CPU) — q8 KV xác nhận hoạt động (FP16 sẽ ~15GB → tràn). Sinh chữ bình thường.
  - ⚠️ **Headroom mỏng:** tổng VRAM 15.7/16.3 GB (~0.6GB free) vì ~3.6GB do app khác giữ (LM Studio + browser + desktop). **Text chat OK** (KV pre-alloc, không phình). **Multimodal/ảnh RỦI RO OOM** (vision cần VRAM tạm). ⇒ khuyến nghị: đóng LM Studio khi dùng ảnh, HOẶC `CHAT_NUM_CTX=32768` (q8 ~2.3GB KV, ~2.4GB free, vẫn 8× gốc).
- **Env hiện tại:** `.env` có `CHAT_NUM_CTX=49152` + `DEFAULT_CHAT_MODEL=qwen3-vl:8b-instruct-q8_0`; Ollama có q8 KV.

## Giới hạn phần cứng (16GB) — 250k BẤT KHẢ THI
- KV ~144KB/token (FP16): 256k → ~37.7GB KV + 9.16GB weights ≈ 47GB. q8: ~19GB. q4: ~9.4GB (+weights=18.6 > 16). ⇒ max thực tế: ~32k (FP16) · ~64–76k (q8) · ~128–150k (q4, giảm chất). 250k cần GPU ≥24–32GB.

## Follow-up (chưa làm)
- Tinh chỉnh char/token ratio (3.5) nếu tiếng Việt lệch; cap kích thước SUMMARY do model sinh; cân nhắc `num_predict` reserve; UI slider presence_penalty.

## Liên quan
[[agent-harness-sp3-memory-proactive]] (summarize) · [[poc-model-choice]] · [[poc-host-and-ollama-ops]].
