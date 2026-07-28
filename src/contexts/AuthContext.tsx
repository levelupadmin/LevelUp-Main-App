import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "@/lib/toast";
import { purgePersistedQueryCache, queryClient } from "@/lib/queryClient";

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

// Query-key roots a successful purchase claim (SC-2) makes stale: the
// entitlement gate plus the two enrolment-backed surfaces. Kept as literals
// (not imported from the catalog/course hooks) for the same reason as
// `clearPerUserLocalState` above — the critical-path auth bundle must not pull
// those modules in. Mirrors `ENROLLED_OFFERINGS_QUERY_KEY`
// (components/catalog/useCatalog.ts), `ENROLLED_PROGRESS_QUERY_KEY`
// (hooks/useEnrolledProgress.ts) and the `["my-courses", uid]` key in
// pages/MyCoursesPage.tsx. Prefix keys, so every user-scoped variant matches.
const CLAIM_INVALIDATED_QUERY_ROOTS = [
  "enrolled-offering-ids",
  "enrolled-progress",
  "my-courses",
];

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

// ────────────────────────────────────────────────────────────────────
// Claim watermark (SC-2) — one claim per user per visit, not per event
// ────────────────────────────────────────────────────────────────────
// `claim_my_purchases()` is a SECURITY DEFINER write, so how OFTEN it runs is a
// production concern at 60k+ students. The claim must therefore be rate-limited
// — but NOT by the auth event name, which is the trap two earlier designs fell
// into.
//
// Why not gate on the event (verified against @supabase/auth-js 2.102.1 in
// node_modules, not assumed):
//   • Gating on SIGNED_IN fails CLOSED for the exact population this exists for.
//     `_recoverAndRefresh` computes `expiresWithMargin` (GoTrueClient.js:3508)
//     against EXPIRY_MARGIN_MS = 3 x 30s = 90s (lib/constants.js:13); when true
//     it calls `_callRefreshToken` (:3512), which emits ONLY TOKEN_REFRESHED.
//     The two SIGNED_IN emissions (:3530, :3545) sit in the not-expired branches
//     and are skipped. Access tokens live 3600s and `_onVisibilityChanged`
//     re-enters the same path on every Capacitor resume, so ANY cold start or
//     resume later than ~58.5 minutes after the last token issuance never
//     produces SIGNED_IN at all. A fresh OTP sign-in claims; a returning student
//     never does — silently, since the counters then read zero and it is
//     indistinguishable from success.
//   • Gating on a signed-out → signed-in TRANSITION fails in both directions.
//     On a cold start it fails OPEN: `getSession()` and `INITIAL_SESSION` both
//     await `initializePromise` while `onAuthStateChange` inserts the subscriber
//     synchronously, so the recovery event arrives while the provider still
//     holds nothing and reads as a fresh sign-in on every launch. On the emailed
//     magic-link callback it fails CLOSED: that path defers its event past
//     `initializePromise`, so the provider can already hold this exact user, and
//     the guest-checkout buyer who just paid claims nothing.
//
// So the rate limit is a persisted watermark, independent of event shape: at
// most one claim per user per `CLAIM_MIN_INTERVAL_MS`, surviving reloads and
// WebView restarts, plus an in-memory per-visit guard for storage-less clients.
// The real condition is "we are holding a session for this user and have not
// claimed for them recently", which is exactly what the watermark encodes.
// Repeatability is the point: "a student who signed up before their purchase
// was synced gets claimed on their next visit" is the whole feature.
//
// Six hours bounds both sides: at most ~4 index-scan RPCs per user per day even
// for someone who relaunches constantly, while a purchase that syncs today is
// still claimed today. The watermark is dropped whenever a resolution carries no
// user (sign-out, expiry, account switch), so an explicit sign-in always claims
// immediately.
const CLAIM_WATERMARK_KEY = "lu_claim_v1";
const CLAIM_MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

interface ClaimWatermark {
  userId: string;
  at: number;
}

// True only when THIS user's claim already ran recently enough that repeating
// it would be pure write traffic. Absent/corrupt/unreadable storage → false, so
// a locked-down WebView degrades to "claim once this visit" (the in-memory
// guard in the effect), never to "never claim".
const claimedRecently = (userId: string): boolean => {
  try {
    const raw = localStorage.getItem(CLAIM_WATERMARK_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw) as ClaimWatermark | null;
    if (!parsed || parsed.userId !== userId || typeof parsed.at !== "number") return false;
    const age = Date.now() - parsed.at;
    // A clock corrected backwards reads as a negative age; anything outside the
    // window (either side) counts as due rather than suppressing the claim.
    return age >= 0 && age < CLAIM_MIN_INTERVAL_MS;
  } catch {
    return false;
  }
};

