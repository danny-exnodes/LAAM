// LAAM — Agents Office: an isometric 2.5D office that visualizes agent
// workflows live. Each orchestrator session is a person at a desk; its Task
// sub-agents cluster around it; handoffs are animated connectors; chat bubbles
// summarize the current work. Driven by the existing SSE snapshot.
(() => {
  const { esc, ago, fmtDur, fmtUSD, fmtNum, shortModel, STATUS_VI, isStuck } = window.LAAM;
  window.LAAM.initTheme();
  window.LAAM.buildHeader();
  window.LAAM.loadConfig();
  window.LAAM.ensureNotifyPermission?.();

  const S = window.OfficeSprites;
  const P = window.OfficePanels;
  const TW = (S && S.TILE_W) || 72;
  const TH = (S && S.TILE_H) || 36;

  const $ = (s) => document.querySelector(s);
  const scene = $('#scene'), floor = $('#floor'), furn = $('#furniture'), agentsEl = $('#agents'), links = $('#links');
  const stage = $('#stage');

  // Scene origin so iso coords stay positive (lots of left padding for the diamond).
  const ORIGIN_X = 540, ORIGIN_Y = 168;
  const isoX = (c, r) => ORIGIN_X + (c - r) * TW / 2;
  const isoY = (c, r) => ORIGIN_Y + (c + r) * TH / 2;
  const zOf = (c, r) => Math.round((c + r) * 10);

  // ---- Self CSS ----
  if (!$('#office-css')) {
    const st = document.createElement('style');
    st.id = 'office-css';
    st.textContent = `
      .office { position: fixed; inset: 0; top: 57px; overflow: hidden; background:
        radial-gradient(120% 120% at 60% 0%, color-mix(in srgb, var(--accent) 9%, var(--bg)) 0%, var(--bg) 55%); }
      .office-stage { position: absolute; inset: 0; overflow: auto; }
      .office-scene { position: relative; transform-origin: 0 0; width: 1400px; height: 900px; }
      .office-links { position: absolute; left: 0; top: 0; pointer-events: none; z-index: 1; overflow: visible; }
      .office-floor, .office-furniture, .office-agents { position: absolute; left: 0; top: 0; }
      .iso-item { position: absolute; }
      .iso-item.tile { z-index: 0; }
      .office-node { position: absolute; transition: left .9s cubic-bezier(.22,1,.36,1), top .9s cubic-bezier(.22,1,.36,1); }
      .office-node .av-wrap { position: relative; transform: translate(-50%, -100%); cursor: pointer; }
      .office-node.done .av-wrap { filter: grayscale(0.7) opacity(0.72); }
      .status-dot { position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
        width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 2px var(--bg-elev); }
      .status-dot.running { background: var(--running); animation: opulse 1.6s infinite; }
      .status-dot.idle { background: var(--idle); }
      .status-dot.done { background: var(--done); }
      .stuck-badge { position: absolute; top: -10px; right: -8px; width: 18px; height: 18px; border-radius: 50%;
        background: var(--error); color: #fff; font-size: 12px; font-weight: 800; display: grid; place-items: center;
        box-shadow: 0 0 0 2px var(--bg-elev); animation: opulse 1.2s infinite; }
      .name-tag { position: absolute; top: 2px; left: 50%; transform: translateX(-50%);
        white-space: nowrap; font-size: 10px; font-weight: 700; color: var(--text-dim);
        background: color-mix(in srgb, var(--bg-elev) 80%, transparent); padding: 1px 6px; border-radius: 6px;
        border: 1px solid var(--border); }
      .chat-bubble { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
        max-width: 190px; font-size: 11px; line-height: 1.4; color: var(--text);
        background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px; padding: 6px 9px;
        box-shadow: var(--shadow); }
      .chat-bubble::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
        border: 6px solid transparent; border-top-color: var(--bg-elev); }
      .chat-bubble .who { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px;
        color: var(--text-faint); margin-bottom: 2px; }
      .chat-bubble .body { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .chat-bubble.tool .body { font-family: var(--mono); color: var(--accent); }
      @keyframes opulse { 0%{box-shadow:0 0 0 0 color-mix(in srgb, currentColor 60%, transparent)} 70%{box-shadow:0 0 0 6px transparent} 100%{box-shadow:0 0 0 0 transparent} }
      .link-line { stroke: var(--border-strong); stroke-width: 2; fill: none; }
      .link-line.running { stroke: var(--accent); stroke-dasharray: 1; }
      .link-line.done { stroke-dasharray: 4 4; opacity: .6; }
      .link-packet { fill: var(--accent); }
      .office-panel { position: absolute; z-index: 30; }
      .office-panel.connected { top: 14px; left: 14px; width: 250px; }
      .office-panel.analytics { top: 14px; right: 14px; width: 214px; }
      .office-panel.console { bottom: 14px; left: 14px; right: 240px; }
      .office-controls { position: absolute; bottom: 14px; right: 14px; z-index: 30; display: flex; gap: 6px; align-items: center;
        background: color-mix(in srgb, var(--bg-elev) 86%, transparent); backdrop-filter: blur(8px);
        border: 1px solid var(--border); border-radius: 10px; padding: 6px 8px; }
      .office-controls .fsel { padding: 4px 9px; }
      @media (max-width: 760px) { .office-panel.console { right: 14px; } .office-panel.analytics { display: none; } }
    `;
    document.head.appendChild(st);
  }

  // ---- State ----
  let prev = new Map();           // id -> session (last snapshot)
  let knownSubs = new Set();      // "sid:subid"
  let placement = new Map();      // node key -> {col,row}
  let events = [];
  let showDone = false;
  let scale = 1;
  let lastSnapshot = null;

  function pushEvent(kind, text) {
    events.unshift({ ts: Date.now(), kind, text });
    if (events.length > 120) events.length = 120;
  }

  // ---- Furniture (lounge ambiance), rendered once per layout ----
  function placeSprite(host, svg, col, row, opts) {
    const w = document.createElement('div');
    w.className = 'iso-item' + (opts && opts.cls ? ' ' + opts.cls : '');
    w.style.left = isoX(col, row) + 'px';
    w.style.top = isoY(col, row) + 'px';
    w.style.transform = 'translate(-50%,-100%)';
    w.style.zIndex = String(zOf(col, row) + (opts && opts.zb || 1));
    w.appendChild(svg);
    host.appendChild(w);
    return w;
  }

  // ---- Layout: sessions -> pods of (orchestrator + sub-agents) ----
  function visibleSessions(sessions) {
    const now = Date.now();
    let list = sessions.slice();
    if (!showDone) {
      list = list.filter((s) => s.status !== 'done' || (s.lastActivity && now - s.lastActivity < 30 * 60 * 1000));
    }
    const rank = (s) => (isStuck(s) ? 0 : s.status === 'running' ? 1 : s.status === 'idle' ? 2 : 3);
    list.sort((a, b) => rank(a) - rank(b) || (b.lastActivity || 0) - (a.lastActivity || 0));
    return list.slice(0, 30);
  }

  let hueSeed = 0;
  const hueFor = (id) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; };

  // Returns { nodes:[{key,session,sub,role,col,row,parentKey}], links:[{from,to,running}], pods:[{col,row,w,h}] }
  function computeLayout(sessions) {
    const nodes = [];
    const lnks = [];
    const pods = [];
    const COLS = 9;          // work-floor width in tiles before wrapping
    let c = 0, r = 0, rowH = 0;
    for (const s of sessions) {
      const subs = (s.subAgents || []).slice(0, 5);
      const podW = Math.max(2, 1 + Math.ceil(subs.length / 2));
      const podH = subs.length > 0 ? 2 : 1;
      if (c + podW > COLS) { c = 0; r += rowH + 2; rowH = 0; }
      const oc = c, or_ = r;
      pods.push({ col: oc, row: or_, w: podW, h: podH });
      const okey = 's:' + s.id;
      nodes.push({ key: okey, session: s, sub: null, role: 'orchestrator', col: oc, row: or_, parentKey: null });
      // sub-agents around the orchestrator
      const slots = [];
      for (let dc = 1; dc < podW; dc++) slots.push([oc + dc, or_]);
      for (let dc = 0; dc < podW; dc++) slots.push([oc + dc, or_ + 1]);
      subs.forEach((a, i) => {
        const slot = slots[i] || [oc + 1 + i, or_ + 1];
        const skey = okey + '/a:' + a.id;
        nodes.push({ key: skey, session: s, sub: a, role: 'sub', col: slot[0], row: slot[1], parentKey: okey });
        lnks.push({ from: okey, to: skey, running: a.status === 'running' });
      });
      rowH = Math.max(rowH, podH);
      c += podW + 2;
    }
    return { nodes, links: lnks, pods };
  }

  // ---- Render ----
  function nodeStatus(n) {
    if (n.role === 'sub') return n.sub.status === 'running' ? 'running' : 'done';
    return n.session.status;
  }
  function nodeBubble(n) {
    if (n.role === 'sub') return { who: '⛓ ' + (n.sub.type || 'agent'), text: n.sub.description || '', tool: false };
    const t = n.session.currentTask;
    if (!t) return null;
    const who = t.kind === 'user' ? 'Yêu cầu' : t.kind === 'tool' ? 'Đang làm' : t.kind === 'thinking' ? '…' : 'Hoạt động';
    return { who, text: t.text || '', tool: t.kind === 'tool' };
  }
  function nodeLabel(n) {
    if (n.role === 'sub') return n.sub.type || 'agent';
    return n.session.project + (n.session.source === 'local' ? ' ⬡' : '');
  }

  function render(sessions) {
    floor.innerHTML = ''; furn.innerHTML = ''; agentsEl.innerHTML = ''; links.innerHTML = '';
    const shown = visibleSessions(sessions);
    const { nodes, links: lnks, pods } = computeLayout(shown);

    // extent
    let maxCR = 8;
    nodes.forEach((n) => { maxCR = Math.max(maxCR, n.col + n.row + 3); });
    const loungeCol = 11, loungeRow = 0;

    // floor tiles over the work area + lounge
    const tilesC = 13, tilesR = Math.max(7, ...pods.map((p) => p.row + p.h + 1), 7);
    for (let rr = 0; rr < tilesR; rr++) {
      for (let cc = 0; cc < tilesC; cc++) {
        const inLounge = cc >= loungeCol && rr <= 4;
        const variant = inLounge ? 'lawn' : 'floor';
        placeSprite(floor, S.floorTile({ variant }), cc, rr, { cls: 'tile', zb: 0 });
      }
    }
    // carpet under pods
    pods.forEach((p) => {
      for (let dr = 0; dr < p.h; dr++) for (let dc = 0; dc < p.w; dc++) {
        placeSprite(floor, S.floorTile({ variant: 'carpet' }), p.col + dc, p.row + dr, { cls: 'tile', zb: 0 });
      }
    });

    // lounge furniture (ambiance)
    placeSprite(furn, S.sofa(), loungeCol, loungeRow + 1, { zb: 2 });
    placeSprite(furn, S.pingPong(), loungeCol + 1, loungeRow + 3, { zb: 2 });
    placeSprite(furn, S.meetingTable(), loungeCol, loungeRow + 4, { zb: 2 });
    placeSprite(furn, S.plant(), loungeCol + 2, loungeRow, { zb: 2 });
    placeSprite(furn, S.plant(), 0, tilesR - 1, { zb: 2 });

    // desks + avatars
    const posByKey = new Map();
    nodes.forEach((n) => {
      // desk + chair under the person
      placeSprite(furn, S.chair(), n.col, n.row + 0.18, { zb: 2 });
      placeSprite(furn, S.desk(), n.col, n.row, { zb: 3 });

      const status = nodeStatus(n);
      const node = document.createElement('div');
      node.className = 'office-node ' + status;
      node.style.left = isoX(n.col, n.row) + 'px';
      node.style.top = (isoY(n.col, n.row) - 8) + 'px';
      node.style.zIndex = String(zOf(n.col, n.row) + 6);
      posByKey.set(n.key, { x: isoX(n.col, n.row), y: isoY(n.col, n.row) - 8 });

      const wrap = document.createElement('div');
      wrap.className = 'av-wrap';
      const stuck = n.role === 'orchestrator' && isStuck(n.session);
      const av = S.avatar({ status, role: n.role, hue: hueFor(n.session.id + (n.sub ? n.sub.id : '')) });
      wrap.appendChild(av);
      // status dot
      const dot = document.createElement('span'); dot.className = 'status-dot ' + status; wrap.appendChild(dot);
      if (stuck) { const b = document.createElement('span'); b.className = 'stuck-badge'; b.textContent = '!'; wrap.appendChild(b); }
      // name tag
      const tag = document.createElement('span'); tag.className = 'name-tag'; tag.textContent = nodeLabel(n); wrap.appendChild(tag);
      // chat bubble (active only)
      if (status !== 'done') {
        const bb = nodeBubble(n);
        if (bb && bb.text) {
          const bubble = document.createElement('div');
          bubble.className = 'chat-bubble' + (bb.tool ? ' tool' : '');
          bubble.innerHTML = `<span class="who">${esc(bb.who)}</span><span class="body">${esc((bb.text || '').slice(0, 110))}</span>`;
          wrap.appendChild(bubble);
        }
      }
      wrap.onclick = () => openDrawer(n.session);
      node.appendChild(wrap);
      agentsEl.appendChild(node);
    });

    // handoff links
    const NS = 'http://www.w3.org/2000/svg';
    lnks.forEach((l) => {
      const a = posByKey.get(l.from), b = posByKey.get(l.to);
      if (!a || !b) return;
      const y1 = a.y - 24, y2 = b.y - 24;
      const line = document.createElementNS(NS, 'path');
      line.setAttribute('d', `M ${a.x} ${y1} L ${b.x} ${y2}`);
      line.setAttribute('class', 'link-line ' + (l.running ? 'running' : 'done'));
      links.appendChild(line);
      if (l.running) {
        const pk = document.createElementNS(NS, 'circle');
        pk.setAttribute('r', '4'); pk.setAttribute('class', 'link-packet');
        const am = document.createElementNS(NS, 'animateMotion');
        am.setAttribute('dur', '2s'); am.setAttribute('repeatCount', 'indefinite');
        am.setAttribute('path', `M ${a.x} ${y1} L ${b.x} ${y2}`);
        pk.appendChild(am); links.appendChild(pk);
      }
    });

    applyScale();
  }

  // ---- Panels ----
  function updatePanels(sessions) {
    const all = [];
    sessions.forEach((s) => {
      all.push({ id: s.id, label: s.project, model: s.model, status: s.status, source: s.source, stuck: isStuck(s) });
    });
    const running = sessions.filter((s) => s.status === 'running').length;
    const idle = sessions.filter((s) => s.status === 'idle').length;
    const done = sessions.filter((s) => s.status === 'done').length;
    const subAgents = sessions.reduce((n, s) => n + (s.subAgentCount || 0), 0);
    const tokensTotal = sessions.reduce((n, s) => n + (s.tokens ? s.tokens.input + s.tokens.output : 0), 0);
    const costUSD = sessions.reduce((n, s) => n + (s.costUSD || 0), 0);
    const claude = sessions.filter((s) => s.source !== 'local').length;
    const local = sessions.filter((s) => s.source === 'local').length;
    P.connected($('#panel-connected'), all.filter((a) => a.status !== 'done' || showDone).slice(0, 40));
    P.analytics($('#panel-analytics'), { running, idle, done, total: sessions.length, claude, local, subAgents, tokensTotal, costUSD });
    P.events($('#panel-console'), events);
  }

  // ---- SSE diff -> events ----
  function diff(sessions) {
    const cur = new Map(sessions.map((s) => [s.id, s]));
    for (const s of sessions) {
      const p = prev.get(s.id);
      if (!p) pushEvent('start', `Phiên mới: ${s.project} · ${shortModel(s.model)}`);
      else {
        if (p.status !== 'done' && s.status === 'done') pushEvent('done', `Hoàn tất: ${s.project} · ${shortModel(s.model)}`);
        const wasStuck = isStuck(p), nowStuck = isStuck(s);
        if (!wasStuck && nowStuck) pushEvent('stuck', `Nghi kẹt: ${s.project} · ${shortModel(s.model)}`);
      }
      for (const a of s.subAgents || []) {
        const k = s.id + ':' + a.id;
        if (!knownSubs.has(k)) { knownSubs.add(k); pushEvent('spawn', `${s.project} giao việc → ${a.type || 'agent'}${a.description ? ' (' + a.description.slice(0, 30) + ')' : ''}`); }
      }
    }
    prev = cur;
  }

  // ---- Drawer ----
  const drawer = $('#drawer'), scrim = $('#scrim');
  function closeDrawer() { drawer.classList.remove('open'); scrim.classList.remove('open'); }
  $('#d-close').onclick = closeDrawer; scrim.onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  async function openDrawer(s) {
    $('#d-title').textContent = s.project + (s.source === 'local' ? ' · Local' : '');
    $('#d-path').textContent = `${s.id.slice(0, 12)} · ${shortModel(s.model)} · ${STATUS_VI[s.status]}`;
    $('#d-body').innerHTML = '<div class="empty">Đang tải…</div>';
    drawer.classList.add('open'); scrim.classList.add('open');
    try {
      const d = await (await fetch('/api/session/' + s.id)).json();
      const head = `<div class="meta" style="margin-bottom:14px">
        <span class="m"><b>${fmtDur(d.durationMs)}</b></span>
        <span class="m"><b>${d.messageCount}</b> msg</span>
        <span class="m"><b>${d.toolUseCount}</b> tool</span>
        <span class="m">💲<b>${fmtUSD(d.costUSD)}</b></span></div>`;
      const tl = (d.timeline || []).slice(-40).map((it) => {
        const role = it.sidechain ? 'tool' : it.role;
        return `<div class="tl-item"><div class="tl-role ${role}">${role}</div><div class="tl-text ${it.kind === 'tool' || it.kind === 'result' ? 'mono' : ''}">${esc((it.text || '').slice(0, 400))}</div></div>`;
      }).join('');
      $('#d-body').innerHTML = head + `<div class="tl">${tl || '<div class="empty">Chưa có hoạt động.</div>'}</div>`;
    } catch { $('#d-body').innerHTML = '<div class="empty">Lỗi tải dữ liệu.</div>'; }
  }

  // ---- Camera ----
  function applyScale() { scene.style.transform = `scale(${scale})`; }
  $('#zoom-in').onclick = () => { scale = Math.min(1.6, scale + 0.15); applyScale(); };
  $('#zoom-out').onclick = () => { scale = Math.max(0.5, scale - 0.15); applyScale(); };
  $('#zoom-fit').onclick = () => { scale = 1; applyScale(); stage.scrollTo({ left: 240, top: 0, behavior: 'smooth' }); };
  $('#show-done').onchange = (e) => { showDone = e.target.checked; if (lastSnapshot) { render(lastSnapshot.sessions); updatePanels(lastSnapshot.sessions); } };

  // ---- Mock (for handoff demo / offline test): ?mock=1 ----
  function mockSnapshot() {
    const now = Date.now();
    const mk = (id, project, source, status, model, task, subs) => ({
      id, project, projectPath: project, source, model, status,
      startTime: now - 600000, lastActivity: now - (status === 'done' ? 1200000 : 5000),
      durationMs: 600000, messageCount: 40, userMessageCount: 12, assistantMessageCount: 28,
      toolUseCount: 30, subAgentCount: (subs || []).length, tokens: { input: 12000, output: 8000 }, costUSD: 0.1,
      currentTask: task ? { kind: 'tool', text: task } : null, subAgents: subs || [],
    });
    const sub = (id, type, desc, status) => ({ id, type, description: desc, status, startTime: now - 120000, durationMs: 90000 });
    return {
      sessions: [
        mk('orch-1', 'LAAM', 'claude', 'running', 'claude-opus-4-8', 'Refactor parser + add stats endpoint', [
          sub('a1', 'Explore', 'tìm các call-site', 'done'),
          sub('a2', 'general-purpose', 'viết module mới', 'running'),
          sub('a3', 'code-reviewer', 'review diff', 'running'),
        ]),
        mk('orch-2', 'webapp', 'claude', 'idle', 'claude-sonnet-4-6', 'Chờ phản hồi người dùng', []),
        mk('orch-3', 'data-pipe', 'claude', 'running', 'claude-opus-4-8', 'Đang chạy ETL hằng đêm', [sub('b1', 'general-purpose', 'transform bảng', 'running')]),
        mk('loc-1', 'Ollama (local)', 'local', 'running', 'qwen2.5-coder:7b', 'Sinh quicksort bằng Python', []),
        mk('loc-2', 'Ollama (local)', 'local', 'done', 'qwen2.5-coder:7b', 'Đã trả lời xong', []),
        Object.assign(mk('orch-4', 'infra', 'claude', 'running', 'claude-opus-4-8', 'Deploy bị treo?', []), { lastActivity: now - 20 * 60 * 1000 }),
      ],
      projects: [], scannedAt: now,
    };
  }

  // ---- Boot ----
  const isMock = new URLSearchParams(location.search).get('mock') === '1';
  function apply(data) {
    lastSnapshot = data;
    diff(data.sessions || []);
    render(data.sessions || []);
    updatePanels(data.sessions || []);
  }
  if (isMock) {
    pushEvent('info', 'Chế độ mock (demo handoff)');
    apply(mockSnapshot());
    window.LAAM.setConn(true);
  } else {
    window.LAAM.connectSSE(apply);
  }
})();
