export const meta = {
  name: 'i18n-pages',
  description: 'Localize each LAAM page group (vi/en/zh): per-page dict + data-i18n/t() wiring',
  phases: [{ title: 'Localize', detail: 'one agent per page group, disjoint files' }],
};

// Shared spec embedded in every agent prompt: the i18n engine contract, the
// hard rules, the shared keys already defined, and a cross-page glossary so the
// three languages stay consistent.
const SPEC = `
You are localizing the LAAM web app (vanilla JS, no build step) for THREE
languages: Vietnamese (vi), English (en), Chinese Simplified (zh). The existing
UI text is Vietnamese — that is the source of truth for meaning.

## i18n engine (already built — DO NOT modify it)
A global window.LAAMI18n is defined in /public/i18n.js and exposed on window.LAAM:
  • LAAM.t('ns.key', vars?)  -> translated string (interpolates {var}); falls
    back active-lang -> vi -> the key itself. Use this in JS render code.
  • LAAMI18n.register({ vi:{...}, en:{...}, zh:{...} })  -> deep-merges a partial
    dictionary. Each page registers its own dictionary from its own file.
  • LAAMI18n.applyDOM(root?)  -> translates static markup. Static HTML elements
    are tagged with attributes (NO need to call applyDOM yourself for page load —
    common.js already calls it after buildHeader; but you MUST re-apply for any
    static nodes you add dynamically, and dynamic JS text must use LAAM.t()).
  • LAAMI18n.onChange(fn) and the window 'laam:lang' event both fire on a
    language switch. Use ONE of them to RE-RENDER your page's dynamic content.

## Static markup attributes (translated by applyDOM)
  data-i18n="ns.key"        -> element.textContent
  data-i18n-html="ns.key"   -> element.innerHTML (dictionary text is trusted)
  data-i18n-ph="ns.key"     -> placeholder
  data-i18n-title="ns.key"  -> title
  data-i18n-aria="ns.key"   -> aria-label
Use data-i18n on a leaf element only (it overwrites textContent — don't put it
on a node that also has child elements you need to keep; wrap the text in a span).

## SHARED keys ALREADY defined in i18n.js — REUSE, do not redefine:
  nav.dashboard nav.agents nav.graph nav.search nav.office nav.chat
  brand.sub  conn.connecting conn.live conn.lost  theme.toggle  lang.label
  status.running status.idle status.done status.stuck
  time.justNow time.minAgo time.hourAgo time.dayAgo time.none
  common.export common.retry common.loading common.search common.close
  common.cancel common.save common.delete common.all common.none
  common.copy common.copied
For session status labels prefer LAAM.statusLabel(s) or LAAM.t('status.'+s).

## Cross-page glossary (keep terms consistent in all 3 languages)
  session    -> vi "phiên"     · en "session"  · zh "会话"
  project    -> vi "dự án"      · en "project"  · zh "项目"
  agent      -> vi "agent"      · en "agent"    · zh "智能体"
  model      -> vi "mô hình"    · en "model"    · zh "模型"
  tool       -> vi "công cụ"    · en "tool"     · zh "工具"
  token      -> vi "token"      · en "token"    · zh "token"
  cost       -> vi "chi phí"    · en "cost"     · zh "费用"
  branch     -> vi "nhánh"      · en "branch"   · zh "分支"
  orchestrator-> vi "điều phối" · en "orchestrator" · zh "编排器"
  sub-agent  -> vi "sub-agent"  · en "sub-agent"· zh "子智能体"
  filter     -> vi "bộ lọc"     · en "filter"   · zh "筛选"
  export     -> use common.export
  stuck      -> use status.stuck
zh must be natural, concise Simplified Chinese (UI register), NOT machine-literal.
en must read like native product UI. Keep punctuation/ellipsis style per language.

## HARD RULES
1. Edit ONLY the files listed in "YOUR FILES". Do NOT touch i18n.js, common.js,
   styles.css, or any other page's files. Other agents own those concurrently.
2. Create ONE new dictionary file as instructed (i18n.<page>.js) that calls
   LAAMI18n.register({vi,en,zh}) at load, under YOUR namespace only.
3. In each owned .html, add the dict <script> tag IMMEDIATELY AFTER the existing
   <script src="/i18n.js"></script> line (so register() runs before page JS).
4. Find EVERY user-facing hard-coded string in your files — visible text,
   button labels, titles/tooltips, aria-labels, placeholders, chart axis/legend
   titles, tooltip text, empty-states, error/toast messages, confirm() prompts,
   status words, units. Do NOT miss any. Console.* and code comments stay as-is.
5. vi value = the EXISTING text (copy it verbatim). Then provide en + zh.
6. Replace static HTML strings with data-i18n* attributes; replace JS string
   literals with LAAM.t('ns.key', vars). For interpolation use {var} placeholders
   (e.g. LAAM.t('dash.sessions', { n: count })) — never concatenate translated
   fragments, translate the whole phrase with a variable.
7. Wire a RE-RENDER on language change so dynamic JS content updates instantly
   without reload: add LAAMI18n.onChange(...) or window.addEventListener('laam:lang', ...)
   that re-runs your render from the last data you have (cache last snapshot/state
   if needed). Static data-i18n nodes are handled for you; JS-built nodes are not.
8. Keep all functionality working. Do not change logic, only externalize strings.
9. Number/date formatting: leave as-is unless trivial; not required.

## Namespacing
Put ALL your keys under your page namespace (e.g. "dash.cost.title"). Reuse the
shared keys above for status/time/nav/common rather than duplicating them.

When done, RETURN a concise report: the dict filename, namespaces/sections added,
the re-render mechanism you wired, the count of strings localized per file, and
ANY string you could not externalize (with reason). Be honest about gaps.
`;

