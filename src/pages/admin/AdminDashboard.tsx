import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { dashboardStats, mentorStats, mockActivityFeed } from "@/data/adminData";
import {
  BarChart3, Users, FileText, Shield, TrendingUp, GraduationCap,
  UserPlus, BookOpen, AlertTriangle, CheckCircle2, ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const iconMap = {
  signup: UserPlus,
  enrollment: BookOpen,
  submission: FileText,
  report: AlertTriangle,
  completion: CheckCircle2,
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isSuperAdmin ? "Dashboard" : "Mentor Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? "Overview of platform health" : "Your cohort performance"}
          </p>
        </div>

        {/* Stats Grid */}
        {isSuperAdmin ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[
              { label: "Total Users", value: dashboardStats.totalUsers.toLocaleString(), icon: Users, change: `+${dashboardStats.monthlyGrowth}%` },
              { label: "Monthly Revenue", value: dashboardStats.totalRevenue, icon: BarChart3, change: `+${dashboardStats.revenueGrowth}%` },
              { label: "Published Courses", value: dashboardStats.publishedCourses, icon: FileText, change: "+3" },
              { label: "Active Reports", value: dashboardStats.activeReports, icon: Shield, change: "-2" },
              { label: "Total Enrollments", value: dashboardStats.totalEnrollments.toLocaleString(), icon: GraduationCap, change: "+156" },
              { label: "Completion Rate", value: `${dashboardStats.completionRate}%`, icon: TrendingUp, change: "+5%" },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-center justify-between mb-3">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs font-medium text-[hsl(var(--highlight))]">{stat.change}</span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Enrolled Students", value: mentorStats.enrolledStudents },
              { label: "Pending Submissions", value: mentorStats.pendingSubmissions },
              { label: "Upcoming Sessions", value: mentorStats.upcomingSessions },
              { label: "Avg Rating", value: mentorStats.avgRating },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Actions */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
            <div className="space-y-2">
              {(isSuperAdmin
                ? [
                    { label: "Manage Content", path: "/admin/content" },
                    { label: "Review Applications", path: "/admin/cohorts" },
                    { label: "View Reports", path: "/admin/moderation" },
                    { label: "Manage Users", path: "/admin/users" },
                  ]
                : [
                    { label: "My Courses", path: "/admin/content" },
                    { label: "My Workshops", path: "/admin/workshops" },
                    { label: "View Analytics", path: "/admin/analytics" },
                  ]
              ).map((action) => (
                <button
                  key={action.path}
                  onClick={() => navigate(action.path)}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2.5 text-sm text-foreground hover:bg-secondary transition-colors"
                >
                  {action.label}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Recent Activity</h2>
            <div className="space-y-3">
              {mockActivityFeed.slice(0, 5).map((item) => {
                const Icon = iconMap[item.type];
                return (
                  <div key={item.id} className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-md bg-secondary p-1.5">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">{item.message}</p>
                      <p className="text-xs text-muted-foreground">{item.timestamp}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
