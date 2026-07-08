import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useEnrolledProgress,
  type EnrolledCourseRow,
  type EnrolledProgressTree,
} from "@/hooks/useEnrolledProgress";
import ArtworkImage from "@/components/media/ArtworkImage";
import { MotionCard } from "@/components/motion/MotionCard";
import { Link } from "react-router-dom";
import { ArrowRight, Play } from "lucide-react";
import { Section, ErrorState, SkeletonCard } from "@/components/patterns";
import CourseRatingBadge from "@/components/reviews/CourseRatingBadge";

interface ResumeMeta {
  /** total lessons in the course */
  total: number;
  /** completed lessons */
  done: number;
  /** 1-based lesson number to resume at (next uncompleted, else last) */
  lessonNumber: number;
  /** chapter_id to resume; null when the whole course is complete */
  nextChapterId: string | null;
}

// Ordered courses + per-course resume metadata, derived from the shared
// enrolment tree. This is the EXACT math the component ran inline before the
// react-query migration (P6-T1) — pulled into a pure derive so the query owns
// only I/O. Ordering (last-touched desc), completion counts and next-chapter
// resolution are unchanged; the tree's rows are the same `.select(...)`
// projections the component used to fetch for itself.
interface Derived {
  courses: EnrolledCourseRow[];
  metaMap: Record<string, ResumeMeta>;
}

const deriveContinue = (tree: EnrolledProgressTree): Derived => {
  const { courseIds, courses: coursesData, sections, chapters, progress } = tree;

  if (!coursesData.length) return { courses: [], metaMap: {} };

  const sectionCourseMap: Record<string, string> = {};
  const sectionSortMap: Record<string, number> = {};
  sections.forEach((s) => {
    sectionCourseMap[s.id] = s.course_id;
    sectionSortMap[s.id] = s.sort_order;
  });

  const completedSet = new Set(
    progress.filter((p) => p.completed_at).map((p) => p.chapter_id)
  );

  // Last-touched timestamp per course → ordering key. Most recent wins.
  const lastTouchedMap: Record<string, number> = {};
  for (const p of progress) {
    if (!p.course_id || !p.updated_at) continue;
    const t = new Date(p.updated_at).getTime();
    if (!lastTouchedMap[p.course_id] || t > lastTouchedMap[p.course_id]) {
      lastTouchedMap[p.course_id] = t;
    }
  }

  const metaMap: Record<string, ResumeMeta> = {};

  for (const cId of courseIds) {
    const courseChapters = chapters
      .filter((ch) => sectionCourseMap[ch.section_id] === cId)
      .sort((a, b) => {
        const sa = sectionSortMap[a.section_id] ?? 0;
        const sb = sectionSortMap[b.section_id] ?? 0;
        return sa !== sb ? sa - sb : a.sort_order - b.sort_order;
      });

    const total = courseChapters.length;
    const done = courseChapters.filter((ch) => completedSet.has(ch.id)).length;

    // Next uncompleted chapter (and its 1-based position). If everything is
    // done, resume points at the last lesson for a re-watch.
    const nextIdx = courseChapters.findIndex((ch) => !completedSet.has(ch.id));
    const resolvedIdx = nextIdx === -1 ? Math.max(total - 1, 0) : nextIdx;
    const nextChapter = courseChapters[resolvedIdx];

    metaMap[cId] = {
      total,
      done,
      lessonNumber: total > 0 ? resolvedIdx + 1 : 0,
      nextChapterId: nextIdx === -1 ? null : nextChapter?.id ?? null,
    };
  }

  // Order courses by last-touched desc. Courses with no progress row yet
  // (freshly enrolled, never opened) sort to the end but still show.
  const courses = [...coursesData].sort((a, b) => {
    const ta = lastTouchedMap[a.id] ?? 0;
    const tb = lastTouchedMap[b.id] ?? 0;
    return tb - ta;
  });

  return { courses, metaMap };
};

