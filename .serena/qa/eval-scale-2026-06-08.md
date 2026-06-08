# Selection-at-scale — qwen3-vl:8b-instruct-q8_0 — 2026-06-08 (k=5)

Pool distractor = prod union (internal world-tools + connector). Probe giữ cố định, pad distractor tới N.

| probe \\ #tools | 8 | 10 | 12 | 14 | 16 |
| --- | --- | --- | --- | --- | --- |
| stuck | 100% | 100% | 100% | 100% | 100% |
| web | 100% | 100% | 100% | 100% | 100% |
| calc | 100% | 100% | 100% | 100% | 100% |
| write | 80% | 40% | 20% | 0% | 0% |
| write-gmail | 0% | 0% | 0% | 0% | 0% |
| multi-read-write | 100% | 100% | 100% | 100% | 100% |
| **avg** | 80% | 73% | 70% | 67% | 67% |

**no-call** (số run model KHÔNG gọi tool nào — failure mode E0 chỉ ra):
- write: 8→1/5, 10→3/5, 12→4/5, 14→5/5, 16→5/5
- write-gmail: 8→5/5, 10→5/5, 12→5/5, 14→5/5, 16→5/5

## CI 95% (Wilson)
- stuck@8: 5/5 [57–100%]
- stuck@10: 5/5 [57–100%]
- stuck@12: 5/5 [57–100%]
- stuck@14: 5/5 [57–100%]
- stuck@16: 5/5 [57–100%]
- web@8: 5/5 [57–100%]
- web@10: 5/5 [57–100%]
- web@12: 5/5 [57–100%]
- web@14: 5/5 [57–100%]
- web@16: 5/5 [57–100%]
- calc@8: 5/5 [57–100%]
- calc@10: 5/5 [57–100%]
- calc@12: 5/5 [57–100%]
- calc@14: 5/5 [57–100%]
- calc@16: 5/5 [57–100%]
- write@8: 4/5 [38–96%]
- write@10: 2/5 [12–77%]
- write@12: 1/5 [4–62%]
- write@14: 0/5 [0–43%]
- write@16: 0/5 [0–43%]
- write-gmail@8: 0/5 [0–43%]
- write-gmail@10: 0/5 [0–43%]
- write-gmail@12: 0/5 [0–43%]
- write-gmail@14: 0/5 [0–43%]
- write-gmail@16: 0/5 [0–43%]
- multi-read-write@8: 5/5 [57–100%]
- multi-read-write@10: 5/5 [57–100%]
- multi-read-write@12: 5/5 [57–100%]
- multi-read-write@14: 5/5 [57–100%]
- multi-read-write@16: 5/5 [57–100%]
