// P6-T6 font proofs — the committed evidence the font-refit (self-host + kill the
// render-blocking Google Fonts @import, commit f0893b5) was missing. Two proofs,
// captured AFTER the refit landed, against the PROD BUILD served from dist/:
//
//   (a) NETWORK WATERFALL — every request the two anon-reachable, all-three-faces
//       routes fire, proving ZERO requests to fonts.googleapis.com / fonts.gstatic.com
//       (the @import's old cross-origin handshake is gone), that the two <link
//       rel=preload> faces (Inter-400 body + Instrument Serif italic accents) are
//       actually CONSUMED (200 + rendered), and that Chromium emits NO
//       "was preloaded … but not used" console warning (fires ~3s post-load if a
//       preload is dead weight — so we wait it out before asserting).
//
//   (b) GLYPH PARITY — on 2+ routes, capture that all three self-hosted faces
//       actually render (not a silent system fallback): serif italic (Instrument
//       Serif), mono (JetBrains Mono), sans (Inter). Proven three ways per face:
//       document.fonts.check() for the exact style/weight, the loaded-face table
//       from document.fonts, and a cropped screenshot of a real element that
//       computes to that family — plus a full-page shot per route.
//
// Does NOT build (orchestrator owns integration) — serves whatever is in dist/ via
// the prod-representative server (br/gzip + SPA fallback, mirrors Vercel). Spawns it
// itself unless PREVIEW_BASE is set.
//
//   node scripts/qa/capture-font-proofs.mjs
//
import { chromium } from "playwright";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-6/fonts");
mkdirSync(OUT, { recursive: true });

const PORT = Number(process.env.FONT_PROOF_PORT) || 4189;
const BASE = process.env.PREVIEW_BASE || `http://localhost:${PORT}`;
const OWN_SERVER = !process.env.PREVIEW_BASE;

