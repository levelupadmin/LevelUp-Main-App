import { ReactNode, useState } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  BookOpen,
  Package,
  Users,
  UserCog,
  Ticket,
  ArrowLeft,
  Menu,
  X,
  Image,
  CalendarDays,
  Video,
  IndianRupee,
  Loader2,
  LogOut,
  ChevronDown,
} from "lucide-react";
import InitialsAvatar from "@/components/InitialsAvatar";
import LevelUpWordmark from "@/components/LevelUpWordmark";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
  { label: "Hero Slides", icon: Image, path: "/admin/hero-slides" },
  { label: "Courses", icon: BookOpen, path: "/admin/courses" },
  { label: "Offerings", icon: Package, path: "/admin/offerings" },
  { label: "Schedule Classes", icon: Video, path: "/admin/schedule" },
  { label: "Events", icon: CalendarDays, path: "/admin/events" },
  { label: "Enrolments", icon: Users, path: "/admin/enrolments" },
  { label: "Users", icon: UserCog, path: "/admin/users" },
  { label: "Coupons", icon: Ticket, path: "/admin/coupons" },
  { label: "Revenue", icon: IndianRupee, path: "/admin/revenue" },
];

interface Props {
  children: ReactNode;
  title?: string;
}

const AdminLayout = ({ children, title }: Props) => {
  const { profile, signOut, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!profile || profile.role !== "admin") {
    return <Navigate to="/home" replace />;
  }

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  /* ─── Sidebar content (shared between desktop & mobile) ─── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo + Admin badge */}
      <div className="p-6 flex items-center gap-3">
        <LevelUpWordmark />
        <span className="inline-block text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            onClick={() => setSidebarOpen(false)}
            className={cn(
              "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
              isActive(item.path)
                ? "text-foreground bg-surface-2 border-l-2 border-cream"
                : "text-muted-foreground hover:text-foreground hover:bg-surface"
            )}
          >
            <item.icon className="h-[18px] w-[18px] shrink-0" />
            {item.label}
          </Link>
        ))}

        <div className="my-3 border-t border-border" />

        <Link
          to="/home"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
        >
          <ArrowLeft className="h-[18px] w-[18px]" />
          Student View
        </Link>
      </nav>

      {/* Bottom profile */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <InitialsAvatar name={profile?.full_name ?? "A"} size={32} />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{profile?.full_name || "Admin"}</p>
            <p className="text-xs font-mono text-muted-foreground">
              #{profile?.member_number ?? "—"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] min-w-[260px] border-r border-border bg-canvas sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-canvas border-r border-border flex flex-col">
            <div className="flex items-center justify-between p-6">
              <div className="flex items-center gap-3">
                <LevelUpWordmark />
                <span className="inline-block text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
                  Admin
                </span>
              </div>
              <button onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <nav className="flex-1 px-3 space-y-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
                    isActive(item.path)
                      ? "text-foreground bg-surface-2 border-l-2 border-cream"
                      : "text-muted-foreground hover:text-foreground hover:bg-surface"
                  )}
                >
                  <item.icon className="h-[18px] w-[18px] shrink-0" />
                  {item.label}
                </Link>
              ))}

              <div className="my-3 border-t border-border" />

              <Link
                to="/home"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
                Student View
              </Link>
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-16 flex items-center justify-between px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <button
              className="md:hidden text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">{title || ""}</h1>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to="/home"
              className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-md text-sm text-muted-foreground hover:text-foreground hover:border-border-hover transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Student View</span>
            </Link>

            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 min-h-[44px]"
              >
                <InitialsAvatar name={profile?.full_name ?? "A"} size={32} />
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
                    <button
                      onClick={() => { setDropdownOpen(false); navigate("/home"); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors min-h-[44px] sm:hidden"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Student View
                    </button>
                    <button
                      onClick={async () => { await signOut(); navigate("/login"); }}
                      className="flex items-center gap-2 w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors min-h-[44px]"
                    >
                      <LogOut className="h-4 w-4" />
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 grain">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-10 relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
