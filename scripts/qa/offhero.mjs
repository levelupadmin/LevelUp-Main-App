// Phase-5 punch-list probe — Offering hero collision check.
//
// The cinematic HeroBanner overlays a centred "Watch lesson 1" play chip on top
// of the bottom-anchored title block whose first line is the "Masterclass"
// eyebrow. On the tall mobile aspect (4/5) with a multi-line title, the chip's
// label and the eyebrow can share a vertical band and their boxes intersect,
// clipping the eyebrow ink. This probe measures both boxes at 360 and 375 and
// reports OVERLAP true/false, plus writes screenshots.
//
// Rerun: BASE=http://127.0.0.1:8188 node scripts/qa/offhero.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-5");
mkdirSync(OUT, { recursive: true });

const BASE = process.env.BASE || "http://127.0.0.1:8188";
const SLUG = process.env.SLUG || "lokesh-kanagaraj-teaches-film-making";
const WIDTHS = [360, 375];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Two axis-aligned boxes intersect when they overlap on BOTH axes.
function intersects(a, b) {
  if (!a || !b) return false;
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0;
}

async function measure(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 820 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/p/${SLUG}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForSelector("h1", { timeout: 15000 });
  await sleep(900); // let the scale-settle entrance finish

  // Eyebrow = the mono uppercase line directly above the hero <h1>.
  // Chip label = the pill under the play button (aria-label "Watch lesson 1").
  const boxes = await page.evaluate(() => {
    const chipBtn = document.querySelector('button[aria-label="Watch lesson 1"]');
    // The label pill is the last span child of the chip button.
    const chipLabel = chipBtn ? chipBtn.querySelector("span:last-child") : null;
    // Eyebrow: the <p> immediately preceding the hero <h1>.
    const h1 = document.querySelector("h1");
    let eyebrow = null;
    if (h1) {
      let prev = h1.previousElementSibling;
      while (prev && prev.tagName !== "P") prev = prev.previousElementSibling;
      if (prev && /masterclass|live cohort/i.test(prev.textContent || "")) eyebrow = prev;
    }
    const rect = (el) =>
      el ? (({ x, y, width, height }) => ({ x, y, width, height }))(el.getBoundingClientRect()) : null;
    const clipped = (el) =>
      el ? el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1 : null;
    return {
      chipLabel: rect(chipLabel),
      chipLabelText: chipLabel ? chipLabel.textContent.trim() : null,
      eyebrow: rect(eyebrow),
      eyebrowText: eyebrow ? eyebrow.textContent.trim() : null,
      eyebrowClipped: clipped(eyebrow),
    };
  });

  const overlap = intersects(boxes.chipLabel, boxes.eyebrow);
  await page.screenshot({ path: path.join(OUT, `offering-${width}-top.png`) });
  await context.close();
  return { width, overlap, ...boxes };
}

(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const w of WIDTHS) {
    const r = await measure(browser, w);
    results.push(r);
    console.log(
      `@${w}: OVERLAP=${r.overlap}  eyebrow="${r.eyebrowText}"  chip="${r.chipLabelText}"`,
    );
    console.log(`   eyebrowBox=${JSON.stringify(r.eyebrow)}  chipBox=${JSON.stringify(r.chipLabel)}`);
  }
  await browser.close();
  const anyOverlap = results.some((r) => r.overlap);
  writeFileSync(
    path.join(OUT, "offhero.json"),
    JSON.stringify({ measuredAt: new Date().toISOString(), base: BASE, slug: SLUG, anyOverlap, results }, null, 2),
  );
  console.log(`\nOVERLAP(any)=${anyOverlap} — wrote design/qa/phase-5/offhero.json`);
  process.exit(anyOverlap ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
