import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { MultiSelect, type OptionGroup } from "@/components/ui/multi-select";
import {
  Users, ShoppingCart, Package, IndianRupee, ArrowRight,
  BookOpen, TrendingUp, BarChart3, GraduationCap, Calendar,
} from "lucide-react";

/* ───────────── Types ───────────── */

interface Stats {
  total_students: number;
  active_enrolments: number;
  active_offerings: number;
  total_revenue: number;
}

interface RecentEnrolment {
  id: string;
  status: string;
  created_at: string;
  user_name: string;
  user_email: string;
  offering_title: string;
  offering_id: string;
}

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

interface OfferingOption {
  id: string;
  title: string;
  product_tier?: string;
}

type DatePreset = "today" | "this_week" | "this_month" | "past_30" | "custom";

/* ───────────── Helpers ───────────── */

function getDateRange(preset: DatePreset, customFrom: Date | undefined, customTo: Date | undefined): { from: string | null; to: string | null } {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const endOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();

  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "this_week": {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday as start
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      return { from: startOfDay(monday), to: endOfDay(now) };
    }
    case "this_month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: first.toISOString(), to: endOfDay(now) };
    }
    case "past_30": {
      const past = new Date(Date.now() - 30 * 86400000);
      return { from: startOfDay(past), to: endOfDay(now) };
    }
    case "custom": {
      return {
        from: customFrom ? startOfDay(customFrom) : null,
        to: customTo ? endOfDay(customTo) : null,
      };
    }
  }
}

function daysBetween(from: string | null, to: string | null): number {
  if (!from || !to) return 30;
  return Math.max(Math.ceil((new Date(to).getTime() - new Date(from).getTime()) / 86400000), 1);
}

const formatINR = (n: number) => "\u20B9" + n.toLocaleString("en-IN");

/* ───────────── Component ───────────── */

