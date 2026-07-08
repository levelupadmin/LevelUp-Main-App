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

// A lazily-resolved, fully-guarded storage handle. createSyncStoragePersister
// only ever calls getItem/setItem/removeItem, and each here degrades to a no-op
// if storage is unavailable — so corrupt/oversized/absent localStorage yields a
// cold start rather than a throw.
const lazyStorage = {
  getItem: (key: string): string | null => {
    try { return getLocalStorage()?.getItem(key) ?? null; } catch { return null; }
  },
  setItem: (key: string, value: string): void => {
    try { getLocalStorage()?.setItem(key, value); } catch { /* quota / private mode → skip */ }
  },
  removeItem: (key: string): void => {
    try { getLocalStorage()?.removeItem(key); } catch { /* nothing to remove */ }
  },
};

export const persister = createSyncStoragePersister({
  storage: lazyStorage,
  key: PERSIST_STORAGE_KEY,
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
