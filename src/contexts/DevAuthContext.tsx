import { createContext, useContext, useState, ReactNode } from "react";
import type { UserProfile, AppRole } from "@/contexts/AuthContext";

export type DevRole = "super_admin" | "mentor" | "student_enrolled" | "student_free";

const MOCK_PROFILES: Record<DevRole, UserProfile> = {
  super_admin: {
    id: "dev-super-admin",
    email: "admin@levelup.dev",
    name: "Dev Admin",
    avatar_url: "",
    bio: "Platform administrator",
    city: "Mumbai",
    role: "super_admin",
    roles: ["super_admin"],
    interests: [],
    experience: "5+ years",
    goal: "Manage platform",
    skills: ["Management"],
    availability: "full-time",
    social_links: {},
    has_completed_onboarding: true,
  },
  mentor: {
    id: "dev-mentor",
    email: "mentor@levelup.dev",
    name: "Dev Mentor",
    avatar_url: "",
    bio: "Course instructor",
    city: "Delhi",
    role: "mentor",
    roles: ["mentor"],
    interests: ["filmmaking"],
    experience: "10+ years",
    goal: "Teach",
    skills: ["Filmmaking", "Editing"],
    availability: "part-time",
    social_links: {},
    has_completed_onboarding: true,
  },
  student_enrolled: {
    id: "dev-student-enrolled",
    email: "student@levelup.dev",
    name: "Dev Student",
    avatar_url: "",
    bio: "Aspiring filmmaker",
    city: "Bangalore",
    role: "student",
    roles: ["student"],
    interests: ["filmmaking", "editing"],
    experience: "1-2 years",
    goal: "Learn filmmaking",
    skills: ["Premiere Pro"],
    availability: "weekends",
    social_links: {},
    has_completed_onboarding: true,
  },
  student_free: {
    id: "dev-student-free",
    email: "free@levelup.dev",
    name: "Dev Visitor",
    avatar_url: "",
    bio: "",
    city: "",
    role: "student",
    roles: ["student"],
    interests: [],
    experience: "",
    goal: "",
    skills: [],
    availability: "not-looking",
    social_links: {},
    has_completed_onboarding: true,
  },
};

interface DevAuthContextType {
  currentRole: DevRole;
  setRole: (role: DevRole) => void;
  user: UserProfile;
  isAdmin: boolean;
}

const DevAuthContext = createContext<DevAuthContextType | undefined>(undefined);

export const DevAuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentRole, setCurrentRole] = useState<DevRole>("student_free");

  const user = MOCK_PROFILES[currentRole];
  const isAdmin = currentRole === "super_admin" || currentRole === "mentor";

  return (
    <DevAuthContext.Provider value={{ currentRole, setRole: setCurrentRole, user, isAdmin }}>
      {children}
    </DevAuthContext.Provider>
  );
};

export const useDevAuth = () => {
  const ctx = useContext(DevAuthContext);
  if (!ctx) throw new Error("useDevAuth must be used within DevAuthProvider");
  return ctx;
};
