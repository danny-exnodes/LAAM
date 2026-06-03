// LAAM — Agents monitoring page: live agent cards grouped by project, with
// search + project/model/status/branch/time filters and a detail drawer.
(() => {
  const { esc, fmtDur, ago, fmtUSD, shortModel, STATUS_VI, isStuck, t, icon } = window.LAAM;
  window.LAAM.initTheme();
  window.LAAM.buildHeader();
  window.LAAM.loadConfig();
  window.LAAM.ensureNotifyPermission();
  const knownStuck = new Set(); // session ids already alerted as stuck

  const $ = (s) => document.querySelector(s);
  const main = $('#main');

  // ---- Static chrome icons (search field, export button, drawer close) ----
  (function injectIcons() {
    const sic = $('#search-ic'); if (sic) sic.innerHTML = icon('search', { size: 15, class: 'lc' });
    const eic = $('#f-export-ic'); if (eic) eic.innerHTML = icon('download', { size: 15, class: 'lc' });
    const dc = $('#d-close'); if (dc) dc.innerHTML = icon('x', { size: 16, class: 'lc' });
    if (document.querySelector('#laam-agents-icon-css')) return;
    const el = document.createElement('style');
    el.id = 'laam-agents-icon-css';
    el.textContent = `
      .filterbar .search .search-ic { display:inline-flex; align-items:center; }
      #f-export { display:inline-flex; align-items:center; gap:5px; }
      .meta .m { display:inline-flex; align-items:center; gap:4px; }
      .sub .sdur { display:inline-flex; align-items:center; gap:3px; }
      svg.lc { flex-shrink:0; }
    `;
    document.head.appendChild(el);
  })();
  let state = { projects: [], sessions: [], error: null, projectsDir: '' };
  const filters = { q: '', source: '', project: '', model: '', status: '', branch: '', time: '' };
  const collapsed = new Set(JSON.parse(localStorage.getItem('laam.collapsed') || '[]'));

  // ---- Filtering ----
  function matchesText(s, f) {
    if (!f) return true;
    return (
      (s.project || '').toLowerCase().includes(f) ||
      (s.projectPath || '').toLowerCase().includes(f) ||
      (s.model || '').toLowerCase().includes(f) ||
      (s.gitBranch || '').toLowerCase().includes(f) ||
      (s.currentTask && (s.currentTask.text || '').toLowerCase().includes(f)) ||
      s.subAgents.some((a) => (a.type + a.description).toLowerCase().includes(f))
    );
  }
  function sessionPasses(s) {
    if (filters.source && (s.source || 'claude') !== filters.source) return false;
    if (filters.project && s.projectPath !== filters.project) return false;
    if (filters.model && s.model !== filters.model) return false;
    if (filters.status === 'stuck') { if (!isStuck(s)) return false; }
    else if (filters.status && s.status !== filters.status) return false;
    if (filters.branch && (s.gitBranch || '(no branch)') !== filters.branch) return false;
    if (filters.time) {
      const cutoff = Date.now() - Number(filters.time);
      if (!s.lastActivity || s.lastActivity < cutoff) return false;
    }
    if (!matchesText(s, filters.q.toLowerCase())) return false;
    return true;
  }

  // Populate the project/model/branch dropdowns from current data, keeping
  // the user's current selection if it still exists.
  function syncSelects() {
    const projOpts = state.projects.map((p) => ({ v: p.path, t: p.name }));
    const models = [...new Set(state.sessions.map((s) => s.model))].filter(Boolean).sort();
    const branches = [...new Set(state.sessions.map((s) => s.gitBranch || '(no branch)'))].sort();
    fillSelect('#f-project', projOpts, filters.project);
    fillSelect('#f-model', models.map((m) => ({ v: m, t: shortModel(m) })), filters.model);
    fillSelect('#f-branch', branches.map((b) => ({ v: b, t: b })), filters.branch);
  }
  function fillSelect(sel, opts, current) {
    const el = $(sel);
    const head = el.querySelector('option[value=""]');
    el.innerHTML = '';
    el.appendChild(head);
    for (const o of opts) {
      const opt = document.createElement('option');
      opt.value = o.v; opt.textContent = o.t;
      if (o.v === current) opt.selected = true;
      el.appendChild(opt);
    }
    if (current && !opts.some((o) => o.v === current)) el.value = '';
  }

  // ---- Render ----
  function taskHtml(t) {
    if (!t) return '';
    const cls = t.kind === 'tool' ? 'tool' : t.kind === 'thinking' ? 'thinking' : '';
    const label = t.kind === 'user' ? window.LAAM.t('agents.taskUser') : t.kind === 'tool' ? window.LAAM.t('agents.taskTool') : t.kind === 'thinking' ? window.LAAM.t('agents.taskThinking') : window.LAAM.t('agents.taskLatest');
    return `<div class="task ${cls}"><span class="label">${label}</span><span class="body">${esc((t.text || '').slice(0, 280))}</span></div>`;
  }

  function subsHtml(subs) {
    if (!subs.length) return '';
    const rows = subs.slice().reverse().map((a) => `
      <div class="sub ${a.status === 'running' ? 'running' : ''}">
        <span class="sdot"></span>
        <span class="stype">${esc(a.type)}</span>
        <span class="sdesc">${esc(a.description || t('agents.subNoDesc'))}</span>
        <span class="sdur">${a.status === 'running' ? icon('clock', { size: 12, class: 'lc' }) + ' ' : ''}${fmtDur(a.durationMs)}</span>
      </div>`).join('');
    return `<div class="subs"><div class="subs-label">${icon('git-branch', { size: 13, class: 'lc' })} ${esc(t('agents.subs', { n: subs.length }))}</div>${rows}</div>`;
  }

  function cardHtml(s) {
    const running = s.status === 'running';
    const stuck = isStuck(s);
    const dur = running && s.startTime ? Date.now() - s.startTime : s.durationMs;
    return `<div class="card ${s.status} ${stuck ? 'stuck' : ''}" data-id="${esc(s.id)}">
      <div class="card-top">
        <span class="badge ${s.status}"><span class="dot"></span>${STATUS_VI[s.status]}</span>
        ${s.source === 'local' ? `<span class="badge local" title="${esc(t('agents.badgeLocalTitle'))}">${icon('hexagon', { size: 12, class: 'lc' })}${esc(t('agents.badgeLocal'))}</span>` : ''}
        ${stuck ? `<span class="badge stuck" title="${esc(t('agents.badgeStuckTitle'))}">${icon('triangle-alert', { size: 12, class: 'lc' })}${esc(t('agents.badgeStuck'))}</span>` : ''}
        <div>
          <div class="model">${esc(shortModel(s.model))}</div>
          <div class="sid">${esc(s.id.slice(0, 8))}${s.gitBranch ? ' · ' + esc(s.gitBranch) : ''}</div>
        </div>
      </div>
      ${taskHtml(s.currentTask)}
      <div class="meta">
        <span class="m">${icon('clock', { size: 13, class: 'lc' })}<b data-dur ${running ? 'data-live' : ''} data-start="${s.startTime || ''}">${fmtDur(dur)}</b></span>
        <span class="m">${icon('message-square', { size: 13, class: 'lc' })}<b>${s.messageCount}</b> ${esc(t('agents.msgUnit'))}</span>
        <span class="m">${icon('file-text', { size: 13, class: 'lc' })}<b>${s.toolUseCount}</b> ${esc(t('agents.toolUnit'))}</span>
        <span class="m" title="${esc(t('agents.costTitle'))}">${icon('dollar-sign', { size: 13, class: 'lc' })}<b>${fmtUSD(s.costUSD)}</b></span>
        <span class="m" title="${ago(s.lastActivity)}">${ago(s.lastActivity)}</span>
      </div>
      ${subsHtml(s.subAgents)}
    </div>`;
  }

  function projectHtml(p, sessions) {
    const isCol = collapsed.has(p.path);
    const running = sessions.filter((s) => s.status === 'running').length;
    return `<section class="project ${isCol ? 'collapsed' : ''}" data-path="${esc(p.path)}">
      <div class="project-head">
        ${icon('chevron-down', { size: 16, class: 'lc chev', strokeWidth: 2.5 })}
        <h2>${esc(p.name)}</h2>
        <span class="path">${esc(p.path)}</span>
        <span class="count">${sessions.length} ${esc(t('agents.sessionUnit'))}</span>
        ${running ? `<span class="running-pill"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:var(--running)"></span>${esc(t('agents.runningPill', { n: running }))}</span>` : ''}
      </div>
      <div class="grid">${sessions.map(cardHtml).join('')}</div>
    </section>`;
  }

  function render() {
    syncSelects();
    if (state.error) {
      main.innerHTML = `<div class="empty"><div class="big">${esc(t('agents.errTitle'))}</div><div>${esc(state.error)}</div></div>`;
      $('#f-count').textContent = '';
      return;
    }
    let shown = 0;
    const html = state.projects.map((p) => {
      const sessions = p.sessions.filter(sessionPasses);
      if (!sessions.length) return '';
      shown += sessions.length;
      return projectHtml(p, sessions);
    }).filter(Boolean).join('');

    const total = state.sessions.length;
    $('#f-count').textContent = total ? t('agents.count', { shown, total }) : '';

    if (!html) {
      main.innerHTML = `<div class="empty"><div class="big">${esc(total ? t('agents.emptyMatch') : t('agents.emptyNone'))}</div><div>${esc(total ? t('agents.emptyMatchSub') : t('agents.emptyNoneSub'))}</div><p style="margin-top:14px">${esc(t('agents.watching'))} <code>${esc(state.projectsDir)}</code></p></div>`;
      return;
    }
    main.innerHTML = html;
    tick();
    checkStuckNotify();
  }

  // Browser-notify when a session newly crosses the stuck threshold.
  function checkStuckNotify() {
    for (const s of state.sessions) {
      if (isStuck(s)) {
        if (!knownStuck.has(s.id)) {
          knownStuck.add(s.id);
          window.LAAM.notify(`stuck:${s.id}`, t('agents.notifyTitle'), t('agents.notifyBody', { project: s.project, model: shortModel(s.model), ago: ago(s.lastActivity) }));
        }
      } else {
        knownStuck.delete(s.id);
      }
    }
  }

  function tick() {
    document.querySelectorAll('[data-live]').forEach((el) => {
      const start = Number(el.dataset.start);
      if (start) el.textContent = fmtDur(Date.now() - start);
    });
  }
  setInterval(tick, 1000);

  // ---- Filter events ----
  $('#search').addEventListener('input', (e) => { filters.q = e.target.value.trim(); render(); });
  $('#f-source').addEventListener('change', (e) => { filters.source = e.target.value; render(); });
  $('#f-project').addEventListener('change', (e) => { filters.project = e.target.value; render(); });
  $('#f-model').addEventListener('change', (e) => { filters.model = e.target.value; render(); });
  $('#f-status').addEventListener('change', (e) => { filters.status = e.target.value; render(); });
  $('#f-branch').addEventListener('change', (e) => { filters.branch = e.target.value; render(); });
  $('#f-time').addEventListener('change', (e) => { filters.time = e.target.value; render(); });
  $('#f-clear').addEventListener('click', () => {
    Object.keys(filters).forEach((k) => (filters[k] = ''));
    $('#search').value = '';
    ['#f-source', '#f-project', '#f-model', '#f-status', '#f-branch', '#f-time'].forEach((s) => ($(s).value = ''));
    render();
  });
  $('#f-export').addEventListener('click', () => {
    const opts = filters.time ? { sinceMs: Date.now() - Number(filters.time) } : {};
    window.LAAM.export?.csvSessions(opts);
  });

  // ---- Card / collapse events ----
  main.addEventListener('click', (e) => {
    const head = e.target.closest('.project-head');
    if (head) {
      const sec = head.closest('.project');
      const path = sec.dataset.path;
      if (collapsed.has(path)) collapsed.delete(path); else collapsed.add(path);
      localStorage.setItem('laam.collapsed', JSON.stringify([...collapsed]));
      sec.classList.toggle('collapsed');
      return;
    }
    const card = e.target.closest('.card');
    if (card) openDrawer(card.dataset.id);
  });

  // ---- Drawer ----
  const drawer = $('#drawer'), scrim = $('#scrim');
  function closeDrawer() { drawer.classList.remove('open'); scrim.classList.remove('open'); }
  $('#d-close').onclick = closeDrawer;
  scrim.onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  async function openDrawer(id) {
    const s = state.sessions.find((x) => x.id === id);
    $('#d-title').textContent = s ? s.project : id;
    $('#d-path').textContent = s ? `${s.id.slice(0, 12)} · ${shortModel(s.model)}` : '';
    $('#d-body').innerHTML = `<div class="empty">${esc(t('agents.drawerLoading'))}</div>`;
    drawer.classList.add('open'); scrim.classList.add('open');
    try {
      const r = await fetch(`/api/session/${id}`);
      const d = await r.json();
      renderTimeline(d);
    } catch {
      $('#d-body').innerHTML = `<div class="empty">${esc(t('agents.drawerErr'))}</div>`;
    }
  }

  function renderTimeline(d) {
    const head = `<div class="meta" style="margin-bottom:10px">
      <span class="m"><b>${STATUS_VI[d.status]}</b></span>
      <span class="m"><b>${fmtDur(d.durationMs)}</b> ${esc(t('agents.totalLabel'))}</span>
      <span class="m"><b>${d.messageCount}</b> ${esc(t('agents.msgUnit'))}</span>
      <span class="m"><b>${d.tokens ? (d.tokens.input + d.tokens.output).toLocaleString() : 0}</b> ${esc(t('agents.tokensUnit'))}</span>
      <span class="m" title="${esc(t('agents.costEstTitle'))}">${icon('dollar-sign', { size: 13, class: 'lc' })}<b>${fmtUSD(d.costUSD)}</b></span>
    </div>
    <a class="gopen" style="display:inline-flex;align-items:center;gap:5px;margin-bottom:14px" href="/session?id=${encodeURIComponent(d.id)}">${icon('external-link', { size: 14, class: 'lc' })}${esc(t('agents.openDetail'))}</a>`;
    const subs = d.subAgents && d.subAgents.length
      ? `<div class="subs" style="border-top:0;padding-top:0;margin-bottom:14px">${subsHtml(d.subAgents).replace('<div class="subs">', '').replace(/<\/div>$/, '')}</div>` : '';
    const tl = (d.timeline || []).map((it) => {
      const role = it.sidechain ? 'tool' : it.role;
      const cls = it.kind === 'tool' || it.kind === 'result' ? 'mono' : '';
      const err = it.isError ? 'err' : '';
      const sidemark = it.sidechain ? '<span class="tl-badge">sub</span>' : '';
      return `<div class="tl-item">
        <div class="tl-role ${role} ${it.sidechain ? 'tl-side' : ''}">${role}${sidemark}</div>
        <div class="tl-text ${cls} ${err}">${esc((it.text || '').slice(0, 600))}</div>
      </div>`;
    }).join('');
    $('#d-body').innerHTML = head + subs + `<div class="tl">${tl || `<div class="empty">${esc(t('agents.timelineEmpty'))}</div>`}</div>`;
  }

  // ---- Live data ----
  window.LAAM.connectSSE((data) => { state = data; render(); });

  // ---- Re-render on language change (uses the last cached SSE snapshot) ----
  window.addEventListener('laam:lang', () => { render(); });
})();
