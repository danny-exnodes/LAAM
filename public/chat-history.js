// LAAM — Chat feature module: CONVERSATION HISTORY SIDEBAR.
// ===========================================================================
// Renders the conversation list inside ctx.mounts.sidebar (the #chat-sidebar
// <aside>). The KERNEL (chat.js) owns the drawer open/close mechanics, the ☰
// toggle and the scrim — this module only fills the sidebar with content:
//
//   • header: "Trò chuyện" + a "＋ Mới" button (new conversation)
//   • a live filter input (filters the list by title, case-insensitive)
//   • a scrollable list: one row per conversation (title + relative time)
//       – click a row → switch conversation
//       – hover reveals Rename (✎) and Delete (🗑) actions
//       – Rename swaps the title for an inline <input> (Enter/blur saves,
//         Escape cancels)
//   • an empty state when there are no conversations / none match the filter
//
// Registers itself into window.LAAM_CHAT_MODULES at load time and does all of
// its work inside init(ctx). It NEVER throws out of init or any handler, and
// null-guards every mount. CSS is injected once via <style id="laam-history-css">
// using the global design tokens so it works in light + dark themes.
// ===========================================================================

(function () {
  'use strict';

  (window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
    id: 'history',
    init: init,
  });

  function init(ctx) {
    try {
      var store = ctx && ctx.store;
      var sidebar = ctx && ctx.mounts && ctx.mounts.sidebar;
      // Without the store or the mount there is nothing meaningful to render.
      if (!store || !sidebar) return;

      var esc = (ctx && ctx.esc) || function (s) {
        return s == null ? '' : String(s).replace(/[&<>"]/g, function (c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
        });
      };
      var ago = (ctx && ctx.ago) || function () { return ''; };
      var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };
      var L = window.LAAM || {};
      var iconSvg = function (name, size) { return L.icon ? L.icon(name, { size: size || 15, class: 'lc' }) : ''; };

      injectCss();

      // ---- build the static shell once ------------------------------------
      sidebar.innerHTML = '';

      var root = document.createElement('div');
      root.className = 'laam-hist';

      // Header row: heading + new-conversation button.
      var header = document.createElement('div');
      header.className = 'laam-hist-header';

      var heading = document.createElement('div');
      heading.className = 'laam-hist-title';
      heading.textContent = T('chat.histTitle');

      var newBtn = document.createElement('button');
      newBtn.type = 'button';
      newBtn.className = 'laam-hist-new';
      var newLabel = document.createElement('span');
      newLabel.className = 'laam-hist-new-lbl';
      function paintNewBtn() {
        newBtn.setAttribute('aria-label', T('chat.histNewAria'));
        newBtn.title = T('chat.histNewAria');
        newLabel.textContent = T('chat.histNew');
      }
      newBtn.innerHTML = '<span class="laam-hist-plus" aria-hidden="true">' + iconSvg('plus', 15) + '</span> ';
      newBtn.appendChild(newLabel);
      paintNewBtn();

      header.appendChild(heading);
      header.appendChild(newBtn);

      // Filter / search box.
      var filterWrap = document.createElement('div');
      filterWrap.className = 'laam-hist-filter';
      var filterInput = document.createElement('input');
      filterInput.type = 'text';
      filterInput.className = 'laam-hist-filter-input';
      filterInput.placeholder = T('chat.histFilterPh');
      filterInput.setAttribute('aria-label', T('chat.histFilterAria'));
      filterInput.autocomplete = 'off';
      filterInput.spellcheck = false;
      filterWrap.appendChild(filterInput);

      // The scrollable list.
      var list = document.createElement('div');
      list.className = 'laam-hist-list';
      list.setAttribute('role', 'list');
      list.setAttribute('aria-label', T('chat.histListAria'));

      root.appendChild(header);
      root.appendChild(filterWrap);
      root.appendChild(list);
      sidebar.appendChild(root);

      // ---- state ----------------------------------------------------------
      var filterText = '';        // current filter (kept across re-renders)
      var editingId = null;       // id of the row currently being renamed

      // ---- helpers --------------------------------------------------------
      function titleOf(c) {
        var t = c && c.title ? String(c.title).trim() : '';
        return t || T('chat.histUntitled');
      }

      function matchesFilter(c) {
        if (!filterText) return true;
        return titleOf(c).toLowerCase().indexOf(filterText) >= 0;
      }

      function currentId() {
        var cur = store.getCurrent && store.getCurrent();
        return cur ? cur.id : null;
      }

      // ---- list rendering -------------------------------------------------
      function renderList() {
        // Renaming uses a live <input>; a full re-render would blow it away
        // mid-edit. Skip the rebuild and just refresh highlight in that case.
        if (editingId != null) { updateActive(); return; }

        var all = (store.getConversations && store.getConversations()) || [];
        var shown = all.filter(matchesFilter);

        list.innerHTML = '';

        if (!shown.length) {
          var empty = document.createElement('div');
          empty.className = 'laam-hist-empty';
          empty.textContent = filterText
            ? T('chat.histNoMatch')
            : T('chat.histEmpty');
          list.appendChild(empty);
          return;
        }

        var activeId = currentId();
        for (var i = 0; i < shown.length; i++) {
          list.appendChild(buildRow(shown[i], shown[i].id === activeId));
        }
      }

      function buildRow(c, isActive) {
        var row = document.createElement('div');
        row.className = 'laam-hist-row' + (isActive ? ' is-active' : '');
        row.setAttribute('role', 'listitem');
        row.dataset.id = c.id;
        row.tabIndex = 0;
        if (isActive) row.setAttribute('aria-current', 'true');

        var body = document.createElement('div');
        body.className = 'laam-hist-row-body';

        var name = document.createElement('div');
        name.className = 'laam-hist-row-title';
        name.textContent = titleOf(c);
        name.title = titleOf(c);

        var time = document.createElement('div');
        time.className = 'laam-hist-row-time';
        time.textContent = ago(c.updatedAt) || '';

        body.appendChild(name);
        body.appendChild(time);

        var actions = document.createElement('div');
        actions.className = 'laam-hist-row-actions';

        var renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'laam-hist-act';
        renameBtn.setAttribute('aria-label', T('chat.histRenameAria'));
        renameBtn.title = T('chat.histRenameTitle');
        renameBtn.innerHTML = iconSvg('pencil-line', 14);

        var delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'laam-hist-act laam-hist-act-del';
        delBtn.setAttribute('aria-label', T('chat.histDeleteAria'));
        delBtn.title = T('chat.histDeleteTitle');
        delBtn.innerHTML = iconSvg('trash-2', 14);

        actions.appendChild(renameBtn);
        actions.appendChild(delBtn);

        row.appendChild(body);
        row.appendChild(actions);

        // Switch on click / keyboard (Enter or Space) — but not while editing
        // and not when a hover-action button was the target.
        row.addEventListener('click', function (e) {
          if (editingId != null) return;
          if (e.target.closest('.laam-hist-act')) return;
          safe(function () { store.switchConversation(c.id); });
        });
        row.addEventListener('keydown', function (e) {
          if (editingId != null) return;
          if (e.target.closest('.laam-hist-act')) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            safe(function () { store.switchConversation(c.id); });
          }
        });

        renameBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          beginRename(row, body, name, c);
        });

        delBtn.addEventListener('click', function (e) {
          e.stopPropagation();
          safe(function () {
            if (window.confirm(T('chat.histDeleteConfirm'))) {
              store.deleteConversation(c.id);
            }
          });
        });

        return row;
      }

      // ---- inline rename --------------------------------------------------
      function beginRename(row, body, name, c) {
        if (editingId != null) return; // one rename at a time
        editingId = c.id;
        row.classList.add('is-editing');

        var editor = document.createElement('input');
        editor.type = 'text';
        editor.className = 'laam-hist-rename';
        editor.value = c.title ? String(c.title) : '';
        editor.setAttribute('aria-label', T('chat.histRenameInputAria'));
        editor.maxLength = 120;

        var done = false;
        function finish(commit) {
          if (done) return;
          done = true;
          editingId = null;
          if (commit) {
            var v = editor.value.trim();
            // Only persist a non-empty title; an empty value leaves the
            // existing title (and its placeholder) untouched.
            if (v) safe(function () { store.renameConversation(c.id, v); });
          }
          row.classList.remove('is-editing');
          // Re-render so the row reflects the (possibly) new title + order.
          renderList();
        }

        editor.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); finish(true); }
          else if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        });
        editor.addEventListener('blur', function () { finish(true); });
        // Clicking inside the editor must not bubble to the row (= switch).
        editor.addEventListener('click', function (e) { e.stopPropagation(); });

        name.replaceWith(editor);
        editor.focus();
        editor.select();
      }

      // ---- active-row highlight (cheap update on switch) ------------------
      function updateActive() {
        var activeId = currentId();
        var rows = list.querySelectorAll('.laam-hist-row');
        for (var i = 0; i < rows.length; i++) {
          var r = rows[i];
          var on = r.dataset.id === activeId;
          r.classList.toggle('is-active', on);
          if (on) r.setAttribute('aria-current', 'true');
          else r.removeAttribute('aria-current');
        }
      }

      // ---- wiring ---------------------------------------------------------
      newBtn.addEventListener('click', function () {
        safe(function () {
          store.newConversation();
          if (store.focusInput) store.focusInput();
        });
      });

      filterInput.addEventListener('input', function () {
        filterText = filterInput.value.trim().toLowerCase();
        renderList();
      });
      // Escape clears the filter for quick reset.
      filterInput.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && filterInput.value) {
          e.preventDefault();
          filterInput.value = '';
          filterText = '';
          renderList();
        }
      });

      // ---- store events ---------------------------------------------------
      store.on('conversations:change', function () { renderList(); });
      store.on('conversation:switch', function () {
        // A switch can happen from anywhere (new chat, delete, transcript);
        // a full render keeps the highlight + order correct.
        renderList();
      });
      // Optional: the composer can ask us to focus the filter box.
      store.on('command:search', function () {
        safe(function () { filterInput.focus(); filterInput.select(); });
      });

      // ---- first paint ----------------------------------------------------
      renderList();

      // ---- re-localize on language change ---------------------------------
      // The shell (heading / new button / filter) is built once; re-translate it
      // and re-render the list (rows use T() for titles + empty states).
      if (window.LAAMI18n && typeof window.LAAMI18n.onChange === 'function') {
        window.LAAMI18n.onChange(function () {
          safe(function () {
            heading.textContent = T('chat.histTitle');
            paintNewBtn();
            filterInput.placeholder = T('chat.histFilterPh');
            filterInput.setAttribute('aria-label', T('chat.histFilterAria'));
            list.setAttribute('aria-label', T('chat.histListAria'));
            renderList();
          });
        });
      }
    } catch (e) {
      // Never throw out of init — a broken sidebar must not break the page.
      try { console.error('[chat-history] init failed:', e); } catch (e2) {}
    }
  }

  // Run a side-effecting callback without ever throwing out of a handler.
  function safe(fn) {
    try { fn(); } catch (e) { try { console.error('[chat-history]', e); } catch (e2) {} }
  }

  // ---- scoped CSS (injected once) ----------------------------------------
  function injectCss() {
    if (document.querySelector('#laam-history-css')) return;
    var style = document.createElement('style');
    style.id = 'laam-history-css';
    style.textContent = [
      // Vertical flex column: header + filter fixed, list scrolls.
      '.laam-hist { display: flex; flex-direction: column; height: 100%; min-height: 0; }',

      '.laam-hist-header {',
      '  flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;',
      '  gap: 8px; padding: 14px 12px 8px;',
      '}',
      '.laam-hist-title {',
      '  font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase;',
      '  color: var(--text-faint);',
      '}',
      '.laam-hist-new {',
      '  flex: 0 0 auto; display: inline-flex; align-items: center; gap: 4px;',
      '  border: 1px solid var(--border); background: var(--bg-sunken); color: var(--text-dim);',
      '  border-radius: 8px; padding: 4px 10px; font-family: var(--sans); font-size: 12.5px;',
      '  font-weight: 600; cursor: pointer; line-height: 1.4;',
      '}',
      '.laam-hist-new:hover { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }',
      '.laam-hist-plus { font-size: 13px; line-height: 1; }',

      '.laam-hist-filter { flex: 0 0 auto; padding: 4px 12px 10px; }',
      '.laam-hist-filter-input {',
      '  width: 100%; box-sizing: border-box; border: 1px solid var(--border);',
      '  background: var(--bg-sunken); color: var(--text); border-radius: 9px;',
      '  padding: 7px 10px; font-family: var(--sans); font-size: 13px; line-height: 1.4; outline: 0;',
      '}',
      '.laam-hist-filter-input::placeholder { color: var(--text-faint); }',
      '.laam-hist-filter-input:focus { border-color: var(--accent); }',

      '.laam-hist-list {',
      '  flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;',
      '  display: flex; flex-direction: column; gap: 2px; padding: 0 8px 12px;',
      '}',

      '.laam-hist-empty {',
      '  margin: auto; padding: 24px 12px; text-align: center; color: var(--text-faint);',
      '  font-size: 13px; line-height: 1.5;',
      '}',

      '.laam-hist-row {',
      '  position: relative; display: flex; align-items: center; gap: 6px;',
      '  border: 1px solid transparent; border-radius: 10px; padding: 7px 8px 7px 10px;',
      '  cursor: pointer; outline: 0;',
      '}',
      '.laam-hist-row:hover { background: var(--bg-sunken); }',
      '.laam-hist-row:focus-visible { border-color: var(--accent); }',
      '.laam-hist-row.is-active {',
      '  background: var(--accent-soft); border-color: transparent;',
      '}',
      '.laam-hist-row.is-active .laam-hist-row-title { color: var(--accent); font-weight: 650; }',

      '.laam-hist-row-body { flex: 1 1 auto; min-width: 0; }',
      '.laam-hist-row-title {',
      '  font-size: 13.5px; color: var(--text); line-height: 1.35;',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',
      '.laam-hist-row-time {',
      '  margin-top: 2px; font-size: 11px; color: var(--text-faint); font-family: var(--mono);',
      '  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;',
      '}',

      // Hover actions: hidden by default, revealed on row hover / focus-within.
      '.laam-hist-row-actions {',
      '  flex: 0 0 auto; display: flex; gap: 2px; opacity: 0; transition: opacity .12s ease;',
      '}',
      '.laam-hist-row:hover .laam-hist-row-actions,',
      '.laam-hist-row:focus-within .laam-hist-row-actions { opacity: 1; }',
      '.laam-hist-row.is-editing .laam-hist-row-actions { display: none; }',
      '.laam-hist-act {',
      '  border: 0; background: transparent; color: var(--text-faint); cursor: pointer;',
      '  width: 24px; height: 24px; border-radius: 6px; font-size: 12.5px; line-height: 1;',
      '  display: grid; place-items: center; padding: 0;',
      '}',
      '.laam-hist-act:hover { background: var(--border); color: var(--text); }',
      '.laam-hist-act-del:hover { background: var(--error); color: #fff; }',

      // Inline rename editor (replaces the title text).
      '.laam-hist-rename {',
      '  width: 100%; box-sizing: border-box; border: 1px solid var(--accent);',
      '  background: var(--bg); color: var(--text); border-radius: 7px;',
      '  padding: 3px 6px; font-family: var(--sans); font-size: 13.5px; line-height: 1.35; outline: 0;',
      '}',

      // On touch / mobile the hover actions can never be reached — always show.
      '@media (max-width: 860px) {',
      '  .laam-hist-row-actions { opacity: 1; }',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }
})();
