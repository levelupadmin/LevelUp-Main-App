import { ReactNode } from "react";

// DEV MODE: No auth guard — always render children
const AuthGuard = ({ children }: { children: ReactNode }) => {
  return <>{children}</>;
};

export default AuthGuard;
export { useAuth } from "@/contexts/AuthContext";
