/*
 * Notice reader. Pulls the five notice fields out of a text or PDF file
 * with pattern matching, no AI. It only copies text that sits under a
 * recognizable label or heading. Anything it cannot find stays blank for
 * the user to type.
 *
 * PDFs need a text layer (a PDF made on a computer, not a scan or photo).
 * pdf.js loads from cdnjs only when a PDF is chosen.
 */
(function (root) {
  var PDFJS = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
  var PDFJS_WORKER = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

  var MONTHS = ["january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december"];

  // Lines kept as section stops even though they carry no field.
  var STOP = /^(sincerely|questions?|contact( us)?|enclosures?|cc|member|patient|provider|claim|reference|notice of|requesting|plan type|important information)\b/i;

  function toIso(y, m, d) {
    var yy = parseInt(y, 10), mm = parseInt(m, 10), dd = parseInt(d, 10);
    if (!(yy > 1900 && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31)) return "";
    return yy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  }

  function findDate(text) {
    var m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (m) return toIso(m[1], m[2], m[3]);
    m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    if (m) return toIso(m[3], m[1], m[2]);
    m = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})\b/i);
    if (m) return toIso(m[3], MONTHS.indexOf(m[1].toLowerCase()) + 1, m[2]);
    return "";
  }

  // What a heading label is about. Notices word headings many ways, so
  // this matches on key words, not exact phrases.
  function classify(label) {
    var l = label.toLowerCase().replace(/\s+/g, " ").trim();
    if (/^(plan|plan name|health plan|health plan name|insurance plan|insurer|issuer|from|plan\/product|product)$/.test(l)) return "planName";
    if (/\bdate\b/.test(l)) return /service|birth|admission|request|surgery|discharge|stay/.test(l) ? "other" : "date";
    if (/reason|rationale|\bwhy\b|basis for|explanation of|our decision|clinical (summary|findings)/.test(l)) return "reason";
    if (/appeal|disagree|what (you can|to) do|next steps|your rights?\b/.test(l)) return "instructions";
    if (STOP.test(l)) return "stop";
    if (/^(re|subject|regarding)$|\bservices?\b|procedure|\bitem\b|treatment requested|requested (care|admission|treatment)|care (denied|requested)|what was denied/.test(l) &&
        !/member services|customer services/.test(l)) return "service";
    return "other";
  }

  // A heading line: "Label: text" with a short label, or a short line in
  // capitals or Title Case with no end punctuation.
  function headingOf(line) {
    var m = line.match(/^([A-Za-z][A-Za-z ,'()\/&-]{0,60}?)\s*:\s*(.*)$/);
    if (m && m[1].split(/\s+/).length <= 7) return { label: m[1], rest: m[2].trim() };
    if (line.length > 70 || /[.,;]$/.test(line) || line.split(/\s+/).length > 9) return null;
    var letters = line.replace(/[^A-Za-z]/g, "");
    if (letters.length >= 4 && letters === letters.toUpperCase()) return { label: line, rest: "" };
    var words = line.split(/\s+/).filter(function (w) { return /^[A-Za-z]{4,}/.test(w); });
    var caps = words.filter(function (w) { return /^[A-Z]/.test(w); });
    if (words.length && caps.length / words.length >= 0.6 && classify(line) !== "other") return { label: line, rest: "" };
    return null;
  }

  // Join wrapped lines into one paragraph. "3-" + "day" stays "3-day".
  function joinLines(parts) {
    var out = "";
    parts.forEach(function (p) {
      if (!p) return;
      if (/[A-Za-z0-9]-$/.test(out) && /^[A-Za-z0-9]/.test(p)) out += p;
      else out += (out ? " " : "") + p;
    });
    return out.replace(/\s+/g, " ").trim();
  }

  function squashAll(t) { return t.toLowerCase().replace(/[^a-z0-9]/g, ""); }

  // opts.knownPlans: plan names the app offers. One named anywhere in the
  // notice wins over a letterhead line.
  function parseNoticeText(text, opts) {
    var out = { planName: "", service: "", noticeDate: "", reason: "", instructions: "" };
    // NFKC turns ligature characters (the single "fi" glyph) back into letters.
    var src = String(text || "").normalize ? String(text || "").normalize("NFKC") : String(text || "");
    var lines = src.replace(/\r/g, "").split("\n");
    var cur = null;
    var MAX = 1500;
    function finish() {
      if (cur && !out[cur.kind]) out[cur.kind] = joinLines(cur.parts).slice(0, MAX).trim();
      cur = null;
    }

    lines.forEach(function (raw) {
      var t = raw.trim();
      if (!t) { if (cur) cur.blank++; return; }
      if (t.length < 60 && /^(sincerely|regards|respectfully|best regards|questions\b|if you have (any )?questions)/i.test(t)) { finish(); return; }
      var h = headingOf(t);
      var kind = h ? classify(h.label) : null;
      if (h && kind === "other" && !/:/.test(t)) { h = null; kind = null; }
      if (h) {
        if (kind === "reason" || kind === "instructions") {
          if (cur && cur.kind === kind) {
            // A sub heading inside the same section, e.g. "Expedited appeals".
            cur.parts.push(h.label.replace(/[:\s]+$/, "") + ":");
            if (h.rest) cur.parts.push(h.rest);
            cur.blank = 0;
            return;
          }
          finish();
          if (!out[kind]) { cur = { kind: kind, parts: h.rest ? [h.rest] : [], blank: 0 }; }
          return;
        }
        finish();
        if (kind === "date" && !out.noticeDate) out.noticeDate = findDate(h.rest || t);
        else if (kind === "planName" && !out.planName && h.rest) out.planName = h.rest;
        else if (kind === "service" && !out.service && h.rest) out.service = h.rest;
        return;
      }
      if (cur) {
        if (cur.blank >= 2) { finish(); return; }
        cur.parts.push(t);
        cur.blank = 0;
      }
    });
    finish();

    // A plan the app knows, named anywhere in the notice.
    var known = (opts && opts.knownPlans) || [];
    var hay = squashAll(src);
    for (var k = 0; k < known.length; k++) {
      if (known[k] && hay.indexOf(squashAll(known[k])) !== -1) { out.planName = known[k]; break; }
    }
    // Plan name fallback: an early line that looks like a plan name.
    if (!out.planName) {
      for (var i = 0; i < Math.min(lines.length, 8); i++) {
        var l = lines[i].trim();
        if (l && l.length < 90 && /\b(health|plan|insurance|care|fund|medicare|medicaid|benefits)\b/i.test(l) &&
            l.indexOf(":") === -1 && !/notice|denial|dear/i.test(l)) { out.planName = l; break; }
      }
    }
    // Date fallback: first date in the first lines of the notice.
    if (!out.noticeDate) out.noticeDate = findDate(lines.slice(0, 12).join("\n"));
    return out;
  }

  // ---------- files ----------
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject({ code: "pdf_reader" }); };
      document.head.appendChild(s);
    });
  }

  function loadPdfJs() {
    if (root.pdfjsLib) return Promise.resolve(root.pdfjsLib);
    return loadScript(PDFJS).then(function () {
      var lib = root.pdfjsLib;
      try {
        var blob = new Blob(["importScripts(" + JSON.stringify(PDFJS_WORKER) + ");"], { type: "text/javascript" });
        lib.GlobalWorkerOptions.workerPort = new Worker(URL.createObjectURL(blob));
      } catch (e) {
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
      }
      return lib;
    });
  }

  // Rebuild a page's lines from text pieces and their positions. A space
  // goes in only where the PDF leaves a gap, so a word split at a
  // ligature ("bene" + "fi" + "t") comes back whole.
  function pageText(content) {
    var out = "", prev = null;
    content.items.forEach(function (it) {
      if (typeof it.str !== "string") return;
      var tr = it.transform || [1, 0, 0, 1, 0, 0];
      var x = tr[4], y = tr[5], size = Math.abs(tr[3]) || it.height || 10;
      if (prev && !prev.eol) {
        if (Math.abs(y - prev.y) > size * 0.5) out += "\n";
        else if (x - prev.end > size * 0.15 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += " ";
      }
      out += it.str;
      if (it.hasEOL) out += "\n";
      prev = { y: y, end: x + (it.width || 0), eol: Boolean(it.hasEOL) };
    });
    return out;
  }

  function pdfText(file) {
    return loadPdfJs().then(function (lib) {
      return file.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; });
    }).then(function (pdf) {
      var pages = [];
      for (var i = 1; i <= Math.min(pdf.numPages, 10); i++) pages.push(i);
      return Promise.all(pages.map(function (n) {
        return pdf.getPage(n).then(function (p) { return p.getTextContent(); });
      }));
    }).then(function (contents) {
      return contents.map(pageText).join("\n\n");
    });
  }

  // ---------- Word (.docx) ----------
  // A .docx is a zip. Find word/document.xml, inflate it with the browser's
  // built in DecompressionStream, then pull the text out of the XML.
  function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") return Promise.reject({ code: "docx_browser" });
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Response(stream).arrayBuffer().then(function (b) { return new Uint8Array(b); });
  }

  function unzipEntry(buf, wanted) {
    var bytes = new Uint8Array(buf);
    var view = new DataView(buf);
    // End of central directory record is in the last 64 KB.
    var eocd = -1;
    for (var i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject({ code: "docx_bad" });
    var count = view.getUint16(eocd + 10, true);
    var p = view.getUint32(eocd + 16, true);
    for (var n = 0; n < count; n++) {
      if (view.getUint32(p, true) !== 0x02014b50) break;
      var method = view.getUint16(p + 10, true);
      var size = view.getUint32(p + 20, true);
      var nameLen = view.getUint16(p + 28, true);
      var extraLen = view.getUint16(p + 30, true);
      var commentLen = view.getUint16(p + 32, true);
      var local = view.getUint32(p + 42, true);
      var name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
      if (name === wanted) {
        var start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        var data = bytes.subarray(start, start + size);
        if (method === 0) return Promise.resolve(data);
        if (method === 8) return inflateRaw(data);
        return Promise.reject({ code: "docx_bad" });
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return Promise.reject({ code: "docx_bad" });
  }

  function decodeXml(s) {
    return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(+d); })
      .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
      .replace(/&amp;/g, "&");
  }

  // One line per Word paragraph. Tabs and line breaks kept.
  function docxXmlToText(xml) {
    return xml.split(/<\/w:p>/).map(function (para) {
      var out = "";
      var re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g;
      var m;
      while ((m = re.exec(para))) {
        if (m[1] !== undefined) out += decodeXml(m[1]);
        else out += m[0] === "<w:tab/>" ? "\t" : "\n";
      }
      return out;
    }).join("\n");
  }

  function docxText(file) {
    return file.arrayBuffer().then(function (buf) {
      return unzipEntry(buf, "word/document.xml");
    }).then(function (data) {
      return docxXmlToText(new TextDecoder().decode(data));
    });
  }

  function isDocx(f) {
    return f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || /\.docx$/i.test(f.name);
  }
  function isOldDoc(f) { return f.type === "application/msword" || /\.doc$/i.test(f.name); }

  function isPdf(f) { return f.type === "application/pdf" || /\.pdf$/i.test(f.name); }
  function isText(f) { return f.type === "text/plain" || /\.txt$/i.test(f.name); }
  function isImage(f) { return /^image\//.test(f.type) || /\.(png|jpe?g|gif|webp|heic)$/i.test(f.name); }

  function readFile(file, opts) {
    if (isImage(file)) return Promise.reject({ code: "image" });
    if (isOldDoc(file)) return Promise.reject({ code: "old_doc" });
    var get = isDocx(file) ? docxText(file) : isPdf(file) ? pdfText(file) : isText(file) ? file.text() : Promise.reject({ code: "type" });
    return get.then(function (text) {
      if (!text || text.replace(/\s/g, "").length < 20) throw { code: "no_text" };
      return parseNoticeText(text, opts);
    });
  }

  function errorMessage(e) {
    var map = {
      image: "Photos and screenshots cannot be read without AI. Type the details below, or upload a PDF or text file.",
      type: "That file type is not supported. Upload a Word (.docx), PDF or .txt file, or type the details.",
      old_doc: "This is an older Word file (.doc). In Word, choose File, Save As, Word Document (.docx), then upload that.",
      docx_bad: "Could not open that Word file. Try saving it again as .docx, or as PDF, then upload it.",
      docx_browser: "This browser cannot open Word files. Update your browser, or save the notice as PDF and upload that.",
      no_text: "No text found in that file. It may be a scan or photo. Type the details below.",
      pdf_reader: "Could not load the PDF reader. Check your connection, or type the details below."
    };
    return map[e && e.code] || "Could not read that file. Type the details below.";
  }

  // An example notice as a text file, so people can try the upload.
  function sampleToText(s, planLabel) {
    var L = [];
    if (s.planName) L.push(s.planName);
    L.push("EXAMPLE NOTICE. NOT A REAL LETTER.");
    L.push("");
    if (s.noticeDate) L.push("Date: " + s.noticeDate);
    L.push("Plan type: " + planLabel);
    L.push("");
    L.push("NOTICE OF DENIAL OF COVERAGE");
    L.push("");
    if (s.service) L.push("Service denied: " + s.service);
    L.push("");
    L.push("Reason for our decision:");
    L.push(s.reason || "");
    L.push("");
    if (s.instructions) {
      L.push("Your right to appeal:");
      L.push(s.instructions);
      L.push("");
    }
    L.push("Questions: call the number on your member card.");
    return L.join("\n");
  }

  var api = {
    parseNoticeText: parseNoticeText,
    docxXmlToText: docxXmlToText,
    unzipEntry: unzipEntry,
    readFile: readFile,
    errorMessage: errorMessage,
    sampleToText: sampleToText,
    findDate: findDate,
    pageText: pageText
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealReader = api;
})(typeof window !== "undefined" ? window : this);
