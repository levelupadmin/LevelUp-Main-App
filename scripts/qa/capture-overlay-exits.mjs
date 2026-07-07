// Phase-2 overlay-exit / completion-arc / reduced-motion / post-completion-scroll
// LIVE verification capture. Drives the running dev server (localhost:8080) with
// Playwright and writes frames + a machine-readable results.json into
// design/qa/phase-2/live/. Rerun with: node scripts/qa/capture-overlay-exits.mjs
//
// Checks (from the phase-2 punch list):
//  (a) admin dialog exit ACTUALLY plays  → /admin/coupons "New Coupon" dialog,
//      real src/components/ui/dialog.tsx, open→close, opacity sampled over time.
//  (b) completion arc exercised live     → qa-harness mounts the REAL
//      ProgressRing + CompletionTakeover + CompletionRecap and replays
//      ChapterViewer's ArcPhase machine (no prod chapter_progress write needed).
//      ring-sweep → takeover enter/exit → recap enter/exit.
//  (c) reduced-motion collapses to instant → same arc under emulated
//      prefers-reduced-motion; exit latency compared against normal motion.
//  (d) post-completion body scroll works   → after every overlay is dismissed,
//      document.body.style.overflow is empty AND the page actually scrolls.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-2/live");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:8080";
const HARNESS = `${BASE}/qa-harness/completion-arc.html`;
const VP = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = { generatedAt: new Date().toISOString(), checks: {} };

async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  return `${name}.png`;
}

