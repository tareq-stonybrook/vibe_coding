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
  assert.deepEqual(out, { planName: "", service: "", noticeDate: "", reason: "", instructions: "", appealsAddress: "", planGuessed: false });
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
    assert.match(e.sourceUrl, /^https:\/\/assets\.healthfirst\.org\/.*silver-leaf-certificate-of-coverage/);
  }
  const you = r.deadlines.filter((d) => d.who === "you").map((d) => d.rule).join(" ");
  const plan = r.deadlines.filter((d) => d.who === "plan").map((d) => d.rule).join(" ");
  assert.ok(you.includes("180 calendar days") && you.includes("4 months"));
  assert.ok(plan.includes("30 calendar days") && plan.includes("72 hours"));
  const standard = r.deadlines.find((d) => d.label === "Decide a standard appeal").rule;
  assert.ok(standard.includes("2 business days") && standard.includes("inside that 30 day limit"));
  const external = r.deadlines.find((d) => d.label === "Ask for an external appeal");
  assert.ok(external.rule.includes("final denial") && external.rule.includes("waiver of the internal appeal"));
  assert.ok(external.countFrom.includes("waiver"));
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

test("composer: legal basis only from the checked list, with reference links", () => {
  const legal = Rules.getRules("NY", "aca").legal;
  assert.ok(legal && Rules.isVerified(legal));
  const s = SAMPLES[0];
  const t = Composer.compose({ details: s, planned: true, legal });
  assert.ok(t.includes(legal.paragraph));
  assert.ok(t.includes("References:\n1. Healthfirst Silver Leaf 2026 Certificate of Coverage"));
  assert.ok(t.includes("https://www.nysenate.gov/legislation/laws/PBH/4904"));
  assert.ok(t.includes("45 CFR 147.136"));
  assert.ok(t.indexOf("References:") > t.indexOf("[ADD: your signature"), "references after the signature");
  assert.deepEqual(Letter.findUnsupported(t, [s.noticeDate, s.reason, s.service, s.planName, s.instructions, Composer.legalText(legal)]), []);
  // No legal block for a combination without a checked list, and none unless passed.
  assert.equal(Rules.getRules("XX", "aca").legal, null);
  assert.doesNotMatch(Composer.compose({ details: s }), /References:|CFR|Public Health Law/);
});

// Shaped like a team member's synthetic notice (November 4, 2026 report):
// letterhead first, "Reason for Adverse Determination", capital headings.
const TEAM_NOTICE = [
  "HEALTH INSURANCE PLAN, INC. | NY STATE OF HEALTH MARKETPLACE",
  "NOTICE OF ADVERSE DETERMINATION",
  "Date of Notice: October 15, 2026",
  "Member Name: Jane Sample",
  "Member ID: XX0000000",
  "Requested Service: Acute care inpatient hospital admission (3 days) after single-level lumbar spine fusion",
  "Requesting Provider: Dr. A. Example",
  "",
  "Reason for Adverse Determination: Your spine surgeon requested prior approval for a 3-",
  "day acute care inpatient hospital admission following a planned single-level",
  "lumbar spine fusion (L4-L5). While single-level lumbar fusion is a covered beneﬁt",
  "under your Healthﬁrst Silver Leaf Plan when criteria are met, our medical reviewer",
  "determined that an acute care inpatient hospital admission is NOT medically",
  "necessary.",
  "",
  "The surgery can be done with an overnight observation stay.",
  "",
  "YOUR RIGHT TO APPEAL",
  "You or your provider may ask for an internal appeal within 180 calendar days",
  "of receiving this notice. Call 888-250-2220 or write to the address below.",
  "Expedited Appeals",
  "If waiting could seriously harm your health, call 877-779-2959.",
  "",
  "Sincerely,",
  "Utilization Management"
].join("\n");

