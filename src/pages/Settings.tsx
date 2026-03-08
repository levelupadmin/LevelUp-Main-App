import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Settings as SettingsIcon } from "lucide-react";

const Settings = () => (
  <AppShell>
    <PlaceholderPage
      icon={SettingsIcon}
      title="Settings"
      subtitle="Account, notifications, privacy, and app preferences."
    />
  </AppShell>
);

export default Settings;
