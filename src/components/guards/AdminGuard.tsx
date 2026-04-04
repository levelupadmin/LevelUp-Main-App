import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useDevAuth } from "@/contexts/DevAuthContext";
import { AppRole } from "@/contexts/AuthContext";

const ADMIN_ROLES: AppRole[] = ["super_admin", "mentor"];

const useIsAdmin = () => {
  const { user, isAdmin, currentRole } = useDevAuth();
  return { isAdmin, isLoading: false, role: user.role };
};

const AdminGuard = ({ children }: { children: ReactNode }) => {
  const { isAdmin } = useIsAdmin();

  if (!isAdmin) {
    return <Navigate to="/home" replace />;
  }

  return <>{children}</>;
};

export default AdminGuard;
export { useIsAdmin };
