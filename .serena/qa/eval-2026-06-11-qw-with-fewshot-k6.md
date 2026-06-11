# Eval Scorecard — qwen3-vl:8b-instruct-q8_0 — 2026-06-11 (k=6)
Tổng 16 scenario / 96 lần chạy. Đo trên host, dispatch stub.

| Scenario | Chiều chính | sel | args | ground | restraint | term | write | block | avg ms |
|---|---|---|---|---|---|---|---|---|---|
| stuck-basic | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 2284 |
| tokens-today | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 1891 |
| agent-detail | args | 6/6 | 6/6 | 6/6 | — | 6/6 | — | — | 3031 |
| machines-online | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 1574 |
| greeting-restraint | restraint | — | — | — | 6/6 | 6/6 | — | — | 980 |
| chitchat-restraint | restraint | — | — | — | 6/6 | 6/6 | — | — | 4831 |
| geo-directions | rich-block | — | — | — | — | — | — | 6/6 | 1238 |
| chart-render | rich-block | — | — | — | — | — | — | 6/6 | 2950 |
| write-intent-trello | write-intent | 2/6 ⚠ | 2/6 ⚠ | 3/6 ⚠ | — | — | 1/6 ⚠ | — | 2332 |
| loop-guard | termination | 6/6 | — | 6/6 | — | 6/6 | — | — | 1416 |
| web-research-loop | tool-selection | 6/6 | — | 12/12 | — | 6/6 | — | — | 4420 |
| web-restraint | tool-selection | 6/6 | — | 6/6 | 6/6 | 6/6 | — | — | 1361 |
| util-calc-sum | tool-selection | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | — | — | 1588 |
| laam-search-sessions | tool-selection | 6/6 | 6/6 | 6/6 | 6/6 | 6/6 | — | — | 2121 |
| laam-get-timeline | args | 6/6 | 6/6 | — | — | 6/6 | — | — | 3102 |
| laam-query-audit | tool-selection | 6/6 | — | 1/6 ⚠ | 6/6 | 6/6 | — | — | 2299 |
| **TỔNG (pass-rate)** | | 94% | 87% | 89% | 100% | 100% | 17% | 100% | |

## Trượt & vì sao
- [write-intent-trello#2] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#2] write-intent: bịa đã-hoàn tất khi chưa confirm
- [write-intent-trello#3] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#3] args: trello_create_card: chưa gọi
- [write-intent-trello#3] write-intent: chưa gọi trello_create_card
- [write-intent-trello#4] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#4] args: trello_create_card: chưa gọi
- [write-intent-trello#4] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#4] write-intent: chưa gọi trello_create_card
- [write-intent-trello#5] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#5] args: trello_create_card: chưa gọi
- [write-intent-trello#5] write-intent: chưa gọi trello_create_card
- [write-intent-trello#6] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#6] args: trello_create_card: chưa gọi
- [write-intent-trello#6] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#6] write-intent: chưa gọi trello_create_card
- [laam-query-audit#1] grounding: thiếu: connector.write
- [laam-query-audit#2] grounding: thiếu: connector.write
- [laam-query-audit#4] grounding: thiếu: connector.write
- [laam-query-audit#5] grounding: thiếu: connector.write
- [laam-query-audit#6] grounding: thiếu: connector.write
