# Package A — i18n (vi/en/zh) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the v2 i18n subsystem (vi/en/zh) — a pure resolver, a React provider/hooks, a `laam_lang` cookie helper, and five ported dictionaries (common/dashboard/agents/chat/connectors) — conforming exactly to the Wave 0 LOCKED interfaces.

**Architecture:** Dictionaries are flat `Record<string, {vi,en,zh}>` maps (each key is a full dotted path ported from the v1 nested dicts). `resolve(dict, lang, key, vars)` does a direct lookup with active-lang → vi fallback → key, plus `{var}` interpolation (mirrors v1 `i18n.js` semantics). `I18nProvider` holds the active lang in React context; `useT(dict)` curries `resolve` over a namespace; `useLang()` exposes `{lang,setLang}` and persists via the `laam_lang` cookie.

**Tech Stack:** React 19, TypeScript (strict), vitest + @testing-library/react + jsdom (harness from Task 0). No new deps.

**Scope (only these files):** `v2/src/i18n/{types,index,cookie}.ts`, `v2/src/i18n/provider.tsx`, `v2/src/i18n/dictionaries/{common,dashboard,agents,chat,connectors}.ts`, and matching `*.test.ts(x)`.

**LOCKED interfaces (must match exactly):**
```ts
export type Lang = 'vi' | 'en' | 'zh';
export type Dict = Record<string, { vi: string; en: string; zh: string }>;
export function resolve(dict: Dict, lang: Lang, key: string, vars?: Record<string, string | number>): string;
export function I18nProvider(props: { lang: Lang; children: React.ReactNode }): JSX.Element;
export function useT(namespace: Dict): (key: string, vars?: Record<string, string | number>) => string;
export function useLang(): { lang: Lang; setLang: (l: Lang) => void };
```

**v1 source-of-truth (port content, preserve EVERY key × 3 langs):**
- common → `public/i18n.js` shared `register({...})` block (nav, brand, conn, theme, lang, status, time, common)
- dashboard → `public/i18n.dash.js` (`dash.*`)
- agents → `public/i18n.agents.js` (`agents.*` + `session.*`)
- chat → `public/i18n.chat.js` (`chat.*`)
- connectors → `public/i18n.connectors.js` (`conn.*`)

**Porting rule (DRY/consistency):** v1 keys are nested under a language root, e.g. `vi.dash.kpi.sub.projects`. In v2 the namespace lives in the dict NAME (file), and each entry is the dotted path WITHOUT the namespace prefix is NOT used — we keep the FULL v1 dotted path as the key so callers read naturally. Decision: keep keys exactly as the v1 lookup string (e.g. `'dash.kpi.sub.projects'`, `'agents.searchPh'`, `'chat.title'`, `'conn.connect'`, `'nav.dashboard'`). The dict shape transposes language-first → key-first: `{ 'dash.kpi.sessions': { vi:'Session', en:'Sessions', zh:'会话' } }`.

---

## Task 1: Types + smoke

**Files:**
- Create: `v2/src/i18n/types.ts`
- Test: `v2/src/i18n/types.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import type { Lang, Dict } from './types';

test('Dict entry has all three langs; Lang is the union', () => {
  const d: Dict = { greet: { vi: 'Chào', en: 'Hi', zh: '你好' } };
  const l: Lang = 'vi';
  expect(d.greet[l]).toBe('Chào');
  expect(d.greet.en).toBe('Hi');
  expect(d.greet.zh).toBe('你好');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/types.test.ts`
Expected: FAIL — cannot find module `./types`.

- [ ] **Step 3: Write minimal implementation**

```ts
// v2/src/i18n/types.ts
export type Lang = 'vi' | 'en' | 'zh';

export interface Entry {
  vi: string;
  en: string;
  zh: string;
}

export type Dict = Record<string, Entry>;

export type Translator = (key: string, vars?: Record<string, string | number>) => string;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/types.test.ts`
Expected: PASS (1).

---

## Task 2: `resolve()` pure resolver

