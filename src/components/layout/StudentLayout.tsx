import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InitialsAvatar from "@/components/InitialsAvatar";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import NotificationDropdown from "@/components/NotificationDropdown";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Home, BookOpen, Compass, MessageSquare, User,
  Menu, X, Bell, LogOut, ChevronDown, Shield, Video, Calendar, BarChart3
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "My Courses", icon: BookOpen, path: "/my-courses" },
  { label: "Sessions", icon: Video, path: "/my-sessions" },
  { label: "Browse", icon: Compass, path: "/browse" },
  { label: "Events", icon: Calendar, path: "/events" },
  { label: "Community", icon: MessageSquare, path: "/community" },
  { label: "Profile", icon: User, path: "/profile" },
];

// Mobile bottom bar: max 5 items to avoid cramping on small screens
const MOBILE_NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "My Courses", icon: BookOpen, path: "/my-courses" },
  { label: "Browse", icon: Compass, path: "/browse" },
  { label: "Sessions", icon: Video, path: "/my-sessions" },
  { label: "Profile", icon: User, path: "/profile" },
];

interface Props {
  children: React.ReactNode;
  title?: string;
}

const StudentLayout = ({ children, title }: Props) => {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const { notifications, unreadCount, loading: notifLoading, markRead, markAllRead } = useNotifications();

  const firstName = profile?.full_name?.split(" ")[0] ?? "Student";

  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-surface focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>
      {/* Desktop sidebar - visible at md+ (768px) */}
      <aside className="hidden md:flex flex-col w-[260px] min-w-[260px] border-r border-border bg-canvas sticky top-0 h-screen">
        <div className="p-6">
          <LevelUpWordmark />
        </div>

        <nav aria-label="Main navigation" className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
                  active
                    ? "text-foreground bg-surface-2 border-l-2 border-cream"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                )}
              >
                <item.icon className="h-[18px] w-[18px]" />
                {item.label}
              </Link>
            );
          })}

          {profile?.role === "admin" && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to="/admin"
                className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-colors"
              >
                <Shield className="h-[18px] w-[18px]" />
                Admin Dashboard
              </Link>
            </>
          )}

          {profile?.role === "instructor" && (
            <>
              <div className="my-3 border-t border-border" />
              <Link to="/instructor" className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-colors">
                <BarChart3 className="h-[18px] w-[18px]" />
                Instructor Dashboard
              </Link>
            </>
          )}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <InitialsAvatar name={profile?.full_name ?? "U"} photoUrl={profile?.avatar_url} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{firstName}</p>
              <p className="text-xs font-mono text-muted-foreground">
                #{profile?.member_number ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-canvas border-r border-border flex flex-col">
            <div className="flex items-center justify-between p-6">
              <LevelUpWordmark />
              <button aria-label="Close menu" onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <nav aria-label="Main navigation" className="flex-1 px-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2",
                      active ? "text-foreground bg-surface-2" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </Link>
                );
              })}

              {profile?.role === "admin" && (
                <>
                  <div className="my-3 border-t border-border" />
                  <Link
                    to="/admin"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-colors"
                  >
                    <Shield className="h-[18px] w-[18px]" />
                    Admin Dashboard
                  </Link>
                </>
              )}

              {profile?.role === "instructor" && (
                <>
                  <div className="my-3 border-t border-border" />
                  <Link
                    to="/instructor"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-md text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-colors"
                  >
                    <BarChart3 className="h-[18px] w-[18px]" />
                    Instructor Dashboard
                  </Link>
                </>
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-16 flex items-center justify-between px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <button aria-label="Open menu" className="md:hidden text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                aria-label="Notifications"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <Bell className="h-5 w-5" />
                {notifLoading ? (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-gray-400" />
                ) : unreadCount > 0 ? (
                  <span className="absolute top-1.5 right-1.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-red-500 rounded-full">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </button>
              <NotificationDropdown
                open={notifOpen}
                onClose={() => setNotifOpen(false)}
                notifications={notifications}
                unreadCount={unreadCount}
                loading={notifLoading}
                onMarkRead={markRead}
                onMarkAllRead={markAllRead}
              />
            </div>

            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 min-h-[44px]"
              >
                <InitialsAvatar name={profile?.full_name ?? "U"} photoUrl={profile?.avatar_url} size={32} />
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
                  <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
                    {profile?.role === "admin" && (
                      <button
                        onClick={() => { setDropdownOpen(false); navigate("/admin"); }}
                        className="flex items-center gap-2 w-full px-4 py-2 text-sm text-[hsl(var(--accent-amber))] hover:bg-surface-2 transition-colors min-h-[44px]"
                      >
                        <Shield className="h-4 w-4" />
                        Admin Dashboard
                      </button>
                    )}
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
        <main id="main-content" className="flex-1 grain pb-20 md:pb-0">
          <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-10 relative z-10 page-enter">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav aria-label="Mobile navigation" className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-canvas border-t border-border flex items-stretch">
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2",
                active ? "text-cream" : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default StudentLayout;
