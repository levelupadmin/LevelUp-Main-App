// Phase-4 P4-T6 certificate QA capture.
// (A) Drives the REAL generateShareCard() in a headless Chromium against the
//     running Vite dev server (localhost:8080), exporting the exact 1080×1350
//     PNG the OS/Web share sheet receives — no re-implementation, the production
//     function itself renders the artifact.
// (B) Captures the STEAL-3 blacklight hold-to-reveal layer (hidden → revealed)
//     using the real index.css classes, CSS tokens and brand fonts loaded on the
//     dev origin, over a certificate backdrop.
//
// Rerun: node scripts/qa/capture-certificate-share.mjs
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-4");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:8080";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function writeDataUrlPng(dataUrl, file) {
  const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
  writeFileSync(path.join(OUT, file), Buffer.from(b64, "base64"));
  return file;
}

async function run() {
  const browser = await chromium.launch();
  const results = { generatedAt: new Date().toISOString(), artifacts: {} };

  // ───────────────────────────────────────────────────────────────────────────
  // (A) SHARE CARD — drive the real generateShareCard()
  // ───────────────────────────────────────────────────────────────────────────
  {
    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1350 } });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error") console.log("  [page error]", m.text()); });
    // Load the real app origin so index.css @import fonts are registered.
    await page.goto(BASE, { waitUntil: "networkidle" });
    // Make sure the three brand faces are actually available before we draw.
    await page.evaluate(() => document.fonts.ready);

    const cases = [
      { tag: "long", courseName: "Cinematic Lighting & Color for Narrative Filmmaking", studentName: "Aishwarya Balachandran" },
      { tag: "short", courseName: "Directing Actors", studentName: "Rahul Srinivas" },
      { tag: "noname", courseName: "The Art of the Edit", studentName: "" },
    ];

    results.artifacts.shareCards = [];
    for (const c of cases) {
      const dataUrl = await page.evaluate(async ({ courseName, studentName }) => {
        const mod = await import("/src/lib/certificate-generator.ts");
        const blob = await mod.generateShareCard({ courseName, studentName });
        const bmp = await createImageBitmap(blob);
        const dims = { w: bmp.width, h: bmp.height };
        const fr = new FileReader();
        const url = await new Promise((res) => { fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
        return { url, dims };
      }, c);
      const file = writeDataUrlPng(dataUrl.url, `share-card-${c.tag}.png`);
      results.artifacts.shareCards.push({ ...c, file, dims: dataUrl.dims });
      console.log(`  share-card ${c.tag}: ${dataUrl.dims.w}×${dataUrl.dims.h} → ${file}`);
    }
    await ctx.close();
  }

  // ───────────────────────────────────────────────────────────────────────────
  // (B) BLACKLIGHT REVEAL — faithful capture of the reveal layer (CertificateCard)
  //     Injected markup mirrors CertificateCard.tsx's reveal layer 1:1, using the
  //     real index.css classes + --champagne-from token + brand fonts on the dev
  //     origin. Captures the hidden and revealed end-states.
  // ───────────────────────────────────────────────────────────────────────────
  for (const reduced of [false]) {
    const ctx = await browser.newContext({
      viewport: { width: 440, height: 560 },
      deviceScaleFactor: 2,
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);

    await page.evaluate(() => {
      const glow =
        "0 0 22px hsl(var(--champagne-from) / 0.55), 0 0 8px hsl(var(--champagne-from) / 0.45)";
      const host = document.createElement("div");
      host.id = "bl-harness";
      host.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;display:flex;align-items:center;justify-content:center;padding:24px;";
      host.innerHTML = `
        <div id="bl-card" style="width:392px;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div id="bl-frame" class="relative w-full overflow-hidden select-none" style="position:relative;aspect-ratio:2480 / 1754;border:1px solid rgba(255,255,255,0.1);border-radius:8px;">
            <div style="position:absolute;inset:0;background:linear-gradient(135deg,#141414,#1e1a12);"></div>
            <div id="bl-uv" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;background:#000;padding:16px;text-align:center;opacity:0;transform:rotate(1.5deg) scale(1.04);transition:opacity .45s ease;">
              <span style="font-family:'Instrument Serif',serif;font-style:italic;font-size:24px;color:hsl(var(--champagne-from));text-shadow:${glow};">✦</span>
              <p style="font-family:'JetBrains Mono',monospace;font-size:10px;text-transform:uppercase;letter-spacing:0.28em;color:hsl(var(--champagne-from));text-shadow:${glow};margin:0;">Member 004821</p>
              <p style="font-family:'Instrument Serif',serif;font-style:italic;font-size:16px;line-height:1.15;color:hsl(var(--champagne-from));text-shadow:${glow};margin:0;">Cinematic Lighting &amp; Color</p>
              <p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.05em;color:hsl(var(--champagne-from));text-shadow:${glow};margin:0;">LU-CERT-2026-0182</p>
              <p style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:0.05em;color:hsl(var(--champagne-from));text-shadow:${glow};margin:0;">July 7, 2026</p>
            </div>
          </div>
        </div>`;
      document.body.appendChild(host);
    });
    await sleep(200);
    results.artifacts.blacklightHidden = "blacklight-hidden.png";
    await page.locator("#bl-card").screenshot({ path: path.join(OUT, "blacklight-hidden.png") });

    // Reveal — flip opacity to 1, rotate to 0 (settle), and capture mid + end.
    await page.evaluate(() => {
      const uv = document.getElementById("bl-uv");
      uv.style.opacity = "1";
      uv.style.transform = "rotate(0deg) scale(1.04)";
    });
    await sleep(230);
    results.artifacts.blacklightRevealing = "blacklight-revealing.png";
    await page.locator("#bl-card").screenshot({ path: path.join(OUT, "blacklight-revealing.png") });
    await sleep(400);
    results.artifacts.blacklightRevealed = "blacklight-revealed.png";
    await page.locator("#bl-card").screenshot({ path: path.join(OUT, "blacklight-revealed.png") });
    await ctx.close();
  }

  await browser.close();
  writeFileSync(path.join(OUT, "certificate-share-results.json"), JSON.stringify(results, null, 2));
  console.log(`\nArtifacts → ${OUT}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
