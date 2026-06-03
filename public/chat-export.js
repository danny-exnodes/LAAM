// LAAM — Chat feature module: EXPORT + CODE-BLOCK copy + light syntax highlight + timestamps.
// ===========================================================================
// Three jobs, all additive and self-contained:
//
//   A) EXPORT — a "⬇ Xuất" button in the top sub-bar (ctx.mounts.toolbar) opens
//      a small menu: copy the whole conversation as Markdown, or download it as
//      .md / .json. Also triggered by the kernel's `command:export` event (the
//      composer's /export slash command). Markdown shape:
//        # <title>
//        _<date line>_
//        **Bạn:**  /  **Qwen:**  sections, separated by `---`.
//
//   B) CODE-BLOCK COPY — on every `message:rendered`, each <pre> inside the
//      bubble gets a small "⧉ Chép" button pinned to its top-right that copies
//      the block's text. The kernel hands us FRESH elements each render, so we
//      decorate every time; a data-attr guards against double-processing the
//      SAME <pre> within one event. Horizontal code scroll is preserved (the
//      button floats in an overlay; the <pre> keeps its own overflow).
//
//   C) LIGHT SYNTAX HIGHLIGHT — for <pre><code> blocks we tokenize the code's
//      textContent and rebuild it from <span class="tok-*"> nodes built with
//      the DOM API (createElement + textContent). We NEVER assign innerHTML from
//      model text, so this can't introduce XSS — at worst a token is miscolored.
//      A tiny dependency-free lexer covers strings / comments / numbers and a
//      small keyword set for js / ts / python / json / shell. Unknown languages
//      are left untouched.
//
//   D) TIMESTAMPS — a faint relative-time line (ctx.ago(msg.ts)) under each
//      message, plus the absolute time as a title tooltip. Placed so it doesn't
//      collide with the kernel's existing "7B · tok/s" stats caption.
//
// House style mirrors chat-render.js / chat-actions.js: an IIFE-in-init, all
// work wrapped so we never throw out of init() or a handler, theme tokens for
// light+dark, Vietnamese UI. Exactly ONE file; CSS injected once, scoped.
// ===========================================================================

