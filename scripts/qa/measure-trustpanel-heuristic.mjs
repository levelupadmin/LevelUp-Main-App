// Same heuristic-gap case, but with the offering fetch DELAYED so the loading
// branch (no reserved TrustPanel column) is guaranteed to paint before the
// loaded branch (which adds the column). This is the worst case for the add →
// if it shifts at all, it shifts here.
import { chromium } from "playwright";

const OFFERING = "190a09ee-3f34-4242-ad9f-70ddedcc8eae";
const DELAY_MS = 1200; // hold offering-shaped responses so the skeleton paints

const cases = [
  { label: "app_fee-no-app (gap, add column)", url: `http://localhost:8080/checkout/${OFFERING}?type=app_fee` },
  { label: "full (baseline)", url: `http://localhost:8080/checkout/${OFFERING}` },
];
const VPS = [
  { label: "desktop-1280", width: 1280, height: 900 },
  { label: "mobile-375", width: 375, height: 812 },
];

async function measure(browser, url, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const page = await ctx.newPage();
  // Delay Supabase REST reads (the offering fetch) so `loading` stays true long
  // enough for the no-column skeleton to composite a frame.
  await page.route("**/rest/v1/**", async (route) => {
    await new Promise((r) => setTimeout(r, DELAY_MS));
    route.continue();
  });
  await page.addInitScript(() => {
    window.__cls = 0; window.__shifts = []; window.__sawSingle = false;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        if (!e.hadRecentInput) {
          window.__cls += e.value;
          window.__shifts.push({ value: +e.value.toFixed(5), t: +e.startTime.toFixed(0), sources: (e.sources||[]).map(s=>s.node?.nodeName) });
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
    // Sample whether a single-column (no aside) skeleton ever painted.
    const iv = setInterval(() => {
      if (document.querySelector(".min-h-screen") && document.querySelectorAll("aside").length === 0 && !document.getElementById("guest-name")) {
        window.__sawSingle = true;
      }
    }, 30);
    setTimeout(() => clearInterval(iv), 3000);
  });
  await page.goto(url, { waitUntil: "commit" });
  await page.waitForSelector("#guest-name", { timeout: 15000 });
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => ({
    cls: +window.__cls.toFixed(5),
    shifts: window.__shifts,
    aside: document.querySelectorAll("aside").length,
    sawSingle: window.__sawSingle,
  }));
  await ctx.close();
  return r;
}

const browser = await chromium.launch();
for (const c of cases) {
  for (const vp of VPS) {
    const r = await measure(browser, c.url, vp);
    console.log(`${c.label} @ ${vp.label}: CLS=${r.cls} aside=${r.aside} sawNoColumnSkeleton=${r.sawSingle} shifts=${JSON.stringify(r.shifts)}`);
  }
}
await browser.close();
