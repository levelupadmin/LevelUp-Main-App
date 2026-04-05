import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Loader2 } from "lucide-react";

const roleHomeMap: Record<string, string> = {
  admin: "/admin",
  instructor: "/instructor",
  student: "/home",
};

const RootRedirect = () => {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  const dest = roleHomeMap[profile?.role ?? "student"] || "/home";
  return <Navigate to={dest} replace />;
};

export default RootRedirect;
