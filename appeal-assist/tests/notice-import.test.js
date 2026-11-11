const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const R = require('../js/reader');
const C = require('../js/composer');
const L = require('../js/letter');
const text = fs.readFileSync(__dirname + '/fixtures/knee-notice.txt', 'utf8');
function parse(t=text) { return R.parseNoticeText(t, {knownPlans:['Healthfirst Silver Leaf Plan']}); }
test('knee notice: actual admission, exact reason, date, mailing address and all appeal sections', () => {
 const p=parse(); assert.match(p.service,/planned inpatient acute care hospital admission following an elective left total knee replacement/i);
 assert.doesNotMatch(p.service,/has reviewed|Medically Necessary\)\)/); assert.equal(p.noticeDate,'2026-10-27');
 assert.equal(p.appealsAddress,'Healthfirst Appeals & Grievances Department, P.O. Box 5166, New York, NY 10274-5166');
 assert.match(p.reason,/procedure itself \(CPT 27447\) is a covered benefit/); assert.match(p.instructions,/By Fax/); assert.match(p.instructions,/EXTERNAL APPEAL RIGHTS/);
});
test('synthetic identity is explicit and missing fields are not invented', () => {
 const p=parse(); const base={details:p,sender:{appealsAddress:p.appealsAddress},planned:true};
 assert.doesNotMatch(C.compose(base),/Eleanor Vance|HF908234101/);
 const letter=C.compose({...base,syntheticIdentity:p.testIdentity});
 assert.match(letter,/Name: Eleanor Vance/); assert.match(letter,/HF908234101-01/); assert.match(letter,/PA-2026-0988412/);
 assert.match(letter,/Address: \[ADD: your mailing address\]/); assert.match(letter,/Phone: \[ADD:/);
 assert.match(letter,/clinician's explanation.*\[ADD:/s);
 assert.equal(L.findUnsupported(letter,[...Object.values(p).filter(x=>typeof x==='string'),...Object.values(p.testIdentity)]).length,0);
});
test('absent service/address stay empty, and letterhead is not appeals address', () => {
 const p=parse('Healthfirst\n100 Church Street\nNew York, NY 10007\nNotice Date: October 27, 2026');assert.equal(p.service,'');assert.equal(p.appealsAddress,'');
});
test('all existing built-in examples retain service extraction', () => {
 for(const s of require('../js/samples').SAMPLES)assert.equal(parse(R.sampleToText(s,'ACA marketplace')).service,s.service);
});
test('coverage distinction only when explicitly in supplied reason', () => {
 assert.match(C.explainDenial(parse().reason,parse().service,true).join(' '),/notice states that the surgical procedure is a covered benefit/);
 assert.match(C.explainDenial('Inpatient admission is not medically necessary.','Admission',true).join(' '),/does not, by itself/);
});

test('all practice addresses survive example download, import and letter composition', () => {
 for (const s of require('../js/samples').SAMPLES) {
  assert.match(s.appealsAddress, /TEST ONLY/);
  const p = parse(R.sampleToText(s, 'ACA marketplace'));
  assert.equal(p.appealsAddress, s.appealsAddress);
  assert.ok(C.compose({details:p, sender:{appealsAddress:p.appealsAddress}, planned:true}).includes(s.appealsAddress));
 }
});

test('each fictional notice keeps the receipt-based filing deadline through export and import', () => {
 for (const s of require('../js/samples').SAMPLES) {
  const exported = R.sampleToText(s, 'ACA marketplace');
  for (const instructions of [s.instructions, exported, parse(exported).instructions]) {
   assert.match(instructions, /180 calendar days after you receive this denial notice/);
   assert.match(instructions, /not automatically from the date printed/);
  }
 }
});

test('spinal fusion table uses the explicit inpatient request, not administrative review text', () => {
 const source=fs.readFileSync(__dirname+'/fixtures/spinal-notice.txt','utf8');
 for(const t of [source,source.replace(/\s+/g,' ')]) {
  const p=parse(t);
  assert.equal(p.service,'3-day acute care inpatient hospital admission following a planned single-level lumbar spine fusion (L4-L5)');
  assert.doesNotMatch(p.service,/review requested|has completed|Determination|\(Requested\)/i);
  assert.equal(p.noticeDate,'2026-11-03');
  assert.match(p.reason,/NOT medically necessary/);
  assert.match(p.appealsAddress,/P.O. Box 5166/);
  assert.ok(C.compose({details:p,sender:{appealsAddress:p.appealsAddress},planned:true}).includes(p.service));
 }
});
