import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

// TODO: Replace with real auth state from Lovable Cloud
const useAuth = () => {
  // Placeholder: always authenticated for now
  return { isAuthenticated: true, isLoading: false };
};

const AuthGuard = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;

  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default AuthGuard;
export { useAuth };
