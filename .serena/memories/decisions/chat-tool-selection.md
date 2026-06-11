# Quyết định: Chat tool-selection — crater BỊ BÁC + Quick Wins prompt-polish (2026-06-11)

User báo "agent ngu khi chọn tool/trả lời". CTO review (4-agent workflow + eval đo lại k=3 trên qwen3-vl:8b).

## Chẩn đoán (đo, không đoán)
- Agent **KHÔNG ngu chung**: eval 2026-06-11 — read-sel 97% / args 100% / grounding 92% / restraint 100% / term 100% / chart-map 100%. `.serena/qa/eval-2026-06-11.md`.
- Yếu **đặc thù**: (a) chain multi-step web_search→web_read **2/3**; (b) `trello_create_card` name→idList (user nói "board Sprint", tool đòi ID); (c) bịa "đã tạo" trước confirm (write-intent 33%, đã chặn runtime bằng write-claim-guard); (d) prompt phẳng ~47 tool.

## ⚠️ "Write-selection crater 0%@16+" = ARTIFACT — ĐỪNG điều tra lại
Số "100%@8 → 0%@16+" (backlog harness-write-tool-subsetting cũ) **đã bị CTO BÁC 2026-06-08** (`comms/active/consultant-to-cto-1a-prime-result.md`): probe gmail thiếu recipient, probe trello đưa TÊN "board Sprint" thay idList=ID → model **no-call ĐÚNG (restraint), không phải selection-fail**. Re-run probe args hợp lệ: gmail 100% mọi N, gcal/multi-write 100%, reads 100%@40. → **embedding-subsetting (bge-m3) HỦY/archive**, connector-write-GA GỠ CHẶN. **Không tái-dựng hệ thống retrieval cho vấn đề phần lớn không tồn tại.** Bài học: write-probe PHẢI đủ required-arg + ≥2 tool đa dạng trước khi kết luận "write-class".

## ĐÃ SHIP (eval-driven, giữ cái chứng minh được)
Merge QW `86dc753`; revert một phần `7443918`. 1479 test + tsc sạch. Đo **eval k=6** (sạch hơn k=3):
- ✅ **QW-3 GIỮ** — `orchestrator.ts` runToolRounds nudge web_read sau web_search-có-URL (1 lần/lượt; persist+trace không vỡ). **THẮNG RÕ**: web-research-loop 2/3 → **6/6** (lặp lại 2 lần). Đây là cải tiến THẬT.
- ✅ **QW-2 GIỮ** — 11 connector write tool: trigger-cue "Gọi khi…" + format-arg trong `description` (trello idList≠board, gcal ISO 8601, gmail to/subject/body…). Desc-only, **zero contract change**. Vô hại + giúp arg-fill thật (eval stub không đo nên không tụt).
- ❌ **QW-1 REVERT** (`context.ts` grouping ĐỌC/GHI + `registry.ts` write-first sort): reads giữ 6/6 (vô hại) nhưng **benefit chỉ ở scale 47-tool — CHƯA đo được** (base eval không lộ). Restructuring prompt chưa-chứng-minh → bỏ, về list phẳng baseline (imperative "BẮT BUỘC gọi" mạnh). Signature `{name,kind}[]` giữ (vô hại, eval runner dùng).
- ❌ **QW-5 REVERT** (few-shot `demo_create_task`): **neo model 8B vào sai tool** → write-selection 3/3 → 2/6. Gỡ.

## ⚠️ BÀI HỌC PHƯƠNG PHÁP (lặp lại cái CTO đã cảnh báo 06-08)
`write-intent-trello` là **probe write DUY NHẤT** + cực **noisy** (đo ra 3/3 → 2/6 → 0/6 → dải CTO-ghi 20-100%). **KHÔNG tinh chỉnh prompt dựa trên nó** — đó là cái bẫy "1 probe lái nhiều phiên". Tín hiệu đáng tin = đa-probe + k cao. Cần BACKLOG: dựng ≥3 write-probe args-hợp-lệ, k≥10, trước khi tuning write-selection. Quy trình của tôi sai 1 nhịp: merge QW-1/QW-5 TRƯỚC khi đo model → regress → revert. Prod chưa redeploy nên user không ảnh hưởng.

## HOÃN (user duyệt) — chỉ mở lại nếu eval:scale probe-sạch lộ crater THẬT
- Embedding local bge-m3 subsetting (+1.5GB VRAM, nghịch ethos $0). Spec archived: `docs/superpowers/specs/2026-06-08-tool-subsetting-design.md`.
- Dual-model / đổi model text-tool (Hermes-3/Hammer): qwen3-vl text-grounding ngang flagship + vision bắt buộc (OCR/ảnh) → giữ single model.

