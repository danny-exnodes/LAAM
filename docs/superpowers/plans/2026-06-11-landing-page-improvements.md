# Landing Page Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sửa landing page (`/`) theo kết quả đánh giá 6-lens 2026-06-11 (xem `.serena/qa/landing-eval-2026-06-11.md`): hết vỡ layout mobile/tablet (P0), thêm thông tin điểm mạnh platform (how-it-works, security, search/map, zero-instrumentation), và vá a11y/perf đã xác nhận.

**Architecture:** Giữ nguyên kiến trúc landing hiện có (CSS Module + components trong `src/components/landing/`, copy trong `src/i18n/dictionaries/landing.ts`). Mech exploded-view trở thành desktop-only enhancement (≥1100px) — viewport hẹp dùng lại nhánh `fallbackGrid` đã có sẵn và đã test. Hai section mới (HowItWorks, Security) tái dùng style/component sẵn có (`secHead`, `FeatureCard`, `stat`).

**Tech Stack:** Next.js 16 App Router, React 19, CSS Modules, Vitest + Testing Library (jsdom), i18n in-house vi/en/zh.

**Bối cảnh bắt buộc đọc trước:**
- Báo cáo đánh giá: `.serena/qa/landing-eval-2026-06-11.md` (finding ID `ux-*`, `vis-*`, `rsp-*`, `a11y-*`, `cnt-*`, `perf-*` được tham chiếu trong từng task).
- `.serena/memories/decisions/responsive-conventions.md` (hamburger ở md=768).
- ⛔ `.serena/memories/decisions/agent-ops-rules.md`: KHÔNG tự chạy dev server/build khi user chưa cho phép. Verify bằng vitest + tsc; verify trực quan dùng server :3100 **đang chạy sẵn** (nếu đã tắt → hỏi user).
- ⛔ Checkout này DÙNG CHUNG với team khác → làm trong worktree (Task 0), chỉ stage file của mình.

---

## Quyết định cần user xác nhận (đã chọn mặc định an toàn)

1. **Zoom toàn app:** `layout.tsx` + `NoZoom` khoá pinch-zoom có chủ đích ("app-like feel") nhưng fail WCAG 1.4.4 (Lighthouse cũng báo). Plan này chỉ mở zoom cho **riêng landing** (Task B6). Mở cho toàn app hay không → user quyết riêng.
2. **Telemetry HUD:** không fetch số thật lên trang public (lộ dữ liệu nội bộ) — gắn nhãn "số liệu minh hoạ" cho panel monitoring (Task B4). Biến thể "số thật khi đã đăng nhập" để sau nếu user muốn.
3. **Không làm trong plan này** (P2 đã cân nhắc, ghi lại để khỏi mất dấu): prefetch chunk Mech3D (perf-4), nâng three/fiber (perf-7 — PR deps riêng), kéo palette landing về teal app (vis-6 — chờ rollout Matte Dark), section so sánh chi phí + FAQ (cnt-5 phần 2), link README công khai (repo chưa push remote), starfield 30fps cap.

---

### Task 0: Worktree cách ly

**Files:** không sửa file nào — chỉ tạo worktree.

- [ ] **Step 1: Tạo worktree + junction node_modules** (pattern CTO đã dùng cho R0)

```powershell
git -C D:\Projects\personal_projects\LAAM worktree add .claude/worktrees/landing-improvements -b feat/landing-improvements
cmd /c mklink /J "D:\Projects\personal_projects\LAAM\.claude\worktrees\landing-improvements\node_modules" "D:\Projects\personal_projects\LAAM\node_modules"
```

Expected: worktree tại `.claude/worktrees/landing-improvements`, branch `feat/landing-improvements`. KHÔNG `npm install`.

- [ ] **Step 2: Smoke test trong worktree**

Run: `npx vitest run src/components/landing` (cwd = worktree)
Expected: toàn bộ test landing hiện có PASS (baseline).

*Mọi task sau đều làm trong worktree này; mọi lệnh test/tsc chạy với cwd = worktree.*

---

## PHASE A — Responsive (P0/P1: ux-1, vis-1, rsp-1..4, a11y-1, ux-6, rsp-2/3, vis-8)

### Task A1: Mech section — grid tĩnh dưới 1100px (fix P0)

**Files:**
- Modify: `src/components/landing/MechShowcase.tsx:46-50`
- Test: `src/components/landing/MechShowcase.test.tsx`

- [ ] **Step 1: Viết test fail — viewport hẹp + có WebGL vẫn phải ra grid đọc được**

Thêm vào `MechShowcase.test.tsx`:

```tsx
import { vi, afterEach } from 'vitest';

afterEach(() => vi.unstubAllGlobals());

describe('MechShowcase viewport gate', () => {
  it('renders the readable grid below 1100px even when WebGL is available', () => {
    // matchMedia: mọi query đều không khớp → không reduced-motion, KHÔNG đủ rộng
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList);
    // jsdom không có WebGL — giả lập có để chứng minh gate chặn vì viewport, không phải vì WebGL
    vi.stubGlobal('WebGLRenderingContext', class {});
    const orig = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => ({})) as never;
    try {
      render(
        <I18nProvider lang="en">
          <MechShowcase />
        </I18nProvider>,
      );
      expect(screen.getByText('Real-time monitoring')).toBeInTheDocument();
      expect(screen.getByText('Dashboard & insights')).toBeInTheDocument();
    } finally {
      HTMLCanvasElement.prototype.getContext = orig;
    }
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run src/components/landing/MechShowcase.test.tsx`
Expected: FAIL — bản hiện tại set `enable3D=true` (reduce=false + WebGL giả) → render exploded view, không thấy đủ 6 title dạng grid (Canvas mock thiếu → có thể lỗi render Mech3D lazy; cả hai đều là fail hợp lệ).

- [ ] **Step 3: Sửa effect quyết định 3D trong `MechShowcase.tsx`**

Thay block `useEffect` hiện tại (dòng 46-50):

```tsx
  // Decide 3D vs static fallback after mount (needs browser APIs). The exploded
  // view is desktop-only: below 1100px the absolute HUD placements collide
  // (landing-eval ux-1/rsp-1/a11y-1), so narrow viewports get the same readable
  // grid as no-WebGL / reduced-motion.
  useEffect(() => {
    if (typeof matchMedia !== 'function') {
      setEnable3D(supportsWebGL());
      return;
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)');
    const wide = matchMedia('(min-width: 1100px)');
    const decide = () => setEnable3D(!reduce.matches && wide.matches && supportsWebGL());
    decide();
    wide.addEventListener('change', decide);
    reduce.addEventListener('change', decide);
    return () => {
      wide.removeEventListener('change', decide);
      reduce.removeEventListener('change', decide);
    };
  }, []);
```

- [ ] **Step 4: Chạy test, xác nhận PASS (cả file, gồm test fallback cũ)**

Run: `npx vitest run src/components/landing/MechShowcase.test.tsx`
Expected: PASS toàn bộ.

- [ ] **Step 5: Commit**

```powershell
git add src/components/landing/MechShowcase.tsx src/components/landing/MechShowcase.test.tsx
git commit -m "fix(landing): mech exploded view is desktop-only — narrow viewports get the readable grid"
```

### Task A2: CSS responsive — sticky svh, nowrap CTA, breakpoint 768, grid 2 bước, fallbackGrid <320px, safe-area

