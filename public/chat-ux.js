// LAAM — Chat UX & accessibility module.
// ===========================================================================
// One of the chat feature modules (loaded before the kernel chat.js, which
// calls init(ctx) after the store is built). Scope, in plain terms:
//
//   A) Empty-state PROMPT SUGGESTIONS — clickable chips under the welcome text
//      that fire store.send(...) so a new visitor can see the page's rich
//      rendering (code, tables, charts, maps) with one tap.
//   B) SCREEN-READER announcements — a single visually-hidden aria-live region
//      that says when a reply starts / finishes / stops / errors, plus a couple
//      of missing aria-labels on the composer buttons.
//   C) A "THINKING" indicator — animated dots shown inside the assistant bubble
//      between "generation started" and "first token", so the wait isn't blank.
//   D) Gentle FOCUS / SCROLL polish on stream end / start.
//
// Hard rules this module honours (six parallel agents touch this page):
//   • EXACTLY this one file. No edits to chat.js / chat.html / styles.css.
//   • CSS injected once via <style id="laam-ux-css">; everything scoped to
//     .laam-ux-* and reuses the theme tokens (works light + dark).
//   • Never throw out of init()/handlers; null-guard every mount.
//   • Lane: the COMPOSER owns the scroll-FAB element + slash/shortcuts; ACTIONS
//     owns per-message buttons; the KERNEL owns the error bubble's retry button.
//     We only *call* store methods (send/scrollToBottom/focusInput) — we never
//     add a second retry button or our own scroll FAB.
// ===========================================================================

