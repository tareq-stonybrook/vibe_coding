/*
 * Appeal rules data.
 *
 * Charter rule: show a rule or deadline ONLY after the team verifies it
 * against an official source. Until then, the app shows the fallback
 * message telling the user to check their notice and plan documents.
 *
 * To add a verified deadline, push an object into the matching
 * combination's `deadlines` array:
 *   {
 *     label: "File internal appeal",
 *     rule: "Plain language statement of the rule",
 *     days: 60,                        // number, or null if not a day count
 *     countFrom: "notice date",        // what the deadline is counted from
 *     citation: "Official citation text",
 *     sourceUrl: "https://official.source/page",
 *     verifiedOn: "YYYY-MM-DD",        // date the team checked the source
 *     verifiedBy: "Team member initials"
 *   }
 * Entries missing citation, sourceUrl or verifiedOn are ignored by the app.
 *
 * `helpLinks` point to official site home pages only. The team should
 * replace them with the exact help page after checking it.
 */
(function (root) {
  var INSURANCE_TYPES = [
    {
      id: "medicare",
      label: "Medicare",
      hint: "Red, white and blue Medicare card, or a Medicare Advantage plan card that names Medicare."
    },
    {
      id: "medicaid",
      label: "Medicaid",
      hint: "State Medicaid card or a managed care plan card that says Medicaid."
    },
    {
      id: "aca",
      label: "ACA marketplace plan",
      hint: "Plan bought through the health insurance marketplace. Your card or notice may say marketplace or exchange."
    },
    {
      id: "employer",
      label: "Employer plan",
      hint: "Coverage through your job or a family member's job. Your card may name the employer or a plan administrator."
    }
  ];

  var STATES = [{ id: "NY", label: "New York" }];

  var HELP_LINKS = {
    general: { label: "HealthCare.gov", url: "https://www.healthcare.gov/" },
    medicare: { label: "Medicare.gov", url: "https://www.medicare.gov/" },
    medicaid: { label: "New York State Department of Health", url: "https://www.health.ny.gov/" },
    aca: { label: "New York State Department of Financial Services", url: "https://www.dfs.ny.gov/" },
    employer: { label: "U.S. Department of Labor", url: "https://www.dol.gov/" }
  };

  // One entry per state and insurance type combination we cover.
  // Empty arrays mean nothing verified yet, so the fallback shows.
  var COMBINATIONS = {
    "NY|medicare": { deadlines: [], paths: [] },
    "NY|medicaid": { deadlines: [], paths: [] },
    "NY|aca": { deadlines: [], paths: [] },
    "NY|employer": { deadlines: [], paths: [] }
  };

  function isVerified(entry) {
    return Boolean(entry && entry.citation && entry.sourceUrl && entry.verifiedOn);
  }

  function getRules(stateId, typeId) {
    var combo = COMBINATIONS[stateId + "|" + typeId];
    if (!combo) return { covered: false, deadlines: [], paths: [] };
    return {
      covered: true,
      deadlines: combo.deadlines.filter(isVerified),
      paths: combo.paths.filter(isVerified)
    };
  }

  var api = {
    INSURANCE_TYPES: INSURANCE_TYPES,
    STATES: STATES,
    HELP_LINKS: HELP_LINKS,
    COMBINATIONS: COMBINATIONS,
    getRules: getRules,
    isVerified: isVerified
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealRules = api;
})(this);
