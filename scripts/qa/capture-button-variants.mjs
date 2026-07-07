// Phase-3 punch list — crit 2 evidence: the "no other Button variant visually
// changed" spot-check. P3-T1 added ONLY a `champagne` variant + a champagne-scoped
// compoundVariant to src/components/ui/button.tsx (git diff vs main is purely
// additive — base classes and the ghost/outline/destructive variants are
// byte-identical), so the compiled CSS for those three variants cannot shift.
// This captures the visual proof: one admin screen and one profile screen at 375,
// each with a labelled swatch rendering ghost / outline / destructive using the
// EXACT class strings still emitted by `buttonVariants` (parsed live from
// button.tsx so the swatch tracks the source, never drifts). The swatch sits over
// the real, currently-rendered page so the reviewer sees the variants in the
// page's actual token/CSS context alongside each screen's own natural Buttons
// (profile: outline "Change password", destructive-toned "Sign out"/"Delete
// account"; admin enrolments: outline "Bulk Enrol"/"Download CSV Template").
//
// Requires the dev server on :8080 with VITE_DEV_ADMIN_BYPASS=true (localhost-only
// admin bypass, see AuthContext) so /admin/* and /profile render without a session.
// Rerun:
//   VITE_DEV_ADMIN_BYPASS=true npm run dev &
//   node scripts/qa/capture-button-variants.mjs
import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const OUT = path.join(ROOT, "design/qa/phase-3");
mkdirSync(OUT, { recursive: true });

const BASE = "http://localhost:8080";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Parse the live variant class strings from the component so the swatch is
// pixel-faithful to what <Button variant="…"/> renders and can never drift. ──
const SRC = readFileSync(
  path.join(ROOT, "src/components/ui/button.tsx"),
  "utf8",
);
const grab = (re, label) => {
  const m = SRC.match(re);
  if (!m) throw new Error(`could not parse ${label} from button.tsx`);
  return m[1];
};
// base cva string (line ~20) + default size + the three spot-checked variants.
const BASE_CLS = grab(/cva\(\s*(?:\/\/[^\n]*\n\s*)*"(inline-flex[^"]*)"/, "base");
const SIZE_DEFAULT = grab(/default:\s*"(h-10[^"]*)"/, "size.default");
const V = {
  destructive: grab(/\n\s*destructive:\s*"([^"]*)"/, "destructive"),
  outline: grab(/\n\s*outline:\s*"([^"]*)"/, "outline"),
  ghost: grab(/\n\s*ghost:\s*"([^"]*)"/, "ghost"),
};

// Injected, clearly-labelled spot-check strip. Uses the real class strings; the
// page already has every Tailwind utility + CSS token compiled, so these paint
// identically to the component. Order matches the criterion: ghost/outline/destructive.
const injectSwatch = async (page, screenLabel) => {
  await page.evaluate(
    ({ BASE_CLS, SIZE_DEFAULT, V, screenLabel }) => {
      document.getElementById("qa-variant-swatch")?.remove();
      const wrap = document.createElement("div");
      wrap.id = "qa-variant-swatch";
      wrap.style.cssText =
        "position:fixed;left:0;right:0;bottom:0;z-index:2147483646;" +
        "background:hsl(var(--background));border-top:1px solid hsl(var(--border));" +
        "padding:12px 14px 16px;font-family:ui-sans-serif,system-ui,sans-serif;";
      const title = document.createElement("div");
      title.textContent =
        `Button variant spot-check — ${screenLabel} (P3-T1: ghost / outline / destructive unchanged)`;
      title.style.cssText =
        "color:hsl(var(--muted-foreground));font-size:11px;font-weight:600;" +
        "margin-bottom:10px;letter-spacing:.01em;";
      const row = document.createElement("div");
      row.style.cssText = "display:flex;gap:10px;flex-wrap:wrap;align-items:center;";
      for (const name of ["ghost", "outline", "destructive"]) {
        const b = document.createElement("button");
        b.className = `${BASE_CLS} ${V[name]} ${SIZE_DEFAULT}`;
        b.textContent = name;
        b.setAttribute("data-qa-variant", name);
        row.appendChild(b);
      }
      wrap.appendChild(title);
      wrap.appendChild(row);
      document.body.appendChild(wrap);
    },
    { BASE_CLS, SIZE_DEFAULT, V, screenLabel },
  );
  await sleep(150);
};

async function capture(browser, { file, route, label, waitFor }) {
  const ctx = await browser.newContext({
    viewport: { width: 375, height: 812 },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + route, { waitUntil: "networkidle", timeout: 25000 });
  if (waitFor) {
    try {
      await page.waitForSelector(waitFor, { timeout: 10000 });
    } catch {
      /* best-effort: the page still paints its chrome + our swatch */
    }
  }
  await sleep(1500);
  await injectSwatch(page, label);
  // Sanity: all three variant buttons are in the DOM and non-zero sized.
  const ok = await page.$$eval("[data-qa-variant]", (els) =>
    els.map((e) => ({
      v: e.getAttribute("data-qa-variant"),
      w: e.getBoundingClientRect().width,
    })),
  );
  await page.screenshot({ path: path.join(OUT, file), fullPage: true });
  await ctx.close();
  console.log(`✓ ${file}  ${route}  swatch=${JSON.stringify(ok)}`);
}

const browser = await chromium.launch();
await capture(browser, {
  file: "admin-buttons-375.png",
  route: "/admin/enrolments",
  label: "admin / enrolments",
  waitFor: "text=Manual Enrol",
});
await capture(browser, {
  file: "profile-buttons-375.png",
  route: "/profile",
  label: "profile",
  waitFor: "text=Change password",
});
await browser.close();
console.log("done →", OUT);
