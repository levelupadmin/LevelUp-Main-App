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
  IndianRupee,
} from "lucide-react";
import InitialsAvatar from "@/components/InitialsAvatar";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
  { label: "Hero Slides", icon: Image, path: "/admin/hero-slides" },
  { label: "Courses", icon: BookOpen, path: "/admin/courses" },
  { label: "Offerings", icon: Package, path: "/admin/offerings" },
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
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isActive = (path: string) =>
    path === "/admin"
      ? location.pathname === "/admin"
      : location.pathname.startsWith(path);

  /* ─── Desktop sidebar ─── */
  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Wordmark */}
      <div className="px-5 pt-6 pb-4">
        <span className="font-mono text-sm uppercase tracking-[0.15em] text-[hsl(var(--accent-amber))]">
          LevelUp Admin
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
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors",
              isActive(item.path)
                ? "bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))] font-medium"
                : "text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}

        <div className="my-4 border-t border-border" />

        <Link
          to="/home"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to app
        </Link>
      </nav>

      {/* Bottom profile */}
      {profile && (
        <div className="px-4 py-4 border-t border-border flex items-center gap-3">
          <InitialsAvatar name={profile.full_name || "A"} size={32} />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{profile.full_name || "Admin"}</p>
            <span className="inline-block text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
              {profile.role}
            </span>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[260px] shrink-0 border-r border-border bg-card flex-col fixed inset-y-0 left-0 z-30">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[260px] bg-card border-r border-border">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute top-4 right-4 text-muted-foreground"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main area */}
      <div className="flex-1 lg:ml-[260px] flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="h-16 sticky top-0 z-20 bg-background/80 backdrop-blur border-b border-border flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">{title || ""}</h1>
          </div>
          <button
            onClick={() => navigate("/home")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Student view
          </button>
        </header>

        <main className="flex-1 w-full max-w-[1440px] mx-auto px-4 lg:px-8 py-8">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
