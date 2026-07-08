import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import RouteFallback from "@/components/RouteFallback";

// Access decision (P6-T4 contract — must stay byte-identical to pre-cache):
//   loading → branded fallback (never protected content); no session → bounce
//   to /login preserving `from`; else render children. The profile-row cache
//   only changes WHEN `loading` flips false on a cold start (a returning user's
//   cached profile lets AuthContext resolve `loading` without a round-trip); it
//   never grants a session, so a logged-out visitor still hits the redirect
//   below with no protected-content flash. No change needed here.
const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const { session, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    // Branded skeleton (on --canvas) instead of a black screen + spinner, so
    // the auth gate doesn't flash a "frozen app" while the session resolves.
    return <RouteFallback />;
  }

  if (!session && !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default RequireAuth;
