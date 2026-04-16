import { ReactNode, useState, useRef, useCallback, useEffect } from "react";
import { useNavigate, useLocation, Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
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
  ChevronRight,
  ScrollText,
  Search,
  Award,
  Megaphone,
  Mail,
  Send,
  type LucideIcon,
} from "lucide-react";
import InitialsAvatar from "@/components/InitialsAvatar";
import LevelUpWordmark from "@/components/LevelUpWordmark";

interface NavItem {
  label: string;
  icon: LucideIcon;
  path: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", icon: LayoutDashboard, path: "/admin" },
      { label: "Revenue", icon: IndianRupee, path: "/admin/revenue" },
    ],
  },
  {
    label: "Content",
    items: [
      { label: "Hero Slides", icon: Image, path: "/admin/hero-slides" },
      { label: "Courses", icon: BookOpen, path: "/admin/courses" },
      { label: "Offerings", icon: Package, path: "/admin/offerings" },
    ],
  },
  {
    label: "Scheduling",
    items: [
      { label: "Schedule Classes", icon: Video, path: "/admin/schedule" },
      { label: "Events", icon: CalendarDays, path: "/admin/events" },
    ],
  },
  {
    label: "People",
    items: [
      { label: "Enrolments", icon: Users, path: "/admin/enrolments" },
      { label: "Users", icon: UserCog, path: "/admin/users" },
      { label: "Coupons", icon: Ticket, path: "/admin/coupons" },
      { label: "Certificates", icon: Award, path: "/admin/certificates" },
    ],
  },
  {
    label: "Communications",
    items: [
      { label: "Announcements", icon: Megaphone, path: "/admin/announcements" },
      { label: "Email Templates", icon: Mail, path: "/admin/email-templates" },
      { label: "Email Campaigns", icon: Send, path: "/admin/email-campaigns" },
    ],
  },
  {
    label: "System",
    items: [
      { label: "Audit Logs", icon: ScrollText, path: "/admin/audit-logs" },
    ],
  },
];

interface Props {
  children: ReactNode;
  title?: string;
}

// Determine which groups should be expanded initially based on current path
function getInitialExpanded(pathname: string): Record<string, boolean> {
  const expanded: Record<string, boolean> = {};
  NAV_GROUPS.forEach((group) => {
    const isActive = group.items.some((item) =>
      item.path === "/admin"
        ? pathname === "/admin"
        : pathname.startsWith(item.path),
    );
    expanded[group.label] = isActive;
  });
  return expanded;
}