test("reader: team style notice fills all five fields", () => {
  const out = Reader.parseNoticeText(TEAM_NOTICE, { knownPlans: ["Healthfirst Silver Leaf Plan"] });
  assert.equal(out.planName, "Healthfirst Silver Leaf Plan");
  assert.equal(out.noticeDate, "2026-10-15");
  assert.equal(out.service, "Acute care inpatient hospital admission (3 days) after single-level lumbar spine fusion");
  assert.ok(out.reason.startsWith("Your spine surgeon requested prior approval for a 3-day acute care"), out.reason);
  assert.ok(out.reason.includes("covered benefit under your Healthfirst Silver Leaf Plan"), out.reason);
  assert.ok(out.reason.endsWith("overnight observation stay."), out.reason);
  assert.ok(out.instructions.startsWith("You or your provider may ask for an internal appeal"), out.instructions);
  assert.ok(out.instructions.includes("Expedited Appeals: If waiting could seriously harm your health"), out.instructions);
  assert.ok(!/Sincerely|Utilization/.test(out.instructions));
  // Without a known plan, the letterhead is still used.
  assert.equal(Reader.parseNoticeText(TEAM_NOTICE).planName, "HEALTH INSURANCE PLAN, INC. | NY STATE OF HEALTH MARKETPLACE");
});

test("reader: PDF pieces split at a ligature join back into words", () => {
  const item = (str, x, w, eol) => ({ str, transform: [1, 0, 0, 10, x, 700], width: w, hasEOL: Boolean(eol) });
  const text = Reader.pageText({ items: [item("covered bene", 0, 60), item("fi", 60, 5), item("t under your", 65, 55), item("Health", 123, 30), item("fi", 153, 5), item("rst Plan", 158, 40, true)] });
  assert.equal(text, "covered benefit under your Healthfirst Plan\n");
});

test("reader: other heading wordings", () => {
  const out = Reader.parseNoticeText("Some Health Plan\nDate: 2026-01-05\nService Requested: Inpatient stay\nClinical Rationale:\nNot needed.\nHow to Appeal This Decision\nWrite to us.\nQuestions? Call us.");
  assert.equal(out.service, "Inpatient stay");
  assert.equal(out.reason, "Not needed.");
  assert.equal(out.instructions, "Write to us.");
});

test("reader: phone lines under a service label never fill the service field", () => {
  const labels = ["Customer Service", "Member Service", "Service Line", "Services Phone",
    "Utilization Management Services", "Customer Service Center", "Service Hotline"];
  labels.forEach((label) => {
    const out = Reader.parseNoticeText("Some Health Plan\n" + label + ": 1-888-250-2220\nRequested Service: Inpatient admission for surgery");
    assert.equal(out.service, "Inpatient admission for surgery", label);
  });
  const only = Reader.parseNoticeText("Some Health Plan\nService: Call 1-888-250-2220");
  assert.equal(only.service, "");
});

// Fictional notices written the ways testers wrote theirs (November 2026
// feedback): a plain letter, a table of labels, and labels on their own line.
const KNOWN = { knownPlans: ["Healthfirst Silver Leaf Plan"] };
const LETTER_NOTICE = [
  "Healthfirst", "100 Example Street", "New York, NY 10007", "", "October 20, 2026", "",
  "Jane Sample", "12 Example Road", "Brooklyn, NY 11201", "",
  "Member ID: XX0000000", "Date of Birth: 01/01/1970", "Reference Number: 000-EXAMPLE", "",
  "Dear Jane Sample:", "",
  "We received a request from Dr. A. Example for a planned inpatient admission for total knee replacement surgery at Example Hospital. After review, we have denied this request because it is not medically necessary.", "",
  "Why did we deny this request?",
  "The records do not show that you need to be admitted to the hospital. This surgery can be safely done in an outpatient setting.", "",
  "What can you do if you disagree?",
  "You have 180 calendar days to ask for an internal appeal. Call Member Services at 1-888-250-2220, or mail your appeal to:",
  "Healthfirst Appeals Department", "P.O. Box 0000", "New York, NY 10274", "",
  "If you have questions, call Member Services at 1-888-250-2220.", "", "Sincerely,", "Medical Management"
].join("\n");

test("reader: plain letter notice, service named in a sentence", () => {
  const out = Reader.parseNoticeText(LETTER_NOTICE, KNOWN);
  assert.equal(out.service, "Planned inpatient admission for total knee replacement surgery");
  assert.equal(out.noticeDate, "2026-10-20", "not the birth date");
  assert.ok(out.reason.startsWith("The records do not show") && out.reason.endsWith("outpatient setting."), out.reason);
  assert.ok(out.instructions.startsWith("You have 180 calendar days") && out.instructions.endsWith("New York, NY 10274"), out.instructions);
  assert.equal(out.appealsAddress, "Healthfirst Appeals Department, P.O. Box 0000, New York, NY 10274");
  assert.equal(out.planName, "Healthfirst");
  assert.equal(out.planGuessed, true, "letterhead plan name is marked as a guess");
});

