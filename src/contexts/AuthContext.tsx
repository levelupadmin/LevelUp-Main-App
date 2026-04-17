import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { toast } from "sonner";

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
//   1. `safeHostname` — even if someone accidentally ships a dev build
//      (or flips the env var in a prod build), refuse to activate the
//      bypass unless the page is served from localhost / 127.0.0.1 /
//      an IPv6 loopback. This prevents a compromised build pipeline
//      from turning every visitor into an admin.
//
//   2. `console.error` + banner — any time the bypass is active we
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
    "dev flags — investigate immediately."
  );
}

if (DEV_BYPASS) {
  // eslint-disable-next-line no-console
  console.warn(
    "%c[AuthContext] DEV ADMIN BYPASS ACTIVE",
    "background:#ff0;color:#000;font-weight:bold;padding:2px 6px;",
    "— real authentication is disabled. DO NOT SHIP."
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
    DEV ADMIN BYPASS ACTIVE — auth is disabled. Unset VITE_DEV_ADMIN_BYPASS before deploying.
  </div>
);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUserIdRef = useRef<string | null>(null);

  // Dev bypass — skip Supabase auth entirely (localhost only, see
  // runtime guards above).
  if (DEV_BYPASS) {
    return (
      <AuthContext.Provider value={{ session: null, user: DEV_USER, profile: DEV_PROFILE, loading: false, signOut: async () => {} }}>
        <DevBypassBanner />
        {children}
      </AuthContext.Provider>
    );
  }

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, role, avatar_url, member_number, bio, city, occupation")
      .eq("id", userId)
      .single();
    if (error && import.meta.env.DEV) console.error("[AuthContext] fetchProfile error:", error);
    return (data as UserProfile | null) ?? null;
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
        setLoading(false);
        initialLoadDone = true;
        return;
      }

      hadSession = true;

      // If this is a background token refresh and the user id hasn't
      // changed, skip the profile refetch entirely — nothing to update.
      if (initialLoadDone && currentUserIdRef.current === nextSession.user.id) {
        return;
      }
      currentUserIdRef.current = nextSession.user.id;

      const nextProfile = await fetchProfile(nextSession.user.id);

      if (!isMounted) return;

      setProfile(nextProfile);
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
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
