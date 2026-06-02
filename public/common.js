// LAAM — shared client utilities used by every page (dashboard, agents, graph).
// Exposes a small `LAAM` global: formatting helpers, the top navigation bar,
// theme handling, and a single SSE subscription helper.
(function () {
  const esc = (s) =>
    s == null ? '' : String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function fmtDur(ms) {
    if (ms == null || ms < 0) return '—';
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${sec}s`;
    return `${sec}s`;
  }

  function ago(ts) {
    if (!ts) return '—';
    const d = Date.now() - ts;
    if (d < 60000) return 'vừa xong';
    if (d < 3600000) return `${Math.floor(d / 60000)} phút trước`;
    if (d < 86400000) return `${Math.floor(d / 3600000)} giờ trước`;
    return `${Math.floor(d / 86400000)} ngày trước`;
  }

  function fmtNum(n) {
    if (n == null) return '0';
    if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(n);
  }

  // Shorten a long model id like "claude-opus-4-8[1m]" for compact display.
  function shortModel(m) {
    if (!m) return 'unknown';
    return m.replace(/^claude-/, '').replace(/-20\d{6}$/, '');
  }

  const STATUS_VI = { running: 'Đang chạy', idle: 'Tạm dừng', done: 'Hoàn tất' };

  // ---- Theme ----
  const sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>';
  const moon = '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>';
  function applyTheme(t) {
    document.documentElement.dataset.theme = t;
    const icon = document.querySelector('#theme-icon');
    if (icon) icon.innerHTML = t === 'dark' ? sun : moon;
    localStorage.setItem('laam.theme', t);
    window.dispatchEvent(new CustomEvent('laam:theme', { detail: t }));
  }
  function initTheme() {
    applyTheme(localStorage.getItem('laam.theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
  }

  // Read a resolved CSS custom property (so charts match the active theme).
  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // ---- Top navigation ----
  const NAV = [
    { href: '/', label: 'Dashboard', match: (p) => p === '/' || p === '/index.html' },
    { href: '/agents', label: 'Agents', match: (p) => p.startsWith('/agents') || p.startsWith('/session') },
    { href: '/graph', label: 'Graph', match: (p) => p.startsWith('/graph') },
    { href: '/search', label: 'Search', match: (p) => p.startsWith('/search') },
    { href: '/chat', label: 'Chat', match: (p) => p.startsWith('/chat') },
  ];

  // Inject the shared header into <header id="topbar">. `extra` is optional
  // HTML placed between the nav and the connection indicator (e.g. search).
  // `opts.conn` (default true) controls the live-connection indicator — pass
  // false on static pages that don't open an SSE stream.
  function buildHeader(extra, opts = {}) {
    const bar = document.querySelector('#topbar');
    if (!bar) return;
    const showConn = opts.conn !== false;
    const p = location.pathname;
    const links = NAV.map(
      (n) => `<a class="navlink ${n.match(p) ? 'active' : ''}" href="${n.href}">${n.label}</a>`
    ).join('');
    bar.innerHTML = `
      <a class="brand" href="/">
        <div class="logo">L</div>
        <div>
          <h1>LAAM</h1>
          <div class="sub">Local AI Agent Monitoring</div>
        </div>
      </a>
      <nav class="nav">${links}</nav>
      <div class="spacer"></div>
      ${extra || ''}
      ${showConn ? '<div class="conn" id="conn"><span class="dot"></span><span id="conn-label">Đang kết nối…</span></div>' : ''}
      <button class="iconbtn" id="theme" title="Đổi theme">
        <svg id="theme-icon" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"></svg>
      </button>`;
    const icon = document.querySelector('#theme-icon');
    if (icon) icon.innerHTML = document.documentElement.dataset.theme === 'dark' ? sun : moon;
    document.querySelector('#theme').onclick = () =>
      applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  }

  function setConn(live) {
    const c = document.querySelector('#conn');
    if (!c) return;
    c.classList.toggle('live', live);
    const lbl = document.querySelector('#conn-label');
    if (lbl) lbl.textContent = live ? 'Trực tiếp' : 'Mất kết nối';
  }

  // Subscribe to the live snapshot stream. `onSnapshot(data)` fires on connect
  // and on every server broadcast.
  function connectSSE(onSnapshot) {
    const es = new EventSource('/api/events');
    es.addEventListener('snapshot', (e) => {
      setConn(true);
      try { onSnapshot(JSON.parse(e.data)); } catch {}
    });
    es.onopen = () => setConn(true);
    es.onerror = () => setConn(false);
    return es;
  }

  // ---- Browser notifications (stuck-agent alerts) ----
  // Asks permission lazily; throttles repeats per key so we don't spam.
  const notified = new Map();
  function notify(key, title, body, { throttleMs = 5 * 60 * 1000 } = {}) {
    if (!('Notification' in window)) return;
    const last = notified.get(key) || 0;
    if (Date.now() - last < throttleMs) return;
    const fire = () => {
      try { new Notification(title, { body, tag: key }); notified.set(key, Date.now()); } catch {}
    };
    if (Notification.permission === 'granted') fire();
    else if (Notification.permission !== 'denied') Notification.requestPermission().then((p) => { if (p === 'granted') fire(); });
  }
  function ensureNotifyPermission() {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  }

  // ---- Runtime config (stuck threshold) ----
  let _config = { stuckThresholdMin: 10 };
  let _configP = null;
  function loadConfig() {
    if (!_configP) {
      _configP = fetch('/api/config').then((r) => r.json()).then((c) => { _config = c; return c; }).catch(() => _config);
    }
    return _configP;
  }
  function getConfig() { return _config; }

  // A session is "stuck" if it isn't done yet but hasn't written its transcript
  // for longer than the configured threshold.
  function isStuck(s, thresholdMin = _config.stuckThresholdMin, now = Date.now()) {
    if (!s || s.status === 'done') return false;
    if (!s.lastActivity) return false;
    return now - s.lastActivity > thresholdMin * 60 * 1000;
  }

  // USD cost formatting helper, shared by dashboard + cards.
  function fmtUSD(n) {
    if (n == null) return '$0';
    if (n < 0.01 && n > 0) return '<$0.01';
    if (n < 1) return '$' + n.toFixed(2);
    if (n < 1000) return '$' + n.toFixed(2);
    return '$' + fmtNum(Math.round(n));
  }

  window.LAAM = {
    esc, fmtDur, ago, fmtNum, fmtUSD, shortModel, STATUS_VI,
    applyTheme, initTheme, cssVar, buildHeader, setConn, connectSSE,
    notify, ensureNotifyPermission, loadConfig, getConfig, isStuck,
    // Dashboard module registry: section modules push { id, render(host, stats, ctx) }.
    dashModules: (window.LAAM_DASH_MODULES = window.LAAM_DASH_MODULES || []),
  };
})();
