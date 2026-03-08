import AdminLayout from "@/components/layout/AdminLayout";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { Shield } from "lucide-react";

const AdminModeration = () => (
  <AdminLayout>
    <PlaceholderPage
      icon={Shield}
      title="Moderation"
      subtitle="Review flagged posts, manage reports, and enforce community guidelines."
      badge="Admin"
    />
  </AdminLayout>
);

export default AdminModeration;
