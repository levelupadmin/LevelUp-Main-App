import AdminLayout from "@/components/layout/AdminLayout";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Users } from "lucide-react";

const AdminUsers = () => (
  <AdminLayout>
    <PlaceholderPage
      icon={Users}
      title="User Management"
      subtitle="View users, manage roles, and handle account issues."
      badge="Admin"
    />
  </AdminLayout>
);

export default AdminUsers;
