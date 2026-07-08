import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "@/lib/toast";
import { purgePersistedQueryCache } from "@/lib/queryClient";

interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  avatar_url: string | null;
  member_number: number | null;
  bio: string | null;
  city: string | null;
  occupation: string | null;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Per-user localStorage watermarks that must NOT survive a session change on a
// shared device. Kept as a literal (not imported from the home component) so the
// critical-path auth bundle doesn't pull in YourWeek + its deps; mirrors
// `WEEKS_SEEN_KEY_PREFIX` in components/home/YourWeek.tsx.
const clearPerUserLocalState = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith("lu_weeks_seen")) localStorage.removeItem(key);
    }
  } catch {
    /* storage unavailable (private mode / locked-down WebView) → nothing to clear */
  }
};

// ────────────────────────────────────────────────────────────────────
// Profile-row cache (P6-T4) — auth gate off the critical path
// ────────────────────────────────────────────────────────────────────
// A returning user's `users` profile row is cached in localStorage so a cold
// start can paint their Home with ZERO auth-blocking round-trips: `getSession()`
// resolves the session locally, and if a cached profile matches that session's
// user we drop `loading` immediately and revalidate in the background.
//
// Hard rules this cache lives under:
//   • It stores ONLY the `users` profile row — never a session token (supabase-js
//     owns those). A cached profile is NEVER an access grant on its own: it is
//     only ever hydrated when supabase-js has already resolved a real session for
//     the SAME user id, so it can't manufacture a logged-in state.
//   • It is scoped to a single user id and never read for a different user (a
//     second account on a shared device falls through to the blocking fetch),
//     and it is cleared on sign-out / expiry / soft-delete so it can't leak
//     across sessions — same class as the `lu_weeks_seen` lesson.
const PROFILE_CACHE_KEY = "lu_profile_v1";

interface CachedProfileEnvelope {
  userId: string;
  profile: UserProfile;
}

// Returns the cached profile ONLY when it belongs to `userId` (envelope id AND
// the row's own id must match). Any parse/shape/mismatch → null → blocking fetch.
const readCachedProfile = (userId: string): UserProfile | null => {
  try {
    const raw = localStorage.getItem(PROFILE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedProfileEnvelope | null;
    if (!parsed || parsed.userId !== userId) return null;
    const cached = parsed.profile;
    if (!cached || cached.id !== userId) return null;
    return cached;
  } catch {
    /* absent/corrupt storage → treat as no cache (cold start) */
    return null;
  }
};

const writeCachedProfile = (userId: string, profile: UserProfile | null): void => {
  try {
    if (!profile) {
      localStorage.removeItem(PROFILE_CACHE_KEY);
      return;
    }
    const envelope: CachedProfileEnvelope = { userId, profile };
    localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(envelope));
  } catch {
    /* quota / private mode → skip; correctness never depends on the cache */
  }
};

const clearCachedProfile = (): void => {
  try {
    localStorage.removeItem(PROFILE_CACHE_KEY);
  } catch {
    /* storage unavailable → nothing to clear */
  }
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};

// ────────────────────────────────────────────────────────────────────
// DEV-ONLY admin bypass
// ────────────────────────────────────────────────────────────────────
// Vite replaces `import.meta.env.DEV` and `import.meta.env.VITE_*`
// statically at build time, so a production build compiled with
// VITE_DEV_ADMIN_BYPASS unset or `import.meta.env.DEV === false` will
// tree-shake the bypass path out completely.
//
// The runtime guards below are belt-and-braces:
//
//   1. `safeHostname`: even if someone accidentally ships a dev build
//      (or flips the env var in a prod build), refuse to activate the
//      bypass unless the page is served from localhost / 127.0.0.1 /
//      an IPv6 loopback. This prevents a compromised build pipeline
//      from turning every visitor into an admin.
//
//   2. `console.error` + banner: any time the bypass is active we
//      scream about it. A developer who forgot the flag is on will
//      notice immediately; a leaked build in a QA environment will be
//      caught by the banner visible on every page.
const isLoopbackHost = () => {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
};

const DEV_BYPASS_REQUESTED =
  import.meta.env.DEV && import.meta.env.VITE_DEV_ADMIN_BYPASS === "true";

const DEV_BYPASS = DEV_BYPASS_REQUESTED && isLoopbackHost();

