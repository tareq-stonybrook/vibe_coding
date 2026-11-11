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
    if (new Date(Date.UTC(yy, mm - 1, dd)).getUTCDate() !== dd) return "";
    return yy + "-" + String(mm).padStart(2, "0") + "-" + String(dd).padStart(2, "0");
  }

  var MONTH_RE = "(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
  function monthNum(name) {
    var k = name.toLowerCase().slice(0, 3);
    for (var i = 0; i < MONTHS.length; i++) if (MONTHS[i].slice(0, 3) === k) return i + 1;
    return 0;
  }

  // The date that comes first in the text, whatever way it is written.
  function findDate(text) {
    var found = [];
    function add(m, iso) { if (m && iso) found.push({ at: m.index, iso: iso }); }
    var m = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    add(m, m && toIso(m[1], m[2], m[3]));
    m = text.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/);
    add(m, m && toIso(m[3].length === 2 ? "20" + m[3] : m[3], m[1], m[2]));
    m = text.match(new RegExp("\\b" + MONTH_RE + "\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b", "i"));
    add(m, m && toIso(m[3], monthNum(m[1]), m[2]));
    m = text.match(new RegExp("\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+" + MONTH_RE + "\\.?,?\\s+(\\d{4})\\b", "i"));
    add(m, m && toIso(m[3], monthNum(m[2]), m[1]));
    found.sort(function (x, y) { return x.at - y.at; });
    return found.length ? found[0].iso : "";
  }

  // Dates that are not the date of the notice.
  var NOT_NOTICE_DATE = /services?|birth|\bdob\b|admi(ssion|t)|request|surgery|procedure|discharge|stay|effective|received|deadline|\bdue\b|appeal|expir/i;

  // Labels that name a phone line or office, not the care that was denied:
  // "Customer Service", "Member Services", "Service Line", "Services Phone".
  var CONTACT_LABEL = /\b(members?|customers?|providers?|clients?|patients?|enrollees?|participants?|subscribers?)\s+services?\b|\b(phone|telephone|tel|number|hotline|line|center|centre|fax|e-?mail|website|hours|tty|tdd|call|contact|department|dept|desk|office|representative|rep)\b/;

  // Labels for where the care happens: "Service Setting", "Place of
  // Service", "Level of Care", "Service Type".
  var SETTING_LABEL = /setting|place of (service|care)|level of care|type of (service|care|admission|stay)|(service|care|admission|stay) type/;

  // What a heading label is about. Notices word headings many ways, so
  // this matches on key words, not exact phrases.
  function classify(label) {
    var l = label.toLowerCase().replace(/\s+/g, " ").replace(/[?:\s]+$/, "").trim();
    if (/^(plan|plan name|health plan|health plan name|insurance plan|insurer|issuer|from|plan\/product|product)$/.test(l)) return "planName";
    if (/\bdates?\b/.test(l)) return NOT_NOTICE_DATE.test(l) ? "other" : "date";
    if (/reason|rationale|\bwhy\b|basis for|explanation of|our decision|clinical (summary|findings)/.test(l)) return "reason";
    if (/appeal|disagree|what (you can|can you|to) do|next steps|your rights?\b/.test(l)) return "instructions";
    if (STOP.test(l)) return "stop";
    if (CONTACT_LABEL.test(l)) return "other";
    if (SETTING_LABEL.test(l)) return "setting";
    if (/^(re|subject|regarding)$|\bservices?\b|procedure|\bitem\b|treatment requested|requested (care|admission|treatment)|(care|admission|treatment) (denied|requested)|what (was|we) denied/.test(l)) return "service";
    return "other";
  }

  // A value that is a phone number, email, web address or a notice title
  // is never a service name, whatever label it sits under.
  function looksLikeService(v) {
    var s = String(v || "").trim();
    if (/has reviewed|has completed|based on|following service|clinical review against|(?:clinical|authorization) review|review requested by/i.test(s)) return false;
    if (/^(requested|setting|determination|diagnosis(?: \/ codes)?|requested service \/ procedure)$/i.test(s)) return false;
    if (/\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b|@|https?:|www\./i.test(s)) return false;
    if (/^(denied|denial|not approved|not covered|n\/?a|none|yes|no|see (below|above|attached))\b/i.test(s)) return false;
    if (/notice of|adverse (benefit )?determination|denial of|your (appeal|rights?)\b/i.test(s)) return false;
    // A sentence from the body of the letter is not a service name.
    if (s.length > 140 || /[.!?]\s+[A-Z]/.test(s) || /^(we|you|this letter|based on)\b/i.test(s)) return false;
    if (/\b(has|have|had) (reviewed|received|determined|decided|denied|completed)\b/i.test(s)) return false;
    if ((s.match(/\(/g) || []).length !== (s.match(/\)/g) || []).length) return false;
    return /[A-Za-z]{3,}/.test(s);
  }

  // Lines that belong to a mailing address, not a heading.
  var ADDRESS_WORD = /\b(department|dept|unit|office|box|suite|floor|street|avenue|attn|attention)\b/i;

  // A heading line: "Label: text" with a short label, a short question
  // ("Why did we deny this request?"), or a short line in capitals, Title
  // Case or plain words that names a field. ctx says what came before it.
  function headingOf(line, ctx) {
    var m = line.match(/^([A-Za-z][A-Za-z ,'()\/&-]{0,60}?)\s*:\s*(.*)$/);
    // "Decision (Level of Care: Not Necessary)" is not a label and a value.
    var open = m && (m[1].match(/\(/g) || []).length !== (m[1].match(/\)/g) || []).length;
    if (m && !open && m[1].split(/\s+/).length <= 7) return { label: m[1], rest: m[2].trim() };
    var count = line.split(/\s+/).length;
    if (/\?$/.test(line) && count <= 12 && /^(reason|instructions)$/.test(classify(line))) return { label: line, rest: "" };
    if (line.length > 70 || /[.,;?]$/.test(line) || count > 9) return null;
    // The line after "mail your appeal to:" is the address, not a heading.
    if ((ctx && ctx.afterColon) || ADDRESS_WORD.test(line)) return null;
    var letters = line.replace(/[^A-Za-z]/g, "");
    var kind = classify(line);
    // A title such as "Denial of Inpatient Hospital Services" names no
    // field. Only a line like "Service Denied" waits for a value below it.
    var title = (kind === "service" || kind === "setting") && !/denied|requested|description|^services?$|^procedure$|setting|level of care/i.test(line);
    if (letters.length >= 4 && letters === letters.toUpperCase()) return { label: line, rest: "", title: title };
    if (kind === "other") return null;
    var words = line.split(/\s+/).filter(function (w) { return /^[A-Za-z]{4,}/.test(w); });
    var caps = words.filter(function (w) { return /^[A-Z]/.test(w); });
    if (words.length && caps.length / words.length >= 0.6) return { label: line, rest: "", title: title };
    // Plain words such as "Why we denied it" or "Date of notice", but only
    // at the start of a block, so a wrapped line of a paragraph never counts.
    if (/^[A-Z]/.test(line) && count <= 7 && (!ctx || ctx.fresh)) {
      if (title) return null;
      return { label: line, rest: "", plain: true };
    }
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

  // ---------- fallbacks for notices written as a plain letter ----------
  var CARE = /inpatient|hospital|admission|admit|\bstay\b|surg|procedure|therapy|treatment|rehab|\bcare\b|replacement|infusion|ectomy|transplant|delivery|fusion/i;
  var NOT_CARE = /appeal|review|hearing|information|records|cop(y|ies)|grievance|extension|interpreter|documents?|decision/i;
  var SVC_END = "(?=\\s+(?:has|have|had|was|is|are|were|cannot|could|will|would|did|does)\\b|\\s+because\\b|\\s+at\\s+[A-Z]|\\s+on\\s+\\d|\\s+on\\s+[A-Z][a-z]+\\s+\\d|\\s+from\\s|\\s+by\\s|\\s+(?:requested|ordered|that|which)\\b|[.,;:]|$)";
  var SVC_PATTERNS = [
    "\\brequest(?:ed|ing)?(?:\\s+from\\s+.{1,60}?)?(?:\\s+(?:prior\\s+|pre-?)?(?:authorization|approval|coverage))?\\s+(?:for|of)\\s+(.+?)" + SVC_END,
    "\\b(?:denied|deny|denying|not approved?|cannot approve|unable to approve|will not cover|cannot cover)\\s+(?:(?:coverage|payment|authorization|approval|the request|your request)\\s+(?:for|of)\\s+)?(.+?)" + SVC_END,
    "\\bdenial of\\s+(?:coverage|payment|authorization|approval|the request|your request)\\s+(?:for|of)\\s+(.+?)" + SVC_END,
    "\\b(?:coverage|authorization|approval|payment)\\s+(?:for|of)\\s+(.+?)" + SVC_END
  ];

  // The denied care named inside a sentence, such as "your request for
  // inpatient admission for surgery has been denied". Copied as written.
  function proseService(flat) {
    for (var i = 0; i < SVC_PATTERNS.length; i++) {
      var re = new RegExp(SVC_PATTERNS[i], "gi"), m;
      while ((m = re.exec(flat))) {
        var v = m[1].trim();
        var before;
        do { before = v; v = v.replace(/^(?:a|an|the|your|his|her|their)\s+/i, ""); } while (v !== before);
        if (v.length < 4 || v.length > 160) continue;
        if (/^(this|that|it|these|those|services?|requests?|care)\b/i.test(v) && v.split(/\s+/).length < 3) continue;
        if (!CARE.test(v) || NOT_CARE.test(v) || !looksLikeService(v)) continue;
        return v.charAt(0).toUpperCase() + v.slice(1);
      }
    }
    return "";
  }

  // PDFs often split a word at an "fi" or "fl" ligature: "bene fi t",
  // "Health fi rst". Join the pieces again. "the fi rst" keeps its space.
  var WHOLE_WORD = /^(a|an|the|of|in|on|at|to|by|for|from|with|and|or|but|if|as|is|are|was|were|be|been|not|no|any|all|this|that|these|those|your|our|my|his|her|its|their|we|you|it|will|can|may|must|should|has|have|had|within|after|before|during|per|each|every|one|two|three|four|five|six|new|next|last|more|into|than|then|also)$/i;
  var STARTS_WORD = /^(first|final|finally|file|filed|files|filing|fill|filled|find|finding|findings|fine|finish|fiscal|fit|five|fix|fixed|field|fifth|fifteen|fifty|figure|financial|finance|flat|flexible|floor|flow|fluid|flu|fly|flag|flare)$/i;
  function fixLigatures(t) {
    return t.replace(/([A-Za-z]+) (ffi|ffl|fi|fl|ff) ([a-z]+)/g, function (m, left, lig, right) {
      return WHOLE_WORD.test(left) && STARTS_WORD.test(lig + right) ? left + " " + lig + right : left + lig + right;
    }).replace(/(^|[^A-Za-z])(ffi|ffl|fi|fl|ff) ([a-z]+)/g, "$1$2$3")
      // "3- day" from a line that wrapped at the hyphen.
      .replace(/(\d)- ([a-z])/g, "$1-$2");
  }

  // A heading in the middle of a line, which happens when a PDF gives its
  // text without the line breaks seen on the page. Put it on its own line.
  function splitHeadings(line) {
    if (line.length < 60) return [line];
    var out = [], from = 0, m;
    var re = /(^|[.!?)]\s+|\s)((?:[A-Z][A-Za-z\/&'-]*)(?: [A-Za-z\/&'-]+){0,5})(:\s|\s+(?=[A-Z][a-z]))/g;
    while ((m = re.exec(line))) {
      var words = m[2].split(" "), label = "";
      // The shortest run of words before the colon that names a field.
      for (var i = words.length - 1; i >= 0; i--) {
        var tail = words.slice(i).join(" ");
        if (/^[A-Z]/.test(tail) && /^(reason|instructions|date|service|setting)$/.test(classify(tail)) &&
            classify(tail) === classify(m[2])) { label = tail; break; }
      }
      var colon = /:/.test(m[3]);
      var caps = m[2].replace(/[^A-Za-z]/g, "");
      // No colon: only a heading in capitals counts, such as "YOUR RIGHT TO APPEAL".
      if (!colon && (caps.length < 8 || caps !== caps.toUpperCase() || classify(m[2]) === "other")) { re.lastIndex = m.index + 1; continue; }
      if (!colon) label = m[2];
      if (!label) { re.lastIndex = m.index + 1; continue; }
      var at = m.index + m[0].length - m[3].length - label.length;
      if (at <= from) continue;
      out.push(line.slice(from, at).trim());
      if (!colon) { out.push(label); from = at + label.length; }
      else from = at;
    }
    out.push(line.slice(from).trim());
    return out.filter(Boolean);
  }

  function sentencesOf(t) { return t.split(/(?<=[.!?])\s+(?=[A-Z])/); }

  // A section with no heading. In a letter with blank lines between
  // paragraphs, the first paragraph that passes the test. Otherwise the
  // first sentence that passes, plus the ones after it up to a stop.
  function proseSection(paras, test, stop, skip) {
    var short = paras.every(function (p) { return p.length <= 600; });
    if (paras.length > 2 && short) {
      for (var i = 0; i < paras.length; i++) {
        if (paras[i] !== skip && test(paras[i])) {
          // "mail your appeal to:" carries on into the address block.
          return /:$/.test(paras[i]) && paras[i + 1] ? paras[i] + " " + paras[i + 1] : paras[i];
        }
      }
      return "";
    }
    var all = sentencesOf(paras.join(" ")), out = [];
    for (var k = 0; k < all.length && out.length < 6; k++) {
      if (!out.length) { if (test(all[k]) && (!skip || skip.indexOf(all[k]) === -1)) out.push(all[k]); }
      else if (stop.test(all[k])) break;
      else out.push(all[k]);
    }
    return out.join(" ");
  }
  function isReasonText(p) {
    return !/^dear\b/i.test(p) && /\bbecause\b|not medically necessary|(does|do|did) not (meet|show|support)|(is|are|was|were) not met/i.test(p);
  }
  function isAppealText(p) {
    return /appeal/i.test(p) && /\b(call|write|mail|send|fax|file|ask|request|submit|days)\b/i.test(p);
  }

  // Where the notice says to send an appeal. Only an address that ends in
  // a state and ZIP code and follows words like "mail your appeal to".
  function findAppealsAddress(src) {
    var zipRe = /\b[A-Z]{2},?\s+\d{5}(?:-\d{4})?\b/g;
    var cueRe = /\bby mail\s*:|\b(?:mail|send|write|submit|return|address(?:ed)?)\b[^.:;]{0,80}?\b(?:to|at)\b\s*:?|\bappeals?\s+(?:mailing\s+)?address\b\s*:?|\bmailing\s+address\b\s*:?/gi;
    var m;
    while ((m = zipRe.exec(src))) {
      var end = m.index + m[0].length;
      var start = Math.max(0, end - 320);
      var win = src.slice(start, end);
      var c, last = null;
      cueRe.lastIndex = 0;
      while ((c = cueRe.exec(win))) last = c;
      if (!last) continue;
      var addr = win.slice(last.index + last[0].length);
      var around = src.slice(Math.max(0, start + last.index - 160), end);
      if (!/appeal|grievance/i.test(around)) continue;
      // One comma between lines, except where a line was only wrapped.
      addr = addr.split("\n").map(function (x) { return x.trim(); }).filter(Boolean).reduce(function (all, x) {
        if (!all) return x;
        return all + (/,$/.test(all) || /\b(and|of|for|&)$/i.test(all) || /^[a-z]/.test(x) ? " " : ", ") + x;
      }, "").replace(/\s+/g, " ").replace(/^[\s,:]+/, "")
        .replace(/^(?:us\s+at|the following address|this address|the address below|the address)\s*:?\s*/i, "")
        .replace(/^the\s+/i, "").trim();
      if (addr.length < 10 || addr.length > 200 || /\b(you|your|call|within|appeal this)\b/i.test(addr)) continue;
      return addr;
    }
    return "";
  }

  // opts.knownPlans: plan names the app offers. One named anywhere in the
  // notice wins over a letterhead line.
  function parseNoticeText(text, opts) {
    var out = { planName: "", service: "", noticeDate: "", reason: "", instructions: "", appealsAddress: "", planGuessed: false };
    // NFKC turns ligature characters (the single "fi" glyph) back into letters.
    var src = String(text || "").normalize ? String(text || "").normalize("NFKC") : String(text || "");
    src = fixLigatures(src);
    var lines = [];
    src.replace(/\r/g, "").split("\n").forEach(function (l) {
      if (!l.trim()) lines.push(l); else splitHeadings(l.trim()).forEach(function (x) { lines.push(x); });
    });
    var cur = null;
    var MAX = 1500;
    var named = [], subject = [], settings = [];
    var pending = null;   // a label alone on its line, waiting for its value
    var last = null;      // the list a service value just went into
    var ctx = { fresh: true, afterColon: false };
    function finish() {
      // The sign off is not part of the section.
      if (cur && !out[cur.kind]) out[cur.kind] = joinLines(cur.parts).replace(/\s(Sincerely|Regards|Respectfully),?\s.*$/, "").slice(0, MAX).trim();
      cur = null;
    }
    function take(kind, label, value) {
      if (kind === "date") { if (!out.noticeDate) out.noticeDate = findDate(value); return; }
      if (kind === "planName") { if (!out.planName) out.planName = value; return; }
      if (!looksLikeService(value)) return;
      last = kind === "setting" ? settings : /^(re|subject|regarding)$/i.test(label.trim()) ? subject : named;
      last.push(value);
    }

    lines.forEach(function (raw) {
      var t = raw.trim();
      if (!t) { if (cur) cur.blank++; ctx.fresh = true; ctx.afterColon = false; return; }
      var here = ctx, wrapped = last;
      last = null;
      ctx = { fresh: /[.?!:]$/.test(t), afterColon: /:$/.test(t) };
      if (t.length < 120 && /^(sincerely|regards|respectfully|best regards|questions\b|if you have (any )?questions)/i.test(t)) { finish(); pending = null; return; }
      var h = headingOf(t, here);
      var kind = h ? classify(h.label) : null;
      if (h && kind === "other" && !/:/.test(t)) { h = null; kind = null; }
      if (h) {
        pending = null;
        ctx.fresh = true;
        if (h.rest) ctx.afterColon = false;
        if (kind === "reason" || kind === "instructions") {
          if (cur && cur.kind === kind) {
            // A sub heading inside the same section, e.g. "Expedited appeals".
            cur.parts.push(h.label.replace(/[:\s]+$/, "") + (/\?$/.test(h.label) ? "" : ":"));
            if (h.rest) cur.parts.push(h.rest);
            cur.blank = 0;
            return;
          }
          finish();
          if (!out[kind]) { cur = { kind: kind, parts: h.rest ? [h.rest] : [], blank: 0 }; }
          return;
        }
        finish();
        if (/^(date|planName|service|setting)$/.test(kind)) {
          if (h.rest) take(kind, h.label, h.rest);
          else if (!h.title) pending = { kind: kind, label: h.label };
        }
        return;
      }
      // A service value that wrapped onto the next line.
      if (wrapped && !pending && !/:/.test(t) && t.length < 80) {
        var v = wrapped[wrapped.length - 1];
        if (/^[a-z(]/.test(t) || /(\b(for|of|and|the|a|an|to|with|after|following|at|in)|[-,&])$/i.test(v)) {
          wrapped[wrapped.length - 1] = joinLines([v, t]);
          last = wrapped;
          return;
        }
      }
      if (pending) {
        take(pending.kind, pending.label, t);
        pending = null;
        ctx.fresh = true;
        return;
      }
      if (cur) {
        if (cur.blank >= 2) { finish(); return; }
        cur.parts.push(t);
        cur.blank = 0;
      }
    });
    finish();

    // Paragraphs of the letter, for anything no heading pointed to.
    var paras = [], buf = [];
    lines.forEach(function (raw) {
      var t = raw.trim();
      // "Label: value" lines and the greeting are not part of a paragraph.
      var label = /^[A-Z][A-Za-z \/&'-]{0,40}:\s+\S/.test(t) || /^dear\b.{0,40}[:,]$/i.test(t) ||
        Boolean(t && headingOf(t, { fresh: true }));
      if (t && !label) buf.push(t);
      else if (buf.length) { paras.push(joinLines(buf)); buf = []; }
    });
    if (buf.length) paras.push(joinLines(buf));
    var END = /^(sincerely|regards|respectfully)\b|if you have (any )?questions/i;
    if (!out.reason) {
      out.reason = proseSection(paras, isReasonText, /appeal|disagree|\bcall\b|you (can|may|have the right)|^(sincerely|regards)\b|questions/i).slice(0, MAX).trim();
    }
    if (!out.instructions) {
      out.instructions = proseSection(paras, isAppealText, END, out.reason).slice(0, MAX).trim();
    }

    // The denied care: a named field first, then a sentence in the letter,
    // then the subject line. The setting is added when the care named does
    // not already say it, e.g. "Lumbar spinal fusion (Inpatient hospital)".
    // A clinical rationale often states the full admission request more clearly
    // than a multi-column table. Require an explicit request and admission.
    var explicitRequest = joinLines(lines).match(/\brequested\s+(?:prior\s+)?(?:approval|authorization)\s+for\s+((?:a|an|the)\s+[^.!?]{8,220})[.!?]/i);
    var admission = explicitRequest && /inpatient|hospital admission/i.test(explicitRequest[1]) && looksLikeService(explicitRequest[1])
      ? explicitRequest[1].replace(/^(?:a|an|the)\s+/i, "") : "";
    var service = admission || named[0] || proseService(paras.join(" ")) || proseService(out.reason) || subject[0] || "";
    var where = settings.filter(function (v) { return /inpatient|hospital|admission|acute|outpatient|observation/i.test(v) && !/diagnosis|determination|procedure/i.test(v); })[0] || "";
    if (!service) service = where;
    else if (where && !/inpatient|hospital|admission|admit/i.test(service)) service += " (" + where + ")";
    out.service = service;

    out.appealsAddress = findAppealsAddress(lines.map(function (l) { return l.trim(); }).join("\n"));

    // A plan the app knows, named anywhere in the notice.
    var known = (opts && opts.knownPlans) || [];
    var hay = squashAll(src);
    for (var k = 0; k < known.length; k++) {
      if (!out.planName && known[k] && hay.indexOf(squashAll(known[k])) !== -1) { out.planName = known[k]; break; }
    }
    // Plan name fallback: an early line that looks like a plan name. This
    // is a guess, so the app keeps a plan name the user already has.
    if (!out.planName) {
      for (var i = 0; i < Math.min(lines.length, 8); i++) {
        var l = lines[i].trim();
        if (l && l.length < 90 && /\bhealth|\b(plan|insurance|care|fund|medicare|medicaid|benefits)\b/i.test(l) &&
            l.indexOf(":") === -1 && !/notice|denial|dear|department/i.test(l)) { out.planName = l; out.planGuessed = true; break; }
      }
    }
    // Date fallback: the first date near the top that is not a birth date
    // or a date of service.
    if (!out.noticeDate) {
      var top = lines.slice(0, 15).filter(function (x) { return !NOT_NOTICE_DATE.test(x); });
      for (var j = 0; j < top.length && !out.noticeDate; j++) out.noticeDate = findDate(top[j]);
    }
    // Prefer a specifically named requested admission in the rationale over
    // multi-column table fragments or an introductory service-section paragraph.
    // Joining lines can leave "3- day" where a line wrapped at the hyphen.
    var flat = fixLigatures(src.replace(/\s+/g, " "));
    var admission = flat.match(/requested\s+approval\s+for\s+(?:a|an)\s+([^.!?]{5,200})[.!?]/i);
    if (admission && /inpatient|hospital admission/i.test(admission[1]) &&
        !/review|following service|based on/i.test(admission[1])) {
      out.service = admission[1].charAt(0).toUpperCase() + admission[1].slice(1);
    }
    // Keep the exact rationale, rather than columns from the service table.
    // Only when one of the headings that ends it is present. Without one
    // the match would run on through the appeal instructions.
    var rationale = flat.match(/Reason for (?:Adverse Determination|Denial)\s*:\s*(.+?)(?=Clinical Review Guidelines Used\s*:|Detailed Rationale\s*:|\d+\.\s+HOW TO APPEAL)/i);
    if (rationale) out.reason = rationale[1].trim().slice(0, 3000);
    var appealStart = src.search(/(?:^|\n)\s*\d+\.\s+HOW TO APPEAL/i);
    if (appealStart !== -1) out.instructions = src.slice(appealStart)
      .split(/Notice ID:|This is a fictional document/i)[0]
      .replace(/Healthfirst Silver Leaf Plan[^\n]*Page \d+ of \d+/gi, "")
      .replace(/\s+/g, " ").trim().slice(0, 6000);
    var noticeDate = flat.match(/Notice Date\s*:\s*([^:]{5,40})/i);
    if (noticeDate) out.noticeDate = findDate(noticeDate[1]);
    // Optional synthetic identity data is used only by an explicit test mode.
    // Never infer missing identity fields or use the insurer's letterhead address.
    out.testIdentity = {};
    var identityPatterns = {
      name: /Member Name\s*:\s*([^\n:]+?)(?=\s{2,}|\s+Notice Date\s*:|\n|$)/i,
      memberId: /Member ID\s*:\s*([A-Za-z0-9-]+)/i,
      refNumber: /Reference\s*\/\s*Auth\s*#\s*:\s*([A-Za-z0-9-]+)/i
    };
    Object.keys(identityPatterns).forEach(function (key) {
      var match = src.match(identityPatterns[key]);
      out.testIdentity[key] = match ? match[1].trim() : "";
    });
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
    if (s.appealsAddress) {
      L.push("Appeals mailing address: " + s.appealsAddress);
      L.push("Practice address only. Do not mail anything here.");
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

