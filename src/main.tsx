import { createRoot } from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import App from "./App.tsx";
import "./index.css";
import { initSentry } from "./lib/sentry";
import { durationsMs } from "./lib/motion";

// Kick off error reporting. This is cheap and non-blocking: it schedules the
// @sentry/react load for first idle (so Sentry stays off the entry chunk and
// off the critical paint path) and no-ops if VITE_SENTRY_DSN isn't set. Errors
// thrown before the SDK finishes loading are queued and flushed on init.
initSentry();

const rootElement = document.getElementById("root")!;

// Native splash → web handoff. The OS holds the branded splash (launchAutoHide
// is false in capacitor.config.ts) and we lift it from here, once React has
// actually painted, so it fades straight onto rendered content — no black gap,
// no double-splash. Web is untouched: isNativePlatform() is false in a browser
// and the plugin is only pulled in via dynamic import on native.
if (Capacitor.isNativePlatform()) {
  let hidden = false;
  const hide = () => {
    if (hidden) return;
    hidden = true;
    // fadeOutDuration is --motion-base (durationsMs.base, 240ms) and mirrors
    // launchFadeOutDuration in capacitor.config.ts — that config can't import
    // this runtime token, so it pins the literal with a comment instead.
    // Import inside hide (not once up top) and swallow any rejection so a
    // failed dynamic import can never surface as an unhandled rejection that
    // leaves the splash up — the module cache makes the repeat import cheap.
    void import("@capacitor/splash-screen")
      .then(({ SplashScreen }) =>
        SplashScreen.hide({ fadeOutDuration: durationsMs.base }),
      )
      .catch(() => {});
  };

  // Failsafe: armed BEFORE render() on purpose. A synchronous throw during the
  // initial render (QueryClientProvider / AuthProvider / plumbing above the
  // in-tree ErrorBoundary) propagates out of render() and would skip anything
  // scheduled after it; with launchAutoHide:false only JS can lift the splash,
  // so a timer set after render would never arm and the user would be trapped.
  // Arming it here guarantees the splash force-hides after 4s no matter what,
  // dropping users onto the dark canvas + ErrorBoundary. Cleared the moment the
  // normal double-rAF hide fires.
  const failsafe = window.setTimeout(hide, 4000);

  createRoot(rootElement).render(<App />);

  // Double rAF guarantees a painted React frame exists before the splash
  // lifts (one rAF fires before paint on some WebViews; the second is safe).
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      window.clearTimeout(failsafe);
      hide();
    }),
  );
} else {
  createRoot(rootElement).render(<App />);
}
