(function () {
  window.LAAM = window.LAAM || {};

  // Localized string helper; falls back to the key if i18n is unavailable.
  function t9(key, vars) {
    if (window.LAAM && typeof window.LAAM.t === 'function') {
      try { return window.LAAM.t(key, vars); } catch (e) { /* fall through */ }
    }
    return key;
  }
  const errStr = (e) => (e && e.message ? e.message : String(e));

  function downloadBlob(filename, mime, text) {
    const b = new Blob([text], { type: mime });
    const u = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = u;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 1000);
  }

  // --- helpers ----------------------------------------------------------
  function dateStamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function isoOrEmpty(ms) {
    if (ms === null || ms === undefined || ms === '' || Number.isNaN(Number(ms))) return '';
    try {
      return new Date(Number(ms)).toISOString();
    } catch (e) {
      return '';
    }
  }

  // CSV-escape any value: stringify, wrap in quotes, double internal quotes.
  function csvCell(v) {
    if (v === null || v === undefined) v = '';
    const s = String(v);
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function csvRow(arr) {
    return arr.map(csvCell).join(',');
  }

  function fmtNum(n) {
    if (window.LAAM && typeof window.LAAM.fmtNum === 'function') {
      try { return window.LAAM.fmtNum(n); } catch (e) { /* fall through */ }
    }
    const x = Number(n);
    if (!Number.isFinite(x)) return '0';
    return x.toLocaleString('en-US');
  }

  function fmtUSD(n) {
    if (window.LAAM && typeof window.LAAM.fmtUSD === 'function') {
      try { return window.LAAM.fmtUSD(n); } catch (e) { /* fall through */ }
    }
    const x = Number(n);
    return '$' + (Number.isFinite(x) ? x : 0).toFixed(2);
  }

  async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    return res.json();
  }

  // Flatten the /api/sessions response (projects -> sessions) into a flat list.
  function flattenSessions(data) {
    const out = [];
    if (Array.isArray(data && data.sessions)) {
      // already flat
      for (const s of data.sessions) out.push(s);
      return out;
    }
    const projects = (data && data.projects) || [];
    for (const p of projects) {
      const sessions = (p && p.sessions) || [];
      for (const s of sessions) out.push(s);
    }
    return out;
  }

  // --- 1) csvSessions ---------------------------------------------------
  async function csvSessions(opts) {
    opts = opts || {};
    const sinceMs = opts.sinceMs;
    const untilMs = opts.untilMs;
    let sessions;
    try {
      const data = await fetchJSON('/api/sessions');
      sessions = flattenSessions(data);
    } catch (e) {
      alert(t9('dash.export.errSessionsCSV', { err: errStr(e) }));
      return;
    }

    if (sinceMs !== undefined && sinceMs !== null || untilMs !== undefined && untilMs !== null) {
      sessions = sessions.filter((s) => {
        const la = s && s.lastActivity;
        if (la === null || la === undefined) return false;
        const t = Number(la);
        if (sinceMs !== undefined && sinceMs !== null && t < Number(sinceMs)) return false;
        if (untilMs !== undefined && untilMs !== null && t > Number(untilMs)) return false;
        return true;
      });
    }

    const header = [
      'id', 'project', 'projectPath', 'model', 'gitBranch', 'status',
      'startTime', 'lastActivity', 'durationMs', 'messageCount',
      'userMessageCount', 'assistantMessageCount', 'toolUseCount',
      'subAgentCount', 'tokensIn', 'tokensOut', 'costUSD'
    ];

    const lines = [csvRow(header)];
    for (const s of sessions) {
      const tokens = s.tokens || {};
      lines.push(csvRow([
        s.id,
        s.project,
        s.projectPath,
        s.model,
        s.gitBranch,
        s.status,
        isoOrEmpty(s.startTime),
        isoOrEmpty(s.lastActivity),
        s.durationMs,
        s.messageCount,
        s.userMessageCount,
        s.assistantMessageCount,
        s.toolUseCount,
        s.subAgentCount,
        tokens.input,
        tokens.output,
        s.costUSD
      ]));
    }

    const csv = lines.join('\r\n');
    downloadBlob('laam-sessions-' + dateStamp() + '.csv', 'text/csv;charset=utf-8', csv);
  }

  // --- 2) csvSession ----------------------------------------------------
  async function csvSession(id) {
    if (!id) {
      alert(t9('dash.export.errMissingId'));
      return;
    }
    let session;
    try {
      session = await fetchJSON('/api/session/' + encodeURIComponent(id));
    } catch (e) {
      alert(t9('dash.export.errSessionCSV', { err: errStr(e) }));
      return;
    }

    const calls = (session && session.toolCalls) || [];
    const header = ['name', 'detail', 'status', 'isError', 'start', 'end', 'durationMs'];
    const lines = [csvRow(header)];
    for (const c of calls) {
      lines.push(csvRow([
        c.name,
        c.detail,
        c.status,
        c.isError,
        isoOrEmpty(c.start),
        isoOrEmpty(c.end),
        c.durationMs
      ]));
    }

    const csv = lines.join('\r\n');
    const short = String(id).slice(0, 8);
    downloadBlob('laam-session-' + short + '.csv', 'text/csv;charset=utf-8', csv);
  }

  // --- 3) pdfReport -----------------------------------------------------
  async function pdfReport(opts) {
    opts = opts || {};
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert(t9('dash.export.errPdfLib'));
      return;
    }
    const { jsPDF } = window.jspdf;

    let stats;
    try {
      stats = await fetchJSON('/api/stats');
    } catch (e) {
      alert(t9('dash.export.errStatsPDF', { err: errStr(e) }));
      return;
    }

    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageHeight = doc.internal.pageSize.getHeight();
      const marginX = 40;
      const bottomLimit = pageHeight - 40; // ~280 in mm terms; in pt this is the real bottom
      let y = 50;

      function ensureRoom(extra) {
        if (y + (extra || 0) > bottomLimit) {
          doc.addPage();
          y = 50;
        }
      }

      function line(text, opt) {
        opt = opt || {};
        const size = opt.size || 10;
        ensureRoom(size + 4);
        doc.setFontSize(size);
        doc.setFont('courier', opt.bold ? 'bold' : 'normal');
        doc.text(String(text), opt.x || marginX, y);
        y += opt.lh || (size + 5);
      }

      function gap(px) {
        y += (px || 8);
        ensureRoom(0);
      }

      const totals = stats.totals || {};
      const tokensTotal = (totals.tokensTotal !== undefined && totals.tokensTotal !== null)
        ? totals.tokensTotal
        : (Number(totals.tokensIn || 0) + Number(totals.tokensOut || 0));

      // Title
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      ensureRoom(20);
      doc.text(t9('dash.pdf.title'), marginX, y);
      y += 22;
      line(t9('dash.pdf.createdAt', { time: new Date().toLocaleString() }), { size: 9 });
      gap(8);

      // Summary block
      const pad28 = (s) => String(s).padEnd(28, ' ');
      line(t9('dash.pdf.overview'), { size: 12, bold: true });
      gap(2);
      line(pad28(t9('dash.pdf.totalSessions')) + ': ' + fmtNum(totals.sessions || 0));
      line(pad28(t9('dash.pdf.running')) + ': ' + fmtNum(totals.running || 0));
      line(pad28(t9('dash.pdf.done')) + ': ' + fmtNum(totals.done || 0));
      line(pad28(t9('dash.pdf.totalTokens')) + ': ' + fmtNum(tokensTotal));
      line(pad28(t9('dash.pdf.estCost')) + ': $' + Number(totals.costUSD || 0).toFixed(2));
      line(pad28(t9('dash.pdf.totalToolCalls')) + ': ' + fmtNum(totals.toolCalls || 0));
      gap(10);

      // By model
      const models = stats.modelComparison || stats.byModel || [];
      line(t9('dash.pdf.byModel'), { size: 12, bold: true });
      gap(2);
      line(t9('dash.pdf.byModelHeader'), { size: 9, bold: true });
      for (const m of models) {
        const name = String(m.model || '').slice(0, 28).padEnd(28, ' ');
        const ss = String(fmtNum(m.count || 0)).padStart(5, ' ');
        const tk = String(fmtNum(m.tokensTotal !== undefined ? m.tokensTotal : (Number(m.tokensIn || 0) + Number(m.tokensOut || 0)))).padStart(12, ' ');
        const cost = ('$' + Number(m.costUSD || 0).toFixed(2)).padStart(10, ' ');
        const doneRate = (m.doneRate !== undefined && m.doneRate !== null)
          ? (Number(m.doneRate) * 100).toFixed(0) + '%'
          : '';
        line(name + ' ' + ss + ' ' + tk + ' ' + cost + '  ' + doneRate, { size: 9 });
      }
      gap(10);

      // Top tools
      const tl = stats.toolLeaderboard || {};
      const mostUsed = tl.mostUsed || [];
      line(t9('dash.pdf.topTools'), { size: 12, bold: true });
      gap(2);
      for (const t of mostUsed) {
        const name = String(t.name || '').slice(0, 40).padEnd(40, ' ');
        line(name + ' ' + String(fmtNum(t.count || 0)).padStart(6, ' '), { size: 9 });
      }
      gap(10);

      // By project
      const byProject = stats.byProject || [];
      line(t9('dash.pdf.byProject'), { size: 12, bold: true });
      gap(2);
      line(t9('dash.pdf.byProjectHeader'), { size: 9, bold: true });
      for (const p of byProject) {
        const name = String(p.name || '').slice(0, 28).padEnd(28, ' ');
        const ss = String(fmtNum(p.sessions || 0)).padStart(5, ' ');
        const tk = String(fmtNum(p.tokensTotal !== undefined ? p.tokensTotal : (Number(p.tokensIn || 0) + Number(p.tokensOut || 0)))).padStart(12, ' ');
        const cost = ('$' + Number(p.costUSD || 0).toFixed(2)).padStart(10, ' ');
        line(name + ' ' + ss + ' ' + tk + ' ' + cost, { size: 9 });
      }
      gap(12);

      // Footer note
      const note = (stats.pricing && stats.pricing.note) || t9('dash.pdf.priceNote');
      line(note, { size: 8 });

      doc.save('laam-report-' + dateStamp() + '.pdf');
    } catch (e) {
      alert(t9('dash.export.errPdfGen', { err: errStr(e) }));
    }
  }

  window.LAAM.export = { csvSessions, csvSession, pdfReport };
})();
