// Phase-3 punch list — Checkout sticky→in-card Pay handoff verification.
//
// Reproduces + verifies the fix for the "double-lit champagne CTA" at the
// checkout sticky→inline handoff (StickyPayBar.tsx). Two symptoms, two legs:
//
//   (1) The sticky bar exited y-ONLY at full opacity while the in-card champagne
//       Pay was already lit → both CTAs bright during the ~400ms slide-down
//       (a transient double-lit through the handoff motion). Fixed by adding an
//       opacity leg to the bar's entrance/exit so it FADES as it slides.
//   (2) The bar fill was bg-surface/[0.97] — a 3% alpha gap the in-card Pay label
//       ghosted through in the steady overlap band. Fixed by a solid, fully
//       opaque bg-surface fill.
//
// This probe drives BOTH shipping auth shapes:
//   • auth  → :8080 (VITE_DEV_ADMIN_BYPASS active → logged-in admin, no guest form)
//   • anon  → :8199 (bypass OFF, fresh context → guest form; taller page)
// at 375 AND 360, and:
//   A. sweeps scrollY across the whole page, settling >=950ms at every offset,
//      and counts champagne CTAs that render as BRIGHT GOLD and in-view (a
//      pixel measurement via the browser's own PNG decode) — must read 1 at
//      every settled offset (never a bright double-lit).
//   B. at the handoff band (sticky present + in-card behind it) measures the
//      GHOST TINT: mean (R-B) over the in-card CTA's covered region minus a
//      pure-surface baseline slice of the same bar. With the opaque fill this
//      is ~0 (no bleed-through); with the old /[0.97] fill it is > 0.
//   C. asserts the sticky bar's computed background-color is fully opaque
//      (alpha == 1), the structural guarantee that closes the ghost gap.
//   D. samples the bar's effective opacity across the exit to prove the added
//      opacity leg animates 1->0 (fades as it slides) rather than cutting.
//
// Writes design/qa/phase-3/settle-checkout-handoff.json + PNGs. Rerun:
//   node scripts/qa/settle-checkout-handoff.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-3");
mkdirSync(OUT, { recursive: true });

// Nelson Dilipkumar — real prod offering, single (non-staged) payment, so both
// the sticky bar and the in-card Pay render champagne (never disabled).
const OFFERING_ID = "190a09ee-3f34-4242-ad9f-70ddedcc8eae";
const CONFIGS = [
  { auth: "auth", base: "http://localhost:8080" }, // bypass → logged-in
  { auth: "anon", base: "http://localhost:8199" }, // no bypass → guest form
];
const VIEWPORTS = [
  { label: "375", width: 375, height: 812 },
  { label: "360", width: 360, height: 800 },
];
const SETTLE_MS = 950; // > exit tween (durations.slow = 400ms) + margin
const STEP = 50; // coarse sweep step
const GOLD_FRAC_LIT = 0.15; // >=15% bright-gold pixels in a CTA rect ⇒ "lit"

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A champagne CTA's class literally carries the gradient token "champagne-from"
// (cva arbitrary value). Matches BOTH the in-card Button and the sticky Button.
const CTA_SEL = '[class*="champagne-from"]';

// Measure every champagne CTA in the DOM: viewport rect, effective opacity
// (product up the ancestor chain — catches the sticky motion.div's opacity leg),
// whether it lives in the fixed sticky bar, and whether its rect is in-view.
function measureCtas(page) {
  return page.evaluate(
    ([sel]) => {
      const h = window.innerHeight;
      const out = [];
      let barTop = null; // top of the fixed, OPAQUE sticky bar (the occluder)
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        let op = 1;
        let node = el;
        let fixed = false;
        let fixedTop = null;
        while (node && node instanceof Element) {
          const cs = getComputedStyle(node);
          op *= parseFloat(cs.opacity || "1");
          if (cs.position === "fixed") {
            fixed = true;
            fixedTop = node.getBoundingClientRect().top; // the bar div, not the button
          }
          node = node.parentElement;
        }
        if (fixed && fixedTop != null) barTop = barTop == null ? fixedTop : Math.min(barTop, fixedTop);
        out.push({
          fixed,
          opacity: +op.toFixed(3),
          rect: { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, top: r.top },
          inView: r.bottom > 0 && r.top < h && r.width > 0 && r.height > 0,
        });
      }
      return { h, barTop, ctas: out };
    },
    [CTA_SEL],
  );
}

