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

// Fake claude.use so the upload and AI paths run without claude.ai.
const FAKE_LETTER = "Dear plan,\n\nYou wrote: \"REASON\". I disagree. Surgery on 2025-01-01 was required.\n\n[ADD: your full name]";
async function runWithFakeClaude() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript((letter) => {
    const fields = { planName: "Fake Plan (synthetic)", service: "Inpatient stay, 3 days", noticeDate: "2026-08-01",
      reason: "Not medically necessary per review.", instructions: "Write to the Appeals Unit." };
    const sample = async (input, opts) => {
      const text = letter.replace("REASON", fields.reason);
      if (opts && opts.onText) opts.onText({ text, delta: text });
      window.__lastPrompt = input;
      return { text, truncated: false };
    };
    sample.json = async () => fields;
    sample.limits = async () => ({ maxPromptBytes: 262144, images: { maxCount: 4, maxInputBytes: 5e6, mediaTypes: ["image/png", "image/jpeg"] } });
    window.claude = { use: async (name) => (name === "sample" ? sample : null) };
  }, FAKE_LETTER);
  await page.goto(url);
  await page.check("#ack");
  await page.click("section[data-step='0'] [data-next]");
  await page.selectOption("#state", "NY");
  await page.check("#pt-aca", { force: true });
  await page.click("section[data-step='1'] [data-next]");
  await page.setInputFiles("#notice-file", { name: "notice.txt", mimeType: "text/plain", buffer: Buffer.from("SYNTHETIC NOTICE text here") });
  await page.click("#read-notice");
  await page.waitForFunction(() => document.querySelector("#planName").value === "Fake Plan (synthetic)");
  check("ai: upload fills fields", true);
  check("ai: filled fields highlighted", (await page.$$(".filled")).length === 5);
  await page.screenshot({ path: path.join(outDir, "ai-notice.png"), fullPage: true });
  await page.click("section[data-step='2'] [data-next]");
  await page.click("section[data-step='3'] [data-next]");
  await page.click("section[data-step='4'] [data-next]");
  check("ai: write button shown", await page.isVisible("#write-ai"));
  await page.fill("#ownWords", "I could not breathe well at home.");
  await page.click("#write-ai");
  await page.waitForFunction(() => document.querySelector("#letter").value.startsWith("Dear plan"));
  const prompt = await page.evaluate(() => window.__lastPrompt);
  check("ai: prompt carries own words and rules", prompt.includes("I could not breathe well at home.") && prompt.includes("Do not add any fact"));
  await page.screenshot({ path: path.join(outDir, "ai-draft.png"), fullPage: true });
  await page.click("section[data-step='5'] [data-next]");
  const warn = await page.textContent("#review-warnings");
  check("ai: invented date flagged", warn.includes("2025-01-01"), warn);
  check("ai: gap listed", (await page.$$("#review-list .review-item")).length === 1);
  await page.screenshot({ path: path.join(outDir, "ai-review.png"), fullPage: true });
  check("ai: no page errors", errors.length === 0, errors.join("; "));
  await browser.close();
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  await run("desktop", { viewport: { width: 1280, height: 900 } });
  await run("mobile", { ...devices["Pixel 5"] });
  await runWithFakeClaude();
  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed++;
    console.log(`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? " (" + r.detail + ")" : ""}`);
  }
  console.log(`\n${results.length - failed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})();
