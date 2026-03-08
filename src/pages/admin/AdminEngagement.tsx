import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Search, TrendingUp, Users, BookOpen, Award } from "lucide-react";

const useStudentEngagement = () =>
  useQuery({
    queryKey: ["admin-engagement"],
    queryFn: async () => {
      // Get all enrollments with profile info
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("user_id, status, course_id, courses(title)")
        .eq("status", "active")
        .limit(100);
      if (error) throw error;

      // Get unique user IDs
      const userIds = [...new Set(enrollments.map((e: any) => e.user_id))];

      // Get profiles
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);

      // Get engagement scores
      const scores = await Promise.all(
        userIds.map(async (userId) => {
          const { data } = await supabase.rpc("get_student_engagement_score", { _user_id: userId });
          return { userId, score: data as Record<string, number> | null };
        })
      );

      return userIds.map((userId) => {
        const profile = profiles?.find((p: any) => p.id === userId);
        const scoreData = scores.find((s) => s.userId === userId)?.score as Record<string, number> | null;
        const userEnrollments = enrollments.filter((e: any) => e.user_id === userId);
        return {
          userId,
          name: profile?.name || "Unknown",
          avatar_url: profile?.avatar_url,
          enrollments: userEnrollments.length,
          score: scoreData?.score || 0,
          completedLessons: scoreData?.completed_lessons || 0,
          totalLessons: scoreData?.total_lessons || 0,
          avgProgress: Math.round(scoreData?.avg_progress || 0),
          coursesCompleted: scoreData?.courses_completed || 0,
        };
      }).sort((a, b) => b.score - a.score);
    },
  });

const getScoreBadge = (score: number) => {
  if (score >= 80) return { label: "Highly Engaged", className: "bg-green-500/10 text-green-400 border-green-500/20" };
  if (score >= 50) return { label: "Active", className: "bg-blue-500/10 text-blue-400 border-blue-500/20" };
  if (score >= 20) return { label: "At Risk", className: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20" };
  return { label: "Disengaged", className: "bg-destructive/10 text-destructive border-destructive/20" };
};

const AdminEngagement = () => {
  const [search, setSearch] = useState("");
  const { data: students = [], isLoading } = useStudentEngagement();

  const filtered = students.filter(
    (s: any) => search === "" || s.name.toLowerCase().includes(search.toLowerCase())
  );

  const avgScore = students.length > 0 ? Math.round(students.reduce((sum, s) => sum + s.score, 0) / students.length) : 0;
  const highlyEngaged = students.filter((s) => s.score >= 80).length;
  const atRisk = students.filter((s) => s.score < 20).length;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Student Engagement</h1>
          <p className="text-sm text-muted-foreground">Monitor student engagement scores and identify at-risk learners</p>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Avg Score", value: avgScore, icon: TrendingUp },
            { label: "Active Students", value: students.length, icon: Users },
            { label: "Highly Engaged", value: highlyEngaged, icon: Award },
            { label: "At Risk", value: atRisk, icon: BookOpen },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-lg font-bold text-foreground">{s.value}</span>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search students..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Calculating engagement scores...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Score</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Status</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Lessons</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Avg Progress</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: any) => {
                  const badge = getScoreBadge(s.score);
                  return (
                    <tr key={s.userId} className="border-b border-border last:border-0 hover:bg-secondary/20">
                      <td className="px-4 py-3">
                        <p className="text-foreground font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.enrollments} course{s.enrollments !== 1 ? "s" : ""} enrolled</p>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="text-lg font-bold text-foreground">{s.score}</span>
                      </td>
                      <td className="px-4 py-3 text-center hidden sm:table-cell">
                        <Badge variant="outline" className={`text-[10px] ${badge.className}`}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3 text-center hidden md:table-cell text-muted-foreground">
                        {s.completedLessons}/{s.totalLessons}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <Progress value={s.avgProgress} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-8">{s.avgProgress}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">No students found</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminEngagement;
