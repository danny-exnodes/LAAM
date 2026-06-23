# Checkpoint: consultant — 2026-06-09

## What was done
- **Workflow HIGH-blast connector writes** (user q: "workflow cho chạy send-mail?"): assessed → designed → shipped mechanism → designed + **IMPLEMENTED** gmail recipient-gate.
- Mechanism (`workflowSafe` flag, registry-derived, dry-run seam): **PR #8**.
- gmail recipient-gate: brainstorm → spec → **CTO review §9** (conditional: RFC 2822 header-injection bypasses allowlist) → folded **F1+F2** (1 body correction — F1 excludes body; **CTO confirmed §11**) → **IMPLEMENTED** (commit `cab2072`, expands PR #8).
- **Rule 13** tier corrections vs CTO: `gdrive_create_folder`/`gcal_create_event` = own-resource → tier-low; **only `gmail_send` is tier-high-exfil**. CTO confirmed.

## Files changed
- Specs (main): `2026-06-08-workflow-high-blast-design.md`, `2026-06-09-gmail-recipient-gate-design.md`; plan `2026-06-08-workflow-high-blast-mechanism.md`; comms `consultant-to-cto-workflow-high-blast.md`.
- Code (PR #8 branch `worktree-workflow-high-blast-mechanism`): `connectors/{types,demo,gmail,recipients}.ts`, `workflow/{blast,runtime,recipient}.ts`, `agent/safety/policy.ts` + tests; `.env.example`.

## Current state
- **PR #8 = mechanism + gmail gate.** 1337 tests pass, tsc clean. **Fail-closed — `gmail_send` NOT flipped** (gate dormant until flip).
- gmail gate spec CLEAR (CTO §11). Implementation DONE (§12).
- Mechanism specs/plan/comms committed to main (local+origin). PR #8 branch pushed.

## Next steps
- **CTO:** code-verify `parseRecipients` (`connectors/recipients.ts` regex) + security-review dry-run seam → **merge PR #8**.
- **After merge:** flip 9 tier-low tools (prefer private targets); flip `gmail_send` after operator sets `WORKFLOW_RECIPIENT_ALLOWLIST` + tripwire `policy.test.ts` update.

## Blockers / Risks
- Flip blocked on CTO code-verify + merge + operator allowlist.
- `parseRecipients` regex = the security-critical artifact (CTO to code-verify).
- Worktree session active → on exit, **KEEP** (PR #8 iteration).
- Stale Serena backlog `harness-write-tool-subsetting` (crater refuted as artifact — cleanup, CTO owns).

## Deviation noted
- `parseRecipients` placed in `connectors/recipients.ts` (pure) not `workflow/recipient.ts` (spec §5) — breaks a `gmail→workflow→registry→gmail` circular dep. Recorded in spec §12 + comms.
