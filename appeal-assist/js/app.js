(function () {
  "use strict";

  var Rules = window.AppealRules;
  var Samples = window.AppealSamples.SAMPLES;
  var Letter = window.AppealLetter;

  var STORAGE_KEY = "appealAssist.v1";
  var STEP_NAMES = ["Start", "Your plan", "Notice", "Options", "Checklist", "Draft", "Review", "Download"];
  var CHECKLIST = [
    { id: "notice", label: "A copy of the denial notice" },
    { id: "records", label: "Records from the hospital stay, such as admission notes, progress notes and the discharge summary" },
    { id: "doctor", label: "A statement from your treating doctor about why hospital care was needed" },
    { id: "planDocs", label: "The documents and criteria the plan used to make its decision (you can ask the plan for these)" },
    { id: "coverage", label: "Your plan's coverage document, such as the member handbook or evidence of coverage" },
    { id: "log", label: "Your own notes: dates, calls, and names of people you spoke with" }
  ];
  var DETAIL_FIELDS = ["planName", "service", "noticeDate", "reason", "instructions"];

  function freshState() {
    return {
      step: 0,
      ack: false,
      state: "",
      planType: "",
      details: { planName: "", service: "", noticeDate: "", reason: "", instructions: "" },
      checklist: CHECKLIST.map(function (c) { return { id: c.id, label: c.label, have: false }; }),
      letter: "",
      letterEdited: false,
      reviewed: false
    };
  }

  var S = freshState();

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
      if (k in obj) base[k] = obj[k];
    });
    base.details = Object.assign(freshState().details, obj.details || {});
    var have = {};
    (obj.checklist || []).forEach(function (c) { have[c.id] = Boolean(c.have); });
    base.checklist.forEach(function (c) { c.have = Boolean(have[c.id]); });
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
  function typeLabel(id) {
    var t = Rules.INSURANCE_TYPES.filter(function (x) { return x.id === id; })[0];
    return t ? t.label : "";
  }
  function stateLabel(id) {
    var s = Rules.STATES.filter(function (x) { return x.id === id; })[0];
    return s ? s.label : "";
  }
  function showError(section, msg) {
    var box = section.querySelector(".error");
    if (!box) {
      box = el("p", { "class": "error", role: "alert" });
      section.querySelector(".actions").before(box);
    }
    box.textContent = msg;
  }
  function clearError(section) {
    var box = section.querySelector(".error");
    if (box) box.remove();
  }
  function download(filename, content, type) {
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ---------- step navigation ----------
  function validate(step) {
    if (step === 0 && !S.ack) return "Please check the box to confirm you understand what this guide does.";
    if (step === 1 && !S.state) return "Please choose your state.";
    if (step === 1 && !S.planType) return "Please choose your insurance type.";
    if (step === 6 && Letter.findPlaceholders(S.letter).length) return "Fill in or dismiss every gap before download.";
    if (step === 6 && !S.reviewed) return "Please confirm you read the whole letter.";
    return "";
  }

  function go(step) {
    S.step = Math.max(0, Math.min(STEP_NAMES.length - 1, step));
    render();
    save();
    var section = $('.step[data-step="' + S.step + '"]');
    var h = section.querySelector("h1");
    h.setAttribute("tabindex", "-1");
    h.focus();
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
      else if (i < S.step) li.className = "done";
      list.appendChild(li);
    });
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
        var row = el("div", { "class": "radio" });
        var input = el("input", { type: "radio", name: "planType", id: "pt-" + t.id, value: t.id, "aria-describedby": "pt-" + t.id + "-hint" });
        var wrap = el("div");
        wrap.appendChild(el("label", { "for": "pt-" + t.id }, t.label));
        wrap.appendChild(el("p", { "class": "hint", id: "pt-" + t.id + "-hint" }, t.hint));
        row.appendChild(input);
        row.appendChild(wrap);
        box.appendChild(row);
      });
    }
    $all('input[name="planType"]').forEach(function (r) { r.checked = r.value === S.planType; });
  }

  function renderNotice() {
    var sel = $("#sample");
    sel.innerHTML = "";
    var matching = Samples.filter(function (s) {
      return (!S.state || s.state === S.state) && (!S.planType || s.planType === S.planType);
    });
    matching.forEach(function (s, i) {
      sel.appendChild(el("option", { value: s.id }, "Synthetic notice " + (i + 1) + ": " + stateLabel(s.state) + ", " + typeLabel(s.planType)));
    });
    DETAIL_FIELDS.forEach(function (f) { $("#" + f).value = S.details[f] || ""; });
  }

  function renderGuide() {
    var rules = Rules.getRules(S.state, S.planType);
    $("#guide-context").textContent = "Showing results for " + stateLabel(S.state) + " and " + typeLabel(S.planType) + ".";

    var reasonBox = $("#guide-reason");
    reasonBox.innerHTML = "";
    reasonBox.appendChild(el("h2", {}, "The reason you were given"));
    if (S.details.reason.trim()) reasonBox.appendChild(el("blockquote", {}, S.details.reason.trim()));
    else reasonBox.appendChild(el("p", {}, "You have not entered the denial reason yet. Go back to add it, or fill it in later in the letter."));

    var box = $("#guide-rules");
    box.innerHTML = "";
    var card = el("div", { "class": "card" });
    card.appendChild(el("h2", {}, "Appeal paths and deadlines"));

    if (!rules.deadlines.length && !rules.paths.length) {
      var note = el("div", { "class": "card note", role: "note" });
      note.appendChild(el("p", {}, "We have not yet verified appeal rules or deadlines for " + stateLabel(S.state) + " and " + typeLabel(S.planType) + " against an official source, so we do not show them here."));
      note.appendChild(el("p", {}, "Check your denial notice and your plan documents for the appeal steps and the deadline. If anything is unclear, call the phone number on your notice or insurance card."));
      card.appendChild(note);
    } else {
      rules.paths.forEach(function (p) { card.appendChild(renderRule(p)); });
      rules.deadlines.forEach(function (d) { card.appendChild(renderRule(d)); });
    }

    var help = Rules.HELP_LINKS[S.planType] || Rules.HELP_LINKS.general;
    var p = el("p", {}, "Official help: ");
    var a = el("a", { href: help.url, target: "_blank", rel: "noopener" }, help.label);
    p.appendChild(a);
    card.appendChild(p);
    box.appendChild(card);

    var instr = $("#guide-instructions");
    instr.innerHTML = "";
    instr.appendChild(el("h2", {}, "Appeal instructions from your notice"));
    if (S.details.instructions.trim()) instr.appendChild(el("blockquote", {}, S.details.instructions.trim()));
    else instr.appendChild(el("p", {}, "You did not enter appeal instructions. Look on your notice for a section like \"Your right to appeal\"."));
  }

  function renderRule(r) {
    var wrap = el("dl", { "class": "deadline" });
    function row(k, v) {
      wrap.appendChild(el("dt", {}, k));
      wrap.appendChild(el("dd", {}, v));
    }
    row(r.label, r.rule);
    if (r.countFrom) row("Counted from", r.countFrom);
    if (typeof r.days === "number" && r.countFrom === "notice date" && S.details.noticeDate) {
      var d = new Date(S.details.noticeDate + "T00:00:00");
      d.setDate(d.getDate() + r.days);
      var iso = d.toISOString().slice(0, 10);
      row("Estimated date, based on the notice date you entered", Letter.formatDate(iso) + ". Confirm this on your notice.");
    }
    var dt = el("dt", {}, "Source");
    var dd = el("dd", {});
    dd.appendChild(el("a", { href: r.sourceUrl, target: "_blank", rel: "noopener" }, r.citation));
    wrap.appendChild(dt);
    wrap.appendChild(dd);
    row("Last verified", Letter.formatDate(r.verifiedOn));
    return wrap;
  }

  function renderChecklist() {
    var box = $("#checklist");
    box.innerHTML = "";
    S.checklist.forEach(function (c) {
      var row = el("div", { "class": "check" });
      var input = el("input", { type: "checkbox", id: "cl-" + c.id });
      input.checked = c.have;
      input.addEventListener("change", function () {
        c.have = input.checked;
        save();
      });
      row.appendChild(input);
      row.appendChild(el("label", { "for": "cl-" + c.id }, c.label));
      box.appendChild(row);
    });
  }

  function renderDraft() {
    if (!S.letter || !S.letterEdited) S.letter = Letter.buildLetter(S.details, S.checklist);
    $("#letter").value = S.letter;
  }

  function renderReview() {
    $("#letter-review").value = S.letter;
    $("#reviewed").checked = S.reviewed;
    renderReviewList();
  }

  function renderReviewList() {
    var list = $("#review-list");
    var gaps = Letter.findPlaceholders(S.letter);
    list.innerHTML = "";
    var card = el("div", { "class": gaps.length ? "card note" : "card" });
    if (!gaps.length) {
      card.appendChild(el("p", {}, "No gaps remain."));
    } else {
      card.appendChild(el("h2", {}, gaps.length + (gaps.length === 1 ? " gap remains" : " gaps remain")));
      gaps.forEach(function (g) {
        var row = el("div", { "class": "review-item" });
        row.appendChild(el("span", { "class": "ph" }, g));
        var btns = el("div", { "class": "inline" });
        var find = el("button", { type: "button", "class": "secondary small" }, "Go to it");
        find.setAttribute("aria-label", "Go to " + g + " in the letter");
        find.addEventListener("click", function () {
          var ta = $("#letter-review");
          var i = ta.value.indexOf(g);
          ta.focus();
          if (i >= 0) ta.setSelectionRange(i, i + g.length);
        });
        var dismiss = el("button", { type: "button", "class": "secondary small" }, "Dismiss");
        dismiss.setAttribute("aria-label", "Dismiss " + g + " and remove it from the letter");
        dismiss.addEventListener("click", function () {
          S.letter = Letter.removePlaceholder(S.letter, g);
          S.letterEdited = true;
          $("#letter-review").value = S.letter;
          renderReviewList();
          save();
          announce("Removed " + g);
        });
        btns.appendChild(find);
        btns.appendChild(dismiss);
        row.appendChild(btns);
        card.appendChild(row);
      });
    }
    list.appendChild(card);
    $("#to-download").disabled = Boolean(gaps.length) || !S.reviewed;
  }

  function renderDownload() {
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
      if (e.target.name === "planType") { S.planType = e.target.value; save(); }
    });

    DETAIL_FIELDS.forEach(function (f) {
      $("#" + f).addEventListener("input", function (e) { S.details[f] = e.target.value; save(); });
    });
    $("#load-sample").addEventListener("click", function () {
      var id = $("#sample").value;
      var s = Samples.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      DETAIL_FIELDS.forEach(function (f) { S.details[f] = s[f] || ""; });
      renderNotice();
      $("#sample").value = id;
      save();
      announce("Synthetic notice loaded. Review the fields below.");
    });

    $("#letter").addEventListener("input", function (e) {
      S.letter = e.target.value;
      S.letterEdited = true;
      S.reviewed = false;
      save();
    });
    $("#rebuild").addEventListener("click", function () {
      if (S.letterEdited && !window.confirm("Rebuilding replaces your edits with a fresh draft. Continue?")) return;
      S.letterEdited = false;
      S.letter = Letter.buildLetter(S.details, S.checklist);
      $("#letter").value = S.letter;
      save();
      announce("Draft rebuilt from your details.");
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

    $("#dl-rtf").addEventListener("click", function () {
      download("appeal-letter-draft.rtf", Letter.toRtf(S.letter), "application/rtf");
    });
    $("#dl-txt").addEventListener("click", function () {
      download("appeal-letter-draft.txt", Letter.toPlainText(S.letter), "text/plain;charset=utf-8");
    });

    $("#start-over").addEventListener("click", function () {
      if (!window.confirm("Start over and clear everything you entered?")) return;
      clearSaved();
      S = freshState();
      go(0);
    });
    $("#clear").addEventListener("click", function () {
      if (!window.confirm("Clear saved progress from this browser?")) return;
      clearSaved();
      S = freshState();
      go(0);
      announce("Saved progress cleared.");
    });
    $("#save-file").addEventListener("click", function () {
      download("appeal-assist-progress.json", JSON.stringify(S, null, 2), "application/json");
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
          window.alert("That file could not be read as saved progress.");
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    });
  }

  bind();
  render();
})();
