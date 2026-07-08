// Sentry wiring.
// ----------------------------------------------------------------------------
// Sentry is kept OFF the entry chunk (P6-T7 bundle diet). The SDK
// (`@sentry/react`, ~150KB) is pulled in ONLY via a dynamic `import()` inside
// initSentry(), and only when a DSN is actually configured. `import type`
// below is erased at build time, so this module carries no static runtime
// dependency on Sentry — importing it from ErrorBoundary / AuthContext /
// VdoCipherPlayer costs nothing until init runs.
//
// initSentry() is called from main.tsx but defers the real load to first idle
// (requestIdleCallback, 3s timeout) so error reporting never competes with the
// initial paint. Errors reported before the SDK finishes loading are queued and
// flushed on init (or dropped if init never starts / the load fails) — reporting
// must never block, throw, or delay the app.
//
// The DSN comes from VITE_SENTRY_DSN; if it's not set (local dev, preview
// builds, or before the production DSN is minted in the Sentry dashboard),
// init is a no-op so the rest of the app continues unaffected.
//
// Once you have a Sentry account:
// 1. Create a project at https://sentry.io for the React app
// 2. Copy the DSN it gives you (format: https://abc...@o....ingest.sentry.io/12345)
// 3. Add VITE_SENTRY_DSN in Vercel under Project Settings, Environment Variables
// 4. Redeploy. Errors will start flowing into Sentry within minutes.

import type * as SentryReact from "@sentry/react";

// The loaded SDK, or null until the dynamic import resolves.
let sentry: typeof SentryReact | null = null;
// Guards against a second init (and tells captureException whether a load is
// underway, so it knows to queue rather than drop).
let initStarted = false;

// Errors reported before the SDK finishes loading. Bounded so a pre-init error
// storm can't grow this without limit; flushed once init completes.
type QueuedError = { error: unknown; context?: Record<string, unknown> };
const pendingErrors: QueuedError[] = [];
const MAX_PENDING_ERRORS = 20;

// Latest user identity set before the SDK loaded. `undefined` means nothing is
// pending; `null` means an explicit sign-out. Latest write wins, applied on init.
let pendingUser: SentryReact.User | null | undefined = undefined;

/**
 * Resolve whether Sentry should run in this environment. Returns the DSN when
 * it should, or null (no DSN / localhost) when reporting stays a no-op.
 */
function resolveSentryConfig(): { dsn: string } | null {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    // No DSN configured, common during local dev. Stay silent; users
    // shouldn't see a console error just because the team hasn't
    // hooked up error reporting yet.
    return null;
  }

  // Skip on localhost so dev-time errors don't pollute the production
  // error budget.
  if (typeof window !== "undefined" && /^(localhost|127\.|\[?::1)/.test(window.location.hostname)) {
    return null;
  }

  return { dsn };
}

/**
 * Dynamically load @sentry/react and initialise it. Runs at most once. On any
 * failure the pending queue is dropped — a broken error reporter must never
 * surface to the user.
 */
