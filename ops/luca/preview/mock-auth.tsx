import type { ReactNode } from "react";
import { who } from "./who";

/** Preview sign-in: whoever is picked in the preview's person switcher. */
export function useAuth() {
  const p = who();
  const user = { id: p.id, email: p.email, phone: null };
  const profile = { id: p.id, full_name: p.name, email: p.email, role: p.role, phone: null };
  return { user, profile, session: null, loading: false, signOut: async () => undefined, refreshProfile: async () => undefined };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
