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
  await page.click("#load-sample");
  const reason = await page.inputValue("#reason");
  check(`${label}: sample fills reason`, reason.length > 10);
  await page.screenshot({ path: path.join(outDir, `${label}-notice.png`), fullPage: true });
  await page.click("section[data-step='2'] [data-next]");

  // Step 3: fallback shown, no numbers invented
  const guide = await page.textContent("#guide-rules");
  check(`${label}: unverified fallback shown`, guide.includes("have not yet verified"));
  await page.screenshot({ path: path.join(outDir, `${label}-guide.png`), fullPage: true });
  await page.click("section[data-step='3'] [data-next]");

  // Step 4: checklist
  await page.check("#cl-records");
  await page.click("section[data-step='4'] [data-next]");

  // Step 5: draft
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
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#dl-rtf")]);
  const file = await dl.path();
  const rtf = fs.readFileSync(file, "utf8");
  check(`${label}: rtf downloaded with reminder`, rtf.startsWith("{\\rtf1") && rtf.includes("no legal or medical advice"));
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

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await run("desktop", { viewport: { width: 1280, height: 900 } });
  await run("mobile", { ...devices["Pixel 5"] });
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`);
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
