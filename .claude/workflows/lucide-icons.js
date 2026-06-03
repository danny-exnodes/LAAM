export const meta = {
  name: 'lucide-icons',
  description: 'Replace emoji + hand-SVG icons with vendored Lucide icons across each page group',
  phases: [{ title: 'Iconify', detail: 'one agent per page group, disjoint files' }],
};

const ICON_NAMES = 'sun moon monitor globe languages wifi circle circle-dot radio paperclip link map-pin send settings sliders-horizontal panel-left menu copy pencil pencil-line rotate-cw refresh-cw trash-2 plus minus x check square circle-stop arrow-down arrow-up chevron-down chevron-right corner-down-left download upload file-down file-text file-json share-2 external-link arrow-up-right lightbulb braces code table table-2 bar-chart-3 line-chart trending-up map pen-line loader search-check users list clipboard-list locate-fixed crosshair badge-check building-2 coffee search filter alert-triangle triangle-alert dollar-sign clock git-branch cpu hexagon activity layers network message-square wrench zap database folder play circle-check circle-x gauge route navigation bot eye eye-off';

const SPEC = `
Replace the UI ICONS in the LAAM web app (vanilla JS, no build step) — emoji
(📎 🔗 📍 ⚙ ☰ 👥 📊 📋 ⬡ ↻ ✎ ✚ 🗑 ⧉ ⬇ ⚠ 💲 ⏱ ↗ 💡 🐍 📈 🗺️ ✍️ 🔍 …) and any
hand-rolled inline <svg> — with vendored LUCIDE icons, for a consistent look.

## Icon helper (already built, in common.js — DO NOT modify common.js)
  LAAM.icon(name, opts?) -> an <svg> string. opts: { size:18, strokeWidth:2, class:'lc' }.
  LAAM.iconInner(name)   -> just the inner <path>/<circle>… (for an existing <svg>).
Names are kebab-case. ALWAYS pass class:'lc' so it aligns on the text baseline:
  LAAM.icon('paperclip', { size: 17, class: 'lc' })
Icons inherit the current text color (stroke=currentColor) → they already work in
light + dark themes. Size them to match what they replace (most toolbar glyphs 16–18px).

## AVAILABLE ICONS (use ONLY these kebab names; pick the closest meaning):
${ICON_NAMES}

## Emoji → Lucide suggestions (use judgement for anything not listed):
  📎 paperclip · 🔗 link · 📍 map-pin · ⚙ settings · ☰ menu (or panel-left) ·
  👥 users · 📊 bar-chart-3 · 📋 clipboard-list (or list) · ⬡ hexagon (or cpu) ·
  ↻/🔄 rotate-cw · ✎/✏ pencil-line · ✚/＋ plus · −/➖ minus · 🗑 trash-2 ·
  ⧉/📋(copy) copy · ⬇/⤓ download · ⏹ square (or circle-stop) · ↓ arrow-down ·
  ✓ check · ✗/× x · ⚠ triangle-alert · 💲 dollar-sign · ⏱ clock · ⛓ git-branch ·
  🔍 search · 🌐 globe · ↗ external-link (or arrow-up-right) · 💡 lightbulb ·
  🐍/code braces (or code) · 📈 trending-up (or line-chart) · 🗺️ map · ✍️ pen-line ·
  📥 download · 📂 folder · ▶ play · 🟢/status circle (or circle-dot) · �autocrlf etc.

## HARD RULES
1. Edit ONLY the files in "YOUR FILES". Do NOT touch common.js, i18n.js, styles.css,
   chat-geo.js, or any OTHER page's files. Other agents run concurrently.
2. Replace emoji + hand-SVG used as UI ICONS. Build them via LAAM.icon(name,{class:'lc',size:N}).
   - In template strings / innerHTML: embed the icon() string directly.
   - For an existing <svg id=…> placeholder: set its innerHTML = LAAM.iconInner('name').
   - For a button that is JUST an emoji, replace its content with the icon svg.
3. Emoji INSIDE i18n strings: an i18n value like '⧉ Chép' or '⬇ Xuất' mixes an icon
   with text. SPLIT them: remove the emoji from the i18n string (leave the text only,
   e.g. 'Chép'), and prepend LAAM.icon(...) in the JS that renders that label. Do this
   in YOUR page's i18n file (i18n.<page>.js) — update ALL three languages (vi/en/zh)
   consistently (just strip the leading emoji + space). If an emoji is purely
   decorative content inside a sentence, you may leave it; only convert ICON glyphs.
4. KEEP every data-i18n / title / aria-label working. If a button had only an emoji
   and a title/aria, keep the title/aria; the new <svg> has aria-hidden.
5. Don't change behaviour or layout. Buttons that hold icon+text may need
   display:inline-flex; align-items:center; gap — add minimal scoped CSS in the SAME
   file's existing injected <style> (modules inject their own CSS) if alignment needs it.
   Do NOT add a new global stylesheet.
6. Leave NON-icon emoji that are real content alone (e.g. example text). Leave map/marker
   SVGs handled by the render pipeline alone if they are data, not chrome.
7. Never break a page. Test your reasoning; the SVG must be valid.

When done, RETURN a concise report: files touched, count of icons replaced per file,
which Lucide names you used, and any glyph you could NOT map (with reason).
`;