const VIEWPORT = { width: 390, height: 844 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The two preloaded first-paint faces (index.html) — must be requested + 200.
const PRELOADED = ["/fonts/Inter-400.woff2", "/fonts/InstrumentSerif-Italic.woff2"];

// Anon-reachable routes that render all three faces (verified in source):
//   /login  — "best work" serif italic, "Sign in"/"Step" mono eyebrows, Inter body.
//   /p/:slug — public offering: serif-italic accents, mono eyebrows, Inter body.
const ROUTES = [
  { id: "login", url: "/login", waitFor: "body" },
  {
    id: "public-offering",
    url: "/p/lokesh-kanagaraj-teaches-film-making",
    waitFor: "main, [data-offering], h1",
  },
];

// The three faces to prove, with an exact document.fonts.check() spec each.
const FACES = [
  { key: "sans", label: "Inter (sans)", family: "Inter", check: "400 16px 'Inter'" },
  {
    key: "serif-italic",
    label: "Instrument Serif (serif italic)",
    family: "Instrument Serif",
    check: "italic 400 24px 'Instrument Serif'",
  },
  // Mono eyebrows (.font-mono, no weight class) render at 400 — the 500 face is
  // correctly lazy: it only downloads when a weight-500 mono node appears, which
  // these routes have none of, so we prove the weight the page ACTUALLY renders.
  { key: "mono", label: "JetBrains Mono (mono)", family: "JetBrains Mono", check: "400 11px 'JetBrains Mono'" },
];

// In-page: enumerate loaded faces + prove each target face renders on a real node.
// Runs in the browser so getComputedStyle / document.fonts are the live values.
const PROBE = (faces) => {
  const loadedFaces = [...document.fonts].map((f) => ({
    family: f.family.replace(/['"]/g, ""),
    style: f.style,
    weight: f.weight,
    status: f.status,
  }));

  const norm = (s) => (s || "").replace(/['"]/g, "").trim().toLowerCase();
  const results = {};
  for (const face of faces) {
    // document.fonts.check — true only if a matching loaded face can render this
    // style/weight (a swapped-in self-hosted face qualifies; a system fallback does not).
    const checkPasses = document.fonts.check(face.check);

    // Find the first visible element whose computed font-family STARTS with this
    // family (i.e. the browser resolved to it, not a fallback further down the stack).
    let sample = null;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node = walker.currentNode;
    while (node) {
      const txt = (node.textContent || "").trim();
      if (txt) {
        const cs = getComputedStyle(node);
        const firstFamily = norm(cs.fontFamily.split(",")[0]);
        const hasOwnText = [...node.childNodes].some(
          (c) => c.nodeType === 3 && c.textContent.trim(),
        );
        if (hasOwnText && firstFamily === norm(face.family)) {
          const r = node.getBoundingClientRect();
          if (r.width > 4 && r.height > 4 && r.top >= 0 && r.top < window.innerHeight) {
            sample = {
              text: txt.slice(0, 60),
              computedFontFamily: cs.fontFamily,
              fontStyle: cs.fontStyle,
              fontWeight: cs.fontWeight,
              rect: { x: r.x, y: r.y, width: r.width, height: r.height },
            };
            break;
          }
        }
      }
      node = walker.nextNode();
    }
    results[face.key] = { label: face.label, family: face.family, check: face.check, checkPasses, sample };
  }
  return { loadedFaces, results };
};

async function captureRoute(browser, route) {
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  const requests = []; // { url, host, type, status, fromCache, durationMs }
  const consoleMsgs = []; // { type, text }
  page.on("console", (m) => consoleMsgs.push({ type: m.type(), text: m.text() }));
  page.on("response", async (res) => {
    const req = res.request();
    let durationMs = null;
    try {
      const t = req.timing();
      if (t && t.responseEnd >= 0 && t.startTime >= 0) durationMs = Math.round(t.responseEnd - t.startTime);
    } catch {}
    let host = "";
    try {
      host = new URL(res.url()).host;
    } catch {}
    requests.push({
      url: res.url(),
      host,
      type: req.resourceType(),
      status: res.status(),
      fromCache: res.fromServiceWorker?.() || false,
      durationMs,
    });
  });

  let loadError = null;
  try {
    await page.goto(BASE + route.url, { waitUntil: "networkidle", timeout: 45000 });
    await page.waitForSelector(route.waitFor, { timeout: 15000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    // Chromium's "preloaded but not used" warning fires a few seconds after the
    // load event — wait it out so a real dead-preload would have logged by now.
    await sleep(4500);
  } catch (e) {
    loadError = String(e).slice(0, 300);
  }

  const probe = await page.evaluate(PROBE, FACES).catch((e) => ({ error: String(e) }));

  // Full-page glyph-parity shot.
  const fullShot = `${route.id}-full.png`;
  await page.screenshot({ path: path.join(OUT, fullShot), fullPage: true }).catch(() => {});

  // Cropped specimen per face (the real element that computes to it).
  const specimens = {};
  if (probe.results) {
    for (const face of FACES) {
      const s = probe.results[face.key]?.sample;
      if (!s) continue;
      const pad = 8;
      const clip = {
        x: Math.max(0, s.rect.x - pad),
        y: Math.max(0, s.rect.y - pad),
        width: Math.min(VIEWPORT.width, s.rect.width + pad * 2),
        height: s.rect.height + pad * 2,
      };
      const file = `${route.id}-specimen-${face.key}.png`;
      const ok = await page
        .screenshot({ path: path.join(OUT, file), clip })
        .then(() => true)
        .catch(() => false);
      if (ok) specimens[face.key] = file;
    }
  }

  await ctx.close();

  // --- Assertions -----------------------------------------------------------
  const GOOGLE_HOSTS = /(^|\.)fonts\.googleapis\.com$|(^|\.)fonts\.gstatic\.com$|(^|\.)googleapis\.com$/i;
  const googleFontReqs = requests.filter((r) => GOOGLE_HOSTS.test(r.host) || /fonts\.google/i.test(r.url));

  const fontReqs = requests.filter((r) => r.type === "font" || /\.woff2(\?|$)/i.test(r.url));
  const preloadUsed = PRELOADED.map((p) => {
    const hit = fontReqs.find((r) => r.url.includes(p));
    return { file: p, requested: !!hit, status: hit?.status ?? null };
  });

  const preloadUnusedWarnings = consoleMsgs.filter(
    (m) => /was preloaded using link preload but not used/i.test(m.text),
  );

  const facesRendered = FACES.map((f) => ({
    key: f.key,
    label: f.label,
    check: f.check,
    checkPasses: probe.results?.[f.key]?.checkPasses ?? false,
    resolvedOnElement: !!probe.results?.[f.key]?.sample,
    sample: probe.results?.[f.key]?.sample ?? null,
    specimen: specimens[f.key] ?? null,
  }));

  const pass =
    !loadError &&
    googleFontReqs.length === 0 &&
    preloadUsed.every((p) => p.requested && p.status === 200) &&
    preloadUnusedWarnings.length === 0 &&
    facesRendered.every((f) => f.checkPasses && f.resolvedOnElement);

  return {
    ...route,
    loadError,
    pass,
    counts: { total: requests.length, fonts: fontReqs.length },
    googleFontReqs,
    fontRequests: fontReqs.map((r) => ({ url: r.url.replace(BASE, ""), status: r.status, durationMs: r.durationMs })),
    preloadUsed,
    preloadUnusedWarnings: preloadUnusedWarnings.map((m) => m.text),
    loadedFaces: probe.loadedFaces ?? [],
    facesRendered,
    fullShot,
    specimens,
  };
}

async function waitForServer(url, tries = 40) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 200) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

async function run() {
  let server = null;
  if (OWN_SERVER) {
    server = spawn("node", [path.join(__dirname, "serve-dist-prod.mjs"), String(PORT)], {
      cwd: ROOT,
      stdio: "ignore",
    });
    const up = await waitForServer(`${BASE}/index.html`);
    if (!up) {
      server.kill();
      throw new Error(`prod dist server did not come up on ${BASE}`);
    }
  }

  const browser = await chromium.launch();
  const routes = [];
  for (const route of ROUTES) {
    process.stdout.write(`font-proofs @ ${route.id} … `);
    const r = await captureRoute(browser, route);
    console.log(
      `google-font-reqs=${r.googleFontReqs.length}  preload-unused-warnings=${r.preloadUnusedWarnings.length}  ` +
        `faces=${r.facesRendered.filter((f) => f.checkPasses).length}/3  -> ${r.pass ? "PASS" : "FAIL"}` +
        (r.loadError ? "  [LOAD ERROR]" : ""),
    );
    routes.push(r);
  }
  await browser.close();
  if (server) server.kill();

  const out = {
    task: "P6-T6 — self-hosted fonts: proofs",
    measuredAt: new Date().toISOString(),
    base: BASE,
    servedFrom: "dist/ (prod build) via scripts/qa/serve-dist-prod.mjs (br/gzip + SPA fallback)",
    viewport: `${VIEWPORT.width}x${VIEWPORT.height} @2x`,
    preloadedFaces: PRELOADED,
    facesProven: FACES.map((f) => ({ key: f.key, label: f.label, check: f.check })),
    pass: routes.every((r) => r.pass),
    routes,
  };
  writeFileSync(path.join(OUT, "font-proofs.json"), JSON.stringify(out, null, 2));

  console.log(`\nSUITE pass=${out.pass}`);
  console.log(`Artifacts -> ${OUT}`);
  process.exit(out.pass ? 0 : 1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
