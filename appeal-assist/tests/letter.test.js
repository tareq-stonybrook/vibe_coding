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
  assert.equal(Rules.getRules("CA", "medicare").covered, false);
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

test("composer: every sample, tone and version invents no numbers and quotes the reason", () => {
  const cl = [{ id: "records", label: "Records from the hospital stay", have: true }, { id: "doctor", label: "Doctor statement", have: true }];
  for (const s of SAMPLES) for (const tone of ["plain", "formal", "warm"]) for (const version of [0, 1, 2, 3]) {
    const text = Composer.compose({ details: s, checklist: cl, ownWords: "i felt very sick", tone, version });
    assert.deepEqual(Letter.findUnsupported(text, [s.noticeDate, s.reason, s.service, s.planName, s.instructions]), [], `${s.id} ${tone} ${version}`);
    assert.ok(Letter.containsReason(text, s.reason));
    assert.ok(text.includes("I felt very sick."));
    assert.doesNotMatch(text, /https?:|\$|§/);
  }
});

test("composer: versions and tones differ", () => {
  const d = SAMPLES[0];
  const a = Composer.compose({ details: d, tone: "plain", version: 0 });
  assert.notEqual(a, Composer.compose({ details: d, tone: "plain", version: 1 }));
  assert.notEqual(a, Composer.compose({ details: d, tone: "formal", version: 0 }));
});

test("composer: reason kinds drive paragraphs", () => {
  assert.deepEqual(Composer.reasonKinds("Could have been treated in an outpatient setting."), ["setting"]);
  assert.ok(Composer.reasonKinds("Continued stay beyond day 3 did not meet criteria.").includes("length"));
  const noRecords = Composer.compose({ details: { reason: "Documentation did not support inpatient care." }, checklist: [] });
  assert.ok(noRecords.includes("[ADD: say whether you are sending records"));
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

test("composer: labeled header uses sender details", () => {
  const text = Composer.compose({ details: SAMPLES[0], sender: { name: "Test Person", address: "1 Example Street", date: "2026-09-30" } });
  assert.ok(text.includes("Name: Test Person"));
  assert.ok(text.includes("Address: 1 Example Street"));
  assert.ok(text.includes("Phone: [ADD: your phone number]"));
  assert.ok(text.includes("Date: September 30, 2026"));
  assert.ok(text.includes("To: " + SAMPLES[0].planName));
  assert.ok(text.trim().endsWith("Test Person"));
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

test("enclosures read in first person", () => {
  const text = Composer.compose({ details: SAMPLES[0], checklist: [{ id: "doctor", label: "A statement from your treating doctor", have: true }] });
  assert.ok(text.includes("* A statement from my treating doctor"));
  assert.ok(!text.includes("your treating doctor"));
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
