import { Suspense, useState, useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import InitialsAvatar from "@/components/InitialsAvatar";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import NotificationDropdown from "@/components/NotificationDropdown";
import Footer from "@/components/Footer";
import { useNotifications } from "@/hooks/useNotifications";
import {
  Home, BookOpen, MessageSquare, User,
  Menu, X, Bell, LogOut, ChevronDown, Shield, Video, Calendar, BarChart3, Loader2, Sparkles
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useActiveCohort } from "@/hooks/useActiveCohort";
import { hapticSelection } from "@/lib/haptics";

// Browse merged into Home — the catalog now lives in the Home feed.
const NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "My Courses", icon: BookOpen, path: "/my-courses" },
  { label: "Sessions", icon: Video, path: "/my-sessions" },
  { label: "Events", icon: Calendar, path: "/events" },
  { label: "Community", icon: MessageSquare, path: "/community" },
  { label: "Profile", icon: User, path: "/profile" },
];

// Mobile bottom bar: 4 tabs (Browse folded into Home)
const MOBILE_NAV_ITEMS = [
  { label: "Home", icon: Home, path: "/home" },
  { label: "My Courses", icon: BookOpen, path: "/my-courses" },
  { label: "Sessions", icon: Video, path: "/my-sessions" },
  { label: "Profile", icon: User, path: "/profile" },
];

interface Props {
  /**
   * Optional — if omitted the layout will render an <Outlet/> so it can be
   * used as a React Router v6 layout route. Existing usages that pass
   * children continue to work (e.g. wrapper-style pages during migration).
   */
  children?: React.ReactNode;
}

// Calm content skeleton (no spinner) shown while a lazy page chunk loads inside
// the shell. The top bar + tab bar are already painted by the layout, so this
// only fills the content area — reads as "content arriving", not "app frozen".
const ContentSuspenseFallback = () => (
  <div className="px-4 md:px-8 py-6 space-y-6 max-w-5xl mx-auto w-full" role="status" aria-busy="true">
    <span className="sr-only">Loading…</span>
    <div className="h-44 rounded-2xl bg-surface/60 animate-pulse" />
    <div className="space-y-3">
      <div className="h-4 w-2/5 rounded bg-surface/60 animate-pulse" />
      <div className="h-3 w-4/5 rounded bg-surface/60 animate-pulse" />
      <div className="h-3 w-3/5 rounded bg-surface/60 animate-pulse" />
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
      <div className="h-32 rounded-xl bg-surface/60 animate-pulse" />
      <div className="h-32 rounded-xl bg-surface/60 animate-pulse" />
      <div className="h-32 rounded-xl bg-surface/60 animate-pulse" />
    </div>
  </div>
);

