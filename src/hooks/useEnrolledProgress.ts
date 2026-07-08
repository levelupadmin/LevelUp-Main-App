import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  OfferingCourseRow,
  SectionRow,
  ChapterRow,
  ProgressRow,
} from "@/components/home/yourWeekDerive";

// ── The one enrolment chain for Home (P6-T1) ──
// Before this hook, YourWeek, ContinueLearning and UpcomingSessions each ran
// their OWN enrolment→offering_courses→(courses/sections)→chapters→chapter_progress
// waterfall on every Home mount — the same rows fetched three times over, ~15 of
// the ~25 requests a cold Home fired. This wraps that chain in a SINGLE
// react-query (`["enrolled-progress", userId]`, staleTime 5min) that every
// enrolment-driven section derives from, so the chain is fetched once, cached,
// and shared. It is a pure plumbing change: the `.select(...)` projections and
// filters mirror ContinueLearning.tsx / YourWeek.tsx exactly, so the normalized
// tree it returns feeds each section's existing derive functions unchanged.

// The course row shape ContinueLearning renders from (its exact `.select(...)`).
// YourWeek/UpcomingSessions only read course_id/title, which are a subset of
// this, so one projection serves all three consumers.
export interface EnrolledCourseRow {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  instructor_display_name: string | null;
  thumbnail_url: string | null;
}

// The normalized tree every enrolment-driven Home section derives from. The row
// arrays are the raw Supabase projections; each section keeps its own pure
// derive (yourWeekDerive.ts pattern) so the ordering/lock/link rules are
// unchanged and independently testable.
export interface EnrolledProgressTree {
  /** true when the user has ≥1 active enrolment (drives section self-hide). */
  hasEnrolments: boolean;
  /** unique enrolled course ids, in enrolment order. */
  courseIds: string[];
  offeringCourses: OfferingCourseRow[];
  courses: EnrolledCourseRow[];
  sections: SectionRow[];
  chapters: ChapterRow[];
  progress: ProgressRow[];
}

const EMPTY_TREE: EnrolledProgressTree = {
  hasEnrolments: false,
  courseIds: [],
  offeringCourses: [],
  courses: [],
  sections: [],
  chapters: [],
  progress: [],
};

export const ENROLLED_PROGRESS_QUERY_KEY = "enrolled-progress";

/** Build the queryKey used across Home so pull-to-refresh can invalidate it. */
export const enrolledProgressKey = (userId: string | null | undefined) =>
  [ENROLLED_PROGRESS_QUERY_KEY, userId ?? "anon"] as const;

// Fetch the full enrolment chain ONCE. Steps that don't depend on each other are
// parallelized with Promise.all; the only forced sequencing is the id hops
// (enrolments → offering_courses → courseIds → sections → sectionIds → chapters).
//
// Behavior parity note on chapter_progress: it is scoped to the enrolled
// courseIds (`.in("course_id", courseIds)`). YourWeek REQUIRES that scope — its
// `lessonsDone = completedSet.size` count must exclude progress rows for
// un-enrolled/orphaned courses (matches MyCoursesPage). ContinueLearning
// previously fetched ALL user progress unscoped, but its math only ever reads
// enrolled-course chapters (per-course completedSet + lastTouchedMap keyed by
// enrolled course_ids), so scoping to courseIds yields byte-identical results
// there — the extra rows it used to receive were never read.
const fetchEnrolledProgress = async (
  userId: string
): Promise<EnrolledProgressTree> => {
  const { data: enrolments } = await supabase
    .from("enrolments")
    .select("id, offering_id, created_at")
    .eq("user_id", userId)
    .eq("status", "active");

  if (!enrolments?.length) return EMPTY_TREE;

  const offeringIds = enrolments.map((e) => e.offering_id);
  const { data: ocs } = await supabase
    .from("offering_courses")
    .select("offering_id, course_id")
    .in("offering_id", offeringIds);

  if (!ocs?.length) return { ...EMPTY_TREE, hasEnrolments: true };

  const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

  // courses + sections both depend only on courseIds → fire together. The
  // chapter_progress read also depends on courseIds, so it joins this batch.
  const [coursesRes, sectionsRes, progressRes] = await Promise.all([
    supabase
      .from("courses")
      .select("id, slug, title, description, instructor_display_name, thumbnail_url")
      .in("id", courseIds),
    supabase
      .from("sections")
      .select("id, course_id, sort_order")
      .in("course_id", courseIds)
      .order("sort_order"),
    supabase
      .from("chapter_progress")
      .select("chapter_id, course_id, completed_at, updated_at")
      .eq("user_id", userId)
      .in("course_id", courseIds),
  ]);

  const sectionsData = (sectionsRes.data ?? []) as SectionRow[];
  const sectionIds = sectionsData.map((s) => s.id);

  const emptyChapters: ChapterRow[] = [];
  const chaptersRes = sectionIds.length
    ? await supabase
        .from("chapters")
        .select("id, section_id, sort_order")
        .in("section_id", sectionIds)
        .order("sort_order")
    : { data: emptyChapters };

  return {
    hasEnrolments: true,
    courseIds,
    offeringCourses: (ocs ?? []) as OfferingCourseRow[],
    courses: (coursesRes.data ?? []) as EnrolledCourseRow[],
    sections: sectionsData,
    chapters: (chaptersRes.data ?? []) as ChapterRow[],
    progress: (progressRes.data ?? []) as ProgressRow[],
  };
};

/**
 * The shared enrolment→progress tree for Home's enrolment-driven sections.
 *
 * Pass the current user's id (`null`/`undefined` for signed-out). The query is
 * disabled when there is no user, so a signed-out visitor never fetches and
 * `data` stays `undefined` (consumers treat that as the empty tree and self-hide,
 * unchanged from before). staleTime is 5min so navigating away and back within
 * the window fires zero refetches.
 */
export function useEnrolledProgress(userId: string | null | undefined) {
  return useQuery({
    queryKey: enrolledProgressKey(userId),
    queryFn: () => fetchEnrolledProgress(userId as string),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}