// Decode a full-viewport PNG screenshot in a blank page via the browser's own
// PNG decoder + canvas, and return brightness stats for each supplied rect:
//   goldFrac  — fraction of pixels that read as bright champagne gold
//               (R-B > 25 AND R > 150), and
//   meanRB    — mean (R-B) over the rect (the ghost-tint signal; ~0 on surface).
async function sampleRects(decoder, pngBuffer, rects, vw, vh) {
  const dataUrl = "data:image/png;base64," + pngBuffer.toString("base64");
  return decoder.evaluate(
    async ([url, rectsIn, w, h]) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const c = document.createElement("canvas");
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0);
      // Screenshot is deviceScaleFactor 1 ⇒ 1px == 1 CSS px; map directly.
      const data = ctx.getImageData(0, 0, c.width, c.height).data;
      return rectsIn.map((rc) => {
        const x0 = Math.max(0, Math.floor(rc.x));
        const y0 = Math.max(0, Math.floor(rc.y));
        const x1 = Math.min(c.width, Math.ceil(rc.x + rc.w));
        const y1 = Math.min(c.height, Math.ceil(rc.y + rc.h));
        let gold = 0;
        let n = 0;
        let sumRB = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * c.width + x) * 4;
            const R = data[i];
            const G = data[i + 1];
            const B = data[i + 2];
            n++;
            sumRB += R - B;
            if (R - B > 25 && R > 150 && R >= G) gold++;
          }
        }
        return {
          px: n,
          goldFrac: n ? +(gold / n).toFixed(4) : 0,
          meanRB: n ? +(sumRB / n).toFixed(3) : 0,
        };
      });
    },
    [dataUrl, rects, vw, vh],
  );
}

