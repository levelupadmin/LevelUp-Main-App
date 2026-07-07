// Phase-3 punch list — crit 8 evidence: run axe-core against the ANON guest
// checkout form and write a machine-readable result to design/qa/phase-3/.
//
// Drives the running dev server (localhost:8080) with Playwright in a FRESH
// context (no stored session ⇒ anonymous ⇒ the `{!user}` guest-details block
// renders). Loads a real, non-staged single-payment offering so the page reaches
// the loaded branch (past `if (!offering) return null`) and paints the guest
// name/email/phone fields + labels + inline error slots.
//
// Rerun: node scripts/qa/axe-checkout-guest.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-3");
mkdirSync(OUT, { recursive: true });

// axe-core UMD bundle staged in the session scratchpad (not committed).
const AXE_PATH =
  process.env.AXE_PATH ||
  "/private/tmp/claude-501/-Users-rahulsrinivas-Claude/0585479d-3455-4f7f-aace-2d6c31c5a1f4/scratchpad/axe.min.js";
const AXE_SRC = readFileSync(AXE_PATH, "utf8");

const BASE = "http://localhost:8080";
// Nelson Dilipkumar — real prod offering, payment_mode single (non-staged), so
// the loaded checkout renders the full anon shape (guest form + trust panel).
const OFFERING_ID = "190a09ee-3f34-4242-ad9f-70ddedcc8eae";
const URL = `${BASE}/checkout/${OFFERING_ID}`;
const VIEWPORTS = [
  { label: "mobile-375", width: 375, height: 812 },
  { label: "desktop-1280", width: 1280, height: 900 },
];

// WCAG 2.1 A + AA is the acceptance bar. best-practice is captured separately as
// advisory (not part of the pass/fail gate).
const GATE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runOne(browser, vp) {
  // Fresh context every time = no persisted Supabase session = anonymous.
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });

  await page.goto(URL, { waitUntil: "networkidle" });
  // The guest form is the crit-8 subject; wait for its first field to prove the
  // anon loaded branch (not the skeleton, not a redirect) is on screen.
  await page.waitForSelector("#guest-name", { timeout: 15000 });
  await page.waitForSelector("#guest-email", { timeout: 5000 });
  await page.waitForSelector("#guest-phone", { timeout: 5000 });
  await sleep(400); // let any entrance settle so nothing is mid-opacity

  // Trip every inline error so axe also audits the role="alert" messages in
  // their VISIBLE state (blur each field while empty/invalid).
  await page.evaluate(() => {
    for (const id of ["guest-name", "guest-email", "guest-phone"]) {
      const el = document.getElementById(id);
      if (el) {
        el.focus();
        el.blur();
      }
    }
  });
  await sleep(250);

  await page.addScriptTag({ content: AXE_SRC });

  const result = await page.evaluate(async (gateTags) => {
    // Full-page audit on the anon checkout route (the guest form is the focus,
    // but auditing the whole card catches contrast/landmark issues around it).
    const gate = await window.axe.run(document, {
      runOnly: { type: "tag", values: gateTags },
    });
    // Same run scoped narrowly to the guest form subtree, for a focused readout.
    const guestFormEl =
      document.getElementById("guest-name")?.closest(".space-y-3") || document.body;
    const scoped = await window.axe.run(guestFormEl, {
      runOnly: { type: "tag", values: gateTags },
    });
    const slim = (r) =>
      r.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        helpUrl: v.helpUrl,
        tags: v.tags,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          failureSummary: n.failureSummary,
          html: n.html.slice(0, 300),
        })),
      }));
    return {
      pageViolations: slim(gate),
      pagePassCount: gate.passes.length,
      pageIncompleteCount: gate.incomplete.length,
      guestFormViolations: slim(scoped),
      testEngine: gate.testEngine,
    };
  }, GATE_TAGS);

  await context.close();
  return {
    label: vp.label,
    viewport: { width: vp.width, height: vp.height },
    ...result,
    consoleErrors,
  };
}

(async () => {
  const browser = await chromium.launch();
  const cases = [];
  for (const vp of VIEWPORTS) {
    process.stdout.write(`axe @ ${vp.label} … `);
    const c = await runOne(browser, vp);
    console.log(
      `${c.pageViolations.length} page violation(s), ${c.guestFormViolations.length} in guest form`,
    );
    cases.push(c);
  }
  await browser.close();

  const worstPage = Math.max(...cases.map((c) => c.pageViolations.length));
  const worstForm = Math.max(...cases.map((c) => c.guestFormViolations.length));

  // Fold every page-level violation id into an out-of-scope ledger so the
  // gate is keyed on the guest form (crit 8's subject), while page findings that
  // do NOT belong to this checkout item stay visible and accounted for.
  const OUT_OF_SCOPE = {
    "meta-viewport":
      "index.html sets maximum-scale=1 + user-scalable=no deliberately (kills iOS " +
      "focus auto-zoom on OTP/notes fields across the whole app + Capacitor WebView). " +
      "Global Tier-1 shell decision, not part of the anon-guest-form scope — deferred, " +
      "not fixed here.",
  };
  const pageIds = [...new Set(cases.flatMap((c) => c.pageViolations.map((v) => v.id)))];
  const inScopeUnexpected = pageIds.filter((id) => !(id in OUT_OF_SCOPE));

  const out = {
    measuredAt: new Date().toISOString(),
    screen: "/checkout/:offeringId (cold load, anonymous — guest form present)",
    offeringId: OFFERING_ID,
    offeringNote:
      "Nelson Dilipkumar Teaches Filmmaking (real prod offering, payment_mode single/non-staged)",
    devServer: "npm run dev @ :8080, fresh Playwright context (no session ⇒ anon)",
    axe: cases[0]?.testEngine ?? null,
    gate: {
      tags: GATE_TAGS,
      standard: "WCAG 2.1 A + AA",
      note:
        "Inline role=alert errors tripped (each field blurred while empty) so the audit covers the error state too.",
    },
    summary: {
      worstGuestFormViolationCount: worstForm,
      worstPageViolationCount: worstPage,
      // Pass = the anon guest form (crit-8 subject) is clean AND no unexpected
      // in-scope page violation slipped in. The documented global meta-viewport
      // finding is deferred, not a failure of this item.
      pass: worstForm === 0 && inScopeUnexpected.length === 0,
      inScopePageViolations: inScopeUnexpected,
      deferredPageViolations: pageIds
        .filter((id) => id in OUT_OF_SCOPE)
        .map((id) => ({ id, reason: OUT_OF_SCOPE[id] })),
    },
    cases,
  };
  writeFileSync(
    path.join(OUT, "checkout-guest-axe.json"),
    JSON.stringify(out, null, 2),
  );
  console.log(
    `\nwrote design/qa/phase-3/checkout-guest-axe.json — pass=${out.summary.pass} ` +
      `(guest-form violations=${worstForm}, deferred global=${out.summary.deferredPageViolations.length})`,
  );
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
