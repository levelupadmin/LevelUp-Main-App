import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useDevAuth } from "@/contexts/DevAuthContext";
import {
  Home,
  PlayCircle,
  Users,
  Briefcase,
  UserCircle,
  Search,
  Bell,
  Settings,
  Menu,
  X,
  BookOpen,
  ChevronRight,
  ArrowLeft,
  Rss,
  GraduationCap,
  Compass,
} from "lucide-react";
import { useState } from "react";

const mainNav = [
  { path: "/home", label: "Home", icon: Home },
  { path: "/learn", label: "Learn", icon: PlayCircle },
  { path: "/community", label: "Community", icon: Users },
  { path: "/opportunities", label: "Opportunities", icon: Briefcase },
  { path: "/profile/me", label: "Profile", icon: UserCircle },
];

const secondaryNav = [
  { path: "/learn/my-learning", label: "My Learning", icon: BookOpen },
  { path: "/settings", label: "Settings", icon: Settings },
];

const communityNav = [
  { id: "feed", label: "Feed", icon: Rss },
  { id: "spaces", label: "My Spaces", icon: GraduationCap },
  { id: "discover", label: "Discover", icon: Compass },
  { id: "creators", label: "Meet Creators", icon: Users },
];

export type CommunitySection = "feed" | "spaces" | "discover" | "creators";

const AppShell = ({
  children,
  communitySection,
  onCommunitySection,
}: {
  children: ReactNode;
  communitySection?: CommunitySection;
  onCommunitySection?: (section: CommunitySection) => void;
}) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isCommunity = location.pathname === "/community" || location.pathname.startsWith("/community/");
  const showCommunityNav = isCommunity && communitySection !== undefined && onCommunitySection !== undefined;

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const renderDefaultNav = (onNavigate?: () => void) => (
    <>
      <div className="space-y-0.5">
        {mainNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); onNavigate?.(); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent text-foreground" : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          );
        })}
      </div>
      <div className="my-4 h-px bg-border" />
      <div className="space-y-0.5">
        {secondaryNav.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          return (
            <button
              key={item.path}
              onClick={() => { navigate(item.path); onNavigate?.(); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent text-foreground" : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );

  const renderCommunityNav = (onNavigate?: () => void) => (
    <>
      <button
        onClick={() => { navigate("/home"); onNavigate?.(); }}
        className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to app
      </button>
      <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Community</p>
      <div className="space-y-0.5">
        {communityNav.map((item) => {
          const Icon = item.icon;
          const active = communitySection === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { onCommunitySection?.(item.id as CommunitySection); onNavigate?.(); }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                active ? "bg-accent text-foreground" : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {item.label}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <span className="text-base font-bold text-foreground">LevelUp Learning</span>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {showCommunityNav ? renderCommunityNav() : renderDefaultNav()}
        </nav>
        <div className="border-t border-border p-3">
          <button
            onClick={() => navigate("/profile/me")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <div className="h-8 w-8 rounded-full bg-accent" />
            <span className="flex-1 text-left font-medium">{user?.name || "Profile"}</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Top Bar */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl lg:left-60">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="text-sm font-bold text-foreground">LevelUp Learning</span>
          </div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            <button onClick={() => navigate("/search")} className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Search className="h-5 w-5" />
            </button>
            <button onClick={() => navigate("/notifications")} className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)} />
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-sidebar shadow-elevated animate-slide-in-right">
            <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
              <span className="text-base font-bold text-foreground">LevelUp Learning</span>
            </div>
            <nav className="px-3 py-4">
              {showCommunityNav
                ? renderCommunityNav(() => setMobileMenuOpen(false))
                : renderDefaultNav(() => setMobileMenuOpen(false))}
            </nav>
          </aside>
        </div>
      )}

      {/* Mobile bottom tabs — polished */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl safe-bottom lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
          {(showCommunityNav ? communityNav.map(c => ({ path: c.id, label: c.label, icon: c.icon })) : mainNav).map((tab) => {
            const active = showCommunityNav ? communitySection === tab.path : isActive(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => {
                  if (showCommunityNav) {
                    onCommunitySection?.(tab.path as CommunitySection);
                  } else {
                    navigate(tab.path);
                  }
                }}
                className={`relative flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors ${
                  active ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                {active && <span className="font-semibold">{tab.label}</span>}
                {/* Active dot indicator */}
                {active && (
                  <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-highlight" />
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {/* Main content */}
      <main className="min-h-screen pt-14 pb-20 lg:ml-60 lg:pb-0">
        {children}
      </main>
    </div>
  );
};

export default AppShell;
