#!/usr/bin/env node
/**
 * Drive the running Vite dev server (localhost:8080) with Playwright,
 * log in as admin, walk through every documented flow step, and save
 * desktop + mobile PNGs to src/docs/screenshots/.
 *
 * Usage:  node scripts/capture_docs_screenshots.mjs
 *
 * The dev server must already be running:
 *   npm run dev   (or use the preview_start MCP tool)
 *
 * Output filename convention:
 *   <flow-slug>-<step-index>-<device>.png
 *   browse-desktop.png   browse-mobile.png   (for standalone pages)
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "src", "docs", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:8080";
const ADMIN_EMAIL = "rahul@rahul.com";
const ADMIN_PASSWORD = "rahul123";

const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };
const MOBILE = { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

/**
 * What we capture. Each entry produces a desktop + mobile PNG.
 * `setup` is an async fn run inside the page before the screenshot.
 * `wait` is an optional selector + timeout pair to wait for.
 * `requiresAuth` triggers the admin login flow before the visit.
 * `scroll` snaps to a scroll position before shooting.
 */
const SHOTS = [
  // Public/anon pages
  { slug: "browse",                requiresAuth: false, url: "/browse",          wait: "h1" },
  { slug: "login",                 requiresAuth: false, url: "/login",           wait: "input[type='tel'], input[name='phone']" },
  // Authenticated student pages
  { slug: "home",                  requiresAuth: true,  url: "/home",            wait: "main" },
  { slug: "community-everyone",    requiresAuth: true,  url: "/community",       wait: "h1, textarea" },
  { slug: "profile",               requiresAuth: true,  url: "/profile",         wait: "main" },
  // Admin pages
  { slug: "admin-dashboard",       requiresAuth: true,  url: "/admin",           wait: "main" },
  { slug: "admin-offerings",       requiresAuth: true,  url: "/admin/offerings", wait: "main" },
  { slug: "admin-courses",         requiresAuth: true,  url: "/admin/courses",   wait: "main" },
  { slug: "admin-users",           requiresAuth: true,  url: "/admin/users",     wait: "table, main" },
  { slug: "admin-revenue",         requiresAuth: true,  url: "/admin/revenue",   wait: "main" },
  { slug: "admin-enrolments",      requiresAuth: true,  url: "/admin/enrolments",wait: "main" },
  { slug: "admin-coupons",         requiresAuth: true,  url: "/admin/coupons",   wait: "main" },
  { slug: "admin-cohorts",         requiresAuth: true,  url: "/admin/cohorts",   wait: "main" },
  { slug: "admin-applications",    requiresAuth: true,  url: "/admin/applications", wait: "main" },
  { slug: "admin-api-keys",        requiresAuth: true,  url: "/admin/api",       wait: "main" },
  { slug: "admin-api-install",     requiresAuth: true,  url: "/admin/api",       wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Install")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-api-webhooks",    requiresAuth: true,  url: "/admin/api",       wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Webhooks")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-api-activity",    requiresAuth: true,  url: "/admin/api",       wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Activity")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-api-surface",     requiresAuth: true,  url: "/admin/api",       wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Surface")').catch(() => {}); await page.waitForTimeout(700); } },
  { slug: "admin-docs-overview",   requiresAuth: true,  url: "/admin/docs",      wait: "main" },
  { slug: "admin-docs-features",   requiresAuth: true,  url: "/admin/docs",      wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Features")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-docs-flows",      requiresAuth: true,  url: "/admin/docs",      wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Flows")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-docs-schema",     requiresAuth: true,  url: "/admin/docs",      wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Schema")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-docs-changelog",  requiresAuth: true,  url: "/admin/docs",      wait: "main",
    setup: async (page) => { await page.click('button[role="tab"]:has-text("Changelog")').catch(() => {}); await page.waitForTimeout(400); } },
  { slug: "admin-email-templates", requiresAuth: true,  url: "/admin/email-templates", wait: "main" },
  { slug: "admin-email-campaigns", requiresAuth: true,  url: "/admin/email-campaigns", wait: "main" },
  { slug: "admin-announcements",   requiresAuth: true,  url: "/admin/announcements",   wait: "main" },
];

async function login(page) {
  // Email-based admin login (rahul@rahul.com). Login page is OTP-first
  // but accepts email+password via a fallback toggle. To keep this
  // simple we use Supabase auth directly via the supabase client that
  // already exists in the app.
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle").catch(() => {});

  // Use the app's own supabase client via window
  await page.evaluate(async ({ email, password }) => {
    // @ts-ignore
    const { supabase } = await import("/src/integrations/supabase/client.ts").catch(() => ({}));
    if (supabase?.auth) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) console.error("login error:", error.message);
    }
  }, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });

  await page.goto(`${BASE}/home`);
  await page.waitForLoadState("networkidle").catch(() => {});
  // Verify
  const url = page.url();
  if (url.includes("/login")) {
    console.error("WARN: login may have failed. Continuing anyway — public pages will still capture.");
  }
}

async function capture(browser, device) {
  const ctx = await browser.newContext({
    viewport: { width: device.width, height: device.height },
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile ?? false,
    hasTouch: device.hasTouch ?? false,
    userAgent: device.isMobile
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);

  // Login once for this context
  console.log(`\n=== ${device.label} ===`);
  await login(page);

  for (const shot of SHOTS) {
    const outFile = path.join(OUT, `${shot.slug}-${device.label}.png`);
    try {
      await page.goto(`${BASE}${shot.url}`);
      await page.waitForLoadState("networkidle").catch(() => {});
      if (shot.wait) await page.waitForSelector(shot.wait, { timeout: 5000 }).catch(() => {});
      if (shot.setup) await shot.setup(page);
      await page.waitForTimeout(300); // settle
      await page.screenshot({ path: outFile, fullPage: false });
      console.log(`  ✓ ${shot.slug}-${device.label}.png`);
    } catch (e) {
      console.log(`  ✗ ${shot.slug}-${device.label}: ${e.message.split("\n")[0]}`);
    }
  }

  await ctx.close();
}

(async () => {
  console.log(`Capturing ${SHOTS.length} pages × 2 devices = ${SHOTS.length * 2} screenshots`);
  console.log(`Output: ${OUT}`);
  const browser = await chromium.launch({ headless: true });
  await capture(browser, { ...DESKTOP, label: "desktop" });
  await capture(browser, { ...MOBILE,  label: "mobile" });
  await browser.close();
  console.log("\nDone.");
})().catch((e) => { console.error(e); process.exit(1); });
