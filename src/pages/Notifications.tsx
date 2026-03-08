import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Bell } from "lucide-react";

const Notifications = () => (
  <AppShell>
    <PlaceholderPage
      icon={Bell}
      title="Notifications"
      subtitle="Course updates, community replies, streak reminders, and opportunities."
    />
  </AppShell>
);

export default Notifications;