async function runConfig(browser, decoder, cfg, vp) {
  const tag = `${cfg.auth}-${vp.label}`;
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const consoleErrors = [];
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  await page.goto(`${cfg.base}/checkout/${OFFERING_ID}`, { waitUntil: "networkidle" });
  await page.waitForSelector(CTA_SEL, { timeout: 20000 });
  await sleep(600); // entrance settle

  // ── C. Structural: the sticky bar fill must be fully opaque (alpha == 1).
  const barBg = await page.evaluate((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      let node = el;
      while (node && node instanceof Element) {
        if (getComputedStyle(node).position === "fixed") {
          const cs = getComputedStyle(node);
          return { bg: cs.backgroundColor };
        }
        node = node.parentElement;
      }
    }
    return null;
  }, CTA_SEL);
  // rgb(...) ⇒ opaque; rgba(...,<1) ⇒ translucent gap.
  const barAlpha = barBg
    ? (() => {
        const m = barBg.bg.match(/rgba?\(([^)]+)\)/);
        const parts = m ? m[1].split(",").map((s) => s.trim()) : [];
        return parts.length === 4 ? parseFloat(parts[3]) : 1;
      })()
    : null;

  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const maxScroll = Math.max(0, scrollHeight - vp.height);

  // Locate the in-card Pay button's page-y (rect.y at scrollTop 0 == page y) so
  // the dense pass targets the ACTUAL handoff band for THIS offering — the range
  // where the in-card CTA crosses the viewport bottom and the -96px gate flips.
  const inCardPageY = await page.evaluate((sel) => {
    for (const el of document.querySelectorAll(sel)) {
      let n = el;
      let fixed = false;
      while (n && n instanceof Element) {
        if (getComputedStyle(n).position === "fixed") fixed = true;
        n = n.parentElement;
      }
      if (!fixed) return el.getBoundingClientRect().y + window.scrollY;
    }
    return null;
  }, CTA_SEL);
  const bandCenter = inCardPageY != null ? Math.round(inCardPageY - vp.height) : null;

  // Build the offset list: coarse full-height sweep + a dense pass across the
  // handoff band (the overlap region where settle.mjs read lit=2).
  const offsets = new Set();
  for (let y = 0; y <= maxScroll; y += STEP) offsets.add(y);
  offsets.add(maxScroll);
  if (bandCenter != null) {
    for (let y = bandCenter - 140; y <= bandCenter + 220; y += 10) {
      if (y >= 0 && y <= maxScroll) offsets.add(y);
    }
  }
  const sweepOffsets = [...offsets].sort((a, b) => a - b);

  const samples = [];
  let worstLit = 0;
  let worstGhost = 0;
  const bandShots = [];

  for (const y of sweepOffsets) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await sleep(SETTLE_MS); // settle past the exit tween

    const { h, barTop, ctas } = await measureCtas(page);
    const inView = ctas.filter((c) => c.inView && c.opacity >= 0.5);
    // OCCLUSION-aware sampling rect: the opaque sticky bar (barTop..viewport
    // bottom) hides everything beneath it, so a non-fixed (in-card) CTA is only
    // VISIBLY lit by the pixels ABOVE barTop. Clip each in-card CTA's rect to
    // y < barTop; the fixed bar itself paints on top, so it samples whole. This
    // stops the sticky bar's own gold — which spatially overlaps the in-card
    // rect at the boundary — from being miscounted as a second lit CTA.
    const visRects = inView.map((c) => {
      if (c.fixed || barTop == null) return c.rect;
      const top = c.rect.top;
      const bottom = Math.min(c.rect.bottom, barTop);
      return { x: c.rect.x, y: top, w: c.rect.w, h: Math.max(0, bottom - top), top, bottom };
    });
    let litInView = 0;
    let stickyPresent = false;
    let ghostTint = 0;

    // Only offsets with >=2 in-view, non-transparent CTAs can possibly read a
    // double-lit — so only there do we pay for the screenshot + pixel decode.
    // Elsewhere litInView is trivially the in-view count (0 or 1).
    if (visRects.length < 2) {
      litInView = visRects.length;
    } else {
      const png = await page.screenshot();
      const stats = await sampleRects(decoder, png, visRects, vp.width, vp.height);
      inView.forEach((c, i) => {
        c.goldFrac = visRects[i].h <= 0 ? 0 : stats[i].goldFrac;
        c.meanRB = stats[i].meanRB;
        c.brightLit = c.goldFrac >= GOLD_FRAC_LIT;
        if (c.brightLit) litInView++;
        if (c.fixed && c.brightLit) stickyPresent = true;
      });

      // ── B. Ghost tint: when the sticky bar is present AND an in-card CTA rect
      // overlaps the bottom band behind it, compare the covered in-card region's
      // mean (R-B) against a pure-surface baseline slice of the same bar.
      const sticky = inView.find((c) => c.fixed);
      const inCard = inView.find((c) => !c.fixed);
      if (sticky && inCard && inCard.rect.bottom > sticky.rect.top) {
        // Baseline: a thin surface-only strip along the bar's left gutter,
        // away from the bar's own gold Pay button (which sits on the right).
        const baseRect = {
          x: sticky.rect.x + 6,
          y: sticky.rect.y + 4,
          w: 40,
          h: Math.max(6, sticky.rect.h - 8),
        };
        const covered = {
          x: inCard.rect.x,
          y: Math.max(inCard.rect.top, sticky.rect.top),
          w: inCard.rect.w,
          h: Math.max(2, inCard.rect.bottom - Math.max(inCard.rect.top, sticky.rect.top)),
        };
        const [baseS, covS] = await sampleRects(decoder, png, [baseRect, covered], vp.width, vp.height);
        ghostTint = +(covS.meanRB - baseS.meanRB).toFixed(3);
        if (bandShots.length < 4) {
          const shot = `r3-handoff-${tag}-y${y}.png`;
          await page.screenshot({ path: path.join(OUT, shot) });
          bandShots.push({ y, shot, ghostTint });
        }
      }
    }

    worstLit = Math.max(worstLit, litInView);
    worstGhost = Math.max(worstGhost, ghostTint);
    samples.push({
      y,
      litInView,
      ghostTint,
      ctas: inView.map((c) => ({
        fixed: c.fixed,
        opacity: c.opacity,
        goldFrac: c.goldFrac,
        meanRB: c.meanRB,
        brightLit: c.brightLit,
      })),
    });
  }

  await context.close();
  return {
    tag,
    auth: cfg.auth,
    viewport: vp.label,
    scrollHeight,
    maxScroll,
    barBackground: barBg?.bg ?? null,
    barAlpha,
    barOpaque: barAlpha === 1,
    offsetsSwept: sweepOffsets.length,
    worstLitInView: worstLit,
    worstGhostTint: worstGhost,
    litSweepPass: worstLit <= 1,
    consoleErrors,
    bandShots,
    samples,
  };
}

