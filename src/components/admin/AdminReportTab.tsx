import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart3, Trophy, Users, TrendingUp } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Props {
  courseId: string;
  lessons: { id: string; title: string; module_id: string }[];
  modules: { id: string; title: string }[];
}

const useEnrollments = (courseId: string) =>
  useQuery({
    queryKey: ["admin-enrollments", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("enrollments")
        .select("*")
        .eq("course_id", courseId);
      if (error) throw error;
      return data;
    },
  });

const useAllProgress = (courseId: string) =>
  useQuery({
    queryKey: ["admin-all-progress", courseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lesson_progress")
        .select("*")
        .eq("course_id", courseId);
      if (error) throw error;
      return data;
    },
  });

const useProgressProfiles = (userIds: string[]) =>
  useQuery({
    queryKey: ["profiles", userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url")
        .in("id", userIds);
      if (error) throw error;
      return data;
    },
  });

export default function AdminReportTab({ courseId, lessons, modules }: Props) {
  const { data: enrollments = [] } = useEnrollments(courseId);
  const { data: progress = [], isLoading } = useAllProgress(courseId);

  const userIds = [...new Set(enrollments.map((e: any) => e.user_id))];
  const { data: profiles = [] } = useProgressProfiles(userIds);
  const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.id, p]));

  const totalLessons = lessons.length;
  const totalStudents = enrollments.length;

  // Per-student completion
  const studentProgress: Record<string, { completed: number; total: number }> = {};
  enrollments.forEach((e: any) => {
    studentProgress[e.user_id] = { completed: 0, total: totalLessons };
  });
  progress.forEach((p: any) => {
    if (studentProgress[p.user_id] && p.status === "completed") {
      studentProgress[p.user_id].completed++;
    }
  });

  // Completion buckets
  const buckets = { "0%": 0, "1-25%": 0, "26-50%": 0, "51-75%": 0, "76-99%": 0, "100%": 0 };
  Object.values(studentProgress).forEach(({ completed, total }) => {
    const pct = total > 0 ? (completed / total) * 100 : 0;
    if (pct === 0) buckets["0%"]++;
    else if (pct <= 25) buckets["1-25%"]++;
    else if (pct <= 50) buckets["26-50%"]++;
    else if (pct <= 75) buckets["51-75%"]++;
    else if (pct < 100) buckets["76-99%"]++;
    else buckets["100%"]++;
  });

  const COLORS = [
    "hsl(var(--muted-foreground))",
    "hsl(var(--destructive))",
    "hsl(var(--primary))",
    "hsl(210 80% 55%)",
    "hsl(150 60% 45%)",
    "hsl(var(--highlight))",
  ];

  const donutData = Object.entries(buckets).map(([name, value]) => ({ name, value }));

  // Chapter (lesson) completion stats
  const chapterStats = lessons.map((l) => {
    const completedCount = progress.filter((p: any) => p.lesson_id === l.id && p.status === "completed").length;
    return {
      id: l.id,
      title: l.title,
      moduleId: l.module_id,
      completed: completedCount,
      total: totalStudents,
      pct: totalStudents > 0 ? Math.round((completedCount / totalStudents) * 100) : 0,
    };
  });

  // Leaderboard
  const leaderboard = Object.entries(studentProgress)
    .map(([userId, data]) => ({
      userId,
      name: profileMap[userId]?.name || "User",
      completed: data.completed,
      total: data.total,
      pct: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0,
    }))
    .sort((a, b) => b.pct - a.pct || b.completed - a.completed);

  const avgCompletion = totalStudents > 0
    ? Math.round(Object.values(studentProgress).reduce((sum, s) => sum + (s.total > 0 ? (s.completed / s.total) * 100 : 0), 0) / totalStudents)
    : 0;

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <BarChart3 className="h-4 w-4" /> Course Report
        </h3>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Students", value: totalStudents, icon: Users },
          { label: "Avg Completion", value: `${avgCompletion}%`, icon: TrendingUp },
          { label: "Fully Complete", value: buckets["100%"], icon: Trophy },
          { label: "Not Started", value: buckets["0%"], icon: BarChart3 },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <s.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{s.label}</span>
            </div>
            <span className="text-2xl font-bold text-foreground">{s.value}</span>
          </div>
        ))}
      </div>

      <Tabs defaultValue="completion">
        <TabsList className="bg-secondary/50 border border-border">
          <TabsTrigger value="completion" className="text-xs">Course Completion</TabsTrigger>
          <TabsTrigger value="chapters" className="text-xs">Chapter Stats</TabsTrigger>
          <TabsTrigger value="leaderboard" className="text-xs">Leaderboard</TabsTrigger>
        </TabsList>

        <TabsContent value="completion" className="mt-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Donut chart */}
              <div className="flex items-center justify-center">
                {totalStudents > 0 ? (
                  <ResponsiveContainer width={220} height={220}>
                    <PieChart>
                      <Pie data={donutData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} dataKey="value" paddingAngle={2}>
                        {donutData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-sm text-muted-foreground">No enrollment data</p>
                )}
              </div>
              {/* Breakdown table */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-foreground mb-3">Completion Breakdown</h4>
                {Object.entries(buckets).map(([range, count], i) => (
                  <div key={range} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i] }} />
                      <span className="text-sm text-foreground">{range}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-foreground">{count}</span>
                      <span className="text-xs text-muted-foreground w-12 text-right">
                        {totalStudents > 0 ? Math.round((count / totalStudents) * 100) : 0}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="chapters" className="mt-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Chapter</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Module</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Completed</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Completion %</th>
                </tr>
              </thead>
              <tbody>
                {chapterStats.map((ch) => {
                  const mod = modules.find((m) => m.id === ch.moduleId);
                  return (
                    <tr key={ch.id} className="border-b border-border">
                      <td className="px-4 py-2.5 text-foreground truncate max-w-[200px]">{ch.title}</td>
                      <td className="px-4 py-2.5 text-muted-foreground text-xs">{mod?.title || "—"}</td>
                      <td className="px-4 py-2.5 text-right text-muted-foreground">{ch.completed}/{ch.total}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                            <div className="h-full rounded-full bg-primary" style={{ width: `${ch.pct}%` }} />
                          </div>
                          <span className="text-xs font-medium text-foreground w-10 text-right">{ch.pct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {chapterStats.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">No lessons to report on.</p>}
          </div>
        </TabsContent>

        <TabsContent value="leaderboard" className="mt-4">
          <div className="rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground w-12">#</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Completed</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Progress</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.slice(0, 50).map((s, i) => (
                  <tr key={s.userId} className="border-b border-border">
                    <td className="px-4 py-2.5">
                      {i < 3 ? (
                        <span className={`text-sm font-bold ${i === 0 ? "text-yellow-400" : i === 1 ? "text-gray-400" : "text-amber-600"}`}>
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">{i + 1}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-foreground font-medium">{s.name}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground">{s.completed}/{s.total}</td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${s.pct}%` }} />
                        </div>
                        <span className="text-xs font-medium text-foreground w-10 text-right">{s.pct}%</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {leaderboard.length === 0 && <p className="py-8 text-center text-muted-foreground text-sm">No students enrolled yet.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
