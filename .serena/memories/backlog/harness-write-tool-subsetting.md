# Harness — write-tool subsetting (RESOLVED / SUPERSEDED 2026-06-11)

> ⚠️ **ĐÃ ĐÓNG.** Con số "write 100%@8 → 0%@16+" dưới đây là **ARTIFACT eval-probe thiếu required-arg**, đã bị CTO BÁC 2026-06-08 (`comms/active/consultant-to-cto-1a-prime-result.md`) và re-confirm 2026-06-11. KHÔNG dựng embedding-subsetting cho nó. Quyết định + giải pháp đã ship: [[chat-tool-selection]].
>
> **Tóm tắt:** probe gmail thiếu recipient, probe trello đưa TÊN "board Sprint" thay idList=ID → model no-call ĐÚNG (restraint). Probe args hợp lệ → gmail/gcal/multi-write 100% mọi N, reads 100%@40. Crater THẬT còn lại = `trello_create_card` name→idList (gap UX connector, không phải write-class). Embedding slice (bge-m3) HỦY/archive; connector-write-GA GỠ CHẶN.
>
> **Đã làm thay (merge `86dc753`):** QW-1 prompt nhóm read/write + write-first sort · QW-2 trigger-cue 11 write tool · QW-3 web_read nudge · QW-5 few-shot demo. Bài học eval-methodology: write-probe phải đủ required-arg + ≥2 tool đa dạng.
>
> **Còn mở:** `trello_create_card` name→idList resolution; đo eval:scale probe-sạch (host).

---
## (LƯU SỬ — số liệu run đầu, đã chứng minh là artifact)
Selection-at-scale (run đầu 06-08, k=5): write 100%@8 / 0%@16 / 0%@24 / 0%@40 — **probe-args artifact**, KHÔNG phản ánh năng lực model. Read/util/web 100% mọi N.
