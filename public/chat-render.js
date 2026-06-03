// LAAM — Rich chat message renderer.
// Turns a completed assistant message (Markdown + special fenced blocks) into
// safe, rich HTML inside the assistant bubble. Loaded as a global on the chat
// page AFTER marked / DOMPurify / Chart.js / Leaflet, before chat.js.
//
// Exposes:  window.LAAMChatRender = { renderMessage(rawText, targetEl) }
//   renderMessage replaces the contents of `targetEl` (the assistant bubble)
//   with rendered output. Called ONCE, when a streamed message is complete.
//
// ---------------------------------------------------------------------------
// SPECIAL FENCED BLOCKS
// ---------------------------------------------------------------------------
// Two info-strings are intercepted before Markdown runs and rendered natively.
//
// 1) ```chart``` — a Chart.js-ish config as JSON. Shape:
//      { "type":"bar|line|pie|doughnut|radar",
//        "title":"optional heading",
//        "data":{ "labels":[...], "datasets":[{ "label":"..", "data":[..] }] },
//        "options":{ ... optional Chart.js options ... } }
//    One-liner example:
//      ```chart
//      {"type":"bar","title":"Doanh thu","data":{"labels":["T1","T2"],"datasets":[{"label":"VND","data":[3,5]}]}}
//      ```
//
// 2) ```map``` — a small Leaflet map as JSON. Shape:
//      { "center":[lat,lng] (optional),
//        "zoom":N (optional, default 12),
//        "markers":[{ "lat":.., "lng":.., "label":"..(optional)" }],
//        "route":[[lat,lng],...] (optional polyline),
//        "directions":{ "from":"text", "to":"text" } (optional) }
//    One-liner example:
//      ```map
//      {"center":[21.0285,105.8542],"zoom":13,"markers":[{"lat":21.0285,"lng":105.8542,"label":"Hồ Gươm"}]}
//      ```
//
// ---------------------------------------------------------------------------
// PIPELINE (order matters for XSS safety)
//   1. Extract chart/map fenced blocks → replace each with a placeholder token.
//   2. marked.parse() the remaining Markdown → HTML string.
//   3. DOMPurify.sanitize() the HTML  ← the anti-XSS gate. Model text is never
//      inserted as HTML without passing through here.
//   4. Post-process the sanitized DOM (safe <a>, table class, swap placeholders).
//   5. Build chart/map elements from PARSED JSON (no raw HTML → safe).
//   6. Self-inject scoped CSS once.
// A top-level try/catch guarantees a failed block never blanks the message:
// on error we fall back to escaped, pre-wrapped plain text.
// ---------------------------------------------------------------------------

