import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowRight, Play } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ContinueLearning = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  const { data: enrolledCourses = [], isLoading } = useQuery({
    queryKey: ["continue-learning", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      // Get active enrollments with course info
      const { data: enrollments, error: enrollErr } = await supabase
        .from("enrollments")
        .select("*, courses!enrollments_course_id_fkey(id, title, slug, thumbnail_url, category, course_type)")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("enrolled_at", { ascending: false });

      if (enrollErr) throw enrollErr;
      if (!enrollments || enrollments.length === 0) return [];

      // Get lesson progress for each course
      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("course_id, status")
        .eq("user_id", user!.id);

      // Get total lessons per course
      const courseIds = enrollments.map((e) => e.course_id);
      const { data: lessons } = await supabase
        .from("lessons")
        .select("course_id")
        .in("course_id", courseIds);

      // Build progress map
      const totalLessonsMap: Record<string, number> = {};
      const completedLessonsMap: Record<string, number> = {};

      (lessons || []).forEach((l) => {
        totalLessonsMap[l.course_id] = (totalLessonsMap[l.course_id] || 0) + 1;
      });

      (progress || []).forEach((p) => {
        if (p.status === "completed") {
          completedLessonsMap[p.course_id] = (completedLessonsMap[p.course_id] || 0) + 1;
        }
      });

      return enrollments
        .map((e) => {
          const total = totalLessonsMap[e.course_id] || 0;
          const completed = completedLessonsMap[e.course_id] || 0;
          const progressPct = total > 0 ? Math.round((completed / total) * 100) : 0;
          return {
            id: e.course_id,
            slug: e.courses?.slug || e.course_id,
            title: e.courses?.title || "Untitled",
            thumbnail: e.courses?.thumbnail_url || "/placeholder.svg",
            category: e.courses?.category || "",
            courseType: e.courses?.course_type || "masterclass",
            progress: progressPct,
            completedLessons: completed,
            totalLessons: total,
          };
        })
        .filter((c) => c.progress > 0 && c.progress < 100);
    },
  });

  if (isLoading) {
    return (
      <section className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
        </div>
      </section>
    );
  }

  if (enrolledCourses.length === 0) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-foreground">Continue learning</h2>
        <button
          onClick={() => navigate("/learn/my-learning")}
          className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {enrolledCourses.slice(0, 4).map((course) => (
          <div
            key={course.id}
            onClick={() => navigate(`/learn/course/${course.slug}`)}
            className="group cursor-pointer rounded-xl border border-border bg-card p-4 transition-colors hover:border-muted-foreground/20"
          >
            <div className="flex gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg">
                <img src={course.thumbnail} alt={course.title} className="h-full w-full object-cover" />
              </div>
              <div className="flex-1">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{course.category}</p>
                <h3 className="mt-1 text-sm font-bold text-foreground">{course.title}</h3>
                <div className="mt-2 h-1 rounded-full bg-accent">
                  <div className="h-full rounded-full bg-foreground" style={{ width: `${course.progress}%` }} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {course.completedLessons}/{course.totalLessons} lessons · {course.progress}% complete
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default ContinueLearning;
