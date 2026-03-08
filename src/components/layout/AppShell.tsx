import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { useState } from "react";
import logo from "@/assets/logo-white.png";

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

const AppShell = ({ children }: { children: ReactNode }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-60 flex-col border-r border-border bg-sidebar lg:flex">
        {/* Logo */}
        <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
          <img src={logo} alt="LevelUp Learning" className="h-7 w-7" />
          <span className="text-base font-bold text-foreground">LevelUp Learning</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <div className="space-y-0.5">
            {mainNav.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
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
                  onClick={() => navigate(item.path)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-accent text-foreground"
                      : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" />
                  {item.label}
                </button>
              );
            })}
          </div>
        </nav>

        {/* Bottom user */}
        <div className="border-t border-border p-3">
          <button
            onClick={() => navigate("/profile/me")}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <div className="h-8 w-8 rounded-full bg-accent" />
            <span className="flex-1 text-left font-medium">Arjun Mehta</span>
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* Top Bar */}
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-background/90 backdrop-blur-xl lg:left-60">
        <div className="flex h-14 items-center justify-between px-4 lg:px-6">
          {/* Mobile menu toggle */}
          <button
            className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          {/* Mobile logo */}
          <div className="flex items-center gap-2 lg:hidden">
            <img src={logo} alt="Level Up" className="h-6 w-6" />
            <span className="text-sm font-bold text-foreground">Level Up</span>
          </div>

          {/* Desktop: spacer */}
          <div className="hidden lg:block" />

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate("/search")}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Search className="h-5 w-5" />
            </button>
            <button
              onClick={() => navigate("/notifications")}
              className="relative rounded-lg p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
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
          <aside className="absolute left-0 top-0 h-full w-64 border-r border-border bg-sidebar shadow-elevated">
            <div className="flex h-14 items-center gap-2.5 border-b border-border px-5">
              <img src={logo} alt="Level Up" className="h-7 w-7" />
              <span className="text-base font-bold text-foreground">Level Up</span>
            </div>
            <nav className="px-3 py-4 space-y-0.5">
              {mainNav.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setMobileMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      active
                        ? "bg-accent text-foreground"
                        : "text-sidebar-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </button>
                );
              })}
              <div className="my-3 h-px bg-border" />
              {secondaryNav.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.path}
                    onClick={() => {
                      navigate(item.path);
                      setMobileMenuOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-sidebar-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Icon className="h-[18px] w-[18px]" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </aside>
        </div>
      )}

      {/* Mobile bottom tabs */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-xl safe-bottom lg:hidden">
        <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
          {mainNav.map((tab) => {
            const active = isActive(tab.path);
            const Icon = tab.icon;
            return (
              <button
                key={tab.path}
                onClick={() => navigate(tab.path)}
                className={`flex flex-col items-center gap-0.5 px-3 py-2 text-xs transition-colors ${
                  active
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                <Icon className={`h-5 w-5 ${active ? "stroke-[2.5]" : ""}`} />
                <span className={active ? "font-semibold" : "font-medium"}>{tab.label}</span>
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
