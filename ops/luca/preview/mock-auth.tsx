import type { ReactNode } from "react";

/** Preview sign-in: always the demo's staff learner. */
const user = { id: "00000000-0000-0000-0000-00000000000a", email: "staff@example.com", phone: null };
const profile = { id: user.id, full_name: "Diya Sharma", email: user.email, role: "admin", phone: null };

export function useAuth() {
  return { user, profile, session: null, loading: false, signOut: async () => undefined, refreshProfile: async () => undefined };
}
export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
