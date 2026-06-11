# Selection-at-scale — qwen3-vl:8b-instruct-q8_0 — 2026-06-11 (k=10)

Pool distractor = prod union (internal world-tools + connector). Probe giữ cố định, pad distractor tới N.

| probe \\ #tools | 4 | 8 | 12 | 16 |
| --- | --- | --- | --- | --- |
| stuck | 100% | 100% | 100% | 100% |
| web | 100% | 100% | 100% | 100% |
| calc | 100% | 100% | 100% | 100% |
| write | 100% | 100% | 100% | 100% |
| write-gmail | 100% | 100% | 100% | 100% |
| write-gcal | 100% | 100% | 100% | 100% |
| write-github | 100% | 100% | 100% | 100% |
| write-demo | 100% | 100% | 100% | 100% |
| multi-read-write | 100% | 100% | 100% | 90% |
| ctx-audit-write | 100% | 100% | 100% | 100% |
| ctx-web-write | 100% | 90% | 100% | 30% |
| **avg** | 100% | 99% | 100% | 93% |

## CI 95% (Wilson)
- stuck@4: 10/10 [72–100%]
- stuck@8: 10/10 [72–100%]
- stuck@12: 10/10 [72–100%]
- stuck@16: 10/10 [72–100%]
- web@4: 10/10 [72–100%]
- web@8: 10/10 [72–100%]
- web@12: 10/10 [72–100%]
- web@16: 10/10 [72–100%]
- calc@4: 10/10 [72–100%]
- calc@8: 10/10 [72–100%]
- calc@12: 10/10 [72–100%]
- calc@16: 10/10 [72–100%]
- write@4: 10/10 [72–100%]
- write@8: 10/10 [72–100%]
- write@12: 10/10 [72–100%]
- write@16: 10/10 [72–100%]
- write-gmail@4: 10/10 [72–100%]
- write-gmail@8: 10/10 [72–100%]
- write-gmail@12: 10/10 [72–100%]
- write-gmail@16: 10/10 [72–100%]
- write-gcal@4: 10/10 [72–100%]
- write-gcal@8: 10/10 [72–100%]
- write-gcal@12: 10/10 [72–100%]
- write-gcal@16: 10/10 [72–100%]
- write-github@4: 10/10 [72–100%]
- write-github@8: 10/10 [72–100%]
- write-github@12: 10/10 [72–100%]
- write-github@16: 10/10 [72–100%]
- write-demo@4: 10/10 [72–100%]
- write-demo@8: 10/10 [72–100%]
- write-demo@12: 10/10 [72–100%]
- write-demo@16: 10/10 [72–100%]
- multi-read-write@4: 10/10 [72–100%]
- multi-read-write@8: 10/10 [72–100%]
- multi-read-write@12: 10/10 [72–100%]
- multi-read-write@16: 9/10 [60–98%]
- ctx-audit-write@4: 10/10 [72–100%]
- ctx-audit-write@8: 10/10 [72–100%]
- ctx-audit-write@12: 10/10 [72–100%]
- ctx-audit-write@16: 10/10 [72–100%]
- ctx-web-write@4: 10/10 [72–100%]
- ctx-web-write@8: 9/10 [60–98%]
- ctx-web-write@12: 10/10 [72–100%]
- ctx-web-write@16: 3/10 [11–60%]
