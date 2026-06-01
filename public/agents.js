// LAAM — Agents monitoring page: live agent cards grouped by project, with
// search + project/model/status/branch/time filters and a detail drawer.
(() => {
  const { esc, fmtDur, ago, fmtUSD, shortModel, STATUS_VI, isStuck } = window.LAAM;
  window.LAAM.initTheme();
  window.LAAM.buildHeader();
  window.LAAM.loadConfig();
  window.LAAM.ensureNotifyPermission();
  const knownStuck = new Set(); // session ids already alerted as stuck

  const $ = (s) => document.querySelector(s);
  const main = $('#main');
  let state = { projects: [], sessions: [], error: null, projectsDir: '' };
  const filters = { q: '', project: '', model: '', status: '', branch: '', time: '' };
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
    const label = t.kind === 'user' ? 'Yêu cầu mới nhất' : t.kind === 'tool' ? 'Đang thao tác' : t.kind === 'thinking' ? 'Trạng thái' : 'Hoạt động mới nhất';
    return `<div class="task ${cls}"><span class="label">${label}</span><span class="body">${esc((t.text || '').slice(0, 280))}</span></div>`;
  }

  function subsHtml(subs) {
    if (!subs.length) return '';
    const rows = subs.slice().reverse().map((a) => `
      <div class="sub ${a.status === 'running' ? 'running' : ''}">
        <span class="sdot"></span>
        <span class="stype">${esc(a.type)}</span>
        <span class="sdesc">${esc(a.description || '(không mô tả)')}</span>
        <span class="sdur">${a.status === 'running' ? '⏱ ' : ''}${fmtDur(a.durationMs)}</span>
      </div>`).join('');
    return `<div class="subs"><div class="subs-label">⛓ Sub-agents (${subs.length})</div>${rows}</div>`;
  }

  function cardHtml(s) {
    const running = s.status === 'running';
    const stuck = isStuck(s);
    const dur = running && s.startTime ? Date.now() - s.startTime : s.durationMs;
    return `<div class="card ${s.status} ${stuck ? 'stuck' : ''}" data-id="${esc(s.id)}">
      <div class="card-top">
        <span class="badge ${s.status}"><span class="dot"></span>${STATUS_VI[s.status]}</span>
        ${stuck ? '<span class="badge stuck" title="Chưa hoàn tất nhưng đã lâu không ghi transcript">⚠ Nghi kẹt</span>' : ''}
        <div>
          <div class="model">${esc(shortModel(s.model))}</div>
          <div class="sid">${esc(s.id.slice(0, 8))}${s.gitBranch ? ' · ' + esc(s.gitBranch) : ''}</div>
        </div>
      </div>
      ${taskHtml(s.currentTask)}
      <div class="meta">
        <span class="m"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg><b data-dur ${running ? 'data-live' : ''} data-start="${s.startTime || ''}">${fmtDur(dur)}</b></span>
        <span class="m"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg><b>${s.messageCount}</b> msg</span>
        <span class="m"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg><b>${s.toolUseCount}</b> tool</span>
        <span class="m" title="Chi phí ước tính (USD)">💲<b>${fmtUSD(s.costUSD)}</b></span>
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
        <svg class="chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
        <h2>${esc(p.name)}</h2>
        <span class="path">${esc(p.path)}</span>
        <span class="count">${sessions.length} session</span>
        ${running ? `<span class="running-pill"><span class="dot" style="width:7px;height:7px;border-radius:50%;background:var(--running)"></span>${running} chạy</span>` : ''}
      </div>
      <div class="grid">${sessions.map(cardHtml).join('')}</div>
    </section>`;
  }

  function render() {
    syncSelects();
    if (state.error) {
      main.innerHTML = `<div class="empty"><div class="big">Không đọc được dữ liệu</div><div>${esc(state.error)}</div></div>`;
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
    $('#f-count').textContent = total ? `${shown}/${total} session` : '';

    if (!html) {
      main.innerHTML = `<div class="empty"><div class="big">${total ? 'Không khớp bộ lọc' : 'Chưa có agent nào'}</div><div>${total ? 'Thử điều chỉnh bộ lọc hoặc từ khoá.' : 'Bắt đầu một phiên Claude Code, dữ liệu sẽ xuất hiện ở đây.'}</div><p style="margin-top:14px">Đang theo dõi: <code>${esc(state.projectsDir)}</code></p></div>`;
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
          window.LAAM.notify(`stuck:${s.id}`, '⚠ Agent nghi bị kẹt', `${s.project} · ${shortModel(s.model)} — ${ago(s.lastActivity)} chưa ghi transcript.`);
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
  $('#f-project').addEventListener('change', (e) => { filters.project = e.target.value; render(); });
  $('#f-model').addEventListener('change', (e) => { filters.model = e.target.value; render(); });
  $('#f-status').addEventListener('change', (e) => { filters.status = e.target.value; render(); });
  $('#f-branch').addEventListener('change', (e) => { filters.branch = e.target.value; render(); });
  $('#f-time').addEventListener('change', (e) => { filters.time = e.target.value; render(); });
  $('#f-clear').addEventListener('click', () => {
    Object.keys(filters).forEach((k) => (filters[k] = ''));
    $('#search').value = '';
    ['#f-project', '#f-model', '#f-status', '#f-branch', '#f-time'].forEach((s) => ($(s).value = ''));
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
    $('#d-body').innerHTML = '<div class="empty">Đang tải timeline…</div>';
    drawer.classList.add('open'); scrim.classList.add('open');
    try {
      const r = await fetch(`/api/session/${id}`);
      const d = await r.json();
      renderTimeline(d);
    } catch {
      $('#d-body').innerHTML = '<div class="empty">Lỗi tải dữ liệu.</div>';
    }
  }

  function renderTimeline(d) {
    const head = `<div class="meta" style="margin-bottom:10px">
      <span class="m"><b>${STATUS_VI[d.status]}</b></span>
      <span class="m"><b>${fmtDur(d.durationMs)}</b> tổng</span>
      <span class="m"><b>${d.messageCount}</b> msg</span>
      <span class="m"><b>${d.tokens ? (d.tokens.input + d.tokens.output).toLocaleString() : 0}</b> tokens</span>
      <span class="m" title="Chi phí ước tính">💲<b>${fmtUSD(d.costUSD)}</b></span>
    </div>
    <a class="gopen" style="display:inline-block;margin-bottom:14px" href="/session?id=${encodeURIComponent(d.id)}">↗ Mở trang chi tiết (waterfall tool-call)</a>`;
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
    $('#d-body').innerHTML = head + subs + `<div class="tl">${tl || '<div class="empty">Chưa có hoạt động.</div>'}</div>`;
  }

  // ---- Live data ----
  window.LAAM.connectSSE((data) => { state = data; render(); });
})();
