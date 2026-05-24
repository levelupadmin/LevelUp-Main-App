// Sentry wiring.
// ----------------------------------------------------------------------------
// Initialised early in main.tsx so any error during module evaluation or
// React render reaches us. The DSN comes from VITE_SENTRY_DSN — if it's
// not set (local dev, preview builds, or before the production DSN is
// minted in the Sentry dashboard), init is a no-op so the rest of the
// app continues unaffected.
//
// Once you have a Sentry account:
// 1. Create a project at https://sentry.io for the React app
// 2. Copy the DSN it gives you (format: https://abc...@o....ingest.sentry.io/12345)
// 3. Add VITE_SENTRY_DSN in Vercel → Project Settings → Environment Variables
// 4. Redeploy. Errors will start flowing into Sentry within minutes.

import * as Sentry from "@sentry/react";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured — common during local dev. Stay silent; users
    // shouldn't see a console error just because the team hasn't
    // hooked up error reporting yet.
    return;
  }

  // Skip on localhost so dev-time errors don't pollute the production
  // error budget.
  if (typeof window !== "undefined" && /^(localhost|127\.|\[?::1)/.test(window.location.hostname)) {
    return;
  }

  Sentry.init({
    dsn,
    // Tag every event with the deploy commit (so we can correlate
    // errors to a specific deploy). Vercel injects this automatically.
    release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined,
    environment: import.meta.env.MODE === "production" ? "production" : "preview",
    // Don't sample performance traces too aggressively — full session
    // replay costs Sentry quota. 10% gives a useful sample without
    // burning through it.
    tracesSampleRate: 0.1,
    // Capture replays for sessions where an error occurs so we can
    // see the user's path leading to the bug. 0% on healthy sessions
    // keeps the bill manageable.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        // PII masking — never capture text content or form inputs in
        // replays. We sell to creators and need to respect their work.
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    // Filter noisy non-actionable errors before they're sent.
    beforeSend(event, hint) {
      const err = hint.originalException;
      if (err instanceof Error) {
        const msg = err.message || "";
        // Browser extension noise
        if (/extension|chrome-extension|moz-extension/.test(msg)) return null;
        // ResizeObserver loop limit exceeded — benign, fires from CSS
        // animation libs and is not user-visible
        if (/ResizeObserver/.test(msg)) return null;
        // Network errors from third-party trackers (we can't fix them)
        if (/Load failed|NetworkError when attempting/.test(msg)) return null;
      }
      return event;
    },
  });
}

/**
 * Wrap a component tree so React render errors are captured by Sentry
 * AND fall through to our existing ErrorBoundary UI.
 */
export const SentryErrorBoundary = Sentry.ErrorBoundary;

/**
 * Attach the current user identity so error reports can be filtered by
 * who hit them. Called from AuthContext when a session loads.
 */
export function setSentryUser(user: { id: string; email?: string | null } | null) {
  if (!user) {
    Sentry.setUser(null);
    return;
  }
  Sentry.setUser({
    id: user.id,
    // Email helps support correlate "Rahul reported X" to the right
    // events. Hashed/redacted is fine if you'd rather - Sentry's PII
    // handling is configurable from the dashboard too.
    email: user.email ?? undefined,
  });
}
