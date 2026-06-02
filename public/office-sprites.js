/*
 * office-sprites.js — Isometric SVG sprite library for the LAAM "Agents Office" page.
 *
 * Vanilla JS, no build step. Every sprite function returns a fresh SVGSVGElement
 * (document.createElementNS), with an explicit width/height, overflow:visible, and a
 * CSS class so the engine can target it. Sprites are anchored BOTTOM-CENTER: their
 * visual base sits at the SVG's bottom-center so the engine can drop them onto an
 * isometric ground point.
 *
 * Furniture uses a fixed tasteful palette that reads on both light and dark themes,
 * with subtle iso faces (lighter top, darker sides) for depth. The floor tile and
 * avatar ground shadow read theme CSS variables when useful.
 *
 * Iso floor diamond: TILE_W = 72, TILE_H = 36.
 *
 * Sprite sizes (px) + anchor (all anchored bottom-center):
 *   floorTile()    ~72 x 42   (flat 72x36 diamond, a touch of headroom)
 *   desk()          80 x 84
 *   chair()         52 x 70
 *   sofa()         108 x 70
 *   meetingTable()  96 x 64
 *   pingPong()     104 x 72
 *   plant()         48 x 78
 *   avatar()        46 x 64
 *
 * Avatar shirt color formula (hue in 0..360):
 *   shirt        = hsl(hue, 55%, 55%)
 *   shirtShade   = hsl(hue, 55%, 44%)   // darker side face
 *   shirtLight   = hsl(hue, 55%, 64%)   // lighter top/highlight
 * 'local' role nudges the hue toward a teal/cyan family for a distinct shirt hue.
 *
 * Export:
 *   window.OfficeSprites = { TILE_W, TILE_H, floorTile, desk, chair, sofa,
 *                            meetingTable, pingPong, plant, avatar };
 */
