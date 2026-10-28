/*
 * Example denial notices, made up for testing. Dates and wording are made up.
 * The ACA examples use the team's scenario plan name, Healthfirst Silver
 * Leaf Plan, but the notices themselves are invented. They are not copies
 * of any real notice and contain no real patient information. Three notices per state and insurance type, per the
 * charter's definition of done.
 */
(function (root) {
  var SAMPLES = [
    // Planned inpatient admissions denied as not medically necessary before
    // the stay (Preauthorization), all for the team's scenario plan. The
    // first example involves surgery (the team's main scenario).
    {
      id: "ny-aca-1", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Planned inpatient admission for surgery",
      noticeDate: "2026-08-01",
      reason: "Your request for a planned inpatient admission for surgery is denied as not medically necessary under the plan's clinical review criteria. The plan believes your care can be provided in an outpatient setting.",
      instructions: "You may ask for an internal appeal by phone, in person or in writing. Call Appeals at 888-250-2220. If waiting could seriously harm your health, ask for an expedited appeal at 877-779-2959."
    },
    {
      id: "ny-aca-2", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Planned inpatient admission for chemotherapy",
      noticeDate: "2026-09-12",
      reason: "The information submitted does not show that inpatient care is needed. Your treatment can be given in an outpatient infusion setting.",
      instructions: "Send your written appeal and any supporting documents to the Appeals Department at the address printed on this notice."
    },
    {
      id: "ny-aca-3", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Planned inpatient rehabilitation admission after hip replacement",
      noticeDate: "2026-07-18",
      reason: "Admission criteria for inpatient rehabilitation are not met. Home health care is appropriate.",
      instructions: ""
    }
  ];

  var api = { SAMPLES: SAMPLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealSamples = api;
})(this);