**Files:**
- Modify: `src/components/landing/landing.module.css`

- [ ] **Step 1: Sửa các rule sau trong `landing.module.css`** (tham chiếu finding rsp-3/4/7/9/10, vis-8)

(a) Nút không wrap — thêm vào cả `.btnPrimary` (dòng 59) và `.btnGhost` (dòng 66):

```css
  white-space: nowrap;
```

(b) `.sticky` (dòng 119) — svh thay vh (fallback giữ vh cho browser cũ):

```css
.sticky { position: sticky; top: 0; height: 100vh; height: 100svh; overflow: hidden; }
```

(c) `.prog` (dòng 121) — chừa safe-area đáy:

```css
.prog { position: absolute; left: 50%; bottom: calc(20px + env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 4; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: var(--faint); }
```

(d) `.fallbackGrid` (dòng 122) — không tràn dưới 320px:

```css
.fallbackGrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr)); gap: 22px; padding: 8vh 0; }
```

(e) Thay media query nav 820px (dòng 93) bằng khối 768px chuẩn dự án (giữ chỗ cho hamburger Task A3):

```css
@media (max-width: 768px) {
  .navLinks { display: none; }
  .navRight .btnGhost { display: none; } /* Sign in dời vào menu hamburger (A3) */
  .btnPrimary, .btnGhost { padding: 10px 16px; font-size: 13px; }
  .langBtn { padding: 8px 11px; } /* touch target ≥24px (rsp-9) */
}
```

(f) Thay media query `.grid` 900px (dòng 172) bằng 2 bước:

```css
@media (max-width: 1024px) { .grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) { .grid { grid-template-columns: 1fr; } }
```

(g) Desktop thấp (vis-2 — 6 panel giao nhau ở 900px height): thêm cuối file, trước khối reduced-motion:

```css
/* Viewport desktop thấp: thu panel + kéo anchor sát mép để 6 panel không giao nhau. */
@media (min-width: 1100px) and (max-height: 1000px) {
  .hudFrame { max-width: 300px; }
  .shot { height: 88px; }
  .desc { font-size: 0.8rem; }
  .coHead { top: 3%; }
  .coCore { bottom: 2%; }
  .coArmL, .coArmR { top: 17%; }
  .coLegL, .coLegR { bottom: 8%; }
}
```

- [ ] **Step 2: Verify suite + types**

Run: `npx vitest run src/components/landing ; npx tsc --noEmit`
Expected: PASS / exit 0 (CSS module không đổi tên class nào).

- [ ] **Step 3: Commit**

```powershell
git add src/components/landing/landing.module.css
git commit -m "fix(landing): responsive CSS — svh sticky, nowrap CTAs, 768px nav breakpoint, 2-step grid, low-vh panel layout"
```

### Task A3: Hamburger nav + aria-label nút ngôn ngữ

**Files:**
- Modify: `src/components/landing/LandingNav.tsx`
- Modify: `src/components/landing/landing.module.css` (thêm `.menuBtn`, `.mobileMenu`, `.mobileLink`)
- Modify: `src/i18n/dictionaries/landing.ts` (key `nav.menu`)
- Test: `src/components/landing/LandingNav.test.tsx`

- [ ] **Step 1: Viết test fail** — thay test `renders the three language buttons` hiện có và thêm test hamburger:

```tsx
import { fireEvent } from '@testing-library/react';

  it('renders the three language buttons with full accessible names', () => {
    render(ui(false));
    for (const name of ['Tiếng Việt', 'English', '中文']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('opens the mobile menu with section links and Sign in', () => {
    render(ui(false));
    const toggle = screen.getByRole('button', { name: 'Menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const menu = document.getElementById('landing-menu')!;
    expect(menu.querySelectorAll('a[href^="#"]')).toHaveLength(3);
    fireEvent.click(menu.querySelector('a[href="#features"]')!);
    expect(document.getElementById('landing-menu')).toBeNull(); // tự đóng sau khi chọn
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx vitest run src/components/landing/LandingNav.test.tsx`
Expected: FAIL — chưa có aria-label tên đầy đủ, chưa có nút Menu.

- [ ] **Step 3: Thêm key i18n vào `landing.ts`** (sau `nav.dashboard`):

```ts
  'nav.menu': { vi: 'Menu', en: 'Menu', zh: '菜单' },
```

- [ ] **Step 4: Sửa `LandingNav.tsx`** — bản đầy đủ:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import styles from './landing.module.css';
import { useT, useLang } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { common } from '@/i18n/dictionaries/common';
import type { Lang } from '@/i18n/types';

const LANGS: Lang[] = ['vi', 'en', 'zh'];
// Accessible names for the 2-letter language buttons (a11y-5) — proper names,
// not translated.
const LANG_NAMES: Record<Lang, string> = { vi: 'Tiếng Việt', en: 'English', zh: '中文' };

