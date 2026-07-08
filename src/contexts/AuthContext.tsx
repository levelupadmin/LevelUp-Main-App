import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "@/lib/toast";

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

    const syncAuthState = async (nextSession: Session | null) => {
      if (!isMounted) return;

      // Only show the loading spinner on initial page load.
      // Subsequent auth events (token refresh on tab switch) update
      // session/profile silently so form state is never lost.
      if (!initialLoadDone) {
        setLoading(true);
      }

      setSession(nextSession);

      if (!nextSession?.user) {
        if (hadSession) {
          toast.error("Your session has expired. Please sign in again.");
        }
        currentUserIdRef.current = null;
        setProfile(null);
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

      const result = await fetchProfile(nextSession.user.id);

      if (!isMounted) return;

      if (result.ok && result.profile === null) {
        // Soft-deleted account inside the grace window: the session
        // minted but RLS returns no profile row, which would leave the
        // app half-working (RequireAuth passes, every profile-driven
        // surface breaks). Sign out instead. Resetting hadSession first
        // keeps the SIGNED_OUT event below from also firing the generic
        // "session expired" toast, and because sign-out clears the
        // session this branch cannot re-enter in a loop.
        hadSession = false;
        currentUserIdRef.current = null;
        setProfile(null);
        setLoading(false);
        initialLoadDone = true;
        toast.error("This account is scheduled for deletion. Contact support to recover it.");
        void supabase.auth.signOut();
        return;
      }

      setProfile(result.ok ? result.profile : null);
      // Attach the current user identity to Sentry so error reports
      // can be filtered + searched by who hit them. Dynamic import so
      // unauthenticated pages don't pull Sentry into their bundle.
      void import("@/lib/sentry").then((m) =>
        m.setSentryUser({ id: nextSession.user.id, email: nextSession.user.email ?? null })
      );
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
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
