const test = require("node:test");
const assert = require("node:assert/strict");
const Letter = require("../js/letter.js");
const Rules = require("../js/rules.js");
const { SAMPLES } = require("../js/samples.js");

const checklist = [
  { id: "records", label: "Records from the hospital stay", have: true },
  { id: "doctor", label: "Doctor statement", have: false }
];

test("three synthetic notices per covered combination", () => {
  for (const key of Object.keys(Rules.COMBINATIONS)) {
    const [state, type] = key.split("|");
    const n = SAMPLES.filter((s) => s.state === state && s.planType === type).length;
    assert.ok(n >= 3, `${key} has ${n} samples`);
  }
});

for (const sample of SAMPLES) {
  test(`letter for ${sample.id} repeats reason and invents nothing`, () => {
    const text = Letter.buildLetter(sample, checklist);
    if (sample.reason) assert.ok(text.includes(`"${sample.reason}"`), "reason repeated verbatim");
    if (sample.planName) assert.ok(text.includes(sample.planName));
    else assert.ok(text.includes("[ADD: plan name]"));
    if (!sample.noticeDate) assert.ok(text.includes("[ADD: date on your notice]"));
    // No dates other than the notice date the user confirmed.
    const years = text.match(/\b(19|20)\d{2}\b/g) || [];
    const allowed = sample.noticeDate ? [sample.noticeDate.slice(0, 4)] : [];
    for (const y of years) assert.ok(allowed.includes(y), `unexpected year ${y}`);
    // No money amounts, diagnosis codes or URLs.
    assert.doesNotMatch(text, /\$\s?\d/);
    assert.doesNotMatch(text, /\b[A-TV-Z]\d{2}\.\d{1,4}\b/);
    assert.doesNotMatch(text, /https?:\/\//);
    // Only checked items listed.
    assert.ok(text.includes("Records from the hospital stay"));
    assert.ok(!text.includes("Doctor statement"));
  });
}

test("empty details produce placeholders, not content", () => {
  const text = Letter.buildLetter({}, []);
  const gaps = Letter.findPlaceholders(text);
  assert.ok(gaps.includes("[ADD: denial reason exactly as written on your notice]"));
  assert.ok(gaps.includes("[ADD: list of documents you are enclosing]"));
});

test("dismissing a placeholder removes every copy", () => {
  const text = Letter.buildLetter({}, []);
  const gap = "[ADD: inpatient service that was denied]";
  assert.ok(text.split(gap).length > 2, "appears twice");
  const out = Letter.removePlaceholder(text, gap);
  assert.ok(!Letter.findPlaceholders(out).includes(gap));
});

test("downloads carry the reminder", () => {
  const txt = Letter.toPlainText("Body");
  const rtf = Letter.toRtf("Body {with} braces\\ and café");
  assert.ok(txt.startsWith(Letter.REMINDER));
  assert.ok(rtf.startsWith("{\\rtf1"));
  assert.ok(rtf.includes("no legal or medical advice"));
  assert.ok(rtf.includes("\\{with\\}"));
  assert.ok(rtf.includes("\\u233?"));
});

test("unverified rules never show", () => {
  assert.equal(Rules.isVerified({ citation: "x", sourceUrl: "y" }), false);
  for (const t of Rules.INSURANCE_TYPES) {
    const r = Rules.getRules("NY", t.id);
    assert.equal(r.covered, true);
    for (const d of r.deadlines) assert.ok(Rules.isVerified(d));
  }
  assert.equal(Rules.getRules("CA", "aca").covered, false);
  assert.equal(Rules.getRules("NY", "medicare").covered, false);
});

test("unsupported numbers are flagged, confirmed ones are not", () => {
  const d = { noticeDate: "2026-08-14", reason: "Stay not needed after day 3." };
  const text = Letter.buildLetter(d, []) + "\nI was admitted on 2025-01-01 with code I50.9.";
  const extra = Letter.findUnsupported(text, [d.noticeDate, d.reason]);
  assert.ok(extra.includes("2025-01-01"));
  assert.ok(extra.includes("50.9"));
  assert.ok(!extra.includes("2026"));
  assert.ok(!extra.includes("14"));
  assert.ok(!extra.includes("3"));
});

test("reason check ignores whitespace and case", () => {
  assert.ok(Letter.containsReason("They said \"not  Needed\" here", "not needed"));
  assert.ok(!Letter.containsReason("nothing", "not needed"));
});

test("own words replace the gap in the template", () => {
  const text = Letter.buildLetter({}, [], "I could not walk.");
  assert.ok(text.includes("I could not walk."));
  assert.ok(!text.includes("[ADD: in your own words"));
});

const Composer = require("../js/composer.js");
const Reader = require("../js/reader.js");

test("composer: every sample invents no numbers and quotes the reason", () => {
  const cl = [{ id: "records", have: true, attach: true }, { id: "doctor", have: true, attach: true }];
  for (const s of SAMPLES) for (const planned of [false, true]) {
    const text = Composer.compose({ details: s, checklist: cl, clinician: { text: "i felt very sick" }, planned });
    assert.deepEqual(Letter.findUnsupported(text, [s.noticeDate, s.reason, s.service, s.planName, s.instructions]), [], `${s.id} ${planned}`);
    assert.ok(Letter.containsReason(text, s.reason));
    assert.ok(text.includes("I felt very sick."));
    assert.doesNotMatch(text, /https?:|\$|§/);
  }
});
test("composer: always formal, same letter whatever tone or version is passed", () => {
  const d = SAMPLES[0];
  const a = Composer.compose({ details: d });
  assert.equal(a, Composer.compose({ details: d, tone: "warm", version: 3 }));
  assert.match(a, /respectfully/i);
});
test("composer: closing claims medical necessity only with the clinician's explanation", () => {
  const svc = SAMPLES[0].service.charAt(0).toLowerCase() + SAMPLES[0].service.slice(1);
  const t = Composer.compose({ details: SAMPLES[0], clinician: { text: "my oxygen was low" } });
  assert.ok(t.includes("My clinician's explanation of why inpatient care was needed:\nMy oxygen was low."));
  assert.ok(t.includes("Based on the aforementioned clinical information, I believe the " + svc + " was medically necessary. I therefore ask that you reverse your decision and approve coverage for " + svc + "."));
  assert.ok(!/send me (a copy|copies)/.test(t));
  for (const clinician of [{}, { text: "my oxygen was low", unsure: true }]) {
    const blank = Composer.compose({ details: SAMPLES[0], clinician });
    assert.ok(!blank.includes("medically necessary. I therefore"), "no necessity claim without explanation");
    assert.ok(blank.includes("[ADD: your clinician's explanation of why inpatient care was needed"));
    assert.ok(blank.includes("I ask that you reverse your decision and approve coverage for " + svc + "."));
  }
});

test("composer: a checked document is never described as supporting anything", () => {
  const t = Composer.compose({ details: SAMPLES[0], checklist: [{ id: "doctor", have: true, attach: true }, { id: "records", have: true, attach: true }] });
  assert.doesNotMatch(t, /supported by|give it careful weight|complete picture|additional clinical documentation provided/);
});
test("composer: reason kinds drive paragraphs", () => {
  assert.deepEqual(Composer.reasonKinds("Could have been treated in an outpatient setting."), ["setting"]);
  assert.ok(Composer.reasonKinds("Continued stay beyond day 3 did not meet criteria.").includes("length"));
  const noRecords = Composer.compose({ details: { reason: "Documentation did not support inpatient care." }, checklist: [] });
  assert.ok(noRecords.includes("[ADD: say whether you are sending records"));
  const planned = Composer.compose({ details: { reason: "The information submitted does not show that inpatient care is needed." }, planned: true });
  assert.ok(planned.includes("[ADD: say whether you will send records that support the planned admission]"));
});
test("reader: round trips every synthetic notice", () => {
  for (const s of SAMPLES) {
    const out = Reader.parseNoticeText(Reader.sampleToText(s, "Plan"));
    for (const f of ["planName", "service", "noticeDate", "reason", "instructions"]) {
      assert.equal(out[f], s[f] || "", `${s.id} ${f}`);
    }
  }
});

test("reader: free form notice", () => {
  const out = Reader.parseNoticeText("Sample Community Health Plan\nAugust 3, 2026\n\nRE: Inpatient admission\n\nWhy we denied your request:\nThe stay did not meet\ninpatient criteria.\n\nWhat to do if you disagree:\nFax the Appeals Unit.\n\nSincerely,");
  assert.equal(out.planName, "Sample Community Health Plan");
  assert.equal(out.noticeDate, "2026-08-03");
  assert.equal(out.service, "Inpatient admission");
  assert.equal(out.reason, "The stay did not meet inpatient criteria.");
  assert.equal(out.instructions, "Fax the Appeals Unit.");
});

test("reader: nothing found stays blank", () => {
  const out = Reader.parseNoticeText("hello there\nnothing useful");
  assert.deepEqual(out, { planName: "", service: "", noticeDate: "", reason: "", instructions: "" });
});

test("composer: personal details are placeholders only", () => {
  const text = Composer.compose({ details: SAMPLES[0], sender: { name: "Test Person", address: "1 Example Street", memberId: "X1", appealsAddress: "PO Box 1", date: "2026-09-30" } });
  assert.ok(!text.includes("Test Person") && !text.includes("1 Example Street") && !text.includes("X1"));
  for (const g of Composer.PRIVATE_GAPS) assert.ok(text.includes(g), g);
  assert.ok(text.includes("Name: [ADD: your full name]"));
  assert.ok(text.includes("Appeals address: PO Box 1"));
  assert.ok(text.includes("Date: September 30, 2026"));
  assert.ok(text.includes("To: " + SAMPLES[0].planName));
  assert.ok(text.trim().endsWith("[ADD: your signature and printed name]"));
});
test("stray brackets found and removed, placeholders kept", () => {
  const t = "Name: [Tareq]\nPhone: [ADD: your phone number]";
  assert.deepEqual(Letter.findStrayBrackets(t), ["[Tareq]"]);
  assert.equal(Letter.removeStrayBrackets(t), "Name: Tareq\nPhone: [ADD: your phone number]");
});

test("docx is a valid Word file", () => {
  const fs = require("fs"), os = require("os"), path = require("path"), cp = require("child_process");
  const bytes = Letter.toDocx("Name: Tareq & <Co>\n\nLine with café");
  const f = path.join(os.tmpdir(), "t-" + process.pid + ".docx");
  fs.writeFileSync(f, bytes);
  const out = cp.execFileSync("python3", ["-c", "import docx,sys; print('|'.join(p.text for p in docx.Document(sys.argv[1]).paragraphs))", f]).toString();
  assert.ok(out.includes("Name: Tareq & <Co>"));
  assert.ok(out.includes("Line with café"));
  assert.ok(out.includes("no legal or medical advice"));
});

test("enclosures list only what the user will attach, in first person", () => {
  const text = Composer.compose({ details: SAMPLES[0], checklist: [
    { id: "doctor", have: true, attach: true },
    { id: "records", have: true, attach: false }
  ] });
  assert.ok(text.includes("* A statement from my treating doctor"));
  assert.ok(!text.includes("Records from my hospital stay"));
  assert.ok(!text.includes("your treating doctor"));
  const none = Composer.compose({ details: SAMPLES[0], checklist: [{ id: "records", have: true, attach: false }] });
  assert.ok(none.includes("[ADD: documents you will attach, or delete this list]"));
  const planned = Composer.compose({ details: SAMPLES[6], planned: true, checklist: [{ id: "doctor", have: true, attach: true }] });
  assert.ok(planned.includes("* A letter from my clinician"));
});
test("reader: Word .docx notice made by Word tools is read", async () => {
  const fs = require("fs"), path = require("path");
  const buf = fs.readFileSync(path.join(__dirname, "fixtures", "notice-word.docx"));
  const file = new File([buf], "notice.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  const out = await Reader.readFile(file);
  assert.equal(out.planName, "Sample Riverside Health Plan (synthetic)");
  assert.equal(out.noticeDate, "2026-09-02");
  assert.equal(out.service, "Inpatient hospital stay, 3 days & 2 nights");
  assert.equal(out.reason, "The inpatient stay was not medically necessary because care could be given in an outpatient setting.");
  assert.equal(out.instructions, "Write to the Appeals Unit, PO Box 100, Albany NY. Fax 555 0100.");
});

test("reader: app's own Word example round trips", async () => {
  const Docx = require("../js/docx.js");
  const s = SAMPLES[0];
  const bytes = Docx.build(Reader.sampleToText(s, "Medicare").split("\n"));
  const out = await Reader.readFile(new File([bytes], "x.docx"));
  for (const f of ["planName", "service", "noticeDate", "reason", "instructions"]) assert.equal(out[f], s[f]);
});

test("reader: old .doc and photos get clear errors", async () => {
  await assert.rejects(Reader.readFile(new File(["x"], "old.doc")), (e) => e.code === "old_doc");
  await assert.rejects(Reader.readFile(new File(["x"], "p.png", { type: "image/png" })), (e) => e.code === "image");
});

test("team wording for the letter", () => {
  const t = Composer.compose({ details: SAMPLES[0] });
  assert.ok(t.includes("I respectfully request that you review your coverage decision and consider overturning it."));
  const withDocs = Composer.compose({ details: SAMPLES[0], checklist: [{ id: "notice", have: true, attach: true }] });
  assert.ok(withDocs.includes("I respectfully request that you review the enclosed documents and consider overturning your coverage decision."));
  assert.ok(!/do not agree|disagree|dispute/i.test(t));
});
test("opening names the plan and notice date", () => {
  const aca = SAMPLES.find((x) => x.id === "ny-aca-1");
  const t = Composer.compose({ details: aca, planned: true });
  assert.ok(t.includes("Please accept this letter as my formal appeal of the denial issued by Healthfirst Silver Leaf Plan in its notice dated August 1, 2026, which denied coverage for Planned inpatient admission for surgery."));
  const blank = Composer.compose({ details: {} });
  assert.ok(blank.includes("denial issued by [ADD: plan name] in its notice dated [ADD: date on your notice]"));
});

test("planned admission letter looks ahead, never back", () => {
  for (const s of SAMPLES.filter((x) => x.planType === "aca")) {
    assert.match(s.service, /^Planned/, s.id);
    assert.doesNotMatch(s.reason + s.service, /could have been|was not|were stable|discharge|after your surgery/i, s.id);
    const t = Composer.compose({ details: s, planned: true, clinician: { text: "needs monitoring after surgery" },
      checklist: [{ id: "records", have: true, attach: true }, { id: "doctor", have: true, attach: true }] });
    assert.doesNotMatch(t, /my stay|hospital stay|was needed|was medically|could have been|discharge/i, s.id);
    assert.ok(t.includes("inpatient care is needed"), s.id);
  }
});

test("plain explanation of the denial, without deciding who is right", () => {
  const aca = SAMPLES.find((x) => x.id === "ny-aca-1");
  const out = Composer.explainDenial(aca.reason, aca.service, true).join(" ");
  assert.ok(out.includes("The plan's stated reason is that it believes the care could be provided in an outpatient setting. The disagreement is about the need for inpatient admission."));
  assert.ok(out.includes("This does not, by itself, tell us whether the surgery is covered."));
  assert.ok(Composer.explainDenial("Admission criteria were not met.", "Inpatient admission", false).join(" ").includes("whether the treatment itself is covered"));
  assert.deepEqual(Composer.explainDenial("", "x", true), []);
});

test("Silver Leaf rules show with source and date checked, split by who acts", () => {
  const r = Rules.getRules("NY", "aca");
  assert.equal(r.teamConfirmed, false, "pending warning stays until the team confirms");
  assert.ok(r.deadlines.length && r.paths.length && r.contacts.length);
  for (const e of r.deadlines.concat(r.paths, r.contacts)) {
    assert.ok(Rules.isVerified(e));
    assert.match(e.citation, /Silver Leaf 2026.*page/);
    assert.equal(e.verifiedOn, "2026-10-28");
  }
  const you = r.deadlines.filter((d) => d.who === "you").map((d) => d.rule).join(" ");
  const plan = r.deadlines.filter((d) => d.who === "plan").map((d) => d.rule).join(" ");
  assert.ok(you.includes("180 calendar days") && you.includes("4 months"));
  assert.ok(plan.includes("30 calendar days") && plan.includes("72 hours"));
  assert.ok(r.contacts.some((c) => c.rule === "888-250-2220") && r.contacts.some((c) => c.rule === "877-779-2959"));
  assert.ok(r.missing.join(" ").includes("does not list a mailing address"));
  assert.equal(Rules.PLANS.aca[0].scenario, "planned");
});

test("downloads say plainly when the draft is incomplete", () => {
  const gappy = Letter.toPlainText("Name: [ADD: your full name]\nPhone: [ADD: your phone number]");
  assert.ok(gappy.startsWith(Letter.REMINDER + " NOT READY TO SEND: 2 items are still marked [ADD: ...]."));
  assert.ok(gappy.includes("[ADD: your full name]"), "placeholders kept");
  assert.equal(Letter.reminderFor("Done."), Letter.REMINDER);
  assert.ok(Letter.REMINDER.startsWith("DRAFT FOR HUMAN REVIEW"));
});

test("only ACA marketplace offered, with Silver Leaf as its one plan", () => {
  assert.deepEqual(Rules.INSURANCE_TYPES.map((t) => t.id), ["aca"]);
  assert.deepEqual(Rules.PLANS.aca.map((p) => p.label), ["Healthfirst Silver Leaf Plan"]);
  assert.ok(SAMPLES.every((s) => s.planType === "aca"));
});

test("examples: one stay after surgery per insurance type, others varied, Silver Leaf for ACA", () => {
  for (const type of Rules.INSURANCE_TYPES.map((t) => t.id)) {
    const list = SAMPLES.filter((x) => x.planType === type);
    assert.match(list[0].service, /surgery/i, type);
    assert.ok(list.some((x) => !/surgery/i.test(x.service)), type + " has a non surgery example");
  }
  for (const s of SAMPLES.filter((x) => x.planType === "aca")) assert.equal(s.planName, "Healthfirst Silver Leaf Plan");
});