// ── D. Exit opacity timeline: prove the added opacity leg animates 1->0.
// Scroll so the in-card Pay clears the -96px gate (bar unmounts → exit runs) and
// sample the fixed bar's effective opacity every frame. A y-only exit stays at
// opacity 1 until it detaches; the opacity leg traverses many 0<op<1 frames.
async function exitTimeline(browser, cfg, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  await page.goto(`${cfg.base}/checkout/${OFFERING_ID}`, { waitUntil: "networkidle" });
  await page.waitForSelector(CTA_SEL, { timeout: 20000 });
  await sleep(600);
  const maxScroll = await page.evaluate(
    () => document.documentElement.scrollHeight - window.innerHeight,
  );
  // Kick the scroll to the bottom (in-card Pay clears the gate → bar exits) and
  // immediately sample the fixed bar's opacity per rAF until it detaches.
  const timeline = await page.evaluate(
    async ([sel, target]) => {
      const findFixed = () => {
        for (const el of document.querySelectorAll(sel)) {
          let n = el;
          while (n && n instanceof Element) {
            if (getComputedStyle(n).position === "fixed") return n;
            n = n.parentElement;
          }
        }
        return null;
      };
      window.scrollTo(0, target);
      const t0 = performance.now();
      const samples = [];
      return await new Promise((res) => {
        const tick = () => {
          const el = findFixed();
          const t = +(performance.now() - t0).toFixed(1);
          if (!el) {
            samples.push({ t, opacity: null, detached: true });
            return res(samples);
          }
          samples.push({ t, opacity: +parseFloat(getComputedStyle(el).opacity).toFixed(3) });
          if (t > 1200) return res(samples);
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    },
    [CTA_SEL, maxScroll],
  );
  await context.close();
  const opacities = timeline.filter((s) => s.opacity != null).map((s) => s.opacity);
  const intermediate = opacities.filter((o) => o > 0.02 && o < 0.98).length;
  return {
    tag: `${cfg.auth}-${vp.label}`,
    frames: timeline.length,
    minOpacity: opacities.length ? Math.min(...opacities) : null,
    intermediateFrames: intermediate, // >0 ⇒ it FADES, not cuts
    fades: intermediate >= 2,
    timeline,
  };
}

async function main() {
  const browser = await chromium.launch();
  const decoder = await (await browser.newContext()).newPage();
  await decoder.goto("about:blank");

  const results = { generatedAt: new Date().toISOString(), configs: [], exits: [] };
  for (const cfg of CONFIGS) {
    for (const vp of VIEWPORTS) {
      // eslint-disable-next-line no-console
      console.log(`sweeping ${cfg.auth}-${vp.label} …`);
      results.configs.push(await runConfig(browser, decoder, cfg, vp));
    }
    // one exit timeline per auth mode at 375 is enough to prove the opacity leg
    results.exits.push(await exitTimeline(browser, cfg, VIEWPORTS[0]));
  }
  await browser.close();

  results.summary = {
    litSweepPassAll: results.configs.every((c) => c.litSweepPass),
    worstLitInViewAny: Math.max(...results.configs.map((c) => c.worstLitInView)),
    allBarsOpaque: results.configs.every((c) => c.barOpaque),
    worstGhostTintAny: Math.max(...results.configs.map((c) => c.worstGhostTint)),
    allExitsFade: results.exits.every((e) => e.fades),
    consoleErrorsAny: results.configs.reduce((a, c) => a + c.consoleErrors.length, 0),
  };

  const outPath = path.join(OUT, "settle-checkout-handoff.json");
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  // eslint-disable-next-line no-console
  console.log("\n=== SUMMARY ===");
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(results.summary, null, 2));
  // eslint-disable-next-line no-console
  console.log("wrote", outPath);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
