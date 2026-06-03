// LAAM — Agents Office (v2): an isometric 2.5D office that visualizes agent
// workflows live. Each project is a ROOM; orchestrator sessions are people at
// desks; Task sub-agents cluster around them; finished agents walk to the
// lounge (sofa / ping-pong). Handoffs animate; chat bubbles summarize work.
// Persistent avatars glide between positions. Driven by the existing SSE feed.
(() => {
  const { esc, ago, fmtDur, fmtUSD, fmtNum, shortModel, STATUS_VI, isStuck } = window.LAAM;
  const t = (k, v) => window.LAAM.t(k, v);
  window.LAAM.initTheme();
  window.LAAM.buildHeader();
  window.LAAM.loadConfig();

  const S = window.OfficeSprites, P = window.OfficePanels;
  const TW = (S && S.TILE_W) || 72, TH = (S && S.TILE_H) || 36;
  const $ = (s) => document.querySelector(s);
  const scene = $('#scene'), floor = $('#floor'), roomsSvg = $('#rooms'), furn = $('#furniture'),
    agentsEl = $('#agents'), plaques = $('#plaques'), links = $('#links'), stage = $('#stage');
  const NS = 'http://www.w3.org/2000/svg';

  const ORIGIN_X = 640, ORIGIN_Y = 150;
  const isoX = (c, r) => ORIGIN_X + (c - r) * TW / 2;
  const isoY = (c, r) => ORIGIN_Y + (c + r) * TH / 2;
  const depthZ = (c, r, off) => 100 + Math.round((c + r) * 6) + (off || 0);

  const FLOOR_COLS = 12;
  const LOUNGE_C = 14, LOUNGE_R = 0;
  const LOUNGE_SEATS = [
    [LOUNGE_C, LOUNGE_R + 2], [LOUNGE_C + 1, LOUNGE_R + 2],
    [LOUNGE_C + 1, LOUNGE_R + 4], [LOUNGE_C + 3, LOUNGE_R + 4],
    [LOUNGE_C + 3, LOUNGE_R + 1], [LOUNGE_C + 4, LOUNGE_R + 3],
  ];

  if (!$('#office-css')) {
    const st = document.createElement('style');
    st.id = 'office-css';
    st.textContent = `
      .office { position: fixed; inset: 0; top: 57px; overflow: hidden; background:
        radial-gradient(120% 120% at 60% 0%, color-mix(in srgb, var(--accent) 9%, var(--bg)) 0%, var(--bg) 55%); }
      .office-stage { position: absolute; inset: 0; overflow: auto; cursor: grab; }
      .office-stage.grabbing { cursor: grabbing; }
      .office-scene { position: relative; transform-origin: 0 0; width: 1640px; height: 980px; }
      .office-floor, .office-furniture, .office-agents, .office-plaques { position: absolute; left: 0; top: 0; }
      .office-rooms { position: absolute; left: 0; top: 0; z-index: 1; overflow: visible; pointer-events: none; }
      .office-plaques { z-index: 8000; }
      .office-links { position: absolute; left: 0; top: 0; z-index: 8500; pointer-events: none; overflow: visible; }
      .iso-item { position: absolute; }
      .iso-item.tile { z-index: 0; }
      .room-tint { transition: fill .4s ease; }
      .room-outline { fill: none; stroke-width: 2; opacity: .55; }
      .room-plaque { position: absolute; transform: translate(-50%,-100%); white-space: nowrap;
        font-size: 11px; font-weight: 800; letter-spacing: .2px; color: var(--text);
        background: color-mix(in srgb, var(--bg-elev) 88%, transparent); backdrop-filter: blur(6px);
        border: 1px solid var(--border); border-radius: 8px; padding: 3px 9px; box-shadow: var(--shadow);
        display: flex; align-items: center; gap: 7px; }
      .room-plaque .rsrc { font-size: 9px; padding: 0 5px; border-radius: 5px; }
      .office-node { position: absolute; transition: left 1.1s cubic-bezier(.34,1.2,.4,1), top 1.1s cubic-bezier(.34,1.2,.4,1), opacity .4s ease; }
      .office-node .av-wrap { position: relative; transform: translate(-50%, -100%); cursor: pointer; }
      .office-node.done .av-wrap { filter: saturate(.85); }
      .office-node.in-lounge .name-tag { opacity: .6; }
      .status-dot { position: absolute; top: -6px; left: 50%; transform: translateX(-50%);
        width: 9px; height: 9px; border-radius: 50%; box-shadow: 0 0 0 2px var(--bg-elev); color: var(--running); }
      .status-dot.running { background: var(--running); animation: opulse 1.6s infinite; }
      .status-dot.idle { background: var(--idle); color: var(--idle); }
      .status-dot.done { background: var(--done); color: var(--done); }
      .stuck-badge { position: absolute; top: -10px; right: -8px; width: 18px; height: 18px; border-radius: 50%;
        background: var(--error); color: #fff; font-size: 12px; font-weight: 800; display: grid; place-items: center;
        box-shadow: 0 0 0 2px var(--bg-elev); animation: opulse 1.2s infinite; }
      .name-tag { position: absolute; top: 2px; left: 50%; transform: translateX(-50%); white-space: nowrap;
        font-size: 10px; font-weight: 700; color: var(--text-dim);
        background: color-mix(in srgb, var(--bg-elev) 80%, transparent); padding: 1px 6px; border-radius: 6px; border: 1px solid var(--border); }
      .chat-bubble { position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%);
        max-width: 190px; font-size: 11px; line-height: 1.4; color: var(--text);
        background: var(--bg-elev); border: 1px solid var(--border); border-radius: 10px; padding: 6px 9px; box-shadow: var(--shadow); }
      .chat-bubble::after { content: ''; position: absolute; top: 100%; left: 50%; transform: translateX(-50%);
        border: 6px solid transparent; border-top-color: var(--bg-elev); }
      .chat-bubble .who { display: block; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: var(--text-faint); margin-bottom: 2px; }
      .chat-bubble .body { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
      .chat-bubble.tool .body { font-family: var(--mono); color: var(--accent); }
      @keyframes opulse { 0%{box-shadow:0 0 0 0 color-mix(in srgb, currentColor 60%, transparent)} 70%{box-shadow:0 0 0 6px transparent} 100%{box-shadow:0 0 0 0 transparent} }
      .link-line { stroke: var(--accent); stroke-width: 2; fill: none; opacity: .8; }
      .link-line.done { stroke: var(--border-strong); stroke-dasharray: 4 4; opacity: .5; }
      .link-packet { fill: var(--accent); }
      .office-panel { position: absolute; z-index: 30; }
      .office-panel.connected { top: 14px; left: 14px; width: 250px; }
      .office-panel.analytics { top: 14px; right: 14px; width: 214px; }
      .office-panel.console { bottom: 14px; left: 14px; right: 240px; }
      .office-controls { position: absolute; bottom: 14px; right: 14px; z-index: 30; display: flex; gap: 6px; align-items: center;
        background: color-mix(in srgb, var(--bg-elev) 86%, transparent); backdrop-filter: blur(8px); border: 1px solid var(--border); border-radius: 10px; padding: 6px 8px; }
      .office-controls .fsel { padding: 4px 9px; }
      @media (max-width: 720px) {
        /* Compact HUD so the iso scene stays usable on a phone. */
        .office-panel.connected { top: 10px; left: max(10px, env(safe-area-inset-left)); width: min(56vw, 220px); }
        .office-panel.connected .op-list { max-height: 132px; }
        .office-panel.console .op-log { max-height: 60px; }
        .office-panel.analytics { display: none; }   /* same numbers live on the dashboard */
        .office-panel.console {
          left: max(10px, env(safe-area-inset-left));
          right: max(10px, env(safe-area-inset-right));
          bottom: calc(58px + env(safe-area-inset-bottom));
        }
        .office-controls {
          bottom: calc(10px + env(safe-area-inset-bottom));
          right: max(10px, env(safe-area-inset-right));
          left: max(10px, env(safe-area-inset-left));
          flex-wrap: wrap; justify-content: flex-end;
        }
      }
    `;
    document.head.appendChild(st);
  }

  // ---- State ----
  let prev = new Map(), knownSubs = new Set(), events = [];
  // On phones the 1640×980 scene won't fit — start zoomed out so a useful chunk
  // is visible, then let the user pan (native scroll) / zoom (buttons).
  const isPhone = window.innerWidth <= 720;
  let showDone = false, scale = isPhone ? Math.max(0.42, Math.min(0.7, window.innerWidth / 700)) : 1, lastSnapshot = null;
  let didInitialScroll = false;
  const nodeEls = new Map();

  // Store the i18n key + vars so events can be re-translated on a language switch.
  const pushEvent = (kind, key, vars) => { events.unshift({ ts: Date.now(), kind, key, vars }); if (events.length > 120) events.length = 120; };
  const evText = (e) => e.key ? t(e.key, e.vars) : (e.text || '');
  const hueFor = (id) => { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360; return h; };

  function placeSprite(host, svg, col, row, z) {
    const w = document.createElement('div');
    w.className = 'iso-item' + (z === 0 ? ' tile' : '');
    w.style.left = isoX(col, row) + 'px';
    w.style.top = isoY(col, row) + 'px';
    w.style.transform = 'translate(-50%,-100%)';
    w.style.zIndex = String(z);
    w.appendChild(svg);
    host.appendChild(w);
  }

  // ---- Layout: sessions -> rooms (per project) of pods (orchestrator + subs) ----
  function visibleSessions(sessions) {
    const now = Date.now();
    let list = sessions.slice();
    if (!showDone) list = list.filter((s) => s.status !== 'done' || (s.lastActivity && now - s.lastActivity < 30 * 60 * 1000));
    const rank = (s) => (isStuck(s) ? 0 : s.status === 'running' ? 1 : s.status === 'idle' ? 2 : 3);
    list.sort((a, b) => rank(a) - rank(b) || (b.lastActivity || 0) - (a.lastActivity || 0));
    return list.slice(0, 28);
  }

  function computeLayout(sessions) {
    const groups = new Map();
    for (const s of sessions) {
      if (!groups.has(s.projectPath)) groups.set(s.projectPath, { name: s.project, source: s.source, sessions: [] });
      groups.get(s.projectPath).sessions.push(s);
    }
    const rooms = [], nodes = [], lnks = [];
    let rx = 0, ry = 0, rowH = 0;
    for (const g of groups.values()) {
      const maxRoomCols = 6;
      const pods = []; let c = 0, r = 0, rh = 0;
      for (const s of g.sessions) {
        const subs = (s.subAgents || []).slice(0, 4);
        const podW = Math.max(2, 1 + Math.ceil(subs.length / 2));
        const podH = subs.length > 0 ? 2 : 1;
        if (c + podW > maxRoomCols) { c = 0; r += rh + 1; rh = 0; }
        pods.push({ s, subs, c, r, podW, podH });
        rh = Math.max(rh, podH); c += podW + 1;
      }
      const roomW = Math.max(2, ...pods.map((p) => p.c + p.podW)) + 1;
      const roomH = (r + rh) + 2;
      if (rx + roomW > FLOOR_COLS && rx > 0) { rx = 0; ry += rowH + 2; rowH = 0; }
      const room = { col: rx, row: ry, w: roomW, h: roomH, name: g.name, source: g.source, hue: hueFor(g.name), n: g.sessions.length };
      rooms.push(room);
      for (const p of pods) {
        const oc = rx + 1 + p.c, or_ = ry + 1 + p.r;
        const okey = 's:' + p.s.id;
        nodes.push({ key: okey, session: p.s, sub: null, role: 'orchestrator', deskCol: oc, deskRow: or_, col: oc, row: or_, room });
        const slots = [];
        for (let dc = 1; dc < p.podW; dc++) slots.push([oc + dc, or_]);
        for (let dc = 0; dc < p.podW; dc++) slots.push([oc + dc, or_ + 1]);
        p.subs.forEach((a, i) => {
          const slot = slots[i] || [oc + 1 + i, or_ + 1];
          const skey = okey + '/a:' + a.id;
          nodes.push({ key: skey, session: p.s, sub: a, role: 'sub', deskCol: slot[0], deskRow: slot[1], col: slot[0], row: slot[1], room });
          lnks.push({ from: okey, to: skey, running: a.status === 'running' });
        });
      }
      rowH = Math.max(rowH, roomH); rx += roomW + 2;
    }
    // Finished orchestrators walk to the lounge (glide via persistent nodes).
    let seat = 0;
    for (const n of nodes) {
      if (n.role === 'orchestrator' && n.session.status === 'done' && seat < LOUNGE_SEATS.length) {
        n.col = LOUNGE_SEATS[seat][0]; n.row = LOUNGE_SEATS[seat][1]; n.inLounge = true; seat++;
      }
    }
    return { nodes, links: lnks, rooms };
  }

  const nodeStatus = (n) => n.role === 'sub' ? (n.sub.status === 'running' ? 'running' : 'done') : n.session.status;
  function nodeBubble(n) {
    if (n.role === 'sub') return { who: '⛓ ' + (n.sub.type || t('office.agentFallback')), text: n.sub.description || '', tool: false };
    const task = n.session.currentTask; if (!task) return null;
    const who = task.kind === 'user' ? t('office.bubbleRequest') : task.kind === 'tool' ? t('office.bubbleDoing') : task.kind === 'thinking' ? t('office.bubbleThinking') : t('office.bubbleActive');
    return { who, text: task.text || '', tool: task.kind === 'tool' };
  }
  const nodeLabel = (n) => n.role === 'sub' ? (n.sub.type || t('office.agentFallback')) : (n.session.source === 'local' ? '⬡ ' + n.session.project : n.session.project);

  function buildWrap(n, status) {
    const wrap = document.createElement('div'); wrap.className = 'av-wrap';
    wrap.appendChild(S.avatar({ status, role: n.role, hue: hueFor(n.session.id + (n.sub ? n.sub.id : '')) }));
    const dot = document.createElement('span'); dot.className = 'status-dot ' + status; wrap.appendChild(dot);
    if (n.role === 'orchestrator' && isStuck(n.session)) { const b = document.createElement('span'); b.className = 'stuck-badge'; b.textContent = '!'; wrap.appendChild(b); }
    const tag = document.createElement('span'); tag.className = 'name-tag'; tag.textContent = nodeLabel(n); wrap.appendChild(tag);
    if (status !== 'done') {
      const bb = nodeBubble(n);
      if (bb && bb.text) {
        const bubble = document.createElement('div'); bubble.className = 'chat-bubble' + (bb.tool ? ' tool' : '');
        bubble.innerHTML = `<span class="who">${esc(bb.who)}</span><span class="body">${esc((bb.text || '').slice(0, 130))}</span>`;
        wrap.appendChild(bubble);
      }
    }
    wrap.onclick = (e) => { e.stopPropagation(); openDrawer(n.session); };
    return wrap;
  }

  // ---- Render ----
  function render(sessions) {
    floor.innerHTML = ''; furn.innerHTML = ''; roomsSvg.innerHTML = ''; plaques.innerHTML = ''; links.innerHTML = '';
    const shown = visibleSessions(sessions);
    const { nodes, links: lnks, rooms } = computeLayout(shown);

    const tilesC = Math.max(FLOOR_COLS, LOUNGE_C + 6);
    const tilesR = Math.max(8, ...rooms.map((rm) => rm.row + rm.h), 7);
    for (let rr = 0; rr < tilesR; rr++) for (let cc = 0; cc < tilesC; cc++) {
      const inLounge = cc >= LOUNGE_C - 1 && rr <= 5;
      placeSprite(floor, S.floorTile({ variant: inLounge ? 'lawn' : 'floor' }), cc, rr, 0);
    }

    rooms.forEach((rm) => {
      const A = [isoX(rm.col, rm.row), isoY(rm.col, rm.row)], B = [isoX(rm.col + rm.w, rm.row), isoY(rm.col + rm.w, rm.row)];
      const C = [isoX(rm.col + rm.w, rm.row + rm.h), isoY(rm.col + rm.w, rm.row + rm.h)], D = [isoX(rm.col, rm.row + rm.h), isoY(rm.col, rm.row + rm.h)];
      const pts = `${A} ${B} ${C} ${D}`;
      const fill = document.createElementNS(NS, 'polygon'); fill.setAttribute('points', pts);
      fill.setAttribute('class', 'room-tint'); fill.setAttribute('fill', `hsla(${rm.hue},60%,55%,0.10)`); roomsSvg.appendChild(fill);
      const out = document.createElementNS(NS, 'polygon'); out.setAttribute('points', pts);
      out.setAttribute('class', 'room-outline'); out.setAttribute('stroke', `hsl(${rm.hue},55%,58%)`); roomsSvg.appendChild(out);
      const pl = document.createElement('div'); pl.className = 'room-plaque';
      pl.style.left = isoX(rm.col + rm.w / 2, rm.row) + 'px'; pl.style.top = (isoY(rm.col + rm.w / 2, rm.row) - 6) + 'px';
      pl.innerHTML = `<span>${esc(rm.name)}</span><span class="rsrc" style="background:hsla(${rm.hue},60%,55%,.16);color:hsl(${rm.hue},55%,55%)">${rm.source === 'local' ? t('office.srcLocal') : t('office.srcClaude')} ·${rm.n}</span>`;
      plaques.appendChild(pl);
    });

    placeSprite(furn, S.sofa(), LOUNGE_C, LOUNGE_R + 1, depthZ(LOUNGE_C, LOUNGE_R + 1, 1));
    placeSprite(furn, S.pingPong(), LOUNGE_C + 2, LOUNGE_R + 4, depthZ(LOUNGE_C + 2, LOUNGE_R + 4, 1));
    placeSprite(furn, S.meetingTable(), LOUNGE_C + 4, LOUNGE_R + 1, depthZ(LOUNGE_C + 4, LOUNGE_R + 1, 1));
    placeSprite(furn, S.plant(), LOUNGE_C + 5, LOUNGE_R, depthZ(LOUNGE_C + 5, LOUNGE_R, 1));
    placeSprite(furn, S.plant(), 0, tilesR - 1, depthZ(0, tilesR - 1, 1));

    const posByKey = new Map();
    nodes.forEach((n) => {
      placeSprite(furn, S.chair(), n.deskCol, n.deskRow + 0.18, depthZ(n.deskCol, n.deskRow, 0));
      placeSprite(furn, S.desk(), n.deskCol, n.deskRow, depthZ(n.deskCol, n.deskRow, 1));
    });

    const desired = new Set();
    nodes.forEach((n) => {
      desired.add(n.key);
      const status = nodeStatus(n);
      let el = nodeEls.get(n.key); const fresh = !el;
      if (fresh) { el = document.createElement('div'); el.className = 'office-node'; el.style.opacity = '0'; el.style.left = isoX(n.col, n.row) + 'px'; el.style.top = (isoY(n.col, n.row) - 8) + 'px'; agentsEl.appendChild(el); nodeEls.set(n.key, el); }
      el.className = 'office-node ' + status + (n.inLounge ? ' in-lounge' : '');
      el.style.left = isoX(n.col, n.row) + 'px';
      el.style.top = (isoY(n.col, n.row) - 8) + 'px';
      el.style.zIndex = String(depthZ(n.col, n.row, 4));
      el.innerHTML = ''; el.appendChild(buildWrap(n, status));
      if (fresh) requestAnimationFrame(() => { el.style.opacity = '1'; });
      posByKey.set(n.key, { x: isoX(n.col, n.row), y: isoY(n.col, n.row) - 8 });
    });
    for (const [k, el] of [...nodeEls]) { if (!desired.has(k)) { el.style.opacity = '0'; setTimeout(() => el.remove(), 420); nodeEls.delete(k); } }

    lnks.forEach((l) => {
      const a = posByKey.get(l.from), b = posByKey.get(l.to); if (!a || !b) return;
      const y1 = a.y - 24, y2 = b.y - 24, path = `M ${a.x} ${y1} L ${b.x} ${y2}`;
      const line = document.createElementNS(NS, 'path'); line.setAttribute('d', path);
      line.setAttribute('class', 'link-line ' + (l.running ? 'running' : 'done')); links.appendChild(line);
      if (l.running) {
        const pk = document.createElementNS(NS, 'circle'); pk.setAttribute('r', '4'); pk.setAttribute('class', 'link-packet');
        const am = document.createElementNS(NS, 'animateMotion'); am.setAttribute('dur', '2s'); am.setAttribute('repeatCount', 'indefinite'); am.setAttribute('path', path);
        pk.appendChild(am); links.appendChild(pk);
      }
    });

    applyScale();
  }

  // ---- Panels ----
  function updatePanels(sessions) {
    const all = sessions.map((s) => ({ id: s.id, label: s.project, model: s.model, status: s.status, source: s.source, stuck: isStuck(s) }));
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
    P.events($('#panel-console'), events.map((e) => ({ ts: e.ts, kind: e.kind, text: evText(e) })));
  }

  // ---- SSE diff -> events ----
  function diff(sessions) {
    const cur = new Map(sessions.map((s) => [s.id, s]));
    for (const s of sessions) {
      const p = prev.get(s.id);
      if (!p) pushEvent('start', 'office.evNewSession', { project: s.project, model: shortModel(s.model) });
      else {
        if (p.status !== 'done' && s.status === 'done') pushEvent('done', 'office.evDone', { project: s.project, model: shortModel(s.model) });
        if (!isStuck(p) && isStuck(s)) pushEvent('stuck', 'office.evStuck', { project: s.project, model: shortModel(s.model) });
      }
      for (const a of s.subAgents || []) {
        const k = s.id + ':' + a.id;
        if (!knownSubs.has(k)) { knownSubs.add(k); pushEvent('spawn', 'office.evSpawn', { project: s.project, type: a.type || t('office.agentFallback'), desc: a.description ? ' (' + a.description.slice(0, 30) + ')' : '' }); }
      }
    }
    prev = cur;
  }

  // ---- Drawer ----
  const drawer = $('#drawer'), scrim = $('#scrim');
  const closeDrawer = () => { drawer.classList.remove('open'); scrim.classList.remove('open'); };
  $('#d-close').onclick = closeDrawer; scrim.onclick = closeDrawer;
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });
  async function openDrawer(s) {
    $('#d-title').textContent = s.project + (s.source === 'local' ? t('office.drawerLocalSuffix') : '');
    $('#d-path').textContent = `${s.id.slice(0, 12)} · ${shortModel(s.model)} · ${window.LAAM.statusLabel ? window.LAAM.statusLabel(s.status) : t('status.' + s.status)}`;
    $('#d-body').innerHTML = `<div class="empty">${esc(t('office.drawerLoading'))}</div>`;
    drawer.classList.add('open'); scrim.classList.add('open');
    try {
      const d = await (await fetch('/api/session/' + s.id)).json();
      const head = `<div class="meta" style="margin-bottom:14px">
        <span class="m"><b>${fmtDur(d.durationMs)}</b></span><span class="m"><b>${d.messageCount}</b> ${esc(t('office.msgUnit'))}</span>
        <span class="m"><b>${d.toolUseCount}</b> ${esc(t('office.toolUnit'))}</span><span class="m">💲<b>${fmtUSD(d.costUSD)}</b></span></div>`;
      const tl = (d.timeline || []).slice(-40).map((it) => {
        const role = it.sidechain ? 'tool' : it.role;
        return `<div class="tl-item"><div class="tl-role ${role}">${role}</div><div class="tl-text ${it.kind === 'tool' || it.kind === 'result' ? 'mono' : ''}">${esc((it.text || '').slice(0, 400))}</div></div>`;
      }).join('');
      $('#d-body').innerHTML = head + `<div class="tl">${tl || `<div class="empty">${esc(t('office.drawerNoActivity'))}</div>`}</div>`;
    } catch { $('#d-body').innerHTML = `<div class="empty">${esc(t('office.drawerLoadError'))}</div>`; }
  }

  // ---- Camera: zoom + drag-to-pan ----
  const applyScale = () => { scene.style.transform = `scale(${scale})`; };
  $('#zoom-in').onclick = () => { scale = Math.min(1.6, scale + 0.15); applyScale(); };
  $('#zoom-out').onclick = () => { scale = Math.max(0.5, scale - 0.15); applyScale(); };
  $('#zoom-fit').onclick = () => { scale = 1; applyScale(); stage.scrollTo({ left: 300, top: 0, behavior: 'smooth' }); };
  $('#show-done').onchange = (e) => { showDone = e.target.checked; if (lastSnapshot) { render(lastSnapshot.sessions); updatePanels(lastSnapshot.sessions); } };
  let dragging = false, sx = 0, sy = 0, sl = 0, stp = 0;
  stage.addEventListener('mousedown', (e) => {
    if (e.target.closest('.av-wrap') || e.target.closest('.office-controls')) return;
    dragging = true; sx = e.clientX; sy = e.clientY; sl = stage.scrollLeft; stp = stage.scrollTop; stage.classList.add('grabbing');
  });
  window.addEventListener('mousemove', (e) => { if (!dragging) return; stage.scrollLeft = sl - (e.clientX - sx); stage.scrollTop = stp - (e.clientY - sy); });
  window.addEventListener('mouseup', () => { dragging = false; stage.classList.remove('grabbing'); });

  // ---- Mock (?mock=1): includes a live status flip to show walk-to-lounge ----
  function mockSnapshot(flip) {
    const now = Date.now();
    const mk = (id, project, source, status, model, task, subs) => ({
      id, project, projectPath: project, source, model, status,
      startTime: now - 600000, lastActivity: now - (status === 'done' ? 1200000 : 4000),
      durationMs: 600000, messageCount: 40, userMessageCount: 12, assistantMessageCount: 28,
      toolUseCount: 30, subAgentCount: (subs || []).length, tokens: { input: 12000, output: 8000 }, costUSD: 0.1,
      currentTask: task ? { kind: 'tool', text: task } : null, subAgents: subs || [],
    });
    const sub = (id, type, desc, status) => ({ id, type, description: desc, status, startTime: now - 120000, durationMs: 90000 });
    return { scannedAt: now, projects: [], sessions: [
      mk('orch-1', 'LAAM', 'claude', 'running', 'claude-opus-4-8', 'Refactor parser + thêm endpoint stats', [
        sub('a1', 'Explore', 'tìm call-site', 'done'), sub('a2', 'general-purpose', 'viết module mới', 'running'), sub('a3', 'code-reviewer', 'review diff', 'running')]),
      mk('orch-2', 'webapp', 'claude', flip ? 'done' : 'running', 'claude-sonnet-4-6', 'Dựng trang đăng nhập', []),
      mk('orch-3', 'data-pipe', 'claude', 'running', 'claude-opus-4-8', 'Chạy ETL hằng đêm', [sub('b1', 'general-purpose', 'transform bảng', 'running')]),
      mk('loc-1', 'Ollama (local)', 'local', 'running', 'qwen2.5-coder:7b', 'Sinh quicksort bằng Python', []),
      mk('loc-2', 'Ollama (local)', 'local', 'done', 'qwen2.5-coder:7b', 'Đã trả lời xong', []),
      Object.assign(mk('orch-4', 'infra', 'claude', 'running', 'claude-opus-4-8', 'Deploy bị treo?', []), { lastActivity: now - 20 * 60 * 1000 }),
    ] };
  }

  // ---- Re-render on language switch ----
  // Static data-i18n nodes (controls) are handled by applyDOM; JS-built canvas
  // labels, plaques, bubbles, drawer + panels must be re-rendered from cache.
  window.addEventListener('laam:lang', () => {
    if (!lastSnapshot) return;
    render(lastSnapshot.sessions || []);
    updatePanels(lastSnapshot.sessions || []);
  });

  // ---- Boot ----
  const isMock = new URLSearchParams(location.search).get('mock') === '1';
  function apply(data) {
    lastSnapshot = data; diff(data.sessions || []); render(data.sessions || []); updatePanels(data.sessions || []);
    if (isPhone && !didInitialScroll) { didInitialScroll = true; requestAnimationFrame(() => stage.scrollTo({ left: 120 * scale, top: 0 })); }
  }
  if (isMock) {
    pushEvent('info', 'office.evMockMode');
    apply(mockSnapshot(false));
    window.LAAM.setConn(true);
    setTimeout(() => { pushEvent('done', 'office.evMockDone'); apply(mockSnapshot(true)); }, 3500);
  } else {
    window.LAAM.connectSSE(apply);
  }
})();
