import { QueryClient } from "@tanstack/react-query";
import type { Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

// ── The app's single QueryClient + its localStorage persister (P6-T3) ──
// Extracted out of App.tsx so the sign-out path (AuthContext) can purge the
// persisted cache without importing the whole app root.

// Bump this to invalidate every persisted cache at once (e.g. after a data-shape
// change). react-query-persist-client discards a restored cache whose buster
// doesn't match. Sourced from the build-time app version, with a stable
// fallback so a missing env never silently disables busting.
export const APP_CACHE_BUSTER =
  (import.meta.env.VITE_APP_VERSION as string | undefined) ?? "p6";

// How long a persisted cache may be restored before it's considered too old and
// dropped (cold start instead). 24h: a warm open the next day still paints
// instantly, but week-old data never resurfaces.
export const PERSIST_MAX_AGE = 24 * 60 * 60 * 1000;

// localStorage key the dehydrated cache is written under.
export const PERSIST_STORAGE_KEY = "lu_rq_cache";

// How long to coalesce persist writes. The persist subscribe path re-runs on
// EVERY cache event, so during a warm /home open (catalog + enrolled-progress +
// my-courses + profile-sections all settling back-to-back) the persister would
// otherwise serialize the whole dehydrated cache — a 50–200KB catalog payload —
// once per settle. Throttling to 1s collapses that burst into a single deferred
// write. The persister runs that write inside `timeoutManager.setTimeout`, so
// even the one serialize+setItem lands on a macrotask AFTER first paint, never
// on the synchronous settle path. This matches the library's current default
// but is pinned explicitly so a future default change can't silently regress
// the open this lane optimizes.
export const PERSIST_THROTTLE_MS = 1000;

// The ONLY query-key roots allowed into the persisted cache. Everything else —
// payments, coupons, auth, the entitlement gate (`enrolled-offering-ids`,
// staleTime 0), community, events — is deliberately excluded so no
// access-deciding or sensitive payload is ever written to disk. Keys here are
// all user-scoped (T1/T2 include the user id), so a second user on the same
// device never reads the first user's persisted entry.
export const PERSISTED_QUERY_ROOTS = new Set<string>([
  "catalog",
  "enrolled-progress",
  "my-courses",
  "profile-sections",
]);

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // prevent data refetches on tab switch
      staleTime: 5 * 60 * 1000, // treat data as fresh for 5 minutes
    },
  },
});

// Resolve window.localStorage at CALL time, not import time. In a non-DOM
// context or a locked-down WebView (private mode) `window`/`localStorage` may be
// absent or throw on access; every read/write is guarded so the persister
// silently no-ops (cold start) instead of crashing the app.
const getLocalStorage = (): Storage | undefined => {
  try {
    if (typeof window === "undefined") return undefined;
    return window.localStorage ?? undefined;
  } catch {
    return undefined;
  }
};

// A persisted-cache write failed (quota exceeded / oversized payload / locked
// WebView). We warn ONCE per session rather than on every throttled write, so a
// device whose cache no longer fits leaves a single breadcrumb instead of
// spamming the console. Without this the failure is invisible: the persister's
// own `retry` hook never fires because the wrapper below swallows the throw, so
// this catch is the only place the "warm open silently degraded to cold"
// signal can surface.
let warnedPersistWriteFailure = false;
const warnPersistWriteFailureOnce = (key: string, value: string, error: unknown): void => {
  if (warnedPersistWriteFailure) return;
  warnedPersistWriteFailure = true;
  // value.length ≈ byte size for the mostly-ASCII JSON we write; enough to spot
  // an oversized catalog payload without serializing anything extra.
  console.warn(
    `[queryClient] persisted cache write failed for "${key}" (~${value.length} chars); ` +
      "warm opens will fall back to a cold start until storage frees up.",
    error
  );
};

// Test-only: reset the once-per-session warn latch. Production code never calls
// this — it exists so a spec can exercise the warn path in isolation without
// leaking the latched state into (or inheriting it from) sibling tests. Named
// with a `__` prefix so it reads as internal at every call site.
export const __resetPersistWriteFailureWarning = (): void => {
  warnedPersistWriteFailure = false;
};

// A lazily-resolved, fully-guarded storage handle. createSyncStoragePersister
// only ever calls getItem/setItem/removeItem, and each here degrades to a no-op
// if storage is unavailable — so corrupt/oversized/absent localStorage yields a
// cold start rather than a throw.
const lazyStorage = {
  getItem: (key: string): string | null => {
    try { return getLocalStorage()?.getItem(key) ?? null; } catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    // Still a no-op on failure (a persist write must never break the app), but
    // now the quota/oversize case leaves a one-time telemetry breadcrumb.
    try { getLocalStorage()?.setItem(key, value); }
    catch (error) { warnPersistWriteFailureOnce(key, value, error); }
  },
  removeItem: (key: string): void => {
    try { getLocalStorage()?.removeItem(key); } catch { /* nothing to remove */ }
  },
};

export const persister = createSyncStoragePersister({
  storage: lazyStorage,
  key: PERSIST_STORAGE_KEY,
  // Coalesce the settle-storm of a warm open into one deferred write (see
  // PERSIST_THROTTLE_MS). Pinned explicitly rather than inherited from the
  // library default.
  throttleTime: PERSIST_THROTTLE_MS,
});

// Only whitelisted, successfully-fetched queries are dehydrated to disk.
const shouldDehydrateQuery = (query: Query): boolean => {
  if (query.state.status !== "success") return false;
  const root = query.queryKey?.[0];
  return typeof root === "string" && PERSISTED_QUERY_ROOTS.has(root);
};

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  maxAge: PERSIST_MAX_AGE,
  buster: APP_CACHE_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery },
};

/**
 * Purge the persisted cache AND wipe the in-memory cache. Called from the
 * sign-out path (AuthContext) so a shared device never carries one account's
 * data into the next session — the same class as the `lu_weeks_seen` lesson.
 * User-scoped keys already isolate users, but this guarantees a clean slate even
 * for the non-user-scoped whitelisted key (`catalog`). Safe to call anywhere:
 * `removeClient` is wrapped so a throwing storage layer never breaks sign-out.
 */
export const purgePersistedQueryCache = async (): Promise<void> => {
  try {
    await persister.removeClient();
  } catch {
    /* storage unavailable (private mode / locked-down WebView) → nothing to purge */
  }
  // Drop everything held in memory so the next user starts from a cold cache.
  queryClient.clear();
};