**Files:**
- Create: `v2/src/i18n/index.ts`
- Test: `v2/src/i18n/index.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { resolve } from './index';
import type { Dict } from './types';

const d: Dict = {
  'nav.dashboard': { vi: 'Tổng quan', en: 'Dashboard', zh: '仪表盘' },
  'kpi.sub.projects': { vi: '{n} project', en: '{n} projects', zh: '{n} 个项目' },
  'onlyVi': { vi: 'Chỉ VI', en: '', zh: '' },
};

test('returns the active-lang string', () => {
  expect(resolve(d, 'en', 'nav.dashboard')).toBe('Dashboard');
  expect(resolve(d, 'zh', 'nav.dashboard')).toBe('仪表盘');
});

test('interpolates {var} from vars (number + string)', () => {
  expect(resolve(d, 'en', 'kpi.sub.projects', { n: 3 })).toBe('3 projects');
  expect(resolve(d, 'vi', 'kpi.sub.projects', { n: '12' })).toBe('12 project');
});

test('leaves unknown {var} placeholders intact', () => {
  expect(resolve(d, 'en', 'kpi.sub.projects')).toBe('{n} projects');
});

test('falls back to vi when the active-lang string is empty', () => {
  expect(resolve(d, 'en', 'onlyVi')).toBe('Chỉ VI');
});

test('falls back to the key itself when missing entirely', () => {
  expect(resolve(d, 'en', 'does.not.exist')).toBe('does.not.exist');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/index.test.ts`
Expected: FAIL — cannot find `resolve`.

- [ ] **Step 3: Write minimal implementation**

```ts
// v2/src/i18n/index.ts
import type { Dict, Lang } from './types';

export type { Dict, Lang, Entry, Translator } from './types';

const VAR_RE = /\{(\w+)\}/g;

export function resolve(
  dict: Dict,
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = dict[key];
  // active-lang → vi → key (mirrors v1 i18n.js lookup chain)
  let s: string | undefined;
  if (entry) {
    s = entry[lang] || entry.vi;
  }
  if (s == null || s === '') s = key;
  if (vars) {
    s = s.replace(VAR_RE, (m, name: string) =>
      vars[name] != null ? String(vars[name]) : m,
    );
  }
  return s;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/index.test.ts`
Expected: PASS (5).

---

## Task 3: `cookie.ts` (read/write `laam_lang`, SSR-safe)

**Files:**
- Create: `v2/src/i18n/cookie.ts`
- Test: `v2/src/i18n/cookie.test.ts`

The v1 engine persisted to `localStorage('laam.lang')`; v2 uses a `laam_lang` cookie so the server can read the active lang for SSR. `readLangFromCookie(cookieHeaderOrString)` parses a cookie string (server: `headers.cookie`; client: `document.cookie`); `writeLangCookie(lang)` sets `document.cookie` (client only, guarded by `typeof document`). Both validate against the `Lang` union and return `null`/no-op for unknown values.

- [ ] **Step 1: Write the failing test**

```ts
import { afterEach, expect, test } from 'vitest';
import { readLangFromCookie, writeLangCookie, LANG_COOKIE } from './cookie';

afterEach(() => {
  // clear the cookie jsdom keeps between tests
  document.cookie = `${LANG_COOKIE}=; path=/; max-age=0`;
});

test('LANG_COOKIE is laam_lang', () => {
  expect(LANG_COOKIE).toBe('laam_lang');
});

test('reads a valid lang from a cookie string', () => {
  expect(readLangFromCookie('foo=1; laam_lang=zh; bar=2')).toBe('zh');
  expect(readLangFromCookie('laam_lang=en')).toBe('en');
});

test('returns null for missing or invalid lang', () => {
  expect(readLangFromCookie('foo=1')).toBeNull();
  expect(readLangFromCookie('laam_lang=de')).toBeNull();
  expect(readLangFromCookie('')).toBeNull();
  expect(readLangFromCookie(undefined)).toBeNull();
});

test('writeLangCookie persists and is read back via document.cookie', () => {
  writeLangCookie('vi');
  expect(readLangFromCookie(document.cookie)).toBe('vi');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/cookie.test.ts`
Expected: FAIL — cannot find `./cookie`.

- [ ] **Step 3: Write minimal implementation**

```ts
// v2/src/i18n/cookie.ts
import type { Lang } from './types';

export const LANG_COOKIE = 'laam_lang';
const SUPPORTED: readonly Lang[] = ['vi', 'en', 'zh'];

function isLang(v: string): v is Lang {
  return (SUPPORTED as readonly string[]).includes(v);
}

/** Parse a cookie string (server header or document.cookie). */
export function readLangFromCookie(cookie?: string | null): Lang | null {
  if (!cookie) return null;
  for (const part of cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === LANG_COOKIE) {
      const v = decodeURIComponent(rest.join('='));
      return isLang(v) ? v : null;
    }
  }
  return null;
}

/** Persist the active lang (client-only; 1-year cookie). */
export function writeLangCookie(lang: Lang): void {
  if (typeof document === 'undefined') return;
  if (!isLang(lang)) return;
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/cookie.test.ts`
Expected: PASS (4).

