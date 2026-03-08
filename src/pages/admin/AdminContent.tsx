import AdminLayout from "@/components/layout/AdminLayout";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { FileText } from "lucide-react";

const AdminContent = () => (
  <AdminLayout>
    <PlaceholderPage
      icon={FileText}
      title="Content Management"
      subtitle="Create, edit, and manage courses, lessons, and learning paths."
      badge="Admin"
    />
  </AdminLayout>
);

export default AdminContent;
