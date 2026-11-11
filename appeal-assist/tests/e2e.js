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

const step = (page) => page.$eval("section.step:not([hidden])", (x) => x.dataset.step);
const fixture = (name) => path.resolve(__dirname, "fixtures", name);

// Past the first two pages: understand the limits, then a supported, planned case.
async function start(page, label) {
  await page.goto(url);
  if (!label) {
    await page.check("#ack");
    await page.click("section[data-step='0'] [data-next]");
    await page.selectOption("#care-timing", "planned");
    await page.click("section[data-step='1'] [data-next]");
    return;
  }
  await page.click("section[data-step='0'] [data-next]");
  check(`${label}: ack required`, (await step(page)) === "0" && (await page.isVisible("section[data-step='0'] .error")));
  await page.check("#ack");
  await page.click("section[data-step='0'] [data-next]");

  // Step 1: only a planned admission on the supported plan goes on.
  await page.click("section[data-step='1'] [data-next]");
  check(`${label}: care timing required`, (await step(page)) === "1" && (await page.isVisible("section[data-step='1'] .error")));
  for (const v of ["received", "unsure"]) {
    await page.selectOption("#care-timing", v);
    await page.click("section[data-step='1'] [data-next]");
    check(`${label}: "${v}" cannot continue`, (await step(page)) === "1");
  }
  check(`${label}: unsure is sent to the plan or care team`, (await page.textContent("section[data-step='1'] .error")).includes("contact your health plan or care team"));
  await page.selectOption("#care-timing", "planned");
  await page.selectOption("#state", "other");
  await page.click("section[data-step='1'] [data-next]");
  check(`${label}: another state cannot continue`, (await step(page)) === "1" && (await page.textContent("#scope-feedback")).includes("not supported yet"));
  await page.selectOption("#state", "NY");
  await page.click("section[data-step='1'] [data-next]");
  check(`${label}: supported planned case continues`, (await step(page)) === "2");
}

