(function () {
  if (!document.getElementById('laam-cost-css')) {
    const st = document.createElement('style');
    st.id = 'laam-cost-css';
    st.textContent = `
      .module-host .cost-head { display:flex; align-items:baseline; gap:10px; flex-wrap:wrap; }
      .module-host .cost-total { font-size:13px; color:var(--text-dim); }
      .module-host .cost-total b { font-size:18px; color:var(--accent); font-variant-numeric:tabular-nums; }
      .module-host .cost-note { color:var(--text-faint); font-size:11px; margin-top:8px; line-height:1.4; }
    `;
    document.head.appendChild(st);
  }

  (window.LAAM_DASH_MODULES = window.LAAM_DASH_MODULES || []).push({
    id: 'cost',
    render(host, stats, ctx) {
      const { Chart, palette: p, fmtNum, fmtUSD, shortModel, esc } = ctx;

      // 1) idempotent teardown of any charts created last render
      if (host._charts) { for (const c of host._charts) { try { c.destroy(); } catch (e) {} } }
      host._charts = [];

      const totals = stats.totals || {};
      const activity = stats.activity || { bucketMs: 0, points: [] };
      const byModel = Array.isArray(stats.byModel) ? stats.byModel : [];
      const byProject = Array.isArray(stats.byProject) ? stats.byProject : [];
      const note = (stats.pricing && stats.pricing.note) || '';

      const daily = activity.bucketMs >= 86400000;
      const pad = (n) => String(n).padStart(2, '0');
      const fmtTs = (ts) => {
        const d = new Date(ts);
        return daily
          ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`
          : `${pad(d.getDate())} ${pad(d.getHours())}h`;
      };

      // 2) rebuild markup
      host.innerHTML = `
        <div class="chart-card wide">
          <div class="cost-head">
            <h3>Đốt token theo thời gian</h3>
            <span class="cost-total">Tổng chi phí ước tính: <b>${esc(fmtUSD(totals.costUSD || 0))}</b></span>
          </div>
          <div class="cwrap"><canvas></canvas></div>
          <div class="cost-note">${esc(note)}</div>
        </div>
        <div class="chart-card">
          <h3>Chi phí ước tính theo model (USD)</h3>
          <div class="cwrap"><canvas></canvas></div>
        </div>
        <div class="chart-card">
          <h3>Chi phí theo project (USD)</h3>
          <div class="cwrap"><canvas></canvas></div>
        </div>
      `;

      const canvases = host.querySelectorAll('canvas');

      const baseOpts = (extra) => Object.assign({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: p.text, font: { size: 11 } } },
        },
      }, extra || {});

      const usdAxis = {
        beginAtZero: true,
        ticks: { color: p.text, font: { size: 10 }, callback: (v) => fmtUSD(v) },
        grid: { color: p.grid },
      };
      const catAxis = { ticks: { color: p.text, font: { size: 10 } }, grid: { color: p.grid } };

      // Chart 1: token burn over time (line, filled, accent)
      const pts = activity.points || [];
      host._charts.push(new Chart(canvases[0].getContext('2d'), {
        type: 'line',
        data: {
          labels: pts.map((q) => fmtTs(q.ts)),
          datasets: [{
            label: 'Tokens',
            data: pts.map((q) => q.tokens),
            borderColor: p.accent,
            backgroundColor: p.accent + '33',
            fill: true,
            tension: 0.3,
            pointRadius: pts.length > 40 ? 0 : 2,
          }],
        },
        options: baseOpts({
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => `${fmtNum(c.parsed.y)} tokens` } },
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

      // Chart 2: cost by model (bar)
      host._charts.push(new Chart(canvases[1].getContext('2d'), {
        type: 'bar',
        data: {
          labels: byModel.map((m) => shortModel(m.model)),
          datasets: [{
            label: 'USD',
            data: byModel.map((m) => m.costUSD || 0),
            backgroundColor: byModel.map((_, i) => p.series[i % p.series.length]),
          }],
        },
        options: baseOpts({
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => fmtUSD(c.parsed.y) } },
          },
          scales: { x: catAxis, y: usdAxis },
        }),
      }));

      // Chart 3: cost by project (bar)
      host._charts.push(new Chart(canvases[2].getContext('2d'), {
        type: 'bar',
        data: {
          labels: byProject.map((q) => q.name),
          datasets: [{
            label: 'USD',
            data: byProject.map((q) => q.costUSD || 0),
            backgroundColor: byProject.map((_, i) => p.series[i % p.series.length]),
          }],
        },
        options: baseOpts({
          plugins: {
            legend: { display: false },
            tooltip: { callbacks: { label: (c) => fmtUSD(c.parsed.y) } },
          },
          scales: { x: catAxis, y: usdAxis },
        }),
      }));
    },
  });
})();