(function () {
  'use strict';

  var L_ = window.LAAM || {};
  var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };
  var esc =
    (L_ && typeof L_.esc === 'function')
      ? L_.esc
      : function (s) {
          return s == null
            ? ''
            : String(s).replace(/[&<>"]/g, function (c) {
                return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
              });
        };

  // Resolve a theme CSS var with a fallback (charts/maps should match theme).
  function cssVar(name, fallback) {
    try {
      if (L_ && typeof L_.cssVar === 'function') {
        var v = L_.cssVar(name);
        if (v) return v;
      }
      var v2 = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v2 || fallback;
    } catch (e) {
      return fallback;
    }
  }

  // Text token (NOT an HTML comment): DOMPurify strips comments, so the
  // placeholder must survive sanitize as plain text and be swapped afterwards.
  var PLACEHOLDER_RE = /LAAMBLOCK(\d+)ENDBLOCK/;
  var PLACEHOLDER_RE_G = /LAAMBLOCK(\d+)ENDBLOCK/g;

  // ---- Step 1: extract ```chart``` / ```map``` fences ----------------------
  // Returns { text, blocks }. Each block = { placeholder, kind, raw }.
  // We hand-scan for fences so we only intercept the two special info-strings
  // and leave every other fenced code block (```js, ```` ```, etc.) for marked.
  function extractSpecialBlocks(src) {
    var blocks = [];
    var lines = String(src).split('\n');
    var out = [];
    var i = 0;
    var n = lines.length;

    while (i < n) {
      var line = lines[i];
      // Opening fence: optional indent, ``` or more backticks, then info string.
      var open = line.match(/^(\s*)(`{3,})([^`]*)$/);
      var kind = open ? open[3].trim().toLowerCase() : '';

      if (open && (kind === 'chart' || kind === 'map')) {
        var fence = open[2]; // the exact backtick run that opened the block
        var body = [];
        var j = i + 1;
        var closed = false;
        for (; j < n; j++) {
          // Closing fence: same-or-more backticks, nothing else of substance.
          var closeRe = new RegExp('^\\s*' + fence.replace(/`/g, '`') + '`*\\s*$');
          if (closeRe.test(lines[j])) {
            closed = true;
            break;
          }
          body.push(lines[j]);
        }
        if (closed) {
          var idx = blocks.length;
          var placeholder = 'LAAMBLOCK' + idx + 'ENDBLOCK';
          blocks.push({ placeholder: placeholder, kind: kind, raw: body.join('\n') });
          // Surround with blank lines so marked treats it as its own paragraph.
          out.push('');
          out.push(placeholder);
          out.push('');
          i = j + 1;
          continue;
        }
        // Unclosed fence → fall through and emit the line literally.
      }
      out.push(line);
      i++;
    }

    return { text: out.join('\n'), blocks: blocks };
  }

  // ---- Step 0: normalize mislabeled blocks (7B robustness) ----------------
  // Small models often emit ```json (or no language) instead of ```chart /
  // ```map, or wrap a Markdown table in a fence. Rewrite those so the renderer
  // recognizes them — WITHOUT touching genuine code/JSON blocks.
  function tryParseJson(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function looksLikeChartObj(o) {
    return o && typeof o === 'object' && typeof o.type === 'string' && o.data && typeof o.data === 'object' &&
      (Array.isArray(o.data.datasets) || Array.isArray(o.data.labels));
  }
  function looksLikeMapObj(o) {
    return o && typeof o === 'object' &&
      (Array.isArray(o.markers) || Array.isArray(o.route) ||
        (o.nearby && typeof o.nearby === 'object') ||
        (o.directions && typeof o.directions === 'object' && (o.directions.to || o.directions.from)));
  }
  function isTableLines(lines) {
    var hasPipe = false, hasSep = false;
    for (var k = 0; k < lines.length; k++) {
      if (lines[k].indexOf('|') >= 0) hasPipe = true;
      if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(lines[k])) hasSep = true;
    }
    return hasPipe && hasSep;
  }
  function normalizeFences(src) {
    var lines = String(src).split('\n');
    var out = [];
    var i = 0, n = lines.length;
    while (i < n) {
      var line = lines[i];
      var open = line.match(/^(\s*)(`{3,})([^`]*)$/);
      if (open) {
        var indent = open[1], fence = open[2], kind = open[3].trim().toLowerCase();
        var body = [], j = i + 1, closed = false;
        var closeRe = new RegExp('^\\s*' + fence + '`*\\s*$');
        for (; j < n; j++) { if (closeRe.test(lines[j])) { closed = true; break; } body.push(lines[j]); }
        if (closed) {
          if (kind === 'chart' || kind === 'map') {
            out.push(line); for (var a = 0; a < body.length; a++) out.push(body[a]); out.push(lines[j]);
          } else {
            var bodyStr = body.join('\n').trim();
            var obj = tryParseJson(bodyStr);
            if (obj && looksLikeChartObj(obj)) { out.push(indent + '```chart'); out.push(bodyStr); out.push(indent + '```'); }
            else if (obj && looksLikeMapObj(obj)) { out.push(indent + '```map'); out.push(bodyStr); out.push(indent + '```'); }
            else if ((kind === '' || kind === 'markdown' || kind === 'md' || kind === 'text' || kind === 'table' || kind === 'gfm') && isTableLines(body)) {
              for (var t = 0; t < body.length; t++) out.push(body[t]); // unwrap table
            } else {
              out.push(line); for (var c = 0; c < body.length; c++) out.push(body[c]); out.push(lines[j]);
            }
          }
          i = j + 1; continue;
        }
      }
      out.push(line); i++;
    }
    var res = out.join('\n');
    // Whole message is a bare chart/map JSON object (no fence at all) → wrap it.
    if (res.indexOf('```') < 0) {
      var whole = tryParseJson(res.trim());
      if (whole && looksLikeChartObj(whole)) return '```chart\n' + res.trim() + '\n```';
      if (whole && looksLikeMapObj(whole)) return '```map\n' + res.trim() + '\n```';
    }
    // Catch a standalone single-line chart/map JSON object emitted WITHOUT a
    // fence inside prose (small models often do "Here is the chart:\n{json}").
    var ls = res.split('\n'); var outed = []; var inFence = false;
    for (var p = 0; p < ls.length; p++) {
      var ln = ls[p];
      if (/^\s*`{3,}/.test(ln)) { inFence = !inFence; outed.push(ln); continue; }
      if (!inFence) {
        var tr = ln.trim();
        if (tr.length > 20 && tr.charAt(0) === '{' && tr.charAt(tr.length - 1) === '}') {
          var po = tryParseJson(tr);
          if (po && looksLikeChartObj(po)) { outed.push('```chart', tr, '```'); continue; }
          if (po && looksLikeMapObj(po)) { outed.push('```map', tr, '```'); continue; }
        }
      }
      outed.push(ln);
    }
    return outed.join('\n');
  }

  // ---- Step 2: Markdown → HTML --------------------------------------------
  function renderMarkdown(text) {
    if (window.marked && typeof window.marked.parse === 'function') {
      return window.marked.parse(text, { gfm: true, breaks: true });
    }
    // Defensive fallback: no marked → escaped, pre-wrapped text.
    return '<div style="white-space:pre-wrap">' + esc(text) + '</div>';
  }

  // ---- Step 3: sanitize ----------------------------------------------------
  function sanitize(html) {
    if (window.DOMPurify && typeof window.DOMPurify.sanitize === 'function') {
      return window.DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] });
    }
    // No DOMPurify available → never trust raw HTML; escape everything.
    return '<div style="white-space:pre-wrap">' + esc(html) + '</div>';
  }

  // ---- Default chart palette (accent-led, theme-aware-ish) -----------------
  function chartPalette() {
    var accent = cssVar('--accent', '#6d5efc');
    return [
      accent,
      '#22c55e',
      '#f59e0b',
      '#ef4444',
      '#06b6d4',
      '#a855f7',
      '#ec4899',
      '#84cc16',
      '#3b82f6',
      '#f97316',
    ];
  }

  function smallError(msg) {
    var d = document.createElement('div');
    d.className = 'chat-block-error';
    d.textContent = msg;
    return d;
  }

  // ---- Step 5a: build a chart ---------------------------------------------
  function buildChart(raw) {
    try {
      var cfg = JSON.parse(raw);
      if (!cfg || typeof cfg !== 'object' || !cfg.data) {
        return smallError(T('chat.chartInvalid'));
      }
      if (!window.Chart) return smallError(T('chat.chartInvalid'));

      var type = cfg.type || 'bar';
      var wrap = document.createElement('div');
      wrap.className = 'chat-chart';

      if (cfg.title) {
        var h = document.createElement('h4');
        h.textContent = String(cfg.title);
        wrap.appendChild(h);
      }

      var canvasWrap = document.createElement('div');
      canvasWrap.className = 'chat-chart-canvas';
      var canvas = document.createElement('canvas');
      canvasWrap.appendChild(canvas);
      wrap.appendChild(canvasWrap);

      var dim = cssVar('--text-dim', '#5b6470');
      var border = cssVar('--border', '#e2e5ea');
      var palette = chartPalette();
      var isPieish = type === 'pie' || type === 'doughnut' || type === 'polarArea';

      // Apply default colors where datasets don't specify them.
      var data = cfg.data || {};
      var datasets = Array.isArray(data.datasets) ? data.datasets : [];
      datasets.forEach(function (ds, di) {
        if (!ds || typeof ds !== 'object') return;
        if (isPieish) {
          if (ds.backgroundColor == null) {
            var labels = Array.isArray(data.labels) ? data.labels : (ds.data || []);
            ds.backgroundColor = (labels || []).map(function (_, k) {
              return palette[k % palette.length];
            });
          }
        } else {
          var col = palette[di % palette.length];
          if (ds.backgroundColor == null) {
            ds.backgroundColor = type === 'line' || type === 'radar' ? col + '33' : col;
          }
          if (ds.borderColor == null) ds.borderColor = col;
          if (ds.borderWidth == null) ds.borderWidth = type === 'line' || type === 'radar' ? 2 : 0;
        }
      });

      // Theme-aware default options, deep-ish merged with caller options.
      var baseOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: dim, font: { size: 11 } } },
        },
      };
      if (!isPieish) {
        baseOptions.scales = {
          x: { ticks: { color: dim, font: { size: 10 } }, grid: { color: border } },
          y: { ticks: { color: dim, font: { size: 10 } }, grid: { color: border } },
        };
      }
      var options = mergeDeep(baseOptions, cfg.options || {});

      // requestAnimationFrame so the canvas is laid out before Chart measures it.
      requestAnimationFrame(function () {
        try {
          // eslint-disable-next-line no-new
          new window.Chart(canvas, { type: type, data: data, options: options });
        } catch (e) {
          wrap.replaceWith(smallError(T('chat.chartInvalid')));
        }
      });

      return wrap;
    } catch (e) {
      return smallError(T('chat.chartInvalid'));
    }
  }

  // Shallow-recursive merge (caller options win). Arrays are replaced wholesale.
  function mergeDeep(base, over) {
    var out = {};
    var k;
    for (k in base) if (Object.prototype.hasOwnProperty.call(base, k)) out[k] = base[k];
    for (k in over) {
      if (!Object.prototype.hasOwnProperty.call(over, k)) continue;
      var bv = out[k];
      var ov = over[k];
      if (
        bv && ov &&
        typeof bv === 'object' && typeof ov === 'object' &&
        !Array.isArray(bv) && !Array.isArray(ov)
      ) {
        out[k] = mergeDeep(bv, ov);
      } else {
        out[k] = ov;
      }
    }
    return out;
  }

  // ---- Step 5b: build a map ------------------------------------------------
  // A teardrop pin drawn with inline SVG via L.divIcon — no marker-icon.png
  // (Leaflet's default icon 404s when the library is vendored offline).
  function placeIcon() {
    var fill = cssVar('--accent', '#6d5efc');
    var svg = '<svg width="26" height="36" viewBox="0 0 26 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<path d="M13 0C5.82 0 0 5.82 0 13c0 9.2 11.1 21.2 12.3 22.5a1 1 0 0 0 1.4 0C14.9 34.2 26 22.2 26 13 26 5.82 20.18 0 13 0z" fill="' + fill + '"/>' +
      '<circle cx="13" cy="13" r="5.1" fill="#fff"/></svg>';
    return window.L.divIcon({ className: 'chat-map-pin', html: svg, iconSize: [26, 36], iconAnchor: [13, 36], popupAnchor: [0, -32] });
  }
  // A pulsing blue dot for the user's own (GPS) position.
  function userIcon() {
    return window.L.divIcon({
      className: 'chat-map-userdot',
      html: '<span class="d-ring"></span><span class="d-core"></span>',
      iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -9],
    });
  }

  function buildMap(raw) {
    try {
      var cfg = JSON.parse(raw);
      if (!cfg || typeof cfg !== 'object') return smallError(T('chat.mapInvalid'));
      if (!window.L) return smallError(T('chat.mapInvalid'));

      var markers = Array.isArray(cfg.markers) ? cfg.markers : [];
      var route = Array.isArray(cfg.route) ? cfg.route : null;
      var zoom = typeof cfg.zoom === 'number' ? cfg.zoom : 12;

      // Determine an initial center.
      var center = cfg.center;
      if (!center && markers.length) center = [markers[0].lat, markers[0].lng];
      if (!center && route && route.length) center = route[0];
      if (!center) center = [21.0278, 105.8342]; // Hà Nội fallback

      var container = document.createElement('div');
      container.className = 'chat-map-wrap';

      var mapEl = document.createElement('div');
      mapEl.className = 'chat-map';
      mapEl.style.height = '320px';
      container.appendChild(mapEl);

      // Google Maps directions link (NO API KEY — public URL scheme).
      // NOTE: To enable richer IN-PAGE routing or an embedded directions view,
      // plug a Google Maps Directions/Embed API key in here, e.g.
      //   https://www.google.com/maps/embed/v1/directions?key=YOUR_KEY&origin=..&destination=..
      // We intentionally do NOT hard-code any key; the link below needs none.
      var gmaps = buildGoogleMapsUrl(cfg, markers);
      if (gmaps) {
        var a = document.createElement('a');
        a.className = 'chat-map-link';
        a.href = gmaps;
        a.target = '_blank';
        a.rel = 'noopener noreferrer nofollow';
        a.textContent = T('chat.mapOpenGoogle');
        container.appendChild(a);
      }

      // Could not obtain the user's location → tell them plainly.
      if (cfg.locationDenied) {
        var note = document.createElement('div');
        note.className = 'chat-map-note';
        note.innerHTML = '<span aria-hidden="true">📍</span><span></span>';
        note.lastChild.textContent = T('chat.mapLocationDenied');
        container.appendChild(note);
      }
      // Real road routing failed → we drew an approximate straight line.
      if (cfg.routeStraight) {
        var rn = document.createElement('div');
        rn.className = 'chat-map-note';
        rn.innerHTML = '<span aria-hidden="true">〜</span><span></span>';
        rn.lastChild.textContent = T('chat.mapRouteStraight');
        container.appendChild(rn);
      }
      // Nearby POI search → list the real places (name + distance) under the map.
      if (Array.isArray(cfg.places) && cfg.places.length) {
        var list = document.createElement('ol');
        list.className = 'chat-map-places';
        cfg.places.forEach(function (p) {
          if (!p || !p.name) return;
          var li = document.createElement('li');
          var nm = document.createElement('span'); nm.className = 'pl-name'; nm.textContent = String(p.name);
          li.appendChild(nm);
          if (typeof p.dist === 'number') {
            var d = document.createElement('span'); d.className = 'pl-dist';
            d.textContent = p.dist >= 1000 ? (p.dist / 1000).toFixed(1) + ' km' : p.dist + ' m';
            li.appendChild(d);
          }
          list.appendChild(li);
        });
        container.appendChild(list);
      } else if (cfg.nearbyEmpty) {
        var en = document.createElement('div');
        en.className = 'chat-map-note';
        en.innerHTML = '<span aria-hidden="true">🔍</span><span></span>';
        en.lastChild.textContent = T('chat.nearbyEmpty');
        container.appendChild(en);
      }

      // Leaflet must init AFTER the element is in the document and sized.
      requestAnimationFrame(function () {
        try {
          if (!mapEl.isConnected) return;
          var map = window.L.map(mapEl).setView(center, zoom);
          window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap',
          }).addTo(map);

          var bounds = [];
          markers.forEach(function (m) {
            if (m == null || m.lat == null || m.lng == null) return;
            var pt = [m.lat, m.lng];
            var isUser = m.current === true || m.me === true;
            var mk = window.L.marker(pt, { icon: isUser ? userIcon() : placeIcon() }).addTo(map);
            var lbl = m.label || m.name;
            if (lbl) mk.bindPopup(String(lbl));
            bounds.push(pt);
          });

          if (route && route.length) {
            window.L.polyline(route, { color: cssVar('--accent', '#6d5efc'), weight: 4 }).addTo(map);
            route.forEach(function (pt) {
              if (Array.isArray(pt) && pt.length >= 2) bounds.push(pt);
            });
          }

          if (bounds.length > 1) {
            map.fitBounds(bounds, { padding: [28, 28] });
          }

          // Re-measure once attached/sized (renderMessage may build off-screen).
          requestAnimationFrame(function () {
            try { map.invalidateSize(); } catch (e) {}
          });
        } catch (e) {
          mapEl.replaceWith(smallError(T('chat.mapInvalid')));
        }
      });

      return container;
    } catch (e) {
      return smallError(T('chat.mapInvalid'));
    }
  }

  // Build a keyless Google Maps URL from directions / markers / fallback.
  function buildGoogleMapsUrl(cfg, markers) {
    var enc = encodeURIComponent;
    if (cfg.directions && cfg.directions.from && cfg.directions.to) {
      return (
        'https://www.google.com/maps/dir/?api=1&origin=' +
        enc(cfg.directions.from) +
        '&destination=' +
        enc(cfg.directions.to)
      );
    }
    var pts = markers.filter(function (m) {
      return m && m.lat != null && m.lng != null;
    });
    if (pts.length >= 2) {
      var o = pts[0];
      var d = pts[pts.length - 1];
      return (
        'https://www.google.com/maps/dir/?api=1&origin=' +
        enc(o.lat + ',' + o.lng) +
        '&destination=' +
        enc(d.lat + ',' + d.lng)
      );
    }
    if (pts.length === 1) {
      var p = pts[0];
      return 'https://www.google.com/maps/search/?api=1&query=' + enc(p.lat + ',' + p.lng);
    }
    if (cfg.center) {
      return 'https://www.google.com/maps/search/?api=1&query=' + enc(cfg.center[0] + ',' + cfg.center[1]);
    }
    return null;
  }

  function buildBlockElement(block) {
    if (block.kind === 'chart') return buildChart(block.raw);
    if (block.kind === 'map') return buildMap(block.raw);
    return smallError(T('chat.blockInvalid'));
  }

  // ---- Step 4: post-process sanitized DOM ----------------------------------
  function postProcess(container, blocks) {
    // Safe links.
    container.querySelectorAll('a').forEach(function (a) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer nofollow');
    });

    // Tables get a class for CSS styling, and a scroll wrapper so a wide table
    // can never burst the chat bubble on a narrow phone — it scrolls instead.
    container.querySelectorAll('table').forEach(function (t) {
      t.classList.add('chat-table');
      var p = t.parentNode;
      if (p && !(p.classList && p.classList.contains('chat-table-wrap'))) {
        var w = document.createElement('div');
        w.className = 'chat-table-wrap';
        p.insertBefore(w, t);
        w.appendChild(t);
      }
    });

    // Swap placeholder comments / text for the real chart/map elements.
    // marked may emit the placeholder either as an HTML comment node, or as
    // text inside a <p> if it got escaped. We handle both by walking nodes.
    if (blocks.length) {
      replacePlaceholders(container, blocks);
    }
  }

  function replacePlaceholders(container, blocks) {
    // 1) Comment nodes: walk and collect, then replace.
    var commentWalker = document.createTreeWalker(container, NodeFilter.SHOW_COMMENT, null);
    var comments = [];
    var c;
    while ((c = commentWalker.nextNode())) comments.push(c);
    comments.forEach(function (node) {
      var m = ('<!--' + node.nodeValue + '-->').match(PLACEHOLDER_RE);
      if (!m) return;
      var blk = blocks[Number(m[1])];
      if (!blk) return;
      var el = buildBlockElement(blk);
      // If the comment sits alone in a <p>, replace the whole <p>.
      var target = node;
      if (node.parentNode && node.parentNode.tagName === 'P' && node.parentNode.childNodes.length === 1) {
        target = node.parentNode;
      }
      target.parentNode.replaceChild(el, target);
    });

    // 2) Text nodes: a placeholder that survived as visible text.
    var textWalker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);
    var texts = [];
    var t;
    while ((t = textWalker.nextNode())) {
      if (PLACEHOLDER_RE.test(t.nodeValue)) texts.push(t);
    }
    texts.forEach(function (node) {
      var parts = node.nodeValue.split(PLACEHOLDER_RE_G);
      // split with a capturing group → [text, idx, text, idx, ...]
      var frag = document.createDocumentFragment();
      for (var k = 0; k < parts.length; k++) {
        if (k % 2 === 1) {
          var blk = blocks[Number(parts[k])];
          frag.appendChild(blk ? buildBlockElement(blk) : document.createTextNode(''));
        } else if (parts[k]) {
          frag.appendChild(document.createTextNode(parts[k]));
        }
      }
      // If the text node is the only child of a <p>, replace the <p> so block
      // elements (chart/map divs) aren't illegally nested inside a paragraph.
      var host = node;
      if (node.parentNode && node.parentNode.tagName === 'P' && node.parentNode.childNodes.length === 1) {
        host = node.parentNode;
      }
      host.parentNode.replaceChild(frag, host);
    });
  }

  // ---- Step 6: inject CSS once ---------------------------------------------
  function injectCss() {
    if (document.querySelector('#laam-chat-render-css')) return;
    var style = document.createElement('style');
    style.id = 'laam-chat-render-css';
    style.textContent = [
      '.bubble > :first-child { margin-top: 0; }',
      '.bubble > :last-child { margin-bottom: 0; }',
      '.bubble p { margin: 8px 0; }',
      '.bubble h1, .bubble h2, .bubble h3, .bubble h4, .bubble h5 {',
      '  margin: 14px 0 6px; line-height: 1.3; font-weight: 650;',
      '}',
      '.bubble h1 { font-size: 19px; } .bubble h2 { font-size: 17px; }',
      '.bubble h3 { font-size: 15px; } .bubble h4 { font-size: 14px; }',
      '.bubble ul, .bubble ol { margin: 8px 0; padding-left: 22px; }',
      '.bubble li { margin: 3px 0; }',
      '.bubble blockquote {',
      '  margin: 8px 0; padding: 2px 12px; border-left: 3px solid var(--border-strong);',
      '  color: var(--text-dim);',
      '}',
      '.bubble code {',
      '  font-family: var(--mono); font-size: 12.5px;',
      '  background: var(--bg-sunken); border: 1px solid var(--border);',
      '  border-radius: 5px; padding: 1px 5px;',
      '}',
      '.bubble pre code { background: none; border: 0; padding: 0; font-size: 12.5px; }',
      '.bubble a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }',
      // Tables
      '.chat-table-wrap { margin: 10px 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }',
      '.chat-table-wrap > .chat-table { margin: 0; }',
      '.chat-table {',
      '  width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 13px;',
      '}',
      '.chat-table th, .chat-table td {',
      '  border: 1px solid var(--border); padding: 6px 10px; text-align: left;',
      '}',
      '.chat-table th { background: var(--bg-sunken); font-weight: 650; color: var(--text); }',
      '.chat-table tr:nth-child(even) td { background: color-mix(in srgb, var(--bg-sunken) 45%, transparent); }',
      // Chart card
      '.chat-chart {',
      '  background: var(--bg-elev); border: 1px solid var(--border);',
      '  border-radius: 10px; padding: 10px; margin: 8px 0;',
      '}',
      '.chat-chart h4 { margin: 0 0 8px; font-size: 13.5px; font-weight: 650; color: var(--text); }',
      '.chat-chart-canvas { position: relative; height: 260px; }',
      // Map
      '.chat-map-wrap { margin: 8px 0; }',
      '.chat-map {',
      '  border-radius: 10px; overflow: hidden; border: 1px solid var(--border);',
      '}',
      '.chat-map-link {',
      '  display: inline-block; margin-top: 6px; font-size: 12.5px;',
      '  color: var(--accent); text-decoration: underline; text-underline-offset: 2px;',
      '}',
      // Self-drawn markers (no external PNGs → no 404, works fully offline).
      '.chat-map-pin { background: none; border: 0; }',
      '.chat-map-pin svg { display: block; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }',
      '.chat-map-userdot { background: none; border: 0; }',
      '.chat-map-userdot .d-core {',
      '  position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;',
      '  border-radius: 50%; background: #2563eb; border: 2.5px solid #fff; box-shadow: 0 1px 3px rgba(0,0,0,.4);',
      '}',
      '.chat-map-userdot .d-ring {',
      '  position: absolute; left: 50%; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px;',
      '  border-radius: 50%; background: rgba(37,99,235,.35); animation: laam-geo-pulse 2s ease-out infinite;',
      '}',
      '@keyframes laam-geo-pulse { 0% { transform: scale(1); opacity: .7; } 100% { transform: scale(3.2); opacity: 0; } }',
      '@media (prefers-reduced-motion: reduce) { .chat-map-userdot .d-ring { animation: none; } }',
      // Gentle note when the user\'s location could not be obtained.
      '.chat-map-note {',
      '  margin-top: 6px; font-size: 12px; color: var(--text-dim); display: flex; gap: 6px; align-items: flex-start;',
      '}',
      // Nearby-POI result list under the map.
      '.chat-map-places {',
      '  margin: 8px 0 0; padding-left: 22px; display: flex; flex-direction: column; gap: 3px;',
      '}',
      '.chat-map-places li { font-size: 13px; color: var(--text); line-height: 1.4; }',
      '.chat-map-places .pl-name { color: var(--text); }',
      '.chat-map-places .pl-dist {',
      '  margin-left: 8px; font-size: 11.5px; color: var(--text-faint); font-family: var(--mono); white-space: nowrap;',
      '}',
      // Block errors
      '.chat-block-error {',
      '  margin: 8px 0; padding: 8px 10px; border-radius: 8px; font-size: 12.5px;',
      '  background: var(--bg-sunken); border: 1px solid var(--border); color: var(--text-dim);',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ---- Public entry point --------------------------------------------------
  function renderMessage(rawText, targetEl) {
    if (!targetEl) return;
    try {
      injectCss();

      var extracted = extractSpecialBlocks(normalizeFences(rawText == null ? '' : String(rawText)));
      var html = renderMarkdown(extracted.text);
      var clean = sanitize(html);

      var container = document.createElement('div');
      container.className = 'chat-rendered';
      container.innerHTML = clean;

      postProcess(container, extracted.blocks);

      // Atomic swap of bubble contents.
      targetEl.textContent = '';
      while (container.firstChild) targetEl.appendChild(container.firstChild);
    } catch (e) {
      // Never blank the message: fall back to escaped, pre-wrapped plain text.
      try {
        var fb = document.createElement('div');
        fb.style.whiteSpace = 'pre-wrap';
        fb.innerHTML = esc(rawText == null ? '' : String(rawText));
        targetEl.textContent = '';
        targetEl.appendChild(fb);
      } catch (e2) {
        try {
          targetEl.textContent = rawText == null ? '' : String(rawText);
        } catch (e3) {
          /* give up silently — never throw out of the renderer */
        }
      }
    }
  }

  window.LAAMChatRender = { renderMessage: renderMessage, normalize: normalizeFences };
})();
