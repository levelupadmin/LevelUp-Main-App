import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ForbiddenScreen from "@/components/ForbiddenScreen";
import RouteFallback from "@/components/RouteFallback";
import { ADMIN_ROLES, canAccessRoute } from "@/lib/permissions";

interface Props {
  role: "admin" | "instructor" | "student";
  children: React.ReactNode;
}

// Role gate (P6-T4 contract): on a cold start this may briefly evaluate the
// role from AuthContext's cached profile row. That is safe because the decision
// is re-run on every render: when the background revalidation lands a fresh row
// (e.g. a role DOWNGRADE from admin → student), AuthContext calls setProfile,
// this component re-renders, and the checks below re-evaluate against the new
// role — so a downgraded user is redirected / shown Forbidden even if the stale
// cached role allowed them through for a frame. Covered by the role-downgrade
// case in AuthContext.authgate.test.ts.
const RequireRole = ({ role, children }: Props) => {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading || !profile) {
    return <RouteFallback />;
  }

  // For admin routes, allow any ADMIN_ROLES member, then check route access
  if (role === "admin") {
    if (!ADMIN_ROLES.includes(profile.role)) {
      return <ForbiddenScreen />;
    }
    if (!canAccessRoute(profile.role, location.pathname)) {
      return <Navigate to="/admin" replace />;
    }
    return <>{children}</>;
  }

  if (profile.role !== role) {
    return <ForbiddenScreen />;
  }

  return <>{children}</>;
};

export default RequireRole;
