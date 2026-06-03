// LAAM — lightweight i18n engine (vanilla JS, no build step).
// ===========================================================================
// Loads BEFORE common.js on every page. Exposes a small `window.LAAMI18n`:
//
//   t(key, vars?) -> string         dotted-key lookup, {var} interpolation,
//                                    falls back active-lang → vi → the key
//   getLang() -> 'vi'|'en'|'zh'
//   setLang(lang)                    persists + re-applies DOM + notifies subs
//   onChange(fn)                     register a re-render cb for dynamic pages
//   applyDOM(root?)                  translate static markup in `root`
//   register(partial)                deep-merge {vi,en,zh} dictionaries
//   SUPPORTED, LANG_NAMES
//
// STATIC markup is tagged with attributes and translated by applyDOM():
//   data-i18n="key"          → textContent
//   data-i18n-html="key"     → innerHTML (trusted dictionary text only)
//   data-i18n-ph="key"       → placeholder
//   data-i18n-title="key"    → title
//   data-i18n-aria="key"     → aria-label
//
// DYNAMIC (JS-rendered) content calls LAAMI18n.t('key') at render time and
// re-renders on language change (LAAMI18n.onChange or the 'laam:lang' event).
//
// Page-specific dictionaries live in their own i18n.<page>.js files that call
// LAAMI18n.register({...}) at load. This file seeds only the SHARED keys
// (nav, status, time, connection, theme, language names, generic buttons).
// ===========================================================================
(function () {
  'use strict';
  var LS_KEY = 'laam.lang';
  var SUPPORTED = ['vi', 'en', 'zh'];
  var LANG_NAMES = { vi: 'Tiếng Việt', en: 'English', zh: '中文' };
  var DICT = { vi: {}, en: {}, zh: {} };
  var subs = [];
  var lang = resolveInitial();

  function resolveInitial() {
    // Explicit ?lang= override (also persisted) — handy for shareable links.
    try {
      var q = (new URLSearchParams(location.search)).get('lang');
      if (q && SUPPORTED.indexOf(q) >= 0) { try { localStorage.setItem(LS_KEY, q); } catch (e) {} return q; }
    } catch (e) {}
    var s = null;
    try { s = localStorage.getItem(LS_KEY); } catch (e) {}
    if (s && SUPPORTED.indexOf(s) >= 0) return s;
    var n = (navigator.language || navigator.userLanguage || '').toLowerCase();
    if (n.indexOf('vi') === 0) return 'vi';
    if (n.indexOf('zh') === 0) return 'zh';
    if (n.indexOf('en') === 0) return 'en';
    return 'vi'; // default
  }

  function deepMerge(target, src) {
    for (var k in src) {
      if (!Object.prototype.hasOwnProperty.call(src, k)) continue;
      var v = src[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        if (!target[k] || typeof target[k] !== 'object') target[k] = {};
        deepMerge(target[k], v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }

  // Merge a partial { vi:{...}, en:{...}, zh:{...} } into the global dictionary.
  function register(partial) {
    if (!partial || typeof partial !== 'object') return;
    for (var i = 0; i < SUPPORTED.length; i++) {
      var L = SUPPORTED[i];
      if (partial[L]) deepMerge(DICT[L], partial[L]);
    }
  }

  function lookup(L, key) {
    var cur = DICT[L];
    var parts = key.split('.');
    for (var i = 0; i < parts.length; i++) {
      if (cur && typeof cur === 'object' && parts[i] in cur) cur = cur[parts[i]];
      else return undefined;
    }
    return typeof cur === 'string' ? cur : undefined;
  }

  function t(key, vars) {
    if (key == null) return '';
    var s = lookup(lang, key);
    if (s == null) s = lookup('vi', key);
    if (s == null) s = key; // last resort: show the key so gaps are visible
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] != null ? String(vars[name]) : m;
      });
    }
    return s;
  }

  function getLang() { return lang; }

  function setLang(L) {
    if (SUPPORTED.indexOf(L) < 0 || L === lang) return;
    lang = L;
    try { localStorage.setItem(LS_KEY, L); } catch (e) {}
    document.documentElement.lang = htmlLangTag(L);
    document.documentElement.dataset.lang = L;
    applyDOM(document);
    for (var i = 0; i < subs.length; i++) { try { subs[i](L); } catch (e) {} }
    try { window.dispatchEvent(new CustomEvent('laam:lang', { detail: L })); } catch (e) {}
  }

  function htmlLangTag(L) { return L === 'zh' ? 'zh-Hans' : L; }

  function onChange(cb) { if (typeof cb === 'function') subs.push(cb); }

  // Translate static markup carrying data-i18n* attributes.
  function applyDOM(root) {
    root = root || document;
    if (!root.querySelectorAll) return;
    each(root, '[data-i18n]', function (el, k) { el.textContent = t(k); });
    each(root, '[data-i18n-html]', function (el, k) { el.innerHTML = t(k); });
    each(root, '[data-i18n-ph]', function (el, k) { el.setAttribute('placeholder', t(k)); });
    each(root, '[data-i18n-title]', function (el, k) { el.setAttribute('title', t(k)); });
    each(root, '[data-i18n-aria]', function (el, k) { el.setAttribute('aria-label', t(k)); });
  }
  function each(root, sel, fn) {
    var attr = sel.slice(1, -1); // strip [ ]
    var nodes = root.querySelectorAll(sel);
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute(attr);
      if (key) { try { fn(nodes[i], key); } catch (e) {} }
    }
  }

  // ---- shared dictionary (nav / status / time / connection / theme) --------
  register({
    vi: {
      nav: { dashboard: 'Tổng quan', agents: 'Agent', graph: 'Sơ đồ', search: 'Tìm kiếm', office: 'Văn phòng', chat: 'Trò chuyện' },
      brand: { sub: 'Giám sát AI Agent cục bộ' },
      conn: { connecting: 'Đang kết nối…', live: 'Trực tiếp', lost: 'Mất kết nối' },
      theme: { toggle: 'Đổi giao diện sáng/tối' },
      lang: { label: 'Ngôn ngữ' },
      status: { running: 'Đang chạy', idle: 'Tạm dừng', done: 'Hoàn tất', stuck: 'Nghi kẹt' },
      time: { justNow: 'vừa xong', minAgo: '{n} phút trước', hourAgo: '{n} giờ trước', dayAgo: '{n} ngày trước', none: '—' },
      common: { export: 'Xuất', retry: 'Thử lại', loading: 'Đang tải…', search: 'Tìm kiếm', close: 'Đóng', cancel: 'Huỷ', save: 'Lưu', delete: 'Xoá', all: 'Tất cả', none: '—', copy: 'Chép', copied: 'Đã chép' },
    },
    en: {
      nav: { dashboard: 'Dashboard', agents: 'Agents', graph: 'Graph', search: 'Search', office: 'Office', chat: 'Chat' },
      brand: { sub: 'Local AI Agent Monitoring' },
      conn: { connecting: 'Connecting…', live: 'Live', lost: 'Disconnected' },
      theme: { toggle: 'Toggle light/dark theme' },
      lang: { label: 'Language' },
      status: { running: 'Running', idle: 'Idle', done: 'Done', stuck: 'Stuck' },
      time: { justNow: 'just now', minAgo: '{n} min ago', hourAgo: '{n} h ago', dayAgo: '{n} d ago', none: '—' },
      common: { export: 'Export', retry: 'Retry', loading: 'Loading…', search: 'Search', close: 'Close', cancel: 'Cancel', save: 'Save', delete: 'Delete', all: 'All', none: '—', copy: 'Copy', copied: 'Copied' },
    },
    zh: {
      nav: { dashboard: '仪表盘', agents: '智能体', graph: '关系图', search: '搜索', office: '办公室', chat: '对话' },
      brand: { sub: '本地 AI 智能体监控' },
      conn: { connecting: '连接中…', live: '实时', lost: '已断开' },
      theme: { toggle: '切换浅色/深色主题' },
      lang: { label: '语言' },
      status: { running: '运行中', idle: '空闲', done: '完成', stuck: '疑似卡住' },
      time: { justNow: '刚刚', minAgo: '{n} 分钟前', hourAgo: '{n} 小时前', dayAgo: '{n} 天前', none: '—' },
      common: { export: '导出', retry: '重试', loading: '加载中…', search: '搜索', close: '关闭', cancel: '取消', save: '保存', delete: '删除', all: '全部', none: '—', copy: '复制', copied: '已复制' },
    },
  });

  document.documentElement.lang = htmlLangTag(lang);
  document.documentElement.dataset.lang = lang;

  window.LAAMI18n = {
    t: t, getLang: getLang, setLang: setLang, onChange: onChange,
    applyDOM: applyDOM, register: register,
    SUPPORTED: SUPPORTED.slice(), LANG_NAMES: LANG_NAMES,
  };
})();