## SCALE EVAL ĐỊNH LƯỢNG (k=10, 2026-06-11) — write-selection ĐÁNG TIN, crater CHẾT HẲN
Mở rộng `suite.scale.eval.ts` (commit `5270949`): +2 bare-write probe (github/demo, args hợp lệ) → **5 họ tool** × N=4/8/12/16 × k=10. Evidence: `.serena/qa/eval-scale-2026-06-11.md`.
- **Bare write (trello-idList/gmail/gcal/github/demo): 100% MỌI N tới 16 tool.** Crater "write 0%@16+" confirm là artifact-probe-args, nay bác bằng 5 họ tool độc lập. **8B chọn write hoàn hảo ở prod-scale.**
- **Gap THẬT duy nhất: `ctx-web-write` (web_search→trello) @16 = 30%** (Wilson [11–60%]); @8=90, @12=100. Model search xong **bỏ bước write** — lỗi CHUỖI MULTI-STEP (cùng họ web_search→web_read mà QW-3 vá), KHÔNG phải write-capability. `ctx-audit-write` (query_audit→trello) 100% mọi N → chỉ chuỗi-sau-web_search dễ đứt. `multi-read-write`@16=90% (nhẹ).
- ⇒ **KHÔNG cần embedding/subsetting** (bare-write đã 100%@16). Nếu muốn vá ctx-web-write: mở rộng nudge QW-3 "sau web_search, hoàn tất ý định gốc (kể cả write)" — NHƯNG cần ≥2 probe loại này trước khi tune (đừng lặp lỗi 1-probe).

## TRUNCATION + chain fix (2026-06-11) — bug prod "Dữ liệu bị cắt ngắn"
Ca prod: "top 5 agents tốn tiền nhất → gửi mail" → agent gọi `laam_list_agents` (list ALL done) → tràn → cắt → càng tăng limit càng tệ.
- **Lỗi gốc:** `boundOutput` ([guardrails.ts](src/lib/agent/guardrails.ts)) khi >8192 ký tự trả `json.slice(0,8192)` = **JSON HỎNG** → model không parse được → "Dữ liệu bị cắt ngắn" + đứt chuỗi. Dùng chung MỌI tool (guard) + connector (withSafety→boundOutput).
- **Fix 1 (deterministic, commit `b78f78c`):** `boundOutput` phục-hồi-được — giữ **mẫu hợp lệ** (phần tử đầu của mảng lớn nhất) + tổng số + note bảo model thu hẹp (limit/filter/sort/search). Vá mọi connector.
- **Fix 2 (deterministic):** `laam_list_agents` thêm param `sort` (recent|cost|tokens) — không có đường query "top-N theo cost" trước đó. Eval k=6: top-agents-cost **6/6** (model dùng sort=cost đúng).
- **⚠️ BÀI HỌC LẶP LẠI (lần 2/3):** mọi chữ trong **description tool** = empirical. Câu "đừng list tất cả / top N thì sort=cost" ở **cấp-tool** làm model né list → agent-detail 6/6→0/6→2/6. Fix (commit `fe80615`): để description tool **nguyên gốc**, guidance chỉ nằm trong **mô tả param enum** ("cost (tốn tiền nhất)"). Eval: agent-detail **6/6** + top-agents-cost **6/6**. → Quy tắc: guidance ở **param description**, KHÔNG ở tool description.

## Bug "Lỗi server" khi upload PDF (FIXED `61caae7`)
- Gốc: `ChatClient.onAddFiles` đọc mọi file không-phải-ảnh bằng `file.text()` → PDF (nhị phân) ra rác chứa **NUL** → message có NUL → `db.insert(chatMessages){content}` (route.ts:217, KHÔNG fail-soft) ném vì **Postgres TEXT không lưu NUL** → 500.
- Fix (no dep): server `stripNul(message)` trước persist (defense); client phát hiện PDF/nhị phân → báo rõ thay vì gửi rác. Helper thuần `src/lib/chat/attach.ts` + test. 1499 test.
- **PDF support THẬT — ĐÃ IMPLEMENT (`72706df`, user duyệt dep):** `src/lib/chat/pdf.ts` chuỗi 3 tầng client-side: (1) text-layer (`pdfjs-dist@6` getTextContent) → (2) scan: render trang→JPEG→`/api/ocr` tesseract → (3) OCR fail/rỗng/off → **chốt cuối: đẩy ảnh trang vào kênh vision → qwen3-vl đọc**. Cap 20 trang, scale 2.0, JPEG q0.85 (vừa cap vision 2×2MB). Worker qua `new URL(...,import.meta.url)` (bundler emit /_next/static — KHÔNG dùng public/, đã thử public/ FAIL vì Next dev snapshot public lúc start). Logic 3-tầng (`runPdfTiers`) tách khỏi pdfjs (inject primitive) → unit-test đầy đủ. 1507 test + tsc sạch.
  - ⚠️ **CHƯA verify-live browser** (worker load + canvas render): không drive được từ host (Chrome kết nối là macOS từ xa, dev là Windows-local). **Cần:** restart dev (nạp pdfjs-dist) → smoke-test PDF-text + PDF-scan; `next build` trước prod deploy (rủi ro bundler emit worker).

## Còn lại (backlog)
- `trello_create_card` name→idList resolution (QW-4, cần Trello creds test) — gap UX production thật (KHÁC selection — production user nói tên board).
- **PDF text extraction thật** (pdfjs-dist + OCR-scan-fallback) — cần user duyệt thêm dep.
- (tùy chọn) vá `web_search → write` chain @scale: cần ≥2 probe + đo trước khi tune.
- **Audit "list-vs-query gaps" cho 7 connector** (như github thiếu search-repo, list-agents vừa thêm sort) — user đề xuất test các connector khác.
- Redeploy prod (QW-2+QW-3 + boundOutput + sort) — chờ user.