(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var TILE_W = 72;
  var TILE_H = 36;

  /* ----------------------------------------------------------------- helpers */

  function svgEl(name, attrs) {
    var el = document.createElementNS(SVGNS, name);
    if (attrs) {
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          el.setAttribute(k, String(attrs[k]));
        }
      }
    }
    return el;
  }

  // Root <svg> for a sprite: explicit size, overflow visible, a class, and a
  // viewBox matching the pixel size so internal coords == pixel coords.
  function makeSvg(w, h, cls) {
    var svg = svgEl('svg', {
      width: w,
      height: h,
      viewBox: '0 0 ' + w + ' ' + h,
      class: cls
    });
    svg.style.overflow = 'visible';
    svg.style.display = 'block';
    return svg;
  }

  // Read a theme CSS variable, with a fallback if unavailable.
  function cssVar(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement)
        .getPropertyValue(name)
        .trim();
      return v || fallback;
    } catch (e) {
      return fallback;
    }
  }

  function poly(points, attrs) {
    var p = svgEl('polygon', attrs || {});
    p.setAttribute('points', points.map(function (pt) {
      return pt[0] + ',' + pt[1];
    }).join(' '));
    return p;
  }

  function add(parent /*, children */) {
    for (var i = 1; i < arguments.length; i++) {
      if (arguments[i]) parent.appendChild(arguments[i]);
    }
    return parent;
  }

  function hsl(h, s, l) {
    return 'hsl(' + Math.round(((h % 360) + 360) % 360) + ',' + s + '%,' + l + '%)';
  }

  /* --------------------------------------------------------- shared palette */
  // Fixed furniture palette tuned to read on both light & dark themes.
  var WOOD_TOP = '#c8a16b';
  var WOOD_SIDE = '#a07c47';
  var WOOD_DARK = '#8a6838';
  var METAL_TOP = '#b9c0c9';
  var METAL_SIDE = '#8f98a3';
  var METAL_DARK = '#727b86';
  var PANEL_TOP = '#e9edf2';
  var PANEL_SIDE = '#c4ccd6';
  var SCREEN = '#222a35';
  var SCREEN_GLOW = '#6d5efc';
  var FABRIC_TOP = '#8a93c4';
  var FABRIC_SIDE = '#6a73a6';
  var FABRIC_DARK = '#565e8c';
  var SOFA_TOP = '#e08a5b';
  var SOFA_SIDE = '#bd6f44';
  var SOFA_DARK = '#a05c36';
  var TABLE_TOP = '#dfe5ec';
  var TABLE_SIDE = '#b6bfca';
  var GREEN_HI = '#5fb86b';
  var GREEN = '#3f9a52';
  var GREEN_LO = '#2f7d42';
  var POT_TOP = '#d98e63';
  var POT_SIDE = '#b9744b';
  var SKIN = '#e8b48c';
  var SKIN_SHADE = '#cf9a73';
  var HAIR = '#3a2c24';
  var HAIR_HI = '#4d3b30';

  /* ----------------------------------------------------------- inject CSS */

  function ensureStyle() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('office-sprites-css')) return;
    var css =
      '@keyframes office-bob{0%,100%{transform:translateY(0)}' +
      '50%{transform:translateY(-3px)}}' +
      '@keyframes office-type{0%,100%{transform:translateY(0) rotate(0deg)}' +
      '50%{transform:translateY(1px) rotate(2.5deg)}}' +
      '@keyframes office-shadow{0%,100%{opacity:.35;transform:scaleX(1)}' +
      '50%{opacity:.22;transform:scaleX(.9)}}' +
      '@keyframes office-z{0%{opacity:0;transform:translateY(2px) scale(.7)}' +
      '30%{opacity:.9}100%{opacity:0;transform:translateY(-7px) scale(1.1)}}' +
      // running: gentle bob on the inner body group + arm typing wiggle
      '.office-avatar.is-running .oa-bob{animation:office-bob 1.3s ease-in-out infinite;' +
      'transform-box:fill-box;transform-origin:50% 100%}' +
      '.office-avatar.is-running .oa-arm{animation:office-type .55s ease-in-out infinite;' +
      'transform-box:fill-box;transform-origin:80% 10%}' +
      '.office-avatar.is-running .oa-shadow{animation:office-shadow 1.3s ease-in-out infinite;' +
      'transform-box:fill-box;transform-origin:50% 50%}' +
      // idle: floating "z"
      '.office-avatar.is-idle .oa-z{animation:office-z 2.4s ease-in-out infinite;' +
      'transform-box:fill-box;transform-origin:50% 100%}' +
      // respect reduced motion
      '@media (prefers-reduced-motion:reduce){' +
      '.office-avatar .oa-bob,.office-avatar .oa-arm,' +
      '.office-avatar .oa-shadow,.office-avatar .oa-z{animation:none!important}}';
    // <style> is HTML; create via plain DOM so it lands in <head> correctly.
    var s = document.createElement('style');
    s.id = 'office-sprites-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  }

  /* ===================================================================
   * floorTile(opts) — one isometric diamond floor tile (72 x 36 flat).
   * opts.variant ∈ 'floor' | 'carpet' | 'lawn'
   * ================================================================ */
  function floorTile(opts) {
    opts = opts || {};
    var variant = opts.variant || 'floor';
    var W = TILE_W, H = TILE_H;
    var pad = 4; // headroom so the 1px stroke isn't clipped
    var svg = makeSvg(W, H + pad, 'iso-tile iso-tile-' + variant);

    var cx = W / 2;
    var top = pad / 2;
    var bottom = top + H;
    var midY = top + H / 2;

    var fill, stroke;
    if (variant === 'carpet') {
      // zone highlight — tinted with the accent color
      fill = cssVar('--accent-soft', '#ece9ff');
      stroke = cssVar('--accent', '#6d5efc');
    } else if (variant === 'lawn') {
      fill = '#cfe9c4';
      stroke = '#9fce8e';
    } else {
      // office floor — quiet, follows the elevated surface tone
      fill = cssVar('--bg-elev', '#ffffff');
      stroke = cssVar('--border', '#e2e5ea');
    }

    var diamond = poly(
      [[cx, top], [W, midY], [cx, bottom], [0, midY]],
      { fill: fill, stroke: stroke, 'stroke-width': 1, 'stroke-linejoin': 'round' }
    );
    diamond.setAttribute('opacity', variant === 'carpet' ? '0.85' : '1');
    add(svg, diamond);

    // subtle inner seam to give the tile a little surface detail
    if (variant !== 'carpet') {
      var seam = poly(
        [[cx, top + 3], [W - 5, midY], [cx, bottom - 3], [5, midY]],
        { fill: 'none', stroke: stroke, 'stroke-width': 0.75, opacity: 0.4 }
      );
      add(svg, seam);
    }
    return svg;
  }

  /* ===================================================================
   * desk() — desk + small monitor with a faint glow. ~80 x 84.
   * Anchored bottom-center; base diamond rests at the bottom.
   * ================================================================ */
  function desk() {
    var W = 80, H = 84;
    var svg = makeSvg(W, H, 'iso-desk');
    var cx = W / 2;
    var baseY = H - 6;        // front-bottom of desk
    var topY = baseY - 30;    // desktop surface plane
    var hw = 30;              // half-width of desktop
    var depth = 15;           // iso depth offset

    // ground shadow
    add(svg, svgEl('ellipse', {
      cx: cx, cy: H - 4, rx: 34, ry: 11, fill: 'rgba(0,0,0,0.16)'
    }));

    // --- desk top (iso slab) ---
    var tTop = topY - depth;
    // top face (diamond)
    add(svg, poly(
      [[cx, tTop - 8], [cx + hw, topY - 8], [cx, topY], [cx - hw, topY - 8]],
      { fill: WOOD_TOP, stroke: WOOD_DARK, 'stroke-width': 1, 'stroke-linejoin': 'round' }
    ));
    // left side face (darker)
    add(svg, poly(
      [[cx - hw, topY - 8], [cx, topY], [cx, topY + 7], [cx - hw, topY - 1]],
      { fill: WOOD_DARK, stroke: WOOD_DARK, 'stroke-width': 0.5 }
    ));
    // right side face
    add(svg, poly(
      [[cx, topY], [cx + hw, topY - 8], [cx + hw, topY - 1], [cx, topY + 7]],
      { fill: WOOD_SIDE, stroke: WOOD_DARK, 'stroke-width': 0.5 }
    ));

    // --- legs ---
    add(svg, svgEl('rect', {
      x: cx - hw + 5, y: topY, width: 4, height: 24, fill: METAL_SIDE, rx: 1
    }));
    add(svg, svgEl('rect', {
      x: cx + hw - 9, y: topY - 4, width: 4, height: 24, fill: METAL_DARK, rx: 1
    }));
    add(svg, svgEl('rect', {
      x: cx - 2, y: topY + 4, width: 4, height: 24, fill: METAL_SIDE, rx: 1
    }));

    // --- monitor (sits on the back of the desk) ---
    var mB = tTop + 2;       // monitor base y (back edge)
    // stand
    add(svg, svgEl('rect', { x: cx - 2, y: mB - 6, width: 4, height: 8, fill: METAL_DARK }));
    add(svg, svgEl('ellipse', { cx: cx, cy: mB + 1, rx: 8, ry: 3, fill: METAL_SIDE }));
    // glow halo behind the screen
    var glow = svgEl('rect', {
      x: cx - 17, y: mB - 30, width: 34, height: 24, rx: 6,
      fill: SCREEN_GLOW, opacity: 0.22
    });
    glow.setAttribute('filter', 'blur(0)');
    add(svg, glow);
    // bezel
    add(svg, svgEl('rect', {
      x: cx - 15, y: mB - 28, width: 30, height: 21, rx: 3,
      fill: '#2c333d', stroke: '#1a2029', 'stroke-width': 1
    }));
    // screen
    add(svg, svgEl('rect', {
      x: cx - 12, y: mB - 25, width: 24, height: 15, rx: 1.5, fill: SCREEN
    }));
    // screen content — faint glowing lines
    add(svg, svgEl('rect', { x: cx - 9, y: mB - 22, width: 14, height: 2, rx: 1, fill: SCREEN_GLOW, opacity: 0.85 }));
    add(svg, svgEl('rect', { x: cx - 9, y: mB - 18, width: 18, height: 2, rx: 1, fill: SCREEN_GLOW, opacity: 0.55 }));
    add(svg, svgEl('rect', { x: cx - 9, y: mB - 14, width: 10, height: 2, rx: 1, fill: SCREEN_GLOW, opacity: 0.4 }));

    return svg;
  }

  /* ===================================================================
   * chair() — office chair. ~52 x 70. Anchored bottom-center.
   * ================================================================ */
  function chair() {
    var W = 52, H = 70;
    var svg = makeSvg(W, H, 'iso-chair');
    var cx = W / 2;

    // ground shadow
    add(svg, svgEl('ellipse', { cx: cx, cy: H - 4, rx: 18, ry: 7, fill: 'rgba(0,0,0,0.15)' }));

    // base star + post
    add(svg, svgEl('ellipse', { cx: cx, cy: H - 8, rx: 16, ry: 6, fill: METAL_SIDE }));
    add(svg, svgEl('ellipse', { cx: cx, cy: H - 9, rx: 16, ry: 5, fill: METAL_TOP }));
    add(svg, svgEl('rect', { x: cx - 2.5, y: H - 30, width: 5, height: 22, fill: METAL_DARK, rx: 2 }));

    // seat (iso slab)
    var sy = H - 30;
    add(svg, poly(
      [[cx, sy - 10], [cx + 17, sy - 4], [cx, sy + 2], [cx - 17, sy - 4]],
      { fill: FABRIC_TOP, stroke: FABRIC_DARK, 'stroke-width': 1, 'stroke-linejoin': 'round' }
    ));
    add(svg, poly(
      [[cx - 17, sy - 4], [cx, sy + 2], [cx, sy + 7], [cx - 17, sy + 1]],
      { fill: FABRIC_DARK }
    ));
    add(svg, poly(
      [[cx, sy + 2], [cx + 17, sy - 4], [cx + 17, sy + 1], [cx, sy + 7]],
      { fill: FABRIC_SIDE }
    ));

    // backrest
    add(svg, svgEl('rect', {
      x: cx - 13, y: sy - 34, width: 26, height: 26, rx: 7,
      fill: FABRIC_TOP, stroke: FABRIC_DARK, 'stroke-width': 1
    }));
    add(svg, svgEl('rect', {
      x: cx - 9, y: sy - 30, width: 18, height: 18, rx: 5, fill: FABRIC_SIDE, opacity: 0.55
    }));

    return svg;
  }

  /* ===================================================================
   * sofa() — lounge sofa (~2 tiles wide). ~108 x 70. Anchored bottom-center.
   * ================================================================ */
  function sofa() {
    var W = 108, H = 70;
    var svg = makeSvg(W, H, 'iso-sofa');
    var cx = W / 2;

    add(svg, svgEl('ellipse', { cx: cx, cy: H - 5, rx: 48, ry: 12, fill: 'rgba(0,0,0,0.16)' }));

    var fw = 44;   // half footprint width
    var fd = 18;   // iso depth
    var seatY = H - 18;

    // ---- base / seat block (iso box) ----
    // front face
    add(svg, poly(
      [[cx - fw, seatY - fd], [cx, seatY], [cx + fw, seatY - fd], [cx + fw, seatY - fd + 14],
       [cx, seatY + 14], [cx - fw, seatY - fd + 14]],
      { fill: SOFA_SIDE, stroke: SOFA_DARK, 'stroke-width': 1, 'stroke-linejoin': 'round' }
    ));
    // seat top cushions (diamond top)
    add(svg, poly(
      [[cx, seatY - fd - 6], [cx + fw, seatY - fd], [cx, seatY], [cx - fw, seatY - fd]],
      { fill: SOFA_TOP, stroke: SOFA_DARK, 'stroke-width': 1, 'stroke-linejoin': 'round' }
    ));
    // cushion seam
    add(svg, svgEl('line', {
      x1: cx, y1: seatY - fd - 6, x2: cx, y2: seatY, stroke: SOFA_DARK, 'stroke-width': 1, opacity: 0.5
    }));

    // ---- backrest (raised) ----
    add(svg, poly(
      [[cx - fw, seatY - fd - 22], [cx, seatY - 16], [cx, seatY], [cx - fw, seatY - fd]],
      { fill: SOFA_DARK }
    ));
    add(svg, poly(
      [[cx, seatY - 16], [cx + fw, seatY - fd - 22], [cx + fw, seatY - fd], [cx, seatY]],
      { fill: SOFA_SIDE }
    ));
    add(svg, poly(
      [[cx - fw, seatY - fd - 22], [cx, seatY - 16 - 6], [cx + fw, seatY - fd - 22], [cx, seatY - fd - 6]],
      { fill: SOFA_TOP, stroke: SOFA_DARK, 'stroke-width': 1, 'stroke-linejoin': 'round' }
    ));

    // ---- armrests ----
    add(svg, svgEl('ellipse', { cx: cx - fw + 4, cy: seatY - fd - 4, rx: 7, ry: 9, fill: SOFA_TOP, stroke: SOFA_DARK, 'stroke-width': 1 }));
    add(svg, svgEl('ellipse', { cx: cx + fw - 4, cy: seatY - fd - 4, rx: 7, ry: 9, fill: SOFA_SIDE, stroke: SOFA_DARK, 'stroke-width': 1 }));

    return svg;
  }

  /* ===================================================================
   * meetingTable() — round/oval meeting table. ~96 x 64.
   * ================================================================ */
  function meetingTable() {
    var W = 96, H = 64;
    var svg = makeSvg(W, H, 'iso-meeting');
    var cx = W / 2;
    var topY = H - 26;
    var rx = 40, ry = 18;

    add(svg, svgEl('ellipse', { cx: cx, cy: H - 4, rx: 42, ry: 12, fill: 'rgba(0,0,0,0.15)' }));

    // pedestal
    add(svg, svgEl('rect', { x: cx - 4, y: topY, width: 8, height: 20, fill: METAL_DARK, rx: 2 }));
    add(svg, svgEl('ellipse', { cx: cx, cy: H - 8, rx: 16, ry: 5, fill: METAL_SIDE }));

    // table edge (thickness)
    add(svg, svgEl('ellipse', { cx: cx, cy: topY + 6, rx: rx, ry: ry, fill: TABLE_SIDE }));
    // table top
    add(svg, svgEl('ellipse', {
      cx: cx, cy: topY, rx: rx, ry: ry,
      fill: TABLE_TOP, stroke: '#9aa4b0', 'stroke-width': 1
    }));
    // top sheen
    add(svg, svgEl('ellipse', { cx: cx - 8, cy: topY - 4, rx: 22, ry: 8, fill: '#ffffff', opacity: 0.35 }));

    // a couple of paper/cup props
    add(svg, svgEl('rect', { x: cx - 6, y: topY - 4, width: 14, height: 9, rx: 1, fill: '#ffffff', stroke: '#c4ccd6', 'stroke-width': 0.75 }));
    add(svg, svgEl('circle', { cx: cx + 18, cy: topY + 1, r: 3, fill: '#ffffff', stroke: '#c4ccd6', 'stroke-width': 0.75 }));

    return svg;
  }

  /* ===================================================================
   * pingPong() — ping-pong table with a net. ~104 x 72.
   * ================================================================ */
  function pingPong() {
    var W = 104, H = 72;
    var svg = makeSvg(W, H, 'iso-pingpong');
    var cx = W / 2;
    var topY = H - 28;
    var hw = 46, depth = 20;

    add(svg, svgEl('ellipse', { cx: cx, cy: H - 5, rx: 48, ry: 12, fill: 'rgba(0,0,0,0.16)' }));

    // table top diamond
    var tN = [cx, topY - depth];     // far
    var tE = [cx + hw, topY];        // right
    var tS = [cx, topY + depth];     // near
    var tW = [cx - hw, topY];        // left

    // thickness (front faces)
    add(svg, poly(
      [tW, tS, [tS[0], tS[1] + 8], [tW[0], tW[1] + 8]],
      { fill: '#0f4f8a' }
    ));
    add(svg, poly(
      [tS, tE, [tE[0], tE[1] + 8], [tS[0], tS[1] + 8]],
      { fill: '#0d4377' }
    ));
    // top surface (classic blue)
    add(svg, poly([tN, tE, tS, tW], {
      fill: '#1769b0', stroke: '#0d4377', 'stroke-width': 1, 'stroke-linejoin': 'round'
    }));
    // white border + center line
    add(svg, poly([tN, tE, tS, tW], { fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, opacity: 0.9 }));
    add(svg, svgEl('line', { x1: tW[0], y1: tW[1], x2: tE[0], y2: tE[1], stroke: '#ffffff', 'stroke-width': 1, opacity: 0.85 }));

    // legs
    add(svg, svgEl('rect', { x: tW[0] + 8, y: topY, width: 3, height: 22, fill: METAL_DARK }));
    add(svg, svgEl('rect', { x: tE[0] - 11, y: topY, width: 3, height: 22, fill: METAL_DARK }));
    add(svg, svgEl('rect', { x: cx - 1, y: topY + depth - 4, width: 3, height: 22, fill: METAL_SIDE }));

    // net across the middle (perpendicular to center line, i.e. the N-S diagonal)
    add(svg, poly(
      [tN, tS, [tS[0], tS[1] - 11], [tN[0], tN[1] - 11]],
      { fill: '#ffffff', opacity: 0.85, stroke: '#c4ccd6', 'stroke-width': 0.75 }
    ));
    // net posts
    add(svg, svgEl('rect', { x: tN[0] - 1, y: tN[1] - 11, width: 2, height: 11, fill: METAL_DARK }));
    add(svg, svgEl('rect', { x: tS[0] - 1, y: tS[1] - 11, width: 2, height: 11, fill: METAL_DARK }));

    // a paddle + ball prop
    add(svg, svgEl('ellipse', { cx: cx + 20, cy: topY - 3, rx: 6, ry: 4, fill: '#d6453b', transform: 'rotate(-20 ' + (cx + 20) + ' ' + (topY - 3) + ')' }));
    add(svg, svgEl('rect', { x: cx + 24, y: topY - 1, width: 6, height: 2, rx: 1, fill: '#7a5230', transform: 'rotate(-20 ' + (cx + 24) + ' ' + topY + ')' }));
    add(svg, svgEl('circle', { cx: cx - 16, cy: topY + 4, r: 2.4, fill: '#fff4d6', stroke: '#e0d2a0', 'stroke-width': 0.5 }));

    return svg;
  }

  /* ===================================================================
   * plant() — potted plant decor. ~48 x 78. Anchored bottom-center.
   * ================================================================ */
  function plant() {
    var W = 48, H = 78;
    var svg = makeSvg(W, H, 'iso-plant');
    var cx = W / 2;

    add(svg, svgEl('ellipse', { cx: cx, cy: H - 4, rx: 16, ry: 6, fill: 'rgba(0,0,0,0.15)' }));

    // pot (iso-ish tapered)
    var potTopY = H - 22;
    add(svg, poly(
      [[cx - 12, potTopY], [cx + 12, potTopY], [cx + 9, H - 6], [cx - 9, H - 6]],
      { fill: POT_SIDE, stroke: '#9a5f3a', 'stroke-width': 1, 'stroke-linejoin': 'round' }
    ));
    add(svg, svgEl('ellipse', { cx: cx, cy: potTopY, rx: 12, ry: 4, fill: POT_TOP, stroke: '#9a5f3a', 'stroke-width': 1 }));
    add(svg, svgEl('ellipse', { cx: cx, cy: potTopY, rx: 9, ry: 3, fill: '#7a4a2c' }));

    // foliage — a cluster of rounded leaves
    var leaves = [
      [cx, potTopY - 28, 11, 16, GREEN, 0],
      [cx - 10, potTopY - 18, 9, 13, GREEN_LO, -28],
      [cx + 10, potTopY - 18, 9, 13, GREEN_LO, 28],
      [cx - 4, potTopY - 24, 8, 14, GREEN_HI, -12],
      [cx + 5, potTopY - 23, 8, 13, GREEN_HI, 14]
    ];
    leaves.forEach(function (l) {
      add(svg, svgEl('ellipse', {
        cx: l[0], cy: l[1], rx: l[2], ry: l[3], fill: l[4],
        transform: 'rotate(' + l[5] + ' ' + l[0] + ' ' + l[1] + ')',
        stroke: GREEN_LO, 'stroke-width': 0.5
      }));
    });
    // a couple light leaf veins / highlights
    add(svg, svgEl('ellipse', { cx: cx - 1, cy: potTopY - 30, rx: 4, ry: 7, fill: GREEN_HI, opacity: 0.6 }));

    return svg;
  }

  /* ===================================================================
   * avatar(opts) — a small upright stylized person. ~46 x 64.
   * Anchored bottom-center, with a soft elliptical ground shadow.
   *   opts.status ∈ 'running'|'idle'|'done'|'stuck'
   *   opts.role   ∈ 'orchestrator'|'sub'|'local'
   *   opts.hue    number 0..360  → shirt = hsl(hue,55%,55%)
   * ================================================================ */
  function avatar(opts) {
    ensureStyle();
    opts = opts || {};
    var status = opts.status || 'idle';
    var role = opts.role || 'sub';
    var hue = (typeof opts.hue === 'number') ? opts.hue : 210;

    // local role gets a distinct teal/cyan shirt family
    if (role === 'local') hue = 175;

    var sat = 55;
    var shirt = hsl(hue, sat, 55);
    var shirtShade = hsl(hue, sat, 44);
    var shirtLight = hsl(hue, sat, 64);

    // role scaling
    var scale = role === 'orchestrator' ? 1.12 : (role === 'sub' ? 0.92 : 1.0);

    var W = 46, H = 64;
    var svg = makeSvg(W, H, 'office-avatar is-' + status + ' role-' + role);
    var cx = W / 2;

    // ground shadow (theme-aware tint, but kept dark enough for light bg)
    var shadow = svgEl('ellipse', {
      cx: cx, cy: H - 3, rx: 15, ry: 5,
      fill: 'rgba(0,0,0,0.22)', class: 'oa-shadow'
    });
    add(svg, shadow);

    // Everything that should bob lives in oa-bob; we also apply role scale here.
    var bob = svgEl('g', { class: 'oa-bob' });
    // scale around bottom-center
    bob.setAttribute('transform',
      'translate(' + cx + ',' + (H - 6) + ') scale(' + scale + ') translate(' + (-cx) + ',' + (-(H - 6)) + ')');

    // running = slight forward "typing" lean
    var body = svgEl('g');
    if (status === 'running') {
      body.setAttribute('transform', 'rotate(4 ' + cx + ' ' + (H - 6) + ')');
    } else if (status === 'done') {
      // relaxed: a hair of backward lean
      body.setAttribute('transform', 'rotate(-3 ' + cx + ' ' + (H - 6) + ')');
    }

    var hipY = H - 10;      // base of body
    var shoulderY = H - 36; // shoulders
    var headCy = H - 46;    // head center
    var headR = 8;

    // ---- lower body (seated-friendly trapezoid) ----
    add(body, poly(
      [[cx - 9, shoulderY + 6], [cx + 9, shoulderY + 6], [cx + 11, hipY], [cx - 11, hipY]],
      { fill: shirtShade }
    ));

    // ---- torso / shirt (rounded) ----
    add(body, svgEl('path', {
      d: 'M ' + (cx - 11) + ' ' + hipY +
         ' L ' + (cx - 10) + ' ' + (shoulderY + 2) +
         ' Q ' + (cx - 10) + ' ' + (shoulderY - 5) + ' ' + (cx - 3) + ' ' + (shoulderY - 5) +
         ' L ' + (cx + 3) + ' ' + (shoulderY - 5) +
         ' Q ' + (cx + 10) + ' ' + (shoulderY - 5) + ' ' + (cx + 10) + ' ' + (shoulderY + 2) +
         ' L ' + (cx + 11) + ' ' + hipY + ' Z',
      fill: shirt, stroke: shirtShade, 'stroke-width': 1
    }));
    // shirt left/right shading for a touch of iso depth
    add(body, poly(
      [[cx + 3, shoulderY - 4], [cx + 10, shoulderY + 2], [cx + 11, hipY], [cx + 4, hipY]],
      { fill: shirtShade, opacity: 0.5 }
    ));
    add(body, poly(
      [[cx - 3, shoulderY - 4], [cx - 10, shoulderY + 2], [cx - 11, hipY], [cx - 4, hipY]],
      { fill: shirtLight, opacity: 0.35 }
    ));
    // collar
    add(body, svgEl('path', {
      d: 'M ' + (cx - 5) + ' ' + (shoulderY - 4) + ' Q ' + cx + ' ' + (shoulderY + 2) + ' ' + (cx + 5) + ' ' + (shoulderY - 4),
      fill: 'none', stroke: shirtLight, 'stroke-width': 1.5
    }));

    // ---- arms ----
    // back arm (static)
    add(body, svgEl('path', {
      d: 'M ' + (cx - 9) + ' ' + (shoulderY) + ' Q ' + (cx - 14) + ' ' + (shoulderY + 8) + ' ' + (cx - 9) + ' ' + (shoulderY + 16),
      fill: 'none', stroke: shirtShade, 'stroke-width': 5, 'stroke-linecap': 'round'
    }));
    // front/typing arm — animated for running
    var arm = svgEl('g', { class: 'oa-arm' });
    add(arm, svgEl('path', {
      d: 'M ' + (cx + 9) + ' ' + (shoulderY) + ' Q ' + (cx + 14) + ' ' + (shoulderY + 9) + ' ' + (cx + 7) + ' ' + (shoulderY + 17),
      fill: 'none', stroke: shirt, 'stroke-width': 5, 'stroke-linecap': 'round'
    }));
    // hand
    add(arm, svgEl('circle', { cx: cx + 7, cy: shoulderY + 18, r: 2.6, fill: SKIN }));
    add(body, arm);

    // ---- neck ----
    add(body, svgEl('rect', { x: cx - 2.5, y: headCy + headR - 3, width: 5, height: 6, fill: SKIN_SHADE }));

    // ---- head ----
    add(body, svgEl('circle', { cx: cx, cy: headCy, r: headR, fill: SKIN, stroke: SKIN_SHADE, 'stroke-width': 0.75 }));
    // side shade on head for subtle depth
    add(body, svgEl('path', {
      d: 'M ' + cx + ' ' + (headCy - headR) + ' A ' + headR + ' ' + headR + ' 0 0 1 ' + cx + ' ' + (headCy + headR) + ' Z',
      fill: SKIN_SHADE, opacity: 0.25
    }));

    // ---- hair ----
    add(body, svgEl('path', {
      d: 'M ' + (cx - headR) + ' ' + headCy +
         ' Q ' + (cx - headR) + ' ' + (headCy - headR - 3) + ' ' + cx + ' ' + (headCy - headR - 2) +
         ' Q ' + (cx + headR) + ' ' + (headCy - headR - 3) + ' ' + (cx + headR) + ' ' + headCy +
         ' Q ' + (cx + headR - 1) + ' ' + (headCy - 3) + ' ' + (cx + 3) + ' ' + (headCy - 4) +
         ' Q ' + cx + ' ' + (headCy - 6) + ' ' + (cx - 3) + ' ' + (headCy - 4) +
         ' Q ' + (cx - headR + 1) + ' ' + (headCy - 3) + ' ' + (cx - headR) + ' ' + headCy + ' Z',
      fill: HAIR
    }));
    add(body, svgEl('ellipse', { cx: cx - 3, cy: headCy - headR + 1, rx: 3, ry: 2, fill: HAIR_HI, opacity: 0.6 }));

    // ---- face: simple eyes (drawn upright, never skewed) ----
    add(body, svgEl('circle', { cx: cx - 3, cy: headCy + 0.5, r: 1.1, fill: '#2b2b2b' }));
    add(body, svgEl('circle', { cx: cx + 3, cy: headCy + 0.5, r: 1.1, fill: '#2b2b2b' }));
    // mouth varies a touch by status
    if (status === 'done') {
      add(body, svgEl('path', {
        d: 'M ' + (cx - 2.5) + ' ' + (headCy + 3.5) + ' Q ' + cx + ' ' + (headCy + 5.5) + ' ' + (cx + 2.5) + ' ' + (headCy + 3.5),
        fill: 'none', stroke: '#9a6b50', 'stroke-width': 1, 'stroke-linecap': 'round'
      }));
    } else if (status === 'stuck') {
      add(body, svgEl('line', {
        x1: cx - 2, y1: headCy + 4, x2: cx + 2, y2: headCy + 4,
        stroke: '#9a6b50', 'stroke-width': 1, 'stroke-linecap': 'round'
      }));
    } else {
      add(body, svgEl('line', {
        x1: cx - 1.5, y1: headCy + 4, x2: cx + 1.5, y2: headCy + 4,
        stroke: '#9a6b50', 'stroke-width': 1, 'stroke-linecap': 'round'
      }));
    }

    // ---- orchestrator lead marker: a tiny accent pip above the head ----
    if (role === 'orchestrator') {
      var accent = cssVar('--accent', '#6d5efc');
      var pipY = headCy - headR - 6;
      // little diamond "lead" marker
      add(body, poly(
        [[cx, pipY - 4], [cx + 3.5, pipY], [cx, pipY + 4], [cx - 3.5, pipY]],
        { fill: accent, stroke: '#ffffff', 'stroke-width': 0.75 }
      ));
    }

    add(bob, body);

    // ---- idle "z" (animated via CSS) ----
    if (status === 'idle') {
      var z = svgEl('text', {
        x: cx + 11, y: headCy - 6, class: 'oa-z',
        'font-family': 'system-ui, sans-serif', 'font-size': 9,
        'font-weight': 700, fill: cssVar('--text-dim', '#5b6470')
      });
      z.textContent = 'z';
      add(svg, z); // outside bob so the float reads cleanly
    }

    add(svg, bob);
    return svg;
  }

  /* ----------------------------------------------------------------- export */
  // Inject CSS eagerly too (so non-avatar usage still themes correctly if needed).
  try { ensureStyle(); } catch (e) {}

  var api = {
    TILE_W: TILE_W,
    TILE_H: TILE_H,
    floorTile: floorTile,
    desk: desk,
    chair: chair,
    sofa: sofa,
    meetingTable: meetingTable,
    pingPong: pingPong,
    plant: plant,
    avatar: avatar
  };

  if (typeof window !== 'undefined') {
    window.OfficeSprites = api;
  }
  // also expose for module-ish consumers without breaking the no-build setup
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
