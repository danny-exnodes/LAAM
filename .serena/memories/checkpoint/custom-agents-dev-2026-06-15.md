# Checkpoint: custom-agents-dev — 2026-06-15

## What was done
Extended **Custom Agents** beyond workflow nodes (worktree `worktree-custom-agents-expand`, 2 commits `35d8d5f`+`7d51960`). Full Understand→Design→Critique→TDD→Verify→Review cycle.
- **Front 1 — Chat persona:** SettingsPanel agent `<select>` (persona) → `POST /api/chat {customAgentId}` → route loads per-user (`getCustomAgent`) fail-soft → `agent.system` as `base` of `buildSystemPrompt` via pure `resolveAgentBase` (precedence override>persona>default). localStorage persist + `?agent=` deep-link.
- **Front 2 — Workflow discoverability:** agent-node shows "Quản lý/Tạo Custom Agents" link → `/settings/custom-agents` when no presets (select was hidden before).
- **Front 3 — Settings page:** "Nhân bản" (clone, prefilled "(copy)") + "Dùng trong Chat" link (`/chat?agent=<id>`).

## Files changed (14, +280/-2)
route.ts(+resolveAgentBase, customAgentId load) · route.test.ts · ChatClient.tsx · SettingsPanel.tsx(+test) · types.ts · CustomAgentsClient.tsx(+test) · NodeConfigPanel.tsx(+test) · i18n chat/customAgents/workflows · design doc.

## Current state
- ✅ tsc clean. ✅ **1983 tests pass** (+11 new TDD tests, 0 regressions).
- ✅ Adversarial self-review: NO real defects; fixed 1 nit (localStorage mount churn, `7d51960`).
- No DB migration (selection client-side). No new deps.

## Next steps
- **E2E (handed to user — needs running host):** Settings→Custom Agents create preset → chat picks it (SettingsPanel persona select) → verify persona behavior; "Dùng trong Chat" deep-link; workflow agent-node empty-state link.
- Merge worktree → main after E2E sign-off. (node_modules is a junction — see [[npm-destroys-worktree-junction]]; run npm install + tsc on main post-merge if any dep drift, though none added here.)

## Blockers / Risks
- Deferred (noted, by design): per-agent tool/connector scope (needs schema); route-level integration test of the POST→persona path (convention = pure-helper tests; covered by upcoming E2E).
- Foreign/deleted `?agent=` id → backend fail-soft (default persona); UI may show stale selection until reload — acceptable v1.
