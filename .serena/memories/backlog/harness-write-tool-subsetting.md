# Harness — write-tool subsetting before connector-write GA (DECISION GATE)

Flagged by QA E2E 2026-06-08 (eval P2). For harness / connector roadmap owners.
Source: `.serena/qa/eval-2026-06-08.md` + `eval-scale-2026-06-08.md` (gitSha 75bea85, qwen3-vl:8b-instruct-q8_0, k=5).

## The signal (quantified)
Selection-at-scale curve (probe selection pass-rate vs # tools exposed):

| probe \ #tools | 8 | 16 | 24 | 40 |
|---|---|---|---|---|
| stuck | 100% | 100% | 100% | 100% |
| web   | 100% | 100% | 100% | 100% |
| calc  | 100% | 100% | 100% | 100% |
| **write** | **100%** | **0%** | **0%** | **0%** |

- **write craters 100%@8 → 0%@16+** (Wilson 95% CI [0–43%] at 16/24/40). `no-call` (model calls NO tool):
  write 8→0/5, **16→5/5** (total no-call), 24→1/5, 40→3/5.
- Read/util/web selection is flat at 100% across scale — the crater is **write-specific**, not general.
- Base scorecard write-intent **2/5 (40%)**: failures are "bịa đã-hoàn-tất khi chưa confirm" (model
  confabulates "đã tạo" pre-confirm). Other dims 95–100%.

## Why it matters
Prod exposes the full union (internal world-tools + 11 connector write tools + reads) ≫ 16. At that scale
the local 8B essentially **never** correctly selects a write tool. Runtime `write-claim-guard` + Confirm
Card neutralize the *confabulation* (QA verified live, both paths) — but they do NOT fix *selection*.

## Action (gate)
- **Subset tools to ≤ ~8 relevant** for any turn that may write (retrieval/router that narrows the exposed
  schema set before dispatch), OR keep write tools out of the default union and surface them only on explicit
  intent. Re-measure the curve after subsetting.
- Secondary (base eval): `web-research-loop` misses the `web_read` follow-up after `web_search` (3/5) —
  tool-selection gap worth a prompt/loop nudge.
- Do **not** ship connector-write GA on the full-union exposure until the curve recovers.