if (DEV_BYPASS_REQUESTED && !DEV_BYPASS) {
  // Build-time flag said bypass, runtime says we're NOT on localhost.
  // This is the dangerous mismatch we're guarding against. Log loudly
  // and proceed WITHOUT the bypass so real auth is enforced.
  // eslint-disable-next-line no-console
  console.error(
    "[AuthContext] VITE_DEV_ADMIN_BYPASS is set but the page is not " +
    "served from localhost. Ignoring bypass and enforcing real auth. " +
    "If you see this in production, your build pipeline is leaking " +
    "dev flags. Investigate immediately."
  );
}

if (DEV_BYPASS) {
  // eslint-disable-next-line no-console
  console.warn(
    "%c[AuthContext] DEV ADMIN BYPASS ACTIVE",
    "background:#ff0;color:#000;font-weight:bold;padding:2px 6px;",
    "- real authentication is disabled. DO NOT SHIP."
  );
}

const DEV_PROFILE: UserProfile = {
  id: "00000000-0000-0000-0000-000000000000",
  email: "rahul@rahul.com",
  full_name: "Rahul (Dev)",
  role: "admin",
  avatar_url: null,
  member_number: 1,
  bio: null,
  city: null,
  occupation: null,
};

const DEV_USER = { id: DEV_PROFILE.id, email: DEV_PROFILE.email } as User;

