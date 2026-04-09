import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, BookOpen, TrendingUp, BarChart3, GraduationCap, Clock } from "lucide-react";

interface CourseCompletion {
  course_id: string;
  course_title: string;
  total_enrolled: number;
  total_chapters: number;
  avg_completed_chapters: number;
  completion_rate: number;
}

interface OfferingMetric {
  offering_id: string;
  offering_title: string;
  total_enrolments: number;
  active_enrolments: number;
  revenue_inr: number;
}

interface DailySignup {
  date: string;
  count: number;
}

const AdminAnalytics = () => {
  const [courseCompletions, setCourseCompletions] = useState<CourseCompletion[]>([]);
  const [offeringMetrics, setOfferingMetrics] = useState<OfferingMetric[]>([]);
  const [dailySignups, setDailySignups] = useState<DailySignup[]>([]);
  const [topStats, setTopStats] = useState({ totalUsers: 0, activeEnrolments: 0, totalRevenue: 0, avgCompletion: 0 });
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "all">("30d");

  const loadAll = async () => {
    setLoading(true);

    const cutoff = period === "all" ? null : new Date(
      Date.now() - ({ "7d": 7, "30d": 30, "90d": 90 }[period]) * 86400000
    ).toISOString();

    // Top-level stats
    const [usersRes, enrolmentsRes, revenueRes] = await Promise.all([
      supabase.from("users").select("id", { count: "exact", head: true }),
      supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("status", "active"),
      supabase.from("payment_orders").select("total_inr").eq("status", "captured"),
    ]);

    const totalRevenue = (revenueRes.data || []).reduce((sum, o) => sum + Number(o.total_inr || 0), 0);

    // Course completion data
    const { data: courses } = await supabase
      .from("courses")
      .select("id, title")
      .eq("status", "published");

    const completions: CourseCompletion[] = [];
    if (courses) {
      for (const course of courses.slice(0, 20)) {
        const { data: chapters } = await supabase
          .from("chapters")
          .select("id, section_id")
          .eq("sections.course_id", course.id);

        // Count chapters via sections join
        const { count: chapterCount } = await supabase
          .from("chapters")
          .select("id, sections!inner(course_id)", { count: "exact", head: true })
          .eq("sections.course_id", course.id);

        // Count enrolled users
        const { data: enrolments } = await supabase
          .from("enrolments")
          .select("user_id, offering_id")
          .eq("status", "active");

        const { data: offeringCourses } = await supabase
          .from("offering_courses")
          .select("offering_id")
          .eq("course_id", course.id);

        const relevantOfferingIds = new Set((offeringCourses || []).map((oc) => oc.offering_id));
        const enrolledUserIds = [...new Set(
          (enrolments || []).filter((e) => relevantOfferingIds.has(e.offering_id)).map((e) => e.user_id)
        )];

        if (enrolledUserIds.length === 0 || !chapterCount) continue;

        // Average progress
        const { data: progress } = await supabase
          .from("chapter_progress")
          .select("user_id, is_completed")
          .eq("course_id", course.id)
          .eq("is_completed", true)
          .in("user_id", enrolledUserIds.slice(0, 100));

        const completedPerUser: Record<string, number> = {};
        (progress || []).forEach((p) => {
          completedPerUser[p.user_id] = (completedPerUser[p.user_id] || 0) + 1;
        });

        const avgCompleted = Object.values(completedPerUser).reduce((s, v) => s + v, 0) / enrolledUserIds.length;
        const rate = chapterCount > 0 ? Math.round((avgCompleted / chapterCount) * 100) : 0;

        completions.push({
          course_id: course.id,
          course_title: course.title,
          total_enrolled: enrolledUserIds.length,
          total_chapters: chapterCount,
          avg_completed_chapters: Math.round(avgCompleted * 10) / 10,
          completion_rate: rate,
        });
      }
    }

    // Offering metrics
    const { data: offerings } = await supabase
      .from("offerings")
      .select("id, title")
      .eq("status", "active");

    const metrics: OfferingMetric[] = [];
    if (offerings) {
      for (const off of offerings) {
        const [totalRes, activeRes, revRes] = await Promise.all([
          supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("offering_id", off.id),
          supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("offering_id", off.id).eq("status", "active"),
          supabase.from("payment_orders").select("total_inr").eq("offering_id", off.id).eq("status", "captured"),
        ]);
        const rev = (revRes.data || []).reduce((s, o) => s + Number(o.total_inr || 0), 0);
        metrics.push({
          offering_id: off.id,
          offering_title: off.title,
          total_enrolments: totalRes.count ?? 0,
          active_enrolments: activeRes.count ?? 0,
          revenue_inr: rev,
        });
      }
    }

    // Daily signups (last N days)
    const signups: DailySignup[] = [];
    const days = period === "all" ? 90 : { "7d": 7, "30d": 30, "90d": 90 }[period];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart)
        .lt("created_at", dayEnd);
      signups.push({ date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count: count ?? 0 });
    }

    const avgRate = completions.length > 0
      ? Math.round(completions.reduce((s, c) => s + c.completion_rate, 0) / completions.length)
      : 0;

    setTopStats({
      totalUsers: usersRes.count ?? 0,
      activeEnrolments: enrolmentsRes.count ?? 0,
      totalRevenue,
      avgCompletion: avgRate,
    });
    setCourseCompletions(completions.sort((a, b) => b.total_enrolled - a.total_enrolled));
    setOfferingMetrics(metrics.sort((a, b) => b.revenue_inr - a.revenue_inr));
    setDailySignups(signups);
    setLoading(false);
  };

  useEffect(() => { loadAll(); }, [period]);

  const formatINR = (n: number) => "₹" + n.toLocaleString("en-IN");

  const maxSignup = Math.max(...dailySignups.map((d) => d.count), 1);

  return (
    <AdminLayout title="Analytics">
      <div className="flex items-center gap-4 mb-6">
        <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">Last 7 days</SelectItem>
            <SelectItem value="30d">Last 30 days</SelectItem>
            <SelectItem value="90d">Last 90 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="py-20 text-center text-muted-foreground">Loading analytics...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                  <p className="text-2xl font-semibold">{topStats.totalUsers.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <GraduationCap className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Active Enrolments</p>
                  <p className="text-2xl font-semibold">{topStats.activeEnrolments.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-semibold">{formatINR(topStats.totalRevenue)}</p>
                </div>
              </div>
            </Card>
            <Card className="p-5">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Avg Completion</p>
                  <p className="text-2xl font-semibold">{topStats.avgCompletion}%</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Daily Signups Chart */}
          <Card className="p-5 mb-8">
            <h3 className="font-medium mb-4">Daily Signups</h3>
            <div className="flex items-end gap-[2px] h-32">
              {dailySignups.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center group relative">
                  <div
                    className="w-full bg-[hsl(var(--cream))] rounded-t-sm min-h-[2px] transition-all hover:opacity-80"
                    style={{ height: `${(d.count / maxSignup) * 100}%` }}
                  />
                  <div className="absolute -top-7 bg-card border border-border px-2 py-0.5 rounded text-xs opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                    {d.date}: {d.count}
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-1 text-[10px] text-muted-foreground">
              <span>{dailySignups[0]?.date}</span>
              <span>{dailySignups[dailySignups.length - 1]?.date}</span>
            </div>
          </Card>

          {/* Course Completion Table */}
          <Card className="p-5 mb-8">
            <h3 className="font-medium mb-4">
              <BookOpen className="inline h-4 w-4 mr-2 -mt-0.5" />Course Completion Rates
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Course</th>
                    <th className="pb-2 font-medium text-right">Enrolled</th>
                    <th className="pb-2 font-medium text-right">Chapters</th>
                    <th className="pb-2 font-medium text-right">Avg Done</th>
                    <th className="pb-2 font-medium">Completion</th>
                  </tr>
                </thead>
                <tbody>
                  {courseCompletions.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No course data</td></tr>
                  ) : courseCompletions.map((c) => (
                    <tr key={c.course_id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 font-medium">{c.course_title}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{c.total_enrolled}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{c.total_chapters}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{c.avg_completed_chapters}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-secondary rounded-full h-2 max-w-[120px]">
                            <div
                              className="bg-[hsl(var(--cream))] h-2 rounded-full transition-all"
                              style={{ width: `${Math.min(c.completion_rate, 100)}%` }}
                            />
                          </div>
                          <span className="font-mono text-xs w-10 text-right">{c.completion_rate}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Offering Metrics Table */}
          <Card className="p-5">
            <h3 className="font-medium mb-4">
              <TrendingUp className="inline h-4 w-4 mr-2 -mt-0.5" />Offering Performance
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="pb-2 font-medium">Offering</th>
                    <th className="pb-2 font-medium text-right">Total Enrolments</th>
                    <th className="pb-2 font-medium text-right">Active</th>
                    <th className="pb-2 font-medium text-right">Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {offeringMetrics.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No offering data</td></tr>
                  ) : offeringMetrics.map((m) => (
                    <tr key={m.offering_id} className="border-b border-border/50 last:border-0">
                      <td className="py-2.5 font-medium">{m.offering_title}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{m.total_enrolments}</td>
                      <td className="py-2.5 text-right font-mono text-xs">{m.active_enrolments}</td>
                      <td className="py-2.5 text-right font-mono text-xs font-medium">{formatINR(m.revenue_inr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminAnalytics;
