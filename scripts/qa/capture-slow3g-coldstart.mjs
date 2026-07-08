// P6 cold-start evidence — Slow-3G filmstrip for /login (anon) and /home.
//
// Reproduces the vision-audit baseline capture (design/vision/shots/slow3g-home_t*.png,
// "24s of black") against the PROD BUILD served from dist/, under Chrome DevTools
// "Slow 3G" network + 4x CPU throttle, mobile 375x812.
//
// WHY CDP SCREENCAST (not page.screenshot on a timer): under a 4x CPU throttle +
// Slow-3G, page.screenshot() calls block and bunch up, so a wall-clock screenshot
// scheduler drifts and mislabels frames. Page.startScreencast pushes frames stamped
// by the browser compositor itself (metadata.timestamp), independent of the throttled
// main thread — the same mechanism DevTools' own filmstrip uses. We then map each
// baseline timestamp to the last frame painted at-or-before it.
//
// BRAND-PAINT metric = First Contentful Paint (Paint Timing API), the authoritative
// "brand appeared" signal (a solid background color is NOT contentful, so FCP fires
// exactly when the first branded pixels — wordmark / hero text — land). Corroborated
// by a page-side MutationObserver that stamps when the LevelUp wordmark enters the DOM.
//
// Does NOT build (orchestrator owns integration) — serves whatever is in dist/.
//   Serve dist:  npx vite preview --port 4188 --strictPort
//   Capture:     node scripts/qa/capture-slow3g-coldstart.mjs [--tag before|after]
//
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const TAG = (() => {
  const i = process.argv.indexOf("--tag");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : "after";
})();
const BASE = process.env.PREVIEW_BASE || "http://localhost:4188";
const OUT = path.join(ROOT, "design/qa/phase-6/slow3g", TAG);
mkdirSync(OUT, { recursive: true });

// Baseline filmstrip timestamps (ms) — mirror design/vision/shots/slow3g-home_t*.png.
const FRAMES_MS = [1200, 3000, 6000, 10000, 16000, 24000];
const CAPTURE_WINDOW_MS = 26000;
const BRAND_BUDGET_MS = 2500;

// Chrome DevTools "Slow 3G" (matches puppeteer PredefinedNetworkConditions):
//   ~50 KB/s down/up, 2000ms latency.
const SLOW_3G = {
  offline: false,
  downloadThroughput: Math.floor((500 * 1000) / 8) * 0.8, // 50,000 B/s
  uploadThroughput: Math.floor((500 * 1000) / 8) * 0.8,
  latency: 400 * 5, // 2000 ms
};
const CPU_RATE = 4;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stamp, in-page and unthrottleable-ish, the moment the wordmark enters the DOM.
const BRAND_OBSERVER = `
  (() => {
    const mark = () => {
      if (window.__brandPaint == null &&
          document.querySelector('[aria-label="LevelUp Learning"]')) {
        window.__brandPaint = performance.now();
        return true;
      }
      return false;
    };
    if (!mark()) {
      const mo = new MutationObserver(() => { if (mark()) mo.disconnect(); });
      mo.observe(document.documentElement, { childList: true, subtree: true });
    }
  })();
`;

async function captureRoute(browser, routeName, urlPath) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  await page.addInitScript(BRAND_OBSERVER);

  const client = await ctx.newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Page.enable");
  await client.send("Network.emulateNetworkConditions", SLOW_3G);
  await client.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });

  // Collect compositor-stamped frames. metadata.timestamp is seconds (monotonic
  // wall clock); we convert to ms-since-navigation using navWallStart below.
  const shots = []; // { offsetMs, b64 }
  let navWallStart = null;
  client.on("Page.screencastFrame", async (f) => {
    try {
      await client.send("Page.screencastFrameAck", { sessionId: f.sessionId });
    } catch {}
    if (navWallStart == null) return;
    shots.push({
      offsetMs: Math.round(f.metadata.timestamp * 1000 - navWallStart),
      b64: f.data,
    });
  });

  navWallStart = Date.now();
  await client.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
  const nav = page
    .goto(`${BASE}${urlPath}`, { waitUntil: "commit", timeout: 60000 })
    .catch(() => {});

  await sleep(CAPTURE_WINDOW_MS);
  await client.send("Page.stopScreencast").catch(() => {});

  // Authoritative brand-paint = FCP; corroborate with the wordmark observer.
  const timing = await page
    .evaluate(() => {
      const paints = {};
      for (const p of performance.getEntriesByType("paint")) paints[p.name] = Math.round(p.startTime);
      const nav = performance.getEntriesByType("navigation")[0];
      return {
        firstPaint: paints["first-paint"] ?? null,
        firstContentfulPaint: paints["first-contentful-paint"] ?? null,
        wordmarkInDomMs: window.__brandPaint != null ? Math.round(window.__brandPaint) : null,
        domContentLoaded: nav ? Math.round(nav.domContentLoadedEventEnd) : null,
        responseEnd: nav ? Math.round(nav.responseEnd) : null,
      };
    })
    .catch(() => ({}));

  // Map each baseline timestamp to the last frame painted at-or-before it.
  shots.sort((a, b) => a.offsetMs - b.offsetMs);
  const frames = [];
  for (const target of FRAMES_MS) {
    let pick = null;
    for (const s of shots) {
      if (s.offsetMs <= target) pick = s;
      else break;
    }
    const file = `${routeName}_t${target}.png`;
    if (pick) {
      writeFileSync(path.join(OUT, file), Buffer.from(pick.b64, "base64"));
      frames.push({ t: target, file, frameOffsetMs: pick.offsetMs });
    } else {
      frames.push({ t: target, file: null, frameOffsetMs: null });
    }
  }

  await nav;
  await ctx.close();

  const brandPaintMs = timing.firstContentfulPaint ?? timing.wordmarkInDomMs ?? null;
  const pass = brandPaintMs !== null && brandPaintMs <= BRAND_BUDGET_MS;
  return {
    route: routeName,
    url: `${BASE}${urlPath}`,
    brandPaintMs,
    brandBudgetMs: BRAND_BUDGET_MS,
    pass,
    paintTiming: timing,
    screencastFrames: shots.length,
    frames,
  };
}

async function run() {
  const browser = await chromium.launch();
  const results = {
    tag: TAG,
    generatedAt: new Date().toISOString(),
    base: BASE,
    throttle: { network: "Slow 3G (50KB/s, 2000ms RTT)", cpuRate: CPU_RATE },
    viewport: "375x812 @2x mobile",
    brandPaintMetric: "First Contentful Paint (Paint Timing API); wordmark DOM stamp as corroboration",
    routes: [],
  };

  results.routes.push(await captureRoute(browser, "login", "/login"));
  results.routes.push(await captureRoute(browser, "home", "/home"));

  await browser.close();
  writeFileSync(path.join(OUT, "timing.json"), JSON.stringify(results, null, 2));

  console.log(`\n=== Slow-3G cold-start (${TAG}) ===`);
  for (const r of results.routes) {
    const verdict = r.pass ? "PASS" : "FAIL";
    console.log(
      `${r.route.padEnd(6)} brand-paint(FCP) ${String(r.brandPaintMs).padStart(6)}ms  ` +
        `(budget ${r.brandBudgetMs}ms) -> ${verdict}   ` +
        `wordmark-in-DOM=${r.paintTiming.wordmarkInDomMs}ms  frames=${r.screencastFrames}`,
    );
  }
  console.log(`\nArtifacts -> ${OUT}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
