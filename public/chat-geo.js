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

  // Resolve one map config object in place; returns true if it changed.
  async function resolveMapCfg(cfg) {
    if (!cfg || typeof cfg !== 'object') return false;
    var changed = false;
    var markers = Array.isArray(cfg.markers) ? cfg.markers : [];

    // 1) Geocode markers that have a name/label but no usable coords.
    for (var i = 0; i < markers.length; i++) {
      var m = markers[i];
      if (m && !hasCoords(m)) {
        var nm = m.name || m.label || m.place;
        if (nm) { var hit = await geocode(nm); if (hit) { m.lat = hit.lat; m.lng = hit.lng; if (!m.label && m.name) m.label = m.name; changed = true; } }
      }
    }

    // 2) Directions with from/to but no usable markers → build markers from them.
    var dir = cfg.directions;
    var usable = markers.filter(hasCoords);
    if (dir && dir.from && dir.to && usable.length < 2) {
      var a = await geocode(dir.from);
      var b = await geocode(dir.to);
      var pts = [];
      if (a) pts.push({ lat: a.lat, lng: a.lng, label: dir.from });
      if (b) pts.push({ lat: b.lat, lng: b.lng, label: dir.to });
      if (pts.length) { cfg.markers = pts; markers = pts; usable = pts; changed = true; }
    }

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

  window.LAAMChatGeo = { resolveMaps: resolveMaps };
})();
