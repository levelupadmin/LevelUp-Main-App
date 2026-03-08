import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Shield, BarChart3, Clapperboard, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";

const adminNav = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/content", label: "Content", icon: FileText },
  { path: "/admin/workshops", label: "Workshops", icon: Clapperboard },
  { path: "/admin/moderation", label: "Moderation", icon: Shield },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Top Bar */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border bg-background/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/home")}
              className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <img src={logo} alt="Level Up" className="h-7 w-7" />
            <span className="font-display text-lg font-bold text-gradient">Admin</span>
          </div>
        </div>
      </header>

      {/* Admin horizontal nav (mobile-first scrollable) */}
      <nav className="fixed top-[57px] left-0 right-0 z-40 border-b border-border bg-card/95 backdrop-blur-lg">
        <div className="mx-auto max-w-5xl overflow-x-auto hide-scrollbar">
          <div className="flex items-center gap-1 px-4 py-2">
            {adminNav.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 pb-8 pt-28">
        {children}
      </main>
    </div>
  );
};

export default AdminLayout;
