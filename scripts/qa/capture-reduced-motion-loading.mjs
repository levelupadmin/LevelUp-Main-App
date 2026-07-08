// Phase-6 reduced-motion evidence — the five NEW loading surfaces.
//
// P6 replaced the old black-screen + centered-spinner waits with branded
// skeletons on five surfaces:
//   1. RouteFallback        — the Suspense fallback for every lazy route
//   2. CourseDetail skeleton — /courses/:id while the course query is pending
//   3. MyCoursesPage         — /learn?seg=courses (course-card grid + stat strip)
//   4. CommunityPage         — /community feed (post skeletons)
//   5. ProfilePage           — /profile account hub while sections are pending
//
// Every skeleton shimmers via the single `.skeleton-shimmer::after` band, which
// animates `transform: translateX` (compositor-only). The GLOBAL reduced-motion
// rule in src/index.css collapses `animation-duration` to 0.01ms and
// `animation-iteration-count` to 1 for *, *::before, *::after — so under
// prefers-reduced-motion:reduce every band snaps to its end frame (translateX
// 100%, off-canvas) on the first tick and stays put: the skeleton reads as a
// static, flat surface fill with the layout fully intact.
//
// This script proves that TWO ways, honestly:
//   • a full-page screenshot per surface, captured with the context in
//     reducedMotion:'reduce' (layout intact, no artifacts), and
//   • a computed-style probe of a live `.skeleton-shimmer::after` on each
//     surface AND a no-preference control, written to reduced-motion-probe.json,
//     showing the band's animation duration/iteration-count collapses under
//     reduce (2s / infinite  →  ~0s / 1). A single frame can't show absence of
//     motion; the probe is the non-vacuous part of the evidence.
//
// The four page surfaces render on their real routes inside StudentLayout with
// DEV_ADMIN_BYPASS (localhost-only admin, see AuthContext) so no login is
// needed; their react-query fetchers are held PENDING by hanging the Supabase
// REST/RPC/auth calls, which is exactly the state the skeleton branch paints.
// RouteFallback has no route of its own, so it comes from qa-harness/.
//
// Rerun:
//   VITE_DEV_ADMIN_BYPASS=true npm run dev   # serves :8080
//   node scripts/qa/capture-reduced-motion-loading.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-6/reduced-motion");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:8080";
const VIEWPORT = { width: 375, height: 812 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hang every data call so the react-query surfaces stay in their pending
// (skeleton) branch. Auth is short-circuited by the dev bypass, so blocking
// these never trips the auth gate — it only freezes the content queries.
const HANG = /\/(rest|rpc|auth|functions|storage)\/v1\//;

// Read the live computed animation of a real `.skeleton-shimmer::after` so the
// evidence is the browser's own resolution of the reduced-motion cascade, not
// our assertion about it.
const probeShimmer = (page) =>
  page.evaluate(() => {
    const el = document.querySelector(".skeleton-shimmer");
    if (!el) return { found: false };
    const cs = getComputedStyle(el, "::after");
    return {
      found: true,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      animationIterationCount: cs.animationIterationCount,
      // The band should be parked at its end transform (off-canvas) rather than
      // mid-sweep. A non-identity matrix that isn't translateX(0) is fine; what
      // matters is it isn't animating.
      transform: cs.transform,
    };
  });

const hideDevBanner = (page) =>
  page.evaluate(() => {
    for (const el of document.querySelectorAll('div[role="status"]')) {
      if (/DEV ADMIN BYPASS/i.test(el.textContent || "")) el.style.display = "none";
    }
  });

async function newCtx(browser, reduce) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    reducedMotion: reduce ? "reduce" : "no-preference",
  });
  // Harness pages (route-fallback) self-render with no data; only hang the app
  // routes. Applying the route to every context is harmless for the harness
  // because it makes no matching request.
  await ctx.route("**/*", (route) => {
    if (HANG.test(route.request().url())) return; // never fulfil → stays pending
    return route.continue();
  });
  return ctx;
}

const SURFACES = [
  { file: "01-route-fallback", route: "/qa-harness/route-fallback.html", skeletonSel: ".skeleton-shimmer", harness: true },
  { file: "02-course-detail", route: "/courses/qa-reduced-motion", skeletonSel: ".skeleton-shimmer" },
  { file: "03-my-courses", route: "/learn?seg=courses", skeletonSel: ".skeleton-shimmer" },
  { file: "04-community", route: "/community", skeletonSel: ".skeleton-shimmer" },
  { file: "05-profile", route: "/profile", skeletonSel: "[data-account-hub], main, .skeleton-shimmer" },
];

const browser = await chromium.launch();
const probe = { generatedAt: new Date().toISOString(), viewport: VIEWPORT, surfaces: {} };

for (const s of SURFACES) {
  const ctx = await newCtx(browser, true);
  const page = await ctx.newPage();
  await page.goto(BASE + s.route, { waitUntil: "commit", timeout: 30000 });
  try {
    await page.waitForSelector(s.skeletonSel, { timeout: 12000, state: "attached" });
  } catch {
    /* Profile's account hub has no shimmer; the page still paints its pending
       surface. Screenshot regardless so the layout is on record. */
  }
  await sleep(900); // let layout settle at the frozen end frame
  if (!s.harness) await hideDevBanner(page);
  const reduced = await probeShimmer(page);
  await page.screenshot({ path: path.join(OUT, `${s.file}-375-reduce.png`), fullPage: true });
  probe.surfaces[s.file] = { route: s.route, reduce: reduced };
  await ctx.close();
  console.log(`✓ ${s.file}  ${s.route}  reduce=${JSON.stringify(reduced)}`);
}

// No-preference control on RouteFallback: same element, motion ON, so the probe
// file shows the exact before/after the reduced-motion rule produces.
{
  const ctx = await newCtx(browser, false);
  const page = await ctx.newPage();
  await page.goto(BASE + "/qa-harness/route-fallback.html", { waitUntil: "commit", timeout: 30000 });
  await page.waitForSelector(".skeleton-shimmer", { timeout: 12000, state: "attached" });
  await sleep(300);
  probe.surfaces["01-route-fallback"].noPreferenceControl = await probeShimmer(page);
  await ctx.close();
}

writeFileSync(path.join(OUT, "reduced-motion-probe.json"), JSON.stringify(probe, null, 2) + "\n");
await browser.close();
console.log("done →", OUT);
