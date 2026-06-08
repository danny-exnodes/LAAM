# Selection-at-scale — qwen3-vl:8b-instruct-q8_0 — 2026-06-08 (k=5)

Pool distractor = prod union (internal world-tools + connector). Probe giữ cố định, pad distractor tới N.

| probe \\ #tools | 4 | 6 | 8 | 10 | 12 | 16 |
| --- | --- | --- | --- | --- | --- | --- |
| stuck | 100% | 100% | 100% | 100% | 100% | 100% |
| web | 100% | 100% | 100% | 100% | 100% | 100% |
| calc | 100% | 100% | 100% | 100% | 100% | 100% |
| write | 100% | 100% | 100% | 100% | 100% | 100% |
| write-gmail | 100% | 100% | 100% | 100% | 100% | 100% |
| write-gcal | 100% | 100% | 100% | 100% | 100% | 100% |
| multi-read-write | 100% | 100% | 100% | 100% | 100% | 100% |
| ctx-audit-write | 100% | 100% | 100% | 100% | 100% | 100% |
| ctx-web-write | 100% | 100% | 100% | 80% | 100% | 100% |
| **avg** | 100% | 100% | 100% | 98% | 100% | 100% |

## CI 95% (Wilson)
- stuck@4: 5/5 [57–100%]
- stuck@6: 5/5 [57–100%]
- stuck@8: 5/5 [57–100%]
- stuck@10: 5/5 [57–100%]
- stuck@12: 5/5 [57–100%]
- stuck@16: 5/5 [57–100%]
- web@4: 5/5 [57–100%]
- web@6: 5/5 [57–100%]
- web@8: 5/5 [57–100%]
- web@10: 5/5 [57–100%]
- web@12: 5/5 [57–100%]
- web@16: 5/5 [57–100%]
- calc@4: 5/5 [57–100%]
- calc@6: 5/5 [57–100%]
- calc@8: 5/5 [57–100%]
- calc@10: 5/5 [57–100%]
- calc@12: 5/5 [57–100%]
- calc@16: 5/5 [57–100%]
- write@4: 5/5 [57–100%]
- write@6: 5/5 [57–100%]
- write@8: 5/5 [57–100%]
- write@10: 5/5 [57–100%]
- write@12: 5/5 [57–100%]
- write@16: 5/5 [57–100%]
- write-gmail@4: 5/5 [57–100%]
- write-gmail@6: 5/5 [57–100%]
- write-gmail@8: 5/5 [57–100%]
- write-gmail@10: 5/5 [57–100%]
- write-gmail@12: 5/5 [57–100%]
- write-gmail@16: 5/5 [57–100%]
- write-gcal@4: 5/5 [57–100%]
- write-gcal@6: 5/5 [57–100%]
- write-gcal@8: 5/5 [57–100%]
- write-gcal@10: 5/5 [57–100%]
- write-gcal@12: 5/5 [57–100%]
- write-gcal@16: 5/5 [57–100%]
- multi-read-write@4: 5/5 [57–100%]
- multi-read-write@6: 5/5 [57–100%]
- multi-read-write@8: 5/5 [57–100%]
- multi-read-write@10: 5/5 [57–100%]
- multi-read-write@12: 5/5 [57–100%]
- multi-read-write@16: 5/5 [57–100%]
- ctx-audit-write@4: 5/5 [57–100%]
- ctx-audit-write@6: 5/5 [57–100%]
- ctx-audit-write@8: 5/5 [57–100%]
- ctx-audit-write@10: 5/5 [57–100%]
- ctx-audit-write@12: 5/5 [57–100%]
- ctx-audit-write@16: 5/5 [57–100%]
- ctx-web-write@4: 5/5 [57–100%]
- ctx-web-write@6: 5/5 [57–100%]
- ctx-web-write@8: 5/5 [57–100%]
- ctx-web-write@10: 4/5 [38–96%]
- ctx-web-write@12: 5/5 [57–100%]
- ctx-web-write@16: 5/5 [57–100%]
