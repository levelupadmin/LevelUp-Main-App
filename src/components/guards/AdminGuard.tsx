import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth, AppRole } from "@/contexts/AuthContext";

const ADMIN_ROLES: AppRole[] = ["super_admin", "mentor"];

const useIsAdmin = () => {
  const { user, isLoading } = useAuth();
  const isAdmin = !!user && ADMIN_ROLES.includes(user.role);
  return { isAdmin, isLoading, role: user?.role ?? "student" };
};

const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin, isLoading } = useIsAdmin();

  if (isLoading) return null;

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default AdminGuard;
export { useIsAdmin };
