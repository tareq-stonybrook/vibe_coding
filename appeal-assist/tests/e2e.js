// Browser flow check on desktop and mobile. Run: node tests/e2e.js
// Needs Playwright installed (npm i -D playwright) and a Chromium build.
const path = require("path");
const fs = require("fs");
const { chromium, devices } = require("playwright");

const url = "file://" + path.resolve(__dirname, "..", "index.html");
const outDir = process.env.SHOT_DIR || path.resolve(__dirname, "..", "screenshots");
const results = [];

function check(name, ok, detail) {
  results.push({ name, ok: Boolean(ok), detail: detail || "" });
}

async function run(label, contextOpts) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...contextOpts, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);

  // Step 0: gate on acknowledgement
  await page.click("section[data-step='0'] [data-next]");
  check(`${label}: ack required`, await page.isVisible("section[data-step='0'] .error"));
  await page.check("#ack");
  await page.click("section[data-step='0'] [data-next]");

  // Step 1: keyboard selection
  await page.focus("#state");
  await page.selectOption("#state", "NY");
  await page.focus("#pt-medicare");
  await page.keyboard.press("Space");
  check(`${label}: radio via keyboard`, await page.isChecked("#pt-medicare"));
  await page.click("section[data-step='1'] [data-next]");

  // Step 2: load synthetic notice
  const opts = await page.$$eval("#sample option", (o) => o.length);
  check(`${label}: 3 samples offered for NY Medicare`, opts === 3, `got ${opts}`);
  await page.click("details.example summary");
  await page.click("#load-sample");
  const reason = await page.inputValue("#reason");
  check(`${label}: sample fills reason`, reason.length > 10);
  await page.screenshot({ path: path.join(outDir, `${label}-notice.png`), fullPage: true });
  await page.click("section[data-step='2'] [data-next]");

  // Step 3: fallback shown, no numbers invented
  const guide = await page.textContent("#guide-rules");
  check(`${label}: unverified fallback shown`, guide.includes("have not yet checked"));
  await page.screenshot({ path: path.join(outDir, `${label}-guide.png`), fullPage: true });
  await page.click("section[data-step='3'] [data-next]");

  // Step 4: checklist
  await page.check("#cl-records");
  await page.click("section[data-step='4'] [data-next]");

  // Step 5: draft (no Claude here, so template fills in)
  await page.waitForFunction(() => document.querySelector("#letter").value.length > 0);
  const letter = await page.inputValue("#letter");
  check(`${label}: letter repeats reason`, letter.includes(reason));
  check(`${label}: letter has placeholders`, letter.includes("[ADD:"));
  await page.click("section[data-step='5'] [data-next]");

  // Step 6: review gate
  check(`${label}: download locked with gaps`, await page.isDisabled("#to-download"));
  await page.check("#reviewed");
  check(`${label}: still locked after tick`, await page.isDisabled("#to-download"));
  let guard = 0;
  while ((await page.$$("#review-list .review-item")).length && guard++ < 30) {
    await page.click("#review-list .review-item button:has-text('Dismiss')");
  }
  check(`${label}: unlocked after all gaps dismissed`, await page.isEnabled("#to-download"));
  await page.screenshot({ path: path.join(outDir, `${label}-review.png`), fullPage: true });
  await page.click("#to-download");

  // Step 7: download
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-docx")]);
  const file = await dl.path();
  const docxPath = path.join(outDir, `${label}-letter.docx`);
  fs.copyFileSync(file, docxPath);
  const text = require("child_process").execFileSync("python3", ["-c",
    "import docx,sys; print('\\n'.join(p.text for p in docx.Document(sys.argv[1]).paragraphs))", docxPath]).toString();
  check(`${label}: docx opens and has reminder and reason`, text.includes("no legal or medical advice") && text.includes(reason));
  check(`${label}: docx file name`, dl.suggestedFilename() === "appeal-letter-draft.docx");
  await page.screenshot({ path: path.join(outDir, `${label}-download.png`), fullPage: true });

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
  await page.click("section[data-step='1'] [data-next]");

  // Download an example notice file, then upload it.
  await page.click("details.example summary");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-sample")]);
  const noticePath = await dl.path();
  const noticeText = fs.readFileSync(noticePath, "utf8");
  check("upload: example file is marked synthetic", noticeText.includes("SYNTHETIC"));
  await page.setInputFiles("#notice-file", { name: "notice.txt", mimeType: "text/plain", buffer: Buffer.from(noticeText) });
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelectorAll(".filled").length > 0);
  check("upload: all 5 fields filled", (await page.$$(".filled")).length === 5);
  const reason = await page.inputValue("#reason");
  await page.screenshot({ path: path.join(outDir, "upload-notice.png"), fullPage: true });

  await page.setInputFiles("#notice-file", path.join(__dirname, "fixtures", "notice-word.docx"));
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelector("#planName").value === "Sample Riverside Health Plan (synthetic)");
  check("upload: Word .docx fills all 5 fields", (await page.$$(".filled")).length === 5);
  await page.screenshot({ path: path.join(outDir, "upload-docx.png"), fullPage: true });
  // Put the text example back so later checks match it.
  await page.setInputFiles("#notice-file", { name: "notice.txt", mimeType: "text/plain", buffer: Buffer.from(noticeText) });
  await page.click("#read-notice");
  await page.waitForFunction((r) => document.querySelector("#reason").value === r, reason);
  await page.setInputFiles("#notice-file", { name: "photo.png", mimeType: "image/png", buffer: Buffer.from([137, 80, 78, 71]) });
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelector("#read-status").textContent.includes("Photos"));
  check("upload: photo gets a clear message", true);

  await page.click("section[data-step='2'] [data-next]");
  await page.click("section[data-step='3'] [data-next]");
  await page.check("#cl-doctor");
  await page.click("section[data-step='4'] [data-next]");
  const v0 = await page.inputValue("#letter");
  check("letter: written without AI, uses reason and doctor statement", v0.includes(reason) && /statement from (my treating doctor|a doctor)|doctor who treated me/.test(v0));
  await page.fill("#s-name", "Test Person");
  await page.fill("#s-address", "[1 Example Street]");
  const header = await page.inputValue("#letter");
  check("letter: labeled header lines", header.includes("Name: Test Person") && header.includes("Address: 1 Example Street") && header.includes("Phone: [ADD: your phone number]"));
  check("letter: brackets stripped from typed details", !header.includes("[1 Example"));
  await page.fill("#ownWords", "i could not breathe at home");
  const v1 = await page.inputValue("#letter");
  check("letter: own words tidied and inserted", v1.includes("I could not breathe at home."));
  await page.selectOption("#tone", "formal");
  const v2 = await page.inputValue("#letter");
  check("letter: tone changes wording", v2 !== v1 && /respectfully/i.test(v2));
  await page.click("#another");
  const v3 = await page.inputValue("#letter");
  check("letter: another version differs", v3 !== v2 && v3.includes(reason));
  await page.screenshot({ path: path.join(outDir, "upload-draft.png"), fullPage: true });
  await page.click("section[data-step='5'] [data-next]");
  const warn = await page.textContent("#review-warnings");
  check("letter: no unsupported numbers flagged", warn.trim() === "", warn);
  const phoneRow = page.locator(".review-item", { hasText: "[ADD: your phone number]" });
  await phoneRow.locator("input").fill("[555 0100]");
  await phoneRow.locator("button:has-text('Fill in')").click();
  const afterFill = await page.inputValue("#letter-review");
  check("review: fill box replaces whole placeholder", afterFill.includes("Phone: 555 0100") && !afterFill.includes("[555"));
  await page.fill("#letter-review", afterFill.replace("Name: Test Person", "Name: [Tareq]"));
  await page.waitForSelector("text=Remove leftover brackets");
  await page.click("text=Remove the brackets for me");
  check("review: stray brackets removed", (await page.inputValue("#letter-review")).includes("Name: Tareq"));
  await page.screenshot({ path: path.join(outDir, "review-fill.png"), fullPage: true });
  check("upload: no page errors", errors.length === 0, errors.join("; "));
  await browser.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await run("desktop", { viewport: { width: 1280, height: 900 } });
  await run("mobile", { ...devices["Pixel 5"] });
  await runUpload();
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`);
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
