import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

export type AppRole = "student" | "mentor" | "super_admin";

export interface UserProfile {
  id: string;
  email?: string;
  phone?: string;
  name: string;
  avatar_url: string;
  bio: string;
  city: string;
  role: AppRole;
  roles: string[];
  interests: string[];
  experience: string;
  goal: string;
  skills: string[];
  availability: string;
  social_links: { instagram?: string; youtube?: string; linkedin?: string };
  has_completed_onboarding: boolean;
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  user: UserProfile | null;
  session: Session | null;
}

interface AuthContextType extends AuthState {
  sendOtp: (method: "email" | "phone", value: string, meta?: Record<string, any>) => Promise<{ error: string | null }>;
  verifyOtp: (method: "email" | "phone", value: string, token: string) => Promise<{ error: string | null }>;
  verifyPhoneUpdate: (phone: string, token: string) => Promise<{ error: string | null }>;
  updateUserPhone: (phone: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  completeOnboarding: (data: { interests: string[]; experience: string; goal: string }) => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string, email?: string, phone?: string): Promise<UserProfile | null> {
  const [{ data: profile }, { data: roleData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (!profile) return null;

  const roles = (roleData || []).map((r: any) => r.role as AppRole);
  const primaryRole: AppRole =
    roles.includes("super_admin") ? "super_admin" :
    roles.includes("mentor") ? "mentor" : "student";

  return {
    id: profile.id,
    email: email,
    phone: phone || profile.phone || undefined,
    name: profile.name || "",
    avatar_url: profile.avatar_url || "",
    bio: profile.bio || "",
    city: profile.city || "",
    role: primaryRole,
    roles: profile.roles || [],
    interests: profile.interests || [],
    experience: profile.experience || "",
    goal: profile.goal || "",
    skills: profile.skills || [],
    availability: profile.availability || "not-looking",
    social_links: (profile.social_links as any) || {},
    has_completed_onboarding: profile.has_completed_onboarding || false,
  };
}

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    isLoading: true,
    hasCompletedOnboarding: false,
    user: null,
    session: null,
  });

  const loadUser = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setState({ isAuthenticated: false, isLoading: false, hasCompletedOnboarding: false, user: null, session: null });
      return;
    }
    const profile = await fetchProfile(session.user.id, session.user.email, session.user.phone);
    setState({
      isAuthenticated: true,
      isLoading: false,
      hasCompletedOnboarding: profile?.has_completed_onboarding || false,
      user: profile,
      session,
    });
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      loadUser(session);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadUser(session);
    });

    return () => subscription.unsubscribe();
  }, [loadUser]);

  const sendOtp = async (method: "email" | "phone", value: string, meta?: Record<string, any>) => {
    try {
      const opts: any = method === "email"
        ? { email: value, options: { data: meta } }
        : { phone: value, options: { data: meta } };

      const { error } = await supabase.auth.signInWithOtp(opts);
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Failed to send OTP" };
    }
  };

  const verifyOtp = async (method: "email" | "phone", value: string, token: string) => {
    try {
      const opts: any = method === "email"
        ? { email: value, token, type: "email" as const }
        : { phone: value, token, type: "sms" as const };

      const { error } = await supabase.auth.verifyOtp(opts);
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Failed to verify OTP" };
    }
  };

  const updateUserPhone = async (phone: string) => {
    try {
      const { error } = await supabase.auth.updateUser({ phone });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Failed to update phone" };
    }
  };

  const verifyPhoneUpdate = async (phone: string, token: string) => {
    try {
      const { error } = await supabase.auth.verifyOtp({ phone, token, type: "phone_change" });
      if (error) return { error: error.message };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Failed to verify phone" };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setState({ isAuthenticated: false, isLoading: false, hasCompletedOnboarding: false, user: null, session: null });
  };

  const completeOnboarding = async (data: { interests: string[]; experience: string; goal: string }) => {
    if (!state.session?.user) return;
    await supabase.from("profiles").update({
      interests: data.interests,
      experience: data.experience,
      goal: data.goal,
      has_completed_onboarding: true,
    }).eq("id", state.session.user.id);
    setState(prev => ({ ...prev, hasCompletedOnboarding: true, user: prev.user ? { ...prev.user, ...data, has_completed_onboarding: true } : prev.user }));
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!state.session?.user) return;
    const { social_links, ...rest } = data;
    await supabase.from("profiles").update({
      ...rest,
      ...(social_links ? { social_links } : {}),
    }).eq("id", state.session.user.id);
    setState(prev => ({ ...prev, user: prev.user ? { ...prev.user, ...data } : prev.user }));
  };

  const refreshProfile = async () => {
    if (state.session) await loadUser(state.session);
  };

  return (
    <AuthContext.Provider value={{ ...state, sendOtp, verifyOtp, verifyPhoneUpdate, updateUserPhone, logout, completeOnboarding, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
