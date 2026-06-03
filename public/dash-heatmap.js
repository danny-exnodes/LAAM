(function () {
  if (!document.getElementById('laam-heatmap-css')) {
    const st = document.createElement('style');
    st.id = 'laam-heatmap-css';
    st.textContent = `
      .hm-wrap { width: 100%; }
      .hm-grid {
        display: grid;
        grid-template-columns: 34px repeat(24, 1fr);
        gap: 2px;
        align-items: center;
      }
      .hm-corner { height: 16px; }
      .hm-hour {
        font-size: 10px;
        color: var(--text-faint, #888);
        text-align: center;
        line-height: 16px;
        height: 16px;
        overflow: visible;
        white-space: nowrap;
      }
      .hm-day {
        font-size: 11px;
        color: var(--text-faint, #888);
        text-align: right;
        padding-right: 6px;
        line-height: 18px;
        height: 18px;
      }
      .hm-cell {
        height: 18px;
        border-radius: 3px;
        border: 1px solid var(--border, rgba(127,127,127,0.18));
        background: var(--bg-sunken, rgba(127,127,127,0.08));
        transition: transform 0.08s ease;
      }
      .hm-cell:hover { transform: scale(1.18); position: relative; z-index: 2; }
      .hm-legend {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 12px;
        font-size: 11px;
        color: var(--text-faint, #888);
      }
      .hm-legend-swatch {
        flex: 0 0 auto;
        width: 120px;
        height: 12px;
        border-radius: 3px;
        border: 1px solid var(--border, rgba(127,127,127,0.18));
      }
      .hm-empty {
        color: var(--text-faint, #888);
        font-size: 13px;
        padding: 24px 4px;
      }
    `;
    document.head.appendChild(st);
  }

  (window.LAAM_DASH_MODULES = window.LAAM_DASH_MODULES || []).push({
    id: 'heatmap',
    render(host, stats, ctx) {
      host.innerHTML = '';
      const esc = (ctx && ctx.esc) || (s => String(s));
      const t9 = (ctx && ctx.t) || ((k) => k);
      const cssVar = (ctx && ctx.cssVar) || (() => '#3b82f6');
      const accent =
        cssVar('--accent') ||
        (ctx && ctx.palette && ctx.palette.accent) ||
        '#3b82f6';

      const card = document.createElement('div');
      card.className = 'chart-card wide';

      const h3 = document.createElement('h3');
      h3.textContent = t9('dash.hm.title');
      card.appendChild(h3);

      const hm = stats && stats.heatmap;
      const cells = hm && Array.isArray(hm.cells) ? hm.cells : null;
      const max = hm && typeof hm.max === 'number' ? hm.max : 0;

      if (!cells || max <= 0) {
        const empty = document.createElement('div');
        empty.className = 'hm-empty';
        empty.textContent = t9('dash.hm.empty');
        card.appendChild(empty);
        host.appendChild(card);
        return;
      }

      const dayLabels = [
        t9('dash.hm.day.sun'), t9('dash.hm.day.mon'), t9('dash.hm.day.tue'),
        t9('dash.hm.day.wed'), t9('dash.hm.day.thu'), t9('dash.hm.day.fri'),
        t9('dash.hm.day.sat'),
      ];
      const labelHours = { 0: 1, 3: 1, 6: 1, 9: 1, 12: 1, 15: 1, 18: 1, 21: 1 };

      const wrap = document.createElement('div');
      wrap.className = 'hm-wrap';

      const grid = document.createElement('div');
      grid.className = 'hm-grid';

      // Header row: empty corner + 24 hour labels
      const corner = document.createElement('div');
      corner.className = 'hm-corner';
      grid.appendChild(corner);
      for (let hr = 0; hr < 24; hr++) {
        const hc = document.createElement('div');
        hc.className = 'hm-hour';
        hc.textContent = labelHours[hr] ? String(hr) : '';
        grid.appendChild(hc);
      }

      // Day rows (Sunday first, index 0..6)
      for (let d = 0; d < 7; d++) {
        const dl = document.createElement('div');
        dl.className = 'hm-day';
        dl.textContent = dayLabels[d];
        grid.appendChild(dl);

        const row = cells[d] || [];
        for (let hr = 0; hr < 24; hr++) {
          const val = Number(row[hr]) || 0;
          const cell = document.createElement('div');
          cell.className = 'hm-cell';
          if (val > 0) {
            const op = Math.max(0.08, val / max);
            cell.style.background = `color-mix(in srgb, ${accent} ${(op * 100).toFixed(1)}%, transparent)`;
          }
          cell.title = t9('dash.hm.cellTitle', { day: dayLabels[d], hr, n: val });
          grid.appendChild(cell);
        }
      }

      wrap.appendChild(grid);

      const legend = document.createElement('div');
      legend.className = 'hm-legend';
      const lowSpan = document.createElement('span');
      lowSpan.textContent = t9('dash.hm.low');
      const swatch = document.createElement('div');
      swatch.className = 'hm-legend-swatch';
      swatch.style.background = `linear-gradient(to right, var(--bg-sunken, rgba(127,127,127,0.08)), ${accent})`;
      const highSpan = document.createElement('span');
      highSpan.textContent = t9('dash.hm.high', { max: esc(String(max)) });
      legend.appendChild(lowSpan);
      legend.appendChild(swatch);
      legend.appendChild(highSpan);
      wrap.appendChild(legend);

      card.appendChild(wrap);
      host.appendChild(card);
    }
  });
})();
