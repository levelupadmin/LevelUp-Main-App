import AppShell from "@/components/layout/AppShell";
import { useNavigate } from "react-router-dom";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, CheckCircle2, ArrowRight, BookOpen, Download, Trophy, Search } from "lucide-react";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

type SubTab = "in-progress" | "completed" | "all";

const useMyEnrollments = () =>
  useQuery({
    queryKey: ["my-enrollments-page"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data: enrollments, error } = await supabase
        .from("enrollments")
        .select("*, courses(*)")
        .eq("user_id", user.id)
        .in("status", ["active", "completed"])
        .order("enrolled_at", { ascending: false });
      if (error) throw error;

      const courseIds = enrollments.map((e: any) => e.course_id);
      if (courseIds.length === 0) return [];

      const [{ data: lessons }, { data: progress }] = await Promise.all([
        supabase.from("lessons").select("id, course_id").in("course_id", courseIds),
        supabase.from("lesson_progress").select("lesson_id, status, course_id").eq("user_id", user.id).in("course_id", courseIds),
      ]);

      return enrollments.map((e: any) => {
        const courseLessons = (lessons || []).filter((l: any) => l.course_id === e.course_id);
        const completed = (progress || []).filter((p: any) => p.course_id === e.course_id && p.status === "completed").length;
        const pct = courseLessons.length > 0 ? Math.round((completed / courseLessons.length) * 100) : 0;
        return {
          ...e,
          progressPct: pct,
          completedCount: completed,
          totalLessons: courseLessons.length,
          course: e.courses,
        };
      });
    },
  });

const MyLearning = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<SubTab>("in-progress");
  const [searchQuery, setSearchQuery] = useState("");
  const { data: enrollments = [], isLoading } = useMyEnrollments();

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    let list = enrollments;
    if (activeTab === "in-progress") list = enrollments.filter((e: any) => e.progressPct < 100);
    else if (activeTab === "completed") list = enrollments.filter((e: any) => e.progressPct === 100);
    if (q) list = list.filter((e: any) => e.course?.title?.toLowerCase().includes(q));
    return list;
  }, [enrollments, activeTab, searchQuery]);

  const inProgressCount = enrollments.filter((e: any) => e.progressPct > 0 && e.progressPct < 100).length;
  const completedCount = enrollments.filter((e: any) => e.progressPct === 100).length;
  const totalLessons = enrollments.reduce((a: number, e: any) => a + (e.totalLessons || 0), 0);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl space-y-5 p-4 lg:p-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground lg:text-3xl">My Learning</h1>
          <p className="text-sm text-muted-foreground">Track your progress and continue where you left off</p>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "In Progress", value: inProgressCount, icon: Play },
            { label: "Completed", value: completedCount, icon: Trophy },
            { label: "Total Lessons", value: totalLessons, icon: BookOpen },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg border border-border bg-card p-4 text-center">
              <stat.icon className="h-5 w-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-xl font-bold text-foreground">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search your courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-foreground/30 focus:outline-none"
          />
        </div>

        {/* Sub tabs */}
        <div className="flex items-center gap-6 border-b border-border">
          {([
            { key: "in-progress" as SubTab, label: "In Progress" },
            { key: "completed" as SubTab, label: "Completed" },
            { key: "all" as SubTab, label: "All Courses" },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`border-b-2 pb-3 text-sm font-semibold transition-colors ${
                activeTab === tab.key
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <BookOpen className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-foreground font-medium">
              {activeTab === "completed" ? "No completed courses yet" : "No courses found"}
            </p>
            <Button size="sm" className="mt-4" onClick={() => navigate("/learn")}>Browse courses</Button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((enrollment: any) => {
              const course = enrollment.course;
              if (!course) return null;
              const isComplete = enrollment.progressPct === 100;
              return (
                <div
                  key={enrollment.id}
                  onClick={() => navigate(`/learn/course/${course.slug}/dashboard`)}
                  className="group cursor-pointer rounded-lg border border-border bg-card overflow-hidden transition-colors hover:border-foreground/20"
                >
                  <div className="flex gap-4 p-4">
                    <img
                      src={course.thumbnail_url || "/placeholder.svg"}
                      alt={course.title}
                      className="h-24 w-36 rounded-md object-cover shrink-0"
                    />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] capitalize">{course.course_type}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{course.category}</Badge>
                      </div>
                      <h3 className="text-sm font-bold text-foreground line-clamp-2">{course.title}</h3>
                      <p className="text-xs text-muted-foreground">{course.instructor_name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={enrollment.progressPct} className="h-1.5 flex-1" />
                        <span className="text-xs font-mono text-muted-foreground">{enrollment.progressPct}%</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {enrollment.completedCount}/{enrollment.totalLessons} lessons completed
                      </p>
                    </div>
                  </div>
                  {!isComplete && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/learn/course/${course.slug}/dashboard`);
                      }}
                      className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 bg-secondary/20 transition-colors hover:bg-secondary/30"
                    >
                      <Play className="h-3 w-3 text-foreground" />
                      <span className="text-xs text-muted-foreground">Continue learning</span>
                      <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                    </button>
                  )}
                  {isComplete && (
                    <div className="flex w-full items-center gap-2 border-t border-border px-4 py-2.5 bg-secondary/20">
                      <CheckCircle2 className="h-3 w-3 text-[hsl(var(--success))]" />
                      <span className="text-xs text-muted-foreground">Completed</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default MyLearning;
