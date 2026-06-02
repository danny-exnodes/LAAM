// LAAM — Session detail page: full single-session view with a tool-call
// waterfall (Gantt-style horizontal bars built from plain divs, no chart lib).
(() => {
  const { esc, fmtDur, ago, fmtNum, fmtUSD, shortModel, STATUS_VI } = window.LAAM;
  window.LAAM.initTheme();
  window.LAAM.buildHeader('', { conn: false }); // static page, no SSE → no conn indicator

  const main = document.querySelector('#main');
  const id = new URLSearchParams(location.search).get('id');

  injectCss();

  const BACK = '<a class="sess-back" href="/agents">← Agents</a>';

  function emptyState(big, sub) {
    main.innerHTML = `${BACK}<div class="empty"><div class="big">${esc(big)}</div>${
      sub ? `<div>${esc(sub)}</div>` : ''
    }</div>`;
  }

  if (!id) {
    emptyState('Không có session id', 'Mở một phiên từ trang Agents để xem chi tiết.');
    return;
  }

  load();

  async function load() {
    try {
      const r = await fetch(`/api/session/${encodeURIComponent(id)}`);
      if (!r.ok) {
        emptyState(r.status === 404 ? 'Không tìm thấy phiên' : 'Lỗi tải phiên', `HTTP ${r.status}`);
        return;
      }
      const d = await r.json();
      render(d);
    } catch (e) {
      emptyState('Lỗi tải phiên', String((e && e.message) || e));
    }
  }

  // ---- Sub-agents (mirrors agents.js subsHtml markup) ----
  function subsHtml(subs) {
    if (!subs || !subs.length) return '';
    const rows = subs
      .slice()
      .reverse()
      .map(
        (a) => `
      <div class="sub ${a.status === 'running' ? 'running' : ''}">
        <span class="sdot"></span>
        <span class="stype">${esc(a.type)}</span>
        <span class="sdesc">${esc(a.description || '(không mô tả)')}</span>
        <span class="sdur">${a.status === 'running' ? '⏱ ' : ''}${fmtDur(a.durationMs)}</span>
      </div>`
      )
      .join('');
    return `<div class="subs"><div class="subs-label">⛓ Sub-agents (${subs.length})</div>${rows}</div>`;
  }

  // ---- Waterfall ----
  function statusColor(c) {
    if (c.status === 'error' || c.isError) return 'var(--error)';
    if (c.status === 'running') return 'var(--running)';
    return 'var(--accent)';
  }

  function waterfallHtml(calls) {
    if (!calls || !calls.length) {
      return `<div class="sess-card"><div class="empty" style="padding:34px 0">Phiên này chưa có tool call.</div></div>`;
    }
    const rows = calls.slice().sort((a, b) => (a.start || 0) - (b.start || 0));
    const now = Date.now();
    const t0 = Math.min(...rows.map((c) => c.start || now));
    const t1 = Math.max(...rows.map((c) => c.end || c.start || now));
    const span = Math.max(1, t1 - t0);

    // Time ruler with a few evenly-spaced ticks.
    const ticks = 4;
    const tickHtml = Array.from({ length: ticks + 1 }, (_, i) => {
      const pct = (i / ticks) * 100;
      return `<span class="wf-tick" style="left:${pct}%"><span class="wf-tlabel">${fmtDur(
        Math.round((span * i) / ticks)
      )}</span></span>`;
    }).join('');

    const body = rows
      .map((c) => {
        const dur = c.durationMs != null ? c.durationMs : (c.end || now) - (c.start || now);
        const left = ((c.start - t0) / span) * 100;
        const width = Math.max(0.5, (Math.max(0, dur) / span) * 100);
        const color = statusColor(c);
        const side = c.sidechain ? ' wf-side' : '';
        const chip = c.sidechain ? '<span class="wf-chip">sub</span>' : '';
        const detail = c.detail || '';
        const title = esc(`${c.name}${detail ? ' — ' + detail : ''}\n${fmtDur(dur)} · ${c.status || ''}`);
        return `<div class="wf-row${side}" title="${title}">
          <div class="wf-label">${chip}<span class="wf-name">${esc(c.name)}</span><span class="wf-detail">${esc(
          detail
        )}</span></div>
          <div class="wf-track">
            <div class="wf-bar" style="left:${left.toFixed(3)}%;width:${width.toFixed(
          3
        )}%;background:${color}">
              <span class="wf-dur">${fmtDur(dur)}</span>
            </div>
          </div>
        </div>`;
      })
      .join('');

    return `<div class="sess-card wf">
      <div class="wf-head">
        <div class="sess-h3">Tool-call waterfall <span class="wf-count">${rows.length}</span></div>
        <div class="wf-span">Tổng span: <b>${fmtDur(span)}</b></div>
      </div>
      <div class="wf-rows">
        <div class="wf-row wf-ruler">
          <div class="wf-label"></div>
          <div class="wf-track wf-axis">${tickHtml}</div>
        </div>
        ${body}
      </div>
    </div>`;
  }

  function render(d) {
    const tokens = d.tokens ? (d.tokens.input || 0) + (d.tokens.output || 0) : 0;
    const status = d.status || 'done';
    const head = `
      <div class="sess-card sess-info">
        <div class="sess-info-top">
          <span class="badge ${status}"><span class="dot"></span>${STATUS_VI[status] || status}</span>
          <h1 class="sess-title">${esc(d.project || '(no project)')}</h1>
        </div>
        <div class="sess-ids">
          <span class="sess-id">${esc(d.id)}</span>
          <span class="sess-path">${esc(d.projectPath || '')}</span>
        </div>
        <div class="meta">
          <span class="m"><span class="mk">model</span><b>${esc(shortModel(d.model))}</b></span>
          <span class="m"><span class="mk">branch</span><b>${esc(d.gitBranch || '—')}</b></span>
          <span class="m"><span class="mk">thời lượng</span><b>${fmtDur(d.durationMs)}</b></span>
          <span class="m"><span class="mk">tin nhắn</span><b>${fmtNum(d.messageCount || 0)}</b></span>
          <span class="m"><span class="mk">tool</span><b>${fmtNum(d.toolUseCount || 0)}</b></span>
          <span class="m"><span class="mk">tokens</span><b>${fmtNum(tokens)}</b></span>
          <span class="m"><span class="mk">chi phí</span><b>${fmtUSD(d.costUSD)}</b></span>
          <span class="m" title="${ago(d.lastActivity)}"><span class="mk">hoạt động</span><b>${ago(
      d.lastActivity
    )}</b></span>
        </div>
      </div>`;

    const wf = waterfallHtml(d.toolCalls);
    const subs = d.subAgentCount > 0 ? `<div class="sess-card">${subsHtml(d.subAgents)}</div>` : '';

    main.innerHTML = `${BACK}${head}${wf}${subs}`;
  }

  function injectCss() {
    if (document.querySelector('#laam-session-css')) return;
    const css = `
      #main { max-width: 1100px; margin: 0 auto; padding: 22px 26px 60px; }
      .sess-back { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:600;
        color: var(--text-dim); text-decoration:none; padding:6px 0; margin-bottom:8px; }
      .sess-back:hover { color: var(--accent); }
      .sess-card { background: var(--bg-elev); border:1px solid var(--border); border-radius:14px;
        box-shadow: var(--shadow); padding:18px 20px; margin-bottom:18px; }
      .sess-info-top { display:flex; align-items:center; gap:12px; }
      .sess-title { font-size:20px; font-weight:700; color: var(--text); margin:0; }
      .sess-ids { display:flex; flex-wrap:wrap; gap:6px 14px; margin:10px 0 14px; }
      .sess-id, .sess-path { font-family: var(--mono); font-size:12px; color: var(--text-faint); word-break:break-all; }
      .sess-info .meta { display:flex; flex-wrap:wrap; gap:8px 10px; }
      .sess-info .m { display:flex; flex-direction:column; gap:2px; background: var(--bg-sunken);
        border:1px solid var(--border); border-radius:9px; padding:7px 11px; min-width:64px; }
      .sess-info .m .mk { font-size:10.5px; text-transform:uppercase; letter-spacing:.04em; color: var(--text-faint); font-weight:600; }
      .sess-info .m b { font-size:14px; color: var(--text); font-variant-numeric: tabular-nums; }
      .wf-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; margin-bottom:12px; flex-wrap:wrap; }
      .sess-h3 { font-size:14px; font-weight:700; color: var(--text); }
      .wf-count { display:inline-block; margin-left:6px; font-size:11.5px; font-weight:600; color: var(--text-dim);
        background: var(--bg-sunken); border:1px solid var(--border); border-radius:999px; padding:1px 8px; }
      .wf-span { font-size:12px; color: var(--text-faint); }
      .wf-span b { color: var(--text-dim); font-variant-numeric: tabular-nums; }
      .wf-rows { display:flex; flex-direction:column; gap:3px; }
      .wf-row { display:grid; grid-template-columns: 220px 1fr; align-items:center; gap:12px;
        border-radius:7px; padding:2px 4px; }
      .wf-row:not(.wf-ruler):hover { background: var(--bg-sunken); }
      .wf-label { display:flex; align-items:baseline; gap:6px; overflow:hidden; white-space:nowrap; font-size:12px; }
      .wf-name { font-family: var(--mono); font-weight:600; color: var(--text); flex-shrink:0; }
      .wf-detail { color: var(--text-faint); overflow:hidden; text-overflow:ellipsis; }
      .wf-chip { font-size:9.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
        color: var(--accent); background: var(--accent-soft); border-radius:5px; padding:1px 5px; flex-shrink:0; }
      .wf-track { position:relative; height:18px; background: var(--bg-sunken); border:1px solid var(--border);
        border-radius:6px; overflow:hidden;
        background-image: repeating-linear-gradient(90deg, transparent, transparent 24px, color-mix(in srgb, var(--border) 60%, transparent) 24px, color-mix(in srgb, var(--border) 60%, transparent) 25px); }
      .wf-bar { position:absolute; top:2px; bottom:2px; min-width:2px; border-radius:4px;
        box-shadow: 0 1px 2px rgba(0,0,0,.18); display:flex; align-items:center; transition: filter .12s ease; }
      .wf-row:hover .wf-bar { filter: brightness(1.08); }
      .wf-dur { font-size:10px; font-weight:600; color: #fff; padding:0 5px; white-space:nowrap;
        text-shadow: 0 1px 1px rgba(0,0,0,.35); }
      .wf-side { opacity:.6; }
      .wf-ruler { height:auto; }
      .wf-axis { background: transparent; border:0; height:16px; overflow:visible; }
      .wf-tick { position:absolute; top:0; bottom:0; width:1px; background: var(--border-strong); }
      .wf-tick:first-child { background: transparent; }
      .wf-tlabel { position:absolute; top:0; left:2px; font-size:10px; color: var(--text-faint);
        font-variant-numeric: tabular-nums; white-space:nowrap; }
      .wf-tick:last-child .wf-tlabel { left:auto; right:2px; }
      @media (max-width:720px){
        #main { padding: 16px max(13px, env(safe-area-inset-left)) calc(40px + env(safe-area-inset-bottom)) max(13px, env(safe-area-inset-left)); }
        .sess-card { padding: 15px 14px; }
        .sess-title { font-size: 18px; }
        .wf-row{ grid-template-columns:118px 1fr; gap:8px; }
        .wf-label { font-size: 11px; }
      }
    `;
    const el = document.createElement('style');
    el.id = 'laam-session-css';
    el.textContent = css;
    document.head.appendChild(el);
  }
})();