const GROUPS = [
  {
    label: 'dashboard',
    ns: 'dash',
    dict: 'i18n.dash.js',
    files: ['public/index.html', 'public/dashboard.js', 'public/dash-cost.js', 'public/dash-heatmap.js', 'public/dash-tools.js', 'public/dash-models.js', 'public/export.js'],
    notes: 'export.js is also loaded by the Agents page but YOU own it — localize its user-facing strings (CSV/PDF labels, button text, toasts). The Agents agent will NOT touch export.js. Charts use Chart.js: localize axis titles, legend labels, dataset labels, and tooltip callbacks. Cache the last stats snapshot and re-render all dashboard modules on laam:lang.',
  },
  {
    label: 'agents+session',
    ns: 'agents',
    dict: 'i18n.agents.js',
    files: ['public/agents.html', 'public/agents.js', 'public/session.html', 'public/session.js'],
    notes: 'Two pages share ONE dict file (sections agents.* and session.*). Do NOT touch export.js (the dashboard agent owns it) — but DO localize the export BUTTON markup that lives in agents.html. Localize: filters (project/model/status/branch/time), status badges (reuse status.* + add stuck banner text), the stuck-alert banner + browser-notification title/body, drawer/timeline labels, the session waterfall labels, empty states, CSV column headers if generated here. agents.js renders from SSE snapshots — cache the last snapshot and re-render on laam:lang.',
  },
  {
    label: 'graph+search',
    ns: 'graph',
    dict: 'i18n.graphsearch.js',
    files: ['public/graph.html', 'public/graph.js', 'public/search.html', 'public/search.js'],
    notes: 'ONE dict file with sections graph.* and search.*. Graph (vis-network): node detail panel labels, legend, empty state, the click-a-node hint. Search: the search input placeholder, result count/“no results”, snippet labels, per-result session meta. Re-render the graph detail panel and the current search results on laam:lang.',
  },
  {
    label: 'chat',
    ns: 'chat',
    dict: 'i18n.chat.js',
    files: ['public/chat.html', 'public/chat.js', 'public/chat-history.js', 'public/chat-actions.js', 'public/chat-composer.js', 'public/chat-settings.js', 'public/chat-export.js', 'public/chat-ux.js', 'public/chat-render.js', 'public/chat-geo.js', 'public/chat-ingest.js'],
    notes: 'This is the biggest. chat.js is the KERNEL exposing window.LAAMChat; the chat-*.js are feature modules registered into window.LAAM_CHAT_MODULES and init(ctx) by the kernel. Localize EVERYTHING: composer placeholder + Gửi/Dừng buttons + attach tooltips (chat.html), history sidebar (header/new/filter/rename/delete/empty), per-message actions (copy/edit/regenerate/delete + flash labels + busy hints), settings/model-picker panel (all labels/hints/buttons), export menu (Markdown/JSON, role labels Bạn/Qwen, copy-code button), ux empty-state suggestion chips + aria-live announcements + “đang soạn…” indicator, slash-command labels, geo “Mở chỉ đường trong Google Maps”/marker, ingest size/format notes, render error/empty strings, the model badge text and the stats caption units (tok/s, tokens). For re-render on laam:lang: the kernel re-renders the transcript on events — call the store/render to refresh per-message UI; modules that build static toolbar/panel DOM once in init() should rebuild or re-translate their own nodes on laam:lang (use LAAMI18n.onChange inside each module init, guarded). The model picker fetches /api/ollama/models — keep that working. Do NOT regress send→stream or rich table/chart/map rendering. Each module must keep its “never throw out of init” discipline.',
  },
  {
    label: 'office',
    ns: 'office',
    dict: 'i18n.office.js',
    files: ['public/office.html', 'public/office.js', 'public/office-panels.js', 'public/office-sprites.js'],
    notes: 'Isometric agent office. Localize: connected/analytics/console panel headers + their row labels, the agent plaque/name-tag/status text, on-canvas HUD/controls/legend, buttons, empty states. office-sprites.js is mostly canvas drawing — only externalize any human-readable text it draws. office.js drives a render loop / redraws panels — re-render the panels (and any DOM labels) on laam:lang; canvas text that is redrawn each frame will pick up LAAM.t() automatically once you switch the literals to LAAM.t().',
  },
];

phase('Localize');
const reports = await parallel(GROUPS.map((g) => () =>
  agent(
    SPEC +
    `\n\n=========================\nYOUR GROUP: ${g.label}\nYOUR NAMESPACE: "${g.ns}." (plus shared keys)\nCREATE THIS DICT FILE: public/${g.dict}\nYOUR FILES (edit ONLY these + create the dict file):\n${g.files.map((f) => '  - ' + f).join('\n')}\n\nGROUP NOTES: ${g.notes}\n\nWork now. Read your files first, build the dictionary, wire data-i18n + LAAM.t(), add the dict <script> tag right after the /i18n.js tag in each owned .html, and wire the laam:lang re-render. Then return your report.`,
    { label: 'i18n:' + g.label, phase: 'Localize' }
  )
));

return GROUPS.map((g, i) => ({ group: g.label, report: reports[i] }));
