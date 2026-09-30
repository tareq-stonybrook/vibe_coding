/*
 * SYNTHETIC denial notices for testing. All plan names, dates and wording
 * are made up. They are not copies of any real notice and contain no real
 * patient information. Three notices per state and insurance type, per the
 * charter's definition of done.
 */
(function (root) {
  var SAMPLES = [
    // Medicare
    {
      id: "ny-medicare-1", state: "NY", planType: "medicare",
      planName: "Sample Senior Health Plan (synthetic)",
      service: "Inpatient hospital stay, 4 days",
      noticeDate: "2026-08-14",
      reason: "The inpatient admission was not medically necessary. The services could have been provided safely in an observation or outpatient setting.",
      instructions: "To appeal, write to the Appeals Unit at the address on page 2 of this notice. Include a copy of this notice."
    },
    {
      id: "ny-medicare-2", state: "NY", planType: "medicare",
      planName: "Sample Medicare Advantage Plan B (synthetic)",
      service: "Continued inpatient stay after day 3",
      noticeDate: "2026-07-02",
      reason: "Continued hospital care beyond day 3 did not meet medical necessity criteria. Your condition was stable for discharge.",
      instructions: "You or someone acting for you may request a reconsideration in writing. See the back of this page for mailing and fax details."
    },
    {
      id: "ny-medicare-3", state: "NY", planType: "medicare",
      planName: "Sample Health Plan C (synthetic)",
      service: "Inpatient rehabilitation admission",
      noticeDate: "2026-09-05",
      reason: "Documentation did not show that you required an inpatient level of care.",
      instructions: ""
    },
    // Medicaid
    {
      id: "ny-medicaid-1", state: "NY", planType: "medicaid",
      planName: "Sample Community Care Plan (synthetic)",
      service: "Inpatient hospital admission, 3 days",
      noticeDate: "2026-08-20",
      reason: "The hospital stay was not medically necessary because your symptoms could have been treated in an outpatient setting.",
      instructions: "To ask for a plan appeal, call Member Services or write to the address in the enclosed appeal form."
    },
    {
      id: "ny-medicaid-2", state: "NY", planType: "medicaid",
      planName: "Sample Managed Care Plan D (synthetic)",
      service: "Inpatient psychiatric stay",
      noticeDate: "2026-06-30",
      reason: "The records received did not support inpatient care. A lower level of care was appropriate.",
      instructions: "Complete the attached appeal form and return it by mail or fax."
    },
    {
      id: "ny-medicaid-3", state: "NY", planType: "medicaid",
      planName: "",
      service: "Inpatient surgical admission",
      noticeDate: "",
      reason: "Admission criteria were not met.",
      instructions: ""
    },
    // ACA marketplace
    {
      id: "ny-aca-1", state: "NY", planType: "aca",
      planName: "Sample Marketplace Silver Plan (synthetic)",
      service: "Inpatient hospital stay, 5 days",
      noticeDate: "2026-08-01",
      reason: "The inpatient stay was denied as not medically necessary under the plan's clinical review criteria.",
      instructions: "You may file an internal appeal by writing to the Grievance and Appeals Department listed below."
    },
    {
      id: "ny-aca-2", state: "NY", planType: "aca",
      planName: "Sample Marketplace Bronze Plan E (synthetic)",
      service: "Inpatient observation converted to admission",
      noticeDate: "2026-09-12",
      reason: "The level of care billed was not supported. Observation status was appropriate.",
      instructions: "Send your appeal and any supporting documents to the address on the last page."
    },
    {
      id: "ny-aca-3", state: "NY", planType: "aca",
      planName: "Sample Marketplace Gold Plan F (synthetic)",
      service: "Inpatient stay for pneumonia treatment",
      noticeDate: "2026-07-18",
      reason: "Medical necessity was not established for days 2 through 4 of the stay.",
      instructions: ""
    },
    // Employer plan
    {
      id: "ny-employer-1", state: "NY", planType: "employer",
      planName: "Sample Employer Group Plan (synthetic)",
      service: "Inpatient hospital stay, 2 days",
      noticeDate: "2026-08-25",
      reason: "The inpatient admission was not medically necessary based on the information submitted.",
      instructions: "To appeal, send a written request to the Claims Review Unit at the address shown on this notice."
    },
    {
      id: "ny-employer-2", state: "NY", planType: "employer",
      planName: "Sample Self-Funded Employer Plan G (synthetic)",
      service: "Inpatient cardiac monitoring stay",
      noticeDate: "2026-06-10",
      reason: "Services did not meet the plan's definition of medically necessary care.",
      instructions: "See the enclosed Summary of Appeal Rights."
    },
    {
      id: "ny-employer-3", state: "NY", planType: "employer",
      planName: "Sample Union Health Fund H (synthetic)",
      service: "Inpatient stay following emergency visit",
      noticeDate: "2026-09-01",
      reason: "The emergency department visit was covered. The following inpatient admission was not medically necessary.",
      instructions: "Appeals must be in writing. Mail to the Fund Office."
    }
  ];

  var api = { SAMPLES: SAMPLES };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealSamples = api;
})(this);
