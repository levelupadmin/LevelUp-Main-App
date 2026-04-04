import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { useDevAuth } from "@/contexts/DevAuthContext";

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

  const roles = (roleData || []).map((r: any) => r.role as AppRole);
  const primaryRole: AppRole =
    roles.includes("super_admin") ? "super_admin" :
    roles.includes("mentor") ? "mentor" : "student";

  return {
    id: profile.id,
    email: undefined,
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
  // In dev mode we provide a fake authenticated state using DevAuthContext
  // The actual dev user comes from DevAuthProvider which wraps AuthProvider in App.tsx

  const [state, setState] = useState<AuthState>({
    isAuthenticated: true, // DEV MODE: always authenticated
    isLoading: false,      // DEV MODE: never loading
    hasCompletedOnboarding: true,
    user: null,
    session: null,
  });

  // We no longer listen to real auth in dev mode, but keep the functions for interface compat
  const signUp = async (_email: string, _password: string, _fullName?: string) => {
    return { error: null };
  };

  const signIn = async (_email: string, _password: string) => {
    return { error: null };
  };

  const logout = async () => {};

  const completeOnboarding = async (_data: { interests: string[]; experience: string; goal: string }) => {};

  const updateProfile = async (_data: Partial<UserProfile>) => {};

  const refreshProfile = async () => {};

  return (
    <AuthContext.Provider value={{ ...state, signUp, signIn, logout, completeOnboarding, updateProfile, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");

  // In dev mode, pull user from DevAuthContext
  const devCtx = useDevAuth();
  return {
    ...ctx,
    isAuthenticated: true,
    isLoading: false,
    hasCompletedOnboarding: true,
    user: devCtx.user,
  };
};
