/*
 * chat-ingest.js — File/URL ingestion for the LAAM chat page.
 *
 * Pure logic, no DOM. Exposes window.LAAMChatIngest = { parseFile, fetchUrl, MAX_CHARS }.
 * All extracted text is truncated to MAX_CHARS (~8K tokens). Errors are always
 * thrown as Error objects with a Vietnamese message.
 *
 *   async parseFile(file)
 *     file: a browser File object.
 *     -> { name, kind, text, chars, truncated }
 *        name      : original file name
 *        kind      : 'text' | 'csv' | 'pdf'
 *        text      : extracted text, truncated to MAX_CHARS
 *        chars     : final length of text
 *        truncated : true if the source text was longer than MAX_CHARS
 *     Throws Error (Vietnamese) for: too-large files, PDF read failures,
 *     and unsupported formats.
 *
 *   async fetchUrl(url)
 *     url: an http/https URL string.
 *     Calls POST /api/fetch-url (server-side fetch + SSRF guard).
 *     -> { title, text, url, truncated }
 *        text      : page text, truncated to MAX_CHARS
 *        truncated : true if the source/server-side text was longer than MAX_CHARS
 *     Throws Error (Vietnamese) with the server-provided message on failure.
 */
(function () {
  'use strict';

  // ~8K tokens worth of characters. All ingested text is capped to this length.
  var MAX_CHARS = 32000;

  // 5 MB hard cap on uploaded files.
  var MAX_FILE_BYTES = 5 * 1024 * 1024;

  // PDF page cap to keep extraction bounded.
  var MAX_PDF_PAGES = 50;

  // Extensions / mime types we treat as plain text.
  var TEXT_EXTS = ['txt', 'md', 'csv', 'json', 'log'];

  function getExt(name) {
    var n = String(name || '');
    var dot = n.lastIndexOf('.');
    return dot >= 0 ? n.slice(dot + 1).toLowerCase() : '';
  }

  // Truncate to MAX_CHARS, returning { text, truncated }.
  function cap(str) {
    var s = str == null ? '' : String(str);
    if (s.length > MAX_CHARS) {
      return { text: s.slice(0, MAX_CHARS), truncated: true };
    }
    return { text: s, truncated: false };
  }

  function isTextMime(mime) {
    return typeof mime === 'string' && /^text\//i.test(mime);
  }

  // Reused module worker for pdf.js. The vendored pdf.worker.min.mjs is an ES
  // MODULE — loading it as a classic worker (which pdf.js' workerSrc default
  // does) throws "Unexpected token 'export'" and silently falls back to a
  // fragile main-thread "fake worker". Creating the worker explicitly with
  // { type: 'module' } and handing it to pdf.js via workerPort fixes that.
  var pdfWorkerPort = null;

  async function extractPdf(file) {
    var pdfjs = await import('/vendor/pdf.min.mjs');
    try {
      if (!pdfWorkerPort) {
        pdfWorkerPort = new Worker('/vendor/pdf.worker.min.mjs', { type: 'module' });
      }
      pdfjs.GlobalWorkerOptions.workerPort = pdfWorkerPort;
    } catch (e) {
      // Worker construction failed → let pdf.js use its own fallback.
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
    }

    var data = await file.arrayBuffer();
    var doc;
    try {
      doc = await pdfjs.getDocument({ data: data }).promise;
    } catch (e) {
      var nm = (e && e.name) || '';
      if (nm === 'PasswordException') throw new Error('PDF được đặt mật khẩu/mã hoá, không đọc được.');
      if (nm === 'InvalidPDFException') throw new Error('Tệp PDF hỏng hoặc không hợp lệ.');
      throw e;
    }

    var pageCount = Math.min(doc.numPages, MAX_PDF_PAGES);
    var pages = [];
    for (var i = 1; i <= pageCount; i++) {
      var page = await doc.getPage(i);
      var tc = await page.getTextContent();
      pages.push(tc.items.map(function (it) { return it.str; }).join(' '));
    }
    var text = pages.join('\n').trim();
    if (!text) {
      throw new Error('PDF không có lớp văn bản (có thể là ảnh scan) — không trích được chữ.');
    }
    return text;
  }

  async function parseFile(file) {
    if (!file) {
      throw new Error('Không có tệp');
    }

    var size = Number(file.size) || 0;
    if (size > MAX_FILE_BYTES) {
      throw new Error('File quá lớn (tối đa 5MB)');
    }

    var ext = getExt(file.name);
    var mime = (file.type || '').toLowerCase();

    var isPdf = ext === 'pdf' || mime === 'application/pdf';
    var isText = TEXT_EXTS.indexOf(ext) !== -1 || isTextMime(mime);

    var rawText;
    var kind;

    if (isPdf) {
      try {
        rawText = await extractPdf(file);
      } catch (e) {
        var msg = (e && e.message) ? e.message : String(e);
        throw new Error('Không đọc được PDF: ' + msg);
      }
      kind = 'pdf';
    } else if (isText) {
      rawText = await file.text();
      // CSV is kept as-is (the model can read CSV text); flag its kind separately.
      kind = ext === 'csv' ? 'csv' : 'text';
    } else {
      throw new Error('Định dạng không hỗ trợ: ' + (ext || mime || 'unknown'));
    }

    var capped = cap(rawText);
    return {
      name: file.name,
      kind: kind,
      text: capped.text,
      chars: capped.text.length,
      truncated: capped.truncated,
    };
  }

  async function fetchUrl(url) {
    var res;
    try {
      res = await fetch('/api/fetch-url', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: url }),
      });
    } catch (e) {
      var netMsg = (e && e.message) ? e.message : String(e);
      throw new Error('Không tải được URL: ' + netMsg);
    }

    var json;
    try {
      json = await res.json();
    } catch (e) {
      json = null;
    }

    if (!res.ok) {
      throw new Error((json && json.error) || ('HTTP ' + res.status));
    }
    if (!json) {
      throw new Error('HTTP ' + res.status);
    }

    // Truncate again client-side in case the server cap differs from MAX_CHARS.
    var capped = cap(json.text);
    return {
      title: json.title,
      text: capped.text,
      url: json.url,
      // truncated if the server truncated OR we truncated further here.
      truncated: Boolean(json.truncated) || capped.truncated,
    };
  }

  window.LAAMChatIngest = {
    parseFile: parseFile,
    fetchUrl: fetchUrl,
    MAX_CHARS: MAX_CHARS,
  };
})();
