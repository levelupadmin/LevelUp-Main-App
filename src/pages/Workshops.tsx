import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Presentation } from "lucide-react";

const Workshops = () => (
  <AppShell>
    <PlaceholderPage
      icon={Presentation}
      title="Workshops"
      subtitle="Live and recorded beginner workshops. ₹99–₹199 each."
      badge="Workshops"
    />
  </AppShell>
);

export default Workshops;
