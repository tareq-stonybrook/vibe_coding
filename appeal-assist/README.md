# Appeal Assist

Guide and letter builder for inpatient medical necessity denials. Built from the project charter (`23aaa485-502_CHRTER.xlsx`).

Prototype. Synthetic notices only. No real patient information.

## Run

Shared link (with Claude features): https://claude.ai/artifact/VR9AuDDJbbA6e795AfNhYW

Local: open `index.html` in a browser. Claude features need the claude.ai link. Locally the app falls back to typing the notice and a basic letter template.

Publish a new version: `python3 build.py out.html` inlines everything into one file for the artifact.

## Flow and user stories

| Step | Screen | Story |
| --- | --- | --- |
| 1 | Purpose and limits, acknowledgement, official help link | US-01 |
| 2 | State and insurance type, with card hints | US-03 |
| 3 | Upload notice (photo, PDF, text) and Claude fills the fields, or type them. Example notices for testing | US-02 |
| 4 | Stated reason, appeal paths and deadlines (verified only), notice instructions | US-04 |
| 5 | Supporting information checklist, records prompt | US-05 |
| 6 | Claude writes the letter from confirmed details and the user's own words, with tone choice. Basic template as fallback. Gaps shown as `[ADD: ...]` | US-06 |
| 7 | Review gate: fill or dismiss every gap, confirm review. Flags numbers not found in anything the user entered, and a missing denial reason | US-07 |
| 8 | Download `.rtf` (Word) or `.txt`, submission instructions | US-08 |
| all | Labeled fields, keyboard use, focus moves to each heading, mobile layout | US-9 |
| all | Autosave in browser, save or load progress file | US-10 |

Reminder text (no legal or medical advice, nothing submitted) shows on screen 1, the letter screen, and at the top of every downloaded file.

## Scope in this version

* State: New York only.
* Insurance types: Medicare, Medicaid, ACA marketplace, employer plan.
* Claude runs on each viewer's own claude.ai account through the artifact `sample` capability. No API key. The first use asks the viewer for permission.
* Notice upload changes charter scope: the charter lists "Uploading and reading a real denial letter automatically" as out of scope. The app still says synthetic notices only.
* The review check catches invented numbers (dates, codes, amounts). It cannot catch invented words such as a diagnosis name. The user review step covers that.
* Rules and deadlines: **none verified yet.** Every combination shows the fallback message telling the user to check the notice and plan documents.
* Help links point to official site home pages. Team should replace them with exact pages after checking.

## Adding a verified rule

Edit `js/rules.js`. Add an entry to the matching `COMBINATIONS` key with `citation`, `sourceUrl` and `verifiedOn`. Entries missing any of these never display. Format is documented at the top of the file.

## Files

* `index.html`, `styles.css`, `js/app.js`: UI
* `js/ai.js`: Claude calls (read notice, write letter), PDF reading via pdf.js from cdnjs
* `js/letter.js`: letter builder, placeholder detection, RTF and text export
* `js/rules.js`: states, insurance types, verified rules, help links
* `js/samples.js`: 12 synthetic notices, 3 per insurance type
* `tests/letter.test.js`: unit tests (`npm test`)
* `tests/e2e.js`: browser flow on desktop and mobile (`npm run e2e`, needs Playwright)

## Not yet done

* Formal WCAG 2.1 AA audit (screen reader pass, contrast measurement tool). Automated flow checks keyboard selection, layout width and page errors only.
* Translation.
* Verified rules, deadlines and citations.
