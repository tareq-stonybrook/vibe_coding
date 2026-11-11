/*
 * Appeal rules data.
 *
 * Charter rule: show a rule or deadline ONLY after it has been checked
 * against an official source. Until then, the app shows the fallback
 * message telling the user to check their notice and plan documents.
 *
 * Each rule, path or contact entry looks like:
 *   {
 *     who: "you",                      // deadlines: "you" (to file) or "plan" (to respond)
 *     label: "File internal appeal",
 *     rule: "Plain language statement of the rule",
 *     days: 180,                       // number, or null if not a day count
 *     countFrom: "the date you receive the denial notice",
 *     estimateFromNotice: true,        // show notice date + days as an estimate
 *     citation: "Source document, section and page",
 *     where: "Section, page",          // optional short form when the source is named once
 *     sourceUrl: "https://official.source/page",   // optional until the team adds it
 *     verifiedOn: "YYYY-MM-DD",        // date the source was checked
 *     verifiedBy: "Who checked it",
 *     call: ["appeals"]                // optional: contact ids shown as call links inside the block
 *   }
 * Contacts also carry an `id` so other entries can link to them.
 * Entries missing citation or verifiedOn are ignored by the app.
 *
 * A combination with `teamConfirmed: false` still shows a warning that
 * the team has not finished checking it against the official published
 * document.
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
  // scenario "planned": the denial came before a planned inpatient
  // admission (Preauthorization), so wording looks ahead, not back.
  var PLANS = {
    aca: [{ id: "healthfirst-silver-leaf", label: "Healthfirst Silver Leaf Plan", scenario: "planned" }]
  };

  var HELP_LINKS = {
    general: { label: "HealthCare.gov appeal guidance", url: "https://www.healthcare.gov/appeal-insurance-company-decision/" },
    aca: { label: "New York State external appeal guidance and forms", url: "https://www.dfs.ny.gov/complaints/file_external_appeal" }
  };

  // Healthfirst Silver Leaf, planned inpatient admission denied before
  // the stay (a Preauthorization denial). Checked against the copy of the
  // 2026 contract the team supplied. SOURCE_URL is the team's link to the
  // published certificate of coverage. Team still to confirm the copy
  // matches it.
  var SILVER_LEAF = "Healthfirst PHSP HMO Contract, Silver Leaf 2026 (HF-STDIND-26)";
  var SOURCE_URL = "https://assets.healthfirst.org/pdf_nbw02xNkbSCn/2026-silver-leaf-certificate-of-coverage-english";
  var CHECKED = { verifiedOn: "2026-11-10", verifiedBy: "AI review of retained contract PDF; team sign-off pending" };
  function cite(where) {
    var page = /pages? (\d+)/i.exec(where);
    return { citation: SILVER_LEAF + ", " + where, where: where, sourceUrl: SOURCE_URL + (page ? "#page=" + page[1] : ""), verifiedOn: CHECKED.verifiedOn, verifiedBy: CHECKED.verifiedBy };
  }
  function entry(fields, where) {
    var c = cite(where);
    Object.keys(c).forEach(function (k) { if (!(k in fields)) fields[k] = c[k]; });
    return fields;
  }
  // Wording changed from the Product Owner's reading of pages 80 to 85
  // (issue #15, October 28, 2026). Team to recheck against the PDF.
  var PO_REVIEW = "Product Owner review of the published contract, issue #15";

  var NY_ACA = {
    teamConfirmed: false,
    sourceTitle: SILVER_LEAF,
    sourceUrl: SOURCE_URL,
    checkedBy: CHECKED.verifiedBy,
    deadlines: [
      entry({
        who: "you",
        label: "Ask for an internal appeal",
        rule: "Within 180 calendar days after you receive the denial notice. You can appeal by phone, in person or in writing.",
        days: 180,
        countFrom: "the date you receive the denial notice",
        estimateFromNotice: true,
        call: ["appeals", "help"]
      }, "Section XX, Utilization Review, H (page 80)"),
      entry({
        who: "you",
        label: "Ask for an external appeal",
        rule: "Within 4 months after you receive the plan's final denial of your internal appeal, or within 4 months after you receive the plan's written waiver of the internal appeal (its agreement that you can skip it). For an appeal based on a qualifying claim-processing failure, the 4 months run from that failure. The plan cannot extend the deadline.",
        days: null,
        countFrom: "the date you receive the final denial, or the date you receive a waiver of the internal appeal",
        verifiedBy: PO_REVIEW,
        call: ["external", "help"]
      }, "Section XXI, External Appeal, G and H (pages 84 to 86)"),
      entry({
        who: "plan",
        label: "Confirm it received your appeal",
        rule: "Within 15 calendar days. The letter names the person handling your appeal. No letter after 15 days? Call the appeals number.",
        call: ["appeals"]
      }, "Section XX, Utilization Review, H (page 80)"),
      entry({
        who: "plan",
        label: "Decide a standard appeal",
        rule: "Decide and send you written notice within 30 calendar days after it receives your appeal. The written notice comes within 2 business days of the decision, and always inside that 30 day limit.",
        verifiedBy: PO_REVIEW
      }, "Section XX, Utilization Review, I.1 (page 81)"),
      entry({
        who: "plan",
        label: "Decide an expedited (urgent) appeal",
        rule: "A decision is due at the earlier of 72 hours after receipt of the appeal or 2 business days after receipt of needed information. Written notice is due within 24 hours of the decision and no later than 72 hours after receipt of the appeal."
      }, "Section XX, Utilization Review, I.3 (pages 81 to 82)"),
      entry({
        who: "plan",
        label: "If the plan misses its deadline",
        rule: "If the plan does not decide within 30 calendar days of getting the information it needs (2 business days for an expedited appeal), the denial is reversed."
      }, "Section XX, Utilization Review, I.3 (page 82)"),
      entry({
        who: "plan",
        label: "External appeal decision",
        rule: "Normally 30 days after receipt of a completed application. If additional information is requested, the reviewer has 5 extra business days. A qualifying expedited external appeal is decided within 72 hours of receipt of a completed application."
      }, "Section XXI, External Appeal, G (page 85)")
    ],
    paths: [
      entry({
        label: "1. Internal appeal to the plan",
        rule: "Ask Healthfirst to review its decision. A clinical peer reviewer who did not make the first decision decides the appeal.",
        call: ["appeals"]
      }, "Section XX, Utilization Review, H (page 80)"),
      entry({
        label: "Urgent? Ask for an expedited appeal",
        rule: "Ask the plan and your clinician about an expedited internal appeal for an urgent matter or when your provider requests immediate review. You may apply for an external appeal at the same time, but expedited external review has separate eligibility requirements.",
        call: ["expedited"]
      }, "Section XX, I.3 (page 81) and Section XXI, A (page 83)"),
      entry({
        label: "Your clinician can ask for a reconsideration",
        rule: "If the plan did not attempt to consult the provider who recommended the service before denying it, that provider can request reconsideration. For preauthorization, this takes place within 1 business day. The original reviewer handles it, or a designated reviewer if the original is unavailable."
      }, "Section XX, Utilization Review, G (page 80)"),
      entry({
        label: "2. External appeal to New York State",
        rule: "For an otherwise covered service, a qualifying denial may be reviewed independently through New York State. Usually you need a final internal denial. Exceptions include a written waiver, applying alongside an expedited internal appeal, or qualifying claim-processing failures. Certain minor failures do not qualify. Check Section XXI.A and the DFS application.",
        call: ["external"]
      }, "Section XXI, External Appeal, A and G (pages 83 to 85)")
      ,entry({
        label: "When external review can be expedited",
        rule: "For this planned-care scenario, your attending physician must certify that delay poses an imminent or serious health threat, or that the standard timeframe would seriously jeopardize life, health or recovery of maximum function. Asking for urgent internal review alone does not establish this.",
        call: ["external"]
      }, "Section XXI, G (page 85)")
    ],
    contacts: [
      entry({ id: "appeals", short: "Appeals", label: "Appeals", rule: "888-250-2220" }, "Section II, L (page 13)"),
      entry({ id: "expedited", short: "Urgent appeals", label: "Expedited (urgent) appeals", rule: "877-779-2959" }, "Section II, L (page 13)"),
      entry({ id: "external", short: "NY State external appeals", label: "External appeal application (NY Department of Financial Services)", rule: "1-800-400-8882" }, "Section XXI, G (page 85)"),
      entry({ id: "help", short: "for free help", label: "Free help filing an appeal (Community Health Advocates)", rule: "1-888-614-5400" }, "Section XX, K (page 82)")
    ],
    // What the contract does not list, so the app says so instead of guessing.
    missing: ["The contract does not list a mailing address for appeals. Use the address printed on your notice."],
    // Legal basis paragraph and references for the letter (team choice,
    // November 2, 2026: option 2, laws only, no case law or articles).
    // Section numbers and titles confirmed from web search results.
    // Official text sites (ecfr.gov, nysenate.gov) were blocked in that
    // session, so the team must open each link and confirm before use.
    // Healthfirst PHSP is an HMO, so New York Public Health Law Article 49
    // applies rather than Insurance Law Article 49 (team to confirm).
    legal: {
      paragraph: "I make this appeal under my rights to an internal appeal and an external appeal set out in my plan contract " +
        "(Section XX, Utilization Review, and Section XXI, External Appeal), New York Public Health Law sections 4904 and 4910, " +
        "and the federal rules for internal claims and appeals and external review at 45 CFR 147.136. " +
        "I ask that a clinical peer reviewer who was not involved in the first decision review this appeal.",
      references: [
        { label: "Healthfirst Silver Leaf 2026 Certificate of Coverage, Section XX (Utilization Review) and Section XXI (External Appeal)", url: SOURCE_URL },
        { label: "New York Public Health Law section 4904 (appeals of utilization review decisions)", url: "https://www.nysenate.gov/legislation/laws/PBH/4904" },
        { label: "New York Public Health Law section 4910 (external appeal)", url: "https://www.nysenate.gov/legislation/laws/PBH/4910" },
        { label: "45 CFR 147.136 (internal claims and appeals and external review processes)", url: "https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-B/part-147/section-147.136" }
      ],
      citation: "Web search results for each section, plus the plan contract",
      verifiedOn: "2026-11-02",
      verifiedBy: "Claude (AI), from web search results. Official text not opened. Team to confirm."
    }
  };

  // One entry per state and insurance type combination we cover.
  // Empty arrays mean nothing verified yet, so the fallback shows.
  var COMBINATIONS = {
    "NY|aca": NY_ACA
  };

  function isVerified(entry) {
    return Boolean(entry && entry.citation && entry.verifiedOn);
  }

  function getRules(stateId, typeId) {
    var combo = COMBINATIONS[stateId + "|" + typeId];
    if (!combo) return { covered: false, deadlines: [], paths: [], contacts: [], missing: [], legal: null };
    return {
      covered: true,
      teamConfirmed: combo.teamConfirmed !== false,
      sourceTitle: combo.sourceTitle || "",
      sourceUrl: combo.sourceUrl || "",
      checkedBy: combo.checkedBy || "",
      deadlines: combo.deadlines.filter(isVerified),
      paths: combo.paths.filter(isVerified),
      contacts: (combo.contacts || []).filter(isVerified),
      missing: combo.missing || [],
      legal: combo.teamConfirmed === true && isVerified(combo.legal) ? combo.legal : null
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