const AdminLayout = ({ children, title }: Props) => {
  const { profile, signOut, loading: authLoading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => getInitialExpanded(location.pathname));
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ type: string; label: string; sub: string; path: string }[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  const toggleGroup = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const runSearch = useCallback(async (q: string) => {
    if (!q.trim() || q.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    // Escape LIKE wildcards to prevent unintended matches
    const escaped = q.trim().replace(/%/g, "\\%").replace(/_/g, "\\_");
    const pattern = `%${escaped}%`;
    const [usersRes, coursesRes, offeringsRes] = await Promise.all([
      supabase.from("users").select("id, full_name, email, role").ilike("full_name", pattern).limit(5),
      supabase.from("courses").select("id, title, status").ilike("title", pattern).limit(5),
      supabase.from("offerings").select("id, title, status").ilike("title", pattern).limit(5),
    ]);
    const results: typeof searchResults = [];
    (usersRes.data || []).forEach((u) =>
      results.push({ type: "User", label: u.full_name || u.email, sub: u.role, path: "/admin/users" }),
    );
    (coursesRes.data || []).forEach((c) =>
      results.push({ type: "Course", label: c.title, sub: c.status, path: `/admin/courses/${c.id}/edit` }),
    );
    (offeringsRes.data || []).forEach((o) =>
      results.push({ type: "Offering", label: o.title, sub: o.status, path: `/admin/offerings/${o.id}/edit` }),
    );
    setSearchResults(results);
  }, []);

  const handleSearchChange = (v: string) => {
    setSearchQuery(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!v.trim() || v.trim().length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    setSearchOpen(true);
    searchTimer.current = setTimeout(() => runSearch(v), 300);
  };

  // Cleanup search timer on unmount
  useEffect(() => {
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, []);

  // Close search dropdown on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
      <nav aria-label="Admin navigation" className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {NAV_GROUPS.map((group) => {
          const isGroupExpanded = expanded[group.label] ?? false;
          const hasActiveItem = group.items.some((item) => isActive(item.path));

          return (
            <div key={group.label}>
              <button
                type="button"
                onClick={() => toggleGroup(group.label)}
                className={cn(
                  "flex items-center justify-between w-full px-3 py-2 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors",
                  hasActiveItem ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span>{group.label}</span>
                {isGroupExpanded
                  ? <ChevronDown className="h-3 w-3 opacity-50" />
                  : <ChevronRight className="h-3 w-3 opacity-50" />
                }
              </button>

              {isGroupExpanded && (
                <div className="space-y-0.5 mb-1">
                  {group.items.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ml-1",
                        isActive(item.path)
                          ? "text-foreground bg-surface-2 border-l-2 border-cream"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface"
                      )}
                    >
                      <item.icon className="h-[16px] w-[16px] shrink-0" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        <div className="my-3 border-t border-border" />

        <Link
          to="/home"
          onClick={() => setSidebarOpen(false)}
          className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
        >
          <ArrowLeft className="h-[16px] w-[16px]" />
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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[9999] focus:bg-surface focus:text-foreground focus:px-4 focus:py-2 focus:rounded-lg">Skip to content</a>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-[260px] min-w-[260px] border-r border-border bg-canvas sticky top-0 h-screen">
        <SidebarContent />
      </aside>

      {/* Mobile sidebar overlay — respects iOS safe-area */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-black/60 animate-fade-in"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="absolute left-0 top-0 bottom-0 w-[280px] bg-canvas border-r border-border flex flex-col safe-top safe-bottom animate-fade-in">
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
            <nav aria-label="Admin navigation" className="flex-1 px-3 space-y-0.5 overflow-y-auto">
              {NAV_GROUPS.map((group) => {
                const isGroupExpanded = expanded[group.label] ?? false;
                const hasActiveItem = group.items.some((item) => isActive(item.path));

                return (
                  <div key={group.label}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className={cn(
                        "flex items-center justify-between w-full px-3 py-2 rounded-md text-[11px] font-mono uppercase tracking-wider transition-colors",
                        hasActiveItem ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span>{group.label}</span>
                      {isGroupExpanded
                        ? <ChevronDown className="h-3 w-3 opacity-50" />
                        : <ChevronRight className="h-3 w-3 opacity-50" />
                      }
                    </button>

                    {isGroupExpanded && (
                      <div className="space-y-0.5 mb-1">
                        {group.items.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setSidebarOpen(false)}
                            className={cn(
                              "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ml-1",
                              isActive(item.path)
                                ? "text-foreground bg-surface-2 border-l-2 border-cream"
                                : "text-muted-foreground hover:text-foreground hover:bg-surface"
                            )}
                          >
                            <item.icon className="h-[16px] w-[16px] shrink-0" />
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              <div className="my-3 border-t border-border" />

              <Link
                to="/home"
                onClick={() => setSidebarOpen(false)}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface transition-colors"
              >
                <ArrowLeft className="h-[16px] w-[16px]" />
                Student View
              </Link>
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar — respects iOS safe-area so the status bar doesn't overlap */}
        <header className="sticky top-0 z-40 flex items-center justify-between px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-lg safe-top h-16">
          <div className="flex items-center gap-3">
            <button
              aria-label="Open menu"
              className="md:hidden text-muted-foreground min-h-[44px] min-w-[44px] flex items-center justify-center focus-ring press-scale rounded-md"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-lg font-semibold">{title || ""}</h1>
          </div>

          {/* Global search */}
          <div ref={searchRef} className="hidden md:block relative flex-1 max-w-xs mx-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search users, courses, offerings…"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => searchQuery.trim().length >= 2 && setSearchOpen(true)}
              className="pl-9 h-9 bg-surface border-border text-sm"
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-surface border border-border rounded-lg shadow-lg py-1 z-50 max-h-72 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => { navigate(r.path); setSearchOpen(false); setSearchQuery(""); setSearchResults([]); }}
                    className="flex items-center gap-3 w-full px-3 py-2 text-sm hover:bg-surface-2 transition-colors text-left"
                  >
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground w-14 shrink-0">{r.type}</span>
                    <span className="truncate flex-1">{r.label}</span>
                    <span className="text-xs text-muted-foreground">{r.sub}</span>
                  </button>
                ))}
              </div>
            )}
            {searchOpen && searchQuery.trim().length >= 2 && searchResults.length === 0 && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-surface border border-border rounded-lg shadow-lg py-3 z-50 text-center text-sm text-muted-foreground">
                No results found
              </div>
            )}
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
                className="flex items-center gap-2 min-h-[44px] focus-ring press-scale rounded-md px-1"
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
        <main id="main-content" className="flex-1 grain">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6 md:py-10 relative z-10">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
