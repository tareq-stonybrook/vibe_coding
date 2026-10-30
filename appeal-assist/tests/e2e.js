// Browser flow check on desktop and mobile. Run: node tests/e2e.js
// Needs Playwright installed (npm i -D playwright) and a Chromium build.
const path = require("path");
const fs = require("fs");
const { chromium, devices } = require("playwright");

const url = process.env.APP_URL || "file://" + path.resolve(__dirname, "..", "index.html");
const outDir = process.env.SHOT_DIR || path.resolve(__dirname, "..", "screenshots");
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail || "" });
}

// Lowest text contrast among visible text on the page (WCAG formula).
// Walks up to the first solid background behind each element.
function lowestContrast() {
  function rgb(c) { const m = c.match(/[\d.]+/g).map(Number); return { r: m[0], g: m[1], b: m[2], a: m.length > 3 ? m[3] : 1 }; }
  function lum(c) {
    return [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
  }
  function bg(node) {
    for (let n = node; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c.a >= 0.95) return c;
    }
    return rgb(getComputedStyle(document.body).backgroundColor);
  }
  let worst = { ratio: 99, what: "" };
  for (const n of document.querySelectorAll("body *")) {
    if (!n.offsetParent || !Array.from(n.childNodes).some((t) => t.nodeType === 3 && t.textContent.trim())) continue;
    if (n.closest(".visually-hidden") || n.closest("button:disabled")) continue;
    const a = lum(rgb(getComputedStyle(n).color)), b = lum(bg(n));
    const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    if (ratio < worst.ratio) worst = { ratio: Math.round(ratio * 100) / 100, what: n.tagName + "." + n.className + " " + n.textContent.trim().slice(0, 30) };
  }
  return worst;
}
async function contrastCheck(page, label, where) {
  const w = await page.evaluate(lowestContrast);
  check(`${label}: ${where} text contrast at least 4.5:1`, w.ratio >= 4.5, `${w.ratio} ${w.what}`);
}

