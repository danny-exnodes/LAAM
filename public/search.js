// LAAM — Full-text search across transcript content (message text, tool inputs,
// tool results). Debounced query -> /api/search, results rendered as compact
// clickable cards with the matched substring highlighted.
(() => {
  const { esc, ago, shortModel } = window.LAAM;
  window.LAAM.initTheme();
  window.LAAM.buildHeader('', { conn: false }); // static page, no SSE → no conn indicator

  // ---- Self-injected styles (reuse existing CSS vars / classes) ----
  if (!document.querySelector('#laam-search-css')) {
    const st = document.createElement('style');
    st.id = 'laam-search-css';
    st.textContent = `
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
    const sub = m.sidechain ? '<span class="stag sub">sub</span>' : '';
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
      results.innerHTML = '<div class="empty"><div class="big">Không tìm thấy.</div></div>';
      return;
    }
    const head = `<div class="sresult-head">${data.total} kết quả${data.truncated ? ' (hiển thị 200 đầu)' : ''}</div>`;
    results.innerHTML = head + matches.map((m) => rowHtml(m, q)).join('');
  }

  function showHint() {
    results.innerHTML = '<div class="empty"><div class="big">Tìm trong nội dung transcript</div><div>Nhập ít nhất 2 ký tự để tìm trong tin nhắn, tool input và kết quả tool.</div></div>';
  }

  let seq = 0;
  async function run(q) {
    const my = ++seq;
    try {
      const r = await fetch(`/api/search?q=${encodeURIComponent(q)}&limit=200`);
      const data = await r.json();
      if (my !== seq) return; // a newer query superseded this one
      render(data, q);
    } catch {
      if (my !== seq) return;
      results.innerHTML = '<div class="empty"><div class="big">Lỗi tìm kiếm.</div></div>';
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

  showHint();
})();
