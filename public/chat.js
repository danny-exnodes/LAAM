// LAAM — Chat KERNEL.
// ===========================================================================
// This file is the FOUNDATION the chat feature modules build on. It owns:
//   • state: conversations[] (each = a tracked LAAM session), current id,
//     streaming flag, pending attachments
//   • persistence: localStorage (versioned)
//   • the network turn: send / stream (NDJSON from /api/chat) / stop /
//     regenerate / editMessage / deleteMessage
//   • transcript rendering (delegates rich render to chat-render.js / chat-geo.js)
//   • a tiny event bus + a module registry
//
// Feature modules live in their own files (chat-history.js, chat-actions.js,
// chat-composer.js, chat-settings.js, chat-export.js, chat-ux.js). Each one
// registers itself BEFORE this file runs:
//
//     (window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
//       id: 'history',
//       init(ctx) { /* ctx.store, ctx.mounts, ctx.esc, ctx.ago, ... */ },
//     });
//
// The kernel builds the store, then calls every registered module's init(ctx).
//
// ---------------------------------------------------------------------------
// STORE API  (window.LAAMChat) — the contract for modules
// ---------------------------------------------------------------------------
//   on(ev, fn) -> unsubscribe();  off(ev, fn);  emit(ev, data)
//   getConversations() -> [conversation]            (newest-first)
//   getCurrent() -> conversation|null
//   getConversationById(id) -> conversation|null
//   getMessages() -> [message]                       (current conversation)
//   newConversation(opts?) -> conversation           (creates + switches)
//   switchConversation(id)
//   deleteConversation(id)
//   renameConversation(id, title)
//   clearMessages()                                  (wipe current conversation)
//   getSettings() -> settings;  updateSettings(partial)
//   send(text)                                       (uses pending attachments)
//   stop()
//   regenerate(index?)                               (re-run; default = last turn)
//   editMessage(index, newText)                      (user msg → truncate + resend)
//   deleteMessage(index)
//   retryLast()
//   isStreaming() -> bool
//   getAttachments() -> [att];  addAttachment(att);  removeAttachment(i);  clearAttachments()
//   scrollToBottom();  isAtBottom() -> bool;  setAutoScroll(bool)
//   toggleSidebar(); openSidebar(); closeSidebar()
//   focusInput();  setModelInfo(html)
//   esc, ago, fmtNum, renderContent                  (helpers)
//
// conversation = { id, title, createdAt, updatedAt, messages:[message], settings:{} }
// message      = { role:'user'|'assistant', content, text?, ts, attachments?, stats?, stopped?, streaming? }
//
// EVENTS
//   conversations:change (conversations)   list/order/title changed
//   conversation:switch  (conversation)    current conversation changed
//   messages:change      (messages)        current message list re-rendered
//   message:rendered     ({el,bubble,actionsEl,role,index,msg})  per message, every (re)render
//   message:stream       ({index,text,bubble})                   streaming token tick
//   stream:start         ({index})
//   stream:end           ({index,msg,aborted,error})
//   settings:change      (settings)
//   attachments:change   (attachments)
//   scroll:state         ({atBottom})
//   empty:rendered       ({el})            empty-state element (for prompt chips)
//   error:rendered       ({el, message, retry})  an error bubble was rendered
//   error                ({message})
// ===========================================================================
(() => {
  const L = window.LAAM || {};
  const esc = L.esc || ((s) => (s == null ? '' : String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))));
  const T = (k, v) => (L.t ? L.t(k, v) : (window.LAAMI18n ? window.LAAMI18n.t(k, v) : k));
  const ago = L.ago || ((ts) => '');
  const fmtNum = L.fmtNum || ((n) => String(n));
  if (L.initTheme) L.initTheme();
  if (L.buildHeader) L.buildHeader('', { conn: false });

  const $ = (s) => document.querySelector(s);
  const transcript = $('#transcript');
  const input = $('#input');
  const sendBtn = $('#send');
  const stopBtn = $('#stop');
  const subInfo = $('#chat-sub-info');
  const attachEl = $('#attachments');
  const fileInput = $('#file-input');
  const scrim = $('#sidebar-scrim');
  const chatEl = $('#chat');

  // ---- base CSS (layout + bubbles + dock). Modules inject their own scoped CSS. ----
  injectBaseCss();

  // ======================================================================
  // Event bus
  // ======================================================================
  const listeners = Object.create(null);
  function on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn); return () => off(ev, fn); }
  function off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter((f) => f !== fn); }
  function emit(ev, data) { (listeners[ev] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error('[chat] listener', ev, e); } }); }

  // ======================================================================
  // State + persistence
  // ======================================================================
  const LS_KEY = 'laam.chat.v1';
  let conversations = [];
  let currentId = null;
  let streaming = false;
  let controller = null;
  let attachments = []; // pending { name, text, kind }
  let pendingError = null; // transient (not persisted)
  let autoScroll = true;

  function genId() { return 'c-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7); }
  function current() { return conversations.find((c) => c.id === currentId) || null; }
  function byId(id) { return conversations.find((c) => c.id === id) || null; }
  function messages() { const c = current(); return c ? c.messages : []; }
  function touch(c) { if (c) c.updatedAt = Date.now(); }
  function defaultSettings() { return {}; }

  let saveTimer = null;
  function save() {
    if (saveTimer) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const data = {
          v: 1,
          currentId,
          conversations: conversations.map((c) => ({
            id: c.id, title: c.title, createdAt: c.createdAt, updatedAt: c.updatedAt,
            settings: c.settings || {},
            messages: (c.messages || []).filter((m) => !m.streaming).map((m) => ({
              role: m.role, content: m.content, text: m.text, ts: m.ts,
              attachments: m.attachments, stats: m.stats, stopped: m.stopped, model: m.model,
            })),
          })),
        };
        localStorage.setItem(LS_KEY, JSON.stringify(data));
      } catch (e) { /* quota / private mode — ignore */ }
    }, 250);
  }
  function load() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (data && Array.isArray(data.conversations)) {
        conversations = data.conversations.filter((c) => c && c.id).map((c) => ({
          id: c.id, title: c.title || '', createdAt: c.createdAt || Date.now(),
          updatedAt: c.updatedAt || c.createdAt || Date.now(), settings: c.settings || {},
          messages: Array.isArray(c.messages) ? c.messages : [],
        }));
        currentId = data.currentId && byId(data.currentId) ? data.currentId : (conversations[0] && conversations[0].id) || null;
      }
    } catch (e) { conversations = []; currentId = null; }
  }

  // ======================================================================
  // Conversation operations
  // ======================================================================
  function ensureConversation() { return current() || newConversation(); }

  function newConversation(opts) {
    const c = {
      id: genId(), title: '', createdAt: Date.now(), updatedAt: Date.now(),
      settings: Object.assign(defaultSettings(), (opts && opts.settings) || {}), messages: [],
    };
    conversations.unshift(c);
    currentId = c.id;
    clearAttachments();
    pendingError = null;
    emit('conversations:change', conversations);
    emit('conversation:switch', c);
    renderTranscript();
    save();
    return c;
  }

  function switchConversation(id) {
    if (!byId(id) || id === currentId) { closeSidebarMobile(); return; }
    currentId = id;
    clearAttachments();
    pendingError = null;
    emit('conversation:switch', current());
    renderTranscript();
    closeSidebarMobile();
    save();
  }

  function deleteConversation(id) {
    const i = conversations.findIndex((c) => c.id === id);
    if (i < 0) return;
    const wasCurrent = id === currentId;
    conversations.splice(i, 1);
    emit('conversations:change', conversations);
    if (wasCurrent) {
      if (conversations.length) { currentId = conversations[0].id; emit('conversation:switch', current()); renderTranscript(); }
      else { newConversation(); }
    }
    save();
  }

  function renameConversation(id, title) {
    const c = byId(id);
    if (!c) return;
    c.title = String(title || '').slice(0, 120);
    touch(c);
    emit('conversations:change', conversations);
    save();
  }

  function clearMessages() {
    const c = current();
    if (!c) return;
    c.messages = [];
    pendingError = null;
    touch(c);
    emit('messages:change', c.messages);
    emit('conversations:change', conversations);
    renderTranscript();
    save();
  }

  function maybeAutoTitle(c, seed) {
    if (c.title) return;
    const t = String(seed || '').trim().split('\n')[0].slice(0, 60);
    if (t) { c.title = t; emit('conversations:change', conversations); }
  }

  function getSettings() { const c = current(); return (c && c.settings) || {}; }
  function updateSettings(partial) {
    const c = ensureConversation();
    c.settings = Object.assign({}, c.settings, partial || {});
    touch(c);
    emit('settings:change', c.settings);
    save();
  }

  // ======================================================================
  // Attachments (files / URLs). Composer adds drag-drop/paste on top.
  // ======================================================================
  function renderAttachments() {
    if (!attachEl) return;
    attachEl.innerHTML = attachments
      .map((a, i) => `<span class="attach-chip" title="${esc(T('chat.attachChars', { name: a.name, n: (a.text || '').length }))}">${a.kind === 'url' ? '🔗' : '📎'} ${esc(a.name)}<button data-i="${i}" class="x" aria-label="${esc(T('chat.attachRemoveAria'))}">×</button></span>`)
      .join('');
    emit('attachments:change', attachments);
  }
  function getAttachments() { return attachments; }
  function addAttachment(att) { if (att) { attachments.push(att); renderAttachments(); } }
  function removeAttachment(i) { attachments.splice(i, 1); renderAttachments(); }
  function clearAttachments() { attachments = []; renderAttachments(); }

  // ======================================================================
  // Send / stream
  // ======================================================================
  async function send(text) {
    if (streaming) return;
    text = String(text == null ? '' : text);
    const atts = attachments.slice();
    if (!text.trim() && !atts.length) return;

    const c = ensureConversation();

    let content = text;
    if (atts.length) {
      const ctx = atts.map((a) => `${T('chat.attachDocLabel', { name: a.name })}\n${a.text}`).join('\n\n');
      content = ctx + '\n\n---\n\n' + text;
    }
    c.messages.push({
      role: 'user', content, text, ts: Date.now(),
      attachments: atts.map((a) => ({ name: a.name, kind: a.kind, chars: (a.text || '').length })),
    });
    maybeAutoTitle(c, text || (atts[0] && atts[0].name) || '');
    clearAttachments();
    pendingError = null;
    touch(c);
    emit('messages:change', c.messages);
    emit('conversations:change', conversations);
    renderTranscript();

    // Location awareness: if the message implies the user's position/surroundings
    // ("quanh đây", "near me", "vị trí của tôi"…), acquire the device GPS NOW so
    // the permission prompt fires on send, and reverse-geocode it for context.
    if (window.LAAMChatGeo && window.LAAMChatGeo.needsLocation && window.LAAMChatGeo.needsLocation(text)) {
      try { await window.LAAMChatGeo.ensureLocationContext(); } catch (e) {}
    }

    await streamAssistant(c);
  }

  function bubbleAt(i) { const w = transcript.querySelector('.msg[data-index="' + i + '"]'); return w ? w.querySelector('.bubble') : null; }

  async function streamAssistant(c) {
    const idx = c.messages.length; // assistant lands here
    const modelUsed = (c.settings && c.settings.model) || null;
    const aMsg = { role: 'assistant', content: '', ts: Date.now(), streaming: true, model: modelUsed };
    c.messages.push(aMsg);
    renderTranscript();
    setStreaming(true);
    emit('stream:start', { index: idx });
    controller = new AbortController();

    let acc = '';
    let finalStats = null;
    let aborted = false;
    let errMsg = null;

    try {
      const s = c.settings || {};
      const body = {
        sessionId: c.id,
        messages: c.messages.filter((m) => !m.streaming).map((m) => ({ role: m.role, content: m.content })),
      };
      if (s.model) body.model = s.model;
      if (s.system) body.system = s.system;
      // Tell the backend which language to answer in (current UI language) so
      // the model replies in the user's language instead of drifting.
      body.lang = (window.LAAMI18n && window.LAAMI18n.getLang) ? window.LAAMI18n.getLang() : 'vi';
      // If we already know the user's location (acquired in send()), pass it so
      // the model answers "nearby / my coordinates" instead of refusing.
      var loc = (window.LAAMChatGeo && window.LAAMChatGeo.getLocationContext) ? window.LAAMChatGeo.getLocationContext() : null;
      if (loc && typeof loc.lat === 'number') body.location = loc;
      const options = {};
      if (typeof s.temperature === 'number') options.temperature = s.temperature;
      if (typeof s.top_p === 'number') options.top_p = s.top_p;
      if (typeof s.num_predict === 'number') options.num_predict = s.num_predict;
      if (Object.keys(options).length) body.options = options;

      const resp = await fetch('/api/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body), signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        let detail = 'HTTP ' + resp.status;
        try { const j = await resp.json(); if (j && j.error) detail = j.error; } catch (e) {}
        throw new Error(detail);
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          let obj; try { obj = JSON.parse(line); } catch (e) { continue; }
          if (obj.error) throw new Error(obj.error);
          if (obj.message && obj.message.content) {
            acc += obj.message.content;
            aMsg.content = acc;
            const b = bubbleAt(idx);
            if (b) { b.innerHTML = renderContent(acc); b.classList.add('cursor'); }
            emit('message:stream', { index: idx, text: acc, bubble: b });
            maybeAutoScroll();
          }
          if (obj.done) finalStats = obj;
        }
      }
    } catch (err) {
      if (err && err.name === 'AbortError') aborted = true;
      else errMsg = (err && err.message) ? err.message : T('chat.errModel');
    } finally {
      controller = null;
      setStreaming(false);
    }

    aMsg.streaming = false;
    if (finalStats && finalStats.eval_count && finalStats.eval_duration) {
      aMsg.stats = { tps: finalStats.eval_count / (finalStats.eval_duration / 1e9), tokens: finalStats.eval_count };
    }
    if (acc) { aMsg.content = acc; if (aborted) aMsg.stopped = true; }
    else { const i = c.messages.indexOf(aMsg); if (i >= 0) c.messages.splice(i, 1); }
    if (errMsg) { pendingError = errMsg; emit('error', { message: errMsg }); }

    touch(c);
    emit('messages:change', c.messages);
    emit('conversations:change', conversations);
    renderTranscript();
    emit('stream:end', { index: idx, msg: aMsg, aborted, error: errMsg });
    save();
  }

  function stop() { if (controller) controller.abort(); }

  function regenerate(index) {
    if (streaming) return;
    const c = current();
    if (!c || !c.messages.length) return;
    let i = index;
    if (i == null) { for (let k = c.messages.length - 1; k >= 0; k--) { if (c.messages[k].role === 'assistant') { i = k; break; } } }
    if (i == null) return;
    c.messages = c.messages.slice(0, i); // drop the assistant turn (and anything after)
    pendingError = null;
    renderTranscript();
    streamAssistant(c);
  }

  function editMessage(index, newText) {
    if (streaming) return;
    const c = current();
    if (!c) return;
    const m = c.messages[index];
    if (!m || m.role !== 'user') return;
    m.text = String(newText || '');
    m.content = m.text;
    m.attachments = [];
    c.messages = c.messages.slice(0, index + 1); // diverge: drop everything after the edited turn
    pendingError = null;
    touch(c);
    emit('messages:change', c.messages);
    renderTranscript();
    streamAssistant(c);
  }

  function deleteMessage(index) {
    const c = current();
    if (!c || !c.messages[index]) return;
    c.messages.splice(index, 1);
    touch(c);
    emit('messages:change', c.messages);
    emit('conversations:change', conversations);
    renderTranscript();
    save();
  }

  function retryLast() {
    const c = current();
    if (!c) return;
    pendingError = null;
    const last = c.messages[c.messages.length - 1];
    if (last && last.role === 'user') { renderTranscript(); streamAssistant(c); }
    else regenerate();
  }

  function setStreaming(on) {
    streaming = on;
    if (sendBtn) sendBtn.disabled = on;
    if (stopBtn) stopBtn.hidden = !on;
  }

  // ======================================================================
  // Rendering
  // ======================================================================
  // Streaming-time renderer: fenced ```code``` → <pre>, everything escaped.
  function renderContent(text) {
    const parts = String(text == null ? '' : text).split(/```/);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        const nl = parts[i].indexOf('\n');
        const code = nl >= 0 ? parts[i].slice(nl + 1) : parts[i];
        html += '<pre>' + esc(code) + '</pre>';
      } else html += esc(parts[i]);
    }
    return html;
  }

  // Rich render for a COMPLETED assistant message (markdown, tables, charts, maps).
  async function renderAssistant(bubble, text) {
    let resolved = text;
    if (window.LAAMChatGeo && /```map|"markers"|"directions"/.test(text)) {
      try { resolved = await window.LAAMChatGeo.resolveMaps(text); } catch (e) {}
    }
    if (window.LAAMChatRender && typeof window.LAAMChatRender.renderMessage === 'function') {
      try { window.LAAMChatRender.renderMessage(resolved, bubble); return; } catch (e) {}
    }
    bubble.innerHTML = renderContent(resolved);
  }

  function showEmpty() {
    const div = document.createElement('div');
    div.className = 'empty';
    div.id = 'chat-empty';
    div.textContent = T('chat.empty');
    transcript.appendChild(div);
    emit('empty:rendered', { el: div });
  }

  function buildMsgEl(m, i) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + (m.role === 'user' ? 'user' : m.role === 'assistant' ? 'assistant' : 'error');
    wrap.dataset.index = i;
    wrap.dataset.role = m.role;

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.appendChild(bubble);

    if (m.role === 'user') {
      bubble.innerHTML = renderContent(m.text != null ? m.text : m.content) +
        (m.attachments && m.attachments.length ? '<div class="caption">' + esc(T('chat.attachedCaption', { n: m.attachments.length })) + '</div>' : '');
    } else if (m.streaming) {
      bubble.classList.add('cursor');
      bubble.innerHTML = renderContent(m.content);
    } else {
      renderAssistant(bubble, m.content);
    }

    const actions = document.createElement('div');
    actions.className = 'msg-actions';
    wrap.appendChild(actions);

    if (m.role === 'assistant' && m.stats) {
      const cap = document.createElement('div');
      cap.className = 'caption';
      const modelLabel = m.model ? prettyModel(m.model) : '7B';
      cap.textContent = T('chat.statsCaption', { model: modelLabel, tps: m.stats.tps.toFixed(1), tokens: m.stats.tokens });
      wrap.appendChild(cap);
    }
    if (m.stopped) {
      const cap = document.createElement('div');
      cap.className = 'caption';
      cap.textContent = T('chat.stopped');
      wrap.appendChild(cap);
    }

    emit('message:rendered', { el: wrap, bubble: bubble, actionsEl: actions, role: m.role, index: i, msg: m });
    return wrap;
  }

  function buildErrorEl(msg) {
    const wrap = document.createElement('div');
    wrap.className = 'msg error';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = T('chat.errPrefix', { msg: msg });
    wrap.appendChild(bubble);
    const retry = document.createElement('button');
    retry.className = 'msg-retry';
    retry.type = 'button';
    retry.textContent = T('chat.errRetry');
    retry.addEventListener('click', () => retryLast());
    wrap.appendChild(retry);
    emit('error:rendered', { el: wrap, message: msg, retry: retryLast });
    return wrap;
  }

  function renderTranscript() {
    const msgs = messages();
    transcript.innerHTML = '';
    if (!msgs.length && !pendingError) { showEmpty(); return; }
    for (let i = 0; i < msgs.length; i++) transcript.appendChild(buildMsgEl(msgs[i], i));
    if (pendingError) transcript.appendChild(buildErrorEl(pendingError));
    maybeAutoScroll(true);
  }

  // ======================================================================
  // Scrolling
  // ======================================================================
  function isAtBottom() { return transcript.scrollHeight - transcript.scrollTop - transcript.clientHeight < 48; }
  function scrollToBottom() { transcript.scrollTop = transcript.scrollHeight; autoScroll = true; emit('scroll:state', { atBottom: true }); }
  function setAutoScroll(v) { autoScroll = !!v; }
  function maybeAutoScroll(force) { if (force || autoScroll) transcript.scrollTop = transcript.scrollHeight; }
  if (transcript) transcript.addEventListener('scroll', () => { autoScroll = isAtBottom(); emit('scroll:state', { atBottom: autoScroll }); });

  // ======================================================================
  // Sidebar toggle (kernel owns the drawer mechanics; history fills content)
  // ======================================================================
  function isMobile() { return window.matchMedia('(max-width: 860px)').matches; }
  function openSidebar() { if (isMobile()) { chatEl.classList.add('sidebar-open'); if (scrim) scrim.hidden = false; } else chatEl.classList.remove('sidebar-collapsed'); }
  function closeSidebar() { if (isMobile()) { chatEl.classList.remove('sidebar-open'); if (scrim) scrim.hidden = true; } else chatEl.classList.add('sidebar-collapsed'); }
  function closeSidebarMobile() { if (isMobile()) { chatEl.classList.remove('sidebar-open'); if (scrim) scrim.hidden = true; } }
  function toggleSidebar() {
    if (isMobile()) { const open = chatEl.classList.toggle('sidebar-open'); if (scrim) scrim.hidden = !open; }
    else chatEl.classList.toggle('sidebar-collapsed');
  }
  const sidebarToggleBtn = $('#sidebar-toggle');
  if (sidebarToggleBtn) sidebarToggleBtn.addEventListener('click', toggleSidebar);
  if (scrim) scrim.addEventListener('click', closeSidebarMobile);

  // ======================================================================
  // Model info line
  // ======================================================================
  function prettyModel(m) {
    if (/qwen2\.5-coder/i.test(m)) return 'Qwen2.5-Coder' + (/14b/i.test(m) ? ' 14B' : ' 7B');
    if (/qwen/i.test(m)) return 'Qwen ' + (/14b/i.test(m) ? '14B' : '7B');
    return m;
  }
  function setModelInfo(html) { if (subInfo) subInfo.innerHTML = html; }
  function defaultModelBadge(m) {
    return '<span class="badge-local">' + esc(T('chat.badgeLocal')) + '</span><span>' + esc(T('chat.modelLocalFree', { model: prettyModel(m) })) + '</span>';
  }
  let lastBadgeModel = 'qwen2.5-coder:7b';
  fetch('/api/chat/info').then((r) => r.json())
    .then((d) => { lastBadgeModel = (d && d.model) || 'qwen2.5-coder:7b'; setModelInfo(defaultModelBadge(lastBadgeModel)); })
    .catch(() => setModelInfo(defaultModelBadge(lastBadgeModel)));

  // ======================================================================
  // Baseline composer wiring (works even if chat-composer.js is absent)
  // ======================================================================
  function autoGrow() { if (!input) return; input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 200) + 'px'; }
  function focusInput() { if (input) input.focus(); }

  if (sendBtn) sendBtn.addEventListener('click', () => { const t = input.value; input.value = ''; autoGrow(); input.dispatchEvent(new Event('input', { bubbles: true })); send(t); });
  if (stopBtn) stopBtn.addEventListener('click', stop);
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); const t = input.value; input.value = ''; autoGrow(); input.dispatchEvent(new Event('input', { bubbles: true })); send(t); }
    });
    input.addEventListener('input', autoGrow);
  }

  // file / URL attach (baseline; composer adds drag-drop + paste)
  if (attachEl) attachEl.addEventListener('click', (e) => { const x = e.target.closest('.x'); if (x) removeAttachment(Number(x.dataset.i)); });
  const attachFileBtn = $('#attach-file');
  if (attachFileBtn) attachFileBtn.addEventListener('click', () => fileInput && fileInput.click());
  if (fileInput) fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    // Live progress chip — OCR (images / scanned PDFs) can take a few seconds.
    const chip = { name: file.name, text: '', kind: 'file' };
    addAttachment(chip);
    try {
      const r = await window.LAAMChatIngest.parseFile(file, (msg) => { chip.name = msg; renderAttachments(); });
      chip.name = r.name + (r.truncated ? T('chat.truncatedSuffix') : '');
      chip.text = r.text;
      renderAttachments();
    } catch (err) {
      attachments = attachments.filter((a) => a !== chip); renderAttachments();
      pendingError = (err && err.message) || T('chat.errReadFile'); renderTranscript();
    }
  });
  const attachUrlBtn = $('#attach-url');
  if (attachUrlBtn) attachUrlBtn.addEventListener('click', async () => {
    const url = window.prompt(T('chat.urlPrompt'));
    if (!url) return;
    const chip = { name: T('chat.urlLoading'), text: '', kind: 'url' };
    addAttachment(chip);
    try {
      const r = await window.LAAMChatIngest.fetchUrl(url.trim());
      chip.name = (r.title || r.url) + (r.truncated ? T('chat.truncatedSuffix') : '');
      chip.text = 'URL: ' + r.url + '\n' + T('chat.urlMetaTitle', { title: r.title }) + '\n\n' + r.text;
      renderAttachments();
    } catch (err) { attachments = attachments.filter((a) => a !== chip); renderAttachments(); pendingError = (err && err.message) || T('chat.errLoadUrl'); renderTranscript(); }
  });

  // "Use my current location" — primes the geolocation permission (so the GPS
  // prompt happens on this explicit tap) and drops a hint into the composer so
  // the model phrases a from-my-location request. Real coords are resolved at
  // map-render time by chat-geo.js.
  const attachLocBtn = $('#attach-loc');
  if (attachLocBtn) attachLocBtn.addEventListener('click', async () => {
    attachLocBtn.disabled = true;
    let pos = null;
    try { if (window.LAAMChatGeo && window.LAAMChatGeo.getCurrentPosition) pos = await window.LAAMChatGeo.getCurrentPosition(); } catch (e) {}
    attachLocBtn.disabled = false;
    if (!pos) { pendingError = T('chat.locDenied'); renderTranscript(); return; }
    if (input) {
      const hint = T('chat.locHint');
      const v = input.value;
      input.value = (v && !/\s$/.test(v) ? v + ' ' : v) + hint + ' ';
      input.focus();
      autoGrow();
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  // ======================================================================
  // Store + module init
  // ======================================================================
  const store = {
    on, off, emit,
    getConversations: () => conversations, getCurrent: current, getConversationById: byId, getMessages: messages,
    newConversation, switchConversation, deleteConversation, renameConversation, clearMessages,
    getSettings, updateSettings,
    send, stop, regenerate, editMessage, deleteMessage, retryLast,
    isStreaming: () => streaming,
    getAttachments, addAttachment, removeAttachment, clearAttachments,
    scrollToBottom, isAtBottom, setAutoScroll,
    toggleSidebar, openSidebar, closeSidebar,
    focusInput, setModelInfo,
    esc, ago, fmtNum, renderContent, prettyModel,
  };
  window.LAAMChat = store;

  const ctx = {
    store, esc, ago, fmtNum,
    mounts: {
      chat: chatEl, sidebar: $('#chat-sidebar'), scrim, main: $('#chat-main'),
      sub: $('#chat-sub'), subInfo, toolbar: $('#chat-toolbar'),
      transcript, scrollBtn: $('#scroll-bottom'),
      dock: $('.dock'), dockInner: $('.dock-inner'), composerToolbar: $('#composer-toolbar'),
      input, sendBtn, stopBtn,
      attachFileBtn, attachUrlBtn, attachmentsEl: attachEl, fileInput,
      sidebarToggle: sidebarToggleBtn,
    },
  };

  (window.LAAM_CHAT_MODULES || []).forEach((m) => {
    try { if (m && typeof m.init === 'function') m.init(ctx); }
    catch (e) { console.error('[chat] module init failed:', m && m.id, e); }
  });

  // ======================================================================
  // Boot
  // ======================================================================
  load();
  if (!conversations.length) newConversation();
  else { emit('conversations:change', conversations); emit('conversation:switch', current()); renderTranscript(); }
  focusInput();
  // Enable the drawer slide-transition only AFTER the first paint, so the
  // mobile sidebar starts fully off-screen instead of animating in (and
  // momentarily covering the chat) on load.
  if (chatEl) requestAnimationFrame(() => requestAnimationFrame(() => chatEl.classList.add('sidebar-anim')));

  // ----------------------------------------------------------------------
  // Re-render dynamic JS content on a language switch. Static data-i18n nodes
  // are handled by common.js/applyDOM; here we rebuild JS-built content:
  //   • the transcript (captions, empty-state, error bubble) — also re-emits
  //     message:rendered so every feature module re-localizes its per-message UI
  //   • pending attachment chips
  //   • the default model badge (settings module re-localizes its own badge)
  // Feature modules subscribe to laam:lang themselves for their toolbar/panels.
  window.addEventListener('laam:lang', () => {
    try { renderAttachments(); } catch (e) {}
    try { renderTranscript(); } catch (e) {}
    // Re-localize the badge. Prefer the current conversation's chosen model (the
    // settings module also re-applies on its own onChange, but covering it here
    // keeps the badge correct even if that module is absent).
    try {
      const s = getSettings();
      setModelInfo(defaultModelBadge((s && s.model) || lastBadgeModel));
    } catch (e) {}
  });

  // ----------------------------------------------------------------------
  function injectBaseCss() {
    if (document.querySelector('#laam-chat-css')) return;
    const style = document.createElement('style');
    style.id = 'laam-chat-css';
    style.textContent = `
      .chat { position: fixed; inset: 0; top: 57px; display: flex; }
      .chat-sidebar {
        flex: 0 0 264px; width: 264px; background: var(--bg-elev);
        border-right: 1px solid var(--border); display: flex; flex-direction: column;
        overflow: hidden; min-height: 0;
      }
      .chat.sidebar-collapsed .chat-sidebar { display: none; }
      .sidebar-scrim { display: none; }
      .chat-main {
        flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column;
        position: relative;
        /* Own stacking context so Leaflet's high z-index panes/controls (~400+)
           stay CONTAINED here and never paint over the sidebar drawer (z 30) or
           its scrim (z 25) on mobile. */
        z-index: 0;
        padding-left: max(0px, env(safe-area-inset-left)); padding-right: max(0px, env(safe-area-inset-right));
      }
      .chat-sub, .transcript, .dock { width: 100%; max-width: 880px; margin: 0 auto; padding-left: 16px; padding-right: 16px; }
      .chat-sub {
        flex: 0 0 auto; display: flex; align-items: center; gap: 8px;
        padding-top: 12px; padding-bottom: 8px;
        font-size: 12.5px; color: var(--text-faint);
      }
      .chat-sub-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
      .chat-sub-spacer { flex: 1 1 auto; }
      .chat-toolbar { display: flex; align-items: center; gap: 6px; flex: 0 0 auto; }
      .sidebar-toggle {
        flex: 0 0 auto; border: 1px solid var(--border); background: var(--bg-sunken);
        color: var(--text-dim); cursor: pointer; border-radius: 8px; width: 30px; height: 30px;
        font-size: 15px; line-height: 1; display: grid; place-items: center;
      }
      .sidebar-toggle:hover { color: var(--text); }
      .chat-sub .badge-local {
        display: inline-flex; align-items: center; gap: 5px; padding: 2px 8px; border-radius: 999px;
        background: var(--accent-soft); color: var(--accent); font-weight: 600; font-size: 11.5px;
      }
      .transcript {
        flex: 1 1 auto; overflow-y: auto; display: flex; flex-direction: column; gap: 14px;
        padding-top: 8px; padding-bottom: 20px;
      }
      .transcript .empty { margin: auto; text-align: center; color: var(--text-faint); font-size: 14px; max-width: 460px; }
      .msg { display: flex; flex-direction: column; max-width: 86%; position: relative; }
      .msg.user { align-self: flex-end; align-items: flex-end; }
      .msg.assistant, .msg.error { align-self: flex-start; align-items: flex-start; }
      .bubble {
        padding: 10px 14px; border-radius: 14px; font-size: 14px; line-height: 1.55;
        white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere; box-shadow: var(--shadow);
      }
      .msg.user .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
      .msg.assistant .bubble { background: var(--bg-elev); color: var(--text); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
      .msg.error .bubble { background: var(--bg-elev); color: var(--error); border: 1px solid var(--error); border-bottom-left-radius: 4px; }
      .bubble pre {
        background: var(--bg-sunken); border: 1px solid var(--border); border-radius: 10px;
        padding: 10px 12px; margin: 8px 0; overflow-x: auto; font-family: var(--mono);
        font-size: 12.5px; line-height: 1.5; white-space: pre; color: var(--text);
      }
      .msg.user .bubble pre { background: rgba(255,255,255,0.16); border-color: rgba(255,255,255,0.28); color: #fff; }
      .caption { margin-top: 5px; font-size: 11.5px; color: var(--text-faint); font-family: var(--mono); }
      .cursor::after { content: '▍'; color: var(--text-faint); animation: laam-blink 1s steps(2, start) infinite; }
      @keyframes laam-blink { to { visibility: hidden; } }
      .msg-actions { display: flex; gap: 4px; margin-top: 4px; opacity: 0; transition: opacity .12s ease; }
      .msg:hover .msg-actions, .msg:focus-within .msg-actions { opacity: 1; }
      .msg-actions button, .msg-retry {
        border: 1px solid var(--border); background: var(--bg-elev); color: var(--text-dim);
        border-radius: 7px; padding: 3px 8px; font-size: 11.5px; cursor: pointer; line-height: 1.4;
        font-family: var(--sans);
      }
      .msg-actions button:hover, .msg-retry:hover { color: var(--text); background: var(--bg-sunken); }
      .msg-retry { margin-top: 6px; align-self: flex-start; }
      .scroll-bottom {
        position: absolute; left: 50%; transform: translateX(-50%);
        bottom: 96px; z-index: 5; width: 34px; height: 34px; border-radius: 50%;
        border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text-dim);
        cursor: pointer; box-shadow: var(--shadow); font-size: 16px; line-height: 1;
      }
      .scroll-bottom:hover { color: var(--text); }
      .dock { flex: 0 0 auto; padding-top: 10px; padding-bottom: calc(16px + env(safe-area-inset-bottom)); }
      .dock-inner {
        display: flex; align-items: flex-end; gap: 8px; background: var(--bg-elev);
        border: 1px solid var(--border-strong); border-radius: 16px; padding: 8px 8px 8px 14px;
        box-shadow: var(--shadow); min-width: 0;
      }
      .dock-inner textarea {
        flex: 1 1 auto; min-width: 0; resize: none; border: 0; outline: 0; background: transparent;
        color: var(--text); font-family: var(--sans); font-size: 16px; line-height: 1.5; max-height: 200px; padding: 6px 0;
      }
      .dock-inner textarea::placeholder { color: var(--text-faint); }
      .send, .stop { flex: 0 0 auto; border: 0; cursor: pointer; border-radius: 11px; padding: 9px 18px; font-family: var(--sans); font-size: 13.5px; font-weight: 600; }
      .send { background: var(--accent); color: #fff; }
      .send:disabled { opacity: 0.45; cursor: default; }
      .stop { background: var(--bg-sunken); color: var(--text); border: 1px solid var(--border-strong); }
      .stop:hover { background: var(--border); }
      .attach { flex: 0 0 auto; border: 0; cursor: pointer; background: transparent; font-size: 17px; line-height: 1; padding: 7px 4px; opacity: 0.75; }
      .attach:hover { opacity: 1; }
      .attachments { display: flex; flex-wrap: wrap; gap: 6px; }
      .attachments:not(:empty) { padding-bottom: 8px; }
      .composer-toolbar:not(:empty) { padding-bottom: 6px; }
      .attach-chip {
        display: inline-flex; align-items: center; gap: 6px; background: var(--bg-sunken);
        border: 1px solid var(--border); border-radius: 999px; padding: 3px 6px 3px 10px;
        font-size: 12px; color: var(--text-dim); max-width: 260px; overflow: hidden;
      }
      .attach-chip .x {
        border: 0; background: var(--border); color: var(--text); width: 16px; height: 16px;
        border-radius: 50%; cursor: pointer; font-size: 12px; line-height: 1; display: grid; place-items: center;
      }
      .attach-chip .x:hover { background: var(--error); color: #fff; }
      @media (max-width: 860px) {
        .chat-sidebar {
          position: absolute; z-index: 30; top: 0; bottom: 0; left: 0; width: min(82vw, 300px);
          transform: translateX(-100%); box-shadow: var(--shadow);
          pointer-events: none; /* a CLOSED drawer must never swallow taps */
        }
        /* Animate only after first paint (kernel adds .sidebar-anim) so the
           closed drawer doesn't slide in over the chat — and never gets stuck
           mid-transition covering the screen. */
        .chat.sidebar-anim .chat-sidebar { transition: transform .22s ease; }
        .chat.sidebar-collapsed .chat-sidebar { display: flex; }
        .chat.sidebar-open .chat-sidebar { transform: none; pointer-events: auto; }
        /* Scrim shows ONLY while the drawer is open. It used to be display:block
           unconditionally, which overrode the [hidden] attribute and left an
           invisible full-screen overlay blocking every tap on mobile. */
        .sidebar-scrim { display: none; position: absolute; inset: 0; z-index: 25; background: rgba(0,0,0,0.38); }
        .chat.sidebar-open .sidebar-scrim { display: block; }
        .msg { max-width: 92%; }
        .dock-inner { gap: 5px; padding: 6px 6px 6px 10px; }
        .send, .stop { padding: 9px 14px; }
        .attach { padding: 7px 2px; font-size: 18px; }
        .msg-actions { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
})();