async function run(label, contextOpts) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...contextOpts, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  const scheme = contextOpts.colorScheme || "light";
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  check(`${label}: ${scheme} mode background follows the device`, bodyBg === (scheme === "dark" ? "rgb(0, 0, 0)" : "rgb(255, 255, 255)"), bodyBg);
  await contrastCheck(page, label, "start page");

  // Step 0: gate on acknowledgement
  check(`${label}: hero shows name and tagline only`, (await page.textContent("#h-intro")) === "Appeal Assist" && (await page.textContent(".tagline")) === "Helping patients understand denials and prepare an appeal.");
  check(`${label}: no prototype or synthetic wording`, !/prototype|synthetic/i.test(await page.innerText("body")));
  check(`${label}: outcome disclaimer on first page`, (await page.textContent("ul.crosses")).includes("We are not responsible for whether your appeal is approved or denied."));
  check(`${label}: no real notices on first page`, (await page.textContent("ul.crosses")).includes("Accept real notices or medical records."));
  check(`${label}: new opening line`, (await page.textContent(".intro")).includes("Break down your denial notice, be informed on requested documents, and receive a drafted appeal letter to review and submit."));
  await page.click("section[data-step='0'] [data-next]");
  check(`${label}: ack required`, await page.isVisible("section[data-step='0'] .error"));
  await page.check("#ack");
  await page.click("section[data-step='0'] [data-next]");

  // Step 1: keyboard selection
  await page.focus("#state");
  await page.selectOption("#state", "NY");
  check(`${label}: only ACA insurance type offered`, (await page.$$eval('input[name="planType"]', (r) => r.map((x) => x.value))).join() === "aca");
  await page.focus("#pt-aca");
  await page.keyboard.press("Space");
  check(`${label}: radio via keyboard`, await page.isChecked("#pt-aca"));
  await page.selectOption("#plan", "healthfirst-silver-leaf");
  await page.click("section[data-step='1'] [data-next]");

  // Step 2: load synthetic notice
  const opts = await page.$$eval("#sample option", (o) => o.length);
  check(`${label}: 3 samples offered for NY ACA`, opts === 3, `got ${opts}`);
  check(`${label}: fictional example is the primary start`, (await page.isVisible("#load-sample")) && (await page.getAttribute("#load-sample", "class")) === "primary" &&
    (await page.textContent("#example-tile h2")) === "Start with a fictional example");
  check(`${label}: upload is optional and collapsed`, (await page.isHidden("#dropzone")) && (await page.textContent("#upload-tile summary")).startsWith("Optional"));
  await page.click("#load-sample");
  const reason = await page.inputValue("#reason");
  check(`${label}: sample fills reason`, reason.length > 10);
  await page.screenshot({ path: path.join(outDir, `${label}-notice.png`), fullPage: true });
  await page.click("section[data-step='2'] [data-next]");

  // Step 3: denial facts and fallback shown, no numbers invented
  const denial = await page.textContent("#guide-reason");
  check(`${label}: options page shows plan, date and plan's reason`, denial.includes("Denied by") && denial.includes("Date of notice") && denial.includes("as stated by your plan") && denial.includes(reason));
  const guide = await page.textContent("#guide-rules");
  check(`${label}: Silver Leaf rules shown, not the fallback`, !guide.includes("have not yet checked") && guide.includes("Confirm every deadline on your denial notice."));
  check(`${label}: plain explanation of the denial`, denial.includes("What this means, in plain words") && denial.includes("does not decide who is correct"));
  await page.screenshot({ path: path.join(outDir, `${label}-guide.png`), fullPage: true });
  await contrastCheck(page, label, "options page");
  await page.click("section[data-step='3'] [data-next]");

  // Step 4: checklist. A ticked document is one the user will attach.
  check(`${label}: checklist titled suggested, not required`, (await page.textContent("#h-checklist")) === "Suggested supporting documents");
  const docs = await page.textContent("#checklist");
  check(`${label}: US-04 documents offered`, docs.includes("A copy of the denial notice") && docs.includes("explaining why inpatient admission is medically necessary") && docs.includes("clinical evaluations or treatment plans") && docs.includes("Any additional information requested by Healthfirst"));
  check(`${label}: reminder to confirm documents`, (await page.textContent("#docs-reminder")) === "Not every appeal requires the same documents. Check your denial notice and contact Healthfirst to confirm what information is needed for your specific appeal.");
  check(`${label}: no upload on checklist`, !(await page.$("section[data-step='4'] input[type='file']")));
  check(`${label}: no separate attach checkbox`, !(await page.$("#at-records")));
  await page.check("#cl-records");
  await page.check("#cl-notice");
  await page.click("section[data-step='4'] [data-next]");

  // Step 5: draft (no Claude here, so template fills in)
  await page.waitForFunction(() => document.querySelector("#letter").value.length > 0);
  const letter = await page.inputValue("#letter");
  check(`${label}: letter repeats reason`, letter.includes(reason));
  check(`${label}: letter has placeholders`, letter.includes("[ADD:"));
  check(`${label}: only attached items enclosed`, letter.includes("* Records about my condition and the planned admission") && letter.includes("* A copy of the denial notice") && !letter.includes("* My plan's coverage document"));
  check(`${label}: no personal detail fields`, !(await page.$("#s-name")) && !(await page.$("#s-phone")) && !(await page.$("#s-memberId")) && !(await page.$("#s-address")));
  await page.click("section[data-step='5'] [data-next]");

  // Step 6: review gate
  check(`${label}: download locked with gaps`, await page.isDisabled("#to-download"));
  await page.check("#reviewed");
  check(`${label}: still locked after tick`, await page.isDisabled("#to-download"));
  let guard = 0;
  while ((await page.$$("#review-list button:has-text('Leave for later')")).length && guard++ < 30) {
    await page.click("#review-list button:has-text('Leave for later')");
  }
  check(`${label}: unlocked after gaps left for later`, await page.isEnabled("#to-download"));
  const reviewText = await page.textContent("#review-list");
  check(`${label}: left for later is not shown as done`, !reviewText.includes("Every gap is filled") && reviewText.includes("not ready to send"));
  const kept = await page.inputValue("#letter-review");
  check(`${label}: placeholders kept after leaving for later`, kept.includes("[ADD: your full name]") && kept.includes("[ADD: your clinician's explanation"));
  await page.screenshot({ path: path.join(outDir, `${label}-review.png`), fullPage: true });
  await contrastCheck(page, label, "review page");
  await page.click("#to-download");

  // Step 7: download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-docx")]);
  const file = await dl.path();
  const docxPath = path.join(outDir, `${label}-letter.docx`);
  fs.copyFileSync(file, docxPath);
  const text = require("child_process").execFileSync("python3", ["-c",
    "import docx,sys; print('\\n'.join(p.text for p in docx.Document(sys.argv[1]).paragraphs))", docxPath]).toString();
  check(`${label}: docx opens and has reminder and reason`, text.includes("no legal or medical advice") && text.includes(reason));
  check(`${label}: docx says not ready and keeps gaps`, text.includes("NOT READY TO SEND") && text.includes("[ADD: your full name]"));
  check(`${label}: docx file name`, dl.suggestedFilename() === "appeal-letter-draft.docx");
  check(`${label}: download page flags incomplete draft`, await page.isVisible("#incomplete"));
  const finalLetter = await page.evaluate(() => JSON.parse(localStorage.getItem("appealAssist.v2")).letter);
  const [dlt] = await Promise.all([page.waitForEvent("download"), page.click("#dl-txt")]);
  const txt = fs.readFileSync(await dlt.path(), "utf8");
  check(`${label}: txt opens and matches the reviewed letter`, txt.endsWith(finalLetter) && txt.startsWith("DRAFT FOR HUMAN REVIEW"));
  await page.screenshot({ path: path.join(outDir, `${label}-download.png`), fullPage: true });
  await contrastCheck(page, label, "download page");

  // Save and resume
  await page.reload();
  check(`${label}: resume offered after reload`, await page.isVisible("#resume") || (await page.isVisible("section[data-step='7']")));

  // No horizontal scroll
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(`${label}: no horizontal scroll`, !overflow);
  check(`${label}: no page errors`, errors.length === 0, errors.join("; "));

  await browser.close();
}

