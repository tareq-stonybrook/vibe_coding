# Appeal Assist

This is a vibe coded app for course HHA 502.

**Open the app: [https://tareq-stonybrook.github.io/vibe_coding/appeal-assist/](https://tareq-stonybrook.github.io/vibe_coding/appeal-assist/)**

Downloads the letter as Word or text. No sign in. On iPhone, tap Save to Files when the menu opens.

Appeal Assist helps a patient or caregiver answer an insurance denial for a hospital stay that the plan says was not medically necessary. It walks through the denial notice, shows what to gather, and writes a draft appeal letter the user reviews, edits and sends themselves.

**Tagline:** Helping patients overturn denials.

## Try it

Open the app: [https://tareq-stonybrook.github.io/vibe_coding/appeal-assist/](https://tareq-stonybrook.github.io/vibe_coding/appeal-assist/). Use this link for testing and downloads.

Backup link on claude.ai (older version, downloads only for organization members): https://claude.ai/artifact/VR9AuDDJbbA6e795AfNhYW

On the claude.ai link only members of the owner's organization can download files. Everyone else should use the GitHub Pages link above, or Copy letter.

No account, no AI and no install needed. Everything runs in the browser and stays on your device. Only reading a PDF needs an internet connection, to load the PDF reader.

To run it from the code, open `appeal-assist/index.html` in Chrome, Edge, Safari or Firefox.

## What it does

1. **Start.** Explains what the guide does and does not do. The user confirms before continuing.
2. **Your plan.** Pick a state, insurance type and plan, and say whether the admission is still planned. Only New York, ACA marketplace, Healthfirst Silver Leaf and a planned admission can continue. Care already received, or an unsure answer, stops here with advice to contact the health plan or care team.
3. **Your notice.** Upload a fictional notice file (Word, PDF or text) after confirming it is fictional, use a fictional example, or type the details. A check list shows which of six notice details are entered. Entered does not mean verified. An optional received date sets the appeal deadline. Without it the deadline is marked as an estimate. Real notices and medical records are not accepted. The reader handles notices written as a plain letter, as a table of labels, or with each label on its own line. It reads the denied service from a label, from the service setting, or from a sentence such as "your request for inpatient admission has been denied". A phone number is never used as the service. A notice date over a year old or in the future gets a warning.
4. **Options.** Shows the denial reason and the appeal instructions from the notice. Appeal rules and deadlines show only after the team checks them against an official source. Each rule has its phone numbers as tap to call buttons inside the block. If the notice date puts the filing deadline in the past, the deadline is greyed out, marked "Past deadline", and a box above it lists what to do now. A deadline within 30 days shows the days left.
5. **Suggested supporting documents.** Suggested, not required: the denial notice, a physician statement, relevant medical records, and any additional information Healthfirst asks for. A reminder says documents vary by appeal and to confirm with the plan. Ticked items are listed as enclosed, and the user attaches them outside the app. Nothing is uploaded.
6. **Draft.** The app never asks for name, address, phone, member ID, reference number or signature. A name, member ID and reference number found in a confirmed fictional upload carry into the draft. Everything else stays marked for the user to add privately after download. When an uploaded notice gives an appeals address that ends in a state and ZIP code, the address fills in under Letter details, outlined in green for the user to check. Reading or loading a different notice writes the letter again from the new details. The user can give their clinician's explanation of why inpatient care is needed, or say they are not sure. The app writes the letter. The letter is formal. Paragraphs change with the kind of denial reason, and the closing paragraph sums up the reasons the patient gave.
7. **Review.** Every gap shows as `[ADD: ...]`. Personal details have no fill box and stay for after download. Other gaps can be filled or left for later, and anything left stays marked in the download. The app flags leftover brackets and any number the user never entered.
8. **Download.** Word (.docx) or text file, plus a copy button and sending tips. The app never submits anything.

Nothing is saved in the browser. The case stays in the open tab and reloading clears it. The save and load progress file buttons are still on the page and were not retested in the November 11, 2026 update.

## Safety rules built in

* The letter uses only details the user entered. It never adds diagnoses, dates or codes.
* Laws come only from a checked list for the chosen plan. The legal basis paragraph and References list stay out of the letter until the team confirms the rules (`teamConfirmed` in `js/rules.js`). No case law or journal articles.
* The denial reason is quoted exactly as entered.
* A reminder (no legal or medical advice, nothing submitted) appears on screen and at the top of every download.
* No deadline is shown unless it has an official source and a date it was checked.

## Current scope

* State: New York only.
* Insurance type: ACA marketplace only, with one plan, Healthfirst Silver Leaf Plan.
* Appeal rules and deadlines: Healthfirst Silver Leaf only. Wording revised November 10, 2026 by an AI review of the retained contract PDF. Team sign off pending. Every other combination tells users to follow their notice and plan documents.
* Laws cited in the letter: plan contract Sections XX and XXI, New York Public Health Law sections 4904 and 4910, and 45 CFR 147.136. Section numbers and titles confirmed from web search results on November 2, 2026. The official law sites were blocked in that session, so the team must open each link and confirm the text. Public Health Law (not Insurance Law) chosen because Healthfirst PHSP is an HMO. Team to confirm.
* Files: photos and scanned PDFs cannot be read without AI, and old .doc files need saving as .docx first.
* Uploads: fictional notices only. The fictional example is the main route. An optional panel reads an example notice file (Word, PDF or text) for testing, after the user confirms it is synthetic data. Real notices and medical records stay out of scope. The charter and user stories record this scope change (issues #1 and #7).
* Privacy: an uploaded file is read inside the browser and never sent. The file itself is not kept. Details read from it stay in the open tab only and are not saved in the browser. Reading a PDF downloads the pdf.js reader from cdnjs, but sends nothing. Network capture last run October 30, 2026, before the November 11 update.
* Theme: follows the device light or dark mode setting, so the background can be white on one device and black on another.

## Project files

| File | Purpose |
| --- | --- |
| `appeal-assist/index.html`, `styles.css`, `js/app.js` | Screens and flow |
| `appeal-assist/js/reader.js` | Reads uploaded notices and finds the five fields and the appeals address |
| `appeal-assist/js/composer.js` | Writes the letter |
| `appeal-assist/js/docx.js` | Builds the Word file |
| `appeal-assist/js/letter.js` | Gap markers, checks, text export |
| `appeal-assist/js/rules.js` | States, insurance types, checked rules, help links |
| `appeal-assist/js/samples.js` | 3 made up example notices |
| `appeal-assist/tests/` | Unit tests and browser tests |
| `appeal-assist/docs/project-charter.xlsx` | Project charter and user stories |

## For the team

**Run tests:** inside `appeal-assist`, run `npm test` (62 unit tests). Browser tests use `npm run e2e` and need Playwright.

**Add a checked rule or deadline:** edit `appeal-assist/js/rules.js`. Each entry needs a citation, a source link and the date it was checked, or it will not display. The format is explained at the top of the file.

**Main branch:** `claude/laughing-fermat-bj7i2b` is the one working branch. Make every change there. GitHub Pages publishes it, so the app link updates within a few minutes of each push. Other branches are old copies and are not updated.

**Update the backup link:** run `python3 build.py out.html` inside `appeal-assist` to make one combined file, then publish it to the claude.ai artifact.

## Still to do

* Check appeal rules, deadlines and sources for each insurance type.
* Replace help links with exact official pages.
* Full WCAG 2.1 AA accessibility review, including a screen reader pass.
* Decide on translation.
