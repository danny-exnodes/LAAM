(function () {
  if (!document.getElementById('laam-tools-css')) {
    const st = document.createElement('style');
    st.id = 'laam-tools-css';
    st.textContent = `
      .module-host .tool-tbl-wrap { max-height:220px; overflow:auto; }
      .module-host table.tool-tbl { width:100%; border-collapse:collapse; font-size:11px; }
      .module-host table.tool-tbl th,
      .module-host table.tool-tbl td { padding:5px 8px; text-align:left; border-bottom:1px solid var(--border); white-space:nowrap; }
      .module-host table.tool-tbl th { color:var(--text-faint); font-weight:600; position:sticky; top:0; background:var(--card, var(--bg)); }
      .module-host table.tool-tbl td.tname { font-family:var(--mono); color:var(--text); max-width:200px; overflow:hidden; text-overflow:ellipsis; }
      .module-host table.tool-tbl td.num { text-align:right; font-variant-numeric:tabular-nums; }
      .module-host table.tool-tbl td.rate { text-align:right; font-variant-numeric:tabular-nums; }
      .module-host .tool-empty { color:var(--text-dim); font-size:13px; padding:18px 4px; }
    `;
    document.head.appendChild(st);
  }

  (window.LAAM_DASH_MODULES = window.LAAM_DASH_MODULES || []).push({
    id: 'tools',
    render(host, stats, ctx) {
      const { Chart, palette: p, fmtNum, fmtDur, esc } = ctx;
      const t9 = (ctx && ctx.t) || ((k) => k);

      // 1) idempotent teardown of any charts created last render
      if (host._charts) { for (const c of host._charts) { try { c.destroy(); } catch (e) {} } }
      host._charts = [];

      const lb = stats.toolLeaderboard || {};
      const mostUsed = Array.isArray(lb.mostUsed) ? lb.mostUsed : [];
      const mostErrors = Array.isArray(lb.mostErrors) ? lb.mostErrors : [];
      const slowest = (Array.isArray(lb.slowest) ? lb.slowest : [])
        .filter((t) => t && t.avgDurationMs != null);

      // 2) error table rows
      const errRows = mostErrors.filter((t) => (t.errors || 0) > 0);
      const errTable = errRows.length
        ? `<div class="tool-tbl-wrap"><table class="tool-tbl">
             <thead><tr>
               <th>${esc(t9('dash.tools.th.tool'))}</th>
               <th style="text-align:right">${esc(t9('dash.tools.th.calls'))}</th>
               <th style="text-align:right">${esc(t9('dash.tools.th.errors'))}</th>
               <th style="text-align:right">${esc(t9('dash.tools.th.rate'))}</th>
             </tr></thead>
             <tbody>
               ${errRows.map((t) => {
                 const r = (t.errorRate || 0) * 100;
                 const color = (t.errorRate || 0) > 0 ? 'var(--error)' : 'var(--text)';
                 return `<tr>
                   <td class="tname" title="${esc(t.name)}">${esc(t.name)}</td>
                   <td class="num">${fmtNum(t.count || 0)}</td>
                   <td class="num">${fmtNum(t.errors || 0)}</td>
                   <td class="rate" style="color:${color}">${r.toFixed(1)}%</td>
                 </tr>`;
               }).join('')}
             </tbody>
           </table></div>`
        : `<div class="tool-empty">${esc(t9('dash.tools.noErrors'))}</div>`;

      // 3) rebuild markup
      host.innerHTML = `
        <div class="chart-card">
          <h3>${esc(t9('dash.tools.mostUsed'))}</h3>
          <div class="cwrap"><canvas></canvas></div>
        </div>
        <div class="chart-card">
          <h3>${esc(t9('dash.tools.mostErrors'))}</h3>
          ${errTable}
        </div>
        <div class="chart-card">
          <h3>${esc(t9('dash.tools.slowest'))}</h3>
          <div class="cwrap"><canvas></canvas></div>
        </div>
      `;

      const canvases = host.querySelectorAll('canvas');

      const hbarOpts = (labelFn) => ({
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: labelFn } },
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: { color: p.text, font: { size: 10 } },
            grid: { color: p.grid },
          },
          y: {
            ticks: { color: p.text, font: { size: 10 } },
            grid: { color: p.grid },
          },
        },
      });

      // Chart: most used (horizontal bar, accent)
      host._charts.push(new Chart(canvases[0].getContext('2d'), {
        type: 'bar',
        data: {
          labels: mostUsed.map((t) => t.name),
          datasets: [{
            label: t9('dash.tools.ds.calls'),
            data: mostUsed.map((t) => t.count || 0),
            backgroundColor: p.accent,
          }],
        },
        options: hbarOpts((c) => t9('dash.tools.tooltipCalls', { n: fmtNum(c.parsed.x) })),
      }));

      // Chart: slowest avg duration (horizontal bar, idle)
      host._charts.push(new Chart(canvases[1].getContext('2d'), {
        type: 'bar',
        data: {
          labels: slowest.map((t) => t.name),
          datasets: [{
            label: t9('dash.tools.ds.avgDur'),
            data: slowest.map((t) => t.avgDurationMs || 0),
            backgroundColor: p.idle,
          }],
        },
        options: hbarOpts((c) => fmtDur(c.parsed.x)),
      }));
    },
  });
})();
