import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";

const ADMIN_ROLES: AppRole[] = ["super_admin", "mentor"];

const useIsAdmin = () => {
  const { user, isLoading } = useAuth();
  const role = user?.role || "student";
  const isAdmin = ADMIN_ROLES.includes(role);
  return { isAdmin, isLoading, role };
};

const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin, isLoading } = useIsAdmin();
  const { isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default AdminGuard;
export { useIsAdmin };