async function loadAndInit(dsn: string): Promise<void> {
  try {
    const S = await import("@sentry/react");
    sentry = S;

    S.init({
      dsn,
      // Tag every event with the deploy commit (so we can correlate
      // errors to a specific deploy). Vercel injects this automatically.
      release: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA as string | undefined,
      environment: import.meta.env.MODE === "production" ? "production" : "preview",
      // Don't sample performance traces too aggressively; full session
      // replay costs Sentry quota. 10% gives a useful sample without
      // burning through it.
      tracesSampleRate: 0.1,
      // Capture replays for sessions where an error occurs so we can
      // see the user's path leading to the bug. 0% on healthy sessions
      // keeps the bill manageable.
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 1.0,
      integrations: [
        S.browserTracingIntegration(),
        S.replayIntegration({
          // PII masking: never capture text content or form inputs in
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
          // ResizeObserver loop limit exceeded, benign, fires from CSS
          // animation libs and is not user-visible
          if (/ResizeObserver/.test(msg)) return null;
          // Network errors from third-party trackers (we can't fix them)
          if (/Load failed|NetworkError when attempting/.test(msg)) return null;
        }
        return event;
      },
    });

    // Apply any identity set while the SDK was still loading.
    if (pendingUser !== undefined) {
      S.setUser(pendingUser);
      pendingUser = undefined;
    }

    // Flush errors reported before init completed.
    for (const queued of pendingErrors.splice(0)) {
      S.captureException(queued.error, queued.context ? { extra: queued.context } : undefined);
    }
  } catch {
    // Sentry failed to load (network, blocked CDN, chunk error). Drop the
    // queue and leave the app entirely unaffected.
    pendingErrors.length = 0;
    pendingUser = undefined;
  }
}

/**
 * Kick off Sentry initialisation. Cheap and synchronous: it schedules the
 * actual SDK load for first idle so it never blocks paint, and no-ops entirely
 * when no DSN is configured (local dev / preview / localhost).
 */
// Pre-init global handlers (council, phase-6): the SDK's own window handlers
// only exist after the deferred idle load — i.e. the staged rollout's halt
// signal was blind during the exact cold-start window this release rewires.
// These two lightweight listeners queue uncaught errors into pendingErrors
// (bounded) from the very first frame; loadAndInit's flush reports them and
// the SDK's own handlers take over from then on (queueing simply stops).
function installPreInitHandlers() {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    if (!sentry && pendingErrors.length < MAX_PENDING_ERRORS) {
      pendingErrors.push({ error: e.error ?? e.message, context: { preInit: true, source: "window.onerror" } });
    }
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (!sentry && pendingErrors.length < MAX_PENDING_ERRORS) {
      pendingErrors.push({ error: e.reason, context: { preInit: true, source: "unhandledrejection" } });
    }
  });
}

export function initSentry() {
  if (initStarted) return;
  const config = resolveSentryConfig();
  if (!config) return;
  initStarted = true;
  installPreInitHandlers();

  const run = () => {
    void loadAndInit(config.dsn);
  };

  // Init after first paint: requestIdleCallback with a 3s timeout so the load
  // is guaranteed to happen even on a page that never goes idle. setTimeout
  // is the fallback where requestIdleCallback isn't available (older Safari).
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 3000 });
  } else {
    setTimeout(run, 3000);
  }
}

/**
 * Report a caught error (e.g. from our ErrorBoundary.componentDidCatch) to
 * Sentry. A render error caught by an ErrorBoundary is "handled", so Sentry's
 * global handlers never see it, so the boundary must report it explicitly.
 *
 * This is the thin facade the rest of the app routes through: if the SDK is
 * loaded it forwards immediately; if init is underway it queues (bounded) for
 * flush-on-init; if Sentry isn't configured it drops. Never throws.
 */
export function captureException(error: unknown, context?: Record<string, unknown>) {
  try {
    if (sentry) {
      sentry.captureException(error, context ? { extra: context } : undefined);
      return;
    }
    // SDK not loaded yet. Queue only if an init is actually in flight —
    // otherwise (no DSN) there's nothing to flush to, so drop silently.
    if (initStarted && pendingErrors.length < MAX_PENDING_ERRORS) {
      pendingErrors.push({ error, context });
    }
  } catch {
    // Error reporting must never itself throw.
  }
}

/**
 * Attach the current user identity so error reports can be filtered by
 * who hit them. Called from AuthContext when a session loads. If the SDK
 * hasn't loaded yet the latest identity is remembered and applied on init.
 */
export function setSentryUser(user: { id: string; email?: string | null } | null) {
  const identity: SentryReact.User | null = user
    ? {
        id: user.id,
        // Email helps support correlate "Rahul reported X" to the right
        // events. Hashed/redacted is fine if you'd rather - Sentry's PII
        // handling is configurable from the dashboard too.
        email: user.email ?? undefined,
      }
    : null;

  if (sentry) {
    sentry.setUser(identity);
    return;
  }
  // Remember the most recent identity to apply once the SDK loads. Latest
  // wins — a sign-out (null) set before load correctly clears attribution.
  pendingUser = identity;
}