const DevBypassBanner = () => (
  <div
    style={{
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      zIndex: 2147483647,
      background: "#ff0",
      color: "#000",
      padding: "4px 12px",
      fontFamily: "ui-monospace, SFMono-Regular, monospace",
      fontSize: 12,
      fontWeight: 700,
      textAlign: "center",
      pointerEvents: "none",
    }}
    role="status"
  >
    DEV ADMIN BYPASS ACTIVE - auth is disabled. Unset VITE_DEV_ADMIN_BYPASS before deploying.
  </div>
);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);

  // Dev bypass: skip Supabase auth entirely (localhost only, see
  // runtime guards above).
  if (DEV_BYPASS) {
    return (
      <AuthContext.Provider value={{ session: null, user: DEV_USER, profile: DEV_PROFILE, loading: false, signOut: async () => {} }}>
        <DevBypassBanner />
        {children}
      </AuthContext.Provider>
    );
  }

  // Distinguishes "fetch failed" (transient network/API error: keep the
  // session, retry later) from "fetch succeeded but no row" (RLS hides
  // soft-deleted accounts, so a signed-in user with no visible profile
  // row is in the 7-day deletion grace window and must be signed out).
  type ProfileFetchResult =
    | { ok: true; profile: UserProfile | null }
    | { ok: false };

  const fetchProfile = async (userId: string): Promise<ProfileFetchResult> => {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, role, avatar_url, member_number, bio, city, occupation")
      .eq("id", userId)
      .maybeSingle();
    if (error) {
      if (import.meta.env.DEV) console.error("[AuthContext] fetchProfile error:", error);
      return { ok: false };
    }
    return { ok: true, profile: (data as UserProfile | null) ?? null };
  };

  useEffect(() => {
    let isMounted = true;
    let hadSession = false;
    let initialLoadDone = false;

    const attachSentryUser = (nextSession: Session) =>
      // Attach the current user identity to Sentry so error reports can be
      // filtered + searched by who hit them. Dynamic import so unauthenticated
      // pages don't pull Sentry into their bundle.
      void import("@/lib/sentry").then((m) =>
        m.setSentryUser({ id: nextSession.user.id, email: nextSession.user.email ?? null })
      );

    const syncAuthState = async (nextSession: Session | null) => {
      if (!isMounted) return;

      // Whether this is the very first resolution (cold start). The cached-
      // profile fast path only applies here; later user-changes (account
      // switch) always take the blocking fetch so we never render one account's
      // chrome for another.
      const isInitial = !initialLoadDone;

      // Only show the loading state on initial page load. Subsequent auth
      // events (token refresh on tab switch) update session/profile silently so
      // form state is never lost.
      if (isInitial) {
        setLoading(true);
      }

      setSession(nextSession);

      if (!nextSession?.user) {
        if (hadSession) {
          toast.error("Your session has expired. Please sign in again.");
        }
        currentUserIdRef.current = null;
        setProfile(null);
        // A logged-out state must never leave a previous user's profile cached
        // on a shared device.
        clearCachedProfile();
        // Council (phase-6): involuntary sign-outs (expiry, revocation) must
        // purge EVERYTHING the manual signOut purges — the persisted query
        // cache held the previous user's courses/progress on shared devices.
        clearPerUserLocalState();
        void purgePersistedQueryCache();
        // Clear Sentry user attribution so post-signout errors aren't
        // attributed to the previous user.
        void import("@/lib/sentry").then((m) => m.setSentryUser(null));
        setLoading(false);
        initialLoadDone = true;
        return;
      }

      hadSession = true;

      // If this is a background token refresh and the user id hasn't
      // changed, skip the profile refetch entirely; nothing to update.
      if (initialLoadDone && currentUserIdRef.current === nextSession.user.id) {
        return;
      }
      currentUserIdRef.current = nextSession.user.id;

      // ── Fast path (P6-T4): cold start with a cached profile for THIS session
      // user. Hydrate from cache and drop `loading` immediately so Home paints
      // with zero auth-blocking round-trips, then fall through to revalidate the
      // row in the background. Skipped when there's nothing cached (first login /
      // new device) — correctness over speed there (block on the fetch).
      const cached = isInitial ? readCachedProfile(nextSession.user.id) : null;
      if (cached) {
        setProfile(cached);
        attachSentryUser(nextSession);
        setLoading(false);
        initialLoadDone = true;
      }

      const result = await fetchProfile(nextSession.user.id);

      if (!isMounted) return;

      if (result.ok && result.profile === null) {
        // Soft-deleted account inside the grace window: the session
        // minted but RLS returns no profile row, which would leave the
        // app half-working (RequireAuth passes, every profile-driven
        // surface breaks). Sign out instead. Resetting hadSession first
        // keeps the SIGNED_OUT event below from also firing the generic
        // "session expired" toast, and because sign-out clears the
        // session this branch cannot re-enter in a loop. Also drops the
        // cached row so the deleted account can't be re-hydrated next boot.
        hadSession = false;
        currentUserIdRef.current = null;
        setProfile(null);
        clearCachedProfile();
        // Council (phase-6): the soft-delete auto sign-out is an involuntary
        // sign-out too — same full purge as the manual path.
        clearPerUserLocalState();
        void purgePersistedQueryCache();
        setLoading(false);
        initialLoadDone = true;
        toast.error("This account is scheduled for deletion. Contact support to recover it.");
        void supabase.auth.signOut();
        return;
      }

      if (result.ok) {
        // Fresh row wins: update state AND refresh the cache. Critically for the
        // role-downgrade path, this re-render re-evaluates RequireRole with the
        // revalidated role, so a downgraded user loses access even if the stale
        // cached role briefly allowed it.
        setProfile(result.profile);
        writeCachedProfile(nextSession.user.id, result.profile);
      } else {
        // Transient fetch failure: clear the in-memory profile so the ACCESS
        // DECISION stays byte-identical to the pre-cache path — `setProfile(null)`
        // → RequireRole falls back to RouteFallback, never a stale cached role.
        // This MUST run even when a cached profile was hydrated on the fast path
        // above: otherwise a role-downgrade that coincides with a failed
        // revalidation would leave the stale elevated role in force (the exact
        // divergence the "byte-identical access decisions" bar forbids). The
        // session is untouched (real, this user), so RequireAuth still renders;
        // the localStorage cache is left intact for a future cold start, which
        // revalidates again, and a later successful revalidation restores the row.
        setProfile(null);
      }

      // The cached fast path already attached the Sentry user; only attach here
      // when we didn't take it (non-cached cold start / account switch), so a
      // cached cold start doesn't dispatch setSentryUser twice.
      if (!cached) {
        attachSentryUser(nextSession);
      }
      setLoading(false);
      initialLoadDone = true;
    };

    void supabase.auth.getSession().then(({ data: { session: currentSession } }) =>
      syncAuthState(currentSession)
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, nextSession) => {
        void syncAuthState(nextSession);
      }
    );

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    // Wipe per-user localStorage watermarks (e.g. the weekly-consistency
    // "weeks seen" counter) so the next account on a shared device starts clean.
    clearPerUserLocalState();
    // Drop the cached profile row (P6-T4) so the next account on this device
    // can't cold-start into the previous user's identity.
    clearCachedProfile();
    // Purge the persisted react-query cache (P6-T3): remove the dehydrated
    // localStorage copy AND clear the in-memory cache so a second user on the
    // same device never sees the first user's Home/courses/profile data. Query
    // keys are already user-scoped, but this guarantees a clean slate even for
    // the non-user-scoped whitelisted key (`catalog`). Awaited but self-guarded,
    // so a locked-down storage layer can't break sign-out.
    await purgePersistedQueryCache();
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
