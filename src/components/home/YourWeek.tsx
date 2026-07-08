import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ProgressRing } from "@/components/progress/ProgressRing";
import { CountUp } from "@/components/motion/CountUp";
import { MotionCard } from "@/components/motion/MotionCard";
import { celebrate } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { deriveWeekSummary, type WeekSummary } from "./yourWeekDerive";

// Weekly-consistency line is a Rahul-decision, NOT yet granted (phase-4 brief
// product-call rule): it stays behind a DEFAULT-OFF flag so it never renders in
// any default build. Only an explicit `VITE_FEATURE_WEEKLY_CONSISTENCY=true`
// build surfaces it. Read at render time (not module scope) so it stays a pure
// function of the current env — no build-time freeze that tests can't override.
const weeklyConsistencyEnabled = () =>
  import.meta.env.VITE_FEATURE_WEEKLY_CONSISTENCY === "true";

// localStorage key holding the highest consecutive-week count already shown, so
// the calm "n weeks of showing up" line only celebrates (anim-rise + haptic) on
// a genuine increment, never on every visit.
const WEEKS_SEEN_KEY = "lu_weeks_seen";

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
  // Whether THIS mount should play the entrance on the consistency line (only
  // when the streak has grown since the last visit — see the effect below).
  const [celebrateWeeks, setCelebrateWeeks] = useState(false);

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

        // All the enrolled-user math lives in the pure `deriveWeekSummary` so it
        // can be unit-tested without a live database (this component only does I/O).
        const derived = deriveWeekSummary({
          offeringCourses: ocs,
          sections: sectionsData,
          chapters: chaptersRes.data,
          progress: progressRes.data,
        });

        if (cancelled || !derived) return;
        setSummary(derived);
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load Your Week:", err);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Weekly-consistency celebration bookkeeping. Only fires under the (default-off)
  // flag; compares the derived streak against the highest value already shown
  // (localStorage) and, on a genuine increment, arms the entrance animation +
  // a single celebrate() haptic. Never runs for n<2 (no zero/guilt state), and
  // reduced-motion users still get the static line — anim-rise self-disables via
  // its `prefers-reduced-motion: no-preference` guard, and the haptic is a touch
  // cue, not visual motion. Wrapped in try/catch so a locked-down WebView storage
  // (private mode / disabled cookies) degrades to "no celebration", never a throw.
  const weeks = summary?.consecutiveActiveWeeks ?? 0;
  useEffect(() => {
    if (!weeklyConsistencyEnabled() || weeks < 2) return;
    try {
      const prevSeen = Number(localStorage.getItem(WEEKS_SEEN_KEY)) || 0;
      if (weeks > prevSeen) {
        setCelebrateWeeks(true);
        void celebrate();
      }
      localStorage.setItem(WEEKS_SEEN_KEY, String(weeks));
    } catch {
      /* storage unavailable → skip the one-time celebration, still render the line */
    }
  }, [weeks]);

  // Zero-enrolment (or not-yet-loaded) users get nothing — Home already handles
  // discovery below, so an empty strip would just be a dead block.
  if (!summary) return null;

  // Weekly-consistency line: shown ONLY when the flag is on AND the streak is
  // ≥2 weeks. Calm register — a single serif-italic, no counter/fire/warning.
  const showWeeks = weeklyConsistencyEnabled() && summary.consecutiveActiveWeeks >= 2;

  // Completed course → a review prompt, not "Lesson N of N" (mirrors
  // ContinueLearning's "Review" CTA for the all-done state).
  const nextLabel = summary.allComplete
    ? "Course complete · Review"
    : summary.topTotal > 0 && summary.nextLessonNumber > 0
      ? `Lesson ${summary.nextLessonNumber} of ${summary.topTotal}`
      : "Start watching";

  // The press/hover lift comes from MotionCard's shared snap/glide springs (the
  // same primitive ContinueLearning's cards and CatalogCard use), NOT the legacy
  // .pressable CSS or a one-off transform transition. `asChild` layers those
  // springs onto the native <Link> so client-side routing + anchor semantics are
  // preserved; the className keeps only the shadow/ring transition (transform is
  // owned by the spring). See MotionCard for the reduced-motion / coarse-pointer
  // gating that used to be absent here. tabIndex={0} is REQUIRED: with no
  // onClick, MotionCard is non-interactive and resolves tabIndex=-1, which Slot
  // would merge onto the anchor and drop this card from the keyboard tab order.
  return (
    <MotionCard asChild tabIndex={0}>
      <Link
        to={summary.resumeTo}
        className="group flex items-center gap-4 rounded-2xl bg-surface ring-1 ring-white/5 [@media(hover:hover)]:hover:ring-[hsl(var(--cream))]/30 px-4 py-3.5 sm:px-5 sm:py-4 transition-shadow duration-base shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] [@media(hover:hover)]:hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)]"
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
          {showWeeks && (
            <p
              className={cn(
                "font-serif-italic text-sm sm:text-base text-[hsl(var(--cream))] mt-1 truncate",
                celebrateWeeks && "anim-rise"
              )}
            >
              {summary.consecutiveActiveWeeks} weeks of showing up
            </p>
          )}
        </div>

        <span className="shrink-0 flex items-center gap-1 text-sm font-medium text-[hsl(var(--cream))]">
          <span className="hidden sm:inline">{summary.allComplete ? "Review" : "Resume"}</span>
          <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </Link>
    </MotionCard>
  );
};

export default YourWeek;