const stampClaim = (userId: string): void => {
  try {
    const watermark: ClaimWatermark = { userId, at: Date.now() };
    localStorage.setItem(CLAIM_WATERMARK_KEY, JSON.stringify(watermark));
  } catch {
    /* quota / private mode → the in-memory guard still holds for this visit */
  }
};

const clearClaimWatermark = (): void => {
  try {
    localStorage.removeItem(CLAIM_WATERMARK_KEY);
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

    // ── Purchase claim at verified sign-in (SC-2) ─────────────────────────
    // `claim_my_purchases()` attaches purchases already in the system that were
    // made on the phone this user has just verified. It is SECURITY DEFINER and
    // idempotent, so running it once per real sign-in is both safe and the
    // point: a student whose purchase synced only after they signed up gets
    // claimed on their next visit.
    //
    // Three hard constraints:
    //   • NON-BLOCKING — fire-and-forget, never awaited, so it cannot land on
    //     the auth critical path. A failed claim must never lock a student out;
    //     it is logged in DEV, reported to Sentry, and otherwise swallowed.
    //   • RATE-LIMITED BY THE WATERMARK ALONE, deliberately not by the event
    //     name. Any resolution carrying a user is a candidate; the claim then
    //     runs at most once per user per `CLAIM_MIN_INTERVAL_MS`, and at most
    //     once per visit in memory. Gating on `SIGNED_IN` was REMOVED because it
    //     excluded every returning student — auth-js emits only
    //     `TOKEN_REFRESHED` once the stored token is inside its 90s expiry
    //     margin, which is every launch more than ~58.5 minutes apart. See the
    //     watermark block at module scope for the full reasoning, including why
    //     a signed-out → signed-in transition check cannot do this job either.
    //   • CACHE INVALIDATION — the claim races the post-sign-in navigation, so
    //     the enrolment queries can cache their (empty) result before it
    //     commits. With `staleTime` 5min and `refetchOnWindowFocus` off, the
    //     student would need a hard reload to see what they just got, which
    //     defeats the purpose. So a claim that actually attached rows
    //     invalidates the entitlement roots.

    // Which user this provider has already claimed for during THIS page
    // lifetime. Belt-and-braces beside the persisted watermark: a private-mode
    // or locked-down WebView where `localStorage` throws still gets exactly one
    // claim per visit instead of one per resume. Deliberately kept out of
    // `syncAuthState` — its refresh early-return would bury the trigger.
    let claimedThisVisitFor: string | null = null;

    // Reads the user id off ANY session shape without throwing. auth-js can
    // hand back a session whose `user` is `userNotAvailableProxy()`, whose get
    // trap throws — and a throw inside the subscriber would escape the auth
    // callback, dropping the event and stranding the provider in `loading`.
    const sessionUserId = (nextSession: Session | null): string | null => {
      try {
        return nextSession?.user?.id ?? null;
      } catch {
        return null;
      }
    };

    const claimPurchases = (userId: string) => {
      // The IN-MEMORY guard is set before firing, so duplicate emissions in the
      // same tick cannot both pass. The PERSISTED watermark is NOT set here —
      // it is written only once the RPC reports `eligible`, below.
      //
      // claim_my_purchases never raises on a refusal; it returns all zeros. So
      // stamping up-front burned the 6h window on calls that could not possibly
      // have claimed: an email or magic-link sign-in leaves auth.users.phone
      // NULL, returns zeros, and the MSG91 sign-in for the SAME user minutes
      // later — the one that WOULD have claimed — was then skipped silently.
      claimedThisVisitFor = userId;
      void (async () => {
        try {
          // Not in the generated supabase types yet; cast per the repo
          // convention (see pages/admin/AdminRevenue.tsx).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data, error } = await supabase.rpc("claim_my_purchases" as any);
          if (error) throw error;
          // SC-1 returns {claimed, stamped, blocked} precisely so the client can
          // act on it and so a rollout is observable. `blocked` counts purchases
          // deliberately withheld because an existing enrolment says the student
          // is not entitled (refunded / revoked / expired) — without it that case
          // is indistinguishable from "nothing to claim".
          const result = (data ?? {}) as {
            claimed?: number;
            stamped?: number;
            blocked?: number;
            eligible?: boolean;
          };
          const claimed = Number(result.claimed ?? 0);
          const stamped = Number(result.stamped ?? 0);
          const blocked = Number(result.blocked ?? 0);
          // Only a completed run for an identifiable caller burns the window.
          // A refusal leaves the watermark unset, so the next resolution for
          // this user — typically the phone-verified one — tries again.
          if (result.eligible === true) stampClaim(userId);
          if (import.meta.env.DEV) {
            console.info("[AuthContext] claim_my_purchases:", { claimed, stamped, blocked });
          }
          if (claimed > 0) {
            CLAIM_INVALIDATED_QUERY_ROOTS.forEach((root) => {
              void queryClient.invalidateQueries({ queryKey: [root] });
            });
          }
          // PRODUCTION signal, not DEV console noise. A status-blind guard
          // deliberately withholds real, paid purchases from anyone carrying a
          // refunded / revoked / lapsed enrolment; that is only defensible if a
          // refusal is observable. Logging it under import.meta.env.DEV alone
          // made a correct refusal and a silently broken claim identical in
          // prod, which is the whole reason the counter was added. Reported as
          // a message rather than an exception: nothing has gone wrong, it is a
          // deliberate refusal someone may need to act on. The rows stay
          // unstamped and claimable, so this is recoverable by design.
          if (blocked > 0) {
            void import("@/lib/sentry").then((m) =>
              m.captureMessage("claim_my_purchases withheld entitled rows", {
                scope: "claim_my_purchases",
                claimed,
                stamped,
                blocked,
              })
            );
          }
        } catch (err) {
          if (import.meta.env.DEV) console.error("[AuthContext] claim_my_purchases failed:", err);
          // A failed claim must not burn the window. The watermark is now only
          // written on an eligible success, so there is normally nothing to
          // undo — but clear defensively in case an earlier visit stamped it.
          // `claimedThisVisitFor` stays set, so a failing backend still cannot
          // turn every resume in this visit into another attempt.
          if (claimedThisVisitFor === userId) clearClaimWatermark();
          // Prod signal: without this a Tier-1 auth-path rollout is invisible
          // outside DEV. Dynamic import so unauthenticated pages don't pull
          // Sentry into their bundle (same pattern as `attachSentryUser`).
          void import("@/lib/sentry").then((m) =>
            m.captureException(err, { scope: "claim_my_purchases" })
          );
        }
      })();
    };

    void supabase.auth.getSession().then(({ data: { session: currentSession } }) =>
      syncAuthState(currentSession)
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        // Sync FIRST and unconditionally: nothing on the claim path may be able
        // to swallow an auth event.
        void syncAuthState(nextSession);

        const userId = sessionUserId(nextSession);
        if (!userId) {
          // Signed out, expired, or a session with no usable user. The next
          // sign-in on this device is a real one and must claim immediately
          // rather than wait out a window this user already spent.
          claimedThisVisitFor = null;
          clearClaimWatermark();
          return;
        }
        // DELIBERATELY NOT GATED ON THE EVENT NAME. Gating on "SIGNED_IN"
        // silently excluded the exact population this feature exists for.
        // Verified in node_modules/@supabase/auth-js 2.102.1: on a stored
        // session `_recoverAndRefresh` computes `expiresWithMargin`
        // (GoTrueClient.js:3508) against EXPIRY_MARGIN_MS = 3 x 30s = 90s
        // (lib/constants.js:13), and when true it calls `_callRefreshToken`
        // (:3512), which emits ONLY `TOKEN_REFRESHED`. The two `SIGNED_IN`
        // emissions (:3530, :3545) are in the not-expired branches and are
        // skipped. Supabase access tokens live 3600s and
        // `_onVisibilityChanged` re-enters the same path on every Capacitor
        // resume, so ANY cold start or resume more than ~58.5 minutes after the
        // last token issuance emits TOKEN_REFRESHED and never SIGNED_IN. A
        // fresh OTP sign-in still claimed; an already-signed-in returning
        // student never did — and it fails silently, because the migrations
        // land, the counters read zero, and it looks exactly like success.
        //
        // So the rate limit is the WATERMARK, which is what it was built to be:
        // at most one claim per user per CLAIM_MIN_INTERVAL_MS regardless of how
        // the session was resolved, plus the in-memory per-visit guard. Event
        // shape is an auth-js implementation detail; "we are holding a session
        // for this user and have not claimed for them recently" is the actual
        // condition. Worst case is unchanged at ~4 index-scan RPCs per user per
        // day; a TOKEN_REFRESHED storm cannot get past the watermark.
        if (claimedThisVisitFor === userId || claimedRecently(userId)) return;
        claimPurchases(userId);
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
    // Drop the claim watermark (SC-2) so whoever signs in next claims at once
    // instead of inheriting the window this user already spent.
    clearClaimWatermark();
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