// Sample an element's computed opacity every animation frame for up to `capMs`,
// or until it detaches. Returns the timeline — the rigorous proof that an exit
// animates over time (many 0<opacity<1 frames) vs. cuts instantly (detaches
// within a frame or two with no intermediate values).
function sampleExit(page, selector, capMs = 1400) {
  return page.evaluate(
    ([sel, cap]) =>
      new Promise((res) => {
        const t0 = performance.now();
        const samples = [];
        const tick = () => {
          const el = document.querySelector(sel);
          const t = +(performance.now() - t0).toFixed(1);
          if (!el) {
            samples.push({ t, present: false, opacity: null });
            return res({ samples });
          }
          samples.push({
            t,
            present: true,
            opacity: +parseFloat(getComputedStyle(el).opacity).toFixed(3),
          });
          if (performance.now() - t0 > cap) return res({ samples });
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    [selector, capMs]
  );
}

// Poll (fast) until the element's opacity is mid-transition, so a screenshot
// lands on a visibly-partial exit frame. Caps out gracefully (instant exits).
async function waitMidOpacity(page, selector, capMs = 1200) {
  return page.waitForFunction(
    ([sel, cap]) => {
      const el = document.querySelector(sel);
      if (!el) return true; // already gone (instant)
      const o = parseFloat(getComputedStyle(el).opacity);
      if (o > 0.08 && o < 0.92) return true;
      // stash a start time to honour the cap
      window.__midT0 = window.__midT0 || performance.now();
      return performance.now() - window.__midT0 > cap;
    },
    [selector, capMs],
    { polling: "raf", timeout: capMs + 500 }
  ).catch(() => {}).finally(() => page.evaluate(() => { delete window.__midT0; }));
}

function summarizeExit(sampling) {
  const s = sampling.samples;
  const mid = s.filter((x) => x.present && x.opacity != null && x.opacity > 0.02 && x.opacity < 0.98);
  const last = s[s.length - 1];
  const detachAt = s.find((x) => x.present === false);
  return {
    frames: s.length,
    intermediateFrames: mid.length, // >0 ⇒ a real animation played
    detachedAtMs: detachAt ? detachAt.t : null,
    finalPresent: last ? last.present : null,
    opacityTrail: mid.slice(0, 12).map((x) => x.opacity),
  };
}

async function run() {
  const browser = await chromium.launch();

  // ─────────────────────────────────────────────────────────────────────────
  // (a) ADMIN DIALOG EXIT — real /admin route + shared ui/dialog.tsx
  // ─────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({
      viewport: { width: 1100, height: 820 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/admin/coupons`, { waitUntil: "networkidle" });
    const newBtn = page.getByRole("button", { name: /New Coupon/i });
    await newBtn.waitFor({ timeout: 20000 });
    const before = await shot(page, "a1-admin-dialog-before");

    await newBtn.click();
    await page.locator('[role="dialog"]').waitFor({ state: "visible" });
    await sleep(320); // let the enter (fade+zoom-in, duration-base) settle
    const open = await shot(page, "a2-admin-dialog-open");

    // Drive the close (Escape) and sample the overlay's exit over time.
    const sampling = await (async () => {
      const p = sampleExit(page, '[role="dialog"]', 1200);
      await page.keyboard.press("Escape");
      return p;
    })();
    // Re-open to grab a clean mid-exit still (the sample pass already closed it).
    await newBtn.click();
    await page.locator('[role="dialog"]').waitFor({ state: "visible" });
    await sleep(300);
    const midProm = waitMidOpacity(page, '[role="dialog"]', 900);
    await page.keyboard.press("Escape");
    await midProm;
    const during = await shot(page, "a3-admin-dialog-exit-during");
    await page.locator('[role="dialog"]').waitFor({ state: "detached", timeout: 4000 });
    await sleep(120);
    const after = await shot(page, "a4-admin-dialog-after");

    const summary = summarizeExit(sampling);
    results.checks.adminDialogExit = {
      route: "/admin/coupons",
      component: "src/components/ui/dialog.tsx",
      frames: { before, open, during, after },
      exit: summary,
      pass: summary.intermediateFrames > 0 && summary.finalPresent === false,
    };
    await ctx.close();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // (b) COMPLETION ARC — normal motion — + (d) post-completion scroll
  // ─────────────────────────────────────────────────────────────────────────
  const normalArc = await driveArc(browser, { reduced: false, tag: "b" });
  results.checks.completionArcNormal = normalArc;

  // ─────────────────────────────────────────────────────────────────────────
  // (c) COMPLETION ARC — reduced motion — collapses to instant
  // ─────────────────────────────────────────────────────────────────────────
  const reducedArc = await driveArc(browser, { reduced: true, tag: "c" });
  results.checks.completionArcReduced = reducedArc;

  results.checks.reducedMotionCollapsesToInstant = {
    takeoverExitToRecap_ms: {
      normal: normalArc.timings.takeoverExitToRecapMs,
      reduced: reducedArc.timings.takeoverExitToRecapMs,
    },
    startToTakeover_ms: {
      normal: normalArc.timings.startToTakeoverMs,
      reduced: reducedArc.timings.startToTakeoverMs,
    },
    // Reduced motion collapses to instant. Judge on ANIMATION evidence (frames
    // sampled from the page), not wall-clock latency — the latter folds in
    // Playwright/CDP round-trip + raf-poll overhead (~150-200ms of pure harness
    // cost) that has nothing to do with the animation. Rigorous signal:
    //   • reduced exits produce ZERO intermediate-opacity frames and detach
    //     within a couple of frames (near-instant cut);
    //   • normal exits produce many intermediate frames (a real tween played);
    //   • the ring→takeover beat is at least halved (the 900ms beat → 0).
    exitFrames: {
      normal: {
        takeover: normalArc.takeoverExit.intermediateFrames,
        recap: normalArc.recapExit.intermediateFrames,
      },
      reduced: {
        takeover: reducedArc.takeoverExit.intermediateFrames,
        recap: reducedArc.recapExit.intermediateFrames,
      },
    },
    detachedAtMs: {
      reduced: {
        takeover: reducedArc.takeoverExit.detachedAtMs,
        recap: reducedArc.recapExit.detachedAtMs,
      },
    },
    pass:
      reducedArc.takeoverExit.intermediateFrames === 0 &&
      reducedArc.recapExit.intermediateFrames === 0 &&
      reducedArc.takeoverExit.detachedAtMs != null &&
      reducedArc.takeoverExit.detachedAtMs < 100 &&
      reducedArc.recapExit.detachedAtMs != null &&
      reducedArc.recapExit.detachedAtMs < 100 &&
      normalArc.takeoverExit.intermediateFrames > 3 &&
      normalArc.recapExit.intermediateFrames > 3 &&
      reducedArc.timings.startToTakeoverMs <
        normalArc.timings.startToTakeoverMs / 2,
  };

  await browser.close();

  writeFileSync(path.join(OUT, "results.json"), JSON.stringify(results, null, 2));
  // Console summary
  const line = (k, v) => console.log(`  ${k}: ${v}`);
  console.log("\n=== Phase-2 overlay-exit LIVE capture ===");
  line("(a) admin dialog exit plays", results.checks.adminDialogExit.pass);
  line("(b) arc normal — overlays exit", normalArc.pass);
  line("(b) body-lock released for recap", normalArc.bodyLock.releasedForRecap);
  line("(d) post-completion scroll works", normalArc.postScroll.pass);
  line("(c) reduced collapses to instant", results.checks.reducedMotionCollapsesToInstant.pass);
  console.log(`\nArtifacts → ${OUT}`);
}

// Replays ChapterViewer's arc via the harness and captures every beat.
async function driveArc(browser, { reduced, tag }) {
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 2,
    reducedMotion: reduced ? "reduce" : "no-preference",
  });
  const page = await ctx.newPage();
  await page.goto(HARNESS, { waitUntil: "networkidle" });
  await page.waitForFunction(() => window.__arcReady === true, null, { timeout: 15000 });

  const phase = () => page.evaluate(() => window.__arc.phase());
  const bodyOverflow = () => page.evaluate(() => document.body.style.overflow);
  const out = { reduced, frames: {}, timings: {}, bodyLock: {} };

  out.frames.ringBefore = await shot(page, `${tag}1-ring-before`);
  out.bodyLock.beforeArc = await bodyOverflow();

  // Beat 1: ring sweeps in place. Kick the arc and time the entry into takeover.
  const tStart = Date.now();
  await page.getByTestId("start-arc").click();
  await sleep(reduced ? 20 : 260); // mid-sweep for normal motion
  out.frames.ringSweep = await shot(page, `${tag}2-ring-sweep`);
  await page.waitForFunction(() => window.__arc.phase() === "takeover", null, { timeout: 4000 });
  out.timings.startToTakeoverMs = Date.now() - tStart;
  await sleep(reduced ? 40 : 420); // let the takeover enter settle
  out.frames.takeoverEnter = await shot(page, `${tag}3-takeover-enter`);
  out.bodyLock.duringTakeover = await bodyOverflow(); // expect "hidden"

  // Takeover exit — single pass: begin opacity sampling, trigger the dismiss
  // (onContinue → recapWait → exit plays → onExited → recap), grab a mid-exit
  // still, and time the exit→recap latency. No re-run (a re-entry would race the
  // recap's onExited→idle), so sampling + still both come from this one exit.
  const takeoverSel = '[aria-label^="Course complete"]';
  const takeoverSampP = sampleExit(page, takeoverSel, 1400);
  await sleep(0);
  const tExit = Date.now();
  await page.evaluate(() => window.__arc.setPhase("recapWait"));
  const takeoverMidP = waitMidOpacity(page, takeoverSel, 1000);
  await takeoverMidP;
  out.frames.takeoverExitDuring = await shot(page, `${tag}4-takeover-exit-during`);
  out.takeoverExit = summarizeExit(await takeoverSampP);
  await page.waitForFunction(() => window.__arc.phase() === "recap", null, { timeout: 5000 });
  out.timings.takeoverExitToRecapMs = Date.now() - tExit;
  await sleep(reduced ? 40 : 420);
  out.frames.recapEnter = await shot(page, `${tag}5-recap-enter`);
  // KEY INVARIANT: takeover released the body-lock before the recap mounted, and
  // the recap must NOT re-lock. Expect "" here.
  out.bodyLock.duringRecap = await bodyOverflow();
  out.bodyLock.releasedForRecap = out.bodyLock.duringRecap === "";

  // Recap exit — single pass: onClose → recapOut → glide-out → onExited → idle.
  const recapSel = '[aria-label^="Course recap"]';
  const recapSampP = sampleExit(page, recapSel, 1400);
  await sleep(0);
  await page.evaluate(() => window.__arc.setPhase("recapOut"));
  const recapMidP = waitMidOpacity(page, recapSel, 1000);
  await recapMidP;
  out.frames.recapExitDuring = await shot(page, `${tag}6-recap-exit-during`);
  out.recapExit = summarizeExit(await recapSampP);
  await page.waitForFunction(() => window.__arc.phase() === "idle", null, { timeout: 5000 });
  await sleep(120);
  out.frames.afterIdle = await shot(page, `${tag}7-after-idle`);
  out.bodyLock.afterArc = await bodyOverflow();

  // (d) Post-completion body scroll: overflow empty AND the page actually moves.
  const postScroll = await page.evaluate(async () => {
    const overflow = document.body.style.overflow;
    window.scrollTo(0, 700);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { overflow, scrollY: window.scrollY };
  });
  out.frames.afterScroll = await shot(page, `${tag}8-after-scroll`);
  out.postScroll = {
    bodyOverflow: postScroll.overflow,
    scrollY: postScroll.scrollY,
    pass: postScroll.overflow === "" && postScroll.scrollY > 300,
  };

  out.pass =
    out.takeoverExit != null &&
    out.recapExit != null &&
    out.bodyLock.afterArc === "" &&
    out.bodyLock.releasedForRecap === true &&
    (reduced ? true : out.takeoverExit.intermediateFrames > 0 && out.recapExit.intermediateFrames > 0);

  await ctx.close();
  return out;
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