test("reader: letter with no headings at all", () => {
  const out = Reader.parseNoticeText([
    "Healthfirst Silver Leaf Plan", "Customer Service 1-888-250-2220", "", "Date: November 2, 2026",
    "Re: Notice of Denial of Medical Coverage", "", "Dear Member,", "",
    "This letter is to tell you that your request for inpatient hospital admission for chemotherapy has been denied.", "",
    "We denied this service because the information provided does not show that inpatient care is needed.", "",
    "You can appeal this decision. To file an appeal, call 1-888-250-2220 or write to Healthfirst Appeals Department, PO Box 0000, New York, NY 10274 within 180 days.", "",
    "Sincerely,", "Healthfirst"].join("\n"), KNOWN);
  assert.equal(out.service, "Inpatient hospital admission for chemotherapy", "not the notice title on the Re line");
  assert.equal(out.reason, "We denied this service because the information provided does not show that inpatient care is needed.");
  assert.ok(out.instructions.startsWith("You can appeal this decision."), out.instructions);
  assert.equal(out.appealsAddress, "Healthfirst Appeals Department, PO Box 0000, New York, NY 10274");
  assert.equal(out.planGuessed, false);
});

test("reader: service setting labels", () => {
  const table = Reader.parseNoticeText([
    "HEALTHFIRST SILVER LEAF PLAN", "INITIAL ADVERSE DETERMINATION", "Notice Date: 10/22/2026", "DOB: 01/01/2019",
    "Member Services: 1-888-250-2220", "Service Type: Inpatient", "Place of Service: Inpatient Hospital",
    "Service Description: Elective inpatient admission for", "laparoscopic cholecystectomy",
    "Dates of Service: 11/15/2026 to 11/17/2026", "Decision: Denied",
    "Denial Reason: Not medically necessary.", "APPEAL RIGHTS", "Call 1-888-250-2220.",
    "Mail written appeals to: Healthfirst, Appeals and Grievances, P.O. Box 0000, New York, NY 10274-0000"].join("\n"), KNOWN);
  assert.equal(table.service, "Elective inpatient admission for laparoscopic cholecystectomy", "wrapped value joined");
  assert.equal(table.noticeDate, "2026-10-22");
  assert.equal(table.reason, "Not medically necessary.");
  assert.equal(table.appealsAddress, "Healthfirst, Appeals and Grievances, P.O. Box 0000, New York, NY 10274-0000");
  // The procedure does not say where, so the setting is added to it.
  const proc = Reader.parseNoticeText("Some Health Plan\nDate of Notice: November 1, 2026\nService Setting: Inpatient hospital\nProcedure: Lumbar spinal fusion\nReason for Denial: Not needed.");
  assert.equal(proc.service, "Lumbar spinal fusion (Inpatient hospital)");
  // Only a setting is given.
  assert.equal(Reader.parseNoticeText("Some Health Plan\nLevel of Care: Inpatient admission\nReason: Not needed.").service, "Inpatient admission");
});

test("reader: label on one line, value on the next", () => {
  const out = Reader.parseNoticeText([
    "Healthfirst Silver Leaf Plan", "Notice of Adverse Benefit Determination", "Date of notice", "October 30, 2026",
    "Inpatient service denied", "Planned inpatient admission for hip replacement surgery",
    "Why we denied it", "Inpatient care is not medically necessary.", "How to appeal", "Call Appeals at 888-250-2220."].join("\n"), KNOWN);
  assert.equal(out.noticeDate, "2026-10-30");
  assert.equal(out.service, "Planned inpatient admission for hip replacement surgery");
  assert.equal(out.reason, "Inpatient care is not medically necessary.");
  assert.equal(out.instructions, "Call Appeals at 888-250-2220.");
  assert.equal(out.appealsAddress, "");
});

test("reader: phone number under the service label falls back to the sentence", () => {
  const out = Reader.parseNoticeText("Some Health Plan\nInpatient Service Denied: 1-888-250-2220\nWe have denied coverage for your planned inpatient admission for hysterectomy.\nReason: Not medically necessary.");
  assert.equal(out.service, "Planned inpatient admission for hysterectomy");
});

