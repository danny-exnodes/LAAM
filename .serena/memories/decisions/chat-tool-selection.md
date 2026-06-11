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

## Còn lại (backlog)
- `trello_create_card` name→idList resolution (QW-4, cần Trello creds test) — gap UX production thật.
- Đo `eval:scale` với probe-args HỢP LỆ trước/sau để khoá (host run).