(window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
  id: 'export',
  init: function (ctx) {
    'use strict';
    try {
      var store = ctx && ctx.store;
      if (!store) return;
      var esc = (ctx && ctx.esc) || function (s) { return s == null ? '' : String(s); };
      var ago = (ctx && ctx.ago) || function () { return ''; };
      var mounts = (ctx && ctx.mounts) || {};
      var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };

      injectCss();

      // ===================================================================
      // Shared clipboard helper (async API → hidden-textarea fallback).
      // ===================================================================
      function copyText(text) {
        text = text == null ? '' : String(text);
        if (navigator.clipboard && navigator.clipboard.writeText) {
          return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
        }
        return legacyCopy(text);
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

      // Briefly swap a button's label to a confirmation, then restore it.
      function flash(btn, label, okClass) {
        if (!btn || btn.dataset.flashing === '1') return;
        var prev = btn.textContent;
        btn.dataset.flashing = '1';
        btn.textContent = label;
        if (okClass) btn.classList.add(okClass);
        setTimeout(function () {
          if (!btn.isConnected) { btn.dataset.flashing = '0'; return; }
          btn.textContent = prev;
          if (okClass) btn.classList.remove(okClass);
          btn.dataset.flashing = '0';
        }, 1200);
      }

      // ===================================================================
      // A) EXPORT — build Markdown / JSON of the current conversation.
      // ===================================================================
      function currentConv() {
        try { return store.getCurrent(); } catch (e) { return null; }
      }

      function convTitle(conv) {
        var t = conv && conv.title ? String(conv.title).trim() : '';
        return t || T('chat.expConvTitle');
      }

      // A filesystem-friendly base name for downloads.
      function safeFileBase(conv) {
        var base = (conv && conv.title ? String(conv.title) : '') ||
          (conv && conv.id ? String(conv.id) : '') || T('chat.expFileBase');
        base = base.trim().toLowerCase()
          .replace(/[\s ]+/g, '-')         // whitespace → dash
          .replace(/[^a-z0-9\-_.]/g, '')        // strip anything not filename-safe
          .replace(/-+/g, '-')                  // collapse dashes
          .replace(/^[-.]+|[-.]+$/g, '');        // trim leading/trailing dashes/dots
        return base || T('chat.expFileBase');
      }

      // The role label used in Markdown headings.
      function roleLabel(role) {
        return role === 'user' ? T('chat.expRoleUser') : role === 'assistant' ? T('chat.expRoleAssistant') : T('chat.expRoleSystem');
      }

      // The text to export for a message: user → typed text (no attachment
      // context dump), assistant → full content.
      function exportTextOf(msg) {
        if (!msg) return '';
        if (msg.role === 'user') return String(msg.text != null ? msg.text : (msg.content || ''));
        return String(msg.content != null ? msg.content : (msg.text || ''));
      }

      function formatDate(ts) {
        var d = ts ? new Date(ts) : new Date();
        try {
          return d.toLocaleString('vi-VN', {
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit',
          });
        } catch (e) {
          return d.toISOString();
        }
      }

      function buildMarkdown(conv) {
        if (!conv) return '';
        var msgs = Array.isArray(conv.messages) ? conv.messages : [];
        var lines = [];
        lines.push('# ' + convTitle(conv));
        lines.push('');
        lines.push('_' + T('chat.expMdMeta', { date: formatDate(conv.updatedAt || conv.createdAt || Date.now()), n: msgs.length }) + '_');
        lines.push('');

        var sections = [];
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          if (!m || m.streaming) continue;
          var body = exportTextOf(m).trim();
          var atts = (m.attachments && m.attachments.length)
            ? '\n\n_' + T('chat.expMdAtts', { n: m.attachments.length }) + '_' : '';
          sections.push('**' + roleLabel(m.role) + ':**\n\n' + body + atts);
        }
        lines.push(sections.join('\n\n---\n\n'));
        // Trailing newline for POSIX-friendly files.
        return lines.join('\n').replace(/\s+$/, '') + '\n';
      }

      // Mirror the kernel's persisted shape — omit transient render flags.
      function buildJson(conv) {
        if (!conv) return '{}';
        var msgs = Array.isArray(conv.messages) ? conv.messages : [];
        var out = {
          id: conv.id,
          title: conv.title || '',
          createdAt: conv.createdAt,
          updatedAt: conv.updatedAt,
          settings: conv.settings || {},
          messages: msgs.filter(function (m) { return m && !m.streaming; }).map(function (m) {
            return {
              role: m.role,
              content: m.content,
              text: m.text,
              ts: m.ts,
              attachments: m.attachments,
              stats: m.stats,
              stopped: m.stopped,
            };
          }),
        };
        try { return JSON.stringify(out, null, 2); } catch (e) { return '{}'; }
      }

      // Trigger a client-side download via a Blob + transient <a download>.
      function downloadBlob(filename, text, mime) {
        try {
          var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
          var url = URL.createObjectURL(blob);
          var a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.rel = 'noopener';
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          // Revoke after a tick so the download has started.
          setTimeout(function () {
            try { document.body.removeChild(a); } catch (e) {}
            try { URL.revokeObjectURL(url); } catch (e) {}
          }, 1500);
          return true;
        } catch (e) {
          return false;
        }
      }

      // -- the export menu (a small popover anchored to the button) --------
      var menuEl = null;
      var menuOpen = false;

      function closeMenu() {
        menuOpen = false;
        if (menuEl) menuEl.hidden = true;
        if (exportBtn) exportBtn.setAttribute('aria-expanded', 'false');
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onDocKey, true);
      }

      function onDocClick(e) {
        if (!menuEl) return;
        if (menuEl.contains(e.target) || (exportBtn && exportBtn.contains(e.target))) return;
        closeMenu();
      }
      function onDocKey(e) {
        if (e.key === 'Escape') { closeMenu(); if (exportBtn) try { exportBtn.focus(); } catch (er) {} }
      }

      function openMenu() {
        if (!menuEl) return;
        var conv = currentConv();
        var hasMsgs = !!(conv && Array.isArray(conv.messages) && conv.messages.some(function (m) { return m && !m.streaming; }));
        // Disable actions when there's nothing to export.
        menuEl.querySelectorAll('.laam-exp-item').forEach(function (b) {
          b.disabled = !hasMsgs;
          if (!hasMsgs) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
        });
        menuEl.hidden = false;
        menuOpen = true;
        if (exportBtn) exportBtn.setAttribute('aria-expanded', 'true');
        // Defer listener attach so the opening click doesn't immediately close it.
        setTimeout(function () {
          document.addEventListener('click', onDocClick, true);
          document.addEventListener('keydown', onDocKey, true);
        }, 0);
        // Focus the first enabled item for keyboard users.
        var first = menuEl.querySelector('.laam-exp-item:not([disabled])');
        if (first) { try { first.focus(); } catch (e) {} }
      }

      function toggleMenu() { if (menuOpen) closeMenu(); else openMenu(); }

      function doCopyMarkdown(srcBtn) {
        var conv = currentConv();
        var md = buildMarkdown(conv);
        copyText(md).then(function () {
          if (srcBtn) flash(srcBtn, T('chat.expCopied'), 'laam-exp-ok');
        }, function () {
          if (srcBtn) flash(srcBtn, T('chat.expCopyErr'), 'laam-exp-err');
        });
      }
      function doDownloadMd() {
        var conv = currentConv();
        downloadBlob(safeFileBase(conv) + '.md', buildMarkdown(conv), 'text/markdown');
      }
      function doDownloadJson() {
        var conv = currentConv();
        downloadBlob(safeFileBase(conv) + '.json', buildJson(conv), 'application/json');
      }

      // Build the button + menu and mount into the toolbar.
      var exportBtn = null;
      function mountExportUi() {
        var toolbar = mounts.toolbar;
        if (!toolbar) return; // null-guard: no toolbar mount → silently skip the button (events still work)

        var wrap = document.createElement('div');
        wrap.className = 'laam-exp-wrap';

        exportBtn = document.createElement('button');
        exportBtn.type = 'button';
        exportBtn.className = 'laam-exp-btn';
        exportBtn.textContent = T('chat.expBtn');
        exportBtn.title = T('chat.expTitle');
        exportBtn.setAttribute('aria-label', T('chat.expTitle'));
        exportBtn.setAttribute('aria-haspopup', 'menu');
        exportBtn.setAttribute('aria-expanded', 'false');
        exportBtn.addEventListener('click', function (e) { e.stopPropagation(); toggleMenu(); });
        wrap.appendChild(exportBtn);

        menuEl = document.createElement('div');
        menuEl.className = 'laam-exp-menu';
        menuEl.setAttribute('role', 'menu');
        menuEl.hidden = true;

        var items = [
          { labelKey: 'chat.expCopyMd', titleKey: 'chat.expCopyMdTitle', fn: function (b) { doCopyMarkdown(b); } },
          { labelKey: 'chat.expDownloadMd', titleKey: 'chat.expDownloadMdTitle', fn: function () { doDownloadMd(); closeMenu(); } },
          { labelKey: 'chat.expDownloadJson', titleKey: 'chat.expDownloadJsonTitle', fn: function () { doDownloadJson(); closeMenu(); } },
        ];
        items.forEach(function (it) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'laam-exp-item';
          b.textContent = T(it.labelKey);
          b.title = T(it.titleKey);
          b.dataset.labelKey = it.labelKey;
          b.dataset.titleKey = it.titleKey;
          b.setAttribute('role', 'menuitem');
          b.addEventListener('click', function (e) {
            e.stopPropagation();
            try { it.fn(b); } catch (er) {}
          });
          menuEl.appendChild(b);
        });

        wrap.appendChild(menuEl);
        toolbar.appendChild(wrap);
      }
      mountExportUi();

      // Re-localize the export button + menu (built once) on language change.
      // Per-message code-copy buttons + timestamps are rebuilt each render, so
      // the kernel's transcript re-render handles those for us.
      if (window.LAAMI18n && typeof window.LAAMI18n.onChange === 'function') {
        window.LAAMI18n.onChange(function () {
          try {
            if (exportBtn) {
              exportBtn.textContent = T('chat.expBtn');
              exportBtn.title = T('chat.expTitle');
              exportBtn.setAttribute('aria-label', T('chat.expTitle'));
            }
            if (menuEl) {
              menuEl.querySelectorAll('.laam-exp-item').forEach(function (b) {
                if (b.dataset.flashing === '1') return; // don't clobber a flash
                if (b.dataset.labelKey) b.textContent = T(b.dataset.labelKey);
                if (b.dataset.titleKey) b.title = T(b.dataset.titleKey);
              });
            }
          } catch (e) {}
        });
      }

      // Kernel/composer asked us to export → open the menu (or, if there's no
      // toolbar button, fall back to a direct copy-as-markdown).
      store.on('command:export', function () {
        try {
          if (exportBtn && menuEl) { openMenu(); }
          else { doCopyMarkdown(null); }
        } catch (e) {}
      });

      // ===================================================================
      // B + C) per-message: decorate <pre> blocks (copy button + highlight).
      // ===================================================================
      store.on('message:rendered', function (ev) {
        try { decoratePres(ev); } catch (e) { /* never throw out of a listener */ }
        try { addTimestamp(ev); } catch (e) {}
      });

      function decoratePres(ev) {
        if (!ev || !ev.bubble) return;
        var pres = ev.bubble.querySelectorAll('pre');
        for (var i = 0; i < pres.length; i++) {
          var pre = pres[i];
          // Guard against double-processing the SAME element within one event.
          if (pre.dataset.laamExp === '1') continue;
          pre.dataset.laamExp = '1';

          // (C) Highlight first (mutates <code> text nodes only). Safe to skip.
          try { highlightPre(pre); } catch (e) {}

          // (B) Copy button in a relatively-positioned wrapper so it floats at
          // the top-right without disturbing the <pre>'s own horizontal scroll.
          try { attachCopyButton(pre); } catch (e) {}
        }
      }

      function attachCopyButton(pre) {
        var parent = pre.parentNode;
        if (!parent) return;

        // Wrap the <pre> once in a positioned container we own.
        var wrap;
        if (parent.classList && parent.classList.contains('laam-pre-wrap')) {
          wrap = parent; // already wrapped (shouldn't happen, but be safe)
        } else {
          wrap = document.createElement('div');
          wrap.className = 'laam-pre-wrap';
          parent.insertBefore(wrap, pre);
          wrap.appendChild(pre);
        }

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'laam-pre-copy';
        btn.textContent = T('chat.preCopy');
        btn.title = T('chat.preCopyTitle');
        btn.setAttribute('aria-label', T('chat.preCopyAria'));
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          // The visible code is the <pre>'s textContent (highlight spans don't
          // add characters — textContent reconstructs the original source).
          var code = pre.textContent || '';
          copyText(code).then(function () {
            flash(btn, T('chat.preCopied'), 'laam-exp-ok');
          }, function () {
            flash(btn, T('chat.preCopyErr'), 'laam-exp-err');
          });
        });
        wrap.appendChild(btn);
      }

      // ===================================================================
      // C) LIGHT SYNTAX HIGHLIGHTER (dependency-free, DOM-only, XSS-safe).
      // -------------------------------------------------------------------
      // We only ever read code via textContent and write via createElement +
      // textContent / appendChild. No string is ever assigned to innerHTML, so
      // model-authored code cannot inject markup. The worst failure mode is a
      // miscolored token; on any doubt we leave the block as-is.
      // ===================================================================

      // Language keyword sets (kept small — just the common ones).
      var KEYWORDS = {
        js: ('var let const function return if else for while do switch case break continue ' +
          'new delete typeof instanceof void this class extends super import export default ' +
          'from as async await yield try catch finally throw null true false undefined NaN ' +
          'in of static get set').split(/\s+/),
        py: ('def return if elif else for while break continue pass import from as class lambda ' +
          'try except finally raise with yield global nonlocal assert del in is not and or None ' +
          'True False async await print self').split(/\s+/),
        sh: ('if then else elif fi for while do done case esac function in return export local ' +
          'echo cd ls cat rm cp mv mkdir sudo set unset source exit test').split(/\s+/),
      };

      // Map an info-string / class language hint to one of our lexer modes.
      function detectLang(pre) {
        var code = pre.querySelector('code');
        var hint = '';
        if (code) {
          // marked emits <code class="language-xxx">.
          var cls = code.getAttribute('class') || '';
          var m = cls.match(/language-([a-z0-9+#._-]+)/i);
          if (m) hint = m[1].toLowerCase();
        }
        if (!hint) {
          var cls2 = pre.getAttribute('class') || '';
          var m2 = cls2.match(/language-([a-z0-9+#._-]+)/i);
          if (m2) hint = m2[1].toLowerCase();
        }
        switch (hint) {
          case 'js': case 'javascript': case 'jsx': case 'mjs': case 'cjs':
          case 'ts': case 'typescript': case 'tsx':
            return 'js';
          case 'json': case 'json5': case 'jsonc':
            return 'json';
          case 'py': case 'python': case 'py3':
            return 'py';
          case 'sh': case 'bash': case 'shell': case 'zsh': case 'console': case 'shellsession':
            return 'sh';
          default:
            return null; // unknown → don't touch
        }
      }

      function highlightPre(pre) {
        var lang = detectLang(pre);
        if (!lang) return;
        var code = pre.querySelector('code') || pre;
        // Only highlight a single, plain text run. If marked/another module has
        // already produced element children inside <code>, leave it alone to
        // avoid clobbering or double-wrapping.
        if (code.childNodes.length !== 1 || code.firstChild.nodeType !== 3) {
          // Allow the common case of pure text even if whitespace-only nodes
          // surround it; otherwise bail.
          if (!(code.childNodes.length === 0)) {
            var onlyText = true;
            for (var k = 0; k < code.childNodes.length; k++) {
              if (code.childNodes[k].nodeType !== 3) { onlyText = false; break; }
            }
            if (!onlyText) return;
          }
        }
        var src = code.textContent;
        if (src == null || src === '') return;
        // Bail on very large blocks — not worth the work / risk.
        if (src.length > 20000) return;

        var tokens = tokenize(src, lang);
        if (!tokens || !tokens.length) return;

        var frag = document.createDocumentFragment();
        for (var i = 0; i < tokens.length; i++) {
          var tk = tokens[i];
          if (tk.cls) {
            var span = document.createElement('span');
            span.className = 'tok-' + tk.cls;
            span.textContent = tk.text;   // SAFE: text node, never parsed as HTML
            frag.appendChild(span);
          } else {
            frag.appendChild(document.createTextNode(tk.text));
          }
        }
        // Atomic replace of the code's children with our tokenized fragment.
        code.textContent = '';
        code.appendChild(frag);
        code.classList.add('laam-hl');
      }

      // Tokenize source into [{ text, cls? }]. cls ∈
      //   comment | string | number | keyword | boolean | property | punct
      // `cls` omitted → plain text. The lexer is intentionally simple and
      // language-tolerant; it never errors on malformed input (returns what it
      // has scanned so far).
      function tokenize(src, lang) {
        var out = [];
        var n = src.length;
        var i = 0;
        var kw = KEYWORDS[lang === 'json' ? 'js' : lang] || [];

        function isIdentStart(c) { return /[A-Za-z_$]/.test(c); }
        function isIdentPart(c) { return /[A-Za-z0-9_$]/.test(c); }
        function isDigit(c) { return c >= '0' && c <= '9'; }

        while (i < n) {
          var c = src[i];

          // ---- line comments ----------------------------------------------
          if (lang === 'sh' || lang === 'py') {
            if (c === '#') { i = lineComment(src, i, out); continue; }
          }
          if (lang === 'js' || lang === 'json') {
            if (c === '/' && src[i + 1] === '/') { i = lineComment(src, i, out); continue; }
            // ---- block comments ----
            if (c === '/' && src[i + 1] === '*') {
              var end = src.indexOf('*/', i + 2);
              if (end < 0) end = n - 2;
              out.push({ text: src.slice(i, end + 2), cls: 'comment' });
              i = end + 2;
              continue;
            }
          }

          // ---- strings (', ", `) ------------------------------------------
          if (c === '"' || c === "'" || (c === '`' && lang === 'js')) {
            var sres = scanString(src, i, c);
            out.push({ text: sres.text, cls: 'string' });
            i = sres.next;
            continue;
          }

          // ---- numbers ----------------------------------------------------
          if (isDigit(c) || (c === '.' && isDigit(src[i + 1]))) {
            var j = i + 1;
            // hex / general numeric run (good enough for highlighting)
            while (j < n && /[0-9a-fA-FxXoObBeE._+-]/.test(src[j])) {
              // stop a trailing +/- that isn't part of an exponent
              if ((src[j] === '+' || src[j] === '-') && !/[eE]/.test(src[j - 1])) break;
              j++;
            }
            out.push({ text: src.slice(i, j), cls: 'number' });
            i = j;
            continue;
          }

          // ---- identifiers / keywords / booleans --------------------------
          if (isIdentStart(c)) {
            var k = i + 1;
            while (k < n && isIdentPart(src[k])) k++;
            var word = src.slice(i, k);
            var cls = null;
            if (word === 'true' || word === 'false' ||
                word === 'null' || word === 'undefined' || word === 'None' ||
                word === 'True' || word === 'False') {
              cls = 'boolean';
            } else if (kw.indexOf(word) >= 0) {
              cls = 'keyword';
            } else if (lang === 'json') {
              // In JSON, an identifier-like run is unusual; skip styling.
              cls = null;
            }
            out.push({ text: word, cls: cls });
            i = k;
            continue;
          }

          // ---- JSON object keys:  "key":  → color the key as a property ----
          // (Handled implicitly: the string lexer already colored it as a
          //  string; JSON keys reading as strings is fine and common.)

          // ---- punctuation (light) ----------------------------------------
          if (/[{}()[\];,.:]/.test(c)) {
            out.push({ text: c, cls: 'punct' });
            i++;
            continue;
          }

          // ---- anything else: accumulate as plain text until next "interesting" char
          var p = i + 1;
          while (p < n) {
            var pc = src[p];
            if (isIdentStart(pc) || isDigit(pc) ||
                pc === '"' || pc === "'" || pc === '`' ||
                pc === '#' || pc === '/' ||
                /[{}()[\];,.:]/.test(pc)) break;
            p++;
          }
          out.push({ text: src.slice(i, p), cls: null });
          i = p;
        }
        return out;
      }

      function lineComment(src, i, out) {
        var nl = src.indexOf('\n', i);
        if (nl < 0) nl = src.length;
        out.push({ text: src.slice(i, nl), cls: 'comment' });
        return nl;
      }

      // Scan a quoted string starting at `i` (src[i] === quote). Handles escapes;
      // unterminated strings run to end-of-line (', ") or end-of-input (`).
      function scanString(src, i, quote) {
        var n = src.length;
        var j = i + 1;
        while (j < n) {
          var c = src[j];
          if (c === '\\') { j += 2; continue; }
          if (c === quote) { j++; break; }
          if ((c === '\n') && quote !== '`') { break; } // ', " don't span lines
          j++;
        }
        return { text: src.slice(i, Math.min(j, n)), next: Math.min(j, n) };
      }

      // ===================================================================
      // D) TIMESTAMPS — a faint relative-time line under each message.
      // -------------------------------------------------------------------
      // We append our own tiny line to ev.el. The kernel may also append a
      // "7B · tok/s · tokens" stats caption to assistant messages; we keep ours
      // visually distinct (its own class) and only add the relative time, so the
      // two read as separate lines and never duplicate content.
      // ===================================================================
      function addTimestamp(ev) {
        if (!ev || !ev.el || !ev.msg) return;
        var ts = ev.msg.ts;
        if (!ts) return;
        // Guard: only one timestamp per element (fresh element each render, but
        // be safe against any double-emit).
        if (ev.el.querySelector(':scope > .laam-exp-time')) return;

        var rel = '';
        try { rel = ago(ts); } catch (e) { rel = ''; }
        if (!rel) return;

        var time = document.createElement('div');
        time.className = 'caption laam-exp-time';
        time.textContent = rel;
        time.title = formatDate(ts); // absolute time on hover
        ev.el.appendChild(time);
      }

      // ===================================================================
      // Scoped CSS (injected once). Reuses theme tokens; works light + dark.
      // ===================================================================
      function injectCss() {
        if (document.querySelector('#laam-export-css')) return;
        var style = document.createElement('style');
        style.id = 'laam-export-css';
        style.textContent = [
          // -- Export button + menu (lives in the top sub-bar toolbar) --------
          '.laam-exp-wrap { position: relative; display: inline-flex; }',
          '.laam-exp-btn {',
          '  border: 1px solid var(--border); background: var(--bg-sunken); color: var(--text-dim);',
          '  cursor: pointer; border-radius: 8px; height: 30px; padding: 0 10px;',
          '  font-size: 12.5px; font-family: var(--sans); line-height: 1; display: inline-flex;',
          '  align-items: center; gap: 4px; white-space: nowrap;',
          '}',
          '.laam-exp-btn:hover { color: var(--text); border-color: var(--border-strong); }',
          '.laam-exp-btn[aria-expanded="true"] { color: var(--text); border-color: var(--border-strong); background: var(--border); }',
          '.laam-exp-menu {',
          '  position: absolute; top: calc(100% + 6px); right: 0; z-index: 40;',
          '  min-width: 184px; padding: 6px; display: flex; flex-direction: column; gap: 2px;',
          '  background: var(--bg-elev); border: 1px solid var(--border-strong);',
          '  border-radius: 10px; box-shadow: var(--shadow);',
          '}',
          '.laam-exp-menu[hidden] { display: none; }',
          '.laam-exp-item {',
          '  border: 0; background: transparent; color: var(--text); text-align: left;',
          '  cursor: pointer; border-radius: 7px; padding: 7px 10px; font-size: 13px;',
          '  font-family: var(--sans); line-height: 1.4; white-space: nowrap;',
          '}',
          '.laam-exp-item:hover { background: var(--bg-sunken); }',
          '.laam-exp-item:focus-visible { outline: 2px solid var(--accent); outline-offset: -2px; }',
          '.laam-exp-item[disabled] { opacity: 0.4; cursor: default; }',
          '.laam-exp-item[disabled]:hover { background: transparent; }',
          '.laam-exp-ok { color: var(--accent) !important; }',
          '.laam-exp-err { color: var(--error) !important; }',

          // -- Code-block copy button -----------------------------------------
          // Wrapper is position:relative so the button floats over the <pre>'s
          // top-right corner. The <pre> keeps its own overflow-x for scrolling.
          '.laam-pre-wrap { position: relative; }',
          '.laam-pre-wrap > pre { margin-top: 8px; }',
          '.laam-pre-copy {',
          '  position: absolute; top: 6px; right: 6px; z-index: 2;',
          '  border: 1px solid var(--border-strong); background: var(--bg-elev); color: var(--text-dim);',
          '  border-radius: 7px; padding: 3px 8px; font-size: 11px; line-height: 1.4;',
          '  font-family: var(--sans); cursor: pointer; opacity: 0;',
          '  transition: opacity .12s ease, color .12s ease, background .12s ease;',
          '}',
          '.laam-pre-wrap:hover .laam-pre-copy,',
          '.laam-pre-copy:focus-visible { opacity: 1; }',
          '.laam-pre-copy:hover { color: var(--text); background: var(--bg-sunken); }',
          // On the user bubble (colored bg) the wrapped <pre> has a translucent
          // light background — keep the button readable there too.
          '.msg.user .laam-pre-copy {',
          '  background: rgba(255,255,255,0.18); border-color: rgba(255,255,255,0.32); color: #fff;',
          '}',
          '.msg.user .laam-pre-copy:hover { background: rgba(255,255,255,0.30); color: #fff; }',
          // Touch / coarse pointers can't hover → always show the button.
          '@media (hover: none) { .laam-pre-copy { opacity: 1; } }',

          // -- Syntax highlight token colors (theme-aware) --------------------
          // Light-theme defaults; the [data-theme="dark"] block overrides them.
          '.laam-hl .tok-comment { color: var(--text-faint); font-style: italic; }',
          '.laam-hl .tok-string  { color: #16a34a; }',
          '.laam-hl .tok-number  { color: #b45309; }',
          '.laam-hl .tok-keyword { color: var(--accent); font-weight: 600; }',
          '.laam-hl .tok-boolean { color: #b45309; font-weight: 600; }',
          '.laam-hl .tok-punct   { color: var(--text-dim); }',
          // In the user bubble the <pre> text is white — tone tokens to fit.
          '.msg.user .laam-hl .tok-comment { color: rgba(255,255,255,0.62); }',
          '.msg.user .laam-hl .tok-string  { color: #b7f7c6; }',
          '.msg.user .laam-hl .tok-number  { color: #ffd9a8; }',
          '.msg.user .laam-hl .tok-keyword { color: #fff; }',
          '.msg.user .laam-hl .tok-boolean { color: #ffd9a8; }',
          '.msg.user .laam-hl .tok-punct   { color: rgba(255,255,255,0.78); }',

          // -- Timestamp line -------------------------------------------------
          // Reuses .caption sizing; faint and unobtrusive. For assistant msgs
          // the kernel's stats caption sits above ours — both stack cleanly.
          '.laam-exp-time { opacity: 0.85; }',
          '.msg.user .laam-exp-time { align-self: flex-end; }',
        ].join('\n');
        document.head.appendChild(style);

        // Dark-theme token overrides (separate rule so we can scope to the attr).
        var darkStyle = document.createElement('style');
        darkStyle.id = 'laam-export-css-dark';
        darkStyle.textContent = [
          '[data-theme="dark"] .laam-hl .tok-string  { color: #7ee2a8; }',
          '[data-theme="dark"] .laam-hl .tok-number  { color: #f0b36b; }',
          '[data-theme="dark"] .laam-hl .tok-boolean { color: #f0b36b; }',
        ].join('\n');
        document.head.appendChild(darkStyle);
      }
    } catch (e) {
      // Module init must never throw — log and bail.
      try { console.error('[chat] export init failed:', e); } catch (e2) {}
    }
  },
});