test("reader: dates in other formats, and no address without a ZIP code", () => {
  assert.equal(Reader.findDate("Oct 5, 2026"), "2026-10-05");
  assert.equal(Reader.findDate("5 October 2026"), "2026-10-05");
  assert.equal(Reader.findDate("10/05/26"), "2026-10-05");
  assert.equal(Reader.findDate("October 5, 2026 and 01/01/1970"), "2026-10-05", "first date wins");
  assert.equal(Reader.parseNoticeText("Some Health Plan\nHow to appeal:\nWrite to the Appeals Unit, PO Box 100, Albany NY.").appealsAddress, "");
  assert.equal(Reader.parseNoticeText("Some Health Plan\n\nJane Sample\n1 Example Road\nAlbany, NY 12201\n\nYou may appeal.").appealsAddress, "", "member address is never used");
});

// A tester's fictional PDF notice (November 10, 2026 report): a title line
// with the word "Services", a body sentence under it, a label inside
// brackets, and words split at "fi". The service once read "Healthfirst has
// reviewed the prior authorization request ... Based on (Medically Necessary))".
const PDF_NOTICE = [
  "HEALTH INSURANCE PLAN, INC. | NY STATE OF HEALTH MARKETPLACE", "NOTICE OF ADVERSE DETERMINATION",
  "Date of Notice: October 27, 2026", "Member Name: Jane Sample", "Denial of Inpatient Hospital Services",
  "Healthfirst has reviewed the prior authorization request submitted by your provider on October 22, 2026. Based on",
  "the clinical information received, the request below is not approved.",
  "Determination (Level of Care: Not", "Medically Necessary)",
  "Reason for Adverse Determination: Your spine surgeon requested prior approval for a 3-",
  "day acute care inpatient hospital admission following a planned single-level",
  "lumbar spine fusion (L4-L5). While single-level lumbar fusion is a covered bene fi t",
  "under your Health fi rst Silver Leaf Plan when criteria are met, the fi rst review found it is NOT medically",
  "necessary.",
  "YOUR RIGHT TO APPEAL", "You may ask for an internal appeal within 180 calendar days. Call 888-250-2220 or write to:",
  "Healthfirst Appeals Department", "P.O. Box 0000", "New York, NY 10274", "Sincerely,", "Utilization Management"];

test("reader: PDF notice with a title line, bracket label and split words", () => {
  const SERVICE = "3-day acute care inpatient hospital admission following a planned single-level lumbar spine fusion (L4-L5)";
  // As lines, as one run of text with no line breaks, and part way between.
  const shapes = { lines: PDF_NOTICE.join("\n"), flat: PDF_NOTICE.join(" "), mixed: PDF_NOTICE.slice(0, 5).join("\n") + "\n" + PDF_NOTICE.slice(5).join(" ") };
  for (const [name, text] of Object.entries(shapes)) {
    const out = Reader.parseNoticeText(text, KNOWN);
    assert.equal(out.service, SERVICE, name);
    assert.equal(out.noticeDate, "2026-10-27", name);
    assert.ok(out.reason.startsWith("Your spine surgeon requested prior approval for a 3-day acute care"), name + ": " + out.reason);
    assert.ok(out.reason.includes("covered benefit under your Healthfirst Silver Leaf Plan"), name + ": split words joined");
    assert.ok(out.reason.includes("the first review"), name + ": a real space is kept");
    assert.ok(out.reason.endsWith("necessary."), name + ": " + out.reason);
    assert.ok(out.instructions.startsWith("You may ask for an internal appeal") && out.instructions.endsWith("NY 10274"), name + ": " + out.instructions);
    assert.match(out.appealsAddress, /^Healthfirst Appeals Department,? P\.O\. Box 0000,? New York, NY 10274$/, name);
  }
});

test("reader: a sentence or a half bracket is never the service", () => {
  const out = Reader.parseNoticeText("Some Health Plan\nSERVICE DENIED\nWe have reviewed the request sent by your provider. Based on\nReason: Not needed.");
  assert.equal(out.service, "");
  assert.equal(Reader.parseNoticeText("Some Health Plan\nDecision (Level of Care: Not\nMedically Necessary)\nReason: Not needed.").service, "");
});
