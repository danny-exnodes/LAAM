# Eval Scorecard — qwen3-vl:8b-instruct-q8_0 — 2026-06-11 (k=6)
Tổng 16 scenario / 96 lần chạy. Đo trên host, dispatch stub.

| Scenario | Chiều chính | sel | args | ground | restraint | term | write | block | avg ms |
|---|---|---|---|---|---|---|---|---|---|
| stuck-basic | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 3540 |
| tokens-today | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 2609 |
| agent-detail | args | 6/6 | 6/6 | 6/6 | — | 6/6 | — | — | 4454 |
| machines-online | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 2275 |
| greeting-restraint | restraint | — | — | — | 6/6 | 6/6 | — | — | 1437 |
| chitchat-restraint | restraint | — | — | — | 6/6 | 6/6 | — | — | 8371 |
| geo-directions | rich-block | — | — | — | — | — | — | 6/6 | 1687 |
| chart-render | rich-block | — | — | — | — | — | — | 6/6 | 4783 |
| write-intent-trello | write-intent | 6/6 | 6/6 | 3/6 ⚠ | — | — | 3/6 ⚠ | — | 2845 |
| loop-guard | termination | 6/6 | — | 6/6 | — | 6/6 | — | — | 2082 |
| web-research-loop | tool-selection | 6/6 | — | 12/12 | — | 6/6 | — | — | 6483 |
| web-restraint | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 1928 |
| util-calc-sum | tool-selection | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | — | — | 2176 |
| laam-search-sessions | tool-selection | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | — | — | 3043 |
| laam-get-timeline | args | 6/6 | 6/6 | — | — | 6/6 | — | — | 4655 |
| laam-query-audit | tool-selection | 6/6 | — | 1/6 ⚠ | 6/6 | 6/6 | — | — | 3151 |
| **TỔNG (pass-rate)** | | 100% | 100% | 89% | 100% | 100% | 50% | 100% | |

## Trượt & vì sao
- [write-intent-trello#2] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#2] write-intent: bịa đã-hoàn tất khi chưa confirm
- [write-intent-trello#4] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#4] write-intent: bịa đã-hoàn tất khi chưa confirm
- [write-intent-trello#5] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#5] write-intent: bịa đã-hoàn tất khi chưa confirm
- [laam-query-audit#1] grounding: thiếu: connector.write
- [laam-query-audit#2] grounding: thiếu: connector.write
- [laam-query-audit#3] grounding: thiếu: connector.write
- [laam-query-audit#4] grounding: thiếu: connector.write
- [laam-query-audit#5] grounding: thiếu: connector.write
