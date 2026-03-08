import AdminLayout from "@/components/layout/AdminLayout";
import { BarChart3, Users, FileText, Shield } from "lucide-react";

const stats = [
  { label: "Total Users", value: "2,847", icon: Users, change: "+12%" },
  { label: "Published Courses", value: "24", icon: FileText, change: "+3" },
  { label: "Active Reports", value: "3", icon: Shield, change: "-2" },
  { label: "Monthly Revenue", value: "₹4.2L", icon: BarChart3, change: "+18%" },
];

const AdminDashboard = () => (
  <AdminLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Overview of platform health</p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs font-medium text-xp">{stat.change}</span>
              </div>
              <p className="text-2xl font-bold text-foreground">{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  </AdminLayout>
);

export default AdminDashboard;
