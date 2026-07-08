import type { Plugin } from "vite";

// P6 cold-start (Slow-3G brand-paint ≤2.5s gate).
//
// Vite injects the app stylesheet as a render-blocking `<link rel="stylesheet">`
// in <head>. On Slow-3G that link cannot even be REQUESTED until the HTML has
// parsed (~2.2s over a 2000ms-RTT link) and then costs a SECOND full round-trip
// before its first byte — and because it is render-blocking, the browser holds
// ALL painting (including the inline #boot-splash brand shell in index.html)
// until it arrives. Measured effect: first paint at ~6.5s instead of ~2.1s.
// Evidence + full diagnosis: design/qa/phase-6/P6-cold-start-filmstrip.md.
//
// This rewrites the emitted stylesheet <link>s to the standard non-blocking
// media-swap: load as media="print" (which does not block screen rendering),
// then flip to media="all" on load. A <noscript> fallback keeps the stylesheet
// render-blocking when JS is disabled, so no-JS users never see unstyled content.
//
// Why this is SAFE (no FOUC) for this app specifically — the two ways FOUC could
// happen are both structurally absent here:
//   1. First pre-JS paint is the #boot-splash, styled ENTIRELY by the inline
//      <style> in index.html (hard-coded colors, zero dependency on index.css),
//      so it renders correctly whether or not the stylesheet has loaded.
//   2. The first APP-content paint happens only when React mounts (createRoot
//      clears #root) — i.e. after the ~800KB JS bundle downloads+executes. The
//      stylesheet (~20KB brotli, requested first, in <head>) always resolves
//      well before that, so the app never paints unstyled. On the native shells
//      (Android System WebView / iOS WKWebView) assets load from the local
//      bundle in ~0ms, so the media flip is instantaneous and the whole change
//      is a no-op there.
//
// Runtime-only variants do NOT work: Chrome locks the render-blocking decision
// at the link's parse-time `media`, so a later MutationObserver/JS flip cannot
// retroactively unblock first paint (measured: no improvement). The swap must be
// present in the emitted HTML, hence a build-time transform.

const STYLESHEET_LINK = /<link\b[^>]*\brel=(["'])stylesheet\1[^>]*>/gi;

/**
 * Rewrite render-blocking `<link rel="stylesheet">` tags into the non-blocking
 * media="print"/onload swap, with a <noscript> fallback. Pure and idempotent:
 * a tag that already carries an explicit `media` attribute is left untouched.
 */
export function rewriteRenderBlockingCss(html: string): string {
  return html.replace(STYLESHEET_LINK, (tag, _quote, offset: number, str: string) => {
    // Already non-render-blocking / has an explicit media — leave it alone.
    if (/\bmedia\s*=/i.test(tag)) return tag;
    // Skip the plain render-blocking link we ourselves emit inside <noscript>,
    // so re-running the transform is a no-op (idempotent).
    if (str.slice(Math.max(0, offset - 10), offset) === "<noscript>") return tag;
    const swapped = tag.replace(
      /\s*\/?>\s*$/,
      ` media="print" onload="this.media='all'">`,
    );
    return `${swapped}<noscript>${tag}</noscript>`;
  });
}

/**
 * Vite plugin: make the app stylesheet non-render-blocking in the production
 * build so the inline brand splash can paint on the first HTML round-trip.
 * Build-only — the dev server serves CSS via the module graph, no <link>.
 */
export function nonBlockingCss(): Plugin {
  return {
    name: "levelup:non-blocking-css",
    apply: "build",
    transformIndexHtml: {
      // `post` so it runs AFTER Vite has injected the hashed stylesheet <link>.
      order: "post",
      handler: (html) => rewriteRenderBlockingCss(html),
    },
  };
}