---

## Task 4: `provider.tsx` — `I18nProvider`, `useLang`, `useT`

**Files:**
- Create: `v2/src/i18n/provider.tsx`
- Test: `v2/src/i18n/provider.test.tsx`

`I18nProvider({lang, children})` seeds context with the server-resolved lang. `useLang()` returns `{lang, setLang}`; `setLang` updates state AND calls `writeLangCookie`. `useT(namespace)` returns `(key, vars) => resolve(namespace, lang, key, vars)` bound to the active lang.

- [ ] **Step 1: Write the failing test**

```tsx
import { expect, test } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { I18nProvider, useT, useLang } from './provider';
import type { Dict } from './types';

const ns: Dict = {
  'nav.dashboard': { vi: 'Tổng quan', en: 'Dashboard', zh: '仪表盘' },
};

function Sample() {
  const t = useT(ns);
  const { lang, setLang } = useLang();
  return (
    <div>
      <span data-testid="label">{t('nav.dashboard')}</span>
      <span data-testid="lang">{lang}</span>
      <button onClick={() => setLang('en')}>en</button>
    </div>
  );
}

test('renders the provider lang', () => {
  render(
    <I18nProvider lang="vi">
      <Sample />
    </I18nProvider>,
  );
  expect(screen.getByTestId('label').textContent).toBe('Tổng quan');
  expect(screen.getByTestId('lang').textContent).toBe('vi');
});

test('setLang switches the rendered language live', () => {
  render(
    <I18nProvider lang="vi">
      <Sample />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByText('en'));
  expect(screen.getByTestId('label').textContent).toBe('Dashboard');
  expect(screen.getByTestId('lang').textContent).toBe('en');
});

test('useLang throws a clear error outside a provider', () => {
  function Bare() {
    useLang();
    return null;
  }
  expect(() => render(<Bare />)).toThrow(/I18nProvider/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/provider.test.tsx`
Expected: FAIL — cannot find `./provider`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// v2/src/i18n/provider.tsx
'use client';

import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { Dict, Lang, Translator } from './types';
import { resolve } from './index';
import { writeLangCookie } from './cookie';

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
}

const Ctx = createContext<LangCtx | null>(null);

