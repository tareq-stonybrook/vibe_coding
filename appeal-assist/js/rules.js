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
      id: "aca",
      label: "ACA marketplace plan",
      hint: "Plan bought through the health insurance marketplace. Your card or notice may say marketplace or exchange."
    }
  ];

  var STATES = [{ id: "NY", label: "New York" }];

  // Plans offered for each insurance type. Only types listed here show a
  // plan picker. Team to confirm the exact plan name from plan documents.
  var PLANS = {
    aca: [{ id: "healthfirst-silver-leaf", label: "Healthfirst Silver Leaf Plan" }]
  };

  var HELP_LINKS = {
    general: { label: "HealthCare.gov", url: "https://www.healthcare.gov/" },
    aca: { label: "New York State Department of Financial Services", url: "https://www.dfs.ny.gov/" }
  };

  // One entry per state and insurance type combination we cover.
  // Empty arrays mean nothing verified yet, so the fallback shows.
  var COMBINATIONS = {
    "NY|aca": { deadlines: [], paths: [] }
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
    PLANS: PLANS,
    HELP_LINKS: HELP_LINKS,
    COMBINATIONS: COMBINATIONS,
    getRules: getRules,
    isVerified: isVerified
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.AppealRules = api;
})(this);
