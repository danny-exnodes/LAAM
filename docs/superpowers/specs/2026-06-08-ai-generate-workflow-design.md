# AI Generate Workflow (#3, v1) — Design

**Status:** Draft for review · **Date:** 2026-06-08 · **Author:** claude

## Overview

An in-editor AI assistant that turns a **plain-language description** into a runnable
workflow graph. The user types "mỗi sáng 8h, tóm tắt các thẻ Trello chưa xong rồi gửi
email cho tôi"; the local model proposes a `WorkflowGraph`; the editor loads it onto
the canvas as a **proposal** the user reviews, edits, dry-runs, and saves.

This is **v1 (MVP)** of the larger "AI assistant in workflows" idea. Scope is deliberately
narrow: **one-shot generation**, **replace-canvas-with-undo**. Conversational refinement
and "review/explain an existing flow" are **stretch** (see §10), documented but not built.

## Goals / Non-goals

**Goals**
- Prompt → a *valid* (`assertRunnable`) `WorkflowGraph` loaded onto the canvas.
- Use the user's **real connectors** (actions + arg schemas) as generation context, so
  generated connector nodes reference real tools — reusing #1's enriched projection.
- Never load an invalid graph: validate server-side, self-repair once, else fail loudly.
- Applying a generation is **undoable** (reuses P5's history stack).

**Non-goals (v1)**
- No auto-save, no auto-run. A generation is a *proposal* on the canvas only.
- No multi-turn chat / iterative refinement (stretch).
- No reading/explaining the currently-open flow (stretch).
- No new connector-write path — running the proposal later goes through the existing
  blast-gate + dry-run, unchanged.

## Architecture

```
Editor ── "✨ Tạo bằng AI" ──▶ AiGeneratePanel (prompt textarea)
   │                                   │  POST /api/workflows/generate { prompt }
   │                                   ▼
   │                          generate/route.ts
   │              buildGenerationContext(connectors)  ── system prompt (DSL + catalog)
   │              callOllama(..., format: GRAPH_SCHEMA) ── structured JSON
   │              coerceGraph(raw)  ── normalize ids/kinds (code-derived, Rule 13)
   │              assertRunnable(graph)  ── validate; on fail → retry once with error
   ▼                                   │  200 { graph }  |  422 { error }
applyGeneratedGraph(graph) ◀───────────┘
   push current canvas to history → setNodes/setEdges(toReactFlow(graph)) → Undo reverts
```

### Generation engine (the load-bearing choice)
Use Ollama's **structured output** (`format` = a JSON Schema) rather than parsing free
text. The model is constrained to emit JSON shaped like a graph. We keep the `format`
schema **permissive** (`{ nodes: [...], edges: [...] }` with a `kind` discriminator and
loose field typing) because the local model (`gemma4:e4b`) handles a flat schema far more
reliably than a deeply-nested discriminated union. Correctness is then enforced by **code**:
`coerceGraph` + `assertRunnable`. (`format` gives structure; our code gives validity.)

## Components

### 1. `src/lib/workflow/generate.ts` (PURE — the testable core)
- `GENERATION_SYSTEM(catalog: string): string` — system prompt describing the workflow DSL:
  node kinds (`agent` prompt/system · `connector` connectorId/action/args · `condition`
  when · `foreach` items/body), the **graph constraints** (exactly one start; single path
  except `condition` which has exactly `true`+`false` edges; no fan-in/merge; no cycles;
  `foreach` has a nested body), and the **interpolation** syntax (`{{trigger}}`,
  `{{steps.<id>.output}}`). Includes one worked example.
- `buildCatalog(connectors: ConnectorListItem[]): string` — renders the connector catalog
  (id, each tool `name` — `description` + its `parameters` keys) from #1's projection, so
  the model picks real actions with real arg names.
- `GRAPH_FORMAT` — the permissive JSON Schema passed to Ollama `format`.
- `coerceGraph(raw: unknown): WorkflowGraph` — normalize the model's JSON into our type:
  ensure node `id`s are present + **unique** (re-id duplicates), keep only known kinds,
  drop unknown fields, coerce `args` to an object, recurse into `foreach.body`. **Pure +
  heavily tested** — this is the Rule-13 guard against the model returning malformed or
  hallucinated shapes. Never trusts the model's ids/kinds; derives them in code.

### 2. `src/app/api/workflows/generate/route.ts` (endpoint)
- `POST` — auth required (session userId). Body `{ prompt: string }` (rejects empty / >2000 chars).
- Loads `connectors = await list(userId)`; builds the system prompt + catalog.
- Calls Ollama (`/api/chat`, `stream:false`, `format: GRAPH_FORMAT`, no tools) via a small
  `callOllamaGenerate(messages, format)` helper (mirrors `callOllamaChat`, adds `format`).
- `coerceGraph(JSON.parse(content))` → `assertRunnable(graph)`.
- **Self-repair:** on parse/validate failure, retry **once** with the error appended as a
  user message ("Bản graph vừa rồi không hợp lệ: <error>. Sửa lại."). Still invalid → `422`
  with a friendly error. Cap attempts at 2 (no infinite loop). Never returns an invalid graph.
- Response: `200 { graph }` or `422 { error }`. (No persistence — the editor owns applying.)

### 3. `src/components/workflows/editor/AiGeneratePanel.tsx` (UI)
- A panel/modal opened by a **"✨ Tạo bằng AI"** toolbar button in `WorkflowEditor`.
- Prompt `<textarea>` + example chips + **Generate** button + loading + inline error.
- On success → calls `onApply(graph)` and closes.
- `t` injected (house style); no business logic beyond the fetch.

### 4. `WorkflowEditor` wiring
- `applyGeneratedGraph(graph)`: snapshot the current canvas into the **history stack** (P5),
  then `setNodes/setEdges(toReactFlow(graph))` and fit-view. **Undo** restores the prior
  canvas — satisfying "replace + undo". No auto-save; the user saves explicitly.

## Data flow (happy path)
1. User clicks ✨, types a description, Generate.
2. `/generate` builds context (DSL + their connector catalog), calls Ollama with `format`.
3. Model returns structured JSON → `coerceGraph` normalizes → `assertRunnable` passes.
4. `200 { graph }` → editor pushes undo snapshot → loads graph → user reviews/edits.
5. User dry-runs (P5 Test) and/or Saves. Running uses the existing blast-gate, unchanged.

## Error handling
- Empty/oversized prompt → `400` (client also disables Generate on empty).
- Ollama unreachable / non-200 → `502`, UI: "Không gọi được model cục bộ".
- Invalid graph after retry → `422`, UI: "Chưa tạo được flow hợp lệ — thử mô tả rõ hơn".
- `coerceGraph` always returns *some* `WorkflowGraph`; validity is decided by `assertRunnable`.

## Safety
- A generation is a **proposal**: loaded onto the canvas, never auto-saved or auto-run.
- The prompt is the user's own input (trusted instruction). The connector catalog is
  system data. No untrusted content enters the generation.
- The model only *names* connector actions; side effects happen only when the user later
  runs/saves, through the unchanged blast-gate (dry-run mocks writes — P5).
- Generated `args` may contain `{{...}}` — interpolated at run time exactly like hand-authored.

## Testing
- `generate.test.ts` (pure): `coerceGraph` re-ids duplicate ids; drops unknown kinds/fields;
  coerces missing `args`→`{}`; recurses `foreach.body`. `buildCatalog` lists connector tools.
  **Rule 13:** feed a model-shaped object with altered/duplicate/garbage ids and assert the
  code-derived normalization wins.
- `generate/route.test.ts`: mock Ollama → valid graph → `200`; → invalid graph then valid on
  retry → `200` (asserts 2 calls); → invalid twice → `422`; Ollama 500 → `502`; unauth → `401`.
- `AiGeneratePanel.test.tsx`: prompt → Generate → calls endpoint, applies graph, shows error
  on `422`.
- `WorkflowEditor`: `applyGeneratedGraph` pushes an undo snapshot so Undo reverts.

## File structure
```
src/lib/workflow/generate.ts              (+ generate.test.ts)        ── pure core
src/lib/workflow/ollama.ts                                            ── + callOllamaGenerate(format)
src/app/api/workflows/generate/route.ts   (+ route.test.ts)           ── endpoint
src/components/workflows/editor/AiGeneratePanel.tsx (+ .test.tsx)     ── UI
src/components/workflows/editor/WorkflowEditor.tsx                    ── toolbar button + applyGeneratedGraph
src/i18n/dictionaries/workflows.ts                                   ── wf.ai.* keys (vi/en/zh)
```

## Success criteria
- "mỗi sáng tóm tắt thẻ Trello chưa xong rồi email cho tôi" → a valid multi-node graph
  (agent summarize → connector email, using the user's real connectors) on the canvas,
  `assertRunnable`-valid, dry-runnable.
- A model that returns an invalid or duplicate-id graph never reaches the canvas: it is
  normalized + validated, retried once, else surfaced as a friendly error.
- Undo after generate restores the previous canvas exactly.

## Stretch (NOT v1 — documented for later)
- **Conversational refine:** multi-turn edits ("đổi bước 2 sang Gmail", "thêm điều kiện")
  via tool-calling (`runToolRounds` + graph-mutation tools), with a diff the user accepts.
- **Review/explain:** read the open flow, explain it, flag issues, suggest fixes.
- **Streaming progress** during generation; few-shot library per connector.
- **Insert/merge** into an existing flow (vs replace) once a join-point UX exists.
