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
| 2 | State and insurance type, with card hints. ACA marketplace shows a plan picker with one plan, set in `js/rules.js` PLANS | US-03 |
| 3 | Upload an example notice (Word .docx, PDF with text, or .txt) and the app fills the fields by finding labels and headings, or type them. The upload says example notices only. A wrong file can be removed. Example notices can fill the form or download as a file to test upload | US-02 |
| 4 | Stated reason with a plain language explanation that never says who is right. Appeal options, the patient's deadlines and the plan's response times shown separately, each with its source and date checked. Contacts, and a note when the notice points to details not shown. Unverified combinations show the fallback | US-04 |
| 5 | Supporting information checklist. Ticked items are listed as enclosed | US-05 |
| 6 | Only appeals address and letter date are asked. Name, address, phone, member ID and reference number stay as `[ADD: ...]` to add privately after download. Asks "What explanation has your clinician provided for why inpatient care is needed?" with an "I'm not sure" option. The letter claims medical necessity only when that explanation is given, and never says what a document shows. Always formal. Gaps shown as `[ADD: ...]` | US-06 |
| 7 | Review gate: each gap has a fill box or "Leave for later". Left for later gaps stay in the letter, are never shown as done, and can be undone. Leftover square brackets get flagged with a one click fix. Flags numbers not found in anything the user entered, and a missing denial reason | US-07 |
| 8 | Download Word `.docx` or `.txt`, copy letter, submission instructions. An incomplete draft is flagged on screen and at the top of the file as not ready to send. A failed save names the error and keeps the draft | US-08 |
| all | Labeled fields, keyboard use, focus moves to each heading, mobile layout | US-9 |
| all | Autosave in browser, save or load progress file | US-10 |

Reminder text (no legal or medical advice, nothing submitted) shows on screen 1, the letter screen, and at the top of every downloaded file.

## Scope in this version

* State: New York only.
* Insurance type: ACA marketplace only, with one plan, Healthfirst Silver Leaf Plan.
* Photos and scanned PDFs cannot be read without OCR or AI. The app says so and the user types the details.
* Notice upload changes charter scope: the charter lists "Uploading and reading a real denial letter automatically" as out of scope. The app still says synthetic notices only.
* The review check flags any number in the letter the user did not enter, and a missing denial reason. Useful once the user edits the letter by hand.
* Scenario: ACA (Healthfirst Silver Leaf) examples are planned inpatient admissions denied before the stay, so the guide, checklist and letter look ahead.
* Rules and deadlines: **Healthfirst Silver Leaf only**, from the 2026 contract copy the team supplied (Sections II, XX and XXI), checked on October 28, 2026. Each rule links to the published certificate of coverage on assets.healthfirst.org. Step 4 tells the user to confirm every deadline on their denial notice. Every other combination shows the fallback message.
* Privacy: no personal identifiers are asked for. Upload files are read in the browser and not sent. Typed details are saved in this browser (localStorage) until cleared, and in any progress file the user saves. Reading a PDF downloads the pdf.js library from cdnjs. No AI is used.
* Publishing: declare the `downloads` capability so the claude.ai save dialog works. Without it the page falls back to a plain browser download, which an embedded page may block.
* Help links point to official site home pages. Team should replace them with exact pages after checking.

## Adding a verified rule

Edit `js/rules.js`. Add an entry to the matching `COMBINATIONS` key with `citation` and `verifiedOn` (and `sourceUrl` once known). Entries missing citation or date never display. Format is documented at the top of the file.

## Files

* `index.html`, `styles.css`, `js/app.js`: UI
* `js/reader.js`: reads notice files (.docx unzipped with the browser built in decompressor, PDF text via pdf.js from cdnjs, .txt), finds the five fields
* `js/composer.js`: writes the letter, no AI
* `js/docx.js`: builds the Word file, no library
* `js/letter.js`: letter builder, placeholder detection, RTF and text export
* `js/rules.js`: states, insurance types, verified rules, help links
* `js/samples.js`: 3 synthetic notices for the ACA marketplace plan
* `tests/letter.test.js`: unit tests (`npm test`)
* `tests/e2e.js`: browser flow on desktop and mobile (`npm run e2e`, needs Playwright)

## Not yet done

* Formal WCAG 2.1 AA audit (screen reader pass, contrast measurement tool). Automated flow checks keyboard selection, layout width and page errors only.
* Translation.
* Team confirmation that the Silver Leaf rules match the published certificate of coverage.
* Other insurance types (removed for now, ACA marketplace only).
