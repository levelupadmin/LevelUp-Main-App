// ── Your Week — pure derivation ──
// The 200-odd lines of enrolled-user math that turn the raw Supabase rows
// (offering_courses → sections → chapters → chapter_progress) into the compact
// `WeekSummary` the strip renders. Kept as a pure function — no Supabase, no
// React, no clock — so every branch (zero enrolments, freshly enrolled but never
// opened, in-progress, all-complete) is unit-testable without a live database.
// YourWeek.tsx only owns the I/O (fetch the rows) and the render; the rules live
// here and mirror ContinueLearning / MyCoursesPage exactly.

export interface WeekSummary {
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

// The row shapes below are the exact `.select(...)` projections YourWeek queries.
// Kept minimal (only the columns the math reads) so the derivation stays honest
// about its inputs and tests don't have to fabricate unused fields.
export interface OfferingCourseRow {
  offering_id: string;
  course_id: string;
}

export interface SectionRow {
  id: string;
  course_id: string;
  sort_order: number;
}

export interface ChapterRow {
  id: string;
  section_id: string;
  sort_order: number;
}

export interface ProgressRow {
  chapter_id: string;
  course_id: string | null;
  completed_at: string | null;
  updated_at: string | null;
}

export interface DeriveInput {
  offeringCourses: OfferingCourseRow[] | null | undefined;
  sections: SectionRow[] | null | undefined;
  chapters: ChapterRow[] | null | undefined;
  progress: ProgressRow[] | null | undefined;
}

/**
 * Derive the Your Week summary from the raw enrolled-course rows.
 *
 * Returns `null` for the states where the strip should render nothing — no
 * enrolled courses (no `offering_courses` rows) or no derivable most-active
 * course — mirroring YourWeek's `if (!summary) return null` gate. Callers that
 * short-circuit *before* querying (zero enrolments at all) simply never reach
 * this, but passing empty/nullish inputs here is also safe and yields `null`.
 */
export function deriveWeekSummary(input: DeriveInput): WeekSummary | null {
  const ocs = input.offeringCourses ?? [];
  if (!ocs.length) return null;

  const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

  const sectionsData = input.sections ?? [];
  const allChapters = input.chapters ?? [];
  const progressData = input.progress ?? [];

  const sectionCourseMap: Record<string, string> = {};
  const sectionSortMap: Record<string, number> = {};
  sectionsData.forEach((s) => {
    sectionCourseMap[s.id] = s.course_id;
    sectionSortMap[s.id] = s.sort_order;
  });

  const completedSet = new Set(
    progressData.filter((p) => p.completed_at).map((p) => p.chapter_id)
  );

  // Lessons completed across every enrolled course = the count of distinct
  // completed chapters in enrolled courses (progress is scoped to courseIds
  // upstream, so this matches MyCoursesPage's stat).
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

  // Most-active course: highest last-touched timestamp, else the first enrolled
  // course (freshly enrolled, never opened) so the ring still shows.
  const topCourseId =
    [...courseIds].sort(
      (a, b) => (lastTouchedMap[b] ?? 0) - (lastTouchedMap[a] ?? 0)
    )[0] ?? null;

  if (!topCourseId) return null;

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

  // Next uncompleted chapter (and its 1-based position). If everything is done,
  // point at the last lesson for a re-watch — same rule as ContinueLearning.
  const nextIdx = topChapters.findIndex((ch) => !completedSet.has(ch.id));
  const allComplete = nextIdx === -1;
  const resolvedIdx = allComplete ? Math.max(topTotal - 1, 0) : nextIdx;
  const nextChapter = topChapters[resolvedIdx];

  const resumeTo =
    !allComplete && nextChapter?.id
      ? `/chapters/${nextChapter.id}`
      : `/courses/${topCourseId}`;

  return {
    topPct,
    lessonsDone,
    nextLessonNumber: topTotal > 0 ? resolvedIdx + 1 : 0,
    topTotal,
    allComplete: topTotal > 0 && allComplete,
    resumeTo,
  };
}
