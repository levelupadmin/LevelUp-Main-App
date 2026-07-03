import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ProgressRing } from "@/components/progress/ProgressRing";
import { CountUp } from "@/components/motion/CountUp";

interface WeekSummary {
  /** completion % of the most-active (last-touched) enrolled course */
  topPct: number;
  /** completed lessons across all enrolled courses */
  lessonsDone: number;
  /** 1-based next-lesson number in the most-active course */
  nextLessonNumber: number;
  /** total lessons in the most-active course */
  topTotal: number;
  /** the most-active course is fully completed → show a review affordance */
  allComplete: boolean;
  /** route to resume the most-active course's next lesson */
  resumeTo: string;
}

// ── Your Week ──
// A compact glance-strip directly under the greeting: the progress ring for the
// most-active (last-touched) enrolled course, a lessons-completed count, and a
// next-lesson affordance to resume. Data is derived with the SAME inline
// chapter_progress → sections → chapters query shape used by ContinueLearning
// and MyCoursesPage (no shared hook, no new tables/RPCs). Renders nothing until
// a summary exists, so zero-enrolment users never see it (Home also gates this
// behind hasEnrolments, mirroring ContinueLearning).
const YourWeek = () => {
  const { user } = useAuth();
  const [summary, setSummary] = useState<WeekSummary | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        if (!user) return;

        const { data: enrolments } = await supabase
          .from("enrolments")
          .select("id, offering_id")
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

        // chapter_progress drives BOTH the per-course completion math AND the
        // last-touched ordering (most-active course), mirroring ContinueLearning.
        // Scoped to enrolled courses (`.in("course_id", courseIds)`) so the
        // lessons-completed count matches MyCoursesPage exactly — orphaned or
        // un-enrolled-course progress rows don't inflate it.
        const progressPromise = supabase
          .from("chapter_progress")
          .select("chapter_id, course_id, completed_at, updated_at")
          .eq("user_id", user.id)
          .in("course_id", courseIds);

        const { data: sectionsData } = await supabase
          .from("sections")
          .select("id, course_id, sort_order")
          .in("course_id", courseIds)
          .order("sort_order");

        const sectionCourseMap: Record<string, string> = {};
        const sectionSortMap: Record<string, number> = {};
        (sectionsData ?? []).forEach((s) => {
          sectionCourseMap[s.id] = s.course_id;
          sectionSortMap[s.id] = s.sort_order;
        });

        const sectionIds = (sectionsData ?? []).map((s) => s.id);

        const emptyChapters: { id: string; section_id: string; sort_order: number }[] = [];
        const [chaptersRes, progressRes] = await Promise.all([
          sectionIds.length
            ? supabase
                .from("chapters")
                .select("id, section_id, sort_order")
                .in("section_id", sectionIds)
                .order("sort_order")
            : Promise.resolve({ data: emptyChapters }),
          progressPromise,
        ]);

        const allChapters = chaptersRes.data ?? [];
        const progressData = progressRes.data ?? [];

        const completedSet = new Set(
          progressData.filter((p) => p.completed_at).map((p) => p.chapter_id)
        );

        // Lessons completed across every enrolled course = the count of
        // distinct completed chapters in enrolled courses (the progress query
        // is scoped to courseIds above, so this matches MyCoursesPage's stat).
        const lessonsDone = completedSet.size;

        // Last-touched timestamp per course → picks the most-active course.
        const lastTouchedMap: Record<string, number> = {};
        for (const p of progressData) {
          if (!p.course_id || !p.updated_at) continue;
          const t = new Date(p.updated_at).getTime();
          if (!lastTouchedMap[p.course_id] || t > lastTouchedMap[p.course_id]) {
            lastTouchedMap[p.course_id] = t;
          }
        }

        // Most-active course: highest last-touched timestamp, else the first
        // enrolled course (freshly enrolled, never opened) so the ring still shows.
        const topCourseId =
          [...courseIds].sort(
            (a, b) => (lastTouchedMap[b] ?? 0) - (lastTouchedMap[a] ?? 0)
          )[0] ?? null;

        if (!topCourseId) return;

        const topChapters = allChapters
          .filter((ch) => sectionCourseMap[ch.section_id] === topCourseId)
          .sort((a, b) => {
            const sa = sectionSortMap[a.section_id] ?? 0;
            const sb = sectionSortMap[b.section_id] ?? 0;
            return sa !== sb ? sa - sb : a.sort_order - b.sort_order;
          });

        const topTotal = topChapters.length;
        const topDone = topChapters.filter((ch) => completedSet.has(ch.id)).length;
        const topPct = topTotal > 0 ? Math.round((topDone / topTotal) * 100) : 0;

        // Next uncompleted chapter (and its 1-based position). If everything is
        // done, point at the last lesson for a re-watch — same rule as ContinueLearning.
        const nextIdx = topChapters.findIndex((ch) => !completedSet.has(ch.id));
        const allComplete = nextIdx === -1;
        const resolvedIdx = allComplete ? Math.max(topTotal - 1, 0) : nextIdx;
        const nextChapter = topChapters[resolvedIdx];

        const resumeTo =
          !allComplete && nextChapter?.id
            ? `/chapters/${nextChapter.id}`
            : `/courses/${topCourseId}`;

        if (cancelled) return;
        setSummary({
          topPct,
          lessonsDone,
          nextLessonNumber: topTotal > 0 ? resolvedIdx + 1 : 0,
          topTotal,
          allComplete: topTotal > 0 && allComplete,
          resumeTo,
        });
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load Your Week:", err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Zero-enrolment (or not-yet-loaded) users get nothing — Home already handles
  // discovery below, so an empty strip would just be a dead block.
  if (!summary) return null;

  // Completed course → a review prompt, not "Lesson N of N" (mirrors
  // ContinueLearning's "Review" CTA for the all-done state).
  const nextLabel = summary.allComplete
    ? "Course complete · Review"
    : summary.topTotal > 0 && summary.nextLessonNumber > 0
      ? `Lesson ${summary.nextLessonNumber} of ${summary.topTotal}`
      : "Start watching";

  return (
    <Link
      to={summary.resumeTo}
      className="pressable group flex items-center gap-4 rounded-2xl bg-surface ring-1 ring-white/5 hover:ring-[hsl(var(--cream))]/30 px-4 py-3.5 sm:px-5 sm:py-4 transition-[box-shadow,transform] duration-300 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)]"
    >
      <ProgressRing pct={summary.topPct} size={52} label className="shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-sm sm:text-base font-semibold tracking-[-0.01em]">
          <CountUp value={summary.lessonsDone} />{" "}
          {summary.lessonsDone === 1 ? "lesson" : "lessons"} completed
        </p>
        <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 truncate">
          {nextLabel}
        </p>
      </div>

      <span className="shrink-0 flex items-center gap-1 text-sm font-medium text-[hsl(var(--cream))]">
        <span className="hidden sm:inline">{summary.allComplete ? "Review" : "Resume"}</span>
        <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
      </span>
    </Link>
  );
};

export default YourWeek;
