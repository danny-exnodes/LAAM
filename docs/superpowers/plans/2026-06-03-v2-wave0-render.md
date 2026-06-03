# V2 Wave 0 — Package D (rich-render + chart/map primitives) — TDD sub-plan

Owner: agent `render`. Parent: `2026-06-03-v2-wave0-foundation.md` (Package D + LOCKED interfaces).
Scope (only these): `v2/src/components/render/{MarkdownView,ChartBlock,MapBlock,CodeBlock}.tsx` + matching `*.test.tsx`.
Run ONLY: `cd v2 && npx vitest run src/components/render`. No git add/commit. Do NOT edit package.json / vitest config / tsconfig.

## Locked signature
`MarkdownView(props: { source: string; className?: string }): JSX.Element` — react-markdown + remark-gfm + rehype-sanitize; custom `code` renderer dispatches language `chart`→ChartBlock, `map`→MapBlock, else CodeBlock.

## Conventions (from existing v2 components)
`"use client"`; double quotes; named exports; recharts via `ResponsiveContainer`; accent `#6d5efc`. Match `cost-chart.tsx` / `graph-canvas.tsx` style.

## v1 schemas to mirror (source of truth: public/chat-render.js, public/chat-geo.js)
- chart JSON: `{ type:"bar"|"line"|"pie"|"doughnut"|"radar", title?, data:{ labels:string[], datasets:[{label?, data:number[], backgroundColor?, borderColor? }] }, options? }`
- map JSON: `{ center?:[lat,lng], zoom?:number(=12), markers?:[{lat,lng,label?,name?,current?,me?}], route?:[[lat,lng]...], directions?:{from,to}, places?, locationDenied?, routeStraight?, nearbyEmpty? }`

## Steps (TDD: test first, then impl, per component)

### 1. ChartBlock
- [ ] Pure fn `chartToRecharts(cfg): { kind:'bar'|'line'|'pie'; rows:Record<string,number|string>[]; series:{key,label,color}[]; title? } | { error:string }`
  - Maps Chart.js `{labels,datasets}` → recharts row objects: row = `{ name:labels[i], <series.key>:datasets[k].data[i] }`. pie/doughnut → single-series rows `{ name, value }`. line/radar → line. bar/other → bar.
  - Palette: accent-led, same first colors as v1 (`#6d5efc`,`#22c55e`,`#f59e0b`,`#ef4444`,`#06b6d4`,...).
  - Invalid/no-data → `{error}`.
- [ ] Tests (`ChartBlock.test.tsx`): mapper for bar (multi-dataset rows+series), line (kind line), pie (rows `{name,value}`); invalid JSON / missing data → error. Component renders bar/line/pie without throwing; error config shows error text.

### 2. MapBlock (SSR-safe)
- [ ] Pure fn `parseMapConfig(raw): MapConfig | { error }` — JSON.parse, validate object, derive center (cfg.center → markers[0] → route[0] → Hà Nội `[21.0278,105.8342]`), zoom default 12, filter markers to finite lat/lng.
- [ ] Component: `const LeafletMap = dynamic(() => import inner, { ssr:false })`. Inner uses react-leaflet (MapContainer/TileLayer/Marker/Polyline). Outer parses + renders Google-Maps link (keyless URL, same builder as v1) + notes (locationDenied/routeStraight) + places list.
- [ ] Tests (`MapBlock.test.tsx`): parser — center fallback chain, zoom default, marker filtering, invalid→error. Component renders without throwing (dynamic boundary: assert it does not import leaflet synchronously / renders a placeholder). Google-Maps URL builder unit test.

### 3. CodeBlock
- [ ] Component: react-syntax-highlighter (Prism or hljs light build) + copy button (navigator.clipboard, guarded). Language class applied.
- [ ] Tests (`CodeBlock.test.tsx`): renders code text; copy button present; clicking copy calls clipboard.writeText with code.

### 4. MarkdownView
- [ ] Component: react-markdown + remark-gfm + rehype-sanitize; `components={{ code: dispatcher }}`. Dispatcher: fenced (has language) `chart`→ChartBlock, `map`→MapBlock, else CodeBlock; inline code → `<code>`.
- [ ] Tests (`MarkdownView.test.tsx`): GFM table → `<table>`; `**bold**` → `<strong>`; `<script>alert(1)</script>` stripped (no script node, no "alert" executed); a ```chart fence renders a chart container; a ```map fence renders map container.

## Success criteria
`npx vitest run src/components/render` green. Components render without throwing under jsdom. Leaflet only via dynamic ssr:false (SSR-safety asserted structurally; full `next build` is a coordinator integration step — note if unverified).
