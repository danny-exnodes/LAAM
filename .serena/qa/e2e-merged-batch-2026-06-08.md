# QA E2E — merged batch (2026-06-08)

**Request:** CTO `comms/active/cto-to-qa-e2e-merged-2026-06-08`.
**Batch:** `origin/main` HEAD `00aba41` (tested on `75bea85`). PRs #1–#7.
**Method:** verify-not-prose — DB introspection (psql @ laam-v2-postgres), live DOM audits
(`getComputedStyle` + in-page WCAG), real logged-in Chrome (:8443), eval host run.
**Host:** dev `:3100` + Docker `:3900` both up; Postgres mig **0009**; Ollama `qwen3-vl:8b-instruct-q8_0`; SearXNG `:8888`.
**User decisions:** P0a behavioral crash-resume **SKIP**; eval **RUN** (base+scale); UI via logged-in Chrome.

## Verdict by area
| # | Area | Verdict | Key evidence |
|---|---|---|---|
| 1 | **P0a durable resume** 🔴 | ✅ schema/precondition/WAL · behavior deferred | UNIQUE(runId,nodeId,iterIndex); **0 running** runs; real `claimed` WAL marker on connector node of a `failed` run (claim-before-send works) |
| 2 | **Access spine (PR#6)** 🔴 | ✅ schema · ⚠️ **unexercised** | access_token UNIQUE(tokenHash)+prefix/last4/userId+scopes; agent_session.userId; mig 0009. **0 tokens / 0 legacy machine.tokenHash / 0 userId sessions** |
| 3 | **Write-guard (PR#3)** 🟠 | ✅ **PASS (both paths)** | Confirm→exec→narration **"ID: T-103"** (real result) + audit_log 4→5; Cancel→**"Đã huỷ hành động"** (no false claim) + audit unchanged |
| 4 | **Matte Dark (PR#5)** 🟠 | ⚠️ **3 findings** | render dark+light OK, accent #36a6d6, connector-node cyan; A1 contrast 2.77:1, A2 backdrop-blur, A3 recharts dark (→ `backlog/matte-dark-qa-ui-bugs`) |
| 5 | **Regression** 🟠 | ✅ **PASS** | editor F1 (handles+edge n1→connector) / U3 / F3 / F2 / save; 7 connectors connected; OCR proactive (F3) |
| P2 | **Eval** | ✅ ran · 🔴 **write crater** | base 16 scn/80 runs; scale curve; see below |

## P0 #3 Write-confab guard (Rule 13) — both scenarios
- **(a) Confirm:** `demo_create_task` gated by Confirm Card → "Xác nhận" → card "Đã thực hiện",
  narration **"Công việc 'QA-confirm-ok' đã được tạo … ID: T-103."** — the **T-103 is the demo
  connector's real return**, not fabricated. `audit_log` +1.
- **(b) Cancel:** Confirm Card → "Huỷ" → card "Đã huỷ", narration **"Đã huỷ hành động."** — model does
  **NOT** claim success. `audit_log` NOT incremented (cancel truly did not execute).
- Tool-trace chip ("Đã dùng 1 công cụ") + token total (S7) render. Used Demo connector only (offline) —
  real-credential write tools (gmail_send/trello/jira) deliberately NOT triggered.

## P2 Eval scorecard (qwen3-vl:8b-instruct-q8_0, k=5, 16 scn / 80 runs, gitSha 75bea85)
Measure-only (vitest "16 passed" = ran k, NOT thresholds). Pass-rates:

| dim | rate |
|---|---|
| args | 25/25 (100%) |
| restraint | 45/45 (100%) |
| termination | 65/65 (100%) |
| rich-block | 10/10 (100%) |
| grounding | 57/60 (95%) |
| tool-selection | 57/60 (95%) |
| **write-intent** | **2/5 (40%)** ← crater |
**Total 261/270 = 97%** (▲5% vs 06-06). Aggregate **hides** the scale crater (below).

**Selection-at-scale (decision gate):**
| probe \ #tools | 8 | 16 | 24 | 40 |
|---|---|---|---|---|
| stuck/web/calc | 100% | 100% | 100% | 100% |
| **write** | **100%** | **0%** | **0%** | **0%** |

- write craters 100%@8 → **0%@16+** (Wilson [0–43%]); total no-call (5/5) @16.
- Base write fails = "bịa đã-hoàn-tất khi chưa confirm" (model confab pre-confirm) ×3; runtime guard
  mitigates (verified live). web-research-loop misses `web_read` after `web_search` ×3.
- ⇒ **Gate:** subset tools (≤~8) before connector-write GA → `backlog/harness-write-tool-subsetting`.

## Findings (bugs) → backlog/matte-dark-qa-ui-bugs
- **A1 🟠** light accent contrast **2.77:1** (white-on-#36a6d6) — fail AA + 3:1 floor; all CTAs/links, light.
- **A2 🟠** `backdrop-blur(12px)` leftover: global header + mobile-nav (every page; "no-glass" violated).
- **A3 🟠** /eval recharts series `#111827` invisible on dark; Y-axis "100%"→"00%".
- **A4 🟢** doc-drift: WCAG secondary claims imprecise (11.4→8.04, 6.7→8.12; both still pass).

## Deferred / next session
- **P0a behavioral** crash-resume (kill+restart auth) — the load-bearing no-double-send/fail-loud invariant.
- **Access-spine behavior**: mint access_token → run collector/ingest → verify session userId + lastUsedAt
  bump; legacy `machines.tokenHash` fallback (no legacy token currently exists to test).
- **Matte Dark**: `/agents/[id]`, `/graph`, `/monitoring`, `/register`; focus-ring; prefers-reduced-motion.
- **World-tools chat** (web_search→web_read gap; chart/map render). **Scheduler** real fire.
