(function(root){
  "use strict";
  function validDate(v) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v || "")) return false;
    var d = new Date(v + "T00:00:00Z");
    return !isNaN(d) && d.toISOString().slice(0,10) === v;
  }
  function dateError(notice, received, today) {
    if (notice && (!validDate(notice) || notice > today)) return "Check the notice date. Use a real date that is not in the future.";
    if (received && (!validDate(received) || received > today)) return "Check the received date. Use a real date that is not in the future.";
    if (received && notice && received < notice) return "The received date is before the notice date. Check both dates.";
    return "";
  }
  function scopeError(s) {
    if (s.noticeBlocked) return OUTPATIENT_MSG;
    if (!s.scopeConfirmed || s.state !== "NY" || s.planType !== "aca" || s.plan !== "healthfirst-silver-leaf") return "Confirm the supported plan before continuing.";
    if (s.careTiming !== "planned") return s.careTiming === "received" ? "Care already received is outside this test app's scope. Check your denial notice or contact your plan for the appropriate appeal process." : "Confirm whether the denied inpatient admission is still planned. If you are unsure, check with the care team before continuing.";
    var d=s.details || {};
    if (!/^healthfirst(?: phsp)? silver leaf(?: plan)?$/i.test((d.planName || "").trim())) return "This test supports only Healthfirst Silver Leaf. Check the plan name; other plans are not supported.";
    if (/already (received|completed|provided)|stay (already )?completed|retrospective|post[- ]service|was discharged/i.test(d.service || "")) return "The service appears to describe care already received. This test only covers a planned inpatient admission. Check the service and care timing.";
    if (notInpatient(d.service)) return "Enter the denied inpatient admission or hospital stay. Other services are outside this test's scope.";
    if (!s.inpatientConfirmed) return "Tick the box to confirm this is an inpatient denial notice.";
    return "";
  }
  // Outpatient care, or a service with no inpatient wording, is out of scope.
  // A blank service is not flagged here: the user types it in.
  var OUTPATIENT_MSG = "This app only supports inpatient denials. Please upload an inpatient denial notice or choose a fictional inpatient example.";
  function notInpatient(service) {
    var v = String(service || "");
    return /out[- ]?patient/i.test(v) || !/inpatient|hospital stay|admission/i.test(v);
  }
  function deadline(notice, received, days, today) {
    var base=received || notice;
    if (!base || dateError(notice,received,today)) return null;
    var due=new Date(base+"T00:00:00Z"); due.setUTCDate(due.getUTCDate()+days);
    var left=Math.round((due-new Date(today+"T00:00:00Z"))/86400000);
    return {iso:due.toISOString().slice(0,10),left:left,past:left<0,soon:left>=0&&left<=30,estimated:!received};
  }
  var api={validDate:validDate,dateError:dateError,scopeError:scopeError,deadline:deadline,notInpatient:notInpatient,OUTPATIENT_MSG:OUTPATIENT_MSG};
  if(typeof module!=="undefined"&&module.exports) module.exports=api; else root.AppealSafety=api;
})(this);
