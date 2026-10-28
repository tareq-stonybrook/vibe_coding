(function () {
  "use strict";

  var Rules = window.AppealRules;
  var Samples = window.AppealSamples.SAMPLES;
  var Letter = window.AppealLetter;
  var Reader = window.AppealReader;
  var Composer = window.AppealComposer;

  var STORAGE_KEY = "appealAssist.v2";
  var STEP_NAMES = ["Start", "Your plan", "Notice", "Options", "Checklist", "Draft", "Review", "Download"];
  var CHECKLIST = [
    { id: "notice", label: "A copy of the denial notice" },
    { id: "records", label: "Records from the hospital stay, such as admission notes, progress notes and the discharge summary",
      planned: "Existing records that support the planned admission, such as your clinician's notes and test results" },
    { id: "doctor", label: "A statement from your treating doctor about why hospital care was needed",
      planned: "A letter from your clinician explaining why inpatient rather than outpatient care is needed" },
    { id: "planDocs", label: "The documents and criteria the plan used to make its decision (you can ask the plan for these)" },
    { id: "coverage", label: "Your plan's coverage document, such as the member handbook or evidence of coverage" },
    { id: "log", label: "Your own notes: dates, calls, and names of people you spoke with" }
  ];
  var DETAIL_FIELDS = ["planName", "service", "noticeDate", "reason", "instructions"];

  // Personal identifiers are never collected. The letter keeps
  // placeholders for them, added privately after download.
  var SENDER_FIELDS = ["appealsAddress", "date"];
  function todayIso() {
    var d = new Date();
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function freshState() {
    return {
      step: 0,
      ack: false,
      state: "",
      planType: "",
      plan: "",
      details: { planName: "", service: "", noticeDate: "", reason: "", instructions: "" },
      checklist: CHECKLIST.map(function (c) { return { id: c.id, have: false, attach: false }; }),
      clinician: { text: "", unsure: false },
      sender: { appealsAddress: "", date: todayIso() },
      letter: "",
      letterSource: "",
      letterEdited: false,
      reviewed: false,
      fills: [],
      deferred: []
    };
  }

  var S = freshState();
  var noticeFile = null;

  // ---------- storage (browser only, may be unavailable) ----------
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  }
  function loadSaved() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function clearSaved() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ignore */ }
  }
  function adopt(obj) {
    var base = freshState();
    if (!obj || typeof obj !== "object") return base;
    Object.keys(base).forEach(function (k) {
      if (k in obj && ["details", "checklist", "sender", "fills", "deferred", "clinician"].indexOf(k) === -1) base[k] = obj[k];
    });
    ["fills", "deferred"].forEach(function (k) {
      if (Array.isArray(obj[k])) base[k] = obj[k].filter(function (x) { return typeof x === "string"; });
    });
    if (obj.clinician && typeof obj.clinician === "object") {
      base.clinician.text = typeof obj.clinician.text === "string" ? obj.clinician.text : "";
      base.clinician.unsure = Boolean(obj.clinician.unsure);
    }
    SENDER_FIELDS.forEach(function (f) {
      if (obj.sender && typeof obj.sender[f] === "string") base.sender[f] = obj.sender[f];
    });
    DETAIL_FIELDS.forEach(function (f) {
      if (obj.details && typeof obj.details[f] === "string") base.details[f] = obj.details[f];
    });
    var prev = {};
    (obj.checklist || []).forEach(function (c) { if (c && c.id) prev[c.id] = c; });
    base.checklist.forEach(function (c) {
      c.have = Boolean(prev[c.id] && prev[c.id].have);
      c.attach = c.have && Boolean(prev[c.id].attach);
    });
    return base;
  }

  // ---------- helpers ----------
  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }
  function announce(msg) {
    var s = $("#status");
    s.textContent = "";
    setTimeout(function () { s.textContent = msg; }, 50);
  }
  function setStatus(id, msg, isErr) {
    var n = $(id);
    n.textContent = msg || "";
    n.classList.toggle("err", Boolean(isErr));
  }
  function typeLabel(id) {
    var t = Rules.INSURANCE_TYPES.filter(function (x) { return x.id === id; })[0];
    return t ? t.label : "";
  }
  function stateLabel(id) {
    var s = Rules.STATES.filter(function (x) { return x.id === id; })[0];
    return s ? s.label : "";
  }
  // Planned admission scenario: the plan denied care before the stay.
  function isPlanned() {
    var p = plansFor(S.planType).filter(function (x) { return x.id === S.plan; })[0];
    return Boolean(p && p.scenario === "planned");
  }
  function checklistLabel(id) {
    var c = CHECKLIST.filter(function (x) { return x.id === id; })[0];
    return c ? (isPlanned() && c.planned) || c.label : "";
  }
  function haveLabels() {
    return S.checklist.filter(function (c) { return c.have; }).map(function (c) { return checklistLabel(c.id); });
  }
  // Gaps still waiting on the user: not personal (added after download)
  // and not left for later.
  function openGaps() {
    return Letter.findPlaceholders(S.letter).filter(function (g) {
      return Composer.PRIVATE_GAPS.indexOf(g) === -1 && S.deferred.indexOf(g) === -1;
    });
  }
  function showError(section, msg) {
    var box = section.querySelector(".error");
    if (!box) {
      box = el("p", { "class": "error", role: "alert" });
      var actions = section.querySelectorAll(".actions");
      actions[actions.length - 1].before(box);
    }
    box.textContent = msg;
  }
  function clearError(section) {
    var box = section.querySelector(".error");
    if (box) box.remove();
  }

  // Two-click confirm. Works where window.confirm is blocked.
  function confirmClick(btn, prompt, action) {
    var original = btn.textContent;
    btn.addEventListener("click", function () {
      if (btn.getAttribute("data-armed") !== "1") {
        btn.setAttribute("data-armed", "1");
        btn.textContent = prompt;
        announce(prompt);
        setTimeout(function () {
          btn.removeAttribute("data-armed");
          btn.textContent = original;
        }, 5000);
        return;
      }
      btn.removeAttribute("data-armed");
      btn.textContent = original;
      action();
    });
  }

  // Uses the viewer's save dialog on claude.ai, a normal download elsewhere.
  var downloadsPromise = null;
  function getDownloads() {
    if (!downloadsPromise) {
      downloadsPromise = (window.claude && typeof window.claude.use === "function")
        ? window.claude.use("downloads").catch(function () { return null; })
        : Promise.resolve(null);
    }
    return downloadsPromise;
  }
  function saveFile(filename, content, type) {
    return getDownloads().then(function (dl) {
      if (dl) {
        return dl.save({ filename: filename, data: new Blob([content], { type: type }) }).then(
          function () { return "Saved " + filename + "."; },
          function (e) {
            var code = e && e.code;
            if (code === "declined") return "Download cancelled. Your draft is still here.";
            if (code === "rate_limited") return "A save prompt is already open. Finish it, then try again.";
            if (code === "unavailable" || code === "not_granted" || code === "capability_disabled" || code === "capability_removed" || !code) {
              return blobDownload(filename, content, type);
            }
            return failed(filename, code + (e.message ? ": " + e.message : ""));
          }
        );
      }
      return blobDownload(filename, content, type);
    }).catch(function (e) { return failed(filename, e && e.message); });
  }
  // Nothing is lost on failure: the draft stays saved in the page.
  function failed(filename, detail) {
    return "Could not save " + filename + (detail ? " (" + detail + ")" : "") +
      ". Your draft is still saved here. Try the other format, or use Copy letter.";
  }
  function blobDownload(filename, content, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    // The browser or the page host can still block this download without
    // telling the page, so the message does not claim success.
    return "Download of " + filename + " started. If no file appears, use Copy letter. Your draft is still saved here.";
  }

  // ---------- step navigation ----------
  function validate(step) {
    if (step === 0 && !S.ack) return "Check the box to confirm you understand what this guide does.";
    if (step === 1 && !S.state) return "Choose your state.";
    if (step === 1 && !S.planType) return "Choose your insurance type.";
    if (step === 1 && plansFor(S.planType).length && !S.plan) return "Choose your plan.";
    if (step === 5 && !S.letter.trim()) return "Press Write my letter first.";
    if (step === 6 && openGaps().length) return "Fill in each gap or leave it for later before download.";
    if (step === 6 && !S.reviewed) return "Confirm you read the whole letter.";
    return "";
  }

  function go(step) {
    S.step = Math.max(0, Math.min(STEP_NAMES.length - 1, step));
    render();
    save();
    var section = $('.step[data-step="' + S.step + '"]');
    var h = section.querySelector("h1");
    h.setAttribute("tabindex", "-1");
    h.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    announce("Step " + (S.step + 1) + " of " + STEP_NAMES.length + ": " + STEP_NAMES[S.step]);
  }

  function next() {
    var section = $('.step[data-step="' + S.step + '"]');
    var msg = validate(S.step);
    if (msg) { showError(section, msg); return; }
    clearError(section);
    go(S.step + 1);
  }

  // ---------- rendering ----------
  function renderSteps() {
    var list = $("#step-list");
    list.innerHTML = "";
    STEP_NAMES.forEach(function (name, i) {
      var li = el("li", {}, (i + 1) + ". " + name);
      if (i === S.step) li.setAttribute("aria-current", "step");
      list.appendChild(li);
    });
    $("#step-count").textContent = S.step === 0 ? "" : "Step " + (S.step + 1) + " of " + STEP_NAMES.length;
    $("#progress-fill").style.width = (S.step / (STEP_NAMES.length - 1) * 100) + "%";
  }

  function renderContext() {
    var sel = $("#state");
    if (!sel.options.length) {
      sel.appendChild(el("option", { value: "" }, "Choose a state"));
      Rules.STATES.forEach(function (s) { sel.appendChild(el("option", { value: s.id }, s.label)); });
    }
    sel.value = S.state;

    var box = $("#plan-types");
    if (!box.children.length) {
      Rules.INSURANCE_TYPES.forEach(function (t) {
        var row = el("div", { "class": "choice" });
        var input = el("input", { type: "radio", name: "planType", id: "pt-" + t.id, value: t.id });
        var label = el("label", { "for": "pt-" + t.id });
        label.appendChild(document.createTextNode(t.label));
        label.appendChild(el("span", { "class": "hint", style: "display:block" }, t.hint));
        row.appendChild(input);
        row.appendChild(label);
        box.appendChild(row);
      });
    }
    $all('input[name="planType"]').forEach(function (r) { r.checked = r.value === S.planType; });
    renderPlan();
  }

  function plansFor(type) {
    return Rules.PLANS[type] || [];
  }
  function planLabel(id) {
    var p = plansFor(S.planType).filter(function (x) { return x.id === id; })[0];
    return p ? p.label : "";
  }

  // Plan picker shows only for insurance types that list plans.
  function renderPlan() {
    var plans = plansFor(S.planType);
    $("#plan-field").hidden = !plans.length;
    var sel = $("#plan");
    sel.innerHTML = "";
    if (!plans.length) return;
    sel.appendChild(el("option", { value: "" }, "Choose a plan"));
    plans.forEach(function (p) { sel.appendChild(el("option", { value: p.id }, p.label)); });
    sel.value = S.plan;
  }

  function renderNotice() {
    var sel = $("#sample");
    sel.innerHTML = "";
    var matching = Samples.filter(function (s) {
      return (!S.state || s.state === S.state) && (!S.planType || s.planType === S.planType);
    });
    matching.forEach(function (s, i) {
      sel.appendChild(el("option", { value: s.id }, "Example " + (i + 1) + ": " + (s.planName || "notice with missing details")));
    });
    DETAIL_FIELDS.forEach(function (f) { $("#" + f).value = S.details[f] || ""; });
  }

  function renderGuide() {
    var rules = Rules.getRules(S.state, S.planType);
    $("#guide-context").textContent = "Showing results for " + stateLabel(S.state) + ", " + typeLabel(S.planType) +
      (planLabel(S.plan) ? ", " + planLabel(S.plan) : "") + ".";

    var reasonBox = $("#guide-reason");
    reasonBox.innerHTML = "";
    reasonBox.appendChild(el("h2", {}, "Your denial"));
    var facts = el("dl", { "class": "facts" });
    function fact(k, v, missing) {
      facts.appendChild(el("dt", {}, k));
      facts.appendChild(el("dd", v ? {} : { "class": "missing" }, v || missing));
    }
    fact("Denied by", S.details.planName.trim() || planLabel(S.plan), "Not entered yet");
    fact("Date of notice", S.details.noticeDate ? Letter.formatDate(S.details.noticeDate) : "", "Not entered yet");
    fact("Service denied", S.details.service.trim(), "Not entered yet");
    reasonBox.appendChild(facts);
    reasonBox.appendChild(el("h3", {}, "Reason for denial, as stated by your plan"));
    if (S.details.reason.trim()) reasonBox.appendChild(el("blockquote", {}, S.details.reason.trim()));
    else reasonBox.appendChild(el("p", {}, "You have not entered the denial reason yet. Go back to add it, or fill it in later in the letter."));
    var plain = Composer.explainDenial(S.details.reason, S.details.service, isPlanned());
    if (plain.length) {
      reasonBox.appendChild(el("h3", {}, "What this means, in plain words"));
      plain.forEach(function (t) { reasonBox.appendChild(el("p", {}, t)); });
    }

    var box = $("#guide-rules");
    box.innerHTML = "";
    var card = el("div", { "class": "tile" });
    card.appendChild(el("h2", {}, "Appeal paths and deadlines"));

    if (rules.deadlines.length && !rules.teamConfirmed) {
      var pending = el("div", { "class": "warn", role: "note" });
      pending.appendChild(el("p", {}, "Not fully verified yet. These rules come from the plan contract, " + rules.sourceTitle +
        (rules.checkedBy ? ", checked by " + rules.checkedBy : "") +
        ". Our team has not yet confirmed them against the official published document, and we have no public link to it yet."));
      pending.appendChild(el("p", { style: "margin:0" }, "Confirm every deadline on your denial notice. If anything differs, follow your notice and call the plan."));
      card.appendChild(pending);
    }
    if (!rules.deadlines.length && !rules.paths.length) {
      var note = el("div", { "class": "warn", role: "note" });
      note.appendChild(el("p", {}, "We have not yet checked appeal rules or deadlines for " +
        (planLabel(S.plan) ? planLabel(S.plan) + " (" + typeLabel(S.planType) + ") in " + stateLabel(S.state) : stateLabel(S.state) + " and " + typeLabel(S.planType)) +
        " against an official source, so we do not show them here."));
      note.appendChild(el("p", { style: "margin:0" }, "Check your denial notice and plan documents for the appeal steps and deadline. If anything is unclear, call the number on your notice or insurance card."));
      card.appendChild(note);
    } else {
      if (isPlanned()) card.appendChild(el("p", {}, "These rules are for a planned inpatient admission the plan denied before your stay."));
      if (rules.paths.length) {
        card.appendChild(el("h3", {}, "Your appeal options"));
        rules.paths.forEach(function (p) { card.appendChild(renderRule(p)); });
      }
      var yours = rules.deadlines.filter(function (d) { return d.who !== "plan"; });
      var theirs = rules.deadlines.filter(function (d) { return d.who === "plan"; });
      if (yours.length) {
        card.appendChild(el("h3", {}, "Your deadlines to ask for an appeal"));
        yours.forEach(function (d) { card.appendChild(renderRule(d)); });
      }
      if (theirs.length) {
        card.appendChild(el("h3", {}, "How long the plan has to respond"));
        theirs.forEach(function (d) { card.appendChild(renderRule(d)); });
      }
    }
    if (rules.contacts.length || rules.missing.length) {
      card.appendChild(el("h3", {}, "Who to contact"));
      rules.contacts.forEach(function (c) { card.appendChild(renderRule(c)); });
      rules.missing.forEach(function (m) { card.appendChild(el("p", { "class": "missing" }, m)); });
    } else if (rules.deadlines.length || rules.paths.length) {
      card.appendChild(el("p", {}, "We have no checked contact details for this plan. Use the phone number and address on your notice."));
    }

    var help = Rules.HELP_LINKS[S.planType] || Rules.HELP_LINKS.general;
    var p = el("p", { style: "margin:0" }, "Official help: ");
    p.appendChild(el("a", { href: help.url, target: "_blank", rel: "noopener" }, help.label));
    card.appendChild(p);
    box.appendChild(card);

    var instr = $("#guide-instructions");
    instr.innerHTML = "";
    instr.appendChild(el("h2", {}, "Appeal instructions from your notice"));
    if (S.details.instructions.trim()) {
      instr.appendChild(el("blockquote", {}, S.details.instructions.trim()));
      // The notice may point to details printed elsewhere on it. Say so
      // instead of leaving the user looking for something not shown here.
      if (/below|above|last page|back of|next page|page \d|enclosed|attached|printed on|on this notice/i.test(S.details.instructions)) {
        instr.appendChild(el("p", { "class": "missing" }, "Your notice refers to details printed elsewhere on it, such as an address. This guide does not have them. Copy them from your notice and confirm them before you send anything."));
      }
    } else instr.appendChild(el("p", {}, "You did not enter appeal instructions. Look on your notice for a section like \"Your right to appeal\"."));
  }

  function renderRule(r) {
    var wrap = el("dl", { "class": "deadline" });
    function row(k, v) {
      wrap.appendChild(el("dt", {}, k));
      wrap.appendChild(el("dd", {}, v));
    }
    row(r.label, r.rule);
    if (r.countFrom) row("Counted from", r.countFrom);
    if (typeof r.days === "number" && r.estimateFromNotice && S.details.noticeDate) {
      var d = new Date(S.details.noticeDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + r.days);
      row("Earliest possible deadline", Letter.formatDate(d.toISOString().slice(0, 10)) +
        ". This counts from the date on your notice. Your real deadline counts from the day you received it, so it may be later. Confirm it on your notice.");
    }
    // Source and date checked beside every rule, on one line.
    var src = el("dd", { "class": "source" });
    src.appendChild(document.createTextNode("Source: "));
    var name = r.where ? "plan contract, " + r.where : r.citation;
    if (r.sourceUrl) src.appendChild(el("a", { href: r.sourceUrl, target: "_blank", rel: "noopener" }, name));
    else src.appendChild(document.createTextNode(name));
    src.appendChild(document.createTextNode(". Date checked: " + Letter.formatDate(r.verifiedOn) + "."));
    wrap.appendChild(src);
    return wrap;
  }

  function renderChecklist() {
    var box = $("#checklist");
    box.innerHTML = "";
    S.checklist.forEach(function (c) {
      var item = el("div", { "class": "check-item" });
      var row = el("div", { "class": "check" });
      var input = el("input", { type: "checkbox", id: "cl-" + c.id });
      input.checked = c.have;
      row.appendChild(input);
      row.appendChild(el("label", { "for": "cl-" + c.id }, checklistLabel(c.id)));
      item.appendChild(row);
      // Having a document is not the same as sending it. Ask separately.
      var sub = el("div", { "class": "check sub" });
      var attach = el("input", { type: "checkbox", id: "at-" + c.id });
      attach.checked = c.attach;
      sub.appendChild(attach);
      sub.appendChild(el("label", { "for": "at-" + c.id }, "I plan to attach this to my letter"));
      sub.hidden = !c.have;
      item.appendChild(sub);
      input.addEventListener("change", function () {
        c.have = input.checked;
        if (!c.have) { c.attach = false; attach.checked = false; }
        sub.hidden = !c.have;
        save();
      });
      attach.addEventListener("change", function () {
        c.attach = attach.checked;
        save();
      });
      box.appendChild(item);
    });
    $("#missing-help").textContent = isPlanned()
      ? "Ask your clinician's office for records that support the planned admission, and for a letter explaining why inpatient rather than outpatient care is needed. You can also ask your plan for the documents it used to decide. Do not guess at medical details in your letter."
      : "Ask your care team or the hospital's medical records office for records from your stay. You can also ask your plan for the documents it used to decide. Do not guess at medical details in your letter.";
  }

  function renderDraft() {
    SENDER_FIELDS.forEach(function (f) { $("#s-" + f).value = S.sender[f] || ""; });
    $("#clinician-legend").textContent = "What explanation has your clinician provided for why inpatient care " +
      (isPlanned() ? "is" : "was") + " needed?";
    $("#clinician").value = S.clinician.text;
    $("#clinician-unsure").checked = S.clinician.unsure;
    $("#clinician").disabled = S.clinician.unsure;
    if (!S.letter || !S.letterEdited) writeLetter();
    $("#letter").value = S.letter;
  }

  function writeLetter() {
    S.letter = Composer.compose({
      details: S.details,
      checklist: S.checklist,
      clinician: S.clinician,
      sender: S.sender,
      planned: isPlanned()
    });
    S.deferred = [];
    S.letterSource = "composer";
    S.letterEdited = false;
    S.reviewed = false;
    $("#letter").value = S.letter;
    save();
  }

  function renderReview() {
    $("#letter-review").value = S.letter;
    $("#reviewed").checked = S.reviewed;
    renderReviewList();
  }

  function renderWarnings() {
    var box = $("#review-warnings");
    box.innerHTML = "";
    var sources = DETAIL_FIELDS.map(function (f) { return S.details[f]; })
      .concat(SENDER_FIELDS.map(function (f) { return S.sender[f]; }))
      .concat(S.fills).concat([S.clinician.text]).concat(haveLabels());
    var extra = Letter.findUnsupported(S.letter, sources);
    var reasonOk = Letter.containsReason(S.letter, S.details.reason);
    var stray = Letter.findStrayBrackets(S.letter);
    if (stray.length) {
      var b = el("div", { "class": "warn", role: "note" });
      b.appendChild(el("h2", {}, "Remove leftover brackets"));
      b.appendChild(el("p", {}, "These still have square brackets around them: " + stray.join(", ") + ". Letters read better without them."));
      var fix = el("button", { type: "button", "class": "secondary small" }, "Remove the brackets for me");
      fix.addEventListener("click", function () {
        S.letter = Letter.removeStrayBrackets(S.letter);
        S.letterEdited = true;
        $("#letter-review").value = S.letter;
        renderReviewList();
        save();
        announce("Brackets removed.");
      });
      b.appendChild(fix);
      box.appendChild(b);
    }
    if (!extra.length && reasonOk) return;
    var w = el("div", { "class": "warn", role: "note" });
    w.appendChild(el("h2", {}, "Double check these"));
    var ul = el("ul");
    if (!reasonOk) ul.appendChild(el("li", {}, "The letter does not repeat the denial reason exactly as you entered it."));
    extra.forEach(function (n) {
      ul.appendChild(el("li", {}, "\"" + n + "\" is not in anything you entered. Remove it unless you added it yourself and know it is correct."));
    });
    w.appendChild(ul);
    box.appendChild(w);
  }

  function renderReviewList() {
    var list = $("#review-list");
    var gaps = Letter.findPlaceholders(S.letter);
    S.deferred = S.deferred.filter(function (g) { return gaps.indexOf(g) !== -1; });
    var open = openGaps();
    list.innerHTML = "";
    var card = el("div", { "class": "tile" });
    if (!gaps.length) {
      card.appendChild(el("p", { style: "margin:0" }, "Every gap is filled in."));
    } else {
      var later = gaps.length - open.length;
      card.appendChild(el("h2", {}, open.length
        ? open.length + (open.length === 1 ? " gap needs" : " gaps need") + " your choice"
        : "All gaps are filled in or left for later"));
      if (later) {
        card.appendChild(el("p", {}, later + (later === 1 ? " item is" : " items are") +
          " still missing and stay marked in the downloaded draft. The draft is not ready to send until you complete " +
          (later === 1 ? "it." : "them.")));
      }
      gaps.forEach(function (g) {
        var row = el("div", { "class": "review-item" });
        row.appendChild(el("span", { "class": "ph" }, g));
        if (Composer.PRIVATE_GAPS.indexOf(g) !== -1) {
          row.appendChild(el("p", { "class": "hint deferred" }, "Personal detail. Add it privately after you download the draft, outside this app."));
          card.appendChild(row);
          return;
        }
        if (S.deferred.indexOf(g) !== -1) {
          var back = el("div", { "class": "fill-row" });
          back.appendChild(el("p", { "class": "hint deferred" }, "Left for later. It stays marked in the downloaded draft."));
          var undo = el("button", { type: "button", "class": "secondary small" }, "Fill in now");
          undo.setAttribute("aria-label", "Fill in " + g + " now");
          undo.addEventListener("click", function () {
            S.deferred = S.deferred.filter(function (x) { return x !== g; });
            renderReviewList();
            save();
          });
          back.appendChild(undo);
          row.appendChild(back);
          card.appendChild(row);
          return;
        }
        var fillRow = el("div", { "class": "fill-row" });
        var fid = "fill-" + Math.random().toString(36).slice(2, 8);
        var input = el("input", { type: "text", id: fid, autocomplete: "off" });
        input.setAttribute("aria-label", "Text to replace " + g);
        input.setAttribute("placeholder", "Type it here, no brackets");
        var fill = el("button", { type: "button", "class": "primary small" }, "Fill in");
        fill.setAttribute("aria-label", "Fill in " + g);
        function doFill() {
          var v = input.value.trim().replace(/^\[|\]$/g, "").trim();
          if (!v) { input.focus(); return; }
          S.letter = S.letter.split(g).join(v);
          S.fills.push(v);
          S.letterEdited = true;
          $("#letter-review").value = S.letter;
          renderReviewList();
          save();
          announce("Filled in.");
        }
        fill.addEventListener("click", doFill);
        input.addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); doFill(); } });
        // Leaving a gap for later keeps it in the letter. Nothing is
        // removed, so a missing item never looks complete.
        var defer = el("button", { type: "button", "class": "secondary small" }, "Leave for later");
        defer.setAttribute("aria-label", "Leave " + g + " for later. It stays in the letter");
        defer.addEventListener("click", function () {
          S.deferred.push(g);
          renderReviewList();
          save();
          announce("Left for later. It stays marked in the letter.");
        });
        fillRow.appendChild(input);
        fillRow.appendChild(fill);
        fillRow.appendChild(defer);
        row.appendChild(fillRow);
        card.appendChild(row);
      });
    }
    list.appendChild(card);
    renderWarnings();
    $("#to-download").disabled = Boolean(open.length) || !S.reviewed;
  }

  function renderDownload() {
    var gaps = Letter.findPlaceholders(S.letter);
    var box = $("#incomplete");
    box.hidden = !gaps.length;
    box.innerHTML = "";
    if (gaps.length) {
      box.appendChild(el("h2", {}, "This draft is not ready to send"));
      box.appendChild(el("p", {}, gaps.length + (gaps.length === 1 ? " item is" : " items are") +
        " still marked [ADD: ...]. The downloaded file keeps " + (gaps.length === 1 ? "it" : "them") +
        " and says so at the top. Complete " + (gaps.length === 1 ? "it" : "them") + " privately before you send the letter."));
      var ul = el("ul");
      gaps.forEach(function (g) { ul.appendChild(el("li", {}, g)); });
      box.appendChild(ul);
    }
    var text = S.details.instructions.trim();
    $("#submit-instructions").textContent = text || "You did not enter appeal instructions. Check your notice for where and how to send your appeal.";
  }

  function render() {
    renderSteps();
    $all(".step").forEach(function (sec) {
      sec.hidden = Number(sec.getAttribute("data-step")) !== S.step;
    });
    $("#ack").checked = S.ack;
    var saved = loadSaved();
    $("#resume").hidden = !(S.step === 0 && saved && saved.step > 0);
    if (S.step === 1) renderContext();
    if (S.step === 2) renderNotice();
    if (S.step === 3) renderGuide();
    if (S.step === 4) renderChecklist();
    if (S.step === 5) renderDraft();
    if (S.step === 6) renderReview();
    if (S.step === 7) renderDownload();
  }

  // ---------- notice upload ----------
  function pickFile(file) {
    noticeFile = file || null;
    $("#file-row").hidden = !file;
    $("#file-name").textContent = file ? "Selected: " + file.name : "";
    $("#read-notice").disabled = !file;
    setStatus("#read-status", "");
  }

  // Drop the chosen file and any field values read from it that the user has not edited.
  function removeFile() {
    var cleared = 0;
    DETAIL_FIELDS.forEach(function (f) {
      var input = $("#" + f);
      if (input.classList.contains("filled")) {
        input.classList.remove("filled");
        input.value = "";
        S.details[f] = "";
        cleared++;
      }
    });
    if (cleared) save();
    $("#notice-file").value = "";
    pickFile(null);
    setStatus("#read-status", cleared
      ? "File removed. Cleared the details read from it. Upload the right notice or type them below."
      : "File removed. Upload the right notice or type the details below.");
    $("#notice-file").focus();
  }

  function readNotice() {
    var file = noticeFile;
    if (!file) return;
    $("#read-notice").disabled = true;
    setStatus("#read-status", "Reading your notice.");
    Reader.readFile(file).then(function (out) {
      if (file !== noticeFile) return; // removed or replaced while reading
      var filled = [];
      DETAIL_FIELDS.forEach(function (f) {
        var input = $("#" + f);
        input.classList.remove("filled");
        if (out[f]) {
          S.details[f] = out[f];
          input.value = out[f];
          input.classList.add("filled");
          filled.push(f);
        }
      });
      save();
      setStatus("#read-status", filled.length
        ? "Filled " + filled.length + " of 5 fields, outlined in green. Check each one against your notice." +
          (filled.length < 5 ? " Type anything still blank." : "")
        : "Could not find the details in that file. Type them below.", !filled.length);
    }, function (e) {
      if (file !== noticeFile) return;
      setStatus("#read-status", Reader.errorMessage(e), true);
    }).then(function () {
      $("#read-notice").disabled = !noticeFile;
    });
  }

  function confirmReplace(btn, action) {
    if (S.letterEdited && btn.getAttribute("data-armed") !== "1") {
      var original = btn.textContent;
      btn.setAttribute("data-armed", "1");
      btn.textContent = "Click again to replace your edits";
      setTimeout(function () {
        btn.removeAttribute("data-armed");
        btn.textContent = original;
      }, 5000);
      return;
    }
    if (btn.getAttribute("data-armed") === "1") {
      btn.removeAttribute("data-armed");
      btn.textContent = "Write my letter";
    }
    action();
  }

  // ---------- events ----------
  function bind() {
    $all("[data-next]").forEach(function (b) { b.addEventListener("click", next); });
    $all("[data-back]").forEach(function (b) { b.addEventListener("click", function () { go(S.step - 1); }); });

    $("#ack").addEventListener("change", function (e) { S.ack = e.target.checked; save(); });
    $("#resume").addEventListener("click", function () {
      S = adopt(loadSaved());
      go(S.step);
    });

    $("#state").addEventListener("change", function (e) { S.state = e.target.value; save(); });
    $("#plan-types").addEventListener("change", function (e) {
      if (e.target.name === "planType") {
        S.planType = e.target.value;
        if (!planLabel(S.plan)) S.plan = "";
        renderPlan();
        save();
      }
    });
    $("#plan").addEventListener("change", function (e) {
      var old = planLabel(S.plan);
      S.plan = e.target.value;
      // Fill the plan name on the notice step unless the user typed their own.
      if (!S.details.planName || S.details.planName === old) S.details.planName = planLabel(S.plan);
      save();
    });

    DETAIL_FIELDS.forEach(function (f) {
      $("#" + f).addEventListener("input", function (e) {
        S.details[f] = e.target.value;
        e.target.classList.remove("filled");
        save();
      });
    });

    var dz = $("#dropzone");
    $("#notice-file").addEventListener("change", function (e) { pickFile(e.target.files && e.target.files[0]); });
    ["dragenter", "dragover"].forEach(function (t) {
      dz.addEventListener(t, function () { dz.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(function (t) {
      dz.addEventListener(t, function () { dz.classList.remove("drag"); });
    });
    $("#read-notice").addEventListener("click", readNotice);
    $("#remove-file").addEventListener("click", removeFile);
    $("#dl-sample-docx").addEventListener("click", function () {
      var id = $("#sample").value;
      var s = Samples.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      var bytes = window.AppealDocx.build(Reader.sampleToText(s, typeLabel(s.planType)).split("\n"));
      saveFile("example-notice-" + s.id + ".docx", bytes,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document").then(announce);
    });
    $("#dl-sample").addEventListener("click", function () {
      var id = $("#sample").value;
      var s = Samples.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      saveFile("example-notice-" + s.id + ".txt", Reader.sampleToText(s, typeLabel(s.planType)), "text/plain;charset=utf-8").then(announce);
    });

    $("#load-sample").addEventListener("click", function () {
      var id = $("#sample").value;
      var s = Samples.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      DETAIL_FIELDS.forEach(function (f) { S.details[f] = s[f] || ""; $("#" + f).classList.remove("filled"); });
      renderNotice();
      $("#sample").value = id;
      save();
      announce("Example notice loaded. Review the fields below.");
    });

    // Until the user edits the letter by hand, it follows these inputs live.
    SENDER_FIELDS.forEach(function (f) {
      $("#s-" + f).addEventListener("input", function (e) {
        S.sender[f] = e.target.value.replace(/[\[\]]/g, "");
        if (e.target.value !== S.sender[f]) e.target.value = S.sender[f];
        if (!S.letterEdited) writeLetter(); else save();
      });
    });
    $("#clinician").addEventListener("input", function (e) {
      S.clinician.text = e.target.value;
      if (!S.letterEdited) writeLetter(); else save();
    });
    $("#clinician-unsure").addEventListener("change", function (e) {
      S.clinician.unsure = e.target.checked;
      $("#clinician").disabled = S.clinician.unsure;
      if (!S.letterEdited) writeLetter(); else save();
    });
    $("#write-letter").addEventListener("click", function () {
      confirmReplace($("#write-letter"), function () {
        writeLetter();
        setStatus("#letter-status", "Letter written from your details. Read it closely and edit anything.");
      });
    });
    $("#letter").addEventListener("input", function (e) {
      S.letter = e.target.value;
      S.letterEdited = true;
      S.reviewed = false;
      save();
    });

    $("#letter-review").addEventListener("input", function (e) {
      S.letter = e.target.value;
      S.letterEdited = true;
      renderReviewList();
      save();
    });
    $("#reviewed").addEventListener("change", function (e) {
      S.reviewed = e.target.checked;
      renderReviewList();
      save();
    });

    $("#dl-docx").addEventListener("click", function () {
      saveFile("appeal-letter-draft.docx", Letter.toDocx(S.letter),
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document").then(function (m) { setStatus("#dl-status", m); });
    });
    $("#dl-txt").addEventListener("click", function () {
      saveFile("appeal-letter-draft.txt", Letter.toPlainText(S.letter), "text/plain;charset=utf-8").then(function (m) { setStatus("#dl-status", m); });
    });
    $("#copy-letter").addEventListener("click", function () {
      var text = Letter.toPlainText(S.letter);
      function done(msg) { setStatus("#dl-status", msg); }
      function fallback() {
        go(6);
        var ta = $("#letter-review");
        ta.focus();
        ta.select();
        announce("Letter selected. Press copy on your keyboard.");
      }
      try {
        navigator.clipboard.writeText(text).then(function () { done("Letter copied. Paste it into Word or Google Docs."); }, fallback);
      } catch (e) { fallback(); }
    });

    confirmClick($("#start-over"), "Click again to clear everything", function () {
      clearSaved();
      S = freshState();
      go(0);
    });
    confirmClick($("#clear"), "Click again to clear saved progress", function () {
      clearSaved();
      S = freshState();
      go(0);
      announce("Saved progress cleared.");
    });
    $("#save-file").addEventListener("click", function () {
      saveFile("appeal-assist-progress.json", JSON.stringify(S, null, 2), "application/json").then(announce);
    });
    $("#load-file").addEventListener("change", function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          S = adopt(JSON.parse(reader.result));
          go(S.step);
          announce("Progress loaded from file.");
        } catch (err) {
          announce("That file could not be read as saved progress.");
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    });
  }

  bind();
  render();
})();
