// LAAM — Chat composer power-ups (feature module).
// ===========================================================================
// Adds quality-of-life affordances ON TOP of the kernel's baseline composer:
//   1) Drag & drop files onto the dock/transcript  → context attachments
//   2) Paste files / very large text into the input → context attachments
//   3) Live char + approx-token counter under the input
//   4) Scroll-to-bottom FAB, driven by the kernel's `scroll:state` event
//   5) Slash-command menu (/moi, /xoa, /dung, /xuat, /caidat)
//   6) Keyboard shortcuts (Esc to stop, ArrowUp to recall, Cmd/Ctrl+K search)
//
// Registers itself into window.LAAM_CHAT_MODULES at load time and does ALL of
// its work inside init(ctx). It NEVER throws out of init or any handler, and
// null-guards every mount. CSS is injected once via <style id="laam-composer-css">
// using the global design tokens so it works in light + dark themes.
//
// CRITICAL: the kernel already binds Enter-to-send (bubble-phase keydown on the
// textarea), the Send/Stop buttons, the 📎/🔗 buttons and the file <input>. We
// do NOT re-bind any of those. To run a slash command on Enter we add a SEPARATE
// capture-phase keydown listener that only preempts the kernel (stopPropagation +
// preventDefault) WHILE the slash menu is open; otherwise it stays out of the way.
// All UI text is Vietnamese. House style mirrors chat-render.js / chat-history.js.
// ===========================================================================

