# Selection-at-scale — byteplus/gpt-oss-120b T=0.6 — 2026-08-03 (k=8)

Pool distractor = prod union (internal world-tools + connector + 48 tool MCP thật). Probe giữ cố định, pad distractor tới N.

| probe \\ #tools | 60 |
| --- | --- |
| multi-read-write | 100% |
| ctx-audit-write | 100% |
| ctx-web-write | 0% |
| **avg** | 67% |

## CI 95% (Wilson)
- multi-read-write@60: 8/8 [68–100%]
- ctx-audit-write@60: 8/8 [68–100%]
- ctx-web-write@60: 0/8 [0–32%]