const StudentLayout = ({ children }: Props) => {
  const { profile, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  // Hardware back / Esc closes any open hand-rolled overlay first. The native
  // back button (App.tsx) dispatches a synthetic Escape when it detects an
  // open overlay, so this keeps the mobile sidebar + dropdowns from trapping
  // the user or letting back-press exit the app while a menu is open.
  useEffect(() => {
    if (!sidebarOpen && !dropdownOpen && !notifOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setSidebarOpen(false);
      setDropdownOpen(false);
      setNotifOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sidebarOpen, dropdownOpen, notifOpen]);
  const { notifications, unreadCount, loading: notifLoading, markRead, markAllRead } = useNotifications();
  const { offeringId: activeCohortId } = useActiveCohort();

  const firstName = profile?.full_name?.split(" ")[0] ?? "Student";

  return (
    <div className="flex min-h-screen bg-canvas">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-surface focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>
      {/* Desktop sidebar - visible at md+ (768px) */}
      <aside className="hidden md:flex flex-col w-[260px] min-w-[260px] border-r border-border bg-canvas sticky top-0 h-screen">
        <div className="px-6 pt-7 pb-5">
          <LevelUpWordmark className="h-7 w-auto text-foreground" />
        </div>

        <nav aria-label="Main navigation" className="flex-1 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                  active
                    ? "text-foreground bg-cream/[0.08] font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface"
                )}
              >
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-cream" />}
                <item.icon className={cn("h-[18px] w-[18px]", active && "text-cream")} />
                {item.label}
              </Link>
            );
          })}

          {activeCohortId && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to={`/cohort/${activeCohortId}`}
                className={cn(
                  "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                  location.pathname.startsWith("/cohort/")
                    ? "text-foreground bg-cream/[0.08] font-medium"
                    : "text-cream hover:bg-cream/[0.06]"
                )}
              >
                {location.pathname.startsWith("/cohort/") && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-cream" />}
                <Sparkles className="h-[18px] w-[18px]" />
                My Cohort
              </Link>
            </>
          )}

          {(profile?.role === "admin" || profile?.role === "owner") && (
            <>
              <div className="my-3 border-t border-border" />
              <Link
                to="/admin"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200"
              >
                <Shield className="h-[18px] w-[18px]" />
                Admin Dashboard
              </Link>
            </>
          )}

          {profile?.role === "instructor" && (
            <>
              <div className="my-3 border-t border-border" />
              <Link to="/instructor" className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200">
                <BarChart3 className="h-[18px] w-[18px]" />
                Instructor Dashboard
              </Link>
            </>
          )}
        </nav>

        <div className="p-3">
          <div className="flex items-center gap-3 rounded-2xl bg-surface/60 border border-border px-3 py-2.5">
            <InitialsAvatar name={profile?.full_name ?? "U"} photoUrl={profile?.avatar_url} size={32} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-foreground">{firstName}</p>
              <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
                #{profile?.member_number ?? "—"}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay — respects iOS safe-area */}
      {sidebarOpen && (
        <div data-overlay-open="true" className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-canvas border-r border-border flex flex-col safe-top safe-bottom animate-fade-in">
            <div className="flex items-center justify-between p-6">
              <LevelUpWordmark className="h-8 w-auto text-foreground" />
              <button aria-label="Close menu" onClick={() => setSidebarOpen(false)} className="-mr-1.5 h-11 w-11 flex items-center justify-center focus-ring press-scale rounded-xl text-muted-foreground">
                <X className="h-6 w-6" />
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
                      "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2",
                      active ? "text-foreground bg-cream/[0.08] font-medium" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-cream" />}
                    <item.icon className={cn("h-[18px] w-[18px]", active && "text-cream")} />
                    {item.label}
                  </Link>
                );
              })}

              {(profile?.role === "admin" || profile?.role === "owner") && (
                <>
                  <div className="my-3 border-t border-border" />
                  <Link
                    to="/admin"
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200"
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
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-[hsl(var(--accent-amber))] hover:bg-[hsl(var(--accent-amber)/0.1)] transition-all duration-200"
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
        {/* Top bar — `safe-top` pushes the row below the Dynamic Island; the
            16-unit row sits *under* that inset (min-height, not fixed height,
            so the inset is added rather than eating into the row and clipping
            the logo). */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-8 border-b border-border bg-canvas/80 backdrop-blur-xl safe-top min-h-16">
          <div className="flex items-center gap-2">
            <button aria-label="Open menu" className="md:hidden -ml-1.5 text-muted-foreground h-11 w-11 flex items-center justify-center focus-ring press-scale rounded-xl" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <Link to="/home" aria-label="LevelUp home" className="md:hidden flex items-center">
              <LevelUpWordmark className="h-8 w-auto text-foreground" />
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                aria-label="Notifications"
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative text-muted-foreground hover:text-foreground min-h-[44px] min-w-[44px] flex items-center justify-center focus-ring press-scale rounded-md"
              >
                <Bell className="h-5 w-5" />
                {notifLoading ? (
                  <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-muted-foreground/50" />
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
                aria-label="Account menu"
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
                className="flex items-center gap-2 min-h-[44px] focus-ring press-scale rounded-md px-1"
              >
                <InitialsAvatar name={profile?.full_name ?? "U"} photoUrl={profile?.avatar_url} size={32} />
                <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0" onClick={() => setDropdownOpen(false)} />
                  <div data-overlay-open="true" className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-lg py-1 z-50">
                    {(profile?.role === "admin" || profile?.role === "owner") && (
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

        {/* Content area — Suspense is INSIDE the layout so lazy chunk loads
            don't swap out the entire shell (fixes the "page reloads on every
            navigation" feeling). The nav, sidebar, and tab bar stay mounted. */}
        <main id="main-content" className="flex-1 grain">
          <div className="max-w-[1280px] xl:max-w-[1440px] 2xl:max-w-[1680px] mx-auto px-4 md:px-8 lg:px-10 xl:px-12 py-6 md:py-10 relative z-10 page-enter">
            <Suspense fallback={<ContentSuspenseFallback />}>
              {children ?? <Outlet />}
            </Suspense>
          </div>
        </main>
        {/* Footer sits below scrollable content; extra bottom padding on
            mobile keeps it clear of the fixed bottom tab bar. On native the
            <Footer/> renders null, so this padding alone provides the
            tab-bar clearance (safe-area aware for the home indicator). */}
        <div className="pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
          <Footer variant="app" />
        </div>
      </div>

      {/* Mobile bottom tab bar — respects iOS safe-area inset */}
      <nav
        aria-label="Mobile navigation"
        className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-canvas/80 backdrop-blur-xl border-t border-border flex items-stretch safe-bottom"
      >
        {MOBILE_NAV_ITEMS.map((item) => {
          const active = location.pathname === item.path || location.pathname.startsWith(item.path + "/");
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => { void hapticSelection(); }}
              className={cn(
                "pressable relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 min-h-[56px] text-[11px] font-medium transition-colors focus-ring",
                active ? "text-cream" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[3px] w-9 rounded-b-full bg-cream" />}
              <item.icon className={cn("h-5 w-5 transition-transform", active && "scale-110")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};

export default StudentLayout;
