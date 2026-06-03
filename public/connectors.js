// LAAM — Connectors page. Lists connectors, lets the user paste credentials
// (stored server-side), connect/disconnect/test. Vanilla JS, no build step.
(function () {
  'use strict';
  var L = window.LAAM || {};
  var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };
  var esc = L.esc || function (s) { return s == null ? '' : String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var icon = L.icon || function () { return ''; };

  if (L.initTheme) L.initTheme();
  if (L.buildHeader) L.buildHeader('', { conn: false });
  injectCss();

  var grid = document.querySelector('#cx-grid');
  var state = [];

  function load() {
    fetch('/api/connectors').then(function (r) { return r.json(); }).then(function (d) {
      state = (d && d.connectors) || [];
      render();
    }).catch(function () { grid.innerHTML = '<div class="cx-empty">' + esc(T('conn.loadErr')) + '</div>'; });
  }

  function render() {
    grid.innerHTML = '';
    state.forEach(function (c) { grid.appendChild(card(c)); });
    if (window.LAAMI18n) window.LAAMI18n.applyDOM(grid);
  }

  function card(c) {
    var el = document.createElement('div');
    el.className = 'cx-card' + (c.connected ? ' is-on' : '');
    el.dataset.id = c.id;

    var head = document.createElement('div');
    head.className = 'cx-card-head';
    head.innerHTML =
      '<span class="cx-ic">' + icon(c.icon || 'plug', { size: 22, class: 'lc' }) + '</span>' +
      '<div class="cx-meta"><div class="cx-name">' + esc(c.name) + '</div><div class="cx-blurb">' + esc(c.blurb || '') + '</div></div>' +
      '<span class="cx-badge ' + (c.connected ? 'on' : 'off') + '">' + esc(c.connected ? T('conn.connected') : T('conn.notConnected')) + '</span>';
    el.appendChild(head);

    // tools preview
    if (c.tools && c.tools.length) {
      var tl = document.createElement('div');
      tl.className = 'cx-tools';
      tl.textContent = T('conn.toolsLabel') + ': ' + c.tools.join(', ');
      el.appendChild(tl);
    }

    var auth = c.auth || {};
    var body = document.createElement('div');
    body.className = 'cx-body';

    if (auth.type === 'token') {
      (auth.fields || []).forEach(function (f) {
        var wrap = document.createElement('label');
        wrap.className = 'cx-field';
        wrap.innerHTML = '<span class="cx-flabel">' + esc(f.label) + '</span>';
        var inp = document.createElement('input');
        inp.type = f.secret ? 'password' : 'text';
        inp.className = 'cx-input';
        inp.dataset.key = f.key;
        inp.placeholder = f.set ? (f.masked || '••••') : (f.placeholder || '');
        inp.autocomplete = 'off';
        inp.spellcheck = false;
        wrap.appendChild(inp);
        body.appendChild(wrap);
      });
      if (auth.help) {
        var help = document.createElement('div');
        help.className = 'cx-help';
        help.textContent = auth.help;
        body.appendChild(help);
      }
    } else if (auth.type === 'oauth') {
      var oh = document.createElement('div');
      oh.className = 'cx-help cx-oauth';
      oh.textContent = auth.setup || T('conn.oauthNeeded');
      body.appendChild(oh);
    } else if (auth.help) {
      var h2 = document.createElement('div');
      h2.className = 'cx-help';
      h2.textContent = auth.help;
      body.appendChild(h2);
    }
    el.appendChild(body);

    // status line for test/connect feedback
    var note = document.createElement('div');
    note.className = 'cx-note';
    note.hidden = true;
    el.appendChild(note);

    // actions
    var actions = document.createElement('div');
    actions.className = 'cx-actions';
    if (c.connected) {
      actions.appendChild(btn(T('conn.test'), 'secondary', function () { test(c.id, note); }));
      actions.appendChild(btn(T('conn.disconnect'), 'danger', function () { disconnect(c.id, note); }));
    } else {
      var label = auth.type === 'token' ? T('conn.connect') : (auth.type === 'oauth' ? T('conn.oauthNeeded') : T('conn.enable'));
      var b = btn(label, 'primary', function () { connect(c.id, el, note); });
      if (auth.type === 'oauth') b.disabled = true;
      actions.appendChild(b);
    }
    el.appendChild(actions);
    return el;
  }

  function btn(text, kind, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'cx-btn cx-' + kind;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  function showNote(note, msg, ok) {
    note.hidden = false;
    note.textContent = msg;
    note.className = 'cx-note ' + (ok ? 'ok' : 'err');
  }

  function connect(id, el, note) {
    var fields = {};
    el.querySelectorAll('.cx-input').forEach(function (inp) { if (inp.value.trim()) fields[inp.dataset.key] = inp.value.trim(); });
    showNote(note, T('conn.saving'), true);
    fetch('/api/connectors/' + encodeURIComponent(id) + '/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields: fields }) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) { if (x.ok) { test(id, note, true); } else showNote(note, x.j.error || T('conn.saveErr'), false); })
      .catch(function () { showNote(note, T('conn.saveErr'), false); });
  }

  function disconnect(id, note) {
    fetch('/api/connectors/' + encodeURIComponent(id) + '/disconnect', { method: 'POST' })
      .then(function () { load(); })
      .catch(function () { showNote(note, T('conn.saveErr'), false); });
  }

  function test(id, note, reloadAfter) {
    showNote(note, T('conn.testing'), true);
    fetch('/api/connectors/' + encodeURIComponent(id) + '/test', { method: 'POST' })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (x.ok) { showNote(note, x.j.info || T('conn.testOk'), true); if (reloadAfter) setTimeout(load, 900); }
        else { showNote(note, x.j.error || T('conn.testErr'), false); if (reloadAfter) setTimeout(load, 1400); }
      })
      .catch(function () { showNote(note, T('conn.testErr'), false); });
  }

  if (window.LAAMI18n) window.LAAMI18n.onChange(render);
  load();

  function injectCss() {
    if (document.querySelector('#cx-css')) return;
    var st = document.createElement('style');
    st.id = 'cx-css';
    st.textContent = [
      '.cx-head { margin-bottom: 18px; }',
      '.cx-head h2 { margin: 0 0 4px; font-size: 18px; }',
      '.cx-sub { margin: 0; color: var(--text-dim); font-size: 13px; max-width: 720px; line-height: 1.5; }',
      '.cx-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }',
      '.cx-empty { color: var(--text-faint); padding: 30px; text-align: center; }',
      '.cx-card { background: var(--bg-elev); border: 1px solid var(--border); border-radius: 14px; padding: 16px; display: flex; flex-direction: column; gap: 12px; box-shadow: var(--shadow); }',
      '.cx-card.is-on { border-color: var(--running); }',
      '.cx-card-head { display: flex; align-items: flex-start; gap: 11px; }',
      '.cx-ic { color: var(--accent); flex: 0 0 auto; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 9px; background: var(--accent-soft); }',
      '.cx-meta { flex: 1 1 auto; min-width: 0; }',
      '.cx-name { font-weight: 700; font-size: 14.5px; }',
      '.cx-blurb { font-size: 12px; color: var(--text-faint); margin-top: 2px; }',
      '.cx-badge { flex: 0 0 auto; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }',
      '.cx-badge.on { background: var(--running-soft); color: var(--running); }',
      '.cx-badge.off { background: var(--bg-sunken); color: var(--text-faint); }',
      '.cx-tools { font-size: 11px; color: var(--text-faint); font-family: var(--mono); line-height: 1.4; word-break: break-word; }',
      '.cx-body { display: flex; flex-direction: column; gap: 9px; }',
      '.cx-field { display: flex; flex-direction: column; gap: 4px; }',
      '.cx-flabel { font-size: 12px; color: var(--text-dim); }',
      '.cx-input { box-sizing: border-box; width: 100%; border: 1px solid var(--border); background: var(--bg-sunken); color: var(--text); border-radius: 9px; padding: 8px 10px; font-family: var(--sans); font-size: 13px; outline: 0; }',
      '.cx-input:focus { border-color: var(--accent); }',
      '.cx-help { font-size: 11.5px; color: var(--text-faint); line-height: 1.5; }',
      '.cx-oauth { color: var(--idle); }',
      '.cx-note { font-size: 12px; line-height: 1.4; }',
      '.cx-note.ok { color: var(--running); }',
      '.cx-note.err { color: var(--error); }',
      '.cx-actions { display: flex; gap: 8px; flex-wrap: wrap; }',
      '.cx-btn { border: 1px solid var(--border); background: var(--bg-elev); color: var(--text-dim); border-radius: 9px; padding: 7px 14px; font-family: var(--sans); font-size: 13px; font-weight: 600; cursor: pointer; }',
      '.cx-btn:hover:not(:disabled) { color: var(--text); background: var(--bg-sunken); }',
      '.cx-btn:disabled { opacity: 0.5; cursor: default; }',
      '.cx-primary { background: var(--accent); color: #fff; border-color: var(--accent); }',
      '.cx-primary:hover:not(:disabled) { color: #fff; filter: brightness(1.05); background: var(--accent); }',
      '.cx-danger:hover { color: #fff; background: var(--error); border-color: var(--error); }',
    ].join('\n');
    document.head.appendChild(st);
  }
})();
