import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const roleHomeMap: Record<string, string> = {
  admin: "/admin",
  instructor: "/instructor",
  student: "/home",
};

interface Props {
  role: "admin" | "instructor" | "student";
  children: React.ReactNode;
}

const RequireRole = ({ role, children }: Props) => {
  const { profile, loading } = useAuth();

  if (loading || !profile) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile.role !== role) {
    const redirect = roleHomeMap[profile.role] || "/home";
    return <Navigate to={redirect} replace />;
  }

  return <>{children}</>;
};

export default RequireRole;
