import AppShell from "@/components/layout/AppShell";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { CreditCard } from "lucide-react";

const Subscription = () => (
  <AppShell>
    <PlaceholderPage
      icon={CreditCard}
      title="Subscription"
      subtitle="Manage your ₹499/month plan, billing, and payment history."
      badge="Premium"
    />
  </AppShell>
);

export default Subscription;
