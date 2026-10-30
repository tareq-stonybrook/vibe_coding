/*
 * Letter composer. Writes the appeal letter with no AI and no network.
 *
 * It picks sentences based on what the user entered: the kind of reason
 * the plan gave, the documents the user will attach, and the clinician's
 * explanation the user typed.
 *
 * Same rules as the charter: only confirmed facts, the denial reason quoted
 * exactly, gaps as [ADD: ...], and no medical claims, dates, numbers, laws
 * or citations of its own. A checked document is never described as
 * saying anything: the letter only lists it as enclosed.
 *
 * Two scenarios. "planned": the plan denied a planned admission before the
 * stay, so wording looks ahead ("is needed"). Otherwise the stay already
 * happened ("was needed").
 */
(function (root) {
  var Letter = root.AppealLetter || (typeof require === "function" ? require("./letter.js") : null);

  function clean(v) { return typeof v === "string" ? v.trim().replace(/\s+/g, " ") : ""; }
  function gap(what) { return "[ADD: " + what + "]"; }

  // Personal details are never asked for in the app. They stay as
  // placeholders and the user adds them privately after download.
  var PRIVATE = {
    name: "your full name",
    address: "your mailing address",
    phone: "your phone number",
    memberId: "member ID from your insurance card",
    refNumber: "reference number from your notice",
    signature: "your signature and printed name"
  };
  var PRIVATE_GAPS = Object.keys(PRIVATE).map(function (k) { return gap(PRIVATE[k]); });

  // What kind of reason did the plan give? More than one can apply.
  // "criteria" only feeds the plain explanation on the guide step. Per
  // team feedback the letter never asks the plan to identify criteria.
  var REASON_KINDS = [
    { id: "setting", re: /observation|outpatient|lower level|another setting|less intensive|different setting|home/i },
    { id: "length", re: /continued|beyond day|stable for discharge|ready for discharge|days? \d|length of stay|additional days/i },
    { id: "records", re: /documentation|records|information (submitted|received|provided)|did not (show|support)|does not show|not supported|not established/i },
    { id: "criteria", re: /criteria|definition|guideline|policy|standard/i }
  ];

  function reasonKinds(reason) {
    var r = clean(reason);
    if (!r) return [];
    return REASON_KINDS.filter(function (k) { return k.re.test(r); }).map(function (k) { return k.id; });
  }

  // Tidy the user's typed text without changing what it says.
  function tidy(text) {
    var t = clean(text);
    if (!t) return "";
    t = t.replace(/\bi\b/g, "I").replace(/\bim\b/gi, "I'm").replace(/\bdont\b/gi, "don't").replace(/\bcouldnt\b/gi, "couldn't").replace(/\bcant\b/gi, "can't");
    t = t.replace(/(^|[.!?]\s+)([a-z])/g, function (m, p, c) { return p + c.toUpperCase(); });
    if (!/[.!?]$/.test(t)) t += ".";
    return t;
  }

  // "Inpatient stay" -> "inpatient stay" so it reads inside a sentence.
  function lowerFirst(t) {
    return /^[A-Z][a-z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  }

  // Plain language note on what the plan's reason means. It explains the
  // disagreement and never says who is right.
  function explainDenial(reason, service, planned) {
    var kinds = reasonKinds(reason);
    if (!clean(reason)) return [];
    var out = [];
    if (kinds.indexOf("setting") !== -1) {
      out.push(planned
        ? "The plan's stated reason is that it believes the care could be provided in an outpatient setting. The disagreement is about the need for inpatient admission."
        : "The plan's stated reason is that it believes your care could have been given in a different setting, such as outpatient care or observation. The disagreement is about whether you needed to be admitted as an inpatient.");
    }
    if (kinds.indexOf("length") !== -1) {
      out.push("The plan's stated reason is that it believes part of your stay was not needed. The disagreement is about how many days of inpatient care were needed.");
    }
    if (kinds.indexOf("records") !== -1) {
      out.push(planned
        ? "The plan says the information it had does not show that inpatient care is needed. The disagreement is about what the information about your condition shows."
        : "The plan says the information it had did not show that inpatient care was needed. The disagreement is about what your records show.");
    }
    if (kinds.indexOf("criteria") !== -1) {
      out.push("The plan says it used its clinical review criteria. You can ask the plan which criteria it used.");
    }
    if (!out.length) {
      out.push("The plan says the inpatient care " + (planned ? "is" : "was") + " not medically necessary. The quote above gives the plan's exact words.");
    }
    var what = /surg/i.test(clean(service) + " " + clean(reason)) ? "the surgery" : "the treatment itself";
    out.push("This does not, by itself, tell us whether " + what + " is covered. This guide does not decide who is correct.");
    return out;
  }

  function reasonParagraphs(kinds, attach, planned) {
    var out = [];
    if (kinds.indexOf("setting") !== -1) {
      out.push(planned
        ? "Your notice says my care could be provided in an outpatient setting. I ask you to review whether inpatient care is needed, using the information from my care team about my condition and the planned treatment."
        : "Your notice says my care could have been given in a different setting. I ask you to review the full record of my stay and consider my condition at the time I was admitted, not only how things turned out afterward.");
    }
    if (kinds.indexOf("length") !== -1 && !planned) {
      out.push("Your notice questions how long I stayed in the hospital. Please review the records for each day you denied, including my care team's notes about my condition and discharge planning on those days.");
    }
    if (kinds.indexOf("records") !== -1) {
      var said = planned
        ? "Your notice says the information you had does not show that inpatient care is needed. "
        : "Your notice says the information you had did not support inpatient care. ";
      out.push(attach.records
        ? said + "I am enclosing additional records for your review."
        : said + gap(planned
          ? "say whether you will send records that support the planned admission"
          : "say whether you are sending records from your stay now, or will send them once you receive them"));
    }
    if (!out.length) {
      out.push(planned
        ? "Please review all available information about my condition and the planned admission before making a final decision."
        : "Please review the full record of my hospital stay before making a final decision.");
    }
    if (attach.doctor) {
      out.push(planned
        ? "I am also enclosing a letter from my clinician. Please consider it carefully."
        : "I am also enclosing a statement from my treating doctor. Please consider it carefully.");
    }
    return out;
  }

  // Checklist items as the patient names them in their own letter.
  function enclosure(id, planned) {
    var names = {
      notice: "A copy of the denial notice",
      records: planned ? "Records about my condition and the planned admission" : "Records from my hospital stay",
      doctor: planned ? "A letter from my clinician" : "A statement from my treating doctor",
      requested: "The additional information you asked for",
      planDocs: "The documents and criteria used in your decision",
      coverage: "My plan's coverage document",
      log: "My notes of dates, calls and people I spoke with"
    };
    return names[id];
  }

  function compose(input) {
    var d = input.details || {};
    var planned = Boolean(input.planned);
    // Only items the user said they will attach are listed as enclosed.
    var attached = (input.checklist || []).filter(function (c) { return c.have && c.attach; });
    var attach = {};
    attached.forEach(function (c) { attach[c.id] = true; });
    var service = clean(d.service) || gap("inpatient service that was denied");
    var reason = clean(d.reason);
    var clinician = input.clinician || {};
    var explanation = clinician.unsure ? "" : tidy(clinician.text);
    var verb = planned ? "is" : "was";
    var L = [];

    var me = input.sender || {};
    var field = function (label, value, what) { return label + ": " + (clean(value) || gap(what)); };
    L.push("Name: " + gap(PRIVATE.name));
    L.push("Address: " + gap(PRIVATE.address));
    L.push("Phone: " + gap(PRIVATE.phone));
    L.push(field("Date", clean(me.date) ? Letter.formatDate(me.date) : "", "today's date"));
    L.push("");
    L.push(field("To", d.planName, "plan name"));
    L.push(field("Appeals address", me.appealsAddress, "appeals address from your notice"));
    L.push("");
    L.push("Re: Appeal of denial for " + service);
    L.push("Member ID: " + gap(PRIVATE.memberId));
    L.push("Claim or reference number: " + gap(PRIVATE.refNumber));
    L.push("Date of denial notice: " + (clean(d.noticeDate) ? Letter.formatDate(d.noticeDate) : gap("date on your notice")));
    L.push("");
    L.push("Dear Appeals Review Department:");
    L.push("");
    L.push("Please accept this letter as my formal appeal of the denial issued by " +
      (clean(d.planName) || gap("plan name")) + " in its notice dated " +
      (clean(d.noticeDate) ? Letter.formatDate(d.noticeDate) : gap("date on your notice")) +
      ", which denied coverage for " + service + ".");
    L.push("");
    L.push("Your notice gives this reason for the denial:");
    L.push("\"" + (reason || gap("denial reason exactly as written on your notice")) + "\"");
    L.push("");
    L.push(attached.length
      ? "I respectfully request that you review the enclosed documents and consider overturning your coverage decision."
      : "I respectfully request that you review your coverage decision and consider overturning it.");
    L.push("");
    L.push("My clinician's explanation of why inpatient care " + verb + " needed:");
    L.push(explanation || gap("your clinician's explanation of why inpatient care " + verb + " needed. Ask your clinician before you send this letter"));
    L.push("");
    reasonParagraphs(reasonKinds(reason), attach, planned).forEach(function (p) {
      L.push(p);
      L.push("");
    });
    L.push("I am enclosing:");
    if (attached.length) attached.forEach(function (c) { L.push("  * " + (enclosure(c.id, planned) || c.label)); });
    else L.push("  * " + gap("documents you will attach, or delete this list"));
    L.push("");
    // Closing in the team's wording, only when the user gave the
    // clinician's explanation. The letter never claims support it lacks.
    var svc = lowerFirst(service);
    if (explanation) {
      L.push("Based on the aforementioned clinical information, I believe the " + svc + " " + verb +
        " medically necessary. I therefore ask that you reverse your decision and approve coverage for " + svc + ".");
    } else {
      L.push("I ask that you reverse your decision and approve coverage for " + svc + ".");
    }
    L.push("");
    L.push("Thank you for your careful consideration of this appeal.");
    L.push("");
    L.push("Sincerely,");
    L.push("");
    L.push(gap(PRIVATE.signature));
    return L.join("\n");
  }

  var api = {
    compose: compose,
    reasonKinds: reasonKinds,
    tidy: tidy,
    explainDenial: explainDenial,
    PRIVATE_GAPS: PRIVATE_GAPS
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealComposer = api;
})(typeof window !== "undefined" ? window : this);
