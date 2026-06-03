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

  // Real road geometry for an ordered list of {lat,lng} points, via the server
  // OSRM proxy. Returns [[lat,lng],...] or null (caller falls back to a line).
  var routeMem = {};
  async function fetchRoute(points) {
    var pts = (points || []).filter(hasCoords).slice(0, 8);
    if (pts.length < 2) return null;
    var qp = pts.map(function (p) { return p.lat.toFixed(5) + ',' + p.lng.toFixed(5); }).join(';');
    if (Object.prototype.hasOwnProperty.call(routeMem, qp)) return routeMem[qp];
    try {
      var r = await fetch('/api/route?points=' + encodeURIComponent(qp));
      if (!r.ok) { routeMem[qp] = null; return null; }
      var j = await r.json();
      var geom = (j && Array.isArray(j.geometry) && j.geometry.length > 1) ? j.geometry : null;
      routeMem[qp] = geom;
      return geom;
    } catch (e) { routeMem[qp] = null; return null; }
  }

  // ---- Current location (device GPS) ------------------------------------
  // Matches the user's own position across languages: "đây / từ đây / chỗ này /
  // vị trí của tôi", "here / from here / my location / current", "这里 / 我的位置 /
  // 当前位置". Also a marker can carry current/me/useCurrentLocation flags.
  var CURRENT_RE = /(v[ịi]\s*tr[íi]\s*(hi[ệe]n\s*t[ạa]i|c[ủu]a\s*(t[ôo]i|m[ìi]nh))|ch[ỗo]\s*(t[ôo]i|m[ìi]nh|n[àa]y)|n[ơo]i\s*(t[ôo]i|m[ìi]nh|n[àa]y)|(t[ừu]|t[ạa]i|[ởo])\s*đ[âa]y|(^|[\s,])đ[âa]y([\s,.]|$)|đ[ịi]nh\s*v[ịi]|current(\s*(location|position|spot))?|my\s*(location|position|place)|from\s*here|(^|[\s,])here([\s,.]|$)|where\s*i\s*am|这里|这儿|我的位置|当前位置|我现在的位置|我当前位置|我这里)/i;
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
    //    Triggers when the FROM endpoint is the user ("đây / từ đây / current"),
    //    a current flag is set, OR a destination is given with NO origin at all
    //    ("dẫn đường đến X" → start from where the user is).
    var hasTo = !!(dir && (dir.to || dir._to));
    var fromCurrent = !!(dir && (isCurrentLoc(dir.from) || dir.fromCurrent === true || dir.useCurrentLocation === true || (hasTo && !dir.from)));
    var toCurrent = !!(dir && isCurrentLoc(dir.to));
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

    // 2) Build the directions endpoints into markers. The FROM may be the GPS
    //    point from step 0 (dir._from); a missing/current FROM is just skipped
    //    (e.g. GPS denied → we still show the destination). Geocode named ends.
    var usable = markers.filter(hasCoords);
    if (dir && (dir.to || dir._to) && usable.length < 2) {
      var pts = [];
      if (dir._from) pts.push({ lat: dir._from.lat, lng: dir._from.lng, label: dir._from.label, current: true });
      else if (dir.from && !isCurrentLoc(dir.from)) { var ga = await geocode(dir.from); if (ga) pts.push({ lat: ga.lat, lng: ga.lng, label: dir.from }); }
      if (dir._to) pts.push({ lat: dir._to.lat, lng: dir._to.lng, label: dir._to.label, current: true });
      else if (dir.to && !isCurrentLoc(dir.to)) { var gb = await geocode(dir.to); if (gb) pts.push({ lat: gb.lat, lng: gb.lng, label: dir.to }); }
      if (pts.length) { cfg.markers = pts; markers = pts; usable = pts.filter(hasCoords); changed = true; }
    }
    if (dir) { delete dir._from; delete dir._to; } // don't leak temp keys into JSON

    // 3) Centre + the connecting ROUTE for a directions map. Prefer real road
    //    geometry from the server's OSRM proxy; fall back to a straight line.
    usable = (Array.isArray(cfg.markers) ? cfg.markers : []).filter(hasCoords);
    if (usable.length && !Array.isArray(cfg.center)) { cfg.center = [usable[0].lat, usable[0].lng]; changed = true; }
    if (dir && usable.length >= 2 && !Array.isArray(cfg.route)) {
      var road = await fetchRoute(usable);
      if (road && road.length > 1) {
        cfg.route = road;
      } else {
        cfg.route = usable.map(function (p) { return [p.lat, p.lng]; });
        cfg.routeStraight = true; // tell the renderer to note this is approximate
      }
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
