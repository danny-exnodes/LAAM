/*
 * chat-geo.js — resolve place NAMES in ```map blocks to real coordinates via
 * the server geocoder (/api/geocode → Nominatim), so maps don't depend on the
 * model guessing lat/lng. Exposes:  window.LAAMChatGeo.resolveMaps(text) -> Promise<text>
 *
 * Fail-soft: any geocoding error leaves the block as-is (the renderer still
 * shows the Google Maps link and falls back to a default center).
 */
(function () {
  'use strict';

  function tryParse(s) { try { return JSON.parse(s); } catch (e) { return null; } }
  function finiteNum(v) { return typeof v === 'number' && isFinite(v); }
  function hasCoords(m) { return m && finiteNum(m.lat) && finiteNum(m.lng) && !(m.lat === 0 && m.lng === 0); }

  var geoMem = {}; // in-page cache: query -> {lat,lng}|null
  async function geocode(q) {
    var key = String(q || '').trim().toLowerCase();
    if (!key) return null;
    if (Object.prototype.hasOwnProperty.call(geoMem, key)) return geoMem[key];
    try {
      var r = await fetch('/api/geocode?q=' + encodeURIComponent(q));
      if (!r.ok) { geoMem[key] = null; return null; }
      var j = await r.json();
      var hit = finiteNum(j.lat) && finiteNum(j.lng) ? { lat: j.lat, lng: j.lng } : null;
      geoMem[key] = hit;
      return hit;
    } catch (e) { geoMem[key] = null; return null; }
  }

  // ---- Current location (device GPS) ------------------------------------
  // "from my place", "vị trí của tôi", "当前位置", or a marker flagged current.
  var CURRENT_RE = /(v[ịi]\s*tr[íi]\s*(hi[ệe]n\s*t[ạa]i|c[ủu]a\s*(t[ôo]i|m[ìi]nh))|ch[ỗo]\s*(t[ôo]i|m[ìi]nh)|đ[ịi]nh\s*v[ịi]|current\s*location|my\s*location|where\s*i\s*am|当前位置|我的位置|我现在的位置|我当前位置)/i;
  function isCurrentLoc(s) { return CURRENT_RE.test(String(s == null ? '' : s)); }
  function markerIsCurrent(m) {
    if (!m) return false;
    if (m.current === true || m.me === true || m.currentLocation === true || m.current_location === true) return true;
    return isCurrentLoc(m.name || m.label || m.place || '');
  }
  function userLabel() {
    try { if (window.LAAMI18n) return window.LAAMI18n.t('chat.mapYourLocation'); } catch (e) {}
    return 'Vị trí của bạn';
  }

  // Cached one-shot geolocation. undefined=untried, null=denied/unavailable.
  var _pos; // {lat,lng}|null
  function getCurrentPosition() {
    if (_pos !== undefined) return Promise.resolve(_pos);
    return new Promise(function (resolve) {
      try {
        // Geolocation only works in a secure context (HTTPS or localhost).
        if (!('geolocation' in navigator) || window.isSecureContext === false) { _pos = null; return resolve(null); }
        navigator.geolocation.getCurrentPosition(
          function (p) { _pos = { lat: p.coords.latitude, lng: p.coords.longitude }; resolve(_pos); },
          function () { _pos = null; resolve(null); },
          { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
        );
      } catch (e) { _pos = null; resolve(null); }
    });
  }

  // Resolve one map config object in place; returns true if it changed.
  async function resolveMapCfg(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    var changed = false;
    var markers = Array.isArray(cfg.markers) ? cfg.markers : [];
    var dir = cfg.directions;

    // 0) CURRENT LOCATION — fill from device GPS where the user asked for it.
    var fromCurrent = dir && (isCurrentLoc(dir.from) || dir.fromCurrent === true);
    var toCurrent = dir && isCurrentLoc(dir.to);
    var curMarkers = markers.filter(markerIsCurrent);
    if (fromCurrent || toCurrent || curMarkers.length) {
      var pos = await getCurrentPosition();
      if (pos) {
        curMarkers.forEach(function (m) { m.lat = pos.lat; m.lng = pos.lng; m.current = true; if (!m.label) m.label = userLabel(); });
        if (fromCurrent) dir._from = { lat: pos.lat, lng: pos.lng, label: userLabel(), current: true };
        if (toCurrent) dir._to = { lat: pos.lat, lng: pos.lng, label: userLabel(), current: true };
        changed = true;
      } else {
        // Denied / unsupported / insecure context → fail soft + flag a note.
        cfg.locationDenied = true; changed = true;
        if (curMarkers.length) { cfg.markers = markers = markers.filter(function (m) { return !(markerIsCurrent(m) && !hasCoords(m)); }); }
      }
    }

    // 1) Geocode markers that have a name/label but no usable coords.
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      if (m && !hasCoords(m) && !markerIsCurrent(m)) {
        var nm = m.name || m.label || m.place;
        if (nm) { var hit = await geocode(nm); if (hit) { m.lat = hit.lat; m.lng = hit.lng; if (!m.label && m.name) m.label = m.name; changed = true; } }
      }
    }

    // 2) Directions with from/to but no usable markers → build markers from them.
    //    A current-location endpoint uses the GPS point resolved in step 0.
    var usable = markers.filter(hasCoords);
    if (dir && dir.from && dir.to && usable.length < 2) {
      var a = dir._from || await geocode(dir.from);
      var b = dir._to || await geocode(dir.to);
      var pts = [];
      if (a) pts.push({ lat: a.lat, lng: a.lng, label: a.label || dir.from, current: !!a.current });
      if (b) pts.push({ lat: b.lat, lng: b.lng, label: b.label || dir.to, current: !!b.current });
      if (pts.length) { cfg.markers = pts; markers = pts; usable = pts.filter(hasCoords); changed = true; }
    }
    if (dir) { delete dir._from; delete dir._to; } // don't leak temp keys into JSON

    // 3) Centre + a connecting line for a 2-point directions map.
    usable = (Array.isArray(cfg.markers) ? cfg.markers : []).filter(hasCoords);
    if (usable.length && !Array.isArray(cfg.center)) { cfg.center = [usable[0].lat, usable[0].lng]; changed = true; }
    if (dir && dir.from && dir.to && usable.length >= 2 && !Array.isArray(cfg.route)) {
      cfg.route = usable.map(function (p) { return [p.lat, p.lng]; });
      changed = true;
    }
    return changed;
  }

  // Find ```map blocks in (normalized) text and resolve their coordinates.
  async function resolveMaps(text) {
    var src = String(text == null ? '' : text);
    // Normalize first so ```json / bare map JSON becomes ```map (reuse renderer logic).
    var norm = (window.LAAMChatRender && window.LAAMChatRender.normalize) ? window.LAAMChatRender.normalize(src) : src;
    var re = /```map[ \t]*\n([\s\S]*?)\n[ \t]*```/g;
    var bodies = []; var m;
    while ((m = re.exec(norm))) bodies.push(m[1]);
    for (var k = 0; k < bodies.length; k++) {
      var body = bodies[k];
      var cfg = tryParse(body.trim());
      if (!cfg) continue;
      try {
        var changed = await resolveMapCfg(cfg);
        if (changed) {
          var nb = JSON.stringify(cfg);
          norm = norm.replace(body, function () { return nb; }); // literal replace, $-safe
        }
      } catch (e) { /* fail-soft: keep original block */ }
    }
    return norm;
  }

  window.LAAMChatGeo = { resolveMaps: resolveMaps, getCurrentPosition: getCurrentPosition, isCurrentLoc: isCurrentLoc };
})();
