# Platform — Remaining Work (canonical, post full cluster review 2026-06-16)

Output of the grounded-in-code review of all 7 clusters. **No functional bugs found.**
All clusters GA-ready. The list below is the *complete* set of genuinely-open work.
Delete items here as they land. Detailed specs live in the linked backlog files.

## ✅ Done this review
- Off-boarding gap (disable user → disable their workflow_schedule) — fixed `ce09496`.
- Custom Agents reach (chat persona / workflow discoverability / clone+use-in-chat) — merged `e296852`, live E2E PASS.

## 🟡 Open CODE work — prioritized
1. **Recipient-gate format-aware** (~2-3h) — `recipients.ts` parser is email-only → Slack(channel-id)/WhatsApp(E.164)/Zalo(user-id) writes stay fail-closed. Extend parser per-format + per-format allowlist, then flip those 3 tools to `workflowSafe:true`. **Needs CTO sign-off to flip.** Detail: [[connectors-oauth-followups]]. *Smallest, highest-leverage.*
2. **SSRF DNS-pin on MCP client** (~1-2d) — `mcp/ssrf.ts` checks config-time literal only; DNS-rebind to 169.254.169.254/private still passes. Fix = custom undici dispatcher. Do before opening MCP-server config to less-trusted members. Detail: [[connectors-crypto-hkdf]].
3. **Per-user HKDF crypto** (~2-3d) — `crypto.ts` uses one global `CONNECTOR_KEY` for all users' creds. **Gates BYOK Anthropic key + multi-tenant scale.** Lazy re-encrypt on touch; `userId` available at all call sites. Detail: [[connectors-crypto-hkdf]].
4. **Low / defense-in-depth**: MCP `listTools` timeout + tool-count cap (DoS); workflow-`tick` principal re-verify (my off-boarding fix already covers the practical hole); collector backoff jitter; MCP error-message sanitization review.

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
