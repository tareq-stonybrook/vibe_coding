/*
 * Letter builder. Pure functions, no DOM, so tests run in Node.
 *
 * Rules from the charter (US-06, US-07, US-08):
 *  - use only details the user confirmed
 *  - repeat the denial reason exactly as entered
 *  - mark every gap with a visible placeholder instead of filling it
 *  - never add diagnoses, dates, codes, prices, clinical claims or citations
 */
(function (root) {
  var PLACEHOLDER_RE = /\[ADD: [^\]]+\]/g;

  var REMINDER =
    "REMINDER (delete this note before sending): This draft was organized by Appeal Assist, " +
    "a prototype. It gives no legal or medical advice and did not submit anything. " +
    "Check every detail against your notice, fill any gaps, and attach your supporting information. " +
    "You send the appeal yourself.";

  function clean(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function orGap(value, what) {
    var v = clean(value);
    return v ? v : "[ADD: " + what + "]";
  }

  function formatDate(iso) {
    var v = clean(iso);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    var parts = v.split("-");
    var months = ["January", "February", "March", "April", "May", "June", "July",
      "August", "September", "October", "November", "December"];
    var m = months[parseInt(parts[1], 10) - 1];
    return m ? m + " " + parseInt(parts[2], 10) + ", " + parts[0] : v;
  }

  function buildLetter(details, checklist, ownWords) {
    var d = details || {};
    var have = (checklist || []).filter(function (item) { return item.have; });
    var lines = [];

    lines.push("[ADD: your full name]");
    lines.push("[ADD: your mailing address]");
    lines.push("[ADD: your phone number]");
    lines.push("");
    lines.push("[ADD: today's date]");
    lines.push("");
    lines.push(orGap(d.planName, "plan name"));
    lines.push("[ADD: appeals address from your notice]");
    lines.push("");
    lines.push("Re: Appeal of denial for " + orGap(d.service, "inpatient service that was denied"));
    lines.push("Member ID: [ADD: member ID from your insurance card]");
    lines.push("Claim or reference number: [ADD: reference number from your notice]");
    lines.push("Date of denial notice: " + (clean(d.noticeDate) ? formatDate(d.noticeDate) : "[ADD: date on your notice]"));
    lines.push("");
    lines.push("To whom it may concern:");
    lines.push("");
    lines.push(
      "I am writing to appeal your decision to deny coverage for " +
      orGap(d.service, "inpatient service that was denied") +
      ". I ask that you review this decision."
    );
    lines.push("");
    lines.push("Your notice states the reason for the denial as follows:");
    lines.push("\"" + orGap(d.reason, "denial reason exactly as written on your notice") + "\"");
    lines.push("");
    lines.push(
      "I disagree with this decision. " + (clean(ownWords) ||
      "[ADD: in your own words, why you believe the hospital stay was needed. Your treating doctor can help explain this.]")
    );
    lines.push("");
    if (have.length) {
      lines.push("I have enclosed the following to support this appeal:");
      have.forEach(function (item) { lines.push("  * " + item.label); });
    } else {
      lines.push("I have enclosed the following to support this appeal:");
      lines.push("  * [ADD: list of documents you are enclosing]");
    }
    lines.push("");
    lines.push(
      "Please send me a copy of the documents and criteria used to make this decision, " +
      "and let me know in writing if you need anything else from me."
    );
    lines.push("");
    lines.push("Sincerely,");
    lines.push("");
    lines.push("[ADD: your signature and printed name]");

    return lines.join("\n");
  }

  function findPlaceholders(text) {
    var found = (text || "").match(PLACEHOLDER_RE) || [];
    var seen = {};
    return found.filter(function (p) {
      if (seen[p]) return false;
      seen[p] = true;
      return true;
    });
  }

  function removePlaceholder(text, placeholder) {
    return (text || "").split(placeholder).join("");
  }

  function withReminder(text) {
    return REMINDER + "\n\n" + "-".repeat(40) + "\n\n" + text;
  }

  function rtfEscape(text) {
    var out = "";
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      var code = text.charCodeAt(i);
      if (ch === "\\" || ch === "{" || ch === "}") out += "\\" + ch;
      else if (ch === "\n") out += "\\par\n";
      else if (code > 127) out += "\\u" + (code > 32767 ? code - 65536 : code) + "?";
      else out += ch;
    }
    return out;
  }

  function toRtf(text) {
    return "{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Arial;}}\\f0\\fs24\n" + rtfEscape(withReminder(text)) + "\n}";
  }

  function toPlainText(text) {
    return withReminder(text);
  }

  function squash(t) {
    return (t || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  // Numbers in the letter that do not appear in anything the user entered.
  // Catches invented dates, codes, amounts and citations in an AI draft.
  function findUnsupported(text, sources) {
    var body = (text || "").replace(PLACEHOLDER_RE, " ");
    var src = (sources || []).map(function (x) { return x || ""; });
    src = src.concat(src.map(formatDate));
    var hay = squash(src.join(" \n "));
    var tokens = body.match(/\d[\d,.\/-]*\d|\d/g) || [];
    var seen = {};
    return tokens.filter(function (t) {
      if (seen[t]) return false;
      seen[t] = true;
      return hay.indexOf(t.toLowerCase()) === -1;
    });
  }

  function containsReason(text, reason) {
    var r = squash(reason);
    return !r || squash(text).indexOf(r) !== -1;
  }

  var api = {
    findUnsupported: findUnsupported,
    containsReason: containsReason,
    REMINDER: REMINDER,
    buildLetter: buildLetter,
    findPlaceholders: findPlaceholders,
    removePlaceholder: removePlaceholder,
    formatDate: formatDate,
    toRtf: toRtf,
    toPlainText: toPlainText
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealLetter = api;
})(this);