// Upload a synthetic notice file and let the app write the letter, no AI.
async function runUpload() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await page.check("#ack");
  await page.click("section[data-step='0'] [data-next]");
  await page.selectOption("#state", "NY");
  await page.check("#pt-aca", { force: true });
  check("plan: picker shows for ACA", await page.isVisible("#plan"));
  const planOpts = await page.$$eval("#plan option", (o) => o.map((x) => x.textContent));
  check("plan: only one plan offered", planOpts.length === 2 && planOpts[1] === "Healthfirst Silver Leaf Plan", planOpts.join("|"));
  await page.click("section[data-step='1'] [data-next]");
  check("plan: required for ACA", await page.isVisible("section[data-step='1'] .error"));
  await page.selectOption("#plan", "healthfirst-silver-leaf");
  await page.click("section[data-step='1'] [data-next]");
  check("plan: fills plan name on notice step", (await page.inputValue("#planName")) === "Healthfirst Silver Leaf Plan");

  // Download an example notice file, then upload it.
  await page.click("#upload-tile summary");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-sample")]);
  const noticePath = await dl.path();
  const noticeText = fs.readFileSync(noticePath, "utf8");
  check("upload: example file is marked as an example", noticeText.includes("EXAMPLE NOTICE. NOT A REAL LETTER."));
  await page.setInputFiles("#notice-file", { name: "notice.txt", mimeType: "text/plain", buffer: Buffer.from(noticeText) });
  check("upload: synthetic data popup shows before reading", (await page.isVisible("#synthetic-confirm")) &&
    (await page.textContent("#synthetic-text")) === "We do not accept real notices or medical records. Confirm that this is synthetic data." &&
    (await page.isHidden("#file-row")) && (await page.isDisabled("#read-notice")));
  await page.click("#synthetic-cancel");
  check("upload: cancel drops the file", (await page.isHidden("#file-row")) && (await page.isDisabled("#read-notice")) &&
    (await page.$eval("#notice-file", (i) => i.files.length)) === 0 && (await page.textContent("#read-status")).includes("File not used"));
  await page.setInputFiles("#notice-file", { name: "notice.txt", mimeType: "text/plain", buffer: Buffer.from(noticeText) });
  await page.click("#synthetic-ok");
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelectorAll(".filled").length > 0);
  check("upload: all 5 fields filled", (await page.$$(".filled")).length === 5);
  const reason = await page.inputValue("#reason");
  await page.screenshot({ path: path.join(outDir, "upload-notice.png"), fullPage: true });

  await page.setInputFiles("#notice-file", path.join(__dirname, "fixtures", "notice-word.docx"));
  await page.click("#synthetic-ok");
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelector("#planName").value === "Sample Riverside Health Plan (synthetic)");
  check("upload: Word .docx fills all 5 fields", (await page.$$(".filled")).length === 5);
  await page.screenshot({ path: path.join(outDir, "upload-docx.png"), fullPage: true });
  await page.click("#remove-file");
  check("upload: remove clears the file and the fields read from it",
    (await page.isHidden("#file-row")) && (await page.$$(".filled")).length === 0 &&
    (await page.inputValue("#planName")) === "" && (await page.isDisabled("#read-notice")) &&
    (await page.$eval("#notice-file", (i) => i.files.length)) === 0);
  // Put the text example back so later checks match it.
  await page.setInputFiles("#notice-file", { name: "notice.txt", mimeType: "text/plain", buffer: Buffer.from(noticeText) });
  await page.click("#synthetic-ok");
  await page.click("#read-notice");
  await page.waitForFunction((r) => document.querySelector("#reason").value === r, reason);
  await page.setInputFiles("#notice-file", { name: "photo.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71]) });
  await page.click("#synthetic-ok");
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelector("#read-status").textContent.includes("Photos"));
  check("upload: photo gets a clear message", true);

  check("upload: hint says example only and not sent", (await page.textContent("#upload-hint")).includes("never a real notice") && (await page.textContent("#upload-hint")).includes("not sent anywhere"));
  await page.click("section[data-step='2'] [data-next]");

  // Step 3: verified Silver Leaf rules for a planned admission
  const guide = await page.textContent("#guide-rules");
  check("guide: Silver Leaf rules shown with source and date checked", guide.includes("180 calendar days") && guide.includes("plan contract, Section XX") && guide.includes("Date checked: October 28, 2026."));
  check("guide: deadlines split by who acts", guide.includes("Your deadlines to ask for an appeal") && guide.includes("How long the plan has to respond"));
  check("guide: official source link shown", (await page.getAttribute("#guide-rules a:has-text('Certificate of Coverage')", "href")).includes("assets.healthfirst.org"));
  check("guide: short confirm note, no verification talk", guide.includes("Confirm every deadline on your denial notice.") && !/Claude|not yet confirmed|Not fully verified/.test(guide));
  check("guide: contacts and missing address", guide.includes("888-250-2220") && guide.includes("877-779-2959") && guide.includes("does not list a mailing address"));
  check("guide: earliest deadline from notice date", guide.includes("January 28, 2027"));
  check("guide: written notice inside the 30 day limit", guide.includes("always inside that 30 day limit"));
  check("guide: external appeal counts from final denial or waiver", guide.includes("written waiver of the internal appeal") && guide.includes("or the date you receive a waiver of the internal appeal"));
  const plain = await page.textContent("#guide-reason");
  check("guide: plain explanation for planned admission", plain.includes("The disagreement is about the need for inpatient admission.") && plain.includes("whether the surgery is covered"));
  await page.screenshot({ path: path.join(outDir, "guide-silver-leaf.png"), fullPage: true });
  await page.click("section[data-step='3'] [data-back]");
  await page.fill("#instructions", "Write to the Grievance and Appeals Department listed below.");
  await page.click("section[data-step='2'] [data-next]");
  check("guide: notice pointing elsewhere is flagged", (await page.textContent("#guide-instructions")).includes("This guide does not have them"));
  await page.click("section[data-step='3'] [data-next]");

  // Step 4: planned admission checklist
  check("checklist: planned admission wording", (await page.textContent("#checklist")).includes("support the planned admission") && !(await page.textContent("#checklist")).includes("discharge summary"));
  await page.check("#cl-doctor");
  await page.check("#cl-records");
  await page.click("section[data-step='4'] [data-next]");

  // Step 5: letter
  const v0 = await page.inputValue("#letter");
  check("letter: written without AI, quotes reason, lists only attached items", v0.includes(reason) && v0.includes("* A letter from my clinician") && v0.includes("* Records about") && !v0.includes("* My plan's coverage document"));
  check("letter: personal details stay placeholders", v0.includes("Name: [ADD: your full name]") && v0.includes("Member ID: [ADD: member ID from your insurance card]"));
  check("letter: no necessity claim without clinician explanation", !v0.includes("medically necessary. I therefore") && v0.includes("[ADD: your clinician's explanation of why inpatient care is needed"));
  check("letter: question asks for clinician's explanation", (await page.textContent("#clinician-legend")).includes("What explanation has your clinician provided for why inpatient care is needed?"));
  await page.check("#clinician-unsure");
  check("letter: not sure keeps the gap", (await page.inputValue("#letter")).includes("[ADD: your clinician's explanation") && await page.isDisabled("#clinician"));
  await page.uncheck("#clinician-unsure");
  await page.fill("#clinician", "i need monitoring after surgery because of my heart condition");
  const v1 = await page.inputValue("#letter");
  check("letter: clinician explanation tidied and inserted", v1.includes("I need monitoring after surgery because of my heart condition."));
  check("letter: formal wording", /respectfully/i.test(v1));
  check("letter: no tone picker or version button", !(await page.$("#tone")) && !(await page.$("#another")));
  check("letter: closing uses team wording, future tense", v1.includes("Based on the aforementioned clinical information, I believe the planned inpatient admission for surgery is medically necessary."));
  check("letter: no past stay wording", !/hospital stay|my stay|was needed|discharge/i.test(v1));
  check("letter: opening names plan and notice date", v1.includes("denial issued by Healthfirst Silver Leaf Plan in its notice dated"));
  check("letter: copies request removed", !v1.includes("send me copies") && !v1.includes("send me a copy"));
  await page.screenshot({ path: path.join(outDir, "upload-draft.png"), fullPage: true });
  await page.click("section[data-step='5'] [data-next]");

  // Step 6: review
  const warn = await page.textContent("#review-warnings");
  check("letter: no unsupported numbers flagged", warn.trim() === "", warn);
  const privateRows = ["your full name", "your mailing address", "your phone number", "member ID from your insurance card", "reference number from your notice", "your signature and printed name"];
  let privateOk = true;
  for (const p of privateRows) {
    const row = page.locator(".review-item", { hasText: `[ADD: ${p}]` });
    privateOk = privateOk && (await row.count()) === 1 && (await row.locator("input").count()) === 0 && (await row.textContent()).includes("Add this privately after you download");
  }
  check("review: no fill boxes for personal details, kept for after download", privateOk);
  const addrRow = page.locator(".review-item", { hasText: "[ADD: appeals address from your notice]" });
  await addrRow.locator("label.ph").click();
  check("review: clicking a gap focuses its fill box", await addrRow.locator("input").evaluate((i) => i === document.activeElement));
  await addrRow.locator("input").fill("[PO Box 1, New York NY]");
  await addrRow.locator("button:has-text('Fill in')").click();
  const afterFill = await page.inputValue("#letter-review");
  check("review: fill box replaces whole placeholder", afterFill.includes("Appeals address: PO Box 1, New York NY") && !afterFill.includes("[PO Box"));
  await page.fill("#letter-review", afterFill.replace("Appeals address: PO Box 1, New York NY", "Appeals address: [PO Box 1]"));
  await page.waitForSelector("text=Remove leftover brackets");
  await page.click("text=Remove the brackets for me");
  check("review: stray brackets removed", (await page.inputValue("#letter-review")).includes("Appeals address: PO Box 1"));
  await page.screenshot({ path: path.join(outDir, "review-fill.png"), fullPage: true });
  await page.fill("#letter-review", (await page.inputValue("#letter-review")) + "\n[ADD: test gap]");
  await page.check("#reviewed");
  check("review: locked until each gap is filled or left for later", await page.isDisabled("#to-download"));
  await page.locator(".review-item", { hasText: "[ADD: test gap]" }).locator("button:has-text('Leave for later')").click();
  check("review: left for later can be undone", await page.isVisible("#review-list button:has-text('Fill in now')"));
  while (await page.locator("#review-list button:has-text('Leave for later')").count()) {
    await page.locator("#review-list button:has-text('Leave for later')").first().click();
  }
  check("review: unlocked once every gap is filled or left for later", await page.isEnabled("#to-download"));
  await page.click("#to-download");
  check("download: incomplete draft flagged", (await page.textContent("#incomplete")).includes("not ready to send"));

  // A failed save keeps the draft and says what failed.
  const page2 = await ctx.newPage();
  await page2.addInitScript(() => {
    window.claude = { use: () => Promise.resolve({ save: () => Promise.reject({ code: "bad_request", message: "test failure" }) }) };
  });
  await page2.goto(url);
  await page2.click("#resume");
  await page2.click("#dl-txt");
  await page2.waitForFunction(() => document.querySelector("#dl-status").textContent.length > 0);
  const failMsg = await page2.textContent("#dl-status");
  check("download: failure message names the error and keeps the draft", failMsg.includes("bad_request: test failure") && failMsg.includes("draft is still saved"), failMsg);
  await page2.close();
  check("upload: no page errors", errors.length === 0, errors.join("; "));
  await browser.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await run("desktop", { viewport: { width: 1280, height: 900 } });
  await run("desktop-dark", { viewport: { width: 1280, height: 900 }, colorScheme: "dark" });
  await run("mobile", { ...devices["Pixel 5"] });
  await run("mobile-dark", { ...devices["Pixel 5"], colorScheme: "dark" });
  await runUpload();
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`);
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
