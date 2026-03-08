import { ReactNode } from "react";
import { Navigate } from "react-router-dom";

// TODO: Replace with real role check from Lovable Cloud
const useIsAdmin = () => {
  // Placeholder: always admin for now
  return { isAdmin: true, isLoading: false };
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
