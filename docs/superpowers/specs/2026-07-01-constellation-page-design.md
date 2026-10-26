# Constellation Page — Design Spec

- **Date:** 2026-07-01
- **Author:** CTO agent (with @danny)
- **Status:** Draft — awaiting user review before writing-plans
- **Source prototype:** `ennam-agent-constellation-voice.html` (repo root)
- **Related:** replaces the chat-modal `Constellation` shipped in PR #10 (`mem:checkpoint/claude-workflow-builder-rnd-2026-06-29`)

## 1. Goal

Turn the immersive "ENNAM · Agent Constellation" prototype (a full-screen, voice-first
command-center: canvas FX, radial agent nodes, audio-reactive waveform/ripples) into a real
LAAM feature: a **new full-screen page `/constellation`**, reachable from Chat via the existing
**"Assistant Map"** button, wired to **real LAAM data** and the **real `/api/chat`** pipeline.

## 2. Decisions (locked)

| # | Decision | Choice |
|---|----------|--------|
| D1 | Data | **Real data**: nodes = real custom agents + connector/MCP/internal tool groups; command box + voice → real `/api/chat` streaming; drop the canned salonbookly/aiolink responder. |
| D2 | Voice | **Web Speech (reuse `useVoice`) + Neural-TTS hook** (optional endpoint via env, browser TTS fallback). |
| D3 | Style | **Faithful to prototype** (cyan/gold, Chakra Petch, canvas FX, glassmorphism) — a deliberate immersive exemption from matte-dark. |
| D4 | Old modal | **Replace**: Assistant Map button navigates to the page; remove the old modal + its component. |
| D5 | Weather | **Wire real**: browser Geolocation → `/api/weather` proxy (Open-Meteo, no key) + existing `/api/reverse` for city; deny → HCM fallback. |

## 3. Non-goals

- No change to the chat pipeline contract, the write-gate, or the tool registry.
- No new DB migration (no schema changes; `customAgentId` persists via existing localStorage key).
- No 3D/WebGL library; visuals stay Canvas 2D + SVG + CSS (like the prototype).
- Not putting `/constellation` into the global `AppHeader` nav (reachable from Chat + direct URL only).
- Neural-TTS **server** is not built here — only the pluggable proxy + graceful fallback.

## 4. Architecture

### 4.1 Route & chrome
- Full-screen route group that escapes `AppHeader`/nav:
  - `src/app/(fullscreen)/layout.tsx` — `auth()` guard → `redirect("/login")`; renders children with **no AppHeader**; applies the scoped fonts (see 4.6). Route group `(fullscreen)` is invisible in the URL.
  - `src/app/(fullscreen)/constellation/page.tsx` — server component (`export const dynamic = "force-dynamic"`), reads `session.user.name` for the greeting, renders `<ConstellationClient greetingName=… lang=… />`.
