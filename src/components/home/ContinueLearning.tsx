import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import LazyImage from "@/components/LazyImage";
import { Link } from "react-router-dom";
import { ArrowRight, BookOpen, Play } from "lucide-react";
import { Section, EmptyState, ErrorState, SkeletonCard } from "@/components/patterns";
import CourseRatingBadge from "@/components/reviews/CourseRatingBadge";

// ── Continue Learning ──
const ContinueLearning = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progressMap, setProgressMap] = useState<Record<string, number>>({});
  const [nextChapterMap, setNextChapterMap] = useState<Record<string, string | null>>({});

  const fetchEnrolled = async () => {
    setError(false);
    setLoading(true);
    try {
      if (!user) { setLoading(false); return; }

      // chapter_progress only depends on user.id, so kick it off in
      // parallel with the enrolment/offering/course chain. Previously
      // this ran as the 6th sequential query; now it overlaps with the
      // entire chain and typically arrives before we need it, saving
      // one round-trip on the critical path to first render.
      const progressPromise = supabase
        .from("chapter_progress")
        .select("chapter_id, completed_at")
        .eq("user_id", user.id);

      const { data: enrolments } = await supabase
        .from("enrolments")
        .select("id, offering_id, created_at")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!enrolments?.length) return;

      const offeringIds = enrolments.map((e) => e.offering_id);
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("offering_id, course_id")
        .in("offering_id", offeringIds);

      if (!ocs?.length) return;

      const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

      // Fire courses + sections in parallel — both only need
      // courseIds which is already computed above.
      const [coursesRes, sectionsRes] = await Promise.all([
        supabase
          .from("courses")
          .select("id, slug, title, description, instructor_display_name, thumbnail_url")
          .in("id", courseIds),
        supabase
          .from("sections")
          .select("id, course_id, sort_order")
          .in("course_id", courseIds)
          .order("sort_order"),
      ]);

      const coursesData = coursesRes.data;
      const sectionsData = sectionsRes.data;

      setCourses(coursesData ?? []);

      // Calculate progress and find next uncompleted chapter
      if (coursesData?.length) {
        const sectionCourseMap: Record<string, string> = {};
        const sectionSortMap: Record<string, number> = {};
        (sectionsData ?? []).forEach((s: any) => {
          sectionCourseMap[s.id] = s.course_id;
          sectionSortMap[s.id] = s.sort_order;
        });

        const sectionIds = (sectionsData ?? []).map((s: any) => s.id);

        // chapters must wait for sectionIds, but chapter_progress
        // fired at the top of this function — await them together so
        // whichever finishes last is the only thing we actually block
        // on.
        const [chaptersRes, progressRes] = await Promise.all([
          sectionIds.length
            ? supabase
                .from("chapters")
                .select("id, section_id, sort_order")
                .in("section_id", sectionIds)
                .order("sort_order")
            : Promise.resolve({ data: [] as any[] }),
          progressPromise,
        ]);

        const allChapters = chaptersRes.data ?? [];
        const progressData = progressRes.data ?? [];

        const completedSet = new Set(
          progressData.filter((p: any) => p.completed_at).map((p: any) => p.chapter_id)
        );

        const pMap: Record<string, number> = {};
        const ncMap: Record<string, string | null> = {};

        for (const cId of courseIds) {
          const courseChapters = allChapters
            .filter((ch: any) => sectionCourseMap[ch.section_id] === cId)
            .sort((a: any, b: any) => {
              const sa = sectionSortMap[a.section_id] ?? 0;
              const sb = sectionSortMap[b.section_id] ?? 0;
              return sa !== sb ? sa - sb : a.sort_order - b.sort_order;
            });
          const totalForCourse = courseChapters.length;
          const doneForCourse = courseChapters.filter((ch: any) => completedSet.has(ch.id)).length;
          pMap[cId] = totalForCourse > 0 ? Math.round((doneForCourse / totalForCourse) * 100) : 0;

          // Find first uncompleted chapter
          const nextChapter = courseChapters.find((ch: any) => !completedSet.has(ch.id));
          ncMap[cId] = nextChapter ? nextChapter.id : null; // null means all complete
        }
        setProgressMap(pMap);
        setNextChapterMap(ncMap);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error("Failed to load enrolled courses:", err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEnrolled();
  }, [user]);

  if (loading) return (
    <Section title="Continue learning" density="compact">
      <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-2">
        {[1, 2, 3].map((i) => (
          <SkeletonCard key={i} variant="media" className="min-w-[300px] max-w-[320px] flex-shrink-0" />
        ))}
      </div>
    </Section>
  );

  if (error) return (
    <Section title="Continue learning" density="compact">
      <ErrorState
        variant="inline"
        title="Couldn't load your courses"
        description="Check your connection and try again."
        onRetry={fetchEnrolled}
      />
    </Section>
  );

  if (!courses.length) return (
    <Section title="Continue learning" density="compact">
      <EmptyState
        icon={<BookOpen className="h-5 w-5" />}
        title="You're not enrolled in any courses yet"
        description="Browse programs below to get started."
        action={{ to: "/browse", label: "Browse courses" }}
      />
    </Section>
  );

  return (
    <Section title="Continue learning" density="compact">
      <div className="relative">
        <div className="flex gap-4 sm:gap-5 overflow-x-auto snap-x hide-scrollbar pb-2 -mx-1 px-1">
          {courses.map((c) => {
              const pct = progressMap[c.id] || 0;
              const allComplete = pct === 100 || (nextChapterMap[c.id] === null && pct > 0);
              const linkTo = allComplete
                ? `/courses/${c.id}`
                : nextChapterMap[c.id]
                  ? `/chapters/${nextChapterMap[c.id]}`
                  : `/courses/${c.id}`;
              return (
                <Link
                  key={c.id}
                  to={linkTo}
                  className="group min-w-[78vw] sm:min-w-[320px] lg:min-w-[340px] max-w-[360px] bg-surface rounded-2xl overflow-hidden flex-shrink-0 snap-start ring-1 ring-white/5 hover:ring-[hsl(var(--cream))]/30 hover:-translate-y-1 transition-all duration-300 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)]"
                >
                  <div className="aspect-video bg-surface-2 relative overflow-hidden">
                    {c.thumbnail_url && (
                      <LazyImage
                        src={c.thumbnail_url}
                        alt=""
                        className="w-full h-full group-hover:scale-[1.04] transition-transform duration-500"
                      />
                    )}
                    {/* Hover Play overlay - subtle, only shows on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <span className="h-12 w-12 rounded-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] flex items-center justify-center shadow-lg">
                        <Play className="h-5 w-5 fill-current ml-0.5" />
                      </span>
                    </div>
                    {/* Bottom gradient strip for the progress bar overlay */}
                    {pct > 0 && pct < 100 && (
                      <>
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40" />
                        <div
                          className="absolute bottom-0 left-0 h-1 bg-[hsl(var(--cream))]"
                          style={{ width: `${pct}%` }}
                        />
                      </>
                    )}
                  </div>
                  <div className="p-4 sm:p-5 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base sm:text-lg font-semibold tracking-[-0.01em] line-clamp-1 flex-1">{c.title}</h3>
                      <CourseRatingBadge courseId={c.id} />
                    </div>
                    {c.instructor_display_name && (
                      <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                    )}
                    <p className="text-sm text-[hsl(var(--cream))] mt-3 flex items-center gap-1 font-medium">
                      {allComplete
                        ? "Review"
                        : pct > 0
                          ? `${pct}% complete · Resume`
                          : "Start watching"}
                      <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                    </p>
                  </div>
                </Link>
              );
            })}
        </div>
        {/* Right-edge fade gradient to hint more content exists */}
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-canvas to-transparent" />
      </div>
    </Section>
  );
};

export default ContinueLearning;
