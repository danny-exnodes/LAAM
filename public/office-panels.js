/* office-panels.js — glassy HUD overlays for the Agents Office page.
 * Exports window.OfficePanels = { connected, analytics, events }.
 * Theme-aware via project CSS vars only; no build step, vanilla JS.
 */
(function () {
  'use strict';

  var L = (window.LAAM = window.LAAM || {});
  // Defensive fallbacks so the panels never throw if a helper is missing.
  function esc(s) {
    if (typeof L.esc === 'function') return L.esc(s);
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmtNum(n) {
    if (typeof L.fmtNum === 'function') return L.fmtNum(n);
    return String(Number(n) || 0);
  }
  function fmtUSD(n) {
    if (typeof L.fmtUSD === 'function') return L.fmtUSD(n);
    return '$' + (Number(n) || 0).toFixed(2);
  }
  function shortModel(m) {
    if (typeof L.shortModel === 'function') return L.shortModel(m);
    return String(m || '');
  }
  function ago(ts) {
    if (typeof L.ago === 'function') return L.ago(ts);
    return '';
  }
  // Translate via the shared i18n engine; fall back to the given default string.
  function t(key, fallback, vars) {
    if (typeof L.t === 'function') {
      var s = L.t(key, vars);
      if (s && s !== key) return s;
    }
    return fallback;
  }

  // ---- one-time stylesheet injection ----------------------------------
  function injectStyle() {
    if (document.getElementById('office-panels-css')) return;
    var css = [
      '.op-panel{',
      '  font-family:var(--sans);color:var(--text);',
      '  background:color-mix(in srgb, var(--bg-elev) 86%, transparent);',
      '  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);',
      '  border:1px solid var(--border);border-radius:14px;',
      '  box-shadow:var(--shadow);box-sizing:border-box;',
      '  padding:12px 13px;}',
      '.op-panel *{box-sizing:border-box;}',
      '.op-title{font-size:11.5px;font-weight:700;letter-spacing:.02em;',
      '  text-transform:uppercase;color:var(--text-dim);margin:0 0 9px;',
      '  display:flex;align-items:center;gap:7px;}',
      '.op-title .op-count{color:var(--text-faint);font-weight:600;}',
      /* connected */
      '.op-conn-head .op-led{width:8px;height:8px;border-radius:50%;',
      '  background:var(--running);box-shadow:0 0 0 0 var(--running);',
      '  animation:op-pulse 2s infinite;flex-shrink:0;}',
      '.op-list{display:flex;flex-direction:column;gap:2px;',
      '  max-height:236px;overflow:auto;margin:0 -4px;padding:0 4px;}',
      '.op-row{display:flex;align-items:center;gap:8px;padding:5px 6px;',
      '  border-radius:8px;min-width:0;}',
      '.op-row:hover{background:var(--bg-sunken);}',
      '.op-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0;',
      '  position:relative;}',
      '.op-dot.running{background:var(--running);}',
      '.op-dot.idle{background:var(--idle);}',
      '.op-dot.done{background:var(--done);}',
      '.op-dot.stuck{background:var(--error);}',
      '.op-warn{color:var(--error);font-size:11px;flex-shrink:0;margin-left:-3px;}',
      '.op-label{font-size:12.5px;font-weight:500;color:var(--text);',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0;}',
      '.op-model{font-family:var(--mono);font-size:11px;color:var(--text-faint);',
      '  white-space:nowrap;flex-shrink:0;max-width:120px;overflow:hidden;',
      '  text-overflow:ellipsis;}',
      '.op-chip{font-size:9.5px;font-weight:700;letter-spacing:.03em;',
      '  text-transform:uppercase;padding:2px 6px;border-radius:6px;',
      '  border:1px solid var(--border);color:var(--text-dim);',
      '  background:var(--bg-sunken);flex-shrink:0;}',
      '.op-chip.claude{color:var(--accent);background:var(--accent-soft);',
      '  border-color:color-mix(in srgb, var(--accent) 35%, transparent);}',
      /* analytics */
      '.op-analytics{width:210px;}',
      '.op-hero{display:flex;align-items:baseline;gap:8px;padding:10px 12px;',
      '  border-radius:11px;margin-bottom:10px;',
      '  background:color-mix(in srgb, var(--running) 14%, transparent);',
      '  border:1px solid color-mix(in srgb, var(--running) 30%, transparent);}',
      '.op-hero .op-big{font-size:28px;font-weight:800;line-height:1;',
      '  color:var(--running);font-variant-numeric:tabular-nums;}',
      '.op-hero .op-heroL{font-size:11.5px;font-weight:600;color:var(--text-dim);}',
      '.op-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;}',
      '.op-card{background:var(--bg-sunken);border:1px solid var(--border);',
      '  border-radius:9px;padding:7px 9px;min-width:0;}',
      '.op-card .op-v{font-size:16px;font-weight:700;color:var(--text);',
      '  line-height:1.15;font-variant-numeric:tabular-nums;',
      '  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
      '.op-card .op-k{font-size:10.5px;color:var(--text-faint);margin-top:2px;}',
      '.op-card.wide{grid-column:1 / -1;}',
      '.op-split{margin-top:9px;font-size:11.5px;color:var(--text-dim);',
      '  display:flex;align-items:center;gap:6px;justify-content:center;',
      '  padding-top:9px;border-top:1px solid var(--border);}',
      '.op-split b{color:var(--text);font-weight:700;}',
      '.op-split .op-sep{color:var(--text-faint);}',
      /* events */
      '.op-log{font-family:var(--mono);font-size:11.5px;line-height:1.55;',
      '  max-height:120px;overflow:auto;margin:0 -2px;padding:0 2px;}',
      '.op-ev{display:flex;align-items:baseline;gap:7px;padding:1px 0;}',
      '.op-ev .op-ts{color:var(--text-faint);flex-shrink:0;min-width:42px;}',
      '.op-ev .op-g{flex-shrink:0;width:11px;text-align:center;font-weight:700;}',
      '.op-ev .op-tx{color:var(--text);white-space:nowrap;overflow:hidden;',
      '  text-overflow:ellipsis;}',
      '.op-g.start{color:var(--accent);}',
      '.op-g.spawn{color:var(--accent);}',
      '.op-g.done{color:var(--done);}',
      '.op-g.stuck{color:var(--error);}',
      '.op-g.info{color:var(--text-faint);}',
      '.op-empty{font-size:12px;color:var(--text-faint);padding:8px 4px;',
      '  font-family:var(--sans);}',
      '@keyframes op-pulse{0%{box-shadow:0 0 0 0 color-mix(in srgb,var(--running) 55%,transparent);}',
      '  70%{box-shadow:0 0 0 7px color-mix(in srgb,var(--running) 0%,transparent);}',
      '  100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--running) 0%,transparent);}}',
    ].join('\n');
    var st = document.createElement('style');
    st.id = 'office-panels-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  function asArray(a) {
    return Array.isArray(a) ? a : [];
  }

  // ---- 1) connected agents -------------------------------------------
  function connected(hostEl, agents) {
    if (!hostEl) return;
    injectStyle();
    var list = asArray(agents);
    var rows = list
      .map(function (a) {
        a = a || {};
        var status = a.status === 'running' || a.status === 'idle' || a.status === 'done' ? a.status : 'idle';
        var stuck = !!a.stuck;
        var dotCls = stuck ? 'stuck' : status;
        var src = a.source === 'claude' ? 'claude' : a.source === 'local' ? 'local' : '';
        var chip = src
          ? '<span class="op-chip ' + src + '">' + (src === 'claude' ? t('office.srcClaude', 'Claude') : t('office.srcLocal', 'Local')) + '</span>'
          : '';
        var warn = stuck ? '<span class="op-warn" title="' + esc(t('office.connStuckTip', 'Nghi bị kẹt')) + '">⚠</span>' : '';
        var label = esc(a.label || a.id || t('office.connNoName', '(không tên)'));
        var model = a.model ? '<span class="op-model">' + esc(shortModel(a.model)) + '</span>' : '';
        return (
          '<div class="op-row">' +
          '<span class="op-dot ' + dotCls + '"></span>' +
          warn +
          '<span class="op-label">' + label + '</span>' +
          model +
          chip +
          '</div>'
        );
      })
      .join('');

    var body = rows || '<div class="op-empty">' + esc(t('office.connEmpty', 'Chưa có agent nào kết nối.')) + '</div>';
    hostEl.innerHTML =
      '<div class="op-panel op-conn-head">' +
      '<div class="op-title"><span class="op-led"></span>' + esc(t('office.connTitle', 'Đang kết nối')) + ' ' +
      '<span class="op-count">(' + list.length + ')</span></div>' +
      '<div class="op-list">' + body + '</div>' +
      '</div>';
  }

  // ---- 2) analytics ---------------------------------------------------
  function analytics(hostEl, stats) {
    if (!hostEl) return;
    injectStyle();
    var s = stats || {};
    var num = function (v) { return Number(v) || 0; };
    var running = num(s.running);
    var card = function (val, key, wide) {
      return (
        '<div class="op-card' + (wide ? ' wide' : '') + '">' +
        '<div class="op-v">' + val + '</div>' +
        '<div class="op-k">' + key + '</div>' +
        '</div>'
      );
    };

    hostEl.innerHTML =
      '<div class="op-panel op-analytics">' +
      '<div class="op-title">' + esc(t('office.anTitle', 'Analytics')) + '</div>' +
      '<div class="op-hero">' +
      '<span class="op-big">' + fmtNum(running) + '</span>' +
      '<span class="op-heroL">' + esc(t('office.anRunning', 'Đang chạy')) + '</span>' +
      '</div>' +
      '<div class="op-grid">' +
      card(fmtNum(num(s.total)), esc(t('office.anTotal', 'Tổng agent'))) +
      card(fmtNum(num(s.subAgents)), esc(t('office.anSubAgents', 'Sub-agent'))) +
      card(fmtNum(num(s.tokensTotal)), esc(t('office.anTokens', 'Tokens'))) +
      card(fmtUSD(num(s.costUSD)), esc(t('office.anCost', 'Chi phí'))) +
      '</div>' +
      '<div class="op-split">' + esc(t('office.anSource', 'Nguồn:')) + ' <b>' +
      esc(t('office.anClaude', 'Claude ' + fmtNum(num(s.claude)), { n: fmtNum(num(s.claude)) })) +
      '</b><span class="op-sep">·</span><b>' +
      esc(t('office.anLocal', 'Local ' + fmtNum(num(s.local)), { n: fmtNum(num(s.local)) })) + '</b></div>' +
      '</div>';
  }

  // ---- 3) event console ----------------------------------------------
  var GLYPH = { start: '▶', spawn: '⎇', done: '✓', stuck: '⚠', info: '·' };
  function events(hostEl, list) {
    if (!hostEl) return;
    injectStyle();
    var items = asArray(list).slice(0, 60);
    var lines = items
      .map(function (e) {
        e = e || {};
        var kind = GLYPH[e.kind] ? e.kind : 'info';
        return (
          '<div class="op-ev">' +
          '<span class="op-ts">' + esc(ago(e.ts)) + '</span>' +
          '<span class="op-g ' + kind + '">' + GLYPH[kind] + '</span>' +
          '<span class="op-tx">' + esc(e.text || '') + '</span>' +
          '</div>'
        );
      })
      .join('');

    var body = lines || '<div class="op-empty">' + esc(t('office.evEmpty', 'Chưa có sự kiện nào.')) + '</div>';
    hostEl.innerHTML =
      '<div class="op-panel">' +
      '<div class="op-title">' + esc(t('office.evTitle', 'Nhật ký sự kiện')) + '</div>' +
      '<div class="op-log">' + body + '</div>' +
      '</div>';
  }

  window.OfficePanels = { connected: connected, analytics: analytics, events: events };
})();
