import AdminLayout from "@/components/layout/AdminLayout";
import { BarChart3, Users, FileText, Shield } from "lucide-react";

const stats = [
  { label: "Total Users", value: "2,847", icon: Users },
  { label: "Published Courses", value: "24", icon: FileText },
  { label: "Active Reports", value: "3", icon: Shield },
  { label: "Monthly Revenue", value: "₹4.2L", icon: BarChart3 },
];

const AdminDashboard = () => (
  <AdminLayout>
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of platform health</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
              <Icon className="mb-2 h-5 w-5 text-primary" />
              <p className="font-display text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  </AdminLayout>
);

export default AdminDashboard;
