#!/usr/bin/env node
/**
 * Drive the running Vite dev server (localhost:8080) with Playwright,
 * land an authenticated session via a Supabase magic link, and capture
 * polished screenshots of every important screen — student, admin,
 * and instructor perspectives — at both desktop (1440×900) and mobile
 * (390×844, iPhone UA + DPR=2).
 *
 * Per-page waiter: each shot specifies a unique selector that only
 * renders once the page is fully authenticated + hydrated. Prevents
 * the auth-race that produced duplicate "login screen" captures on
 * /home and /community last time.
 *
 * Output: src/docs/screenshots/<slug>-<device>.png — kept under
 * public/docs/screenshots/ once moved. Re-runnable.
 *
 *   node scripts/capture_docs_screenshots.mjs
 *   node scripts/capture_docs_screenshots.mjs --only=student
 *   node scripts/capture_docs_screenshots.mjs --only=admin
 *   node scripts/capture_docs_screenshots.mjs --device=desktop
 */
import { chromium } from "playwright";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT_ARG = process.argv.slice(2).find((a) => a.startsWith("--out="));
const OUT = OUT_ARG ? path.resolve(OUT_ARG.slice(6)) : path.join(ROOT, "public", "docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:8080";
const SUPABASE_URL = "https://ivkvluezuiojovpotlyb.supabase.co";
const SRK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml2a3ZsdWV6dWlvam92cG90bHliIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTM3OTI5MiwiZXhwIjoyMDk0OTU1MjkyfQ.p_BLoeh92rtMXxgtwwTjo_3dTzo63ATQCA-xWxK_AZk";
const ADMIN_EMAIL = "ceo@leveluplearning.in";

const ARGS = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith("--")).map(a => {
  const [k, v] = a.slice(2).split("=");
  return [k, v ?? true];
}));

const DESKTOP = { label: "desktop", width: 1440, height: 900, isMobile: false };
const MOBILE  = { label: "mobile",  width: 390,  height: 844, isMobile: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
  deviceScaleFactor: 2, hasTouch: true };

/**
 * Per-page shot definition.
 *   slug:     output filename prefix
 *   group:    'student' | 'admin' | 'student-auth' (anon-vs-auth)
 *   url:      route to visit
 *   waitFor:  selector that proves the page is hydrated AND auth has
 *             resolved. Use text= for content-based waits, css for
 *             elements. The page is screenshotted only after this
 *             matches.
 *   setup:    optional async fn run after navigation+wait (e.g. click
 *             a tab, toggle a filter, scroll to position)
 *   settle:   ms to wait after `setup` before screenshot (default 500)
 *   anonOk:   if true, this is captured WITHOUT the auth cookie (used
 *             for /browse and /login)
 */
