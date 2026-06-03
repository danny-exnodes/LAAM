// LAAM — Dashboard page: aggregate KPIs + Chart.js visualisations.
// Data comes from /api/stats; the SSE stream is used purely as a "something
// changed, refresh" signal so the dashboard stays live.
(() => {
  const { fmtNum, fmtDur, shortModel, cssVar, isStuck, ago } = window.LAAM;
  const t9 = (k, v) => window.LAAM.t(k, v);
  window.LAAM.initTheme();
  window.LAAM.buildHeader();
  window.LAAM.loadConfig();
  window.LAAM.ensureNotifyPermission();
  const knownStuck = new Set();

  const charts = {};
  let lastStats = null;
  let lastSessions = null;
  const moduleHosts = new Map(); // module.id -> host element

  // ---- Palette (resolved from CSS vars so charts follow the theme) ----
  function palette() {
    return {
      text: cssVar('--text-dim') || '#5b6470',
      grid: cssVar('--border') || '#e2e5ea',
      accent: cssVar('--accent') || '#6d5efc',
      running: cssVar('--running') || '#16a34a',
      idle: cssVar('--idle') || '#d97706',
      done: cssVar('--done') || '#64748b',
      series: ['#6d5efc', '#16a34a', '#0ea5e9', '#f59e0b', '#ec4899', '#14b8a6', '#a855f7', '#ef4444', '#84cc16', '#64748b'],
    };
  }

  function destroy() {
    for (const k of Object.keys(charts)) { charts[k]?.destroy(); delete charts[k]; }
  }

  function baseOpts(p, extra = {}) {
    return Object.assign({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: p.text, boxWidth: 12, font: { size: 11 } } },
      },
    }, extra);
  }
  function axisOpts(p, opts = {}) {
    const ax = {
      x: { ticks: { color: p.text, font: { size: 10 } }, grid: { color: p.grid } },
      y: { ticks: { color: p.text, font: { size: 10 } }, grid: { color: p.grid }, beginAtZero: true },
    };
    if (opts.indexAxis === 'y') { ax.x.beginAtZero = true; }
    return ax;
  }

  // ---- KPIs ----
  function renderKpis(t) {
    const items = [
      { label: t9('dash.kpi.sessions'), value: fmtNum(t.sessions), sub: t9('dash.kpi.sub.projects', { n: t.projects }), tone: 'accent' },
      { label: t9('dash.kpi.running'), value: fmtNum(t.running), sub: t9('dash.kpi.sub.subAgents', { n: t.runningSubAgents }), tone: 'running' },
      { label: t9('dash.kpi.idleDone'), value: `${fmtNum(t.idle)} / ${fmtNum(t.done)}`, sub: t9('dash.kpi.sub.idleDone'), tone: 'done' },
      { label: t9('dash.kpi.tokensTotal'), value: fmtNum(t.tokensTotal), sub: t9('dash.kpi.sub.inOut', { in: fmtNum(t.tokensIn), out: fmtNum(t.tokensOut) }), tone: 'accent' },
      { label: t9('dash.kpi.messages'), value: fmtNum(t.messages), sub: t9('dash.kpi.sub.userAsst', { user: fmtNum(t.userMessages), asst: fmtNum(t.assistantMessages) }), tone: 'done' },
      { label: t9('dash.kpi.toolCalls'), value: fmtNum(t.toolCalls), sub: t9('dash.kpi.sub.subAgents', { n: fmtNum(t.subAgents) }), tone: 'accent' },
      { label: t9('dash.kpi.avgDur'), value: fmtDur(t.avgDurationMs), sub: t9('dash.kpi.sub.totalDur', { dur: fmtDur(t.totalDurationMs) }), tone: 'done' },
    ];
    document.querySelector('#kpis').innerHTML = items.map((i) => `
      <div class="kpi ${i.tone}">
        <div class="kpi-label">${i.label}</div>
        <div class="kpi-value">${i.value}</div>
        <div class="kpi-sub">${i.sub}</div>
      </div>`).join('');
  }

  // ---- Charts ----
  function render(stats) {
    lastStats = stats;
    const t = stats.totals;
    renderKpis(t);
    destroy();
    const p = palette();
    const C = window.Chart;
    if (!C) return;

    // Status doughnut
    charts.status = new C(document.querySelector('#c-status'), {
      type: 'doughnut',
      data: {
        labels: [t9('dash.st.running'), t9('dash.st.idle'), t9('dash.st.done')],
        datasets: [{ data: [t.running, t.idle, t.done], backgroundColor: [p.running, p.idle, p.done], borderWidth: 0 }],
      },
      options: baseOpts(p, { cutout: '62%' }),
    });

    // Model doughnut
    charts.model = new C(document.querySelector('#c-model'), {
      type: 'doughnut',
      data: {
        labels: stats.byModel.map((m) => shortModel(m.model)),
        datasets: [{ data: stats.byModel.map((m) => m.count), backgroundColor: p.series, borderWidth: 0 }],
      },
      options: baseOpts(p, { cutout: '55%' }),
    });

    // Branch bar
    charts.branch = new C(document.querySelector('#c-branch'), {
      type: 'bar',
      data: {
        labels: stats.byBranch.map((b) => b.branch),
        datasets: [{ label: t9('dash.ds.session'), data: stats.byBranch.map((b) => b.count), backgroundColor: p.accent, borderRadius: 5 }],
      },
      options: baseOpts(p, { plugins: { legend: { display: false } }, scales: axisOpts(p) }),
    });

    // Activity timeline (line)
    const act = stats.activity;
    const daily = act.bucketMs >= 86400000;
    document.querySelector('#act-hint').textContent = daily ? t9('dash.act.daily') : t9('dash.act.hourly');
    const fmtBucket = (ts) => {
      const d = new Date(ts);
      const pad = (n) => String(n).padStart(2, '0');
      return daily ? `${pad(d.getMonth() + 1)}/${pad(d.getDate())}` : `${pad(d.getDate())} ${pad(d.getHours())}h`;
    };
    charts.activity = new C(document.querySelector('#c-activity'), {
      type: 'line',
      data: {
        labels: act.points.map((x) => fmtBucket(x.ts)),
        datasets: [
          { label: t9('dash.ds.session'), data: act.points.map((x) => x.sessions), borderColor: p.accent, backgroundColor: p.accent + '33', fill: true, tension: 0.3, yAxisID: 'y' },
          { label: t9('dash.ds.tokens'), data: act.points.map((x) => x.tokens), borderColor: p.running, backgroundColor: 'transparent', tension: 0.3, yAxisID: 'y1' },
        ],
      },
      options: baseOpts(p, {
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { ticks: { color: p.text, font: { size: 10 }, maxRotation: 0, autoSkip: true }, grid: { color: p.grid } },
          y: { position: 'left', beginAtZero: true, ticks: { color: p.text, font: { size: 10 }, precision: 0 }, grid: { color: p.grid }, title: { display: true, text: t9('dash.axis.session'), color: p.text } },
          y1: { position: 'right', beginAtZero: true, ticks: { color: p.text, font: { size: 10 }, callback: (v) => fmtNum(v) }, grid: { drawOnChartArea: false }, title: { display: true, text: t9('dash.axis.tokens'), color: p.text } },
        },
      }),
    });

    // Sessions per project
    charts.proj = new C(document.querySelector('#c-proj'), {
      type: 'bar',
      data: {
        labels: stats.byProject.map((x) => x.name),
        datasets: [{ label: t9('dash.ds.session'), data: stats.byProject.map((x) => x.sessions), backgroundColor: p.series, borderRadius: 5 }],
      },
      options: baseOpts(p, { plugins: { legend: { display: false } }, scales: axisOpts(p) }),
    });

    // Tokens per project (stacked in/out)
    charts.tokens = new C(document.querySelector('#c-tokens'), {
      type: 'bar',
      data: {
        labels: stats.byProject.map((x) => x.name),
        datasets: [
          { label: t9('dash.ds.input'), data: stats.byProject.map((x) => x.tokensIn), backgroundColor: p.accent, borderRadius: 4 },
          { label: t9('dash.ds.output'), data: stats.byProject.map((x) => x.tokensOut), backgroundColor: p.running, borderRadius: 4 },
        ],
      },
      options: baseOpts(p, {
        scales: {
          x: { stacked: true, ticks: { color: p.text, font: { size: 10 } }, grid: { color: p.grid } },
          y: { stacked: true, beginAtZero: true, ticks: { color: p.text, font: { size: 10 }, callback: (v) => fmtNum(v) }, grid: { color: p.grid } },
        },
      }),
    });

    // Tool calls per project
    charts.tools = new C(document.querySelector('#c-tools'), {
      type: 'bar',
      data: {
        labels: stats.byProject.map((x) => x.name),
        datasets: [{ label: t9('dash.ds.toolCalls'), data: stats.byProject.map((x) => x.toolCalls), backgroundColor: p.idle, borderRadius: 5 }],
      },
      options: baseOpts(p, { plugins: { legend: { display: false } }, scales: axisOpts(p) }),
    });

    // Top sessions by duration (horizontal)
    charts.dur = new C(document.querySelector('#c-dur'), {
      type: 'bar',
      data: {
        labels: stats.topByDuration.map((s) => `${s.project} · ${s.id.slice(0, 6)}`),
        datasets: [{ label: t9('dash.ds.durationMin'), data: stats.topByDuration.map((s) => Math.round((s.durationMs || 0) / 60000)), backgroundColor: p.accent, borderRadius: 4 }],
      },
      options: baseOpts(p, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: axisOpts(p, { indexAxis: 'y' }) }),
    });

    // Top sessions by tokens (horizontal)
    charts.toptok = new C(document.querySelector('#c-toptok'), {
      type: 'bar',
      data: {
        labels: stats.topByTokens.map((s) => `${s.project} · ${s.id.slice(0, 6)}`),
        datasets: [{ label: t9('dash.ds.tokens'), data: stats.topByTokens.map((s) => s.tokensTotal), backgroundColor: p.running, borderRadius: 4 }],
      },
      options: baseOpts(p, { indexAxis: 'y', plugins: { legend: { display: false } }, scales: axisOpts(p, { indexAxis: 'y' }) }),
    });

    renderModules(stats, p);
  }

  // ---- Pluggable dashboard modules (cost, heatmap, tools, models, …) ----
  // Each module: { id, render(host, stats, ctx) }. It owns its host element and
  // re-renders into it on every data/theme update.
  function renderModules(stats, p) {
    const area = document.querySelector('#modules');
    if (!area) return;
    const ctx = {
      Chart: window.Chart, palette: p,
      fmtNum: window.LAAM.fmtNum, fmtUSD: window.LAAM.fmtUSD, fmtDur,
      shortModel, cssVar, esc: window.LAAM.esc, t: window.LAAM.t,
    };
    for (const mod of window.LAAM.dashModules) {
      try {
        let host = moduleHosts.get(mod.id);
        if (!host) {
          host = document.createElement('div');
          host.className = 'module-host';
          host.dataset.module = mod.id;
          area.appendChild(host);
          moduleHosts.set(mod.id, host);
        }
        mod.render(host, stats, ctx);
      } catch (e) { /* a broken module must not break the dashboard */ }
    }
  }

  // ---- Data wiring ----
  let pending = null;
  async function refresh() {
    try {
      const r = await fetch('/api/stats');
      render(await r.json());
    } catch {}
  }
  function scheduleRefresh() {
    if (pending) return;
    pending = setTimeout(() => { pending = null; refresh(); }, 400);
  }

  // Stuck-agent alert banner + notifications, driven by the live snapshot.
  function renderStuckBanner(sessions) {
    const stuck = (sessions || []).filter((s) => isStuck(s));
    const el = document.querySelector('#stuck-alert');
    if (el) {
      if (stuck.length) {
        el.hidden = false;
        el.innerHTML = window.LAAM.icon('triangle-alert', { size: 16, class: 'lc' }) +
          ' ' + t9('dash.stuck.banner', { n: stuck.length });
      } else {
        el.hidden = true;
      }
    }
  }

  function handleStuck(sessions) {
    lastSessions = sessions;
    const stuck = (sessions || []).filter((s) => isStuck(s));
    renderStuckBanner(sessions);
    for (const s of stuck) {
      if (!knownStuck.has(s.id)) {
        knownStuck.add(s.id);
        window.LAAM.notify(`stuck:${s.id}`, t9('dash.stuck.notifyTitle'), t9('dash.stuck.notifyBody', { project: s.project, model: shortModel(s.model), ago: ago(s.lastActivity) }));
      }
    }
    for (const id of [...knownStuck]) if (!stuck.some((s) => s.id === id)) knownStuck.delete(id);
  }

  // Export buttons. Inject Lucide icons + alignment CSS (icon survives i18n
  // re-translation because the text lives in a separate inner span).
  if (!document.getElementById('laam-dash-icon-css')) {
    const st = document.createElement('style');
    st.id = 'laam-dash-icon-css';
    st.textContent = `
      .dash-toolbar .fsel { display:inline-flex; align-items:center; gap:6px; }
      .dash-toolbar .fsel .lc-ico { display:inline-flex; }
      #stuck-alert .lc { vertical-align:-2px; margin-right:2px; }
    `;
    document.head.appendChild(st);
  }
  const csvIco = document.querySelector('#exp-csv .lc-ico');
  if (csvIco) csvIco.innerHTML = window.LAAM.icon('download', { size: 16, class: 'lc' });
  const pdfIco = document.querySelector('#exp-pdf .lc-ico');
  if (pdfIco) pdfIco.innerHTML = window.LAAM.icon('file-text', { size: 16, class: 'lc' });

  document.querySelector('#exp-csv')?.addEventListener('click', () => window.LAAM.export?.csvSessions());
  document.querySelector('#exp-pdf')?.addEventListener('click', () => window.LAAM.export?.pdfReport());

  window.LAAM.connectSSE((data) => { handleStuck(data.sessions); scheduleRefresh(); });
  refresh();
  window.addEventListener('laam:theme', () => { if (lastStats) render(lastStats); });
  // Re-render dynamic content (KPIs, charts, modules, stuck banner) on language
  // switch from the last cached snapshot — no reload, no re-notify.
  window.addEventListener('laam:lang', () => {
    if (lastStats) render(lastStats);
    renderStuckBanner(lastSessions);
  });
})();
