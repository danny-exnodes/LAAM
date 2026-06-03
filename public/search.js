// LAAM — Full-text search across transcript content (message text, tool inputs,
// tool results). Debounced query -> /api/search, results rendered as compact
// clickable cards with the matched substring highlighted.
(() => {
  const { esc, ago, shortModel } = window.LAAM;
  const t = (k, v) => window.LAAM.t(k, v);
  window.LAAM.initTheme();
  window.LAAM.buildHeader('', { conn: false }); // static page, no SSE → no conn indicator

  // ---- Self-injected styles (reuse existing CSS vars / classes) ----
  if (!document.querySelector('#laam-search-css')) {
    const st = document.createElement('style');
    st.id = 'laam-search-css';
    st.textContent = `
      .search-ic { display: inline-flex; align-items: center; flex-shrink: 0; }
      .search-ic svg { color: var(--text-faint); }
      #results { display: flex; flex-direction: column; gap: 9px; }
      .sresult-head { font-size: 13px; color: var(--text-dim); margin-bottom: 4px; }
      .sresult {
        display: block; text-decoration: none; color: inherit;
        background: var(--bg-elev); border: 1px solid var(--border);
        border-radius: 11px; padding: 12px 14px; box-shadow: var(--shadow);
        transition: transform .12s, border-color .12s;
      }
      .sresult:hover { transform: translateY(-1px); border-color: var(--border-strong); }
      .sresult-top {
        display: flex; align-items: center; gap: 9px; flex-wrap: wrap;
        font-size: 12px; color: var(--text-dim); margin-bottom: 7px;
      }
      .sresult-top .sproj { font-weight: 700; color: var(--text); }
      .sresult-top .sctx { font-family: var(--mono); color: var(--text-faint); font-size: 11px; }
      .sresult-top .sdot-sep { color: var(--text-faint); }
      .sresult-top .stag {
        font-family: var(--mono); font-size: 10.5px; font-weight: 700; color: var(--accent);
        background: var(--accent-soft); padding: 1px 7px; border-radius: 5px;
      }
      .sresult-top .stag.sub {
        color: var(--text-dim); background: var(--bg-sunken); border: 1px solid var(--border);
      }
      .sresult-top .stime { margin-left: auto; color: var(--text-faint); font-size: 11.5px; }
      .sresult-snip {
        font-family: var(--mono); font-size: 12px; line-height: 1.55; color: var(--text-dim);
        white-space: pre-wrap; word-break: break-word;
      }
      .sresult-snip mark {
        background: var(--accent-soft); color: var(--accent);
        padding: 0 1px; border-radius: 3px;
      }`;
    document.head.appendChild(st);
  }

  const $ = (s) => document.querySelector(s);
  const results = $('#results');
  const input = $('#q');

  // Search-box glyph (replaces the former hand-rolled inline <svg>).
  const searchIc = $('.search-ic');
  if (searchIc) searchIc.innerHTML = window.LAAM.icon('search', { size: 15, class: 'lc' });

  // Escape a string for safe use inside a RegExp.
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Escape HTML first, then wrap case-insensitive matches of `q` in <mark>.
  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    // Match against the HTML-escaped query so highlighting works even when the
    // query contains characters that esc() rewrote (e.g. <, >, &, ").
    const re = new RegExp(reEsc(esc(q)), 'gi');
    return safe.replace(re, (m) => `<mark>${m}</mark>`);
  }

  function rowHtml(m, q) {
    const tag = `${esc(m.role)} · ${esc(m.kind)}`;
    const sub = m.sidechain ? `<span class="stag sub">${esc(t('search.subTag'))}</span>` : '';
    return `<a class="sresult" href="/session?id=${encodeURIComponent(m.sessionId)}">
      <div class="sresult-top">
        <span class="sproj">${esc(m.project || '—')}</span>
        <span class="sdot-sep">·</span>
        <span class="sctx">${esc(shortModel(m.model))}</span>
        <span class="stag">${tag}</span>
        ${sub}
        <span class="stime" title="${esc(ago(m.ts))}">${esc(ago(m.ts))}</span>
      </div>
      <div class="sresult-snip">${highlight(m.snippet || '', q)}</div>
    </a>`;
  }

  function render(data, q) {
    const matches = data.matches || [];
    if (!matches.length) {
      results.innerHTML = `<div class="empty"><div class="big">${esc(t('search.noResults'))}</div></div>`;
      return;
    }
    const countKey = data.truncated ? 'search.resultCountTrunc' : 'search.resultCount';
    const head = `<div class="sresult-head">${esc(t(countKey, { n: data.total }))}</div>`;
    results.innerHTML = head + matches.map((m) => rowHtml(m, q)).join('');
  }

  function showHint() {
    lastView = { kind: 'hint' };
    results.innerHTML = `<div class="empty"><div class="big">${esc(t('search.hintTitle'))}</div><div>${esc(t('search.hintBody'))}</div></div>`;
  }

  let seq = 0;
  let lastView = { kind: 'hint' }; // remember what's on screen for lang re-render
  async function run(q) {
    const my = ++seq;
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=200`);
      const data = await r.json();
      if (my !== seq) return; // a newer query superseded this one
      lastView = { kind: 'results', data, q };
      render(data, q);
    } catch {
      if (my !== seq) return;
      lastView = { kind: 'error' };
      results.innerHTML = `<div class="empty"><div class="big">${esc(t('search.error'))}</div></div>`;
    }
  }

  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) {
      seq++; // cancel any in-flight render
      showHint();
      return;
    }
    timer = setTimeout(() => run(q), 300);
  });

  // Re-render the current view (hint / results / error) on language switch so
  // dynamic JS-built content updates without a reload. The placeholder is a
  // static data-i18n-ph node, handled by applyDOM in common.js.
  window.LAAMI18n.onChange(() => {
    if (lastView.kind === 'results') render(lastView.data, lastView.q);
    else if (lastView.kind === 'error') results.innerHTML = `<div class="empty"><div class="big">${esc(t('search.error'))}</div></div>`;
    else showHint();
  });

  showHint();
})();
