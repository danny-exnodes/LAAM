(function () {
  if (!document.getElementById('laam-models-css')) {
    const st = document.createElement('style');
    st.id = 'laam-models-css';
    st.textContent = `
      /* The table has nowrap cells; on a phone it scrolls horizontally inside
         its card instead of overflowing the whole dashboard. */
      .module-host .mdl-scroll { overflow-x:auto; -webkit-overflow-scrolling:touch; margin:0 -2px; }
      .module-host .mdl-table { width:100%; border-collapse:collapse; font-size:13px; }
      .module-host .mdl-table th, .module-host .mdl-table td { padding:7px 10px; border-bottom:1px solid var(--border); text-align:right; white-space:nowrap; }
      .module-host .mdl-table th { color:var(--text-faint); font-weight:600; font-size:11px; text-transform:uppercase; letter-spacing:.03em; }
      .module-host .mdl-table th:first-child, .module-host .mdl-table td:first-child { text-align:left; }
      .module-host .mdl-table td.num { font-variant-numeric:tabular-nums; }
      .module-host .mdl-table td.mdl-name { font-family:var(--mono); color:var(--text); }
      .module-host .mdl-table tbody tr:last-child td { border-bottom:none; }
      .module-host .mdl-empty { color:var(--text-faint); font-size:13px; padding:14px 2px; }
    `;
    document.head.appendChild(st);
  }

  (window.LAAM_DASH_MODULES = window.LAAM_DASH_MODULES || []).push({
    id: 'models',
    render(host, stats, ctx) {
      const { Chart, palette: p, fmtNum, fmtUSD, fmtDur, shortModel, esc } = ctx;

      // idempotent teardown
      if (host._charts) { for (const c of host._charts) { try { c.destroy(); } catch (e) {} } }
      host._charts = [];

      const rows = Array.isArray(stats.modelComparison) ? stats.modelComparison : [];

      if (!rows.length) {
        host.innerHTML = `
          <div class="chart-card wide">
            <h3>So sánh model</h3>
            <div class="mdl-empty">Chưa có dữ liệu model để so sánh.</div>
          </div>`;
        return;
      }

      const tableRows = rows.map((r) => `
        <tr>
          <td class="mdl-name">${esc(shortModel(r.model))}</td>
          <td class="num">${esc(fmtNum(r.count || 0))}</td>
          <td class="num">${esc(fmtNum(r.tokensTotal || 0))}</td>
          <td class="num">${esc(fmtUSD(r.costUSD || 0))}</td>
          <td class="num">${esc(fmtDur(r.avgDurationMs || 0))}</td>
          <td class="num">${esc(fmtNum(r.tokensPerMin || 0))}</td>
          <td class="num">${((r.doneRate || 0) * 100).toFixed(0)}%</td>
        </tr>`).join('');

      host.innerHTML = `
        <div class="chart-card wide">
          <h3>So sánh model</h3>
          <div class="mdl-scroll"><table class="mdl-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>#Session</th>
                <th>Tokens</th>
                <th>Chi phí</th>
                <th>Thời lượng TB</th>
                <th>Tốc độ (tok/phút)</th>
                <th>Hoàn tất %</th>
              </tr>
            </thead>
            <tbody>${tableRows}</tbody>
          </table></div>
        </div>
        <div class="chart-card half">
          <h3>Tốc độ (tokens/phút)</h3>
          <div class="cwrap"><canvas></canvas></div>
        </div>
        <div class="chart-card half">
          <h3>Tỉ lệ hoàn tất</h3>
          <div class="cwrap"><canvas></canvas></div>
        </div>
      `;

      const labels = rows.map((r) => shortModel(r.model));
      const canvases = host.querySelectorAll('canvas');

      const baseOpts = (extra) => Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
      }, extra || {});

      const catAxis = { ticks: { color: p.text, font: { size: 10 } }, grid: { color: p.grid } };

      // Speed: tokens/min
      host._charts.push(new Chart(canvases[0].getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'tok/phút',
            data: rows.map((r) => r.tokensPerMin || 0),
            backgroundColor: p.accent,
            borderRadius: 4,
          }],
        },
        options: baseOpts({
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `${fmtNum(c.parsed.y)} tok/phút` } },
          },
          scales: {
            x: catAxis,
            y: {
              beginAtZero: true,
              ticks: { color: p.text, font: { size: 10 }, callback: (v) => fmtNum(v) },
              grid: { color: p.grid },
            },
          },
        }),
      }));

      // Completion rate %
      host._charts.push(new Chart(canvases[1].getContext('2d'), {
        type: 'bar',
        data: {
          labels,
          datasets: [{
            label: 'Hoàn tất %',
            data: rows.map((r) => +((r.doneRate || 0) * 100).toFixed(1)),
            backgroundColor: p.running,
            borderRadius: 4,
          }],
        },
        options: baseOpts({
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `${c.parsed.y}%` } },
          },
          scales: {
            x: catAxis,
            y: {
              beginAtZero: true,
              max: 100,
              ticks: { color: p.text, font: { size: 10 }, callback: (v) => v + '%' },
              grid: { color: p.grid },
            },
          },
        }),
      }));
    },
  });
})();