- Protected by default (not in the public list in `auth.config.ts`).
- **Navigation:** in `ChatClient.tsx`, replace the two Assistant-Map buttons ([:846](../../../src/components/chat/ChatClient.tsx#L846), [:908](../../../src/components/chat/ChatClient.tsx#L908)) `onClick` with `<Link href="/constellation">`.

### 4.2 Component tree (client)
```
ConstellationClient            state, data fetch, orchestration
├─ ConstellationCanvas         canvas FX (swarm, beams, flows, ripples, core ring) — driven by animation loop + audio level
├─ ConstellationNodes          HTML overlay <button> nodes positioned by computed layout (Rule 13 refs)
├─ SysInfoPanel                greeting (real) + rotating facts (static i18n) + weather (real)
├─ AudioWave                   audio-reactive waveform canvas (real amplitude)
└─ CommandDock                 Chat toggle + Voice toggle + lang + command <input> + caption + "Mở trong Chat"
```

### 4.3 Files — new
| File | Purpose | Tested |
|------|---------|--------|
| `src/app/(fullscreen)/layout.tsx` | auth guard, no-chrome, scoped fonts | — |
| `src/app/(fullscreen)/constellation/page.tsx` | server component + session name | — |
| `src/components/constellation/ConstellationClient.tsx` | orchestrator | interaction test |
| `src/components/constellation/ConstellationCanvas.tsx` | canvas FX + RAF loop + cleanup | — (visual) |
| `src/components/constellation/ConstellationNodes.tsx` | node overlay buttons | via client test |
| `src/components/constellation/CommandDock.tsx` | command/voice/lang controls | via client test |
| `src/components/constellation/SysInfoPanel.tsx` | greeting/facts/weather | — |
| `src/components/constellation/AudioWave.tsx` | audio-reactive waveform | — (visual) |
| `src/components/constellation/useAudioAnalyser.ts` | AudioContext + mic/TTS AnalyserNode, exposes micLevel/ttsLevel (SSR-safe) | — |
| `src/components/constellation/useConstellationChat.ts` | POST /api/chat + splitFrames stream + write-gate | unit (frame parse) |
| `src/lib/constellation/field.ts` | **pure** radial layout (inner/outer ring, mobile ellipse) | `field.test.ts` |
| `src/lib/constellation/nodeModel.ts` | **pure** merge of agents+catalog+connectors → nodes+states (Rule 13) | `nodeModel.test.ts` |
| `src/lib/constellation/facts.ts` | static curated "on this day" list keys | via i18n parity |
| `src/i18n/dictionaries/constellation.ts` | vi/en/zh strings | `constellation.test.ts` |
| `src/app/api/tts/route.ts` | Neural-TTS proxy (env `CONSTELLATION_TTS_URL`; 501 if unset) | `route.test.ts` |
| `src/app/api/weather/route.ts` | Open-Meteo proxy (lat/lng → temp + code) | `route.test.ts` |

### 4.4 Files — reuse (do NOT modify behavior)
`useVoice.ts`, `lib/chat/voice.ts` (`langToBcp47`, `stripForSpeech`, `speechSupport`), `lib/chat/frames.ts` (`splitFrames`), `components/ui/bloom`, globals.css keyframes (`laam-glow`/`laam-wave`), existing routes `/api/chat`, `/api/chat/tools`, `/api/custom-agents`, `/api/connectors`, `/api/reverse`.

> `VoiceWave.tsx` is **not** reused: it is a static (non-amplitude) bar animation whose only consumer is the modal being deleted; the new `AudioWave` (real amplitude) supersedes it, so `VoiceWave.tsx` is removed (see 4.5) to avoid dead code.

### 4.5 Files — remove
- Delete: `src/components/chat/Constellation.tsx`, `constellationLayout.ts`, `constellationLayout.test.ts`, `VoiceWave.tsx` (only consumer was the deleted modal; superseded by `AudioWave`).
- `ChatClient.tsx`: remove import (line 16), `constellationOpen` state (line 69), modal block (lines 1018–1059); swap the two buttons to `<Link>`.
- `ChatClient.test.tsx` (lines 314–352): keep helpers; update the "shows Assistant-map" test to assert the link; **move** the "pick tool" / "select agent (persisted)" behavioral assertions into the new page interaction test; remove the modal-Escape test.

### 4.6 Fonts / style
- `next/font/google`: `Chakra_Petch` (300/400/500/600, subsets latin+vietnamese) + `IBM_Plex_Mono` (400/500), applied as CSS vars on the `(fullscreen)` layout wrapper only (self-hosted → local-first; no global typography change).
- **Matte-dark exemption:** the prototype uses `backdrop-filter: blur`. The no-glassmorphism tests target only `MatteCard`/`AgentDrawer` scrim, not arbitrary pages, so this page is safe. Documented as a deliberate exemption.

## 5. Node model (Rule 13 — carry ground-truth objects)

`nodeModel.ts` (pure) merges three fetched sources into `ConstellationNode[]`:
- **Inner ring — agents:** `GET /api/custom-agents` → `{id,name}`. `ref={agentId}`. State: **active** if `id === selectedCustomAgentId`, else **linked**.
- **Outer ring — tool groups:** `GET /api/chat/tools` → `CatalogGroup[]` (internal/connector/mcp; connected tools only). `ref={group, tool?}`. State: internal → **linked**; connected connector / reachable MCP → **linked** (→ **active** while focused).
- **Outer ring — idle connectors:** `GET /api/connectors` → connectors with `status ∈ {disconnected, needs_reconnect}` become **idle** nodes (dashed), so the map shows the full surface like the prototype (drive/gmail/calendar dimmed). `ref={connectorId}` (click → hint to connect / deep-link to `/connectors`).
- `field.ts` (pure) assigns polar positions: agents on inner radius, groups on outer radius, even angular spacing; mobile → ellipse ring (mirrors prototype `layout()`).

**Click semantics:**
- Agent node → set active persona (`customAgentId`, persist `laam:chat:agent`), visual active, short spoken "routing to <agent>" confirm.
- Connected tool/group node → set `requestedTool` for the next command (chip), spoken confirm.
- Idle connector node → toast + link to `/connectors` (cannot dispatch a disconnected tool).

## 6. Voice + audio-reactive

- **Reuse `useVoice({lang, onTranscript})`** for STT (transcript → command input) and TTS (`speak(markdown)`); `speechSupport`/`langToBcp47` unchanged.
- **New `useAudioAnalyser` (SSR-safe):** lazily creates one `AudioContext` (resume on first user gesture); on listen, `getUserMedia` + `MediaStreamSource` + `AnalyserNode` (fftSize 512) → smoothed `micLevel`; on neural-TTS playback, `MediaElementSource` + `AnalyserNode` → smoothed `ttsLevel`. **Browser TTS cannot be metered** → pulse on `SpeechSynthesisUtterance.onboundary` (per-word), exactly like the prototype. Full teardown on unmount.
- **`AudioWave`** renders the 46-bar waveform with **real amplitude** (mic when listening, tts/word-pulse when speaking, idle shimmer otherwise); **ripples** spawn on amplitude threshold. Disabled under `prefers-reduced-motion` (static bars).
- **Neural-TTS proxy `POST /api/tts` `{text, lang}`:** reads server env `CONSTELLATION_TTS_URL`; if unset → **501** and the client falls back to browser `speechSynthesis`. If set → forwards, returns `audio/wav`; the client plays it through the analyser (real ripples). Same-origin (no CORS, endpoint hidden). Fail-soft: any error → browser TTS.

## 7. Chat wiring (real `/api/chat`)

`useConstellationChat`:
1. `POST /api/chat` with `{ message, conversationId?, model, customAgentId?, requestedTool? }` (same body shape ChatClient uses).
2. Read the stream with `splitFrames(raw)` — accumulate `text` into the **caption**; handle frames:
   - `tokens`/`cite` → ignored on this surface (or subtle badge).
   - `pending_write` → show a minimal **confirm chip** (approve/deny) and echo the token back via the existing confirm round-trip → **write-gate preserved**.
   - `proactive` → ignore on this surface.
3. On stream end → `voice.speak(caption)` (or neural via `/api/tts`).
4. Conversation: page auto-creates its own conversation (persisted → appears in the Chat sidebar). **"Mở trong Chat"** navigates to `/chat` to view the full transcript. (No new deep-link param required for v1.)

## 8. Sysinfo panel

- **Greeting:** `session.user.name` (fallback "Bạn"/"Agent") + time-of-day (server-rendered name, client time-of-day). Real.
- **Facts ("On this day"):** static curated list held as i18n keys (`constellation.fact.*`) in vi/en/zh; rotates every ~11s (respect reduced-motion → no auto-rotate).
- **Weather:** client `navigator.geolocation.getCurrentPosition` → `GET /api/weather?lat=&lng=` (Open-Meteo `current=temperature_2m,weather_code`, no key) for temp + condition, and existing `GET /api/reverse?lat=&lng=` for city name. Permission denied / unavailable → HCM fallback coords; render "—" while loading; fail-soft (panel hides weather line on error).

## 9. i18n

- New `src/i18n/dictionaries/constellation.ts` (namespace `constellation.*`): page title/aria, node aria, command placeholder, state labels (standby/listening/processing/speaking), voice on/off, greeting affixes, weather condition labels (Open-Meteo weather-code → text), facts. vi/en/zh for every key.
- `constellation.test.ts` parity test (truthy vi/en/zh for every key), mirroring `landing.test.ts`.
- In-page lang toggle uses the app's `setLang` (cookie `laam_lang`) — not a local toggle.

## 10. Error handling / fallbacks

- No `SpeechRecognition`/`speechSynthesis` → hide voice UI, keep text command box (graceful, per prototype).
- Geolocation denied → HCM fallback; weather API error → hide weather line.
- `/api/tts` 501/error → browser TTS.
- Data fetch failure (tools/agents/connectors) → render whatever loaded; internal group always present (best-effort, mirrors catalog behavior).
- Canvas: guard all `window`/`canvas`/`AudioContext` access in effects; cancel RAF + close AudioContext on unmount.

## 11. Testing

- **Pure/unit:** `field.test.ts` (ring assignment, spacing, mobile ellipse, deterministic), `nodeModel.test.ts` (merge → correct states linked/active/idle, Rule 13 ref identity), `constellation.test.ts` (i18n parity), `useConstellationChat` frame-parse (mock a stream with a `pending_write` frame → confirm round-trip; Rule 13: mock the model returning altered strings).
- **Routes:** `/api/tts` (501 when unset; forwards when set; fail-soft), `/api/weather` (maps Open-Meteo response; bad input → 400).
- **Interaction:** page/client test — nodes render from mocked `/api/*`; clicking an agent persists `customAgentId`; typing a command calls `/api/chat` and streams into caption; voice hidden when unsupported.
- **Regression:** update `ChatClient.test.tsx` (link instead of modal); matte-dark tests remain untouched/green.
- **Global:** `tsc --noEmit` clean; full suite green (the 4 pre-existing `search.test.ts` reds remain out of scope).

## 12. Build order (for the plan)

1. Scaffold `(fullscreen)` route group + page + nav swap + remove old modal + `constellation.ts` i18n → navigation works, shell renders.
2. `nodeModel.ts` + `field.ts` + `ConstellationCanvas` + `ConstellationNodes` → real-data map renders.
3. Voice: `useVoice` wiring + `useAudioAnalyser` + `AudioWave` → audio-reactive.
4. Chat: `useConstellationChat` + `CommandDock` + write-gate chip → real replies (caption + speak).
5. Sysinfo: greeting + facts + weather (`/api/weather` + geo + `/api/reverse`).
6. Neural-TTS proxy `/api/tts` + wire real-amplitude ripples on neural playback.
7. Tests + `tsc` + verify + cleanup; update `ChatClient.test.tsx`.

## 13. Success criteria

- From `/chat`, clicking Assistant Map lands on a full-screen, authenticated `/constellation` (no AppHeader).
- Nodes reflect the logged-in user's **real** custom agents + connected tool groups, with disconnected connectors shown idle.
- Speaking (Chrome/Edge) or typing a command hits `/api/chat`; the streamed reply shows in the caption and is spoken; waveform/ripples react to real mic amplitude.
- Weather + city render from geolocation (fallback HCM); greeting shows the real user name.
- Old modal gone; `tsc` clean; new + updated tests green; matte-dark tests still green.

## 14. Risks

- **Web Speech is Chrome/Edge-only and routes audio via the browser vendor** — surfaced via the voice toggle; not local-$0 (matches PR #10 caveat).
- **AudioContext/getUserMedia** needs a user gesture + mic permission; must be robust to denial.
- **Canvas performance** on low-end/mobile — cap DPR + particle count (prototype already does), honor reduced-motion.
- **Open-Meteo** is an external dependency (free, no key) — proxy isolates it; fail-soft keeps the page working offline.
