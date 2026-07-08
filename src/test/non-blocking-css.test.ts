import { describe, it, expect } from "vitest";
import { rewriteRenderBlockingCss } from "../../build/non-blocking-css";

// Guards the P6 cold-start brand-paint fix: the build must emit a NON-render-
// blocking app stylesheet (media="print" swap + <noscript> fallback) so the
// inline brand splash paints on the first Slow-3G round-trip (≤2.5s gate).
describe("rewriteRenderBlockingCss", () => {
  it("converts a render-blocking stylesheet link into the media-swap + noscript fallback", () => {
    const input = `<link rel="stylesheet" crossorigin href="/assets/index-CmnyS6MI.css">`;
    const out = rewriteRenderBlockingCss(input);

    // Non-blocking swap present on the live link.
    expect(out).toContain(`media="print"`);
    expect(out).toContain(`onload="this.media='all'"`);
    // Original href + crossorigin preserved.
    expect(out).toContain(`href="/assets/index-CmnyS6MI.css"`);
    expect(out).toContain(`crossorigin`);
    // No-JS fallback keeps a plain render-blocking link.
    expect(out).toContain(
      `<noscript><link rel="stylesheet" crossorigin href="/assets/index-CmnyS6MI.css"></noscript>`,
    );
  });

  it("is idempotent — a link that already declares media is left untouched", () => {
    const already = `<link rel="stylesheet" crossorigin href="/a.css" media="print" onload="this.media='all'">`;
    expect(rewriteRenderBlockingCss(already)).toBe(already);
    // And re-running the transform on its own output does not double-wrap.
    const once = rewriteRenderBlockingCss(
      `<link rel="stylesheet" href="/a.css">`,
    );
    expect(rewriteRenderBlockingCss(once)).toBe(once);
  });

  it("does not touch modulepreload or non-stylesheet links", () => {
    const input = [
      `<link rel="modulepreload" crossorigin href="/assets/react-vendor.js">`,
      `<link rel="preload" as="font" type="font/woff2" href="/fonts/Inter-400.woff2" crossorigin>`,
      `<link rel="icon" type="image/png" href="/favicon.png">`,
    ].join("\n");
    expect(rewriteRenderBlockingCss(input)).toBe(input);
  });

  it("rewrites every stylesheet link when several are emitted", () => {
    const input = `<link rel="stylesheet" href="/a.css"><link rel="stylesheet" href="/b.css">`;
    const out = rewriteRenderBlockingCss(input);
    expect(out.match(/media="print"/g)).toHaveLength(2);
    expect(out.match(/<noscript>/g)).toHaveLength(2);
  });
});
