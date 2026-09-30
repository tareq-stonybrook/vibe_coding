# Appeal Assist

Guide and letter builder for inpatient medical necessity denials. Built from the project charter (`23aaa485-502_CHRTER.xlsx`).

Prototype. Synthetic notices only. No real patient information.

## Run

Shared link: https://claude.ai/artifact/VR9AuDDJbbA6e795AfNhYW

Local: open `index.html` in a browser.

No AI and no account needed. The app reads notices and writes letters itself, in the browser. Only reading a PDF needs an internet connection, to load the PDF reader from cdnjs.

Publish a new version: `python3 build.py out.html` inlines everything into one file for the artifact.

## Flow and user stories

| Step | Screen | Story |
| --- | --- | --- |
| 1 | Purpose and limits, acknowledgement, official help link | US-01 |
| 2 | State and insurance type, with card hints | US-03 |
| 3 | Upload notice (PDF with text, or .txt) and the app fills the fields by finding labels and headings, or type them. Example notices can fill the form or download as a file to test upload | US-02 |
| 4 | Stated reason, appeal paths and deadlines (verified only), notice instructions | US-04 |
| 5 | Supporting information checklist, records prompt | US-05 |
| 6 | App writes the letter from confirmed details, the user's own words and checked documents. Paragraphs change with the kind of denial reason (care setting, length of stay, records, criteria). Three tones. "Write another version" rewords with the same facts. Gaps shown as `[ADD: ...]` | US-06 |
| 7 | Review gate: fill or dismiss every gap, confirm review. Flags numbers not found in anything the user entered, and a missing denial reason | US-07 |
| 8 | Download `.rtf` (Word) or `.txt`, submission instructions | US-08 |
| all | Labeled fields, keyboard use, focus moves to each heading, mobile layout | US-9 |
| all | Autosave in browser, save or load progress file | US-10 |

Reminder text (no legal or medical advice, nothing submitted) shows on screen 1, the letter screen, and at the top of every downloaded file.

## Scope in this version

* State: New York only.
* Insurance types: Medicare, Medicaid, ACA marketplace, employer plan.
* Photos and scanned PDFs cannot be read without OCR or AI. The app says so and the user types the details.
* Notice upload changes charter scope: the charter lists "Uploading and reading a real denial letter automatically" as out of scope. The app still says synthetic notices only.
* The review check flags any number in the letter the user did not enter, and a missing denial reason. Useful once the user edits the letter by hand.
* Rules and deadlines: **none verified yet.** Every combination shows the fallback message telling the user to check the notice and plan documents.
* Help links point to official site home pages. Team should replace them with exact pages after checking.

## Adding a verified rule

Edit `js/rules.js`. Add an entry to the matching `COMBINATIONS` key with `citation`, `sourceUrl` and `verifiedOn`. Entries missing any of these never display. Format is documented at the top of the file.

## Files

* `index.html`, `styles.css`, `js/app.js`: UI
* `js/reader.js`: reads notice files, finds the five fields, PDF text via pdf.js from cdnjs
* `js/composer.js`: writes the letter, no AI
* `js/letter.js`: letter builder, placeholder detection, RTF and text export
* `js/rules.js`: states, insurance types, verified rules, help links
* `js/samples.js`: 12 synthetic notices, 3 per insurance type
* `tests/letter.test.js`: unit tests (`npm test`)
* `tests/e2e.js`: browser flow on desktop and mobile (`npm run e2e`, needs Playwright)

## Not yet done

* Formal WCAG 2.1 AA audit (screen reader pass, contrast measurement tool). Automated flow checks keyboard selection, layout width and page errors only.
* Translation.
* Verified rules, deadlines and citations.
