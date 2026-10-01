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

  var HEADINGS = {
    reason: /^(reason(s)? for (the |this |our )?(denial|decision)|why (we|did we) den(y|ied)[^:]*|why your (request|claim|stay) was denied|reason|basis for (our|this|the) decision|our decision)\s*:?\s*/i,
    instructions: /^(how to (file an |request an |ask for an )?appeal|your (right|rights) to (an )?appeal|appeal rights|what (you can do|to do) if you disagree|if you disagree[^:]*|to appeal)\s*:?\s*/i,
    planName: /^(plan( name)?|health plan|insurance plan|insurer|from)\s*:\s*/i,
    service: /^(service(s)?( denied| requested)?|item or service|care denied|denied service|what was denied|re|subject|regarding)\s*:\s*/i,
    date: /^(date( of (this )?notice)?|notice date|date issued|date mailed)\s*:\s*/i
  };
  var ANY_HEADING = /^[A-Z][A-Za-z ,'()\/-]{2,60}:\s*$|^(member|patient|provider|claim|reference|important|questions|contact|sincerely|enclosure)/i;

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

  // Text under a heading: same line after the colon, plus following lines
  // until a blank line or another heading.
  function section(lines, i, headingRe) {
    var first = lines[i].replace(headingRe, "").trim();
    var out = first ? [first] : [];
    for (var j = i + 1; j < lines.length; j++) {
      var l = lines[j].trim();
      if (!l) { if (out.length) break; else continue; }
      if (ANY_HEADING.test(l) || matchesHeading(l)) break;
      out.push(l);
    }
    return out.join(" ").replace(/\s+/g, " ").trim();
  }

  function matchesHeading(line) {
    return Object.keys(HEADINGS).some(function (k) { return HEADINGS[k].test(line) && /:|^[A-Z][^.]*$/.test(line); });
  }

  function parseNoticeText(text) {
    var out = { planName: "", service: "", noticeDate: "", reason: "", instructions: "" };
    var lines = String(text || "").replace(/\r/g, "").split("\n");

    lines.forEach(function (raw, i) {
      var l = raw.trim();
      if (!l) return;
      if (!out.reason && HEADINGS.reason.test(l)) out.reason = section(lines, i, HEADINGS.reason);
      else if (!out.instructions && HEADINGS.instructions.test(l)) out.instructions = section(lines, i, HEADINGS.instructions);
      else if (!out.planName && HEADINGS.planName.test(l)) out.planName = l.replace(HEADINGS.planName, "").trim();
      else if (!out.service && HEADINGS.service.test(l)) out.service = l.replace(HEADINGS.service, "").trim();
      else if (!out.noticeDate && HEADINGS.date.test(l)) out.noticeDate = findDate(l);
    });

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
      return contents.map(function (c) {
        return c.items.map(function (it) { return it.str + (it.hasEOL ? "\n" : " "); }).join("");
      }).join("\n\n");
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

  function readFile(file) {
    if (isImage(file)) return Promise.reject({ code: "image" });
    if (isOldDoc(file)) return Promise.reject({ code: "old_doc" });
    var get = isDocx(file) ? docxText(file) : isPdf(file) ? pdfText(file) : isText(file) ? file.text() : Promise.reject({ code: "type" });
    return get.then(function (text) {
      if (!text || text.replace(/\s/g, "").length < 20) throw { code: "no_text" };
      return parseNoticeText(text);
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

  // A synthetic notice as a text file, so testers can try the upload.
  function sampleToText(s, planLabel) {
    var L = [];
    if (s.planName) L.push(s.planName);
    L.push("SYNTHETIC NOTICE FOR TESTING. NOT A REAL LETTER.");
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
    findDate: findDate
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealReader = api;
})(typeof window !== "undefined" ? window : this);
