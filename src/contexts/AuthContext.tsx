import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
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

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    const { data, error } = await supabase
      .from("users")
      .select("id, email, full_name, role, avatar_url, member_number")
      .eq("id", userId)
      .single();
    if (error) console.error("[AuthContext] fetchProfile error:", error);
    return (data as UserProfile | null) ?? null;
  };

  useEffect(() => {
    let isMounted = true;
    let hadSession = false;

    const syncAuthState = async (nextSession: Session | null) => {
      if (!isMounted) return;

      setLoading(true);
      setSession(nextSession);

      if (!nextSession?.user) {
        // If we previously had a session and now don't, it expired
        if (hadSession) {
          toast.error("Your session has expired. Please sign in again.");
        }
        setProfile(null);
        setLoading(false);
        return;
      }

      hadSession = true;
      const nextProfile = await fetchProfile(nextSession.user.id);

      if (!isMounted) return;

      setProfile(nextProfile);
      setLoading(false);
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
