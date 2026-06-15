# Custom Agents — Beyond Workflows (design)

Date: 2026-06-15 · Branch: `worktree-custom-agents-expand`

## Problem
A custom agent (per-user preset: `name`, `description`, `system`) can today be created/saved on `/settings/custom-agents` and used **only** in workflow agent-nodes. Users expect to actually *use* personas in Chat and to discover/manage them more easily. The create/save feature itself is complete — this work makes custom agents **reachable and usable beyond workflows**.

## Scope (3 fronts, one slice)

### Front 1 — Chat persona (core)
- **UI**: an agent selector in the chat header — "Trợ lý mặc định" + the user's custom agents (fetched from `GET /api/custom-agents`, same pattern as the workflow editor's preset select).
- **Wire**: selected id sent as `customAgentId` in the `POST /api/chat` body.
- **Backend**: in the default-prompt branch only, `getCustomAgent(userId, customAgentId)`; if found, pass `base: agent.system` into `buildSystemPrompt(...)` (which already accepts `base?`). Missing/foreign/deleted → **fail-soft** to default base (chat never 400s); log once.
- **Untouched**: the internal `body.system` full-override path (confirm/workflow) — `customAgentId` is ignored when `hasSystemOverride` is true.
- **Persistence**: client-side only — `localStorage` keyed per `conversationId` + a last-used default. **No DB migration this slice.**

### Front 2 — Workflow discoverability
- In the agent-node preset `<select>` (NodeConfigPanel `AgentForm`): when `presets.length === 0`, show a hint + link "Tạo Custom Agent" → `/settings/custom-agents`; always show a small "Quản lý" link. No backend change.

### Front 3 — Custom Agents page
- **Clone** per agent ("Nhân bản") — reuses `POST /api/custom-agents` with `{name: "<name> (copy)"}` (name capped 120).
- **"Dùng trong Chat"** per agent → navigates to `/chat?agent=<id>`; ChatClient reads the `agent` query param and pre-selects it (bridges page → chat).
- **Deferred** (noted, NOT built): per-agent tool/connector scope (needs schema + policy change).

## Data flow (Front 1)
ChatClient(selector → state + localStorage) → `POST /api/chat {customAgentId}` → route loads agent (per-user) → `buildSystemPrompt({base: agent.system, ...})` → systemContent → existing summarize/proactive compose unchanged.

## Error handling
- Foreign/missing/deleted `customAgentId` → fall back to default base, `console.warn` once. Never throws.
- Clone name collision allowed (presets are non-unique by name today).

## Testing (TDD)
- `route.test.ts`: customAgentId present+owned → agent.system in system prompt; foreign id → default (fail-soft); `body.system` override wins / ignores customAgentId.
- `CustomAgentsClient.test.tsx`: clone calls POST + prepends; "Dùng trong Chat" link href = `/chat?agent=<id>`.
- `NodeConfigPanel.test.tsx`: empty-presets shows create link.
- ChatClient: selector sends `customAgentId`; reads `?agent=` (jsdom-light assertion).

## i18n
Add keys to `customAgents` + chat + workflows dicts for vi/en/zh (selector label, default-assistant, clone, use-in-chat, workflow hint/manage).

## Non-goals
Per-agent tool scope; cross-device/persisted selection; chat model coupling.
