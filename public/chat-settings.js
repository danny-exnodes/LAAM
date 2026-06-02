// LAAM Chat — SETTINGS module (model picker + generation params + system prompt).
// ===========================================================================
// Registers a "settings" feature module on the chat kernel. Adds a gear button
// to the top toolbar that toggles a popover card with:
//   • model dropdown   (GET /api/ollama/models, cached)
//   • temperature      (range 0–1.5)
//   • top_p            (range 0–1)
//   • num_predict      (number; blank = model default)
//   • system prompt    (textarea; blank = server default)
//   • reset-to-default
// Everything is written to the CURRENT conversation via store.updateSettings(),
// which the kernel's send() already forwards to /api/chat. UI text Vietnamese.
//
// HARD RULES honored: only this file + bin/laam.js touched; CSS injected once
// under <style id="laam-settings-css"> and token-scoped; nothing throws out of
// init()/handlers; all DOM access null-guarded.
// ===========================================================================
(window.LAAM_CHAT_MODULES = window.LAAM_CHAT_MODULES || []).push({
  id: 'settings',
  init(ctx) {
    const store = ctx && ctx.store;
    const esc = (ctx && ctx.esc) || ((s) => (s == null ? '' : String(s)));
    const mounts = (ctx && ctx.mounts) || {};
    if (!store) return;

    const DEFAULT_MODEL = 'qwen2.5-coder:7b'; // matches the backend hard-lock
    const DEFAULTS = { temperature: 0.8, top_p: 0.9 };

    let modelCache = null;   // string[] of available model names (fetched once)
    let serverModel = null;  // model from /api/chat/info (the backend default)
    let panel = null;        // the popover element (lazily built)
    let open = false;
    let booted = false;      // ran the first-open model fetch + default-fix?

    // ---- CSS (once) ------------------------------------------------------
    injectCss();

    // ---- gear button -----------------------------------------------------
    const gear = document.createElement('button');
    gear.type = 'button';
    gear.className = 'laam-settings-gear';
    gear.setAttribute('aria-label', 'Cài đặt mô hình');
    gear.setAttribute('aria-expanded', 'false');
    gear.title = 'Cài đặt mô hình';
    gear.textContent = '⚙';
    if (mounts.toolbar) mounts.toolbar.appendChild(gear);
    gear.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });

    // ---- events ----------------------------------------------------------
    store.on('command:settings', () => openPanel());
    store.on('conversation:switch', () => { if (panel) syncControls(); });

    // ======================================================================
    // Open / close
    // ======================================================================
    function toggle() { open ? closePanel() : openPanel(); }

    function openPanel() {
      if (!panel) panel = buildPanel();
      if (panel.parentNode !== document.body) document.body.appendChild(panel);
      open = true;
      panel.hidden = false;
      gear.setAttribute('aria-expanded', 'true');
      position();
      syncControls();
      // Fetch the model list the first time the panel opens, then apply the
      // out-of-the-box default-fix once we know what Ollama actually has.
      if (!booted) { booted = true; bootModels(); }
      // Late-bind outside-click / escape / reposition handlers while open.
      setTimeout(() => {
        document.addEventListener('mousedown', onDocDown, true);
        document.addEventListener('keydown', onKey, true);
        window.addEventListener('resize', position);
      }, 0);
    }

    function closePanel() {
      open = false;
      if (panel) panel.hidden = true;
      gear.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', onDocDown, true);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', position);
    }

    function onDocDown(e) {
      if (!panel) return;
      if (panel.contains(e.target) || e.target === gear) return;
      closePanel();
    }
    function onKey(e) { if (e.key === 'Escape') { closePanel(); } }

    // Anchor the popover under the gear, kept within the viewport.
    function position() {
      if (!panel || panel.hidden) return;
      const r = gear.getBoundingClientRect();
      const w = panel.offsetWidth || 340;
      const margin = 8;
      let left = r.right - w;                       // right-align to the gear
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      const top = Math.min(r.bottom + 6, window.innerHeight - 40);
      panel.style.left = left + 'px';
      panel.style.top = top + 'px';
    }

    // ======================================================================
    // Build the panel DOM
    // ======================================================================
    function buildPanel() {
      const p = document.createElement('div');
      p.className = 'laam-settings-panel';
      p.setAttribute('role', 'dialog');
      p.setAttribute('aria-label', 'Cài đặt mô hình');
      p.hidden = true;
      p.innerHTML = `
        <div class="ls-head">
          <span class="ls-title">Cài đặt mô hình</span>
          <button type="button" class="ls-x" aria-label="Đóng">×</button>
        </div>
        <div class="ls-body">
          <label class="ls-field">
            <span class="ls-label">Mô hình</span>
            <select class="ls-select" id="ls-model"><option value="">Đang tải…</option></select>
          </label>

          <label class="ls-field">
            <span class="ls-label">Nhiệt độ (temperature) <b id="ls-temp-val">0.8</b></span>
            <input type="range" class="ls-range" id="ls-temp" min="0" max="1.5" step="0.1" value="0.8">
            <span class="ls-hint">Thấp = chính xác · Cao = sáng tạo</span>
          </label>

          <label class="ls-field">
            <span class="ls-label">Top-p <b id="ls-topp-val">0.9</b></span>
            <input type="range" class="ls-range" id="ls-topp" min="0" max="1" step="0.05" value="0.9">
          </label>

          <label class="ls-field">
            <span class="ls-label">Số token tối đa (num_predict)</span>
            <input type="number" class="ls-num" id="ls-maxtok" min="64" max="4096" step="1" placeholder="Mặc định của mô hình">
            <span class="ls-hint">Để trống = dùng mặc định của mô hình</span>
          </label>

          <label class="ls-field">
            <span class="ls-label">Lời nhắc hệ thống (system)</span>
            <textarea class="ls-area" id="ls-system" rows="4" placeholder="Lời nhắc hệ thống — để trống dùng mặc định"></textarea>
          </label>
        </div>
        <div class="ls-foot">
          <span class="ls-note">Áp dụng cho cuộc trò chuyện hiện tại.</span>
          <button type="button" class="ls-reset" id="ls-reset">Đặt lại mặc định</button>
        </div>
      `;

      const q = (sel) => p.querySelector(sel);
      const xBtn = q('.ls-x');
      const modelSel = q('#ls-model');
      const tempEl = q('#ls-temp');
      const tempVal = q('#ls-temp-val');
      const toppEl = q('#ls-topp');
      const toppVal = q('#ls-topp-val');
      const maxTokEl = q('#ls-maxtok');
      const sysEl = q('#ls-system');
      const resetBtn = q('#ls-reset');

      if (xBtn) xBtn.addEventListener('click', closePanel);

      // Model change → persist + refresh badge.
      if (modelSel) modelSel.addEventListener('change', () => {
        const m = modelSel.value;
        if (!m) return;
        store.updateSettings({ model: m });
        setBadge(m);
      });

      // Temperature.
      if (tempEl) tempEl.addEventListener('input', () => {
        const v = Number(tempEl.value);
        if (tempVal) tempVal.textContent = v.toFixed(1);
        store.updateSettings({ temperature: v });
      });

      // Top-p.
      if (toppEl) toppEl.addEventListener('input', () => {
        const v = Number(toppEl.value);
        if (toppVal) toppVal.textContent = v.toFixed(2);
        store.updateSettings({ top_p: v });
      });

      // Max tokens — blank clears the setting (model default).
      if (maxTokEl) maxTokEl.addEventListener('change', () => {
        const raw = maxTokEl.value.trim();
        if (raw === '') { store.updateSettings({ num_predict: undefined }); return; }
        let n = Math.round(Number(raw));
        if (!isFinite(n)) { store.updateSettings({ num_predict: undefined }); return; }
        n = Math.max(1, Math.min(8192, n));
        maxTokEl.value = String(n);
        store.updateSettings({ num_predict: n });
      });

      // System prompt — blank clears the setting (server default).
      if (sysEl) sysEl.addEventListener('change', () => {
        const v = sysEl.value;
        store.updateSettings({ system: v.trim() ? v : undefined });
      });

      // Reset everything for the current conversation.
      if (resetBtn) resetBtn.addEventListener('click', () => {
        store.updateSettings({ model: undefined, temperature: undefined, top_p: undefined, num_predict: undefined, system: undefined });
        syncControls();
        setBadge(serverModel || (modelCache && modelCache[0]) || DEFAULT_MODEL);
      });

      // Stash refs for syncControls().
      p._refs = { modelSel, tempEl, tempVal, toppEl, toppVal, maxTokEl, sysEl };
      return p;
    }

    // ======================================================================
    // Reflect the current conversation's settings into the controls.
    // ======================================================================
    function syncControls() {
      if (!panel || !panel._refs) return;
      const s = store.getSettings() || {};
      const r = panel._refs;

      // Model select: chosen → server default → first available.
      populateModelOptions();
      if (r.modelSel) {
        const want = s.model || (serverModel && inCache(serverModel) ? serverModel : (modelCache && modelCache[0]) || serverModel || '');
        if (want && optionExists(r.modelSel, want)) r.modelSel.value = want;
        else if (r.modelSel.options.length) r.modelSel.selectedIndex = 0;
      }

      const temp = typeof s.temperature === 'number' ? s.temperature : DEFAULTS.temperature;
      if (r.tempEl) r.tempEl.value = String(temp);
      if (r.tempVal) r.tempVal.textContent = Number(temp).toFixed(1);

      const topp = typeof s.top_p === 'number' ? s.top_p : DEFAULTS.top_p;
      if (r.toppEl) r.toppEl.value = String(topp);
      if (r.toppVal) r.toppVal.textContent = Number(topp).toFixed(2);

      if (r.maxTokEl) r.maxTokEl.value = typeof s.num_predict === 'number' ? String(s.num_predict) : '';
      if (r.sysEl) r.sysEl.value = typeof s.system === 'string' ? s.system : '';
    }

    // ======================================================================
    // Model list
    // ======================================================================
    function inCache(name) { return !!(modelCache && modelCache.indexOf(name) >= 0); }
    function optionExists(sel, val) { return Array.prototype.some.call(sel.options, (o) => o.value === val); }

    function populateModelOptions() {
      if (!panel || !panel._refs || !panel._refs.modelSel) return;
      const sel = panel._refs.modelSel;
      if (!modelCache) { // not fetched yet — keep a single placeholder
        if (!sel.options.length || sel.options[0].value !== '') {
          sel.innerHTML = '<option value="">Đang tải…</option>';
        }
        return;
      }
      const list = modelCache.slice();
      // Ensure the currently-selected model is always listed (even if Ollama
      // doesn't report it), so the user's choice never silently disappears.
      const cur = (store.getSettings() || {}).model;
      if (cur && list.indexOf(cur) < 0) list.unshift(cur);
      const prettyOf = (m) => (store.prettyModel ? store.prettyModel(m) : m);
      sel.innerHTML = list.length
        ? list.map((m) => `<option value="${esc(m)}">${esc(prettyOf(m))}</option>`).join('')
        : '<option value="">(không có mô hình)</option>';
    }

    async function bootModels() {
      // Fetch the server default + the available model list in parallel.
      const tasks = [
        fetch('/api/chat/info').then((r) => r.json()).then((d) => { serverModel = (d && d.model) || DEFAULT_MODEL; }).catch(() => { serverModel = DEFAULT_MODEL; }),
        fetch('/api/ollama/models').then((r) => (r.ok ? r.json() : null)).then((d) => {
          const arr = (d && Array.isArray(d.models)) ? d.models : (Array.isArray(d) ? d : []);
          modelCache = arr.map((m) => (m && (m.name || m.model)) || m).filter((x) => typeof x === 'string');
        }).catch(() => { modelCache = []; }),
      ];
      try { await Promise.all(tasks); } catch (e) { /* fail soft */ }

      // Default-fix: if this conversation has no model AND the server default
      // isn't actually pulled in Ollama, adopt the first available so chat
      // works out of the box. Update the badge to match.
      const s = store.getSettings() || {};
      if (!s.model && modelCache && modelCache.length && serverModel && !inCache(serverModel)) {
        const first = modelCache[0];
        store.updateSettings({ model: first });
        setBadge(first);
      }
      // Re-render options now that we have data.
      if (panel) syncControls();
    }

    // ======================================================================
    // Badge
    // ======================================================================
    function setBadge(model) {
      if (!store.setModelInfo) return;
      const pretty = store.prettyModel ? store.prettyModel(model) : model;
      store.setModelInfo('<span class="badge-local">⬡ LOCAL</span><span>' + esc(pretty) + ' (local) · miễn phí</span>');
    }

    // ======================================================================
    // CSS
    // ======================================================================
    function injectCss() {
      if (document.querySelector('#laam-settings-css')) return;
      const style = document.createElement('style');
      style.id = 'laam-settings-css';
      style.textContent = `
        .laam-settings-gear {
          flex: 0 0 auto; border: 1px solid var(--border); background: var(--bg-sunken);
          color: var(--text-dim); cursor: pointer; border-radius: 8px; width: 30px; height: 30px;
          font-size: 15px; line-height: 1; display: grid; place-items: center;
          font-family: var(--sans);
        }
        .laam-settings-gear:hover { color: var(--text); }
        .laam-settings-gear[aria-expanded="true"] { color: var(--accent); border-color: var(--border-strong); }

        .laam-settings-panel {
          position: fixed; z-index: 60; width: 340px; max-width: calc(100vw - 16px);
          max-height: calc(100vh - 80px); overflow-y: auto;
          background: var(--bg-elev); border: 1px solid var(--border-strong);
          border-radius: 14px; box-shadow: var(--shadow);
          font-family: var(--sans); color: var(--text);
        }
        .laam-settings-panel .ls-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 12px 14px 10px; border-bottom: 1px solid var(--border);
        }
        .laam-settings-panel .ls-title { font-size: 13.5px; font-weight: 600; color: var(--text); }
        .laam-settings-panel .ls-x {
          border: 0; background: transparent; color: var(--text-faint); cursor: pointer;
          font-size: 19px; line-height: 1; width: 24px; height: 24px; border-radius: 6px;
        }
        .laam-settings-panel .ls-x:hover { color: var(--text); background: var(--bg-sunken); }
        .laam-settings-panel .ls-body { padding: 12px 14px; display: flex; flex-direction: column; gap: 14px; }
        .laam-settings-panel .ls-field { display: flex; flex-direction: column; gap: 6px; }
        .laam-settings-panel .ls-label {
          font-size: 12px; color: var(--text-dim); display: flex; justify-content: space-between; gap: 8px;
        }
        .laam-settings-panel .ls-label b { color: var(--accent); font-variant-numeric: tabular-nums; font-weight: 600; }
        .laam-settings-panel .ls-hint { font-size: 11px; color: var(--text-faint); }
        .laam-settings-panel .ls-select,
        .laam-settings-panel .ls-num,
        .laam-settings-panel .ls-area {
          width: 100%; box-sizing: border-box; background: var(--bg-sunken);
          border: 1px solid var(--border); border-radius: 9px; color: var(--text);
          font-family: var(--sans); font-size: 13px; padding: 8px 10px; outline: 0;
        }
        .laam-settings-panel .ls-area { font-family: var(--mono); font-size: 12px; line-height: 1.5; resize: vertical; min-height: 64px; }
        .laam-settings-panel .ls-select:focus,
        .laam-settings-panel .ls-num:focus,
        .laam-settings-panel .ls-area:focus { border-color: var(--accent); }
        .laam-settings-panel .ls-range {
          width: 100%; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px;
          background: var(--bg-sunken); border: 1px solid var(--border); cursor: pointer; margin: 4px 0;
        }
        .laam-settings-panel .ls-range::-webkit-slider-thumb {
          -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%;
          background: var(--accent); border: 2px solid var(--bg-elev); box-shadow: var(--shadow); cursor: pointer;
        }
        .laam-settings-panel .ls-range::-moz-range-thumb {
          width: 16px; height: 16px; border-radius: 50%; background: var(--accent);
          border: 2px solid var(--bg-elev); box-shadow: var(--shadow); cursor: pointer;
        }
        .laam-settings-panel .ls-foot {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          padding: 10px 14px 12px; border-top: 1px solid var(--border);
        }
        .laam-settings-panel .ls-note { font-size: 11px; color: var(--text-faint); }
        .laam-settings-panel .ls-reset {
          border: 1px solid var(--border); background: var(--bg-sunken); color: var(--text-dim);
          border-radius: 8px; padding: 6px 11px; font-size: 12px; cursor: pointer;
          font-family: var(--sans); flex: 0 0 auto;
        }
        .laam-settings-panel .ls-reset:hover { color: var(--text); background: var(--border); }
        @media (max-width: 860px) {
          .laam-settings-panel { width: calc(100vw - 16px); }
        }
      `;
      document.head.appendChild(style);
    }
  },
});
