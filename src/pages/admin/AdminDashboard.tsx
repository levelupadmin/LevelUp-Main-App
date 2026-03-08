import AdminLayout from "@/components/layout/AdminLayout";
import { useAuth } from "@/contexts/AuthContext";
import { dashboardStats, mentorStats, mockActivityFeed, revenueData, userGrowthData } from "@/data/adminData";
import {
  BarChart3, Users, FileText, Shield, TrendingUp, GraduationCap,
  UserPlus, BookOpen, AlertTriangle, CheckCircle2, ArrowRight, TrendingDown,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, ResponsiveContainer } from "recharts";

const iconMap = {
  signup: UserPlus,
  enrollment: BookOpen,
  submission: FileText,
  report: AlertTriangle,
  completion: CheckCircle2,
};

// Mini sparkline data derived from existing data
const sparklines: Record<string, number[]> = {
  "Total Users": userGrowthData.map((d) => d.users),
  "Monthly Revenue": revenueData.map((d) => d.revenue),
  "Published Courses": [18, 19, 20, 21, 22, 24],
  "Active Reports": [8, 6, 5, 7, 5, 3],
  "Total Enrollments": [980, 1050, 1120, 1200, 1340, 1456],
  "Completion Rate": [58, 60, 62, 63, 65, 68],
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === "super_admin";

  return (
    <AdminLayout>
      <div className="space-y-6 animate-slide-up">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {isSuperAdmin ? "Dashboard" : "Mentor Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? "Overview of platform health" : "Your cohort performance"}
          </p>
        </div>

        {isSuperAdmin ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[
              { label: "Total Users", value: dashboardStats.totalUsers.toLocaleString(), icon: Users, change: `+${dashboardStats.monthlyGrowth}%`, positive: true },
              { label: "Monthly Revenue", value: dashboardStats.totalRevenue, icon: BarChart3, change: `+${dashboardStats.revenueGrowth}%`, positive: true },
              { label: "Published Courses", value: dashboardStats.publishedCourses, icon: FileText, change: "+3", positive: true },
              { label: "Active Reports", value: dashboardStats.activeReports, icon: Shield, change: "-2", positive: false },
              { label: "Total Enrollments", value: dashboardStats.totalEnrollments.toLocaleString(), icon: GraduationCap, change: "+156", positive: true },
              { label: "Completion Rate", value: `${dashboardStats.completionRate}%`, icon: TrendingUp, change: "+5%", positive: true },
            ].map((stat) => {
              const Icon = stat.icon;
              const data = sparklines[stat.label]?.map((v, i) => ({ v })) || [];
              return (
                <div key={stat.label} className="rounded-lg border border-border bg-card p-4 transition-all hover:border-muted-foreground/20 hover:shadow-[0_0_0_1px_hsl(var(--highlight)/0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded-md bg-secondary p-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${stat.positive ? "text-success" : "text-destructive"}`}>
                      {stat.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                      {stat.change}
                    </span>
                  </div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
                  {/* Mini sparkline */}
                  {data.length > 0 && (
                    <div className="mt-3 h-8">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data}>
                          <Line
                            type="monotone"
                            dataKey="v"
                            stroke={stat.positive ? "hsl(var(--success))" : "hsl(var(--destructive))"}
                            strokeWidth={1.5}
                            dot={false}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
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
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4 transition-all hover:border-muted-foreground/20">
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Quick Actions — icon-first cards */}
          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
            <div className="grid grid-cols-2 gap-2">
              {(isSuperAdmin
                ? [
                    { label: "Manage Content", path: "/admin/content", icon: FileText },
                    { label: "Review Applications", path: "/admin/cohorts", icon: BookOpen },
                    { label: "View Reports", path: "/admin/moderation", icon: Shield },
                    { label: "Manage Users", path: "/admin/users", icon: Users },
                  ]
                : [
                    { label: "My Courses", path: "/admin/content", icon: BookOpen },
                    { label: "My Workshops", path: "/admin/workshops", icon: GraduationCap },
                    { label: "View Analytics", path: "/admin/analytics", icon: BarChart3 },
                  ]
              ).map((action) => {
                const AIcon = action.icon;
                return (
                  <button
                    key={action.path}
                    onClick={() => navigate(action.path)}
                    className="flex flex-col items-center gap-2 rounded-lg border border-border bg-secondary/30 p-4 text-center transition-all hover:bg-secondary hover:border-muted-foreground/20 hover:shadow-[0_4px_12px_-4px_hsl(0_0%_0%/0.3)]"
                  >
                    <div className="rounded-md bg-accent p-2">
                      <AIcon className="h-4 w-4 text-foreground" />
                    </div>
                    <span className="text-xs font-medium text-foreground">{action.label}</span>
                  </button>
                );
              })}
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