async function leaveGaps(page) {
  let guard = 0;
  while ((await page.$$("#review-list button:has-text('Leave for later')")).length && guard++ < 30) {
    await page.click("#review-list button:has-text('Leave for later')");
  }
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
  check(`${label}: page title is the app name`, (await page.title()) === "Appeal Assist");
  check(`${label}: no test site or developer package link`, !(await page.$("a[href*='developer-package']")) && !/chatgpt\.site/.test(await page.content()));
  check(`${label}: fictional notices only is stated`, (await page.innerText(".test-banner")).includes("Fictional notices only"));
  await start(page, label);
  await contrastCheck(page, label, "notice page");

  // Step 2: a fictional example fills the form, with its practice address.
  const opts = await page.$$eval("#sample option", (o) => o.length);
  check(`${label}: 3 examples offered`, opts === 3, `got ${opts}`);
  await page.click("#example-tile summary");
  await page.click("#load-sample");
  const reason = await page.inputValue("#reason");
  check(`${label}: example fills reason`, reason.length > 10);
  check(`${label}: example address is marked test only`, (await page.inputValue("#notice-address")).includes("TEST ONLY"));
  check(`${label}: entered is not called verified`, (await page.innerText("#notice-review")).includes("Entered does not mean verified"));
  await page.screenshot({ path: path.join(outDir, `${label}-notice.png`), fullPage: true });

  // Dates that cannot be right are refused.
  const keepDate = await page.inputValue("#noticeDate");
  await page.fill("#noticeDate", "2099-01-01");
  await page.click("section[data-step='2'] [data-next]");
  check(`${label}: future notice date refused`, (await step(page)) === "2");
  await page.fill("#noticeDate", keepDate);
  await page.click("section[data-step='2'] [data-next]");
  check(`${label}: moves to options`, (await step(page)) === "3");

  // Step 3: the plan's own words, and an estimate when the received date is unknown.
  const guide = await page.innerText("section[data-step='3']");
  check(`${label}: options page shows the plan's reason`, guide.includes(reason) && guide.includes("Denied by"));
  check(`${label}: deadline marked as an estimate without a received date`, guide.includes("Received date unknown"));
  await page.screenshot({ path: path.join(outDir, `${label}-guide.png`), fullPage: true });
  await contrastCheck(page, label, "options page");
  await page.click("section[data-step='3'] [data-next]");

  // Step 4: a ticked document is one the user will attach.
  await page.check("#cl-records");
  await page.check("#cl-notice");
  await page.click("section[data-step='4'] [data-next]");

  // Step 5: draft, written by the app with no AI.
  if (!(await page.inputValue("#letter"))) await page.click("#write-letter");
  await page.waitForFunction(() => document.querySelector("#letter").value.length > 0);
  const letter = await page.inputValue("#letter");
  check(`${label}: letter repeats reason`, letter.includes(reason));
  check(`${label}: example has no identity, so placeholders stay`, letter.includes("[ADD: your full name]") && letter.includes("[ADD: your mailing address]"));
  check(`${label}: letter carries the practice address`, letter.includes("TEST ONLY"));
  check(`${label}: no legal block before the team confirms`, !/References:|CFR|Public Health Law/.test(letter));
  await contrastCheck(page, label, "letter page");
  await page.click("section[data-step='5'] [data-next]");

  // Step 6: review gate.
  check(`${label}: download locked with gaps`, await page.isDisabled("#to-download"));
  await page.check("#reviewed");
  check(`${label}: still locked after tick`, await page.isDisabled("#to-download"));
  await leaveGaps(page);
  if (!(await page.isChecked("#reviewed"))) await page.check("#reviewed");
  check(`${label}: unlocked after gaps left for later`, await page.isEnabled("#to-download"));
  const kept = await page.inputValue("#letter-review");
  check(`${label}: placeholders kept after leaving for later`, kept.includes("[ADD: your full name]") && kept.includes("[ADD: your clinician's explanation"));
  // Editing the reviewed letter takes the approval back.
  await page.fill("#letter-review", kept + "\nmy own edit");
  check(`${label}: an edit resets the review tick`, !(await page.isChecked("#reviewed")) && (await page.isDisabled("#to-download")));
  await page.check("#reviewed");
  await page.screenshot({ path: path.join(outDir, `${label}-review.png`), fullPage: true });
  await contrastCheck(page, label, "review page");
  await page.click("#to-download");

  // Step 7: download.
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-docx")]);
  const docxPath = path.join(outDir, `${label}-letter.docx`);
  fs.copyFileSync(await dl.path(), docxPath);
  const text = require("child_process").execFileSync("python3", ["-c",
    "import docx,sys; print('\\n'.join(p.text for p in docx.Document(sys.argv[1]).paragraphs))", docxPath]).toString();
  check(`${label}: docx opens with the reason and the edit`, text.includes(reason) && text.includes("my own edit"));
  check(`${label}: docx says not ready and keeps gaps`, text.includes("NOT READY TO SEND") && text.includes("[ADD: your full name]"));
  check(`${label}: docx file name`, dl.suggestedFilename() === "appeal-letter-draft.docx");
  check(`${label}: download page flags incomplete draft`, await page.isVisible("#incomplete"));
  const [dlt] = await Promise.all([page.waitForEvent("download"), page.click("#dl-txt")]);
  const txt = fs.readFileSync(await dlt.path(), "utf8");
  check(`${label}: txt opens and matches the reviewed letter`, txt.includes("my own edit") && txt.startsWith("DRAFT FOR HUMAN REVIEW"));
  await page.screenshot({ path: path.join(outDir, `${label}-download.png`), fullPage: true });
  await contrastCheck(page, label, "download page");

  // Nothing is kept in the browser. A reload starts again.
  check(`${label}: nothing saved in browser storage`, (await page.evaluate(() => localStorage.length + sessionStorage.length)) === 0);
  await page.reload();
  check(`${label}: reload clears the case`, (await step(page)) === "0" && (await page.isHidden("#resume")));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(`${label}: no horizontal scroll`, !overflow);
  check(`${label}: no page errors`, errors.length === 0, errors.join("; "));
  await browser.close();
}

