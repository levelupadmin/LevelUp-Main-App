import AppShell from "@/components/layout/AppShell";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Settings as SettingsIcon, LogOut, ChevronRight, User, Bell, Shield, Palette, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

const Settings = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const sections = [
    { label: "Account", icon: User, description: "Email, password, profile details" },
    { label: "Notifications", icon: Bell, description: "Push, email, and in-app alerts" },
    { label: "Privacy", icon: Shield, description: "Data, visibility, blocked users" },
    { label: "Appearance", icon: Palette, description: "Theme and display preferences" },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl space-y-6 p-6 animate-slide-up">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/home" className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                <Home className="h-3.5 w-3.5" />
                Home
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-sm text-muted-foreground">Account, notifications, privacy, and app preferences.</p>
        </div>

        {/* User card */}
        {user && (
          <div className="flex items-center gap-4 rounded-xl border border-border bg-card p-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-lg font-bold text-foreground">
              {user.name?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground truncate">{user.name}</p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}

        {/* Settings sections */}
        <div className="rounded-xl border border-border bg-card divide-y divide-border">
          {sections.map((section) => {
            const Icon = section.icon;
            return (
              <button
                key={section.label}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-secondary/30"
              >
                <div className="rounded-md bg-secondary p-2">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{section.label}</p>
                  <p className="text-xs text-muted-foreground">{section.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Log out */}
        <Button
          variant="destructive"
          onClick={handleLogout}
          className="w-full gap-2"
        >
          <LogOut className="h-4 w-4" />
          Log out
        </Button>
      </div>
    </AppShell>
  );
};

export default Settings;
