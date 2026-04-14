import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import ForbiddenScreen from "@/components/ForbiddenScreen";
import { Loader2 } from "lucide-react";
import { ADMIN_ROLES, canAccessRoute } from "@/lib/permissions";

interface Props {
  role: "admin" | "instructor" | "student";
  children: React.ReactNode;
}

const RequireRole = ({ role, children }: Props) => {
  const { profile, loading } = useAuth();
  const location = useLocation();

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
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