const AdminDashboard = () => {
  // Date filter state
  const [preset, setPreset] = useState<DatePreset>("past_30");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  // Data state
  const [stats, setStats] = useState<Stats>({ total_students: 0, active_enrolments: 0, active_offerings: 0, total_revenue: 0 });
  const [recent, setRecent] = useState<RecentEnrolment[]>([]);
  const [courseCompletions, setCourseCompletions] = useState<CourseCompletion[]>([]);
  const [offeringMetrics, setOfferingMetrics] = useState<OfferingMetric[]>([]);
  const [dailySignups, setDailySignups] = useState<DailySignup[]>([]);
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);
  const [loading, setLoading] = useState(true);

  // Per-section multi-select offering filter
  const [signupsFilter, setSignupsFilter] = useState<string[]>([]);
  const [completionFilter, setCompletionFilter] = useState<string[]>([]);
  const [offeringPerfFilter, setOfferingPerfFilter] = useState<string[]>([]);
  const [recentFilter, setRecentFilter] = useState<string[]>([]);

  const dateRange = useMemo(() => getDateRange(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    const { from, to } = dateRange;

    /* ── Offerings list (for filter dropdowns) ── */
    const { data: allOfferings } = await supabase.from("offerings").select("id, title, product_tier").eq("status", "active");
    setOfferings((allOfferings || []).map((o: any) => ({ id: o.id, title: o.title, product_tier: o.product_tier })));

    /* ── Summary stats ── */
    let studentsQuery = supabase.from("users").select("id", { count: "exact", head: true }).eq("role", "student");
    if (from) studentsQuery = studentsQuery.gte("created_at", from);
    if (to) studentsQuery = studentsQuery.lt("created_at", to);

    let enrolQuery = supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("status", "active");
    if (from) enrolQuery = enrolQuery.gte("created_at", from);
    if (to) enrolQuery = enrolQuery.lt("created_at", to);

    const offCountQuery = supabase.from("offerings").select("id", { count: "exact", head: true }).eq("status", "active");

    let payQuery = supabase.from("payment_orders").select("total_inr").eq("status", "captured");
    if (from) payQuery = payQuery.gte("created_at", from);
    if (to) payQuery = payQuery.lt("created_at", to);

    const [usersRes, enrolRes, offRes, payRes] = await Promise.all([studentsQuery, enrolQuery, offCountQuery, payQuery]);

    const revenue = (payRes.data || []).reduce((sum, r) => sum + Number(r.total_inr || 0), 0);
    setStats({
      total_students: usersRes.count || 0,
      active_enrolments: enrolRes.count || 0,
      active_offerings: offRes.count || 0,
      total_revenue: revenue,
    });

    /* ── Daily signups ── */
    const days = daysBetween(from, to);
    const signups: DailySignup[] = [];
    const signupStart = from ? new Date(from) : new Date(Date.now() - 30 * 86400000);
    for (let i = 0; i < days && i < 90; i++) {
      const d = new Date(signupStart.getTime() + i * 86400000);
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
      const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).toISOString();
      const { count } = await supabase
        .from("users")
        .select("id", { count: "exact", head: true })
        .gte("created_at", dayStart)
        .lt("created_at", dayEnd);
      signups.push({ date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" }), count: count ?? 0 });
    }
    setDailySignups(signups);

    /* ── Course completion data ── */
    const { data: courses } = await supabase.from("courses").select("id, title").eq("status", "published");
    const completions: CourseCompletion[] = [];
    if (courses) {
      for (const course of courses.slice(0, 20)) {
        const { count: chapterCount } = await supabase
          .from("chapters")
          .select("id, sections!inner(course_id)", { count: "exact", head: true })
          .eq("sections.course_id", course.id);

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
          (enrolments || []).filter((e) => relevantOfferingIds.has(e.offering_id)).map((e) => e.user_id),
        )];

        if (enrolledUserIds.length === 0 || !chapterCount) continue;

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
    setCourseCompletions(completions.sort((a, b) => b.total_enrolled - a.total_enrolled));

    /* ── Offering metrics ── */
    const metrics: OfferingMetric[] = [];
    if (allOfferings) {
      for (const off of allOfferings) {
        let totalQ = supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("offering_id", off.id);
        let activeQ = supabase.from("enrolments").select("id", { count: "exact", head: true }).eq("offering_id", off.id).eq("status", "active");
        let revQ = supabase.from("payment_orders").select("total_inr").eq("offering_id", off.id).eq("status", "captured");
        if (from) { totalQ = totalQ.gte("created_at", from); activeQ = activeQ.gte("created_at", from); revQ = revQ.gte("created_at", from); }
        if (to) { totalQ = totalQ.lt("created_at", to); activeQ = activeQ.lt("created_at", to); revQ = revQ.lt("created_at", to); }
        const [totalRes, activeRes, revRes] = await Promise.all([totalQ, activeQ, revQ]);
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
    setOfferingMetrics(metrics.sort((a, b) => b.revenue_inr - a.revenue_inr));

    /* ── Recent enrolments ── */
    let recentQuery = supabase
      .from("enrolments")
      .select("id, status, created_at, user_id, offering_id")
      .order("created_at", { ascending: false })
      .limit(15);
    if (from) recentQuery = recentQuery.gte("created_at", from);
    if (to) recentQuery = recentQuery.lt("created_at", to);

    const { data: enrolments } = await recentQuery;
    if (enrolments && enrolments.length > 0) {
      const userIds = [...new Set(enrolments.map((e) => e.user_id))];
      const offeringIds = [...new Set(enrolments.map((e) => e.offering_id))];
      const [usersData, offeringsData] = await Promise.all([
        supabase.from("users").select("id, full_name, email").in("id", userIds),
        supabase.from("offerings").select("id, title").in("id", offeringIds),
      ]);
      const usersMap = Object.fromEntries((usersData.data || []).map((u) => [u.id, u]));
      const offMap = Object.fromEntries((offeringsData.data || []).map((o) => [o.id, o]));
      setRecent(
        enrolments.map((e) => ({
          id: e.id,
          status: e.status,
          created_at: e.created_at,
          user_name: usersMap[e.user_id]?.full_name || "Unknown",
          user_email: usersMap[e.user_id]?.email || "",
          offering_title: offMap[e.offering_id]?.title || "Unknown",
          offering_id: e.offering_id,
        })),
      );
    } else {
      setRecent([]);
    }

    setLoading(false);
  }, [dateRange]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Derived filtered data ── */

  const filteredSignups = dailySignups; // signups are user-level, not offering-scoped

  const filteredCompletions = useMemo(() => {
    if (completionFilter.length === 0) return courseCompletions;
    return courseCompletions; // completion is course-level; multi-select is informational
  }, [courseCompletions, completionFilter]);

  const filteredOfferingMetrics = useMemo(() => {
    if (offeringPerfFilter.length === 0) return offeringMetrics;
    return offeringMetrics.filter((m) => offeringPerfFilter.includes(m.offering_id));
  }, [offeringMetrics, offeringPerfFilter]);

  const filteredRecent = useMemo(() => {
    if (recentFilter.length === 0) return recent;
    return recent.filter((e) => recentFilter.includes(e.offering_id));
  }, [recent, recentFilter]);

  /* ── Build grouped options for multi-select ── */
  const TIER_LABELS: Record<string, string> = {
    live_cohort: "Live Cohort",
    masterclass: "Masterclass",
    advanced_program: "Advanced Program",
    workshop: "Workshop",
  };

  const offeringGroups: OptionGroup[] = useMemo(() => {
    // Group offerings by their product_tier
    const tierMap: Record<string, { value: string; label: string }[]> = {};
    offerings.forEach((o) => {
      const tier = (o as any).product_tier || "other";
      if (!tierMap[tier]) tierMap[tier] = [];
      tierMap[tier].push({ value: o.id, label: o.title });
    });
    return Object.entries(tierMap).map(([tier, options]) => ({
      label: TIER_LABELS[tier] || tier,
      options,
    }));
  }, [offerings]);

  const maxSignup = Math.max(...dailySignups.map((d) => d.count), 1);

  /* ── Stat cards ── */
  const statCards = [
    { label: "Total Students", value: stats.total_students, icon: Users, color: "var(--accent-indigo)", link: "/admin/users" },
    { label: "Active Enrolments", value: stats.active_enrolments, icon: ShoppingCart, color: "var(--accent-emerald)", link: "/admin/enrolments" },
    { label: "Active Offerings", value: stats.active_offerings, icon: Package, color: "var(--accent-amber)", link: "/admin/offerings" },
    { label: "Total Revenue", value: formatINR(stats.total_revenue), icon: IndianRupee, color: "var(--accent-crimson)", link: "/admin/revenue" },
  ];

  const presetButtons: { key: DatePreset; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "this_week", label: "This Week" },
    { key: "this_month", label: "This Month" },
    { key: "past_30", label: "Past 30 Days" },
    { key: "custom", label: "Custom" },
  ];

  /* ── Multi-select offering filter (reusable) ── */
  const OfferingFilter = ({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) => (
    <MultiSelect
      groups={offeringGroups}
      selected={value}
      onChange={onChange}
      placeholder="All Offerings"
      className="w-52"
    />
  );

  return (
    <AdminLayout title="Dashboard">
      {/* ── Date Filter Bar ── */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <Calendar className="h-4 w-4 text-muted-foreground mr-1" />
        {presetButtons.map((btn) => (
          <Button
            key={btn.key}
            variant={preset === btn.key ? "default" : "ghost"}
            size="sm"
            onClick={() => setPreset(btn.key)}
          >
            {btn.label}
          </Button>
        ))}
        {preset === "custom" && (
          <DateRangePicker
            from={customFrom}
            to={customTo}
            onChange={({ from, to }) => { setCustomFrom(from); setCustomTo(to); }}
            className="ml-2"
          />
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 border-2 border-[hsl(var(--accent-amber))] border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Stat Cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {statCards.map((card) => (
              <Link
                key={card.label}
                to={card.link}
                className="bg-card border border-border rounded-xl p-5 hover:border-border-hover transition-colors group"
              >
                <div className="flex items-center justify-between mb-3">
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ background: `hsl(${card.color} / 0.15)` }}
                  >
                    <card.icon className="h-5 w-5" style={{ color: `hsl(${card.color})` }} />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <p className="text-[32px] font-bold leading-tight">{card.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{card.label}</p>
              </Link>
            ))}
          </div>

          {/* ── Daily Signups Chart ── */}
          <Card className="p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />Daily Signups
              </h3>
              <OfferingFilter value={signupsFilter} onChange={setSignupsFilter} />
            </div>
            {filteredSignups.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No signup data for this period</p>
            ) : (
              <>
                <div className="flex items-end gap-[2px] h-32">
                  {filteredSignups.map((d, i) => (
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
                  <span>{filteredSignups[0]?.date}</span>
                  <span>{filteredSignups[filteredSignups.length - 1]?.date}</span>
                </div>
              </>
            )}
          </Card>

          {/* ── Course Completion Rates ── */}
          <Card className="p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2">
                <BookOpen className="h-4 w-4" />Course Completion Rates
              </h3>
              <OfferingFilter value={completionFilter} onChange={setCompletionFilter} />
            </div>
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
                  {filteredCompletions.length === 0 ? (
                    <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">No course data</td></tr>
                  ) : filteredCompletions.map((c) => (
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

          {/* ── Offering Performance ── */}
          <Card className="p-5 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />Offering Performance
              </h3>
              <OfferingFilter value={offeringPerfFilter} onChange={setOfferingPerfFilter} />
            </div>
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
                  {filteredOfferingMetrics.length === 0 ? (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">No offering data</td></tr>
                  ) : filteredOfferingMetrics.map((m) => (
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

          {/* ── Recent Enrolments ── */}
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />Recent Enrolments
              </h2>
              <div className="flex items-center gap-3">
                <OfferingFilter value={recentFilter} onChange={setRecentFilter} />
                <Link to="/admin/enrolments" className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1">
                  View all <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-left">
                    <th className="px-5 py-3 font-medium">Student</th>
                    <th className="px-5 py-3 font-medium">Offering</th>
                    <th className="px-5 py-3 font-medium">Date</th>
                    <th className="px-5 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecent.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                        No enrolments found
                      </td>
                    </tr>
                  ) : (
                    filteredRecent.map((e) => (
                      <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                        <td className="px-5 py-3">
                          <p className="font-medium">{e.user_name}</p>
                          <p className="text-xs text-muted-foreground">{e.user_email}</p>
                        </td>
                        <td className="px-5 py-3">{e.offering_title}</td>
                        <td className="px-5 py-3 font-mono text-xs">
                          {new Date(e.created_at).toLocaleDateString("en-IN")}
                        </td>
                        <td className="px-5 py-3">
                          <span className={`inline-block text-xs font-mono px-2 py-0.5 rounded ${
                            e.status === "active"
                              ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                              : "bg-secondary text-muted-foreground"
                          }`}>
                            {e.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
