// LAAM — Chat feature module: per-message ACTION TOOLBAR.
// ===========================================================================
// Adds small icon+label buttons under every message bubble:
//   • Chép        — copy the message text to the clipboard (both roles)
//   • Sửa         — edit & resend a USER message inline (textarea)
//   • Tạo lại     — regenerate an ASSISTANT message
//   • Xoá         — delete a single message (both roles)
//
// The kernel (chat.js) emits `message:rendered` for EVERY message on EVERY
// (re)render with a fresh, empty `.msg-actions` container reserved for us. We
// simply (re)populate it each time — elements are never stale, so no dedupe
// and no persistent refs are needed.
//
// House style mirrors chat-render.js: an IIFE, defensive try/wraps so we never
// throw out of init() or a handler, theme tokens for light+dark, Vietnamese UI.
// The kernel already styles `.msg-actions button` (bordered, hover-revealed);
// we lean on that and inject only the few extra rules edit-mode needs.
// ===========================================================================

(window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
  id: 'actions',
  init: function (ctx) {
    'use strict';
    try {
      var store = ctx && ctx.store;
      if (!store) return;
      var esc = (ctx && ctx.esc) || function (s) { return s == null ? '' : String(s); };
      var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };

      injectCss();

      // -- helpers ----------------------------------------------------------
      function streaming() {
        try { return !!store.isStreaming(); } catch (e) { return false; }
      }

      // Copy text via the async Clipboard API, falling back to a hidden
      // textarea + execCommand('copy') for non-secure contexts / old browsers.
      function copyText(text) {
        text = text == null ? '' : String(text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
        }
        return Promise.resolve(legacyCopy(text));
      }
      function legacyCopy(text) {
        try {
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.top = '-1000px';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          var ok = document.execCommand('copy');
          document.body.removeChild(ta);
          return ok ? Promise.resolve() : Promise.reject(new Error('copy failed'));
        } catch (e) {
          return Promise.reject(e);
        }
      }

      var L = window.LAAM || {};
      function iconSvg(name) { return L.icon ? L.icon(name, { size: 13, class: 'lc' }) : ''; }

      // Build one toolbar button: a Lucide icon + a label span. `iconName` is a
      // kebab-case lucide name; pass '' for a label-only button.
      function mkBtn(label, title, iconName) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'laam-act-btn';
        var ic = iconName ? iconSvg(iconName) : '';
        b.innerHTML = ic + '<span class="laam-act-lbl"></span>';
        b.querySelector('.laam-act-lbl').textContent = label;
        if (title) { b.title = title; b.setAttribute('aria-label', title); }
        return b;
      }

      // Disable an action button when streaming, with a hint why.
      function setBusyState(btn) {
        if (streaming()) {
          btn.disabled = true;
          btn.title = T('chat.actBusy');
          btn.setAttribute('aria-disabled', 'true');
        } else {
          btn.disabled = false;
          btn.removeAttribute('aria-disabled');
        }
      }

      // -- per-message render ----------------------------------------------
      function populate(ev) {
        if (!ev || !ev.actionsEl) return;
        var actionsEl = ev.actionsEl;
        var bubble = ev.bubble;
        var role = ev.role;
        var index = ev.index;
        var msg = ev.msg || {};

        // The text the user sees/edits vs. the full content (incl. attachment
        // context). Copy prefers full content; edit prefers the typed text.
        var fullText = msg.content != null ? msg.content : (msg.text != null ? msg.text : '');
        var typedText = msg.text != null ? msg.text : fullText;

        // ----- Chép (both roles) -----
        var copyBtn = mkBtn(T('chat.actCopy'), T('chat.actCopyTitle'), 'copy');
        copyBtn.addEventListener('click', function () {
          copyText(fullText).then(function () {
            flash(copyBtn, T('chat.actCopied'), 'check');
          }, function () {
            flash(copyBtn, T('chat.actCopyErr'), 'x');
          });
        });
        actionsEl.appendChild(copyBtn);

        // ----- Sửa (user only) -----
        if (role === 'user') {
          var editBtn = mkBtn(T('chat.actEdit'), T('chat.actEditTitle'), 'pencil-line');
          setBusyState(editBtn);
          editBtn.addEventListener('click', function () {
            if (streaming()) { hint(editBtn); return; }
            enterEdit(bubble, actionsEl, index, typedText);
          });
          actionsEl.appendChild(editBtn);
        }

        // ----- Tạo lại (assistant only) -----
        if (role === 'assistant') {
          var regenBtn = mkBtn(T('chat.actRegen'), T('chat.actRegenTitle'), 'rotate-cw');
          setBusyState(regenBtn);
          regenBtn.addEventListener('click', function () {
            if (streaming()) { hint(regenBtn); return; }
            try { store.regenerate(index); } catch (e) {}
          });
          actionsEl.appendChild(regenBtn);
        }

        // ----- Xoá (both roles) -----
        var delBtn = mkBtn(T('chat.actDelete'), T('chat.actDeleteTitle'), 'trash-2');
        setBusyState(delBtn);
        delBtn.addEventListener('click', function () {
          if (streaming()) { hint(delBtn); return; }
          var ok;
          try { ok = window.confirm(T('chat.actDeleteConfirm')); } catch (e) { ok = false; }
          if (!ok) return;
          try { store.deleteMessage(index); } catch (e) {}
        });
        actionsEl.appendChild(delBtn);
      }

      // Briefly swap a button's label + icon (e.g. a check + "Đã chép"), then
      // restore it. `okIcon` is an optional lucide name for the flash state.
      function flash(btn, label, okIcon) {
        if (!btn || btn.dataset.flashing === '1') return;
        var lbl = btn.querySelector('.laam-act-lbl');
        if (!lbl) return;
        var icEl = btn.querySelector('svg');
        var prev = lbl.textContent;
        var prevIc = icEl ? icEl.outerHTML : '';
        btn.dataset.flashing = '1';
        lbl.textContent = label;
        if (okIcon && icEl) icEl.outerHTML = iconSvg(okIcon);
        btn.classList.add('laam-act-ok');
        setTimeout(function () {
          // Guard: the button may have been removed by a re-render meanwhile.
          if (!btn.isConnected) return;
          var l2 = btn.querySelector('.laam-act-lbl');
          if (l2) l2.textContent = prev;
          var s2 = btn.querySelector('svg');
          if (s2 && prevIc) s2.outerHTML = prevIc;
          btn.classList.remove('laam-act-ok');
          btn.dataset.flashing = '0';
        }, 1200);
      }

      // Subtle nudge when an action is attempted mid-stream.
      function hint(btn) {
        if (!btn) return;
        btn.classList.add('laam-act-shake');
        setTimeout(function () { if (btn.isConnected) btn.classList.remove('laam-act-shake'); }, 360);
      }

      // -- inline edit mode -------------------------------------------------
      // Swap the bubble's content for a textarea + Save/Cancel. We capture the
      // bubble's current innerHTML so Cancel restores it without a re-render.
      function enterEdit(bubble, actionsEl, index, initialText) {
        if (!bubble || bubble.dataset.editing === '1') return;
        bubble.dataset.editing = '1';
        var originalHtml = bubble.innerHTML;

        // Hide the toolbar while editing to keep things tidy.
        if (actionsEl) actionsEl.style.display = 'none';

        bubble.textContent = '';
        var box = document.createElement('div');
        box.className = 'laam-act-edit';

        var ta = document.createElement('textarea');
        ta.className = 'laam-act-edit-ta';
        ta.value = initialText == null ? '' : String(initialText);
        ta.setAttribute('aria-label', T('chat.editAria'));
        box.appendChild(ta);

        var row = document.createElement('div');
        row.className = 'laam-act-edit-row';
        var saveBtn = mkBtn(T('chat.editSave'), T('chat.editSaveTitle'), 'check');
        saveBtn.classList.add('laam-act-primary');
        var cancelBtn = mkBtn(T('chat.editCancel'), T('chat.editCancelTitle'), 'x');
        row.appendChild(saveBtn);
        row.appendChild(cancelBtn);
        box.appendChild(row);

        bubble.appendChild(box);

        // Auto-size to content and focus with the caret at the end.
        function autosize() {
          ta.style.height = 'auto';
          ta.style.height = Math.min(ta.scrollHeight, 320) + 'px';
        }
        ta.addEventListener('input', autosize);
        // Defer so the textarea is laid out before we measure it.
        requestAnimationFrame(function () {
          autosize();
          try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) {}
        });

        function restore() {
          // Re-render hasn't happened; rebuild the original bubble content.
          bubble.innerHTML = originalHtml;
          bubble.dataset.editing = '0';
          if (actionsEl) actionsEl.style.display = '';
        }

        function commit() {
          if (streaming()) { hint(saveBtn); return; }
          var val = ta.value;
          // editMessage truncates + re-streams → kernel re-renders, which
          // discards this edit UI for us. No manual restore needed.
          try { store.editMessage(index, val); } catch (e) { restore(); }
        }

        saveBtn.addEventListener('click', commit);
        cancelBtn.addEventListener('click', restore);
        ta.addEventListener('keydown', function (e) {
          // Enter (no Shift) saves; Esc cancels. Shift+Enter inserts a newline.
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); commit(); }
          else if (e.key === 'Escape') { e.preventDefault(); restore(); }
        });
      }

      // -- wire up ----------------------------------------------------------
      store.on('message:rendered', function (ev) {
        try { populate(ev); } catch (e) { /* never throw out of a listener */ }
      });

      // -- scoped CSS (injected once) --------------------------------------
      function injectCss() {
        if (document.querySelector('#laam-actions-css')) return;
        var style = document.createElement('style');
        style.id = 'laam-actions-css';
        style.textContent = [
          // Lean on the kernel's base .msg-actions button styling; add only
          // the extras. Icon + label sit on one baseline-aligned row.
          '.msg-actions button.laam-act-btn { display: inline-flex; align-items: center; gap: 5px; }',
          '.laam-act-edit-row .laam-act-btn { display: inline-flex; align-items: center; gap: 5px; }',
          // A subtle confirmed/error state for the copy flash.
          '.msg-actions button.laam-act-ok {',
          '  color: var(--accent); border-color: var(--accent);',
          '  background: var(--accent-soft);',
          '}',
          '.msg-actions button[disabled] { opacity: 0.45; cursor: default; }',
          '.msg-actions button.laam-act-shake { animation: laam-act-shake 0.34s ease; }',
          '@keyframes laam-act-shake {',
          '  0%, 100% { transform: translateX(0); }',
          '  25% { transform: translateX(-3px); }',
          '  75% { transform: translateX(3px); }',
          '}',
          // Inline edit box.
          '.laam-act-edit { display: flex; flex-direction: column; gap: 8px; min-width: 220px; }',
          '.laam-act-edit-ta {',
          '  width: 100%; box-sizing: border-box; resize: none;',
          '  background: var(--bg-elev); color: var(--text);',
          '  border: 1px solid var(--border-strong); border-radius: 10px;',
          '  padding: 8px 10px; font-family: var(--sans); font-size: 14px; line-height: 1.5;',
          '  outline: none;',
          '}',
          '.laam-act-edit-ta:focus { border-color: var(--accent); }',
          '.laam-act-edit-row { display: flex; gap: 6px; justify-content: flex-end; }',
          // Reuse the toolbar button look for edit-mode buttons, but make them
          // always visible (they live inside the bubble, not the hover bar).
          '.laam-act-edit-row .laam-act-btn {',
          '  border: 1px solid var(--border); background: var(--bg-elev); color: var(--text-dim);',
          '  border-radius: 7px; padding: 5px 12px; font-size: 12.5px; cursor: pointer;',
          '  line-height: 1.4; font-family: var(--sans);',
          '}',
          '.laam-act-edit-row .laam-act-btn:hover { color: var(--text); background: var(--bg-sunken); }',
          '.laam-act-edit-row .laam-act-primary {',
          '  background: var(--accent); color: #fff; border-color: var(--accent);',
          '}',
          '.laam-act-edit-row .laam-act-primary:hover { background: var(--accent); filter: brightness(1.05); color: #fff; }',
          // The user bubble has a colored background; keep the edit textarea
          // legible by forcing the elevated surface + standard text color.
          '.msg.user .bubble .laam-act-edit-ta { background: var(--bg-elev); color: var(--text); }',
          '.msg.user .bubble .laam-act-edit-row .laam-act-btn { color: var(--text-dim); background: var(--bg-elev); }',
        ].join('\n');
        document.head.appendChild(style);
      }
    } catch (e) {
      // Module init must never throw — log and bail.
      try { console.error('[chat] actions init failed:', e); } catch (e2) {}
    }
  },
});
