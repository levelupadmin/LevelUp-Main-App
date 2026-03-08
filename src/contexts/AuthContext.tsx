import { createContext, useContext, useState, useEffect, ReactNode } from "react";
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
  signUp: (email: string, password: string, fullName?: string) => Promise<{ error: string | null }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  logout: () => Promise<void>;
  completeOnboarding: (data: { interests: string[]; experience: string; goal: string }) => Promise<void>;
  updateProfile: (data: Partial<UserProfile>) => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

async function fetchProfile(userId: string): Promise<UserProfile | null> {
  const [{ data: profile }, { data: roleData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId),
  ]);

  if (!profile) return null;

  // Get highest-priority role
  const roles = (roleData || []).map((r: any) => r.role as AppRole);
  const primaryRole: AppRole =
    roles.includes("super_admin") ? "super_admin" :
    roles.includes("mentor") ? "mentor" : "student";

  return {
    id: profile.id,
    email: undefined, // filled from auth user
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

  const loadUser = async (session: Session | null) => {
    if (!session?.user) {
      setState({ isAuthenticated: false, isLoading: false, hasCompletedOnboarding: false, user: null, session: null });
      return;
    }
    const profile = await fetchProfile(session.user.id);
    if (profile) {
      profile.email = session.user.email;
      profile.phone = session.user.phone;
    }
    setState({
      isAuthenticated: true,
      isLoading: false,
      hasCompletedOnboarding: profile?.has_completed_onboarding || false,
      user: profile,
      session,
    });
  };

  useEffect(() => {
    // Listen FIRST, then get session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Use setTimeout to avoid Supabase deadlock on initial load
      setTimeout(() => loadUser(session), 0);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      loadUser(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName?: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName || "" },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error?.message || null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message || null };
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
    setState((s) => ({
      ...s,
      hasCompletedOnboarding: true,
      user: s.user ? { ...s.user, interests: data.interests, experience: data.experience, goal: data.goal, has_completed_onboarding: true } : null,
    }));
  };

  const updateProfile = async (data: Partial<UserProfile>) => {
    if (!state.session?.user) return;
    // Map frontend fields to DB columns
    const dbData: Record<string, any> = {};
    if (data.name !== undefined) dbData.name = data.name;
    if (data.bio !== undefined) dbData.bio = data.bio;
    if (data.city !== undefined) dbData.city = data.city;
    if (data.roles !== undefined) dbData.roles = data.roles;
    if (data.skills !== undefined) dbData.skills = data.skills;
    if (data.availability !== undefined) dbData.availability = data.availability;
    if (data.social_links !== undefined) dbData.social_links = data.social_links;
    if (data.avatar_url !== undefined) dbData.avatar_url = data.avatar_url;
    if (data.interests !== undefined) dbData.interests = data.interests;
    if (data.experience !== undefined) dbData.experience = data.experience;
    if (data.goal !== undefined) dbData.goal = data.goal;

    if (Object.keys(dbData).length > 0) {
      await supabase.from("profiles").update(dbData).eq("id", state.session.user.id);
    }
    setState((s) => ({
      ...s,
      user: s.user ? { ...s.user, ...data } : null,
    }));
  };

  const refreshProfile = async () => {
    if (state.session) await loadUser(state.session);
  };

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, logout, completeOnboarding, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