// Sticky top nav. Plain <a> for routes (full-page nav into the app is fine for
// a marketing page and keeps it router-context-free for tests). Auth-aware CTA.
// ≤768px the inline section links collapse into a hamburger menu (project
// convention: responsive-conventions.md).
export function LandingNav({ isAuthed }: { isAuthed: boolean }) {
  const t = useT(landing);
  const tc = useT(common);
  const { lang, setLang } = useLang();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = (
    <>
      <a href="#features" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.features')}</a>
      <a href="#how" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.howItWorks')}</a>
      <a href="#stack" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.stack')}</a>
    </>
  );

  return (
    <header className={`${styles.nav} ${scrolled || open ? styles.navScrolled : ''}`}>
      <a href="#top" className={styles.brand}>
        <span className={styles.mark} aria-hidden="true" />
        LAAM
      </a>

      <nav className={styles.navLinks} aria-label="Sections">
        <a href="#features" className={styles.navLink}>{t('nav.features')}</a>
        <a href="#how" className={styles.navLink}>{t('nav.howItWorks')}</a>
        <a href="#stack" className={styles.navLink}>{t('nav.stack')}</a>
      </nav>

      <div className={styles.navRight}>
        <div className={styles.langGroup} role="group" aria-label={tc('lang.label')}>
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              className={`${styles.langBtn} ${l === lang ? styles.langActive : ''}`}
              aria-pressed={l === lang}
              aria-label={LANG_NAMES[l]}
              onClick={() => setLang(l)}
            >
              {l}
            </button>
          ))}
        </div>

        {isAuthed ? (
          <a href="/dashboard" className={styles.btnPrimary}>{t('nav.dashboard')}</a>
        ) : (
          <>
            <a href="/login" className={styles.btnGhost}>{t('nav.signin')}</a>
            <a href="/register" className={styles.btnPrimary}>{t('nav.getstarted')}</a>
          </>
        )}

        <button
          type="button"
          className={styles.menuBtn}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={t('nav.menu')}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {open && (
        <div id="landing-menu" className={styles.mobileMenu}>
          {links}
          {!isAuthed && (
            <a href="/login" className={styles.mobileLink} onClick={() => setOpen(false)}>{t('nav.signin')}</a>
          )}
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 5: Thêm CSS vào `landing.module.css`** (sau `.langActive`, trước media query nav):

```css
.menuBtn {
  display: none; align-items: center; justify-content: center;
  width: 40px; height: 40px; border-radius: 10px; cursor: pointer;
  color: var(--text); background: rgba(255, 255, 255, 0.05); border: 1px solid var(--edge);
}
/* Matte: nền đặc (không backdrop-blur — decision matte-dark A2). */
.mobileMenu {
  position: absolute; top: 100%; left: 0; right: 0; display: flex; flex-direction: column;
  padding: 8px clamp(20px, 5vw, 56px) 14px; background: rgba(4, 14, 26, 0.97);
  border-bottom: 1px solid rgba(120, 180, 230, 0.12);
}
.mobileLink { color: var(--muted); text-decoration: none; font-size: 15px; padding: 12px 4px; }
.mobileLink:hover { color: var(--text); }
```

Và trong khối `@media (max-width: 768px)` của Task A2 thêm: `.menuBtn { display: inline-flex; }`

- [ ] **Step 6: Chạy test, xác nhận PASS**

Run: `npx vitest run src/components/landing/LandingNav.test.tsx src/i18n`
Expected: PASS (gồm dict test parity vi/en/zh cho `nav.menu`).

- [ ] **Step 7: Commit**

```powershell
git add src/components/landing/LandingNav.tsx src/components/landing/LandingNav.test.tsx src/components/landing/landing.module.css src/i18n/dictionaries/landing.ts
git commit -m "feat(landing): hamburger nav at 768px + full accessible names for language buttons"
```

---

## PHASE B — Nội dung: show điểm mạnh platform (ux-2/3/4, cnt-1/2/4, vis-3/4, P2 cnt-3/7/8/9/10, ux-7/8)

### Task B1: Toàn bộ key i18n mới + sửa copy (1 commit cho `landing.ts` + dict test)

**Files:**
- Modify: `src/i18n/dictionaries/landing.ts`
- Test: `src/i18n/dictionaries/landing.test.ts`

- [ ] **Step 1: Viết test fail** — thêm vào `landing.test.ts`:

```ts
  it('covers how-it-works, security and the new grid cards', () => {
    for (let i = 1; i <= 3; i++) {
      expect(landing[`how.s${i}.title`], `how.s${i}.title`).toBeDefined();
      expect(landing[`how.s${i}.desc`], `how.s${i}.desc`).toBeDefined();
    }
    for (let i = 1; i <= 4; i++) {
      expect(landing[`security.b${i}.title`], `security.b${i}.title`).toBeDefined();
      expect(landing[`security.b${i}.desc`], `security.b${i}.desc`).toBeDefined();
    }
    for (const k of ['how.k', 'how.title', 'how.sub', 'security.k', 'security.title',
      'grid.search.title', 'grid.search.desc', 'grid.map.title', 'grid.map.desc', 'hud.demo']) {
      expect(landing[k], k).toBeDefined();
    }
  });
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** — `npx vitest run src/i18n/dictionaries/landing.test.ts`

- [ ] **Step 3: Thêm key mới vào `landing.ts`** (sau khối Secondary grid, trước Footer):

```ts
  // ── How it works ─────────────────────────────────────────────────────
  'how.k': { vi: 'Cách hoạt động', en: 'How it works', zh: '工作原理' },
  'how.title': { vi: 'Chạy trong ba bước', en: 'Up and running in three steps', zh: '三步即可运行' },
  'how.sub': {
    vi: 'Không cần sửa một dòng nào trong agent — LAAM đọc transcript mà Claude Code đã ghi sẵn trên máy bạn.',
    en: 'No changes to your agents — LAAM reads the transcripts Claude Code already writes on your machines.',
    zh: '无需修改任何智能体 —— LAAM 读取 Claude Code 已写好的本机记录。',
  },
  'how.s1.title': { vi: 'Cài collector', en: 'Install the collector', zh: '安装采集器' },
  'how.s1.desc': {
    vi: 'Một file .mjs không phụ thuộc gì chạy trên mỗi máy dev, push transcript về LAAM bằng machine token.',
    en: 'A single zero-dependency .mjs file runs on each dev box and pushes transcripts with a machine token.',
    zh: '一个零依赖的 .mjs 文件在每台开发机上运行，用机器令牌推送记录。',
  },
  'how.s2.title': { vi: 'Đăng nhập', en: 'Sign in', zh: '登录' },
  'how.s2.desc': {
    vi: 'Tài khoản đầu tiên là owner; bốn vai trò RBAC phủ cả đội.',
    en: 'The first account becomes the owner; four RBAC roles cover the whole team.',
    zh: '第一个账号成为所有者；四种 RBAC 角色覆盖整个团队。',
  },
  'how.s3.title': { vi: 'Xem live', en: 'Watch live', zh: '实时查看' },
  'how.s3.desc': {
    vi: 'Trạng thái, thời gian chạy và việc đang làm của từng agent — stream thẳng qua SSE.',
    en: "Every agent's status, runtime and current task — streamed live over SSE.",
    zh: '每个智能体的状态、运行时长和当前任务 —— 通过 SSE 实时推送。',
  },

  // ── Security / trust ─────────────────────────────────────────────────
  'security.k': { vi: 'Riêng tư & an toàn', en: 'Private & safe', zh: '隐私与安全' },
  'security.title': { vi: 'Dữ liệu của bạn ở lại với bạn', en: 'Your data stays yours', zh: '你的数据只属于你' },
  'security.b1.title': { vi: 'Local-first', en: 'Local-first', zh: '本地优先' },
  'security.b1.desc': {
    vi: 'Transcript, hội thoại và số liệu nằm trong Postgres trên phần cứng của bạn — không gửi đi đâu.',
    en: 'Transcripts, chats and metrics live in Postgres on your own hardware — nothing leaves.',
    zh: '记录、对话与指标都存放在你硬件上的 Postgres 中 —— 不外发任何数据。',
  },
  'security.b2.title': { vi: 'Mã hoá theo từng người', en: 'Per-user encryption', zh: '按用户加密' },
  'security.b2.desc': {
    vi: 'Credential connector mã hoá AES-256 riêng cho mỗi người dùng.',
    en: 'Connector credentials are AES-256 encrypted per user.',
    zh: '连接器凭据按用户以 AES-256 加密。',
  },
  'security.b3.title': { vi: 'Write có cổng xác nhận', en: 'Gated writes', zh: '受控写操作' },
  'security.b3.desc': {
    vi: 'Mọi thao tác ghi ra dịch vụ ngoài phải được xác nhận và ghi vào audit log.',
    en: 'Every write to an external service must be confirmed and lands in the audit log.',
    zh: '对外部服务的每次写操作都需确认，并记入审计日志。',
  },
  'security.b4.title': { vi: 'RBAC bốn vai trò', en: 'Four-role RBAC', zh: '四级权限' },
  'security.b4.desc': {
    vi: 'owner / admin / member / viewer trên mọi trang, phiên JWT.',
    en: 'Owner / admin / member / viewer on every page, JWT sessions.',
    zh: '每个页面都有 所有者 / 管理员 / 成员 / 访客，JWT 会话。',
  },
  'stats.cost': { vi: 'Chi phí model', en: 'Model cost', zh: '模型成本' },
  'stats.connectors': { vi: 'Connector', en: 'Connectors', zh: '连接器' },
  'stats.langs': { vi: 'Ngôn ngữ', en: 'Languages', zh: '语言' },
  'stats.roles': { vi: 'Vai trò', en: 'Roles', zh: '角色' },
  'stats.agentchange': { vi: 'Dòng sửa agent', en: 'Agent changes', zh: '智能体改动' },

  // ── HUD ──────────────────────────────────────────────────────────────
  'hud.demo': { vi: 'SỐ LIỆU MINH HOẠ', en: 'ILLUSTRATIVE DATA', zh: '示例数据' },
```

Và trong khối Secondary grid thêm 2 card mới (sau `grid.world.desc`):

```ts
  'grid.search.title': { vi: 'Tìm kiếm toàn văn', en: 'Full-text search', zh: '全文搜索' },
  'grid.search.desc': {
    vi: 'Một ô tìm kiếm xuyên phiên agent, hội thoại chat và workflow.',
    en: 'One search box across agent sessions, chats and workflows.',
    zh: '一个搜索框横跨智能体会话、聊天与工作流。',
  },
  'grid.map.title': { vi: 'Bản đồ & định vị', en: 'Maps & geo tools', zh: '地图与定位' },
  'grid.map.desc': {
    vi: 'Geocode, chỉ đường, tìm quanh đây — trợ lý trả lời kèm bản đồ tương tác.',
    en: 'Geocoding, routing and nearby search — answers come with an interactive map.',
    zh: '地理编码、路线与周边搜索 —— 回答附带交互式地图。',
  },
```

- [ ] **Step 4: Sửa copy hiện có trong `landing.ts`** (ux-4, cnt-7, cnt-4, ux-9 — chỉ đổi giá trị, không đổi key):

(a) `hero.title` / `hero.titleAccent` — chỉ sửa bản **vi** cho tự nhiên:

```ts
  'hero.title': { vi: 'Nhìn đội agent của bạn', en: 'Watch your agents', zh: '看着你的智能体' },
  'hero.titleAccent': { vi: 'vận hành sống động.', en: 'come alive.', zh: '活起来。' },
```

(b) `hero.sub` — thêm zero-instrumentation (cả 3 ngữ):

```ts
  'hero.sub': {
    vi: 'LAAM theo dõi real-time các Claude agent trên mọi máy của bạn — không cần sửa agent, chỉ đọc transcript có sẵn. Kèm trợ lý AI cục bộ, connectors và workflow. Tất cả chạy local, model $0.',
    en: 'LAAM watches the Claude agents on all your machines in real time — no agent changes, it just reads the transcripts they already write. Plus a local AI assistant, connectors and workflows. All local, the model costs $0.',
    zh: 'LAAM 实时监控你所有机器上的 Claude 智能体 —— 无需修改智能体，只读取已有记录。还有本地 AI 助手、连接器和工作流。全部本地运行，模型 $0。',
  },
```

(c) `feat.2.desc` — nêu OCR 3 ngữ:

```ts
  'feat.2.desc': {
    vi: 'Trợ lý đa phương thức chạy trên GPU của bạn — tìm web, OCR ba ngôn ngữ (vie/eng/中文), thị giác và gọi tool. Không hoá đơn cloud.',
    en: 'A multimodal assistant on your own GPU — web search, three-language OCR (vie/eng/中文), vision and tool-calling. No cloud bill.',
    zh: '运行在你自己 GPU 上的多模态助手 —— 网页搜索、三语 OCR（越/英/中）、视觉与工具调用。没有云账单。',
  },
```

(d) `feat.4.desc` — nêu cron + huỷ run (cnt-4):

```ts
  'feat.4.desc': {
    vi: 'Nối agent và connector thành node, chạy theo lịch cron, theo dõi run waterfall và huỷ giữa chừng được.',
    en: 'Chain agents and connectors as nodes, run them on a cron schedule, follow the run waterfall and cancel mid-flight.',
    zh: '将智能体和连接器串联为节点，按 cron 调度运行，跟踪运行瀑布图，可中途取消。',
  },
```

(e) `grid.world.title` bản vi (cnt-7): `{ vi: 'Công cụ thế giới thực', en: 'World tools', zh: '世界工具' }`

- [ ] **Step 5: Chạy test, xác nhận PASS** — `npx vitest run src/i18n ; npx tsc --noEmit`

- [ ] **Step 6: Commit**

```powershell
git add src/i18n/dictionaries/landing.ts src/i18n/dictionaries/landing.test.ts
git commit -m "feat(landing): i18n copy — how-it-works + security sections, search/map cards, zero-instrumentation pitch, copy fixes (vi/en/zh)"
```

### Task B2: Section "Cách hoạt động" thật + trả anchor #how về đúng chỗ

**Files:**
- Create: `src/components/landing/HowItWorks.tsx`
- Create: `src/components/landing/HowItWorks.test.tsx`
- Modify: `src/components/landing/FeatureGrid.tsx:12` (id `how` → `more`)
- Modify: `src/components/landing/Landing.tsx` (chèn section)
- Modify: `src/components/landing/landing.module.css` (style `.howGrid`/`.howStep`/`.howTitle`)

- [ ] **Step 1: Viết test fail** — `HowItWorks.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { HowItWorks } from './HowItWorks';

describe('HowItWorks', () => {
  it('renders three steps under the #how anchor', () => {
    render(
      <I18nProvider lang="en">
        <HowItWorks />
      </I18nProvider>,
    );
    expect(document.getElementById('how')).not.toBeNull();
    expect(screen.getByText('Install the collector')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('Watch live')).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL** (module không tồn tại).

- [ ] **Step 3: Tạo `HowItWorks.tsx`:**

```tsx
'use client';

import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';

const STEPS = ['s1', 's2', 's3'] as const;

// The REAL "how it works" section (the #how anchor used to point at the
// secondary feature grid — landing-eval ux-2/cnt-1). Three steps mirroring the
// actual pipeline: collector → sign-in/RBAC → live SSE dashboard.
export function HowItWorks() {
  const t = useT(landing);
  return (
    <section id="how" className={styles.section}>
      <div className={styles.wrap}>
        <div className={styles.secHead}>
          <div className={styles.secK}>{t('how.k')}</div>
          <h2 className={styles.secTitle}>{t('how.title')}</h2>
          <p className={styles.secSub}>{t('how.sub')}</p>
        </div>
        <ol className={styles.howGrid}>
          {STEPS.map((s, i) => (
            <li key={s} className={styles.howStep}>
              <span className={styles.hudNum} aria-hidden="true">{i + 1}</span>
              <h3 className={styles.howTitle}>{t(`how.${s}.title`)}</h3>
              <p className={styles.fcardDesc}>{t(`how.${s}.desc`)}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: CSS — thêm sau khối Secondary depth-card grid:**

```css
/* ── How it works ───────────────────────────────────────────────────────── */
.howGrid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.howStep { background: var(--card); border: 1px solid var(--card-edge); border-radius: 18px; padding: 26px 24px; }
.howTitle { font-size: 1.15rem; font-weight: 550; margin: 12px 0 8px; letter-spacing: -0.01em; }
@media (max-width: 768px) { .howGrid { grid-template-columns: 1fr; } }
```

- [ ] **Step 5: `FeatureGrid.tsx` dòng 12:** `<section id="more" className={styles.section}>` — và `Landing.tsx` chèn `<HowItWorks />` giữa `<MechShowcase />` và `<FeatureGrid />` (kèm import).

- [ ] **Step 6: Chạy test, xác nhận PASS** — `npx vitest run src/components/landing`

- [ ] **Step 7: Commit**

```powershell
git add src/components/landing/HowItWorks.tsx src/components/landing/HowItWorks.test.tsx src/components/landing/FeatureGrid.tsx src/components/landing/Landing.tsx src/components/landing/landing.module.css
git commit -m "feat(landing): real How-it-works section owns the #how anchor (3-step pipeline)"
```

### Task B3: Section Security + dải số liệu "by the numbers"

**Files:**
- Create: `src/components/landing/SecuritySection.tsx`
- Create: `src/components/landing/SecuritySection.test.tsx`
- Modify: `src/components/landing/Landing.tsx` (chèn giữa HowItWorks và FeatureGrid)
- Modify: `src/components/landing/landing.module.css` (`.statsRow`, `.grid4`)

- [ ] **Step 1: Viết test fail** — `SecuritySection.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { SecuritySection } from './SecuritySection';

describe('SecuritySection', () => {
  it('renders the four trust bullets and the stats strip', () => {
    render(
      <I18nProvider lang="en">
        <SecuritySection />
      </I18nProvider>,
    );
    for (const title of ['Local-first', 'Per-user encryption', 'Gated writes', 'Four-role RBAC']) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
    expect(screen.getByText('$0')).toBeInTheDocument(); // model cost stat
    expect(screen.getByText('Agent changes')).toBeInTheDocument(); // the "0 changes" differentiator
  });
});
```

- [ ] **Step 2: Chạy test, xác nhận FAIL.**

- [ ] **Step 3: Tạo `SecuritySection.tsx`** (tái dùng `FeatureCard` — `security.bN` có đúng shape `keyPrefix.title/desc`):

```tsx
'use client';

import { ShieldCheck, Lock, FileCheck2, Users } from 'lucide-react';
import styles from './landing.module.css';
import { useT } from '@/i18n/provider';
import { landing } from '@/i18n/dictionaries/landing';
import { FeatureCard } from './FeatureCard';
import type { GridFeature } from './features';

// Trust section (landing-eval cnt-5): local-first privacy pitch + a compact
// "by the numbers" strip. Values are facts, not live data — safe on a public page.
const BULLETS: GridFeature[] = [
  { id: 'sec-local', icon: ShieldCheck, keyPrefix: 'security.b1' },
  { id: 'sec-crypto', icon: Lock, keyPrefix: 'security.b2' },
  { id: 'sec-writes', icon: FileCheck2, keyPrefix: 'security.b3' },
  { id: 'sec-rbac', icon: Users, keyPrefix: 'security.b4' },
];

const STATS = [
  { labelKey: 'stats.cost', value: '$0' },
  { labelKey: 'stats.connectors', value: '6' },
  { labelKey: 'stats.langs', value: '3' },
  { labelKey: 'stats.roles', value: '4' },
  { labelKey: 'stats.agentchange', value: '0' },
] as const;

export function SecuritySection() {
  const t = useT(landing);
  return (
    <section id="security" className={styles.section}>
      <div className={styles.wrap}>
        <div className={styles.secHead}>
          <div className={styles.secK}>{t('security.k')}</div>
          <h2 className={styles.secTitle}>{t('security.title')}</h2>
        </div>
        <div className={styles.statsRow}>
          {STATS.map((s) => (
            <div key={s.labelKey} className={styles.stat}>
              <div className={styles.statK}>{t(s.labelKey)}</div>
              <div className={styles.statV}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className={styles.grid4}>
          {BULLETS.map((b) => (
            <FeatureCard key={b.id} feature={b} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: CSS:**

```css
/* ── Security / stats strip ─────────────────────────────────────────────── */
.statsRow { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; max-width: 760px; margin: 0 auto 40px; }
.grid4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 22px; perspective: 1300px; }
@media (max-width: 1024px) { .grid4 { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 640px) {
  .grid4 { grid-template-columns: 1fr; }
  .statsRow { grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); }
}
```

- [ ] **Step 5: `Landing.tsx`** — thứ tự cuối: `Hero → MechShowcase → HowItWorks → SecuritySection → FeatureGrid → Footer`.

- [ ] **Step 6: Test PASS + commit**

Run: `npx vitest run src/components/landing`

```powershell
git add src/components/landing/SecuritySection.tsx src/components/landing/SecuritySection.test.tsx src/components/landing/Landing.tsx src/components/landing/landing.module.css
git commit -m "feat(landing): security/trust section + by-the-numbers strip"
```

### Task B4: features.ts trung thực + HudPanel (memo, badge minh hoạ, ảnh thật, search/map cards, pacing)

**Files:**
- Modify: `src/components/landing/features.ts`
- Modify: `src/components/landing/HudPanel.tsx`
- Modify: `src/components/landing/landing.module.css` (`.demoNote`, `.shotImg`)
- Test: `src/components/landing/HudPanel.test.tsx` (bổ sung)

- [ ] **Step 1: Sửa `features.ts`:**

(a) `CoreFeature` thêm 2 field tuỳ chọn (sau `revealAt`):

```ts
  /** Static demo numbers that LOOK live (landing-eval cnt-2) get a small label. */
  illustrative?: boolean;
  /** Real product screenshot under /public (falls back to the stylized frame). */
  shot?: string;
```

(b) Entry `monitoring`: thêm `illustrative: true,`.
(c) Entry `connectors` (cnt-3 — 6 dịch vụ thật, demo connector không phải selling point): `status: '6 LINKED'`, telemetry t1 value `'6'`, gauge `{ value: 100, label: '6/6' }`.
(d) Entry `chat` (cnt-8 — không hardcode tên model): telemetry t1 value `'qwen3-vl'` → `'VLM 8B'`.
(e) Pacing (ux-5): `revealAt` 6 entry đổi thành `0.10 / 0.18 / 0.32 / 0.46 / 0.60 / 0.72`.
(f) `GRID_FEATURES` thêm 2 card (import `Search`, `MapPin` từ lucide-react):

```ts
  { id: 'search', icon: Search, keyPrefix: 'grid.search' },
  { id: 'map', icon: MapPin, keyPrefix: 'grid.map' },
```

(g) `.explode` trong `landing.module.css`: `height: 380vh` → `height: 280vh` (cùng finding ux-5).

- [ ] **Step 2: Sửa `HudPanel.tsx`** — memo (perf-5), badge minh hoạ, ảnh thật (vis-3):

```tsx
'use client';

import { memo, type CSSProperties } from 'react';
import Image from 'next/image';
import styles from './landing.module.css';
import type { CoreFeature } from './features';
import type { Translator } from '@/i18n/types';

// Sci-fi HUD feature panel (no corner reticle brackets, per design feedback):
// angular clip-path frame, MOD header, feature screenshot (real image when
// `feature.shot` is provided, stylized frame otherwise), telemetry row,
// description, mono tags, conic gauge. Pure presentation — `t` is passed in.
// Memoized: MechShowcase re-renders on every quantized scroll step (perf-5).
export const HudPanel = memo(function HudPanel({ feature, t }: { feature: CoreFeature; t: Translator }) {
  const Icon = feature.icon;
  return (
    <div className={styles.hudFrame}>
      <div className={styles.hud}>
        <div className={styles.ticks} aria-hidden="true" />

        <div className={styles.hudHead}>
          <span className={styles.modid}>{feature.modId}</span>
          <span className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            {feature.status}
          </span>
        </div>

        <div className={styles.hudTitle}>
          <span className={styles.hudNum}>{feature.num}</span>
          <h3>{t(`${feature.keyPrefix}.title`)}</h3>
        </div>

        <div className={styles.shot} aria-hidden="true">
          <div className={styles.shotTop}>
            <span className={styles.shotDot} />
            <span className={styles.shotDot} />
            <span className={styles.shotDot} />
            <span className={styles.shotPath}>laam // {feature.id}</span>
          </div>
          {feature.shot ? (
            <Image src={feature.shot} alt="" fill sizes="340px" className={styles.shotImg} />
          ) : (
            <>
              <div className={styles.scanline} />
              <div className={styles.shotGrid} />
              <div className={styles.shotIco}>
                <Icon size={40} strokeWidth={1.4} />
              </div>
            </>
          )}
        </div>

        <div className={styles.telem}>
          {feature.telemetry.map((tel) => (
            <div key={tel.labelKey} className={styles.stat}>
              <div className={styles.statK}>{t(tel.labelKey)}</div>
              <div className={styles.statV}>{tel.value}</div>
            </div>
          ))}
        </div>
        {feature.illustrative && <div className={styles.demoNote}>{t('hud.demo')}</div>}

        <p className={styles.desc}>{t(`${feature.keyPrefix}.desc`)}</p>

        <div className={styles.foot}>
          {feature.tags.map((tag) => (
            <span key={tag} className={styles.tag}>{tag}</span>
          ))}
          <div className={styles.gaugeWrap}>
            <div className={styles.gauge} style={{ '--g': feature.gauge.value } as CSSProperties} />
            <span className={styles.gaugeLabel}>{feature.gauge.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
});
```

CSS thêm (gần `.telem`):

```css
.shotImg { object-fit: cover; object-position: top left; margin-top: 20px; }
.demoNote { margin: -4px 4px 8px 10px; font-size: 9px; letter-spacing: 0.14em; color: var(--muted); font-family: monospace; }
```

- [ ] **Step 3: Bổ sung test `HudPanel.test.tsx`** (giữ test cũ, thêm):

```tsx
  it('labels illustrative telemetry', () => {
    // CORE_FEATURES[0] = monitoring, the only panel with fake-looking live numbers
    render(
      <I18nProvider lang="en">
        <HudPanel feature={CORE_FEATURES[0]} t={tEn} />
      </I18nProvider>,
    );
    expect(screen.getByText('ILLUSTRATIVE DATA')).toBeInTheDocument();
  });
```

(Điều chỉnh import/cách lấy `t` theo cấu trúc test hiện có trong file — file test này đã render HudPanel sẵn, làm theo cùng pattern.)

- [ ] **Step 4: Ảnh thật (điều kiện):** NẾU dev server :3100 đang chạy và đăng nhập được → chụp + crop 2 ảnh `public/landing/shot-dashboard.png`, `public/landing/shot-chat.png` (~680×232, tỉ lệ khung .shot 340×116 @2x, che dữ liệu nhạy cảm), set `shot: '/landing/shot-dashboard.png'` cho `monitoring` và `shot: '/landing/shot-chat.png'` cho `chat` trong `features.ts`. NẾU KHÔNG có server/asset → bỏ qua bước này (khung stylized vẫn render), ghi vào checkpoint là việc còn lại.

- [ ] **Step 5: Test + commit**

Run: `npx vitest run src/components/landing ; npx tsc --noEmit`

```powershell
git add src/components/landing/features.ts src/components/landing/HudPanel.tsx src/components/landing/HudPanel.test.tsx src/components/landing/landing.module.css
git commit -m "feat(landing): honest HUD — illustrative badge, 6-connector truth, durable model label, real-shot support, faster reveal pacing"
```

(Nếu Step 4 làm: `git add public/landing` vào cùng commit.)

### Task B5: Hero/Footer auth-aware CTA

**Files:**
- Modify: `src/components/landing/Landing.tsx`, `Hero.tsx`, `Footer.tsx`
- Test: `src/components/landing/Hero.test.tsx`, tạo `src/components/landing/Footer.test.tsx`

- [ ] **Step 1: Test fail** — `Hero.test.tsx` thay bằng:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import { Hero } from './Hero';

const ui = (authed: boolean) => (
  <I18nProvider lang="en">
    <Hero isAuthed={authed} />
  </I18nProvider>
);

describe('Hero', () => {
  it('renders the headline and both CTAs when logged out', () => {
    render(ui(false));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('Get started')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
  });

  it('routes an authed user straight to the dashboard', () => {
    render(ui(true));
    const cta = screen.getByText('Go to dashboard');
    expect(cta).toHaveAttribute('href', '/dashboard');
    expect(screen.queryByText('Get started')).toBeNull();
  });
});
```

`Footer.test.tsx` (mới) — cùng pattern, assert `Get started` (logged out) vs `Go to dashboard` (authed).

- [ ] **Step 2: Run FAIL** — `npx vitest run src/components/landing/Hero.test.tsx`

- [ ] **Step 3: Implement** — `Hero({ isAuthed }: { isAuthed: boolean })`, khối `.heroCtas` thành:

```tsx
      <div className={styles.heroCtas}>
        {isAuthed ? (
          <a href="/dashboard" className={styles.btnPrimary}>{t('nav.dashboard')}</a>
        ) : (
          <>
            <a href="/register" className={styles.btnPrimary}>{t('hero.ctaPrimary')}</a>
            <a href="/login" className={styles.btnGhost}>{t('hero.ctaSecondary')}</a>
          </>
        )}
      </div>
```

Footer tương tự với `footer.cta`. `Landing.tsx` truyền `isAuthed` xuống cả hai: `<Hero isAuthed={isAuthed} />`, `<Footer isAuthed={isAuthed} />`.

- [ ] **Step 4: PASS + commit**

```powershell
git add src/components/landing/Hero.tsx src/components/landing/Footer.tsx src/components/landing/Landing.tsx src/components/landing/Hero.test.tsx src/components/landing/Footer.test.tsx
git commit -m "feat(landing): auth-aware CTAs in hero and footer (ux-8)"
```

### Task B6: Metadata marketing + mở zoom riêng landing

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/components/no-zoom.tsx`

- [ ] **Step 1: `page.tsx`** — thêm trên component:

```tsx
import type { Metadata, Viewport } from "next";

// Public marketing page: real description for crawlers/share cards (cnt-9)…
export const metadata: Metadata = {
  title: "LAAM — Giám sát Claude agent local-first · chat AI $0 · workflow",
  description:
    "Theo dõi real-time các Claude agent trên mọi máy dev — không cần sửa agent. Trợ lý AI chạy local $0, connectors mã hoá per-user, workflow tự động hoá. Tất cả trên phần cứng của bạn.",
};
// …and unlike the app shell, pinch zoom STAYS available here (WCAG 1.4.4).
// The app-wide zoom lock (layout.tsx + NoZoom) is a deliberate app-like-feel
// decision and is NOT changed by this route-level override.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};
```

- [ ] **Step 2: `no-zoom.tsx`** — bỏ qua landing:

```tsx
import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function NoZoom() {
  const pathname = usePathname();
  useEffect(() => {
    // Public landing keeps pinch zoom (WCAG 1.4.4); the zoom lock is for the app shell.
    if (pathname === "/") return;
    const prevent = (e: Event) => e.preventDefault();
    const opts = { passive: false } as const;
    document.addEventListener("gesturestart", prevent, opts);
    document.addEventListener("gesturechange", prevent, opts);
    document.addEventListener("gestureend", prevent, opts);
    return () => {
      document.removeEventListener("gesturestart", prevent);
      document.removeEventListener("gesturechange", prevent);
      document.removeEventListener("gestureend", prevent);
    };
  }, [pathname]);
  return null;
}
```

- [ ] **Step 3: Verify + commit** — `npx tsc --noEmit ; npx vitest run src/components`

```powershell
git add src/app/page.tsx src/components/no-zoom.tsx
git commit -m "feat(landing): marketing metadata + allow pinch zoom on the public landing only"
```

### Task B7: robots.txt hợp lệ (Lighthouse SEO fail — 307 → /login)

**Files:**
- Create: `src/app/robots.ts`
- Modify: `src/auth.config.ts:18-26` (isPublic)
- Test: `src/auth.config.test.ts` (bổ sung)

- [ ] **Step 1: Test fail** — thêm case vào `auth.config.test.ts` theo đúng pattern case `'/'` public sẵn có trong file, với pathname `/robots.txt`, expect public (authorized → true khi chưa đăng nhập).

- [ ] **Step 2: Run FAIL.**

- [ ] **Step 3: `src/app/robots.ts`:**

```ts
import type { MetadataRoute } from "next";

// Internal tool: only the public landing is crawlable. Everything else is
// auth-gated and would otherwise serve crawlers a 307 → /login (invalid
// robots.txt per Lighthouse).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/dashboard", "/agents", "/chat", "/connectors", "/graph", "/machines", "/workflows", "/search", "/login", "/register"] }],
  };
}
```

- [ ] **Step 4: `auth.config.ts`** — thêm vào isPublic (sau dòng `p === "/"`):

```ts
        p === "/robots.txt" || // metadata route must be reachable by crawlers
```

- [ ] **Step 5: PASS + commit**

```powershell
git add src/app/robots.ts src/auth.config.ts src/auth.config.test.ts
git commit -m "fix(seo): serve a real robots.txt instead of a 307 to /login"
```

---

## PHASE C — A11y + Performance (a11y-2/3/4, perf-2/3/5, rsp-8)

### Task C1: `<html lang>` cập nhật khi đổi ngôn ngữ (lỗi TOÀN APP — WCAG 3.1.1)

**Files:**
- Modify: `src/i18n/provider.tsx:17-20`
- Test: `src/i18n/provider.test.tsx` (bổ sung)

- [ ] **Step 1: Test fail** — thêm vào `provider.test.tsx` (probe tự chứa, theo import pattern sẵn có của file):

```tsx
function LangProbe() {
  const { setLang } = useLang();
  return <button onClick={() => setLang('zh')}>switch</button>;
}

  it('updates <html lang> when the language changes (WCAG 3.1.1)', () => {
    document.documentElement.lang = 'vi';
    render(
      <I18nProvider lang="vi">
        <LangProbe />
      </I18nProvider>,
    );
    fireEvent.click(screen.getByText('switch'));
    expect(document.documentElement.lang).toBe('zh');
  });
```

- [ ] **Step 2: Run FAIL.**

- [ ] **Step 3: `provider.tsx`** — trong `setLang`:

```tsx
  const setLang = useCallback((l: Lang) => {
    setActive(l);
    writeLangCookie(l);
    // Keep the SSR-set <html lang> in sync so screen readers switch voices (WCAG 3.1.1).
    if (typeof document !== "undefined") document.documentElement.lang = l;
  }, []);
```

- [ ] **Step 4: PASS + commit** — `npx vitest run src/i18n`

```powershell
git add src/i18n/provider.tsx src/i18n/provider.test.tsx
git commit -m "fix(i18n): sync <html lang> on client language switch (WCAG 3.1.1, app-wide)"
```

### Task C2: Contrast --faint + micro-type + aria canvas 3D

**Files:**
- Modify: `src/components/landing/landing.module.css`
- Modify: `src/components/landing/MechShowcase.tsx:104`

- [ ] **Step 1:** `landing.module.css` dòng 9: `--faint: rgba(232, 241, 251, 0.42)` → `rgba(232, 241, 251, 0.58)` (3.70:1 → ≈5.1:1, pass AA; Lighthouse + a11y-2 đều fail ở `.prog`/`.footerNote`). `.statK` (dòng 151) `font-size: 9px` → `10px`.

- [ ] **Step 2:** `MechShowcase.tsx` dòng 104 — canvas 3D là trang trí (6 HudPanel là text alternative):

```tsx
          <div className={styles.stageWrap} aria-hidden="true">
```

- [ ] **Step 3: Verify + commit** — `npx vitest run src/components/landing ; npx tsc --noEmit`

```powershell
git add src/components/landing/landing.module.css src/components/landing/MechShowcase.tsx
git commit -m "fix(landing): a11y — faint tier passes AA contrast, 10px telemetry labels, decorative 3D stage"
```

### Task C3: Animation compositor-only + pause scanline panel ẩn

**Files:**
- Modify: `src/components/landing/landing.module.css`

**Lưu ý xung đột đã chốt (Rule 7):** KHÔNG dùng `visibility:hidden` cho `.coHidden` dù tốt cho perf — nó loại panel khỏi accessibility tree, phá điểm mạnh "SR đọc đủ 6 panel không phụ thuộc scroll" (a11y-strength). Chọn `animation-play-state: paused`.

- [ ] **Step 1:** Thay `.scanline` + `@keyframes scan` (dòng 145-146):

```css
.scanline { position: absolute; left: 0; right: 0; height: 50%; top: 0; transform: translateY(-100%); background: linear-gradient(180deg, transparent, rgba(127, 224, 255, 0.14), transparent); animation: scan 3.4s linear infinite; }
@keyframes scan { to { transform: translateY(300%); } }
/* Panels not yet revealed don't pay layout/paint for a scanline nobody sees (perf-2). */
.coHidden .scanline { animation-play-state: paused; }
```

Thay `.scrollBar::after` + `@keyframes cue` (dòng 108-109):

```css
.scrollBar::after { content: ""; position: absolute; top: 0; left: 0; width: 100%; height: 50%; transform: translateY(-100%); background: linear-gradient(180deg, transparent, #bfe3ff); animation: cue 2.2s ease-in-out infinite; }
@keyframes cue { 0% { transform: translateY(-100%); } 60%, 100% { transform: translateY(200%); } }
```

- [ ] **Step 2: Verify + commit** — `npx vitest run src/components/landing`

```powershell
git add src/components/landing/landing.module.css
git commit -m "perf(landing): scanline/scroll-cue animate transform instead of top; hidden panels pause"
```

### Task C4: Dot-field — sprite cache + resize giữ hạt khi chỉ đổi height

**Files:**
- Modify: `src/components/landing/useDotField.ts`

- [ ] **Step 1: Mở rộng interface `P`** (perf-3 — bỏ cấp phát gradient per-frame):

```ts
interface P {
  k: 's' | 'm' | 'b';
  d: number; r: number; h: number; s: number; l: number; a: number; tb: number; ta: number;
  x: number; y: number; vx: number; vy: number; sa: number; sp: number; ss: number; tp: number; ts: number;
  /** Pre-rendered sprite (gradients baked once — perf-3) + its draw radius. */
  spr: HTMLCanvasElement | null; sprR: number;
}
```

- [ ] **Step 2: Thêm builder sprite** (sau `color`, trước `mk`):

```ts
    // Bake each particle's gradients into an offscreen sprite ONCE; per-frame
    // drawing becomes drawImage + globalAlpha (was: 1-2 createRadialGradient
    // per particle per frame ≈ >10k allocations/s — perf-3). Bokeh ('b') render
    // at quarter resolution: they are out-of-focus blobs, upscaling is free blur.
    const sprite = (p: Omit<P, 'spr' | 'sprR'>): { spr: HTMLCanvasElement | null; sprR: number } => {
      const sprR = p.k === 's' ? p.r * 4.4 : p.r;
      const down = p.k === 'b' ? 4 : 1;
      const size = Math.max(2, Math.ceil((sprR * 2) / down));
      const cv = document.createElement('canvas');
      cv.width = cv.height = size;
      const g2 = cv.getContext('2d');
      if (!g2) return { spr: null, sprR };
      const cx = size / 2, r = sprR / down;
      const col = (al: number) => `hsla(${p.h},${p.s}%,${p.l}%,${al})`;
      const blob = (radius: number, stops: [number, string][]) => {
        const g = g2.createRadialGradient(cx, cx, 0, cx, cx, radius);
        for (const [o, c2] of stops) g.addColorStop(o, c2);
        g2.fillStyle = g; g2.beginPath(); g2.arc(cx, cx, radius, 0, 6.28); g2.fill();
      };
      if (p.k === 's') {
        blob(r, [[0, col(0.42)], [0.4, col(0.12)], [1, col(0)]]); // halo
        blob(p.r / down, [[0, col(1)], [0.5, col(0.6)], [1, col(0)]]); // core
      } else if (p.k === 'm') {
        blob(r, [[0, col(0.9)], [0.5, col(0.34)], [1, col(0)]]);
      } else {
        blob(r, [[0, col(0.55)], [0.62, col(0.42)], [0.9, col(0.64)], [1, col(0)]]);
      }
      return { spr: cv, sprR };
    };
```

Cuối `mk()`: build phần base rồi `return { ...base, ...sprite(base) };` (refactor: gán object literal hiện tại vào `const base` trước).

- [ ] **Step 3: Thay `draw()`:**

```ts
    const draw = (p: P, t: number) => {
      if (!p.spr) return;
      const tw = p.tb + p.ta * Math.sin(t * p.ts + p.tp);
      const a = p.a * tw * alpha;
      if (a <= 0.002) return;
      const px = p.x + (m.x - 0.5) * 70 * DPR * p.d;
      const py = p.y + (m.y - 0.5) * 50 * DPR * p.d + Math.sin(t * p.ss + p.sp) * p.sa;
      c.globalAlpha = Math.min(1, p.k === 's' ? a * 1.3 : a);
      c.drawImage(p.spr, px - p.sprR, py - p.sprR, p.sprR * 2, p.sprR * 2);
    };
```

Trong `frame()` sau vòng for: `c.globalAlpha = 1;`

- [ ] **Step 4: Resize giữ hạt khi chỉ đổi height** (rsp-8 — URL bar mobile):

```ts
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(() => {
        const newW = Math.floor(innerWidth * Math.min(devicePixelRatio || 1, 2));
        if (newW !== W) { resize(); return; }
        // Height-only resize (mobile URL bar collapse): keep the particle field,
        // just resize the bitmap — a full rebuild re-randomizes mid-scroll.
        DPR = Math.min(devicePixelRatio || 1, 2);
        H = canvas.height = Math.floor(innerHeight * DPR);
        canvas.style.height = innerHeight + 'px';
        if (reduce) { c.globalCompositeOperation = 'lighter'; for (const p of ps) draw(p, 0); c.globalAlpha = 1; }
      }, 150);
    };
```

- [ ] **Step 5: Verify + commit** — `npx vitest run src/components/landing ; npx tsc --noEmit` (jsdom: `getContext('2d')` của sprite trả null → `spr: null` → draw() no-op, an toàn như cũ).

```powershell
git add src/components/landing/useDotField.ts
git commit -m "perf(landing): dot-field sprites baked once (no per-frame gradient allocs); height-only resize keeps the field"
```

---

## PHASE D — Verify tổng + bàn giao

### Task D1: Verify toàn cục

- [ ] **Step 1:** `npx vitest run` (FULL suite) — Expected: toàn bộ PASS (baseline 1470 + test mới).
- [ ] **Step 2:** `npx tsc --noEmit` — exit 0.
- [ ] **Step 3 (chỉ khi dev :3100 của user đang chạy — KHÔNG tự khởi động):** re-chụp screenshot 390×844 / 768×1024 / 1440×900 các mốc hero / mech / how / security / grid / footer bằng chrome-devtools MCP, so với bộ ảnh baseline trong `D:\Projects\personal_projects\LAAM\.claude\tmp\landing-eval-shots\`. Tiêu chí: không panel chồng đè ở mọi viewport; hamburger hoạt động; nút không wrap; #how ra section 3 bước.
- [ ] **Step 4:** Chạy lại Lighthouse (mobile) trên trang landing — Expected: A11y ≥ 95 (hết color-contrast; meta-viewport landing đã mở zoom), SEO hết lỗi robots.

### Task D2: Hoàn tất branch

- [ ] **Step 1:** Dùng skill `superpowers:finishing-a-development-branch` — trình user lựa chọn merge `feat/landing-improvements` → main (KHÔNG tự merge: checkout dùng chung, user quyết).
- [ ] **Step 2:** Checkpoint `.serena/checkpoint/<agent>-<date>.md` + cập nhật `.serena/memories/backlog/landing-improvements.md` (đánh dấu mục đã xong / việc còn lại: ảnh thật nếu chưa chụp, quyết định zoom toàn app).

---

## Self-review đã chạy

- **Coverage:** mọi finding P0/P1 confirmed đều có task (ux-1→A1, ux-2/cnt-1→B2, ux-3→B2+B4, ux-4→B1, ux-5→B4(e,g), ux-6/rsp-2→A3, rsp-3→A2, rsp-4→A2, vis-2→A2(g), vis-3/cnt-6→B4, vis-4→B3, a11y-1→A1, a11y-2→C2, a11y-3→C1, cnt-2→B4, cnt-4→B1+B4, perf-2→C3, perf-3→C4). P2 nhận: cnt-3/7/8/9/10, ux-7 (#stack giữ — đã có section how nên nav bớt sai; đổi nhãn nếu user muốn), ux-8→B5, rsp-7/9/10→A2, a11y-4/5→C2+A3, perf-5→B4, rsp-8→C4. P2 từ chối có lý do ở mục "Không làm".
- **Type consistency:** `GridFeature` shape tái dùng cho security bullets (id/icon/keyPrefix — khớp `features.ts:93-98`); `CoreFeature.illustrative/shot` optional nên `CORE_FEATURES` cũ không phải sửa đồng loạt; `HudPanel` named export giữ nguyên tên (`memo` bọc, import site không đổi).
- **Placeholder scan:** Task B4 Step 3 yêu cầu đọc pattern file test hiện có (file đã tồn tại, executor đọc tại chỗ) — chấp nhận; B7 Step 1 tương tự (auth.config.test.ts có sẵn case `/`). Còn lại code đầy đủ.
