import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Users } from "lucide-react";

const Directory = () => (
  <AppShell>
    <PlaceholderPage
      icon={Users}
      title="Creator Directory"
      subtitle="Browse and discover creators by skill, location, and availability."
      badge="Community"
    />
  </AppShell>
);

export default Directory;