// Upload fictional notice files and let the app fill the form and the letter.
async function runUpload() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);

  async function upload(name, confirm) {
    await page.setInputFiles("#notice-file", fixture(name));
    await page.waitForSelector("#synthetic-confirm[open]");
    await page.click(confirm === false ? "#synthetic-cancel" : "#synthetic-ok");
    if (confirm === false) return;
    await page.click("#read-notice");
    await page.waitForFunction(() => /Filled|Could not/.test(document.querySelector("#read-status").textContent));
  }

  // A file is read only after the user confirms it is fictional.
  await upload("knee-notice.txt", false);
  check("upload: cancelled file is not read", (await page.isDisabled("#read-notice")) && (await page.inputValue("#service")) === "");

  await upload("knee-notice.txt");
  check("knee: service is the requested admission, not the opening paragraph",
    (await page.inputValue("#service")) === "Planned inpatient acute care hospital admission following an elective left total knee replacement", await page.inputValue("#service"));
  check("knee: notice date", (await page.inputValue("#noticeDate")) === "2026-10-27");
  check("knee: reason is the rationale paragraph", (await page.inputValue("#reason")).startsWith("Your physician requested approval for a planned inpatient acute care hospital admission") &&
    (await page.inputValue("#reason")).endsWith("NOT medically necessary for your clinical profile."), await page.inputValue("#reason"));
  check("knee: appeals address copied from the notice", (await page.inputValue("#notice-address")) === "Healthfirst Appeals & Grievances Department, P.O. Box 5166, New York, NY 10274-5166", await page.inputValue("#notice-address"));
  check("knee: found identity is listed", (await page.textContent("#identity-preview")) === "Name: Eleanor Vance · Member ID: HF908234101-01 · Reference: PA-2026-0988412", await page.textContent("#identity-preview"));
  check("knee: all five fields reported", (await page.textContent("#read-status")).includes("Filled 5 of 5 fields"));
  for (const st of [2, 3, 4]) await page.click(`section[data-step='${st}'] [data-next]`);
  if (!(await page.inputValue("#letter"))) await page.click("#write-letter");
  await page.waitForFunction(() => document.querySelector("#letter").value.length > 0);
  const letter = await page.inputValue("#letter");
  check("knee: name, member ID and reference carry into the draft", letter.includes("Name: Eleanor Vance") && letter.includes("Member ID: HF908234101-01") && letter.includes("Claim or reference number: PA-2026-0988412"));
  check("knee: address, phone, clinician and signature stay placeholders", ["[ADD: your mailing address]", "[ADD: your phone number]", "[ADD: your clinician's explanation", "[ADD: your signature and printed name]"].every((g) => letter.includes(g)));
  check("knee: draft uses the appeals address from the notice", letter.includes("Appeals address: Healthfirst Appeals & Grievances Department, P.O. Box 5166, New York, NY 10274-5166"));
  await page.click("section[data-step='5'] [data-next]");
  check("knee: found identity is not flagged as unsupported", !/Eleanor|HF908234101|PA-2026-0988412/.test(await page.innerText("#review-warnings")), await page.innerText("#review-warnings"));
  check("upload: nothing saved in browser storage", (await page.evaluate(() => localStorage.length + sessionStorage.length)) === 0);

  // A second notice replaces everything from the first.
  for (const st of [6, 5, 4, 3]) await page.click(`section[data-step='${st}'] [data-back]`);
  await page.fill("#received-date", "2026-10-29");
  await upload("spinal-notice.txt");
  check("spinal: service is the requested admission, not review text",
    (await page.inputValue("#service")) === "3-day acute care inpatient hospital admission following a planned single-level lumbar spine fusion (L4-L5)", await page.inputValue("#service"));
  check("spinal: notice date", (await page.inputValue("#noticeDate")) === "2026-11-03");
  check("spinal: reason", /NOT medically necessary/.test(await page.inputValue("#reason")));
  check("spinal: appeals address", (await page.inputValue("#notice-address")).includes("P.O. Box 5166"));
  check("replace: received date from the earlier notice is cleared", (await page.inputValue("#received-date")) === "");
  for (const st of [2, 3, 4]) await page.click(`section[data-step='${st}'] [data-next]`);
  if (!(await page.inputValue("#letter"))) await page.click("#write-letter");
  await page.waitForFunction(() => document.querySelector("#letter").value.includes("lumbar"));
  const second = await page.inputValue("#letter");
  check("replace: letter is rewritten for the new notice", second.includes("lumbar spine fusion") && !second.includes("knee replacement"));
  check("replace: no identity from the earlier notice", !/Eleanor Vance|HF908234101|PA-2026-0988412/.test(second) || /Eleanor Vance/.test(fs.readFileSync(fixture("spinal-notice.txt"), "utf8")));

  // An example after a file clears the file and its identity.
  for (const st of [5, 4, 3]) await page.click(`section[data-step='${st}'] [data-back]`);
  await page.click("#example-tile summary");
  await page.click("#load-sample");
  check("example after a file: identity summary is hidden", await page.isHidden("#identity-summary"));
  check("example after a file: the file is removed", (await page.isHidden("#file-row")) && (await page.isDisabled("#read-notice")));
  for (const st of [2, 3, 4]) await page.click(`section[data-step='${st}'] [data-next]`);
  if (!(await page.inputValue("#letter"))) await page.click("#write-letter");
  await page.waitForFunction(() => document.querySelector("#letter").value.length > 0);
  check("example after a file: name is a placeholder again", (await page.inputValue("#letter")).includes("[ADD: your full name]"));

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
