# Selection-at-scale — qwen3-vl:8b-instruct-q8_0 — 2026-06-08 (k=5)

Pool distractor = prod union (internal world-tools + connector). Probe giữ cố định, pad distractor tới N.

| probe \\ #tools | 8 | 16 | 24 | 40 |
| --- | --- | --- | --- | --- |
| stuck | 100% | 100% | 100% | 100% |
| web | 100% | 100% | 100% | 100% |
| calc | 100% | 100% | 100% | 100% |
| write | 100% | 0% | 0% | 0% |
| **avg** | 100% | 75% | 75% | 75% |

**no-call** (số run model KHÔNG gọi tool nào — failure mode E0 chỉ ra):
- write: 8→0/5, 16→5/5, 24→1/5, 40→3/5

## CI 95% (Wilson)
- stuck@8: 5/5 [57–100%]
- stuck@16: 5/5 [57–100%]
- stuck@24: 5/5 [57–100%]
- stuck@40: 5/5 [57–100%]
- web@8: 5/5 [57–100%]
- web@16: 5/5 [57–100%]
- web@24: 5/5 [57–100%]
- web@40: 5/5 [57–100%]
- calc@8: 5/5 [57–100%]
- calc@16: 5/5 [57–100%]
- calc@24: 5/5 [57–100%]
- calc@40: 5/5 [57–100%]
- write@8: 5/5 [57–100%]
- write@16: 0/5 [0–43%]
- write@24: 0/5 [0–43%]
- write@40: 0/5 [0–43%]
