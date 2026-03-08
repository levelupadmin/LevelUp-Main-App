import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type AppRole = "student" | "mentor" | "super_admin";

export interface UserProfile {
  phone?: string;
  email?: string;
  name: string;
  avatar: string;
  bio: string;
  city: string;
  role: AppRole;
  roles: string[];
  interests: string[];
  experience: string;
  goal: string;
  skills: string[];
  availability: "open-to-work" | "open-to-collaborate" | "not-looking";
  socialLinks: { instagram?: string; youtube?: string; linkedin?: string };
  portfolio: { id: string; title: string; thumbnail: string; appreciations: number }[];
}

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  hasCompletedOnboarding: boolean;
  user: UserProfile | null;
}

interface AuthContextType extends AuthState {
  login: (method: "phone" | "email" | "google", identifier?: string) => void;
  logout: () => void;
  completeOnboarding: (data: { interests: string[]; experience: string; goal: string }) => void;
  updateProfile: (data: Partial<UserProfile>) => void;
}

const defaultUser: UserProfile = {
  name: "Arjun Mehta",
  avatar: "",
  bio: "Aspiring filmmaker | Learning cinematography | Mumbai 🎬",
  city: "Mumbai",
  roles: ["Filmmaker"],
  interests: [],
  experience: "",
  goal: "",
  skills: ["Premiere Pro", "DaVinci Resolve", "Color Grading"],
  availability: "open-to-collaborate",
  socialLinks: {},
  portfolio: [
    { id: "p1", title: "Golden Hour – Short Film", thumbnail: "", appreciations: 42 },
    { id: "p2", title: "City Rhythms – Documentary", thumbnail: "", appreciations: 28 },
    { id: "p3", title: "Monsoon Diaries", thumbnail: "", appreciations: 15 },
    { id: "p4", title: "Street Food Stories", thumbnail: "", appreciations: 63 },
  ],
};

const STORAGE_KEY = "levelup_auth";

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AuthState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { isAuthenticated: false, isLoading: false, hasCompletedOnboarding: false, user: null };
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const login = (method: "phone" | "email" | "google", identifier?: string) => {
    const user: UserProfile = {
      ...defaultUser,
      ...(method === "phone" ? { phone: identifier } : {}),
      ...(method === "email" ? { email: identifier } : {}),
    };
    setState((s) => ({ ...s, isAuthenticated: true, user: s.user ?? user }));
  };

  const logout = () => {
    localStorage.removeItem(STORAGE_KEY);
    setState({ isAuthenticated: false, isLoading: false, hasCompletedOnboarding: false, user: null });
  };

  const completeOnboarding = (data: { interests: string[]; experience: string; goal: string }) => {
    setState((s) => ({
      ...s,
      hasCompletedOnboarding: true,
      user: s.user ? { ...s.user, interests: data.interests, experience: data.experience, goal: data.goal } : null,
    }));
  };

  const updateProfile = (data: Partial<UserProfile>) => {
    setState((s) => ({
      ...s,
      user: s.user ? { ...s.user, ...data } : null,
    }));
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout, completeOnboarding, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};
