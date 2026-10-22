/*
 * Letter composer. Writes the appeal letter with no AI and no network.
 *
 * It picks sentences based on what the user entered: the kind of reason
 * the plan gave, the documents the user has, their own words, and the tone.
 * A version number picks between equivalent phrasings, so "Write another
 * version" gives a different letter from the same facts.
 *
 * Same rules as the charter: only confirmed facts, the denial reason quoted
 * exactly, gaps as [ADD: ...], and no medical claims, dates, numbers, laws
 * or citations of its own.
 */
(function (root) {
  var Letter = root.AppealLetter || (typeof require === "function" ? require("./letter.js") : null);

  function clean(v) { return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : ""; }
  function gap(what) { return "[ADD: " + what + "]"; }
  function pick(options, version, slot) {
    return options[(version + slot) % options.length];
  }

  // What kind of reason did the plan give? More than one can apply.
  var REASON_KINDS = [
    { id: "setting", re: /observation|outpatient|lower level|another setting|less intensive|different setting|home/i },
    { id: "length", re: /continued|beyond day|stable for discharge|ready for discharge|days? \d|length of stay|additional days/i },
    { id: "records", re: /documentation|records|information (submitted|received|provided)|did not (show|support)|not supported|not established/i }
  ];

  function reasonKinds(reason) {
    var r = clean(reason);
    if (!r) return [];
    return REASON_KINDS.filter(function (k) { return k.re.test(r); }).map(function (k) { return k.id; });
  }

  // Tidy the user's own words without changing what they say.
  function tidy(text) {
    var t = clean(text);
    if (!t) return "";
    t = t.replace(/\bi\b/g, "I").replace(/\bim\b/gi, "I'm").replace(/\bdont\b/gi, "don't").replace(/\bcouldnt\b/gi, "couldn't").replace(/\bcant\b/gi, "can't");
    t = t.replace(/(^|[.!?]\s+)([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
    if (!/[.!?]$/.test(t)) t += ".";
    return t;
  }

  var TONES = {
    formal: {
      // Wording reviewed by the team for US-02. One phrasing per slot.
      greeting: ["Dear Appeals Review Department:"],
      open: ["Please accept this letter as my formal appeal of the denial issued by PLAN in its notice dated DATE, which denied coverage for SERVICE."],
      disagree: ["I respectfully request that you review the additional clinical documentation provided and consider overturning your coverage decision."],
      own: ["Here is why I believe the hospital stay was necessary:"],
      close: ["Thank you for your careful consideration of this appeal."],
      signoff: ["Sincerely,"]
    }
  };

  function reasonParagraphs(kinds, hasDoctor, hasRecords, v) {
    var out = [];
    if (kinds.indexOf("setting") !== -1) {
      out.push(pick([
        "Your notice says my care could have been given in a different setting. I ask you to review the full record of my stay and consider my condition at the time I was admitted, not only how things turned out afterward.",
        "Your notice suggests I could have been treated outside the hospital. Please review the complete record of my stay, including what my care team knew when they decided to admit me."
      ], v, 0));
    }
    if (kinds.indexOf("length") !== -1) {
      out.push(pick([
        "Your notice questions how long I stayed in the hospital. Please review the records for each day you denied, including my care team's notes about my condition and discharge planning on those days.",
        "Your notice says part of my stay was not needed. I ask you to review each denied day on its own, using my care team's notes for that day."
      ], v, 1));
    }
    if (kinds.indexOf("records") !== -1) {
      out.push(hasRecords
        ? pick([
          "Your notice says the information you had did not support inpatient care. With this letter I am sending records from my hospital stay so you can review the complete picture.",
          "Your notice says the documents you reviewed did not support inpatient care. I am enclosing records from my stay so your review is based on complete information."
        ], v, 2)
        : "Your notice says the information you had did not support inpatient care. " + gap("say whether you are sending records from your stay now, or will send them once you receive them"));
    }
    if (!out.length) {
      out.push(pick([
        "Please review the full record of my hospital stay before making a final decision.",
        "I ask that a reviewer look at the complete record of my stay before deciding this appeal."
      ], v, 4));
    }
    if (hasDoctor) {
      out.push(pick([
        "I am also enclosing a statement from my treating doctor. I ask you to give it careful weight, since it comes from a doctor who treated me.",
        "I have included a statement from my treating doctor. Please consider it carefully."
      ], v, 5));
    }
    return out;
  }

  // Checklist items as the patient names them in their own letter.
  var ENCLOSURES = {
    notice: "A copy of the denial notice",
    records: "Records from my hospital stay",
    doctor: "A statement from my treating doctor",
    planDocs: "The documents and criteria used in your decision",
    coverage: "My plan's coverage document",
    log: "My notes of dates, calls and people I spoke with"
  };

  // The user's own reasons joined into one clause, wording unchanged:
  // "I could not breathe. My oxygen was low." -> "I could not breathe and my oxygen was low"
  function reasonsClause(text) {
    var t = tidy(text);
    if (!t) return "";
    var sentences = (t.match(/[^.!?]+[.!?]*/g) || []).map(function (x) {
      x = x.trim().replace(/[.!?]+$/, "");
      return /^I\b/.test(x) ? x : x.charAt(0).toLowerCase() + x.slice(1);
    }).filter(Boolean);
    if (sentences.length < 2) return sentences.join("");
    return sentences.slice(0, -1).join(", ") + " and " + sentences[sentences.length - 1];
  }

  // Closing paragraph that sums up the patient's reasons.
  // "Inpatient stay" -> "inpatient stay" so it reads inside a sentence.
  function lowerFirst(t) {
    return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }

  // Closing summary, in the team's wording: "Based on the aforementioned
  // clinical information, I believe the ___ was medically necessary based on ..."
  function summary(ownWords, hasDoctor, hasRecords, service) {
    var own = reasonsClause(ownWords);
    // "the stay after surgery, 3 days, was" needs the second comma.
    var svc = lowerFirst(service) + (/,/.test(service) && !/^\[ADD:/.test(service) ? "," : "");
    var text = "Based on the aforementioned clinical information, I believe the " + svc +
      " was medically necessary" + (own ? " based on the following: " + own : "") + ".";
    var docs = [];
    if (hasDoctor) docs.push("my treating doctor's statement");
    if (hasRecords) docs.push("the records from my hospital stay");
    if (docs.length) text += " This is supported by " + docs.join(" and ") + ".";
    return text + " I therefore ask that you reverse your decision and approve coverage for " + lowerFirst(service) + ".";
  }

  function compose(input) {
    var d = input.details || {};
    // The letter is always formal, with one fixed wording.
    var tone = TONES.formal;
    var v = 0;
    var have = (input.checklist || []).filter(function (c) { return c.have; });
    var hasId = function (id) { return have.some(function (c) { return c.id === id; }); };
    var service = clean(d.service) || gap("inpatient service that was denied");
    var reason = clean(d.reason);
    var own = tidy(input.ownWords);
    var L = [];

    var me = input.sender || {};
    var field = function (label, value, what) { return label + ": " + (clean(value) || gap(what)); };
    L.push(field("Name", me.name, "your full name"));
    L.push(field("Address", me.address, "your mailing address"));
    L.push(field("Phone", me.phone, "your phone number"));
    L.push(field("Date", clean(me.date) ? Letter.formatDate(me.date) : "", "today's date"));
    L.push("");
    L.push(field("To", d.planName, "plan name"));
    L.push(field("Appeals address", me.appealsAddress, "appeals address from your notice"));
    L.push("");
    L.push("Re: Appeal of denial for " + service);
    L.push(field("Member ID", me.memberId, "member ID from your insurance card"));
    L.push(field("Claim or reference number", me.refNumber, "reference number from your notice"));
    L.push("Date of denial notice: " + (clean(d.noticeDate) ? Letter.formatDate(d.noticeDate) : gap("date on your notice")));
    L.push("");
    L.push(pick(tone.greeting, v, 0));
    L.push("");
    L.push(pick(tone.open, v, 1)
      .replace("PLAN", clean(d.planName) || gap("plan name"))
      .replace("DATE", clean(d.noticeDate) ? Letter.formatDate(d.noticeDate) : gap("date on your notice"))
      .replace("SERVICE", service));
    L.push("");
    L.push(pick(["Your notice gives this reason for the denial:", "According to your notice, the reason for the denial is:"], v, 2));
    L.push("\"" + (reason || gap("denial reason exactly as written on your notice")) + "\"");
    L.push("");
    L.push(pick(tone.disagree, v, 3));
    L.push("");
    L.push(pick(tone.own, v, 4));
    L.push(own || gap("in your own words, why you believe the hospital stay was necessary. Your treating doctor can help explain this"));
    L.push("");
    reasonParagraphs(reasonKinds(reason), hasId("doctor"), hasId("records"), v).forEach(function (p) {
      L.push(p);
      L.push("");
    });
    L.push("I have enclosed:");
    if (have.length) have.forEach(function (c) { L.push("  * " + (ENCLOSURES[c.id] || c.label)); });
    else L.push("  * " + gap("list of documents you are enclosing"));
    L.push("");
    L.push(summary(input.ownWords, hasId("doctor"), hasId("records"), service));
    L.push("");
    L.push(pick(tone.close, v, 6));
    L.push("");
    L.push(pick(tone.signoff, v, 7));
    L.push("");
    L.push(clean(me.name) || gap("your signature and printed name"));
    return L.join("\n");
  }

  var api = { compose: compose, reasonKinds: reasonKinds, tidy: tidy };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealComposer = api;
})(typeof window !== "undefined" ? window : this);
