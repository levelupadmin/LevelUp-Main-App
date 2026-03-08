import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Compass } from "lucide-react";

const Explore = () => (
  <AppShell>
    <PlaceholderPage
      icon={Compass}
      title="Explore"
      subtitle="Browse featured courses, trending creators, and curated collections."
      badge="Public"
    />
  </AppShell>
);

export default Explore;
