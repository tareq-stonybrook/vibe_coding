/*
 * SYNTHETIC denial notices for testing. Dates and wording are made up.
 * The ACA examples use the team's scenario plan name, Healthfirst Silver
 * Leaf Plan, but the notices themselves are invented. They are not copies
 * of any real notice and contain no real patient information. Three notices per state and insurance type, per the
 * charter's definition of done.
 */
(function (root) {
  var SAMPLES = [
    // Scenario for all examples: inpatient stay after surgery (post operative),
    // denied as not medically necessary.
    // Medicare
    {
      id: "ny-medicare-1", state: "NY", planType: "medicare",
      planName: "Sample Senior Health Plan (synthetic)",
      service: "Inpatient hospital stay after surgery, 4 days",
      noticeDate: "2026-08-14",
      reason: "The inpatient admission after your surgery was not medically necessary. Your post operative care could have been provided safely in an observation or outpatient setting.",
      instructions: "To appeal, write to the Appeals Unit at the address on page 2 of this notice. Include a copy of this notice."
    },
    {
      id: "ny-medicare-2", state: "NY", planType: "medicare",
      planName: "Sample Medicare Advantage Plan B (synthetic)",
      service: "Continued inpatient stay after surgery, post operative day 3 onward",
      noticeDate: "2026-07-02",
      reason: "Continued hospital care beyond post operative day 3 did not meet medical necessity criteria. Your condition was stable for discharge.",
      instructions: "You or someone acting for you may request a reconsideration in writing. See the back of this page for mailing and fax details."
    },
    {
      id: "ny-medicare-3", state: "NY", planType: "medicare",
      planName: "Sample Health Plan C (synthetic)",
      service: "Inpatient admission following outpatient surgery",
      noticeDate: "2026-09-05",
      reason: "Documentation did not show that you required an inpatient level of care after your procedure.",
      instructions: ""
    },
    // Medicaid
    {
      id: "ny-medicaid-1", state: "NY", planType: "medicaid",
      planName: "Sample Community Care Plan (synthetic)",
      service: "Inpatient hospital stay after surgery, 3 days",
      noticeDate: "2026-08-20",
      reason: "The hospital stay after your surgery was not medically necessary because your recovery could have been managed in an outpatient setting.",
      instructions: "To ask for a plan appeal, call Member Services or write to the address in the enclosed appeal form."
    },
    {
      id: "ny-medicaid-2", state: "NY", planType: "medicaid",
      planName: "Sample Managed Care Plan D (synthetic)",
      service: "Inpatient stay after surgery, 2 days",
      noticeDate: "2026-06-30",
      reason: "The records received did not support inpatient care after surgery. A lower level of care was appropriate.",
      instructions: "Complete the attached appeal form and return it by mail or fax."
    },
    {
      id: "ny-medicaid-3", state: "NY", planType: "medicaid",
      planName: "",
      service: "Inpatient stay after surgery",
      noticeDate: "",
      reason: "Admission criteria were not met.",
      instructions: ""
    },
    // ACA marketplace: the team's scenario plan
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
      service: "Continued inpatient stay after surgery, post operative day 2 onward",
      noticeDate: "2026-09-12",
      reason: "Continued inpatient care after post operative day 2 did not meet medical necessity criteria. You were stable for discharge.",
      instructions: "Send your appeal and any supporting documents to the address on the last page."
    },
    {
      id: "ny-aca-3", state: "NY", planType: "aca",
      planName: "Healthfirst Silver Leaf Plan",
      service: "Inpatient admission after surgery",
      noticeDate: "2026-07-18",
      reason: "The information submitted did not support an inpatient level of care after your procedure.",
      instructions: ""
    },
    // Employer plan
    {
      id: "ny-employer-1", state: "NY", planType: "employer",
      planName: "Sample Employer Group Plan (synthetic)",
      service: "Inpatient hospital stay after surgery, 2 days",
      noticeDate: "2026-08-25",
      reason: "The inpatient admission after your surgery was not medically necessary based on the information submitted.",
      instructions: "To appeal, send a written request to the Claims Review Unit at the address shown on this notice."
    },
    {
      id: "ny-employer-2", state: "NY", planType: "employer",
      planName: "Sample Self-Funded Employer Plan G (synthetic)",
      service: "Inpatient stay after surgery, 3 days",
      noticeDate: "2026-06-10",
      reason: "Post operative services did not meet the plan's definition of medically necessary care.",
      instructions: "See the enclosed Summary of Appeal Rights."
    },
    {
      id: "ny-employer-3", state: "NY", planType: "employer",
      planName: "Sample Union Health Fund H (synthetic)",
      service: "Inpatient stay after emergency surgery",
      noticeDate: "2026-09-01",
      reason: "The emergency surgery was covered. The inpatient stay after surgery was not medically necessary.",
      instructions: "Appeals must be in writing. Mail to the Fund Office."
    }
  ];

  var api = { SAMPLES: SAMPLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealSamples = api;
})(this);
