import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InitialsAvatar from "@/components/InitialsAvatar";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import {
  Home, BookOpen, Compass, MessageSquare, User, Settings,
  Menu, X, Search, Bell, LogOut, ChevronDown, Shield
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "My Courses", icon: BookOpen, path: "/my-courses" },
  { label: "Browse", icon: Compass, path: "/browse" },
  { label: "Community", icon: MessageSquare, path: "/community" },
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

  const firstName = profile?.full_name?.split(" ")[0] ?? "Student";

  return (
    <div className="flex min-h-screen bg-canvas">
      {/* Desktop sidebar - visible at md+ (768px) */}
      <aside className="hidden md:flex flex-col w-[260px] min-w-[260px] border-r border-border bg-canvas sticky top-0 h-screen">
        <div className="p-6">
          <LevelUpWordmark />
        </div>

        <nav className="flex-1 px-3 space-y-1">
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
            <button className="text-muted-foreground hover:text-foreground">
              <Settings className="h-4 w-4" />
            </button>
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
              <button onClick={() => setSidebarOpen(false)}>
                <X className="h-5 w-5 text-muted-foreground" />
              </button>
            </div>
            <nav className="flex-1 px-3 space-y-1">
              {NAV_ITEMS.map((item) => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-md text-sm transition-colors",
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
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-40 h-16 flex items-center justify-between px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-lg">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>

          <div className="flex items-center gap-3">
            <button className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-surface border border-border rounded-md text-sm text-muted-foreground hover:border-border-hover transition-colors">
              <Search className="h-4 w-4" />
              <span>Search</span>
              <kbd className="font-mono text-xs text-muted-foreground ml-2">⌘K</kbd>
            </button>

            <button className="relative text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center">
              <Bell className="h-5 w-5" />
            </button>

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
        <main className="flex-1 grain pb-20 md:pb-0">
          <div className="max-w-[1280px] mx-auto px-4 md:px-8 py-6 md:py-10 relative z-10">
            {children}
          </div>
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-canvas border-t border-border flex items-stretch">
        {NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[10px] font-medium transition-colors",
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
