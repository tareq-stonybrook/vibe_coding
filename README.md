# Appeal Assist

This is a vibe coded app for course HHA 502.

Appeal Assist helps a patient or caregiver answer an insurance denial for a hospital stay that the plan says was not medically necessary. It walks through the denial notice, shows what to gather, and writes a draft appeal letter the user reviews, edits and sends themselves.

**Tagline:** Helping patients overturn denials.

## Try it

Open the app: https://tareq-stonybrook.github.io/vibe_coding/appeal-assist/

Backup link on claude.ai: https://claude.ai/artifact/VR9AuDDJbbA6e795AfNhYW

No account, no AI and no install needed. Everything runs in the browser and stays on your device. Only reading a PDF needs an internet connection, to load the PDF reader.

To run it from the code, open `appeal-assist/index.html` in Chrome, Edge, Safari or Firefox.

## What it does

1. **Start.** Explains what the guide does and does not do. The user confirms before continuing.
2. **Your plan.** Pick a state, then the ACA marketplace plan type and the Healthfirst Silver Leaf Plan.
3. **Your notice.** Start with a fictional example notice, or type the details. An optional panel tests reading an example notice file (Word, PDF or text) after the user confirms it is synthetic data. Real notices and medical records are not accepted.
4. **Options.** Shows the denial reason and the appeal instructions from the notice. Appeal rules and deadlines show only after the team checks them against an official source.
5. **Which documents will you attach?** Supporting information that is commonly requested. Ticked items are listed as enclosed, and the user attaches them outside the app.
6. **Draft.** The app never asks for name, address, phone, member ID, reference number or signature. Those stay marked for the user to add privately after download. The user can give their clinician's explanation of why inpatient care is needed, or say they are not sure. The app writes the letter. The letter is formal. Paragraphs change with the kind of denial reason, and the closing paragraph sums up the reasons the patient gave.
7. **Review.** Every gap shows as `[ADD: ...]`. Personal details have no fill box and stay for after download. Other gaps can be filled or left for later, and anything left stays marked in the download. The app flags leftover brackets and any number the user never entered.
8. **Download.** Word (.docx) or text file, plus a copy button and sending tips. The app never submits anything.

Progress saves automatically in the browser and can be saved to or loaded from a file.

## Safety rules built in

* The letter uses only details the user entered. It never adds diagnoses, dates, codes, laws or citations.
* The denial reason is quoted exactly as entered.
* A reminder (no legal or medical advice, nothing submitted) appears on screen and at the top of every download.
* No deadline is shown unless it has an official source and a date it was checked.

## Current scope

* State: New York only.
* Insurance type: ACA marketplace only, with one plan, Healthfirst Silver Leaf Plan.
* Appeal rules and deadlines: Healthfirst Silver Leaf only, checked October 28, 2026 against the plan contract. Every other combination tells users to follow their notice and plan documents.
* Files: photos and scanned PDFs cannot be read without AI, and old .doc files need saving as .docx first.
* Uploads: fictional notices only. The fictional example is the main route. An optional panel reads an example notice file (Word, PDF or text) for testing, after the user confirms it is synthetic data. Real notices and medical records stay out of scope. The charter and user stories record this scope change (issues #1 and #7).
* Privacy: an uploaded file is read inside the browser and never sent. The file itself is not kept. The five details read from it save in this browser until the user clears saved progress. Reading a PDF downloads the pdf.js reader from cdnjs, but sends nothing. Checked October 30, 2026 with a browser network capture.
* Theme: follows the device light or dark mode setting, so the background can be white on one device and black on another.

## Project files

| File | Purpose |
| --- | --- |
| `appeal-assist/index.html`, `styles.css`, `js/app.js` | Screens and flow |
| `appeal-assist/js/reader.js` | Reads uploaded notices and finds the five fields |
| `appeal-assist/js/composer.js` | Writes the letter |
| `appeal-assist/js/docx.js` | Builds the Word file |
| `appeal-assist/js/letter.js` | Gap markers, checks, text export |
| `appeal-assist/js/rules.js` | States, insurance types, checked rules, help links |
| `appeal-assist/js/samples.js` | 3 made up example notices |
| `appeal-assist/tests/` | Unit tests and browser tests |
| `appeal-assist/docs/project-charter.xlsx` | Project charter and user stories |

## For the team

**Run tests:** inside `appeal-assist`, run `npm test`. Browser tests use `npm run e2e` and need Playwright.

**Add a checked rule or deadline:** edit `appeal-assist/js/rules.js`. Each entry needs a citation, a source link and the date it was checked, or it will not display. The format is explained at the top of the file.

**Update the app link:** GitHub Pages publishes branch `claude/laughing-fermat-bj7i2b`. Merge changes into that branch and the link updates within a few minutes.

**Update the backup link:** run `python3 build.py out.html` inside `appeal-assist` to make one combined file, then publish it to the claude.ai artifact.

## Still to do

* Check appeal rules, deadlines and sources for each insurance type.
* Replace help links with exact official pages.
* Full WCAG 2.1 AA accessibility review, including a screen reader pass.
* Decide on translation.
