// LAAM — Graph page: a connection map of project → orchestrator session →
// sub-agents, rendered with vis-network. Clicking a node opens a detail panel.
(() => {
  const { esc, fmtDur, ago, shortModel, statusLabel, cssVar } = window.LAAM;
  const t = (k, v) => window.LAAM.t(k, v);
  window.LAAM.initTheme();
  window.LAAM.buildHeader();

  const $ = (s) => document.querySelector(s);

  // ---- Self-injected styles (icon alignment for toolbar + open link) ----
  if (!document.querySelector('#laam-graph-css')) {
    const st = document.createElement('style');
    st.id = 'laam-graph-css';
    st.textContent = `
      #g-fit { display: inline-flex; align-items: center; gap: 6px; }
      .gopen { display: inline-flex; align-items: center; gap: 6px; }
      .lc { vertical-align: text-bottom; }`;
    document.head.appendChild(st);
  }
  // Toolbar "fit/center" button glyph.
  const fitIc = document.querySelector('.g-fit-ic');
  if (fitIc) fitIc.innerHTML = window.LAAM.icon('locate-fixed', { size: 16, class: 'lc' });

  let state = { projects: [], sessions: [] };
  let projectFilter = '';
  let network = null;
  let nodeIndex = new Map(); // node id -> { kind, data }

  const COLORS = { project: '#6d5efc', orchestrator: '#16a34a', sub: '#0ea5e9', idle: '#d97706', done: '#64748b' };

  function statusColor(status, fallback) {
    if (status === 'running') return COLORS.orchestrator;
    if (status === 'idle') return COLORS.idle;
    if (status === 'done') return COLORS.done;
    return fallback;
  }

  // Build vis-network nodes/edges from the current snapshot.
  function buildGraph() {
    const nodes = [];
    const edges = [];
    nodeIndex = new Map();
    let sessionCount = 0, subCount = 0;

    const projects = state.projects.filter((p) => !projectFilter || p.path === projectFilter);
    for (const p of projects) {
      const pid = `p:${p.path}`;
      nodes.push({
        id: pid, label: p.name, group: 'project', shape: 'box',
        color: { background: COLORS.project, border: COLORS.project },
        font: { color: '#fff', size: 15 }, margin: 10, level: 0,
      });
      nodeIndex.set(pid, { kind: 'project', data: p });

      for (const s of p.sessions) {
        const sid = `s:${s.id}`;
        sessionCount++;
        const col = statusColor(s.status, COLORS.orchestrator);
        nodes.push({
          id: sid,
          label: `${shortModel(s.model)}\n${s.id.slice(0, 8)}`,
          group: 'orchestrator', shape: 'box', level: 1,
          color: { background: col, border: col },
          font: { color: '#fff', size: 12 },
          borderWidth: s.status === 'running' ? 3 : 1,
        });
        nodeIndex.set(sid, { kind: 'session', data: s });
        edges.push({ from: pid, to: sid, color: { color: cssVar('--border-strong') || '#d2d7df' } });

        for (const a of s.subAgents) {
          const aid = `a:${s.id}:${a.id}`;
          subCount++;
          const acol = a.status === 'running' ? COLORS.orchestrator : COLORS.sub;
          nodes.push({
            id: aid, label: a.type || 'agent', group: 'sub', shape: 'dot', size: 12, level: 2,
            color: { background: acol, border: acol }, font: { color: cssVar('--text') || '#1a1d21', size: 11 },
          });
          nodeIndex.set(aid, { kind: 'sub', data: { ...a, sessionId: s.id, project: s.project } });
          edges.push({ from: sid, to: aid, dashes: a.status === 'running' ? false : true, color: { color: cssVar('--border-strong') || '#d2d7df' } });
        }
      }
    }

    $('#g-count').textContent = t('graph.count', { p: projects.length, o: sessionCount, s: subCount });
    return { nodes, edges };
  }

  function options() {
    const physics = $('#g-physics').checked;
    return {
      layout: physics ? {} : { hierarchical: { direction: 'LR', sortMethod: 'directed', levelSeparation: 200, nodeSpacing: 60 } },
      physics: { enabled: physics, stabilization: { iterations: 120 }, barnesHut: { springLength: 120, avoidOverlap: 0.6 } },
      interaction: { hover: true, tooltipDelay: 120 },
      nodes: { borderWidth: 1, shadow: false },
      edges: { smooth: { type: 'cubicBezier' }, arrows: { to: { enabled: true, scaleFactor: 0.5 } } },
    };
  }

  function draw() {
    const data = buildGraph();
    if (!window.vis) { $('#net').innerHTML = `<div class="empty">${esc(t('graph.noLib'))}</div>`; return; }
    if (network) { network.setData(data); network.setOptions(options()); return; }
    network = new vis.Network($('#net'), data, options());
    network.on('click', (params) => {
      if (params.nodes.length) showDetail(params.nodes[0]);
    });
    window.laamNet = network; // debug handle (also used by e2e checks)
  }

  // ---- Detail panel ----
  function row(label, value) {
    return `<div class="grow"><span>${label}</span><b>${value}</b></div>`;
  }
  let lastDetailId = null; // remember the open node so we can re-render on lang switch
  function showDetail(nodeId) {
    const entry = nodeIndex.get(nodeId);
    if (!entry) return;
    lastDetailId = nodeId;
    $('#gpanel-empty').style.display = 'none';
    const body = $('#gpanel-body');
    body.style.display = 'block';

    if (entry.kind === 'project') {
      const p = entry.data;
      body.innerHTML = `<h3>${esc(p.name)}</h3><div class="gpath">${esc(p.path)}</div>
        ${row(t('graph.rowSession'), p.sessionCount)}
        ${row(t('graph.rowRunning'), p.runningCount)}
        ${row(t('graph.rowRunningSub'), p.runningSubCount)}
        ${row(t('graph.rowActivity'), ago(p.lastActivity))}`;
    } else if (entry.kind === 'session') {
      const s = entry.data;
      const subs = s.subAgents.map((a) => `<div class="gsub ${a.status}"><span class="sdot"></span><span class="stype">${esc(a.type)}</span><span class="sdesc">${esc(a.description || '')}</span></div>`).join('');
      body.innerHTML = `<h3>${esc(s.project)} <span class="gbadge ${s.status}">${esc(statusLabel(s.status))}</span></h3>
        <div class="gpath">${esc(s.id)}</div>
        ${row(t('graph.rowModel'), esc(shortModel(s.model)))}
        ${row(t('graph.rowBranch'), esc(s.gitBranch || '—'))}
        ${row(t('graph.rowDuration'), fmtDur(s.durationMs))}
        ${row(t('graph.rowMessages'), s.messageCount)}
        ${row(t('graph.rowToolCalls'), s.toolUseCount)}
        ${row(t('graph.rowTokens'), ((s.tokens?.input || 0) + (s.tokens?.output || 0)).toLocaleString())}
        ${row(t('graph.rowSubAgents'), s.subAgentCount)}
        ${s.currentTask ? `<div class="gtask">${esc((s.currentTask.text || '').slice(0, 240))}</div>` : ''}
        ${subs ? `<div class="gsubs">${subs}</div>` : ''}
        <a class="gopen" href="/agents">${window.LAAM.icon('external-link', { size: 15, class: 'lc' })}<span>${esc(t('graph.openAgents'))}</span></a>`;
    } else {
      const a = entry.data;
      body.innerHTML = `<h3>${esc(a.type)} <span class="gbadge ${a.status === 'running' ? 'running' : 'done'}">${esc(a.status === 'running' ? t('graph.statusRunning') : t('graph.statusDone'))}</span></h3>
        <div class="gpath">${esc(t('graph.subAgentCtx', { id: a.sessionId.slice(0, 8) }))}</div>
        ${row(t('graph.rowProject'), esc(a.project))}
        ${row(t('graph.rowDuration'), fmtDur(a.durationMs))}
        ${a.description ? `<div class="gtask">${esc(a.description)}</div>` : ''}
        ${a.prompt ? `<div class="gprompt">${esc((a.prompt || '').slice(0, 400))}</div>` : ''}`;
    }
  }

  function fillProjects() {
    const el = $('#g-project');
    const cur = projectFilter;
    const head = el.querySelector('option[value=""]');
    el.innerHTML = '';
    el.appendChild(head);
    for (const p of state.projects) {
      const o = document.createElement('option');
      o.value = p.path; o.textContent = p.name;
      if (p.path === cur) o.selected = true;
      el.appendChild(o);
    }
    if (cur && !state.projects.some((p) => p.path === cur)) el.value = '';
  }

  // ---- Controls ----
  $('#g-project').addEventListener('change', (e) => { projectFilter = e.target.value; draw(); });
  $('#g-physics').addEventListener('change', () => { network = null; $('#net').innerHTML = ''; draw(); });
  $('#g-fit').addEventListener('click', () => network && network.fit({ animation: true }));
  window.addEventListener('laam:theme', () => { network = null; $('#net').innerHTML = ''; draw(); });

  // Re-render dynamic JS content (count line + open detail panel) on language switch.
  // Static data-i18n nodes are handled by common.js/applyDOM; node labels are
  // model/id/type values that are not translated, so the graph itself is untouched.
  window.LAAMI18n.onChange(() => {
    draw();
    if (lastDetailId != null && nodeIndex.has(lastDetailId)) showDetail(lastDetailId);
  });

  // ---- Live data ----
  window.LAAM.connectSSE((data) => {
    state = data;
    fillProjects();
    draw();
  });
})();
