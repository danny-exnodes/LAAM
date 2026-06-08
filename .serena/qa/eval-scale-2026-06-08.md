# Selection-at-scale — qwen3-vl:8b-instruct-q8_0 — 2026-06-08 (k=5)

Pool distractor = prod union (internal world-tools + connector). Probe giữ cố định, pad distractor tới N.

| probe \\ #tools | 4 | 6 | 8 | 10 | 12 | 16 |
| --- | --- | --- | --- | --- | --- | --- |
| stuck | 100% | 100% | 100% | 100% | 100% | 100% |
| web | 100% | 100% | 100% | 100% | 100% | 100% |
| calc | 100% | 100% | 100% | 100% | 100% | 100% |
| write | 60% | 100% | 100% | 60% | 40% | 20% |
| write-gmail | 100% | 100% | 100% | 100% | 100% | 100% |
| multi-read-write | 100% | 100% | 100% | 100% | 100% | 100% |
| ctx-audit-write | 100% | 100% | 100% | 100% | 100% | 100% |
| ctx-web-write | 100% | 100% | 100% | 100% | 80% | 40% |
| **avg** | 95% | 100% | 100% | 95% | 90% | 83% |

**no-call** (số run model KHÔNG gọi tool nào — failure mode E0 chỉ ra):
- write: 4→2/5, 6→0/5, 8→0/5, 10→2/5, 12→3/5, 16→4/5

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
- write@4: 3/5 [23–88%]
- write@6: 5/5 [57–100%]
- write@8: 5/5 [57–100%]
- write@10: 3/5 [23–88%]
- write@12: 2/5 [12–77%]
- write@16: 1/5 [4–62%]
- write-gmail@4: 5/5 [57–100%]
- write-gmail@6: 5/5 [57–100%]
- write-gmail@8: 5/5 [57–100%]
- write-gmail@10: 5/5 [57–100%]
- write-gmail@12: 5/5 [57–100%]
- write-gmail@16: 5/5 [57–100%]
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
- ctx-web-write@10: 5/5 [57–100%]
- ctx-web-write@12: 4/5 [38–96%]
- ctx-web-write@16: 2/5 [12–77%]
