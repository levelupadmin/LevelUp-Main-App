// P4-T9 login/OTP LIVE visual verification. Drives the dev server started
// WITHOUT the admin bypass (VITE_DEV_ADMIN_BYPASS=) so /login actually renders
// the login surface instead of redirecting to /home. Writes frames into
// design/qa/phase-4/. No real OTP is ever sent or verified:
//   • phone-input + otp-entry come from the REAL /login using the reserved
//     App-Review number (+918888777666), whose send path skips MSG91 entirely
//     and lands straight on the code-entry step (no network);
//   • the success choreography comes from qa-harness/otp-choreo.html, which
//     mounts the REAL OtpEntryStep with a stubbed onVerify → { ok: true }, so
//     the STEAL-8 digits-merge-to-check plays with no session/auth touched.
//
// Rerun: node scripts/qa/capture-login-otp.mjs   (server must be on :5178)
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-4");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:5178";
const REVIEW_PHONE = "8888777666"; // typed into PhoneInput (prefixes +91)
const WIDTHS = [375, 360];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { generatedAt: new Date().toISOString(), base: BASE, frames: {} };

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  return `${name}.png`;
}
async function shotFull(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  return `${name}.png`;
}

async function driveLogin(browser, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 800 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const frames = {};

  // ── Welcome layer (full-bleed hero + entry pills + InstructorProof strip) ──
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  frames.welcome = await shot(page, `login-welcome-${width}`);

  // ── Phone-input step: tap "Sign in" → the phone form sheet rises ──
  await page.getByRole("button", { name: /^Sign in$/ }).click();
  const telInput = page.locator('input[type="tel"]');
  await telInput.waitFor({ state: "visible", timeout: 5000 });
  await sleep(500); // sheet-rise spring settle
  frames.phoneInput = await shot(page, `login-phone-${width}`);
  frames.phoneInputFull = await shotFull(page, `login-phone-${width}-full`);

  // ── OTP-entry step via the reserved review number (no MSG91 network) ──
  await telInput.fill(REVIEW_PHONE);
  await page.getByRole("button", { name: /Send code/ }).click();
  await page.getByText(/Enter the/).waitFor({ state: "visible", timeout: 5000 });
  await sleep(400);
  frames.otpEmpty = await shot(page, `login-otp-empty-${width}`);

  // Partial entry (3 of 4 digits) — never completes, so onVerify never fires.
  const otpInput = page.locator('input[autocomplete="one-time-code"]');
  await otpInput.fill("123");
  await sleep(250);
  frames.otpPartial = await shot(page, `login-otp-partial-${width}`);

  results.frames[`login_${width}`] = frames;
  await ctx.close();
}

// Poll the harness digit-merge overlay so a screenshot lands mid-choreography.
async function driveSuccess(browser, width) {
  const ctx = await browser.newContext({
    viewport: { width, height: 640 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const frames = {};

  await page.goto(`${BASE}/qa-harness/otp-choreo.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__otpReady === true, null, { timeout: 15000 });
  await sleep(300);
  frames.before = await shot(page, `otp-success-before-${width}`);

  // Type the 4 digits → auto-submit → stub resolves ok → `verified` flips.
  const otpInput = page.locator('input[autocomplete="one-time-code"]');
  await otpInput.fill("1234");

  // Frame 1: digits condensing / check spring (status region present, digits fading).
  await page.getByRole("status").waitFor({ state: "visible", timeout: 4000 });
  await sleep(200); // ~mid digit-merge (overlay 0.5s, check springs at 0.38s)
  frames.merge = await shot(page, `otp-success-merge-${width}`);

  // Frame 2: settled — champagne check + "Welcome back".
  await page.getByText("Welcome back").waitFor({ state: "visible", timeout: 4000 });
  await sleep(400);
  frames.settled = await shot(page, `otp-success-${width}`);

  results.frames[`success_${width}`] = frames;
  await ctx.close();
}

async function run() {
  const browser = await chromium.launch();
  for (const w of WIDTHS) {
    await driveLogin(browser, w);
    await driveSuccess(browser, w);
  }
  await browser.close();
  writeFileSync(path.join(OUT, "login-otp-capture.json"), JSON.stringify(results, null, 2));
  console.log("\n=== P4-T9 login/OTP capture ===");
  console.log(JSON.stringify(results.frames, null, 2));
  console.log(`\nArtifacts → ${OUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
