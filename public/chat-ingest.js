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

  // i18n helper (errors are thrown lazily, so they read in the active language).
  var T = function (k, v) { return window.LAAMI18n ? window.LAAMI18n.t(k, v) : k; };

  // ~8K tokens worth of characters. All ingested text is capped to this length.
  var MAX_CHARS = 32000;

  // 12 MB hard cap on uploaded files (photos can be large).
  var MAX_FILE_BYTES = 12 * 1024 * 1024;

  // PDF page cap to keep extraction bounded.
  var MAX_PDF_PAGES = 50;

  // For a SCANNED pdf we OCR rendered pages — bounded to keep it responsive.
  var MAX_OCR_PAGES = 8;
  // If a PDF yields fewer real characters than this, treat it as a scan → OCR.
  var MIN_PDF_TEXT = 24;

  // Extensions / mime types we treat as plain text.
  var TEXT_EXTS = ['txt', 'md', 'csv', 'json', 'log'];
  // Image extensions we OCR.
  var IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif', 'tif', 'tiff'];
  function isImage(ext, mime) { return IMAGE_EXTS.indexOf(ext) !== -1 || /^image\//i.test(mime || ''); }

  // ---- OCR (server tesseract via /api/ocr) -------------------------------
  function fileToDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error(T('chat.ocrReadFail'))); };
      fr.readAsDataURL(file);
    });
  }
  async function ocrDataUrl(dataUrl) {
    var r = await fetch('/api/ocr', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) });
    var j = null; try { j = await r.json(); } catch (e) {}
    if (!r.ok) throw new Error((j && j.error) || T('chat.ocrFail'));
    return (j && typeof j.text === 'string') ? j.text : '';
  }
  // Render scanned PDF pages to PNG (pdf.js) and OCR each — needs a canvas.
  async function ocrPdfPages(doc, onProgress) {
    var capPages = Math.min(doc.numPages, MAX_OCR_PAGES);
    var out = [];
    for (var i = 1; i <= capPages; i++) {
      if (onProgress) onProgress(T('chat.ocrPdfPage', { i: i, n: capPages }));
      var page = await doc.getPage(i);
      var viewport = page.getViewport({ scale: 2 }); // upscale for OCR accuracy
      var canvas = document.createElement('canvas');
      canvas.width = Math.min(viewport.width, 2200);
      canvas.height = Math.round(canvas.width * (viewport.height / viewport.width));
      var scale = canvas.width / viewport.width;
      var ctx = canvas.getContext('2d');
      await page.render({ canvasContext: ctx, viewport: page.getViewport({ scale: 2 * scale }) }).promise;
      try { var t = await ocrDataUrl(canvas.toDataURL('image/png')); if (t && t.trim()) out.push(t.trim()); } catch (e) { /* skip bad page */ }
    }
    return out.join('\n\n');
  }

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

  async function extractPdf(file, onProgress) {
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
      if (nm === 'PasswordException') throw new Error(T('chat.ingPdfPassword'));
      if (nm === 'InvalidPDFException') throw new Error(T('chat.ingPdfCorrupt'));
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
    // A SCANNED pdf has little/no embedded text → OCR the rendered pages.
    if (text.replace(/\s/g, '').length >= MIN_PDF_TEXT) return text;
    if (onProgress) onProgress(T('chat.ocrPdfScan'));
    var ocrText = (await ocrPdfPages(doc, onProgress)).trim();
    if (!ocrText) throw new Error(text ? text : T('chat.ocrPdfEmpty'));
    return ocrText;
  }

  async function parseFile(file, onProgress) {
    if (!file) {
      throw new Error(T('chat.ingNoFile'));
    }

    var size = Number(file.size) || 0;
    if (size > MAX_FILE_BYTES) {
      throw new Error(T('chat.ingTooLarge'));
    }

    var ext = getExt(file.name);
    var mime = (file.type || '').toLowerCase();

    var isPdf = ext === 'pdf' || mime === 'application/pdf';
    var isText = TEXT_EXTS.indexOf(ext) !== -1 || isTextMime(mime);
    var isImg = isImage(ext, mime);

    var rawText;
    var kind;

    if (isPdf) {
      try {
        rawText = await extractPdf(file, onProgress);
      } catch (e) {
        var msg = (e && e.message) ? e.message : String(e);
        throw new Error(T('chat.ingPdfFail', { msg: msg }));
      }
      kind = 'pdf';
    } else if (isImg) {
      // Image → OCR (vie+eng+chi_sim) so the text-only model can read it.
      if (onProgress) onProgress(T('chat.ocrRunning'));
      var durl = await fileToDataURL(file);
      rawText = (await ocrDataUrl(durl)).trim();
      if (!rawText) throw new Error(T('chat.ocrImageEmpty'));
      kind = 'image';
    } else if (isText) {
      rawText = await file.text();
      // CSV is kept as-is (the model can read CSV text); flag its kind separately.
      kind = ext === 'csv' ? 'csv' : 'text';
    } else {
      throw new Error(T('chat.ingUnsupported', { fmt: (ext || mime || 'unknown') }));
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
      throw new Error(T('chat.ingUrlFail', { msg: netMsg }));
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
