import AdminLayout from "@/components/layout/AdminLayout";
import { useDevAuth } from "@/contexts/DevAuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  BarChart3, Users, FileText, Shield, TrendingUp, GraduationCap,
  UserPlus, BookOpen, AlertTriangle, ArrowRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

const AdminDashboard = () => {
  const { user } = useDevAuth();
  const navigate = useNavigate();
  const isSuperAdmin = user?.role === "super_admin";

  // Real aggregate stats
  const { data: stats, isLoading } = useQuery({
    queryKey: ["admin-dashboard-stats"],
    queryFn: async () => {
      const [
        { count: totalUsers },
        { count: totalEnrollments },
        { count: publishedCourses },
        { count: activeEnrollments },
        { count: completedEnrollments },
      ] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("enrollments").select("*", { count: "exact", head: true }),
        supabase.from("courses").select("*", { count: "exact", head: true }).eq("status", "published"),
        supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("enrollments").select("*", { count: "exact", head: true }).eq("status", "completed"),
      ]);

      const completionRate = (totalEnrollments || 0) > 0
        ? Math.round(((completedEnrollments || 0) / (totalEnrollments || 1)) * 100)
        : 0;

      return {
        totalUsers: totalUsers || 0,
        totalEnrollments: totalEnrollments || 0,
        publishedCourses: publishedCourses || 0,
        completionRate,
      };
    },
  });

  // Mentor stats
  const { data: mentorStats } = useQuery({
    queryKey: ["mentor-dashboard-stats", user?.id],
    enabled: !!user?.id && !isSuperAdmin,
    queryFn: async () => {
      const { count: pendingSubmissions } = await supabase
        .from("assignment_submissions")
        .select("*", { count: "exact", head: true })
        .eq("status", "submitted");

      return {
        pendingSubmissions: pendingSubmissions || 0,
      };
    },
  });

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

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : isSuperAdmin ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {[
              { label: "Total Users", value: (stats?.totalUsers || 0).toLocaleString(), icon: Users },
              { label: "Published Courses", value: stats?.publishedCourses || 0, icon: FileText },
              { label: "Total Enrollments", value: (stats?.totalEnrollments || 0).toLocaleString(), icon: GraduationCap },
              { label: "Completion Rate", value: `${stats?.completionRate || 0}%`, icon: TrendingUp },
            ].map((stat) => {
              const Icon = stat.icon;
              return (
                <div key={stat.label} className="rounded-lg border border-border bg-card p-4 transition-all hover:border-muted-foreground/20 hover:shadow-[0_0_0_1px_hsl(var(--highlight)/0.06)]">
                  <div className="flex items-center justify-between mb-3">
                    <div className="rounded-md bg-secondary p-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </div>
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
              { label: "Pending Submissions", value: mentorStats?.pendingSubmissions || 0 },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border bg-card p-4 transition-all hover:border-muted-foreground/20">
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
            <div className="grid grid-cols-2 gap-2">
              {(isSuperAdmin
                ? [
                    { label: "Manage Courses", path: "/admin/courses", icon: FileText },
                    { label: "View Reports", path: "/admin/moderation", icon: Shield },
                    { label: "Manage Users", path: "/admin/users", icon: Users },
                    { label: "Analytics", path: "/admin/analytics", icon: BarChart3 },
                  ]
                : [
                    { label: "My Courses", path: "/admin/courses", icon: BookOpen },
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
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminDashboard;
