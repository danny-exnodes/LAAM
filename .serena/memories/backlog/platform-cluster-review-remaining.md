# Platform — Remaining Work (canonical, post full cluster review 2026-06-16)

Output of the grounded-in-code review of all 7 clusters. **No functional bugs found.**
All clusters GA-ready. The list below is the *complete* set of genuinely-open work.
Delete items here as they land. Detailed specs live in the linked backlog files.

## ✅ Done this review
- Off-boarding gap (disable user → disable their workflow_schedule) — fixed `ce09496`.
- Custom Agents reach (chat persona / workflow discoverability / clone+use-in-chat) — merged `e296852`, live E2E PASS.

## ✅ Landed in PR #9 (`worktree-harden-backlog-security`, pending merge) — 2026-06-16
All four open CODE items implemented TDD on one branch → [PR #9](https://github.com/danny-exnodes/LAAM/pull/9).
1. **Recipient-gate format-aware + flip** (`3c3216b`) — `parseRecipientsByFormat` (Slack channel-id / WhatsApp E.164 / Zalo OA user-id), `ConnectorTool.recipientFormat`, **per-format** allowlists (`WORKFLOW_{SLACK,WHATSAPP,ZALO}_ALLOWLIST`). 3 writes flipped `workflowSafe:true` — **CTO sign-off given**; fail-closed by default (empty allowlist).
2. **SSRF DNS-pin** (`2beb07d` + fix `06e2ec4`) — `assertSafeUrlResolved` resolves DNS + validates every IP at connect time; deps-free. **Adversarial review caught + fixed a CRITICAL IPv4-mapped-IPv6 hex bypass** (`new URL` normalizes `::ffff:1.2.3.4`→hex; structural IPv6 expander now used).
3. **Per-user HKDF** (`9b1b4cf`) — connector creds + MCP authToken → `HKDF(master, userId)` (`v2:` blob); cross-user isolation + BYOK seam. Lazy migration, no schema change.
4. **Defense-in-depth** (`4d3f2f5` + fix `06e2ec4`) — MCP `listTools` cap 200, bounded MCP error + bounded toolName (review), collector backoff jitter. Workflow-`tick` re-verify **reviewed = redundant** (off-boarding `ce09496` disables schedules transactionally).
Verify: 5 adversarial skeptics; recipient-gate/HKDF/completeness clean; 2 findings fixed. **2037 tests green, tsc clean.**

## 🟡 Residual follow-ups (surfaced by PR #9 — NOT blocking, documented honestly in code + PR)
1. **SSRF connect-time pin (TOCTOU)** — pre-flight resolve closes the *named* hole; the transport re-resolves on its own socket, so a sub-second rebind is still theoretically possible. Full pin = custom `undici` dispatcher (intentional dep add). Low.
2. **HKDF master-secret** — per-user keys still derive from ONE master, so this does NOT defeat env-leak; that needs per-user material (KMS/DPAPI/BYOK). This PR is the additive seam that gates BYOK. Detail: [[connectors-crypto-hkdf]].
3. **NAT64 (`64:ff9b::/96`) embedded private IPv4** in SSRF — unhandled; only exploitable with a NAT64 gateway in-env (uncommon for this self-hosted/Tailscale deployment).

## ⚙️ Ops / runtime (NOT code — host or operator)
- **OCR**: install native tesseract on dev host (`winget install UB-Mannheim.TesseractOCR` + vie/chi_sim data). Docker prod already bakes it (Dockerfile runner stage) — prod OK.
- **F2 chart/map** + **Streamdown criteria 3/4**: live runtime verification (model behavior / theming), not code.
- **Zalo 2-admin-1-OA** mutual-invalidation behavior; **Google Workspace** tenant verify (for Google Chat). Operator actions.

## 🗂️ Deliberate deferrals (documented — NOT gaps)
- v1-unported ([[v1-unported]]): events table → remote timeline + full-text transcript search; Office viz; Ollama proxy; Agents-tab gatefold into Monitoring; owner filter.
- Google Chat (Workspace preconditions, [[google-mcp-official-poc]] adjacent); WhatsApp templates/24h window.
- MCP write scope + access-token scope-enforcement — gated on connector-write GA.
- Matte-Dark page-level MatteCard adoption — token-lever is the design; primitives are opt-in.

## 🧹 Housekeeping
- **INDEX.md is stale** (claims v2.0.0 / "not built") — reconcile to v2.1.0+ next session.