(function () {
  'use strict';

  (window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
    id: 'composer',
    init: init,
  });

  // Slash commands. ASCII names (no diacritics) so they survive IME composition;
  // a localized label (resolved at render via labelKey) is shown beside each.
  // run() receives the store.
  var COMMANDS = [
    { name: 'moi',    labelKey: 'chat.cmdNew',      icon: '✚',  run: function (s) { s.newConversation(); } },
    { name: 'xoa',    labelKey: 'chat.cmdClear',    icon: '🗑', run: function (s) { s.clearMessages(); } },
    { name: 'dung',   labelKey: 'chat.cmdStop',     icon: '⏹', run: function (s) { s.stop(); } },
    { name: 'xuat',   labelKey: 'chat.cmdExport',   icon: '⬇',  run: function (s) { s.emit('command:export'); } },
    { name: 'caidat', labelKey: 'chat.cmdSettings', icon: '⚙',  run: function (s) { s.emit('command:settings'); } },
  ];

  // If a single pasted chunk is longer than this, offer to attach it instead of
  // dumping it into the textarea (keeps the composer usable for big snippets).
  var PASTE_ATTACH_THRESHOLD = 4000;

  function init(ctx) {
    try {
      var store = ctx && ctx.store;
      var m = (ctx && ctx.mounts) || {};
      var input = m.input;
      if (!store || !input) return; // nothing to power up without these
      var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };

      injectCss();

      // --- transient note line (used for non-blocking drop/paste feedback) ----
      // Lives in the composer toolbar; auto-clears. Never blocks the UI.
      var toolbar = m.composerToolbar || null;
      var noteEl = null;
      var noteTimer = null;
      function note(msg) {
        if (!toolbar) return;
        try {
          if (!noteEl) {
            noteEl = document.createElement('div');
            noteEl.className = 'laam-cmp-note';
            toolbar.appendChild(noteEl);
          }
          noteEl.textContent = String(msg || '');
          noteEl.classList.add('show');
          if (noteTimer) clearTimeout(noteTimer);
          noteTimer = setTimeout(function () {
            if (noteEl) { noteEl.classList.remove('show'); noteEl.textContent = ''; }
          }, 3200);
        } catch (e) { /* note is best-effort */ }
      }

      // Programmatic writes to the textarea: set value + fire 'input' so the
      // kernel's autoGrow (and our counter) react exactly as if the user typed.
      function setInput(val, caretEnd) {
        try {
          input.value = val == null ? '' : String(val);
          if (caretEnd) {
            var n = input.value.length;
            try { input.setSelectionRange(n, n); } catch (e2) {}
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } catch (e) { /* ignore */ }
      }

      // ===================================================================
      // 1) DRAG & DROP  → ingest each file as a context attachment
      // ===================================================================
      // Overlay lives in .chat-main (a positioned ancestor) so it can cover the
      // whole composer area; we fall back to the dock if main is missing.
      var overlayHost = m.main || m.dock || null;
      var overlay = null;
      if (overlayHost) {
        overlay = document.createElement('div');
        overlay.className = 'laam-cmp-drop';
        overlay.setAttribute('aria-hidden', 'true');
        overlay.innerHTML = '<div class="laam-cmp-drop-card"><div class="laam-cmp-drop-ic">📥</div>' +
          '<div class="laam-cmp-drop-msg"></div>' +
          '<div class="laam-cmp-drop-sub"></div></div>';
        overlayHost.appendChild(overlay);
      }
      function paintOverlay() {
        if (!overlay) return;
        var msg = overlay.querySelector('.laam-cmp-drop-msg');
        var sub = overlay.querySelector('.laam-cmp-drop-sub');
        if (msg) msg.textContent = T('chat.dropHere');
        if (sub) sub.textContent = T('chat.dropFormats');
      }
      paintOverlay();

      // Use a depth counter: dragenter/dragleave fire for every child element, so
      // a naive boolean flickers. Only hide when the counter returns to zero.
      var dragDepth = 0;
      function showOverlay() { if (overlay) overlay.classList.add('show'); }
      function hideOverlay() { if (overlay) overlay.classList.remove('show'); }

      // Does this drag actually carry files? (Ignore text/element drags.)
      function dragHasFiles(e) {
        var dt = e && e.dataTransfer;
        if (!dt) return false;
        if (dt.types) {
          for (var i = 0; i < dt.types.length; i++) {
            if (dt.types[i] === 'Files') return true;
          }
        }
        return !!(dt.files && dt.files.length);
      }

      async function ingestFiles(fileList) {
        var files = Array.prototype.slice.call(fileList || []);
        if (!files.length) return;
        var ingest = window.LAAMChatIngest;
        if (!ingest || typeof ingest.parseFile !== 'function') {
          note(T('chat.cantReadFiles'));
          return;
        }
        for (var i = 0; i < files.length; i++) {
          var f = files[i];
          try {
            // Images + scanned PDFs are OCR'd inside parseFile; surface progress.
            var r = await ingest.parseFile(f, function (msg) { note(msg); });
            store.addAttachment({
              name: r.name + (r.truncated ? T('chat.truncatedSuffix') : ''),
              text: r.text,
              kind: 'file',
            });
          } catch (err) {
            // Per-file failure must not abort the rest of the batch.
            note((f && f.name ? f.name + ': ' : '') + ((err && err.message) || T('chat.fileReadErr')));
          }
        }
      }

      // Bind drag handlers to the dock (primary) and transcript (nice-to-have).
      var dropZones = [m.dock, m.transcript].filter(Boolean);
      dropZones.forEach(function (zone) {
        zone.addEventListener('dragenter', function (e) {
          if (!dragHasFiles(e)) return;
          e.preventDefault();
          dragDepth++;
          showOverlay();
        });
        zone.addEventListener('dragover', function (e) {
          if (!dragHasFiles(e)) return;
          e.preventDefault(); // REQUIRED so the browser allows a drop here
          try { e.dataTransfer.dropEffect = 'copy'; } catch (e2) {}
        });
        zone.addEventListener('dragleave', function (e) {
          if (!dragHasFiles(e)) return;
          dragDepth = Math.max(0, dragDepth - 1);
          if (dragDepth === 0) hideOverlay();
        });
        zone.addEventListener('drop', function (e) {
          if (!dragHasFiles(e)) return;
          e.preventDefault(); // stop the browser from navigating to the file
          dragDepth = 0;
          hideOverlay();
          var dt = e.dataTransfer;
          ingestFiles(dt && dt.files);
        });
      });
      // Safety net: a drop anywhere else on the page shouldn't navigate away,
      // and a drag that ends outside our zones should clear the overlay.
      window.addEventListener('dragend', function () { dragDepth = 0; hideOverlay(); });
      document.addEventListener('drop', function (e) {
        if (dragHasFiles(e)) { e.preventDefault(); }
        dragDepth = 0; hideOverlay();
      });

      // ===================================================================
      // 2) PASTE  → files become attachments; huge text offered as attachment
      // ===================================================================
      input.addEventListener('paste', function (e) {
        var cd = e.clipboardData;
        if (!cd) return;

        // (a) Pasted files (e.g. an image, or a file copied from the OS).
        var files = cd.files;
        if (files && files.length) {
          e.preventDefault();
          ingestFiles(files);
          return;
        }

        // (b) Very large text → offer to attach instead of flooding the input.
        var text = '';
        try { text = cd.getData('text/plain') || ''; } catch (e2) { text = ''; }
        if (text && text.length > PASTE_ATTACH_THRESHOLD) {
          e.preventDefault();
          var capped = text;
          var truncated = false;
          var ingest = window.LAAMChatIngest;
          var max = ingest && ingest.MAX_CHARS;
          if (typeof max === 'number' && capped.length > max) {
            capped = capped.slice(0, max);
            truncated = true;
          }
          store.addAttachment({
            name: T('chat.pastedText') + (truncated ? T('chat.truncatedSuffix') : ''),
            text: capped,
            kind: 'file',
          });
          note(T('chat.pastedAttached', { n: text.length }));
          return;
        }
        // Otherwise: let the browser paste normally (kernel autoGrow + counter
        // update via the 'input' event that follows a default paste).
      });

      // ===================================================================
      // 3) TOKEN / CHAR COUNTER  (muted readout in the composer toolbar)
      // ===================================================================
      var counter = null;
      if (toolbar) {
        counter = document.createElement('div');
        counter.className = 'laam-cmp-count';
        counter.hidden = true;
        toolbar.appendChild(counter);
      }
      function updateCounter() {
        if (!counter) return;
        var len = input.value.length;
        if (!len) { counter.hidden = true; return; }
        var toks = Math.ceil(len / 4); // rough heuristic, matches kernel ingest note
        counter.hidden = false;
        counter.textContent = T('chat.counter', { chars: len, tokens: toks });
      }
      input.addEventListener('input', updateCounter);
      updateCounter();

      // ===================================================================
      // 4) SCROLL-TO-BOTTOM FAB  (kernel styles/positions it; we toggle it)
      // ===================================================================
      var scrollBtn = m.scrollBtn || null;
      if (scrollBtn) {
        function setFab(atBottom) {
          if (atBottom) {
            scrollBtn.classList.remove('laam-cmp-fab-in');
            scrollBtn.hidden = true;
          } else {
            scrollBtn.hidden = false;
            // next frame so the fade-in transition actually runs
            requestAnimationFrame(function () { scrollBtn.classList.add('laam-cmp-fab-in'); });
          }
        }
        store.on('scroll:state', function (d) { setFab(!!(d && d.atBottom)); });
        scrollBtn.addEventListener('click', function () {
          try { store.scrollToBottom(); } catch (e) {}
        });
        // Initialise from current position (kernel may not have emitted yet).
        try { setFab(store.isAtBottom()); } catch (e) { setFab(true); }
      }

      // ===================================================================
      // 5) SLASH-COMMAND MENU  (popup above the dock)
      // ===================================================================
      var menu = null;        // the popup element
      var menuItemsWrap = null;
      var menuOpen = false;
      var matches = [];       // current filtered COMMANDS
      var activeIdx = 0;      // highlighted row

      var menuHost = m.dock || m.main || null;
      if (menuHost) {
        menu = document.createElement('div');
        menu.className = 'laam-cmp-menu';
        menu.setAttribute('role', 'listbox');
        menu.hidden = true;
        var head = document.createElement('div');
        head.className = 'laam-cmp-menu-head';
        head.textContent = T('chat.cmdMenuHead');
        menu.appendChild(head);
        menuItemsWrap = document.createElement('div');
        menuItemsWrap.className = 'laam-cmp-menu-items';
        menu.appendChild(menuItemsWrap);
        menuHost.appendChild(menu);
      }

      function closeMenu() {
        menuOpen = false;
        matches = [];
        if (menu) menu.hidden = true;
      }

      function filterFor(value) {
        // value starts with '/'. Token = chars after the slash up to whitespace.
        var q = value.slice(1);
        var sp = q.search(/\s/);
        if (sp >= 0) q = q.slice(0, sp);
        q = q.toLowerCase();
        return COMMANDS.filter(function (c) {
          return c.name.indexOf(q) === 0 || (q && c.name.indexOf(q) >= 0);
        });
      }

      function renderMenu() {
        if (!menu || !menuItemsWrap) return;
        menuItemsWrap.innerHTML = '';
        matches.forEach(function (c, i) {
          var row = document.createElement('button');
          row.type = 'button';
          row.className = 'laam-cmp-menu-item' + (i === activeIdx ? ' active' : '');
          row.setAttribute('role', 'option');
          row.setAttribute('aria-selected', i === activeIdx ? 'true' : 'false');
          row.dataset.i = i;
          row.innerHTML =
            '<span class="laam-cmp-menu-ic">' + (ctx.esc ? ctx.esc(c.icon) : c.icon) + '</span>' +
            '<span class="laam-cmp-menu-cmd">/' + (ctx.esc ? ctx.esc(c.name) : c.name) + '</span>' +
            '<span class="laam-cmp-menu-lbl">' + (ctx.esc ? ctx.esc(T(c.labelKey)) : T(c.labelKey)) + '</span>';
          menuItemsWrap.appendChild(row);
        });
        menu.hidden = matches.length === 0;
        menuOpen = matches.length > 0;
      }

      function syncMenu() {
        var v = input.value;
        if (v.charAt(0) !== '/') { closeMenu(); return; }
        matches = filterFor(v);
        if (!matches.length) { closeMenu(); return; }
        if (activeIdx >= matches.length) activeIdx = 0;
        renderMenu();
      }

      function execActive() {
        var c = matches[activeIdx];
        if (!c) return;
        closeMenu();
        setInput('', false);
        try { c.run(store); } catch (e) { /* command is best-effort */ }
      }

      // Recompute the menu on every input change (also covers our setInput()).
      input.addEventListener('input', function () {
        activeIdx = 0;
        syncMenu();
      });

      // Click a row to run it.
      if (menuItemsWrap) {
        menuItemsWrap.addEventListener('click', function (e) {
          var row = e.target.closest('.laam-cmp-menu-item');
          if (!row) return;
          activeIdx = Number(row.dataset.i) || 0;
          execActive();
        });
      }

      // ===================================================================
      // 6) KEYBOARD — capture-phase so we can preempt the kernel WHEN NEEDED
      // ===================================================================
      // The kernel listens for Enter on the textarea in the BUBBLE phase. By
      // listening in the CAPTURE phase here and calling stopPropagation only
      // while the slash menu is open, we run the highlighted command and the
      // kernel's send handler never sees the keystroke. When the menu is closed
      // we touch nothing Enter-related, so normal send still works.
      input.addEventListener('keydown', function (e) {
        // -- Slash menu navigation (only while open) --
        if (menuOpen) {
          if (e.key === 'ArrowDown') {
            e.preventDefault(); e.stopPropagation();
            activeIdx = (activeIdx + 1) % matches.length;
            renderMenu();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault(); e.stopPropagation();
            activeIdx = (activeIdx - 1 + matches.length) % matches.length;
            renderMenu();
            return;
          }
          if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            // Preempt the kernel's bubble-phase send.
            e.preventDefault(); e.stopPropagation();
            execActive();
            return;
          }
          if (e.key === 'Escape') {
            e.preventDefault(); e.stopPropagation();
            closeMenu();
            return;
          }
          // any other key falls through; the following 'input' resyncs the menu
          return;
        }

        // -- Escape (menu closed): stop generation if streaming --
        if (e.key === 'Escape') {
          try {
            if (store.isStreaming()) { e.preventDefault(); store.stop(); }
          } catch (e2) {}
          return;
        }

        // -- ArrowUp on an EMPTY input: recall the last user message --
        if (e.key === 'ArrowUp' && input.value === '') {
          var last = lastUserText(store);
          if (last) {
            e.preventDefault();
            setInput(last, true);
          }
          return;
        }
      }, true); // <-- capture phase

      // Cmd/Ctrl+K → ask the history module to focus its search; focus input as
      // a fallback. Page-level so it works even when the textarea isn't focused.
      window.addEventListener('keydown', function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
          e.preventDefault();
          try { store.emit('command:search'); } catch (e2) {}
          try { store.focusInput ? store.focusInput() : input.focus(); } catch (e3) {}
        }
      });

      // Hide the menu when focus leaves the composer (click elsewhere, etc.).
      input.addEventListener('blur', function () {
        // Delay so a click on a menu row registers before we tear it down.
        setTimeout(function () {
          if (document.activeElement !== input) closeMenu();
        }, 120);
      });

      // Keep the FAB honest while streaming pins the view to the bottom.
      store.on('stream:start', function () { /* nothing required; kernel autoscrolls */ });

      // -- re-localize JS-built composer UI on language change --------------
      // The drop overlay + menu header are built once; the counter is dynamic.
      // Re-paint the static bits and re-render the open menu/counter.
      if (window.LAAMI18n && typeof window.LAAMI18n.onChange === 'function') {
        window.LAAMI18n.onChange(function () {
          try { paintOverlay(); } catch (e) {}
          try { var h = menu && menu.querySelector('.laam-cmp-menu-head'); if (h) h.textContent = T('chat.cmdMenuHead'); } catch (e) {}
          try { if (menuOpen) renderMenu(); } catch (e) {}
          try { updateCounter(); } catch (e) {}
        });
      }
    } catch (e) {
      // Never throw out of init.
      try { console.error('[chat] composer init failed:', e); } catch (e2) {}
    }
  }

  // Last USER message text in the current conversation (for ArrowUp recall).
  function lastUserText(store) {
    try {
      var msgs = store.getMessages ? store.getMessages() : [];
      for (var i = msgs.length - 1; i >= 0; i--) {
        var msg = msgs[i];
        if (msg && msg.role === 'user') {
          return msg.text != null ? msg.text : (msg.content || '');
        }
      }
    } catch (e) {}
    return '';
  }

  // ---- scoped CSS, injected once ------------------------------------------
  function injectCss() {
    if (document.querySelector('#laam-composer-css')) return;
    var style = document.createElement('style');
    style.id = 'laam-composer-css';
    style.textContent = [
      // -- transient note + counter (both live in .composer-toolbar) --
      '.laam-cmp-note {',
      '  font-size: 12px; color: var(--text-dim); line-height: 1.4;',
      '  opacity: 0; max-height: 0; overflow: hidden; transition: opacity .15s ease;',
      '}',
      '.laam-cmp-note.show { opacity: 1; max-height: 60px; margin-bottom: 4px; }',
      '.laam-cmp-count {',
      '  font-size: 11.5px; color: var(--text-faint); font-family: var(--mono);',
      '  line-height: 1.4; user-select: none;',
      '}',
      // -- drag & drop overlay (covers .chat-main) --
      '.laam-cmp-drop {',
      '  position: absolute; inset: 0; z-index: 20; display: none;',
      '  align-items: center; justify-content: center;',
      '  background: color-mix(in srgb, var(--bg) 72%, transparent);',
      '  backdrop-filter: blur(1px); -webkit-backdrop-filter: blur(1px);',
      '  pointer-events: none;', // never intercept the drop itself; zones handle it
      '}',
      '.laam-cmp-drop.show { display: flex; }',
      '.laam-cmp-drop-card {',
      '  pointer-events: none; text-align: center; color: var(--text-dim);',
      '  background: var(--bg-elev); border: 2px dashed var(--accent);',
      '  border-radius: 16px; padding: 26px 40px; box-shadow: var(--shadow);',
      '  font-size: 15px; font-weight: 600;',
      '}',
      '.laam-cmp-drop-ic { font-size: 30px; margin-bottom: 6px; }',
      '.laam-cmp-drop-sub { margin-top: 4px; font-size: 12px; font-weight: 500; color: var(--text-faint); font-family: var(--mono); }',
      // -- slash-command menu (anchored above the dock) --
      '.laam-cmp-menu {',
      '  position: absolute; left: 16px; right: 16px; bottom: calc(100% + 8px);',
      '  z-index: 30; background: var(--bg-elev); border: 1px solid var(--border-strong);',
      '  border-radius: 12px; box-shadow: var(--shadow); overflow: hidden;',
      '  max-height: 50vh; display: flex; flex-direction: column;',
      '}',
      '.laam-cmp-menu-head {',
      '  padding: 7px 12px; font-size: 11px; font-weight: 600; letter-spacing: .04em;',
      '  text-transform: uppercase; color: var(--text-faint);',
      '  border-bottom: 1px solid var(--border); background: var(--bg-sunken);',
      '}',
      '.laam-cmp-menu-items { overflow-y: auto; padding: 4px; }',
      '.laam-cmp-menu-item {',
      '  display: flex; align-items: center; gap: 10px; width: 100%;',
      '  border: 0; background: transparent; cursor: pointer; text-align: left;',
      '  padding: 8px 10px; border-radius: 8px; color: var(--text);',
      '  font-family: var(--sans); font-size: 13.5px; line-height: 1.3;',
      '}',
      '.laam-cmp-menu-item:hover { background: var(--bg-sunken); }',
      '.laam-cmp-menu-item.active { background: var(--accent-soft); }',
      '.laam-cmp-menu-ic { flex: 0 0 auto; width: 18px; text-align: center; }',
      '.laam-cmp-menu-cmd { flex: 0 0 auto; font-family: var(--mono); font-size: 12.5px; color: var(--accent); font-weight: 600; }',
      '.laam-cmp-menu-lbl { flex: 1 1 auto; min-width: 0; color: var(--text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }',
      '.laam-cmp-menu-item.active .laam-cmp-menu-lbl { color: var(--text); }',
      // -- scroll-to-bottom FAB fade-in (kernel owns base .scroll-bottom) --
      '.scroll-bottom { opacity: 0; transition: opacity .16s ease; }',
      '.scroll-bottom.laam-cmp-fab-in { opacity: 1; }',
    ].join('\n');
    document.head.appendChild(style);
  }
})();
