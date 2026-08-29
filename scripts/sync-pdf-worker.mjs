#!/usr/bin/env node
/**
 * Copy pdf.js's worker into public/ so it is served VERBATIM.
 *
 * Why not import it: `import w from "pdfjs-dist/.../pdf.worker.min.js?url"`
 * makes Vite serve a ~300-byte ES module WRAPPER instead of the 1.1MB worker
 * script. The Worker then fails to start and pdf.js silently falls back to its
 * "fake worker", rasterising on the main thread and freezing the tab. Serving
 * the real file from public/ sidesteps every bundler transform, and works the
 * same in dev, in the Vercel build, and inside the Capacitor shells (which
 * serve the bundle from a local origin, so "/pdf.worker.min.js" resolves).
 *
 * Copied rather than committed so it can never drift from the installed
 * pdfjs-dist version — a mismatch between the API and the worker is a hard
 * error at render time. Runs from predev and from build.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = resolve(root, "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.js");
const dest = resolve(root, "public/pdf.worker.min.js");

if (!existsSync(src)) {
  console.error(`[sync-pdf-worker] MISSING ${src} — is pdfjs-dist installed?`);
  process.exit(1);
}
mkdirSync(dirname(dest), { recursive: true });
copyFileSync(src, dest);
console.log(`[sync-pdf-worker] public/pdf.worker.min.js ← ${(statSync(dest).size / 1024).toFixed(0)}KB`);