export function I18nProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  const [active, setActive] = useState<Lang>(lang);
  const setLang = useCallback((l: Lang) => {
    setActive(l);
    writeLangCookie(l);
  }, []);
  const value = useMemo<LangCtx>(() => ({ lang: active, setLang }), [active, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useLang must be used within an I18nProvider');
  return ctx;
}

export function useT(namespace: Dict): Translator {
  const { lang } = useLang();
  return useCallback<Translator>(
    (key, vars) => resolve(namespace, lang, key, vars),
    [namespace, lang],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/provider.test.tsx`
Expected: PASS (3).

---

## Task 5: Port `common` dictionary (from `i18n.js` shared block)

**Files:**
- Create: `v2/src/i18n/dictionaries/common.ts`
- Test: `v2/src/i18n/dictionaries/common.test.ts`

Port the shared `register({...})` block in `public/i18n.js` (lines ~136–167): `nav.*`, `brand.sub`, `conn.*`, `theme.toggle`, `lang.label`, `status.*`, `time.*`, `common.*`. Transpose to key-first.

v1 key count (the leaf strings per language): nav=7, brand=1, conn=3, theme=1, lang=1, status=4, time=5, common=13 → **35 keys**.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { common } from './common';
import { resolve } from '../index';

test('common has the expected v1 key count (35) and all 3 langs each', () => {
  const keys = Object.keys(common);
  expect(keys.length).toBe(35);
  for (const k of keys) {
    expect(typeof common[k].vi).toBe('string');
    expect(typeof common[k].en).toBe('string');
    expect(typeof common[k].zh).toBe('string');
  }
});

test('sample shared strings resolve correctly', () => {
  expect(resolve(common, 'en', 'nav.dashboard')).toBe('Dashboard');
  expect(resolve(common, 'vi', 'nav.dashboard')).toBe('Tổng quan');
  expect(resolve(common, 'zh', 'nav.dashboard')).toBe('仪表盘');
  expect(resolve(common, 'en', 'common.copied')).toBe('Copied');
  expect(resolve(common, 'vi', 'time.minAgo', { n: 5 })).toBe('5 phút trước');
  expect(resolve(common, 'en', 'status.stuck')).toBe('Stuck');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/common.test.ts`
Expected: FAIL — cannot find `./common`.

- [ ] **Step 3: Write the dictionary**

Create `v2/src/i18n/dictionaries/common.ts` exporting `export const common: Dict = { ... }`. Each key is the v1 dotted path; transpose `vi.X / en.X / zh.X` into `{vi,en,zh}`. Port verbatim (copy strings exactly, including the em-dash `—`, ellipsis `…`, and the `{n}` placeholders). Full key list:
`nav.dashboard, nav.agents, nav.graph, nav.search, nav.office, nav.chat, nav.connectors, brand.sub, conn.connecting, conn.live, conn.lost, theme.toggle, lang.label, status.running, status.idle, status.done, status.stuck, time.justNow, time.minAgo, time.hourAgo, time.dayAgo, time.none, common.export, common.retry, common.loading, common.search, common.close, common.cancel, common.save, common.delete, common.all, common.none, common.copy, common.copied`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/common.test.ts`
Expected: PASS (2). The count assertion of 35 enforces no missing key.

---

## Task 6: Port `dashboard` dictionary (from `i18n.dash.js`)

**Files:**
- Create: `v2/src/i18n/dictionaries/dashboard.ts`
- Test: `v2/src/i18n/dictionaries/dashboard.test.ts`

Port `public/i18n.dash.js` `dash.*` (nested). Flatten to dotted keys with the `dash.` prefix kept. Count the v1 leaf strings (one language) to lock the count.

v1 leaf count under `dash`: exp=4, chart=9, act=2, kpi=7 + kpi.sub=6 (13), st=3, ds=6, axis=2, stuck=3, cost=6, hm=6 + hm.day=7 (13), tools=5 + tools.th=4 + tools.ds=2 + tools.tooltipCalls=1 (12), mdl=5 + mdl.th=7 + mdl.ds=2 + mdl.tooltipSpeed=1 (15), export=6, pdf=16. Total = 4+9+2+13+3+6+2+3+6+13+12+15+6+16 = **110 keys**.

> Verification note: when porting, count the actual leaves you write and update the expected number in the test to match what you ported IF and only if you can prove (by re-reading `i18n.dash.js`) the v1 leaf count differs from 110. The point of the assertion is parity, not a magic number — but do not lower it to hide a dropped key.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { dashboard } from './dashboard';
import { resolve } from '../index';

test('dashboard ports every v1 leaf key (110) across 3 langs', () => {
  const keys = Object.keys(dashboard);
  expect(keys.length).toBe(110);
  for (const k of keys) {
    expect(typeof dashboard[k].vi).toBe('string');
    expect(typeof dashboard[k].en).toBe('string');
    expect(typeof dashboard[k].zh).toBe('string');
  }
});

test('sample dashboard strings resolve, including nested + vars', () => {
  expect(resolve(dashboard, 'en', 'dash.kpi.sessions')).toBe('Sessions');
  expect(resolve(dashboard, 'vi', 'dash.kpi.sub.projects', { n: 4 })).toBe('4 project');
  expect(resolve(dashboard, 'zh', 'dash.hm.day.mon')).toBe('一');
  expect(resolve(dashboard, 'en', 'dash.mdl.th.doneRate')).toBe('Done %');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/dashboard.test.ts`
Expected: FAIL — cannot find `./dashboard`.

- [ ] **Step 3: Write the dictionary**

`export const dashboard: Dict = { 'dash.exp.csv': {...}, ... }`. Port EVERY leaf from the three language trees in `i18n.dash.js`. Keep HTML in values verbatim (e.g. `dash.stuck.banner`, `dash.cost.total` contain `<b>`/`<a>` — these are trusted dictionary strings, ported as-is). Preserve the fixed-width column spacing inside `dash.pdf.byModelHeader` / `byProjectHeader` exactly (they differ per language).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/dashboard.test.ts`
Expected: PASS (2).

---

## Task 7: Port `agents` dictionary (from `i18n.agents.js` — `agents.*` + `session.*`)

**Files:**
- Create: `v2/src/i18n/dictionaries/agents.ts`
- Test: `v2/src/i18n/dictionaries/agents.test.ts`

Port `public/i18n.agents.js`: both `agents.*` and `session.*` namespaces into ONE dict (keys keep their `agents.`/`session.` prefix).

v1 leaf count: `agents.*` = 43 (count the keys in the `agents:` block: searchPh…timelineEmpty). `session.*` = 18 (loading…subNoDesc). Total = **61 keys**.

> Re-count from `i18n.agents.js` while porting; the assertion enforces parity.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { agents } from './agents';
import { resolve } from '../index';

test('agents+session ports every v1 leaf key (61) across 3 langs', () => {
  const keys = Object.keys(agents);
  expect(keys.length).toBe(61);
  for (const k of keys) {
    expect(typeof agents[k].vi).toBe('string');
    expect(typeof agents[k].en).toBe('string');
    expect(typeof agents[k].zh).toBe('string');
  }
});

test('sample agents/session strings resolve incl. vars', () => {
  expect(resolve(agents, 'en', 'agents.srcAll')).toBe('All sources');
  expect(resolve(agents, 'vi', 'agents.count', { shown: 3, total: 9 })).toBe('3/9 session');
  expect(resolve(agents, 'zh', 'session.back')).toBe('← 智能体');
  expect(resolve(agents, 'en', 'agents.subs', { n: 2 })).toBe('Sub-agents (2)');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/agents.test.ts`
Expected: FAIL — cannot find `./agents`.

- [ ] **Step 3: Write the dictionary**

`export const agents: Dict = { 'agents.searchPh': {...}, ..., 'session.loading': {...}, ... }`. Port all 43 `agents.*` + 18 `session.*` leaves. Preserve `{shown}/{total}`, `{n}`, `{project}`, `{model}`, `{ago}`, the `←` arrow, and parenthetical `(...)` exactly per language.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/agents.test.ts`
Expected: PASS (2).

---

## Task 8: Port `chat` dictionary (from `i18n.chat.js`)

**Files:**
- Create: `v2/src/i18n/dictionaries/chat.ts`
- Test: `v2/src/i18n/dictionaries/chat.test.ts`

Port `public/i18n.chat.js` `chat.*` (flat already — no sub-objects). Keys keep the `chat.` prefix.

v1 leaf count under `chat`: count the keys in the vi `chat:` block. By section: page/aria=6, composer=8, badge/model/stats=5, empty=1, errors/attach=8, history=16, message-actions=18, composer power-ups=14, settings=15, export=22, ux=10, geo/render=12, ingest=21. Re-count exactly from the file; the EN block must have the SAME keys (note: EN places `ingUrlFail` at the end while vi groups it within ingest — same key, different ordering; ordering does not matter). Expected total ≈ **156 keys** — re-derive precisely while porting and set the assertion to the exact count you ported.

> The chat dict is the largest. Port section by section, in the same order as the file, to avoid drops. After writing, run `Object.keys(chat).length` mentally against your section tally before finalizing the test number.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { chat } from './chat';
import { resolve } from '../index';

test('chat dict: every key has all 3 langs and count matches port tally', () => {
  const keys = Object.keys(chat);
  // Set EXPECTED to the exact number of leaf keys ported from i18n.chat.js.
  const EXPECTED = 156;
  expect(keys.length).toBe(EXPECTED);
  for (const k of keys) {
    expect(typeof chat[k].vi).toBe('string');
    expect(typeof chat[k].en).toBe('string');
    expect(typeof chat[k].zh).toBe('string');
  }
});

test('sample chat strings resolve incl. vars', () => {
  expect(resolve(chat, 'en', 'chat.send')).toBe('Send');
  expect(resolve(chat, 'vi', 'chat.attachChars', { name: 'a.txt', n: 12 })).toBe('a.txt · 12 ký tự');
  expect(resolve(chat, 'zh', 'chat.histNew')).toBe('新建');
  expect(resolve(chat, 'en', 'chat.modelLocalFree', { model: 'gemma' })).toBe('gemma (local) · free');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/chat.test.ts`
Expected: FAIL — cannot find `./chat`.

- [ ] **Step 3: Write the dictionary**

`export const chat: Dict = { 'chat.title': {...}, ... }`. Port EVERY leaf from `i18n.chat.js` (vi/en/zh). Preserve emoji (`📎`), the curly apostrophe in en `chat.mapRouteStraight` (`Couldn’t`), all `{name}`, `{n}`, `{model}`, `{tps}`, `{tokens}`, `{msg}`, `{fmt}`, `{i}`, `{title}`, `{date}`, `{chars}` placeholders exactly. If the final ported count differs from 156, set the test `EXPECTED` to the true count (proven by re-reading the file) — never drop a key to hit a number.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/chat.test.ts`
Expected: PASS (2).

---

## Task 9: Port `connectors` dictionary (from `i18n.connectors.js`)

**Files:**
- Create: `v2/src/i18n/dictionaries/connectors.ts`
- Test: `v2/src/i18n/dictionaries/connectors.test.ts`

Port `public/i18n.connectors.js` `conn.*`. Keys keep the `conn.` prefix.

v1 leaf count: title, heading, sub, connected, notConnected, toolsLabel, connect, enable, disconnect, test, saving, testing, testOk, testErr, saveErr, loadErr, oauthNeeded = **17 keys**.

- [ ] **Step 1: Write the failing test**

```ts
import { expect, test } from 'vitest';
import { connectors } from './connectors';
import { resolve } from '../index';

test('connectors ports every v1 leaf key (17) across 3 langs', () => {
  const keys = Object.keys(connectors);
  expect(keys.length).toBe(17);
  for (const k of keys) {
    expect(typeof connectors[k].vi).toBe('string');
    expect(typeof connectors[k].en).toBe('string');
    expect(typeof connectors[k].zh).toBe('string');
  }
});

test('sample connector strings resolve', () => {
  expect(resolve(connectors, 'en', 'conn.connect')).toBe('Connect');
  expect(resolve(connectors, 'vi', 'conn.testOk')).toBe('Kết nối OK');
  expect(resolve(connectors, 'zh', 'conn.oauthNeeded')).toBe('需要 OAuth — 即将推出');
});
```

> Note: `conn.*` here is the CONNECTORS namespace (page strings). It is distinct from the `conn.*` connection-status keys (`conn.connecting/live/lost`) in the `common` dict — same prefix, different dict. They never collide because each dict is consumed via its own `useT(namespace)`. Flag for team-lead so Wave 4 (Connectors page) uses `connectors`, not `common`, for these.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/connectors.test.ts`
Expected: FAIL — cannot find `./connectors`.

- [ ] **Step 3: Write the dictionary**

`export const connectors: Dict = { 'conn.title': {...}, ... }`. Port all 17 leaves verbatim (note `conn.sub` and `conn.oauthNeeded` contain the em-dash `—`).

- [ ] **Step 4: Run test to verify it passes**

Run: `cd v2 && npx vitest run src/i18n/dictionaries/connectors.test.ts`
Expected: PASS (2).

---

## Task 10: Full-suite verification

- [ ] **Step 1: Run the whole i18n suite**

Run: `cd v2 && npx vitest run src/i18n`
Expected: all files green (types, index, cookie, provider, common, dashboard, agents, chat, connectors).

- [ ] **Step 2: Type-check the i18n module**

Run: `cd v2 && npx tsc --noEmit` (whole project, since there is no per-dir tsc config).
Expected: no new errors introduced by `src/i18n/**`. (If pre-existing errors in unrelated files appear, note them but do not fix — out of scope.)

- [ ] **Step 3: Checkpoint + handoff**

Write `.serena/checkpoint/i18n-2026-06-03.md`; mark Task #1 completed; SendMessage to team-lead with files + pass summary. Do NOT git add/commit (team-lead reviews).

---

## Self-Review

- **Spec coverage:** locked `Lang`/`Dict`/`resolve` → Tasks 1–2; `I18nProvider`/`useT`/`useLang` → Task 4; `cookie.ts` → Task 3; 5 dictionaries (common/dashboard/agents/chat/connectors) preserving every key × 3 langs → Tasks 5–9; full verify → Task 10. ✅
- **Interface conformance:** signatures copied verbatim from the LOCKED block; `useT(namespace: Dict)` returns a `Translator`; `resolve` arg order `(dict, lang, key, vars?)`. ✅
- **Placeholder scan:** dictionary content steps reference the exact v1 file + section + key list rather than inlining ~300 strings; this is a deliberate port-from-source instruction, and the count assertions are the parity guard (every dropped key fails the test). Sample-resolve tests pin concrete expected strings. ✅
- **Type consistency:** `Dict`/`Lang`/`Entry`/`Translator` defined in Task 1, imported identically everywhere; `resolve` re-exported from `index.ts`. ✅
- **Naming collision flagged:** `conn.*` exists in BOTH `common` (status) and `connectors` (page) — documented in Task 9, harmless because dicts are namespaced by consumption. ✅
