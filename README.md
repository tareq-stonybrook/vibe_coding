# Appeal Assist

This is a vibe coded app for course HHA 502.

Appeal Assist helps a patient or caregiver answer an insurance denial for a hospital stay that the plan says was not medically necessary. It walks through the denial notice, shows what to gather, and writes a draft appeal letter the user reviews, edits and sends themselves.

**Prototype.** Use synthetic (made up) notices only. Do not enter or upload real patient information.

## Try it

Open the app: https://claude.ai/artifact/VR9AuDDJbbA6e795AfNhYW

No account, no AI and no install needed. Everything runs in the browser and stays on your device. Only reading a PDF needs an internet connection, to load the PDF reader.

To run it from the code, open `appeal-assist/index.html` in Chrome, Edge, Safari or Firefox.

## What it does

1. **Start.** Explains what the guide does and does not do. The user confirms before continuing.
2. **Your plan.** Pick a state and employer plan insurance type 
3. **Your notice.** Upload the notice as a Word (.docx), PDF or text file and the app fills in plan name, service, date, denial reason and appeal instructions. Or type them. Made up example notices are built in for testing.
4. **Options.** Shows the denial reason and the appeal instructions from the notice. Appeal rules and deadlines show only after the team checks them against an official source.
5. **Checklist.** Supporting information that is commonly requested, with a prompt to ask the care team or plan for records.
6. **Draft.** The user enters their details (name, address, phone, member ID and similar) and, if they want, their own words about why the stay was needed. The app writes the letter. Paragraphs change with the kind of denial reason. Three tones. "Write another version" rewords with the same facts.
7. **Review.** Every gap shows as `[ADD: ...]` with its own fill box. Download stays locked until each gap is filled or dismissed. The app flags leftover brackets and any number the user never entered.
8. **Download.** Word (.docx) or text file, plus a copy button and sending tips. The app never submits anything.

Progress saves automatically in the browser and can be saved to or loaded from a file.

## Safety rules built in

* The letter uses only details the user entered. It never adds diagnoses, dates, codes, laws or citations.
* The denial reason is quoted exactly as entered.
* A reminder (no legal or medical advice, nothing submitted) appears on screen and at the top of every download.
* No deadline is shown unless it has an official source and a date it was checked.

## Current scope

* State: New York only.
* Appeal rules and deadlines: none checked yet, so the app tells users to follow their notice and plan documents.
* Files: photos and scanned PDFs cannot be read without AI, and old .doc files need saving as .docx first.
* Charter note: the charter lists automatic reading of a denial letter as out of scope. Upload was added later at the team's request.

## Project files

| File | Purpose |
| --- | --- |
| `appeal-assist/index.html`, `styles.css`, `js/app.js` | Screens and flow |
| `appeal-assist/js/reader.js` | Reads uploaded notices and finds the five fields |
| `appeal-assist/js/composer.js` | Writes the letter |
| `appeal-assist/js/docx.js` | Builds the Word file |
| `appeal-assist/js/letter.js` | Gap markers, checks, text export |
| `appeal-assist/js/rules.js` | States, insurance types, checked rules, help links |
| `appeal-assist/js/samples.js` | 12 made up example notices |
| `appeal-assist/tests/` | Unit tests and browser tests |
| `appeal-assist/docs/project-charter.xlsx` | Project charter and user stories |

## For the team

**Run tests:** inside `appeal-assist`, run `npm test`. Browser tests use `npm run e2e` and need Playwright.

**Add a checked rule or deadline:** edit `appeal-assist/js/rules.js`. Each entry needs a citation, a source link and the date it was checked, or it will not display. The format is explained at the top of the file.

**Update the shared link:** run `python3 build.py out.html` inside `appeal-assist` to make one combined file, then publish it.

## Still to do

* Check appeal rules, deadlines and sources for each insurance type.
* Replace help links with exact official pages.
* Full WCAG 2.1 AA accessibility review, including a screen reader pass.
* Decide on translation.
