# Eval Scorecard — qwen3-vl:8b-instruct-q8_0 — 2026-06-11 (k=3)
Tổng 16 scenario / 48 lần chạy. Đo trên host, dispatch stub.

| Scenario | Chiều chính | sel | args | ground | restraint | term | write | block | avg ms |
|---|---|---|---|---|---|---|---|---|---|
| stuck-basic | tool-selection | 3/3 | — | 3/3 | 3/3 | 3/3 | — | — | 4450 |
| tokens-today | tool-selection | 3/3 | — | 3/3 | 3/3 | 3/3 | — | — | 1768 |
| agent-detail | args | 2/3 ⚠ | 2/3 ⚠ | 3/3 | — | 3/3 | — | — | 3905 |
| machines-online | tool-selection | 3/3 | — | 3/3 | 3/3 | 3/3 | — | — | 1577 |
| greeting-restraint | restraint | — | — | — | 3/3 | 3/3 | — | — | 1015 |
| chitchat-restraint | restraint | — | — | — | 3/3 | 3/3 | — | — | 4870 |
| geo-directions | rich-block | — | — | — | — | — | — | 3/3 | 1258 |
| chart-render | rich-block | — | — | — | — | — | — | 3/3 | 2873 |
| write-intent-trello | write-intent | 0/3 ✗ | 0/3 ✗ | 1/3 ⚠ | — | — | 0/3 ✗ | — | 2128 |
| loop-guard | termination | 3/3 | — | 3/3 | — | 3/3 | — | — | 1439 |
| web-research-loop | tool-selection | 3/3 | — | 6/6 | — | 3/3 | — | — | 3652 |
| web-restraint | tool-selection | 3/3 | — | 3/3 | 3/3 | 3/3 | — | — | 1420 |
| util-calc-sum | tool-selection | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | — | — | 1607 |
| laam-search-sessions | tool-selection | 3/3 | 3/3 | 3/3 | 3/3 | 3/3 | — | — | 2119 |
| laam-get-timeline | args | 3/3 | 3/3 | — | — | 3/3 | — | — | 3130 |
| laam-query-audit | tool-selection | 3/3 | — | 0/3 ✗ | 3/3 | 3/3 | — | — | 2357 |
| **TỔNG (pass-rate)** | | 89% | 73% | 86% | 100% | 100% | 0% | 100% | |

## Trượt & vì sao
- [agent-detail#1] tool-selection: thiếu gọi: laam_list_agents, laam_get_agent (đã gọi: —)
- [agent-detail#1] args: laam_get_agent: chưa gọi
- [write-intent-trello#1] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#1] args: trello_create_card: chưa gọi
- [write-intent-trello#1] write-intent: chưa gọi trello_create_card
- [write-intent-trello#2] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#2] args: trello_create_card: chưa gọi
- [write-intent-trello#2] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#2] write-intent: chưa gọi trello_create_card
- [write-intent-trello#3] tool-selection: thiếu gọi: trello_create_card (đã gọi: —)
- [write-intent-trello#3] args: trello_create_card: chưa gọi
- [write-intent-trello#3] grounding: bịa/không nên có: đã tạo
- [write-intent-trello#3] write-intent: chưa gọi trello_create_card
- [laam-query-audit#1] grounding: thiếu: connector.write
- [laam-query-audit#2] grounding: thiếu: connector.write
- [laam-query-audit#3] grounding: thiếu: connector.write
