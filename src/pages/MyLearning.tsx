import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { BookOpen } from "lucide-react";

const MyLearning = () => (
  <AppShell>
    <PlaceholderPage
      icon={BookOpen}
      title="My Learning"
      subtitle="Track your enrolled courses, progress, and completed lessons."
      badge="Learning"
    />
  </AppShell>
);

export default MyLearning;
