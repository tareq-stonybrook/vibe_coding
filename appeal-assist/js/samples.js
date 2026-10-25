/*
 * Example denial notices, made up for testing. Dates and wording are made up.
 * The ACA examples use the team's scenario plan name, Healthfirst Silver
 * Leaf Plan, but the notices themselves are invented. They are not copies
 * of any real notice and contain no real patient information. Three notices per state and insurance type, per the
 * charter's definition of done.
 */
(function (root) {
  var SAMPLES = [
    // Inpatient stays denied as not medically necessary, all for the team's
    // scenario plan. The first example is a stay after surgery (the team's
    // main scenario). The others cover other common inpatient denials.
    {
      id: "ny-aca-1", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Inpatient hospital stay after surgery, 3 days",
      noticeDate: "2026-08-01",
      reason: "The inpatient stay after your surgery was denied as not medically necessary under the plan's clinical review criteria. Your post operative care could have been provided in an outpatient setting.",
      instructions: "You may file an internal appeal by writing to the Grievance and Appeals Department listed below."
    },
    {
      id: "ny-aca-2", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Inpatient hospital stay for pneumonia, 4 days",
      noticeDate: "2026-09-12",
      reason: "Inpatient care after day 2 did not meet medical necessity criteria. You were stable for discharge.",
      instructions: "Send your appeal and any supporting documents to the address on the last page."
    },
    {
      id: "ny-aca-3", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Inpatient admission for observation of chest pain",
      noticeDate: "2026-07-18",
      reason: "The information submitted did not support an inpatient level of care. Observation status was appropriate.",
      instructions: ""
    }
  ];

  var api = { SAMPLES: SAMPLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealSamples = api;
})(this);
