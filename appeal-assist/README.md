# Appeal Assist

Guide and letter builder for inpatient medical necessity denials. Built from the project charter (`23aaa485-502_CHRTER.xlsx`).

Prototype. Synthetic notices only. No real patient information.

## Run

Open `index.html` in a browser. No server, no build, no dependencies.

## Flow and user stories

| Step | Screen | Story |
| --- | --- | --- |
| 1 | Purpose and limits, acknowledgement, official help link | US-01 |
| 2 | State and insurance type, with card hints | US-03 |
| 3 | Notice details with location hints, synthetic sample loader | US-02 |
| 4 | Stated reason, appeal paths and deadlines (verified only), notice instructions | US-04 |
| 5 | Supporting information checklist, records prompt | US-05 |
| 6 | Editable draft letter, gaps shown as `[ADD: ...]` | US-06 |
| 7 | Review gate: fill or dismiss every gap, confirm review | US-07 |
| 8 | Download `.rtf` (Word) or `.txt`, submission instructions | US-08 |
| all | Labeled fields, keyboard use, focus moves to each heading, mobile layout | US-9 |
| all | Autosave in browser, save or load progress file | US-10 |

Reminder text (no legal or medical advice, nothing submitted) shows on screen 1, the letter screen, and at the top of every downloaded file.

## Scope in this version

* State: New York only.
* Insurance types: Medicare, Medicaid, ACA marketplace, employer plan.
* Letter drafting: template based. No AI service. Letter uses only entered details.
* Rules and deadlines: **none verified yet.** Every combination shows the fallback message telling the user to check the notice and plan documents.
* Help links point to official site home pages. Team should replace them with exact pages after checking.

## Adding a verified rule

Edit `js/rules.js`. Add an entry to the matching `COMBINATIONS` key with `citation`, `sourceUrl` and `verifiedOn`. Entries missing any of these never display. Format is documented at the top of the file.

## Files

* `index.html`, `styles.css`, `js/app.js`: UI
* `js/letter.js`: letter builder, placeholder detection, RTF and text export
* `js/rules.js`: states, insurance types, verified rules, help links
* `js/samples.js`: 12 synthetic notices, 3 per insurance type
* `tests/letter.test.js`: unit tests (`npm test`)
* `tests/e2e.js`: browser flow on desktop and mobile (`npm run e2e`, needs Playwright)

## Not yet done

* Formal WCAG 2.1 AA audit (screen reader pass, contrast measurement tool). Automated flow checks keyboard selection, layout width and page errors only.
* Translation.
* Verified rules, deadlines and citations.
