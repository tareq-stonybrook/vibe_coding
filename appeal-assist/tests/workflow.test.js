const test=require('node:test'), assert=require('node:assert/strict');
const S=require('../js/safety'), R=require('../js/reader'), C=require('../js/composer'), Rules=require('../js/rules');
const base={scopeConfirmed:true,state:'NY',planType:'aca',plan:'healthfirst-silver-leaf',careTiming:'planned',details:{planName:'Healthfirst Silver Leaf Plan',service:'Planned inpatient admission'}};
test('scope accepts planned Silver Leaf only and catches service contradictions',()=>{
 assert.equal(S.scopeError(base),'');
 for(const patch of [{careTiming:'received'},{careTiming:'unsure'},{scopeConfirmed:false},{details:{...base.details,planName:'Other Plan'}},{details:{...base.details,service:'Hospital stay already completed'}},{details:{...base.details,service:'Outpatient surgery'}}]) assert.ok(S.scopeError({...base,...patch}));
});
test('calendar dates: leap years, invalid dates, future and receipt order',()=>{
 assert.equal(S.validDate('2024-02-29'),true); assert.equal(S.validDate('2026-02-29'),false); assert.equal(S.validDate('2026-02-31'),false);
 assert.ok(S.dateError('2026-11-11','','2026-11-10')); assert.ok(S.dateError('2026-10-27','2026-10-26','2026-11-10'));
 assert.equal(R.parseNoticeText('Notice Date: February 31, 2026').noticeDate,'');
});
test('received date controls deadline and unknown receipt is explicitly estimated',()=>{
 const a=S.deadline('2026-10-27','',180,'2026-11-10'), b=S.deadline('2026-10-27','2026-10-30',180,'2026-11-10');
 assert.equal(a.iso,'2027-04-25'); assert.equal(a.estimated,true); assert.equal(b.iso,'2027-04-28'); assert.equal(b.estimated,false);
 assert.equal(S.deadline('2026-02-31','',180,'2026-11-10'),null);
 assert.equal(S.deadline('2026-01-01','',180,'2026-11-10').past,true);
});
test('home health example does not turn into outpatient claim',()=>{
 const d=require('../js/samples').SAMPLES[2];
 const text=C.explainDenial(d.reason,d.service,true).join(' ')+C.compose({details:d,planned:true});
 assert.match(text,/home health care/); assert.doesNotMatch(text,/outpatient setting/);
});
test('unrecognized reasons do not become invented medical necessity denials',()=>{
 assert.doesNotMatch(C.explainDenial('Request missing signature','Planned inpatient admission',true).join(' '),/not medically necessary/);
});
test('unverified legal boilerplate is excluded',()=>{assert.equal(Rules.getRules('NY','aca').legal,null);});
test('explicit plan label is not overwritten by a known plan mentioned elsewhere',()=>{
 assert.equal(R.parseNoticeText('Plan name: Other Insurance\nService: Planned inpatient admission\nHealthfirst Silver Leaf Plan mentioned for comparison',{knownPlans:['Healthfirst Silver Leaf Plan']}).planName,'Other Insurance');
});
