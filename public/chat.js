// LAAM — Chat page: talk to a LOCAL Qwen 7B model via Ollama, streamed.
// The whole conversation is tracked as ONE LAAM session (stable sessionId).
(() => {
  const { esc } = window.LAAM;
  window.LAAM.initTheme();
  window.LAAM.buildHeader('', { conn: false });

  const $ = (s) => document.querySelector(s);
  const transcript = $('#transcript');
  const input = $('#input');
  const sendBtn = $('#send');
  const stopBtn = $('#stop');
  const sub = $('#chat-sub');

  // One stable conversation id, reused for every request => one LAAM session.
  const sessionId =
    'web-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

  // Full conversation history sent to the model each turn.
  const messages = [];
  let streaming = false;
  let controller = null;

  // ---- Self-injected CSS (once) ----
  if (!document.querySelector('#laam-chat-css')) {
    const style = document.createElement('style');
    style.id = 'laam-chat-css';
    style.textContent = `
      .chat {
        position: fixed; inset: 0; top: 57px;
        display: flex; flex-direction: column;
        max-width: 880px; width: 100%; margin: 0 auto;
        padding: 0 16px;
      }
      .chat-sub {
        flex: 0 0 auto;
        padding: 12px 4px 8px;
        font-size: 12.5px; color: var(--text-faint);
        display: flex; align-items: center; gap: 8px;
      }
      .chat-sub .badge-local {
        display: inline-flex; align-items: center; gap: 5px;
        padding: 2px 8px; border-radius: 999px;
        background: var(--accent-soft); color: var(--accent);
        font-weight: 600; font-size: 11.5px;
      }
      .transcript {
        flex: 1 1 auto; overflow-y: auto;
        display: flex; flex-direction: column; gap: 14px;
        padding: 8px 2px 20px;
      }
      .transcript .empty {
        margin: auto; text-align: center; color: var(--text-faint);
        font-size: 14px; max-width: 420px;
      }
      .msg { display: flex; flex-direction: column; max-width: 86%; }
      .msg.user { align-self: flex-end; align-items: flex-end; }
      .msg.assistant, .msg.error { align-self: flex-start; align-items: flex-start; }
      .bubble {
        padding: 10px 14px; border-radius: 14px;
        font-size: 14px; line-height: 1.55;
        white-space: pre-wrap; word-wrap: break-word; overflow-wrap: anywhere;
        box-shadow: var(--shadow);
      }
      .msg.user .bubble {
        background: var(--accent); color: #fff;
        border-bottom-right-radius: 4px;
      }
      .msg.assistant .bubble {
        background: var(--bg-elev); color: var(--text);
        border: 1px solid var(--border);
        border-bottom-left-radius: 4px;
      }
      .msg.error .bubble {
        background: var(--bg-elev); color: #dc2626;
        border: 1px solid #dc2626; border-bottom-left-radius: 4px;
      }
      .bubble pre {
        background: var(--bg-sunken); border: 1px solid var(--border);
        border-radius: 10px; padding: 10px 12px; margin: 8px 0;
        overflow-x: auto; font-family: var(--mono); font-size: 12.5px;
        line-height: 1.5; white-space: pre; color: var(--text);
      }
      .msg.user .bubble pre {
        background: rgba(255, 255, 255, 0.16);
        border-color: rgba(255, 255, 255, 0.28); color: #fff;
      }
      .caption {
        margin-top: 5px; font-size: 11.5px; color: var(--text-faint);
        font-family: var(--mono);
      }
      .cursor::after {
        content: '▍'; color: var(--text-faint);
        animation: laam-blink 1s steps(2, start) infinite;
      }
      @keyframes laam-blink { to { visibility: hidden; } }
      .dock { flex: 0 0 auto; padding: 10px 0 16px; }
      .dock-inner {
        display: flex; align-items: flex-end; gap: 8px;
        background: var(--bg-elev); border: 1px solid var(--border-strong);
        border-radius: 16px; padding: 8px 8px 8px 14px;
        box-shadow: var(--shadow);
      }
      .dock-inner textarea {
        flex: 1 1 auto; resize: none; border: 0; outline: 0;
        background: transparent; color: var(--text);
        font-family: var(--sans); font-size: 14px; line-height: 1.5;
        max-height: 200px; padding: 6px 0;
      }
      .dock-inner textarea::placeholder { color: var(--text-faint); }
      .send, .stop {
        flex: 0 0 auto; border: 0; cursor: pointer;
        border-radius: 11px; padding: 9px 18px;
        font-family: var(--sans); font-size: 13.5px; font-weight: 600;
      }
      .send { background: var(--accent); color: #fff; }
      .send:disabled { opacity: 0.45; cursor: default; }
      .stop { background: var(--bg-sunken); color: var(--text); border: 1px solid var(--border-strong); }
      .stop:hover { background: var(--border); }
    `;
    document.head.appendChild(style);
  }

  // ---- Model name line ----
  fetch('/api/chat/info')
    .then((r) => r.json())
    .then((d) => {
      const m = d && d.model ? d.model : 'qwen2.5-coder:7b';
      sub.innerHTML =
        `<span class="badge-local">⬡ LOCAL</span>` +
        `<span>${esc(prettyModel(m))} (local) · miễn phí</span>`;
    })
    .catch(() => {
      sub.innerHTML =
        `<span class="badge-local">⬡ LOCAL</span><span>Qwen2.5-Coder 7B (local) · miễn phí</span>`;
    });

  function prettyModel(m) {
    if (/qwen2\.5-coder/i.test(m)) return 'Qwen2.5-Coder 7B';
    if (/qwen/i.test(m)) return 'Qwen 7B';
    return m;
  }

  // ---- Rendering ----
  showEmpty();
  function showEmpty() {
    transcript.innerHTML =
      '<div class="empty">Bắt đầu trò chuyện với mô hình Qwen chạy cục bộ. ' +
      'Toàn bộ cuộc hội thoại được theo dõi như một phiên trong LAAM.</div>';
  }

  // Render text with fenced ```code blocks``` as <pre>; escape HTML first.
  function renderContent(text) {
    const parts = String(text).split(/```/);
    let html = '';
    for (let i = 0; i < parts.length; i++) {
      if (i % 2 === 1) {
        // Inside a fence: drop an optional language token on the first line.
        const nl = parts[i].indexOf('\n');
        const code = nl >= 0 ? parts[i].slice(nl + 1) : parts[i];
        html += `<pre>${esc(code)}</pre>`;
      } else {
        html += esc(parts[i]);
      }
    }
    return html;
  }

  function addBubble(role) {
    if (transcript.querySelector('.empty')) transcript.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + role;
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    wrap.appendChild(bubble);
    transcript.appendChild(wrap);
    scrollToBottom();
    return { wrap, bubble };
  }

  function scrollToBottom() {
    transcript.scrollTop = transcript.scrollHeight;
  }

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 200) + 'px';
  }

  // ---- Send / stream ----
  async function send() {
    if (streaming) return;
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    autoGrow();

    messages.push({ role: 'user', content: text });
    const u = addBubble('user');
    u.bubble.innerHTML = renderContent(text);

    setStreaming(true);

    const a = addBubble('assistant');
    a.bubble.classList.add('cursor');
    let acc = '';
    controller = new AbortController();
    let finalStats = null;

    try {
      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, messages }),
        signal: controller.signal,
      });

      if (!resp.ok || !resp.body) {
        // Try to surface a JSON {error} body if present.
        let detail = `HTTP ${resp.status}`;
        try {
          const j = await resp.json();
          if (j && j.error) detail = j.error;
        } catch {}
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
          let obj;
          try { obj = JSON.parse(line); } catch { continue; }

          if (obj.error) throw new Error(obj.error);

          if (obj.message && obj.message.content) {
            acc += obj.message.content;
            a.bubble.innerHTML = renderContent(acc);
            scrollToBottom();
          }
          if (obj.done) finalStats = obj;
        }
      }

      a.bubble.classList.remove('cursor');

      if (acc) {
        messages.push({ role: 'assistant', content: acc });
        a.bubble.innerHTML = renderContent(acc);
      } else {
        // No content at all — drop the empty bubble.
        a.wrap.remove();
      }

      if (finalStats && finalStats.eval_count && finalStats.eval_duration) {
        const tps = finalStats.eval_count / (finalStats.eval_duration / 1e9);
        const cap = document.createElement('div');
        cap.className = 'caption';
        cap.textContent = `7B · ${tps.toFixed(1)} tok/s · ${finalStats.eval_count} tokens`;
        a.wrap.appendChild(cap);
      }
      scrollToBottom();
    } catch (err) {
      a.bubble.classList.remove('cursor');
      const aborted = err && err.name === 'AbortError';
      if (aborted) {
        // Keep whatever partial text was generated.
        if (acc) {
          messages.push({ role: 'assistant', content: acc });
          const cap = document.createElement('div');
          cap.className = 'caption';
          cap.textContent = '⏹ đã dừng';
          a.wrap.appendChild(cap);
        } else {
          a.wrap.remove();
        }
      } else {
        if (!acc) a.wrap.remove();
        else messages.push({ role: 'assistant', content: acc });
        const e = addBubble('error');
        e.bubble.textContent = '⚠ Lỗi: ' + (err && err.message ? err.message : 'không gọi được mô hình.');
      }
      scrollToBottom();
    } finally {
      controller = null;
      setStreaming(false);
      input.focus();
    }
  }

  function setStreaming(on) {
    streaming = on;
    sendBtn.disabled = on;
    stopBtn.hidden = !on;
  }

  // ---- Events ----
  sendBtn.addEventListener('click', send);
  stopBtn.addEventListener('click', () => { if (controller) controller.abort(); });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  input.addEventListener('input', autoGrow);

  input.focus();
})();
