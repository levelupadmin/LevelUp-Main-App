import AdminLayout from "@/components/layout/AdminLayout";
import PlaceholderPage from "@/components/shared/PlaceholderPage";
import { BarChart3 } from "lucide-react";

const AdminAnalytics = () => (
  <AdminLayout>
    <PlaceholderPage
      icon={BarChart3}
      title="Analytics"
      subtitle="Platform metrics, engagement trends, revenue, and user growth."
      badge="Admin"
    />
  </AdminLayout>
);

export default AdminAnalytics;