(window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
  id: 'ux',
  init(ctx) {
    'use strict';
    if (!ctx || !ctx.store) return;
    const store = ctx.store;
    const esc = ctx.esc || ((s) => (s == null ? '' : String(s)));
    const T = (k, v) => (window.LAAMI18n ? window.LAAMI18n.t(k, v) : k);
    const mounts = ctx.mounts || {};
    const transcript = mounts.transcript || null;

    injectCss();

    // --- One shared visually-hidden live region (B) -----------------------
    // aria-atomic so each short status is read in full, polite so it never
    // interrupts the user. Appended once to <body>, outside the transcript's
    // own aria-live="polite" log so the two don't fight over the same text.
    let liveRegion = null;
    function ensureLiveRegion() {
      if (liveRegion && liveRegion.isConnected) return liveRegion;
      liveRegion = document.createElement('div');
      liveRegion.className = 'sr-only';
      liveRegion.id = 'laam-ux-live';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.setAttribute('role', 'status');
      document.body.appendChild(liveRegion);
      return liveRegion;
    }
    function announce(msg) {
      try {
        const r = ensureLiveRegion();
        // Clearing first makes a repeated identical phrase re-announce.
        r.textContent = '';
        // Next frame so assistive tech reliably picks up the change.
        requestAnimationFrame(() => { if (r.isConnected) r.textContent = msg; });
      } catch (e) { /* never throw */ }
    }

    // Add aria-labels ONLY where the kernel left them off. The textarea is
    // already labelled ("Soạn tin nhắn"); the send/stop buttons are text-only.
    function labelIfMissing(el, label) {
      try {
        if (el && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
          el.setAttribute('aria-label', label);
        }
      } catch (e) {}
    }
    labelIfMissing(mounts.sendBtn, T('chat.sendAria'));
    labelIfMissing(mounts.stopBtn, T('chat.stopAria'));
    labelIfMissing(mounts.input, T('chat.inputAria'));

    // ---------------------------------------------------------------------
    // A) EMPTY-STATE PROMPT SUGGESTIONS
    // ---------------------------------------------------------------------
    // Prompts picked to exercise the rich renderer: prose, code, a table, a
    // chart, and a map / directions block. UI text is Vietnamese.
    // Text resolved at build time via T(key) so chips follow the active language.
    const SUGGESTIONS = [
      { icon: '💡', key: 'chat.suggest1' },
      { icon: '🐍', key: 'chat.suggest2' },
      { icon: '📊', key: 'chat.suggest3' },
      { icon: '📈', key: 'chat.suggest4' },
      { icon: '🗺️', key: 'chat.suggest5' },
      { icon: '✍️', key: 'chat.suggest6' },
    ];

    function pickSuggestion(text) {
      if (!text || store.isStreaming()) return;
      try { store.send(text); } catch (e) {}
    }

    function buildSuggestions(host) {
      if (!host || host.querySelector('.laam-ux-suggest')) return; // once per empty render
      const grid = document.createElement('div');
      grid.className = 'laam-ux-suggest';
      grid.setAttribute('role', 'list');
      grid.setAttribute('aria-label', T('chat.suggestAria'));

      SUGGESTIONS.forEach((s) => {
        const text = T(s.key);
        const chip = document.createElement('div');
        chip.className = 'laam-ux-chip';
        chip.setAttribute('role', 'button');
        chip.setAttribute('tabindex', '0');
        chip.setAttribute('aria-label', text);
        chip.innerHTML =
          '<span class="laam-ux-chip-ico" aria-hidden="true">' + esc(s.icon) + '</span>' +
          '<span class="laam-ux-chip-txt">' + esc(text) + '</span>';
        chip.addEventListener('click', () => pickSuggestion(text));
        chip.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            pickSuggestion(text);
          }
        });
        grid.appendChild(chip);
      });

      host.appendChild(grid);
    }

    store.on('empty:rendered', (d) => {
      try { buildSuggestions(d && d.el); } catch (e) {}
    });

    // ---------------------------------------------------------------------
    // C) "THINKING" INDICATOR
    // ---------------------------------------------------------------------
    // The kernel re-renders the whole transcript on stream:start (and again on
    // every token), so we can't just append once and forget. Instead we track
    // which message index *should* show the indicator and (re)attach it both on
    // stream:start and on the message:rendered for that index — until the first
    // token arrives (message:stream) or the stream ends.
    let thinkingIndex = -1;

    function bubbleAt(index) {
      if (!transcript || index == null || index < 0) return null;
      const wrap = transcript.querySelector('.msg[data-index="' + index + '"]');
      return wrap ? wrap.querySelector('.bubble') : null;
    }

    // Treat a bubble as "empty" if it has no visible text yet. The kernel seeds
    // a streaming bubble with renderContent('') → '', so this is true at start.
    function bubbleHasText(bubble) {
      if (!bubble) return false;
      // Ignore our own indicator node when measuring: if it's the only child,
      // the bubble has no real content yet.
      const ind = bubble.querySelector('.laam-ux-thinking');
      if (ind && bubble.childNodes.length === 1) return false;
      if ((bubble.textContent || '').trim()) return true;
      // A code block / element with no text still counts as content.
      return !!bubble.querySelector('pre, .chat-chart, .chat-map-wrap, table, img');
    }

    function showThinking(index) {
      const bubble = bubbleAt(index);
      if (!bubble) return;
      if (bubbleHasText(bubble)) { clearThinking(); return; } // token already in
      if (bubble.querySelector('.laam-ux-thinking')) return;   // already showing
      // Suppress the kernel's blink caret while our dots are visible so we don't
      // stack two animations; removed again in clearThinking().
      bubble.classList.add('laam-ux-thinking-host');
      const ind = document.createElement('span');
      ind.className = 'laam-ux-thinking';
      ind.innerHTML =
        '<span class="laam-ux-dots" aria-hidden="true">' +
        '<span></span><span></span><span></span></span>' +
        '<span class="laam-ux-thinking-label">' + esc(T('chat.thinking')) + '</span>';
      bubble.appendChild(ind);
    }

    function clearThinking() {
      thinkingIndex = -1;
      if (!transcript) return;
      transcript.querySelectorAll('.laam-ux-thinking').forEach((n) => n.remove());
      transcript.querySelectorAll('.laam-ux-thinking-host').forEach((b) =>
        b.classList.remove('laam-ux-thinking-host')
      );
    }

    // ---------------------------------------------------------------------
    // STREAM lifecycle: announcements (B) + thinking (C) + scroll/focus (D)
    // ---------------------------------------------------------------------
    store.on('stream:start', (d) => {
      try {
        announce(T('chat.annGenerating'));
        thinkingIndex = d && typeof d.index === 'number' ? d.index : -1;
        showThinking(thinkingIndex);
        // (D) keep a newly-starting answer in view, but only if the user was
        // already at the bottom — never yank them up from scrollback.
        if (store.isAtBottom && store.isAtBottom()) {
          if (store.scrollToBottom) store.scrollToBottom();
        }
      } catch (e) {}
    });

    // The kernel re-renders message elements; re-attach the indicator for the
    // tracked index as long as no token has landed yet.
    store.on('message:rendered', (d) => {
      try {
        if (!d || d.index !== thinkingIndex) return;
        if (d.msg && d.msg.streaming) showThinking(thinkingIndex);
      } catch (e) {}
    });

    // First (and subsequent) tokens for the tracked index → drop the indicator.
    store.on('message:stream', (d) => {
      try {
        if (!d || d.index !== thinkingIndex) return;
        clearThinking();
      } catch (e) {}
    });

    store.on('stream:end', (d) => {
      try {
        clearThinking();
        const aborted = d && d.aborted;
        const error = d && d.error;
        announce(error ? T('chat.annError') : aborted ? T('chat.annStopped') : T('chat.annDone'));

        // (D) gentle focus return: only if the user isn't typing/interacting
        // with some other control. Body/transcript/null === "nothing focused".
        const ae = document.activeElement;
        const idle = !ae || ae === document.body || ae === transcript;
        if (idle && store.focusInput) store.focusInput();
      } catch (e) {}
    });

    // ---------------------------------------------------------------------
    // Scoped CSS (injected once). Includes the .sr-only utility, the
    // suggestion chips, and the three-dots animation.
    // ---------------------------------------------------------------------
    function injectCss() {
      if (document.querySelector('#laam-ux-css')) return;
      const style = document.createElement('style');
      style.id = 'laam-ux-css';
      style.textContent = [
        // Visually-hidden but available to screen readers.
        '.sr-only {',
        '  position: absolute !important; width: 1px; height: 1px; padding: 0; margin: -1px;',
        '  overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;',
        '}',
        // Empty-state suggestion chips.
        '.laam-ux-suggest {',
        '  display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));',
        '  gap: 8px; margin: 18px auto 0; max-width: 460px; text-align: left;',
        '}',
        '.laam-ux-chip {',
        '  display: flex; align-items: center; gap: 9px;',
        '  background: var(--bg-elev); border: 1px solid var(--border);',
        '  border-radius: 12px; padding: 10px 12px; cursor: pointer;',
        '  color: var(--text-dim); font-size: 13px; line-height: 1.4;',
        '  transition: border-color .12s ease, background .12s ease, color .12s ease, transform .12s ease;',
        '}',
        '.laam-ux-chip:hover {',
        '  background: var(--accent-soft); border-color: var(--accent);',
        '  color: var(--text); transform: translateY(-1px);',
        '}',
        '.laam-ux-chip:focus-visible {',
        '  outline: 2px solid var(--accent); outline-offset: 2px;',
        '  border-color: var(--accent); color: var(--text);',
        '}',
        '.laam-ux-chip-ico { font-size: 16px; line-height: 1; flex: 0 0 auto; }',
        '.laam-ux-chip-txt { min-width: 0; }',
        // Thinking indicator (caption-styled, lives inside the assistant bubble).
        '.laam-ux-thinking {',
        '  display: inline-flex; align-items: center; gap: 8px;',
        '  color: var(--text-faint); font-size: 13px; font-style: italic;',
        '}',
        '.laam-ux-thinking-label { font-family: var(--sans); }',
        // Hide the kernel blink caret while our dots are up (one animation only).
        '.bubble.laam-ux-thinking-host.cursor::after { content: none; }',
        // Three-dots animation.
        '.laam-ux-dots { display: inline-flex; align-items: center; gap: 3px; }',
        '.laam-ux-dots > span {',
        '  width: 5px; height: 5px; border-radius: 50%;',
        '  background: var(--text-faint); display: inline-block;',
        '  animation: laam-ux-dot 1.2s infinite ease-in-out both;',
        '}',
        '.laam-ux-dots > span:nth-child(1) { animation-delay: -0.32s; }',
        '.laam-ux-dots > span:nth-child(2) { animation-delay: -0.16s; }',
        '@keyframes laam-ux-dot {',
        '  0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }',
        '  40% { opacity: 1; transform: scale(1); }',
        '}',
        // Respect reduced-motion: keep the dots visible, just stop animating.
        '@media (prefers-reduced-motion: reduce) {',
        '  .laam-ux-dots > span { animation: none; opacity: 0.6; }',
        '  .laam-ux-chip { transition: none; }',
        '}',
        '@media (max-width: 520px) {',
        '  .laam-ux-suggest { grid-template-columns: 1fr; }',
        '}',
      ].join('\n');
      document.head.appendChild(style);
    }
  },
});