// ── Continue Learning ──
// Ordered by LAST TOUCHED (most-recent chapter_progress.updated_at per
// course), not catalogue sort_order, so the course you watched five
// minutes ago sits first. Each card carries a "Lesson N of M" chip on the
// artwork and an always-visible thin cream progress bar.
//
// Data comes from the shared `useEnrolledProgress` query (P6-T1): the enrolment
// chain is fetched once for the whole feed and cached, so revisiting Home within
// 5min fires zero refetches and YourWeek/UpcomingSessions share the same rows.
const ContinueLearning = () => {
  const { user, profile } = useAuth();
  const {
    data: tree,
    isLoading,
    isError,
    refetch,
  } = useEnrolledProgress(user?.id);

  const firstName = profile?.full_name?.split(" ")[0] ?? "you";
  const heading = `Continue watching for ${firstName}`;

  const { courses, metaMap } = useMemo(
    () => (tree ? deriveContinue(tree) : { courses: [], metaMap: {} }),
    [tree]
  );

  if (isLoading)
    return (
      <Section title={heading} density="compact">
        {/* Skeleton row mirrors the real card widths (78vw on mobile, fixed on
            larger screens) so content swaps in with no layout shift. */}
        <div className="flex gap-4 sm:gap-5 overflow-x-auto hide-scrollbar pb-2 -mx-1 px-1">
          {[1, 2, 3].map((i) => (
            <SkeletonCard
              key={i}
              variant="media"
              className="min-w-[78vw] sm:min-w-[320px] lg:min-w-[340px] max-w-[360px] flex-shrink-0 rounded-2xl"
            />
          ))}
        </div>
      </Section>
    );

  if (isError)
    return (
      <Section title={heading} density="compact">
        <ErrorState
          variant="inline"
          title="Couldn't load your courses"
          description="Check your connection and try again."
          onRetry={() => refetch()}
        />
      </Section>
    );

  // No enrolments → no section at all. The catalog below is the call to
  // action; a "you have nothing" card is just a dead section.
  if (!courses.length) return null;

  return (
    <Section title={heading} density="compact">
      <div className="relative">
        <div className="flex gap-4 sm:gap-5 overflow-x-auto snap-x hide-scrollbar pb-2 -mx-1 px-1">
          {courses.map((c) => {
            const meta = metaMap[c.id];
            const total = meta?.total ?? 0;
            const done = meta?.done ?? 0;
            const pct = total > 0 ? Math.round((done / total) * 100) : 0;
            const allComplete = total > 0 && done >= total;
            const lessonsLeft = Math.max(total - done, 0);
            const lessonNumber = meta?.lessonNumber ?? 0;

            const linkTo = allComplete
              ? `/courses/${c.id}`
              : meta?.nextChapterId
                ? `/chapters/${meta.nextChapterId}`
                : `/courses/${c.id}`;

            // CTA copy: lessons-left count, not a percentage.
            const ctaLabel = allComplete
              ? "Review"
              : done > 0
                ? `${lessonsLeft} ${lessonsLeft === 1 ? "lesson" : "lessons"} left · Resume`
                : "Start watching";

            // tabIndex={0} preserves the anchor's native tab stop —
            // MotionCard would otherwise force -1 on a non-interactive card
            // (no onClick), silently removing the resume card from the
            // keyboard tab order. Mirrors SurfaceCard's Link path.
            return (
              <MotionCard key={c.id} asChild tabIndex={0}>
                <Link
                  to={linkTo}
                  className="group min-w-[78vw] sm:min-w-[320px] lg:min-w-[340px] max-w-[360px] bg-surface rounded-2xl overflow-hidden flex-shrink-0 snap-start ring-1 ring-white/5 hover:ring-[hsl(var(--cream))]/30 transition-shadow duration-base shadow-[0_8px_24px_-12px_rgba(0,0,0,0.45)] hover:shadow-[0_20px_40px_-20px_rgba(0,0,0,0.6)]"
                >
                  <div className="relative overflow-hidden">
                  {/* ArtworkImage enforces aspect-video + object-cover (no
                      letterbox) and renders the branded placeholder when the
                      thumbnail is missing (no black void). Scrim keeps the chip
                      and progress bar legible over any artwork. */}
                  <ArtworkImage
                    src={c.thumbnail_url}
                    alt=""
                    aspect="video"
                    scrim
                    className="group-hover:scale-[1.04] transition-transform duration-slow"
                  />

                  {/* Resume-meta chip on the artwork, "Lesson 4 of 29". Only
                      shown once we know the lesson count; suppressed for a
                      fully-complete course (the CTA reads "Review" instead). */}
                  {total > 0 && !allComplete && lessonNumber > 0 && (
                    <span className="absolute top-2 left-2 px-2 py-1 rounded-md bg-black/55 backdrop-blur-sm text-[11px] font-medium text-white/95 tracking-[0.01em]">
                      Lesson {lessonNumber} of {total}
                    </span>
                  )}

                  {/* Hover Play overlay, subtle, only on hover. */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                    <span className="h-12 w-12 rounded-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] flex items-center justify-center shadow-lg">
                      <Play className="h-5 w-5 fill-current ml-0.5" />
                    </span>
                  </div>

                  {/* Always-visible thin cream progress bar, no 0<pct<100
                      gate. At 0% the track shows with an empty fill; at 100%
                      it reads as a full cream line. */}
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                    <div
                      className="h-full bg-[hsl(var(--cream))] transition-[width] duration-slow"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="p-4 sm:p-5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base sm:text-lg font-semibold tracking-[-0.01em] line-clamp-1 flex-1">
                      {c.title}
                    </h3>
                    <CourseRatingBadge courseId={c.id} />
                  </div>
                  {c.instructor_display_name && (
                    <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                  )}
                  <p className="text-sm text-[hsl(var(--cream))] mt-3 flex items-center gap-1 font-medium">
                    {ctaLabel}
                    <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </p>
                </div>
                </Link>
              </MotionCard>
            );
          })}
        </div>
        {/* Right-edge fade gradient to hint more content exists. */}
        <div className="pointer-events-none absolute top-0 right-0 bottom-0 w-12 bg-gradient-to-l from-canvas to-transparent" />
      </div>
    </Section>
  );
};

export default ContinueLearning;
