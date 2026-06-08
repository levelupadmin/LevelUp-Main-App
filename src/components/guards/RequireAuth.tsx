import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import RouteFallback from "@/components/RouteFallback";

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
