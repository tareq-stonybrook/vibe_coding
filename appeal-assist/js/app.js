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
      ownWords: "",
      tone: "plain",
      version: 0,
      letter: "",
      letterSource: "",
      letterEdited: false,
      reviewed: false
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
      if (k in obj && k !== "details" && k !== "checklist") base[k] = obj[k];
    });
    DETAIL_FIELDS.forEach(function (f) {
      if (obj.details && typeof obj.details[f] === "string") base.details[f] = obj.details[f];
    });
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
  function haveLabels() {
    return S.checklist.filter(function (c) { return c.have; }).map(function (c) { return c.label; });
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
            if (e && e.code === "unavailable") return blobDownload(filename, content, type);
            return "Download cancelled.";
          }
        );
      }
      return blobDownload(filename, content, type);
    });
  }
  function blobDownload(filename, content, type) {
    var url = URL.createObjectURL(new Blob([content], { type: type }));
    var a = el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    return "Downloaded " + filename + ".";
  }

  // ---------- step navigation ----------
  function validate(step) {
    if (step === 0 && !S.ack) return "Check the box to confirm you understand what this guide does.";
    if (step === 1 && !S.state) return "Choose your state.";
    if (step === 1 && !S.planType) return "Choose your insurance type.";
    if (step === 5 && !S.letter.trim()) return "Press Write my letter first.";
    if (step === 6 && Letter.findPlaceholders(S.letter).length) return "Fill in or dismiss every gap before download.";
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
    $("#guide-context").textContent = "Showing results for " + stateLabel(S.state) + " and " + typeLabel(S.planType) + ".";

    var reasonBox = $("#guide-reason");
    reasonBox.innerHTML = "";
    reasonBox.appendChild(el("h2", {}, "The reason you were given"));
    if (S.details.reason.trim()) reasonBox.appendChild(el("blockquote", {}, S.details.reason.trim()));
    else reasonBox.appendChild(el("p", {}, "You have not entered the denial reason yet. Go back to add it, or fill it in later in the letter."));

    var box = $("#guide-rules");
    box.innerHTML = "";
    var card = el("div", { "class": "tile" });
    card.appendChild(el("h2", {}, "Appeal paths and deadlines"));

    if (!rules.deadlines.length && !rules.paths.length) {
      var note = el("div", { "class": "warn", role: "note" });
      note.appendChild(el("p", {}, "We have not yet checked appeal rules or deadlines for " + stateLabel(S.state) + " and " + typeLabel(S.planType) + " against an official source, so we do not show them here."));
      note.appendChild(el("p", { style: "margin:0" }, "Check your denial notice and plan documents for the appeal steps and deadline. If anything is unclear, call the number on your notice or insurance card."));
      card.appendChild(note);
    } else {
      rules.paths.forEach(function (p) { card.appendChild(renderRule(p)); });
      rules.deadlines.forEach(function (d) { card.appendChild(renderRule(d)); });
    }

    var help = Rules.HELP_LINKS[S.planType] || Rules.HELP_LINKS.general;
    var p = el("p", { style: "margin:0" }, "Official help: ");
    p.appendChild(el("a", { href: help.url, target: "_blank", rel: "noopener" }, help.label));
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
      var d = new Date(S.details.noticeDate + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + r.days);
      row("Estimated date, based on the notice date you entered", Letter.formatDate(d.toISOString().slice(0, 10)) + ". Confirm this on your notice.");
    }
    wrap.appendChild(el("dt", {}, "Source"));
    var dd = el("dd", {});
    dd.appendChild(el("a", { href: r.sourceUrl, target: "_blank", rel: "noopener" }, r.citation));
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
    $("#ownWords").value = S.ownWords;
    $("#tone").value = S.tone;
    if (!S.letter || !S.letterEdited) writeLetter(S.version);
    $("#letter").value = S.letter;
    $("#another").hidden = !S.letter;
  }

  function writeLetter(version) {
    S.version = version;
    S.letter = Composer.compose({
      details: S.details,
      checklist: S.checklist,
      ownWords: S.ownWords,
      tone: S.tone,
      version: version
    });
    S.letterSource = "composer";
    S.letterEdited = false;
    S.reviewed = false;
    $("#letter").value = S.letter;
    $("#another").hidden = false;
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
    var sources = DETAIL_FIELDS.map(function (f) { return S.details[f]; }).concat([S.ownWords]).concat(haveLabels());
    var extra = Letter.findUnsupported(S.letter, sources);
    var reasonOk = Letter.containsReason(S.letter, S.details.reason);
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
    list.innerHTML = "";
    var card = el("div", { "class": "tile" });
    if (!gaps.length) {
      card.appendChild(el("p", { style: "margin:0" }, "No gaps remain."));
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
    renderWarnings();
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

  // ---------- notice upload ----------
  function pickFile(file) {
    noticeFile = file || null;
    var name = $("#file-name");
    name.hidden = !file;
    name.textContent = file ? "Selected: " + file.name : "";
    $("#read-notice").disabled = !file;
    setStatus("#read-status", "");
  }

  function readNotice() {
    if (!noticeFile) return;
    $("#read-notice").disabled = true;
    setStatus("#read-status", "Reading your notice.");
    Reader.readFile(noticeFile).then(function (out) {
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
      btn.textContent = btn.id === "another" ? "Write another version" : "Write my letter";
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
      if (e.target.name === "planType") { S.planType = e.target.value; save(); }
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
    $("#dl-sample").addEventListener("click", function () {
      var id = $("#sample").value;
      var s = Samples.filter(function (x) { return x.id === id; })[0];
      if (!s) return;
      saveFile("synthetic-notice-" + s.id + ".txt", Reader.sampleToText(s, typeLabel(s.planType)), "text/plain;charset=utf-8").then(announce);
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
    $("#ownWords").addEventListener("input", function (e) {
      S.ownWords = e.target.value;
      if (!S.letterEdited) writeLetter(S.version); else save();
    });
    $("#tone").addEventListener("change", function (e) {
      S.tone = e.target.value;
      if (!S.letterEdited) writeLetter(S.version); else save();
    });
    $("#write-letter").addEventListener("click", function () {
      confirmReplace($("#write-letter"), function () {
        writeLetter(S.version);
        setStatus("#letter-status", "Letter written from your details. Read it closely and edit anything.");
      });
    });
    $("#another").addEventListener("click", function () {
      confirmReplace($("#another"), function () {
        writeLetter(S.version + 1);
        setStatus("#letter-status", "New version written. Same facts, different wording.");
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

    $("#dl-rtf").addEventListener("click", function () {
      saveFile("appeal-letter-draft.rtf", Letter.toRtf(S.letter), "application/rtf").then(function (m) { setStatus("#dl-status", m); });
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
