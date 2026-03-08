import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, FileText, Users, Shield, BarChart3, Clapperboard, GraduationCap, ArrowLeft } from "lucide-react";
import logo from "@/assets/logo.png";

const adminNav = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { path: "/admin/content", label: "Content", icon: FileText },
  { path: "/admin/workshops", label: "Workshops", icon: Clapperboard },
  { path: "/admin/cohorts", label: "Cohorts", icon: GraduationCap },
  { path: "/admin/moderation", label: "Moderation", icon: Shield },
  { path: "/admin/users", label: "Users", icon: Users },
  { path: "/admin/analytics", label: "Analytics", icon: BarChart3 },
];

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Admin Sidebar - Desktop */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-56 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <button
            onClick={() => navigate("/home")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <img src={logo} alt="Level Up" className="h-6 w-6" />
          <span className="text-sm font-bold text-gradient">Admin</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {adminNav.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Admin Top Bar */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl lg:left-56">
        <div className="flex h-14 items-center px-4 lg:px-6">
          {/* Mobile: show nav horizontally */}
          <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar lg:hidden">
            <button
              onClick={() => navigate("/home")}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {adminNav.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-14 lg:ml-56">
        <div className="mx-auto max-w-5xl p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
