import AdminLayout from "@/components/layout/AdminLayout";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Clapperboard } from "lucide-react";

const AdminWorkshops = () => (
  <AdminLayout>
    <PlaceholderPage
      icon={Clapperboard}
      title="Workshop Management"
      subtitle="Schedule, price, and manage live and recorded workshops."
      badge="Admin"
    />
  </AdminLayout>
);

export default AdminWorkshops;