const GROUPS = [
  { label: 'dashboard', files: ['public/index.html', 'public/dashboard.js', 'public/dash-cost.js', 'public/dash-heatmap.js', 'public/dash-tools.js', 'public/dash-models.js', 'public/export.js', 'public/i18n.dash.js'],
    notes: 'KPI cards, chart-card titles, CSV/PDF export buttons (⤓/⬇ → download), stuck banner (⚠ → triangle-alert), any status dots. export.js builds PDF/CSV — only change UI button glyphs, NOT text inside the generated PDF/CSV.' },
  { label: 'agents+session', files: ['public/agents.html', 'public/agents.js', 'public/session.html', 'public/session.js', 'public/i18n.agents.js'],
    notes: 'Filter bar, export button, status badges, card meta glyphs (💲⏱⤓⛓⬡⚠), sub-agent markers, drawer/timeline, waterfall. Status text stays; only glyphs become icons.' },
  { label: 'graph+search', files: ['public/graph.html', 'public/graph.js', 'public/search.html', 'public/search.js', 'public/i18n.graphsearch.js'],
    notes: 'Graph toolbar (physics, fit/center → locate-fixed or crosshair), legend swatches stay as colour chips (they are colour keys, not icons — leave them), node-detail glyphs, ↗ open-in-agents (external-link). Search: 🔍 search icon in the input, result glyphs.' },
  { label: 'chat', files: ['public/chat.html', 'public/chat.js', 'public/chat-history.js', 'public/chat-actions.js', 'public/chat-composer.js', 'public/chat-settings.js', 'public/chat-export.js', 'public/chat-ux.js', 'public/chat-render.js', 'public/i18n.chat.js'],
    notes: 'BIGGEST. chat.html composer: 📎→paperclip, 🔗→link, 📍→map-pin, ☰→menu, ↓→arrow-down (scroll FAB). Modules: settings gear ⚙→settings, export ⬇→download + menu items, sidebar new ＋→plus / rename ✎→pencil-line / delete 🗑→trash-2, per-message actions ⧉Chép→copy / ✎Sửa→pencil-line / ↻Tạo lại→rotate-cw / 🗑Xoá→trash-2 (these labels are in i18n.chat.js like actCopy:"⧉ Chép" — strip the glyph from the string, prepend LAAM.icon in chat-actions.js render), badge ⬡ LOCAL→hexagon, stats/stop ⏹, suggestion chips 💡🐍📊📈🗺️✍️→lightbulb/braces/bar-chart-3/trending-up/map/pen-line, code-copy ⧉, map open ↗→external-link, render error ⚠. Keep send/stop as TEXT buttons (Gửi/Dừng) — they are words, optionally add a send icon. The kernel chat.js owns the 📎/🔗/📍 button wiring + scroll FAB. Modules inject their own <style id=…> — add alignment there if needed. Do NOT regress OCR/location/map features.' },
  { label: 'office', files: ['public/office.html', 'public/office.js', 'public/office-panels.js', 'public/office-sprites.js'],
    notes: 'Controls: zoom +/− → plus/minus, center → locate-fixed/crosshair, show-finished toggle. HUD panel headers + toggles 👥→users / 📊→bar-chart-3 / 📋→clipboard-list (or list). Badges. office-sprites.js is canvas drawing — do NOT convert canvas-drawn glyphs (they are not DOM); only DOM/HTML icons. office has NO i18n.<page> in this group edit — its strings are in i18n.office.js which is NOT yours; just change DOM glyphs to LAAM.icon in office.html/office.js/office-panels.js. If a glyph lives inside an i18n.office string you cannot edit, leave it and note it.' },
];

phase('Iconify');
const reports = await parallel(GROUPS.map((g) => () =>
  agent(
    SPEC + `\n\n=== YOUR GROUP: ${g.label} ===\nYOUR FILES (edit ONLY these):\n${g.files.map((f) => '  - ' + f).join('\n')}\n\nNOTES: ${g.notes}\n\nWork now: read your files, replace emoji/hand-SVG icons with LAAM.icon(), split icon-glyphs out of your i18n strings (all 3 langs), keep titles/aria, add minimal alignment CSS in your own injected styles if needed. Then report.`,
    { label: 'icons:' + g.label, phase: 'Iconify' }
  )
));
return GROUPS.map((g, i) => ({ group: g.label, report: reports[i] }));