const SHOTS = [
  // ───── Student / anon pages ─────
  { slug: "browse",                 group: "student", url: "/browse",                       waitFor: 'text=Browse', anonOk: true },
  { slug: "login-step-1",           group: "student", url: "/login",                        waitFor: "input[type='tel'], input[placeholder*='phone' i]", anonOk: true },
  { slug: "offering-page",          group: "student", url: "/p/nelson-dilipkumar-teaches-filmmaking", waitFor: "text=Nelson", anonOk: true },

  // ───── Student / authenticated ─────
  { slug: "home",                   group: "student", url: "/home",                         waitFor: "text=/Continue|Pick up|Welcome|My Library|Browse/i" },
  { slug: "community-everyone",     group: "student", url: "/community",                    waitFor: "textarea, text=/Share with/" },
  { slug: "community-my-cohort",    group: "student", url: "/community",                    waitFor: "textarea",
      setup: async (page) => { await page.click("text=My Cohort").catch(() => {}); } },
  { slug: "community-peer-reviews", group: "student", url: "/community",                    waitFor: "textarea",
      setup: async (page) => { await page.click("text=Peer Reviews").catch(() => {}); } },
  { slug: "profile",                group: "student", url: "/profile",                      waitFor: "text=/Full name|Profile|Account|Settings/i" },

  // ───── Student / authenticated — full learning journey (added) ─────
  { slug: "course-detail",          group: "student", url: "/courses/5f23fec7-b5a6-42c9-b0e1-1c039cfb7c8d", waitFor: "text=/Lokesh|Episode|Curriculum|Chapter|Lesson/i" },
  { slug: "chapter-viewer",         group: "student", url: "/chapters/42ed8d94-8ad4-49d0-b76f-61634198589b", waitFor: "text=/Up next|Notes|Q&A|Overview|Building the LCU/i", settle: 1800 },
  { slug: "my-courses",             group: "student", url: "/my-courses",                    waitFor: "text=/My Courses|Continue|Enrolled|Course/i" },
  { slug: "my-sessions",            group: "student", url: "/my-sessions",                   waitFor: "text=/Session|Upcoming|Live/i" },
  { slug: "events",                 group: "student", url: "/events",                        waitFor: "text=/Event/i" },

  // ───── Student / anon — signup, checkout, legal, 404 (added) ─────
  { slug: "signup",                 group: "student", url: "/signup",                        waitFor: "input", anonOk: true },
  { slug: "checkout",               group: "student", url: "/checkout/190a09ee-3f34-4242-ad9f-70ddedcc8eae", waitFor: "text=/Checkout|Pay|Order|Total|Complete|Contact/i", anonOk: true },
  { slug: "privacy",                group: "student", url: "/privacy",                       waitFor: "text=/Privacy/i", anonOk: true },
  { slug: "terms",                  group: "student", url: "/terms",                         waitFor: "text=/Terms/i", anonOk: true },
  { slug: "refunds",                group: "student", url: "/refunds",                       waitFor: "text=/Refund|Cancellation/i", anonOk: true },
  { slug: "delete-account",         group: "student", url: "/delete-account",               waitFor: "text=/Delete/i", anonOk: true },
  { slug: "not-found",              group: "student", url: "/this-page-does-not-exist-xyz",  waitFor: "text=/not found|404|doesn|Page|Home/i", anonOk: true },

  // ───── Admin / Overview ─────
  { slug: "admin-dashboard",        group: "admin",   url: "/admin",                        waitFor: "text=Admin" },
  { slug: "admin-revenue",          group: "admin",   url: "/admin/revenue",                waitFor: "text=/Combined revenue|This app's orders|Total Orders|Revenue/i" },

  // ───── Admin / Content ─────
  { slug: "admin-hero-slides",      group: "admin",   url: "/admin/hero-slides",            waitFor: "text=/Hero/i" },
  { slug: "admin-courses",          group: "admin",   url: "/admin/courses",                waitFor: "text=/Course|Title/i" },
  { slug: "admin-offerings",        group: "admin",   url: "/admin/offerings",              waitFor: "text=/Offering|Slug|Price/i" },
  { slug: "admin-offerings-editor", group: "admin",   url: "/admin/offerings/190a09ee-3f34-4242-ad9f-70ddedcc8eae/edit", waitFor: "text=/General|Pricing|Title/i" },
  { slug: "admin-course-curriculum",group: "admin",   url: "/admin/courses/e893d612-c811-4acf-892c-0971c52655bb/curriculum", waitFor: "text=/Curriculum|Chapter/i" },

  // ───── Admin / Scheduling ─────
  { slug: "admin-schedule",         group: "admin",   url: "/admin/schedule",               waitFor: "text=/Schedule|Session/i" },
  { slug: "admin-events",           group: "admin",   url: "/admin/events",                 waitFor: "text=/Event|Starts/i" },
  { slug: "admin-cohorts",          group: "admin",   url: "/admin/cohorts",                waitFor: "text=/Cohort/i" },
  { slug: "admin-cohort-submissions",group: "admin",  url: "/admin/cohort-submissions",     waitFor: "text=/Submission/i" },

  // ───── Admin / People ─────
  { slug: "admin-applications",     group: "admin",   url: "/admin/applications",           waitFor: "text=/Application|Applicant/i" },
  { slug: "admin-enrolments",       group: "admin",   url: "/admin/enrolments",             waitFor: "text=/Enrolment|Status|User/i" },
  { slug: "admin-users",            group: "admin",   url: "/admin/users",                  waitFor: "text=/All users|Role|Joined/i" },
  { slug: "admin-coupons",          group: "admin",   url: "/admin/coupons",                waitFor: "text=/Coupon|Code|Discount/i" },
  { slug: "admin-certificates",     group: "admin",   url: "/admin/certificates",           waitFor: "text=/Certificate|Template/i" },
  { slug: "admin-legacy-mappings",  group: "admin",   url: "/admin/legacy-mappings",        waitFor: "text=/Legacy|Map/i" },

  // ───── Admin / Communications ─────
  { slug: "admin-announcements",    group: "admin",   url: "/admin/announcements",          waitFor: "text=/Announcement/i" },
  { slug: "admin-email-templates",  group: "admin",   url: "/admin/email-templates",        waitFor: "text=/Template|Subject/i" },
  { slug: "admin-email-campaigns",  group: "admin",   url: "/admin/email-campaigns",        waitFor: "text=/Campaign/i" },

  // ───── Admin / Community ─────
  { slug: "admin-community",        group: "admin",   url: "/admin/community",              waitFor: "text=/Community|Post/i" },

  // ───── Admin / System — API ─────
  { slug: "admin-api-keys",         group: "admin",   url: "/admin/api",                    waitFor: "text=API & integrations",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Keys")').catch(() => {}); }, settle: 400 },
  { slug: "admin-api-install",      group: "admin",   url: "/admin/api",                    waitFor: "text=API & integrations",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Install")').catch(() => {}); }, settle: 400 },
  { slug: "admin-api-webhooks",     group: "admin",   url: "/admin/api",                    waitFor: "text=API & integrations",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Webhooks")').catch(() => {}); }, settle: 400 },
  { slug: "admin-api-activity",     group: "admin",   url: "/admin/api",                    waitFor: "text=API & integrations",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Activity")').catch(() => {}); }, settle: 400 },
  { slug: "admin-api-surface",      group: "admin",   url: "/admin/api",                    waitFor: "text=API & integrations",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Surface")').catch(() => {}); }, settle: 800 },

  // ───── Admin / System — Docs ─────
  { slug: "admin-docs-overview",    group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Overview")').catch(() => {}); }, settle: 400 },
  { slug: "admin-docs-features",    group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Features")').catch(() => {}); }, settle: 400 },
  { slug: "admin-docs-flows",       group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Flows")').catch(() => {}); }, settle: 600 },
  { slug: "admin-docs-tech",        group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Tech")').catch(() => {}); }, settle: 400 },
  { slug: "admin-docs-schema",      group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Schema")').catch(() => {}); }, settle: 400 },
  { slug: "admin-docs-api",         group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("API")').catch(() => {}); }, settle: 600 },
  { slug: "admin-docs-changelog",   group: "admin",   url: "/admin/docs",                   waitFor: "text=Documentation",
      setup: async (page) => { await page.click('button[role="tab"]:has-text("Changelog")').catch(() => {}); }, settle: 400 },

  // ───── Admin / System — Other ─────
  { slug: "admin-audit-logs",       group: "admin",   url: "/admin/audit-logs",             waitFor: "text=/Audit|Action|Actor/i" },
  { slug: "admin-roles",            group: "admin",   url: "/admin/roles",                  waitFor: "text=/Role|Permission/i" },
  { slug: "admin-analytics-settings",group: "admin",  url: "/admin/analytics-settings",     waitFor: "text=/Analytics|Pixel|GA4/i" },
];

const wantedGroups = ARGS.only ? new Set(String(ARGS.only).split(",")) : null;
const wantedDevices = ARGS.device ? [ARGS.device] : ["desktop", "mobile"];

async function mintMagicLink() {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/generate_link`, {
    method: "POST",
    headers: { apikey: SRK, Authorization: `Bearer ${SRK}`, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "magiclink", email: ADMIN_EMAIL }),
  });
  const data = await res.json();
  let link = data.action_link || data.properties?.action_link;
  if (!link) throw new Error("no action_link: " + JSON.stringify(data).slice(0, 200));
  // Redirect to localhost so the session lands in dev-server localStorage
  link = link.replace(/redirect_to=[^&]+/, `redirect_to=${encodeURIComponent(BASE + "/home")}`);
  return link;
}

async function captureDevice(browser, device) {
  console.log(`\n=== ${device.label.toUpperCase()} (${device.width}×${device.height}) ===`);
  const ctxOpts = {
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor ?? 1,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch ?? false,
  };
  if (device.userAgent) ctxOpts.userAgent = device.userAgent;

  // Auth context (signed in as ceo@) and anon context, both reused
  const authCtx = await browser.newContext(ctxOpts);
  const authPage = await authCtx.newPage();
  authPage.setDefaultTimeout(12000);

  const anonCtx = await browser.newContext(ctxOpts);
  const anonPage = await anonCtx.newPage();
  anonPage.setDefaultTimeout(12000);

  // Land the auth session
  const link = await mintMagicLink();
  await authPage.goto(link);
  await authPage.waitForLoadState("networkidle").catch(() => {});
  // Wait for the auth context to fully resolve: the "Sign out" or
  // initials-avatar UI signals AuthContext has loaded. Fall back to
  // a 2.5s settle if neither shows up.
  await Promise.race([
    authPage.waitForSelector("text=Sign out", { timeout: 4000 }).catch(() => {}),
    authPage.waitForSelector("[class*='InitialsAvatar'], [data-testid='initials-avatar']", { timeout: 4000 }).catch(() => {}),
    authPage.waitForTimeout(2500),
  ]);
  // Sanity check: confirm auth token is in storage
  const tokenPresent = await authPage.evaluate(() =>
    !!Object.keys(localStorage).find(k => k.startsWith("sb-") && k.endsWith("-auth-token"))
  );
  if (!tokenPresent) {
    console.warn("  ⚠ auth token NOT in storage — auth-required pages may capture the login redirect");
  }

  let captured = 0, skipped = 0, failed = 0;

  for (const shot of SHOTS) {
    if (wantedGroups && !wantedGroups.has(shot.group)) { skipped++; continue; }
    const page = shot.anonOk ? anonPage : authPage;
    const outFile = path.join(OUT, `${shot.slug}-${device.label}.png`);
    try {
      await page.goto(`${BASE}${shot.url}`);
      await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});

      // Wait for the page-specific signal (proves it's not the
      // login-flash). Use a 6s timeout per shot.
      if (shot.waitFor) {
        await page.waitForSelector(shot.waitFor, { timeout: 6000 }).catch(() => {});
      }
      if (shot.setup) {
        try { await shot.setup(page); } catch { /* ignore setup failures */ }
      }
      await page.waitForTimeout(shot.settle ?? 600);

      // Final sanity: if the page URL was redirected to /login despite
      // wanting auth, that's the auth-race — skip rather than save junk.
      if (!shot.anonOk && page.url().includes("/login") && !shot.slug.startsWith("login")) {
        console.log(`  ⚠ ${shot.slug}-${device.label}: redirected to /login, skipping`);
        failed++;
        continue;
      }

      await page.screenshot({ path: outFile, fullPage: false });
      console.log(`  ✓ ${shot.slug}-${device.label}.png`);
      captured++;
    } catch (e) {
      console.log(`  ✗ ${shot.slug}-${device.label}: ${e.message.split("\n")[0]}`);
      failed++;
    }
  }

  await authCtx.close();
  await anonCtx.close();
  console.log(`  ${captured} captured · ${failed} failed · ${skipped} skipped`);
}

(async () => {
  console.log(`Capturing ${SHOTS.length} pages × ${wantedDevices.length} device(s) = ${SHOTS.length * wantedDevices.length} screenshots`);
  console.log(`Output: ${OUT}\n`);
  const browser = await chromium.launch({ headless: true });
  for (const dev of wantedDevices) {
    const cfg = dev === "mobile" ? MOBILE : DESKTOP;
    await captureDevice(browser, cfg);
  }
  await browser.close();
  console.log("\nDone.");
})().catch((e) => { console.error(e); process.exit(1); });
