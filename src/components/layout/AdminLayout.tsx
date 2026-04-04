import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Users, Shield, BarChart3,
  Clapperboard, GraduationCap, ArrowLeft, Briefcase, Settings,
  ChevronDown, Gift, Bell, TrendingUp, ShoppingBag,
} from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth, AppRole } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  path: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles: AppRole[];
}

const adminNav: NavItem[] = [
  { path: "/admin", label: "Dashboard", icon: LayoutDashboard, roles: ["super_admin", "mentor"] },
  { path: "/admin/hero", label: "Hero Slides", icon: Clapperboard, roles: ["super_admin"] },
  { path: "/admin/sales", label: "Sales Pages", icon: ShoppingBag, roles: ["super_admin", "mentor"] },
  { path: "/admin/courses", label: "Courses", icon: FileText, roles: ["super_admin", "mentor"] },
  { path: "/admin/coupons", label: "Coupons", icon: GraduationCap, roles: ["super_admin"] },
  { path: "/admin/referrals", label: "Referrals", icon: Gift, roles: ["super_admin"] },
  { path: "/admin/waitlists", label: "Waitlists", icon: Bell, roles: ["super_admin"] },
  { path: "/admin/engagement", label: "Engagement", icon: TrendingUp, roles: ["super_admin"] },
  { path: "/admin/opportunities", label: "Opportunities", icon: Briefcase, roles: ["super_admin"] },
  { path: "/admin/moderation", label: "Moderation", icon: Shield, roles: ["super_admin"] },
  { path: "/admin/users", label: "Users", icon: Users, roles: ["super_admin"] },
  { path: "/admin/analytics", label: "Analytics", icon: BarChart3, roles: ["super_admin", "mentor"] },
  { path: "/admin/settings", label: "Settings", icon: Settings, roles: ["super_admin"] },
];

const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  mentor: "Mentor",
  student: "Student",
};

const roleBadgeClass: Record<AppRole, string> = {
  super_admin: "bg-destructive/20 text-destructive-foreground border-destructive/30",
  mentor: "bg-[hsl(var(--highlight))]/20 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/30",
  student: "bg-secondary text-secondary-foreground border-border",
};

const AdminLayout = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const currentRole = (user?.role ?? "student") as AppRole;

  const visibleNav = adminNav.filter((item) => item.roles.includes(currentRole));

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-56 flex-col border-r border-border bg-card lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <button
            onClick={() => navigate("/home")}
            className="rounded-md p-1 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <img src={logo} alt="Level Up" className="h-6 w-6" />
          <span className="text-sm font-bold text-foreground">Admin</span>
          <Badge variant="outline" className={`ml-auto text-[10px] px-1.5 py-0 ${roleBadgeClass[currentRole]}`}>
            {roleLabel[currentRole]}
          </Badge>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {visibleNav.map((item) => {
            const isActive = location.pathname === item.path;
            const Icon = item.icon;
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))]"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-[18px] w-[18px]" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Dev Role Switcher */}
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center justify-between rounded-md px-3 py-2 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                <span>🛠 Switch Role</span>
                <ChevronDown className="h-3 w-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-44">
              {devRoleOptions.map((r) => (
                <DropdownMenuItem
                  key={r.value}
                  onClick={() => switchRole(r.value)}
                  className={currentRole === r.value ? "bg-secondary" : ""}
                >
                  {r.label}
                  {currentRole === r.value && <span className="ml-auto text-[hsl(var(--highlight))]">●</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Top Bar */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl lg:left-56">
        <div className="flex h-14 items-center px-4 lg:px-6">
          <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar lg:hidden">
            <button
              onClick={() => navigate("/home")}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-secondary"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            {visibleNav.map((item) => {
              const isActive = location.pathname === item.path;
              const Icon = item.icon;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))]"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>
          {/* Desktop: role switcher in header */}
          <div className="hidden lg:flex ml-auto">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                  🛠 {roleLabel[currentRole]}
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {devRoleOptions.map((r) => (
                  <DropdownMenuItem key={r.value} onClick={() => switchRole(r.value)} className={currentRole === r.value ? "bg-secondary" : ""}>
                    {r.label}
                    {currentRole === r.value && <span className="ml-auto text-[hsl(var(--highlight))]">●</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-14 lg:ml-56">
        <div className="mx-auto max-w-6xl p-4 lg:p-6">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminLayout;
