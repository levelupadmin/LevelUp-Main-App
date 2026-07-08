import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import usePageTitle from "@/hooks/usePageTitle";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ErrorState, SkeletonBlock, SkeletonLine } from "@/components/patterns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { toast } from "@/lib/toast";
import { CheckCircle2, Lock, Play, Clock, BookOpen, Star, Sparkles } from "lucide-react";
import { isNative } from "@/lib/platform";
import { ProgressRing } from "@/components/progress/ProgressRing";
import { CompletionRecap } from "@/components/progress/CompletionRecap";
import ReviewList from "@/components/reviews/ReviewList";
import Outcomes from "@/components/course-detail/Outcomes";
import PortfolioPieces from "@/components/course-detail/PortfolioPieces";
import InstructorCard from "@/components/course-detail/InstructorCard";
import CohortSchedule from "@/components/course-detail/CohortSchedule";
import TestimonialsCarousel from "@/components/course-detail/TestimonialsCarousel";
import FAQ from "@/components/course-detail/FAQ";
import UrgencyStrip from "@/components/course-detail/UrgencyStrip";

interface Course {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  hero_image_url: string | null;
  instructor_display_name: string | null;
  student_count: number | null;
  rating_avg: number | null;
  duration_minutes: number | null;
  total_lessons: number | null;
  level: string | null;
  category_id: string | null;
  // Phase 4 content blocks: populated once the 20260420120000 migration ships
  outcomes?: string[] | null;
  portfolio_pieces?: { title: string; description?: string | null; image_url?: string | null }[] | null;
  instructor_bio?: string | null;
  instructor_credentials?: string[] | null;
  instructor_avatar_url?: string | null;
  instructor_links?: { label: string; url: string }[] | null;
  faqs?: { question: string; answer: string }[] | null;
}

interface OfferingUrgency {
  seats_total: number | null;
  seats_left: number | null;
  batch_starts_at: string | null;
  cohort_sessions: { title: string; starts_at: string; duration_min?: number | null }[] | null;
}

interface Section {
  id: string;
  title: string;
  sort_order: number;
  drip_days_after_enrolment: number | null;
  drip_specific_date: string | null;
}

interface Chapter {
  id: string;
  title: string;
  section_id: string;
  sort_order: number;
  content_type: string;
  duration_seconds: number | null;
  make_free: boolean;
}

interface ChapterProgress {
  chapter_id: string;
  completed_at: string | null;
  last_position_seconds: number;
}

// The full course-detail read as one function (P6-T2): course + sections + drip
// in parallel, then category / chapters / entitlement / progress. Behaviour is
// preserved from the old `loadCourse`:
//   • throws on `courseRes.error` (network/DB failure) → react-query `isError`
//     drives the ErrorState-with-retry below, NOT the not-found screen;
//   • returns `{ notFound: true }` when the course genuinely doesn't exist
//     (no error, no row) → the not-found screen renders;
//   • `entitled` is the RAW entitlement (RPC, else the course-scoped enrolment
//     fallback). The admin override is applied at RENDER (`entitled || isAdmin`)
//     off the live profile, exactly as the old `setHasAccess(... || isAdmin)`.
// react-query supersedes stale fetches on a courseId switch, so the manual
// cancellation guard is no longer needed.
interface CourseData {
  notFound: boolean;
  course: Course | null;
  sections: Section[];
  chapters: Chapter[];
  progress: ChapterProgress[];
  /** raw entitlement, pre-admin-override (applied at render) */
  entitled: boolean;
  dripMode: string;
  categoryName: string | null;
}

const NOT_FOUND: CourseData = {
  notFound: true,
  course: null,
  sections: [],
  chapters: [],
  progress: [],
  entitled: false,
  dripMode: "no_drip",
  categoryName: null,
};

const fetchCourseDetail = async (
  courseId: string,
  userId: string
): Promise<CourseData> => {
  const [courseRes, sectionsRes, dripRes] = await Promise.all([
    supabase.from("courses").select("*").eq("id", courseId).maybeSingle(),
    supabase.from("sections").select("*").eq("course_id", courseId).order("sort_order"),
    supabase.from("course_drip_config").select("drip_mode").eq("course_id", courseId).maybeSingle(),
  ]);

  if (courseRes.error) {
    if (import.meta.env.DEV) console.error("[CourseDetail] course fetch error:", courseRes.error);
    // A real fetch failure — surface the retryable ErrorState, not "not found".
    throw courseRes.error;
  }

  if (!courseRes.data) return NOT_FOUND;

  const courseData = courseRes.data as Course;
  const sections = (sectionsRes.data || []) as Section[];
  const dripMode = dripRes.data?.drip_mode || "no_drip";

  // Category name
  let categoryName: string | null = null;
  if (courseData.category_id) {
    const { data: cat } = await supabase
      .from("course_categories")
      .select("name")
      .eq("id", courseData.category_id)
      .maybeSingle();
    categoryName = cat?.name || null;
  }

  // Chapters for all sections
  const sectionIds = sections.map((s) => s.id);
  let chapters: Chapter[] = [];
  if (sectionIds.length > 0) {
    const { data: chapData } = await supabase
      .from("chapters")
      .select("id, title, section_id, sort_order, content_type, duration_seconds, make_free")
      .in("section_id", sectionIds)
      .order("sort_order");
    chapters = (chapData || []) as Chapter[];
  }

  // Entitlement — RPC first, course-scoped enrolment fallback on RPC error.
  // The admin override is deliberately NOT folded in here; it's applied at
  // render from the live profile so a role change reflects without a refetch.
  let entitled = false;
  const { data: accessData, error: accessErr } = await supabase.rpc("has_course_access", {
    p_course_id: courseId,
  });
  if (accessErr) {
    toast.error("Couldn't verify your access, retrying...");
    // Fallback: check enrolments for offerings that actually include THIS
    // course. A global "does this user have any active enrolment" check
    // would grant course B to anyone who paid for course A on transient
    // RPC failures; the old fallback was far too permissive.
    const { data: offeringLinks } = await supabase
      .from("offering_courses")
      .select("offering_id")
      .eq("course_id", courseId);
    const offeringIds = (offeringLinks || []).map((o) => o.offering_id).filter(Boolean);
    if (offeringIds.length > 0) {
      const { data: enrolmentCheck } = await supabase
        .from("enrolments")
        .select("id")
        .eq("user_id", userId)
        .eq("status", "active")
        .in("offering_id", offeringIds)
        .limit(1);
      entitled = !!enrolmentCheck?.length;
    }
  } else {
    entitled = !!accessData;
  }

  // Progress
  const { data: prog } = await supabase
    .from("chapter_progress")
    .select("chapter_id, completed_at, last_position_seconds")
    .eq("user_id", userId)
    .eq("course_id", courseId);

  return {
    notFound: false,
    course: courseData,
    sections,
    chapters,
    progress: (prog || []) as ChapterProgress[],
    entitled,
    dripMode,
    categoryName,
  };
};

interface OfferingData {
  offeringSlug: string | null;
  offeringUrgency: OfferingUrgency | null;
}

// The course's primary offering (urgency + cohort schedule + public slug). Kept
// as its OWN query (P6-T2) so it stays non-blocking — mirroring the old
// un-awaited IIFE — and the main course render never waits on it. Safe if the
// Phase-4 migration hasn't run: missing columns come back undefined and the
// downstream strips hide themselves.
const fetchCourseOffering = async (courseId: string): Promise<OfferingData> => {
  const { data: ocs } = await supabase
    .from("offering_courses")
    .select("offering_id")
    .eq("course_id", courseId)
    .limit(1);
  const offId = ocs?.[0]?.offering_id;
  if (!offId) return { offeringSlug: null, offeringUrgency: null };
  const { data: off } = await (supabase as any)
    .from("offerings")
    .select("id, slug, seats_total, starts_at, cohort_sessions")
    .eq("id", offId)
    .eq("status", "active")
    .maybeSingle();
  if (!off) return { offeringSlug: null, offeringUrgency: null };
  let seatsLeft: number | null = null;
  if (off.seats_total) {
    const { count } = await supabase
      .from("enrolments")
      .select("id", { count: "exact", head: true })
      .eq("offering_id", offId)
      .eq("status", "active");
    seatsLeft = Math.max(0, off.seats_total - (count ?? 0));
  }
  return {
    offeringSlug: off.slug ?? null,
    offeringUrgency: {
      seats_total: off.seats_total ?? null,
      seats_left: seatsLeft,
      batch_starts_at: off.starts_at ?? null,
      cohort_sessions: off.cohort_sessions ?? null,
    },
  };
};

const CourseDetail = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const {
    data,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["course", courseId, user?.id ?? "anon"],
    queryFn: () => fetchCourseDetail(courseId!, user!.id),
    enabled: !!courseId && !!user && !authLoading,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  // Primary-offering urgency/slug — independent, non-blocking query.
  const { data: offeringData } = useQuery({
    queryKey: ["course-offering", courseId],
    queryFn: () => fetchCourseOffering(courseId!),
    enabled: !!courseId && !!user && !authLoading,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const course = data?.course ?? null;
  const sections = data?.sections ?? [];
  // chapters/progress feed the completion-recap effect's deps — memoize so the
  // `?? []` fallback doesn't hand it a fresh array reference every render.
  const chapters = useMemo(() => data?.chapters ?? [], [data]);
  const progress = useMemo(() => data?.progress ?? [], [data]);
  const dripMode = data?.dripMode ?? "no_drip";
  const categoryName = data?.categoryName ?? null;
  const offeringSlug = offeringData?.offeringSlug ?? null;
  const offeringUrgency = offeringData?.offeringUrgency ?? null;

  // Access decision, byte-identical to the old `setHasAccess(entitled || isAdmin)`:
  // the raw entitlement from the query OR'd with the live admin role.
  const isAdmin = profile?.role === "admin";
  const hasAccess = (data?.entitled ?? false) || isAdmin;

  // Still fetching (or auth not yet resolved, so the query is disabled and
  // stays 'pending') → the structured skeleton below. On a warm revisit within
  // staleTime the data comes from cache and this is false, so the page paints
  // instantly.
  const loading = isPending;

  const [recapOpen, setRecapOpen] = useState(false);

  usePageTitle(course?.title ?? "Course");

  // Auto-open the completion recap the first time the user views this course at
  // 100%. Gated per course+user via sessionStorage so it celebrates once per
  // session and never nags on revisits.
  useEffect(() => {
    if (loading || !courseId || !user) return;
    const total = chapters.length;
    if (total === 0) return;
    const done = progress.filter((p) => p.completed_at).length;
    if (done < total) return;
    const key = `recap-seen:${user.id}:${courseId}`;
    if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(key)) return;
    setRecapOpen(true);
    try {
      sessionStorage.setItem(key, "1");
    } catch {
      /* storage may be unavailable (private mode); recap simply re-shows */
    }
  }, [loading, courseId, user, chapters, progress]);

  const isChapterCompleted = (chapterId: string) =>
    progress.some((p) => p.chapter_id === chapterId && p.completed_at);

  const getChapterProgress = (chapterId: string) =>
    progress.find((p) => p.chapter_id === chapterId);

  const isChapterLocked = (chapter: Chapter, sectionChapters: Chapter[]) => {
    if (chapter.make_free) return false;
    if (profile?.role === "admin") return false;
    if (!hasAccess) return true;

    if (dripMode === "by_completion") {
      const idx = sectionChapters.findIndex((c) => c.id === chapter.id);
      if (idx > 0) {
        const prevChapter = sectionChapters[idx - 1];
        if (!isChapterCompleted(prevChapter.id)) return true;
      }
    }
    return false;
  };

  const getNextIncompleteChapter = () => {
    for (const section of sections) {
      const sectionChapters = chapters
        .filter((c) => c.section_id === section.id)
        .sort((a, b) => a.sort_order - b.sort_order);
      for (const ch of sectionChapters) {
        if (!isChapterCompleted(ch.id)) return ch;
      }
    }
    return chapters[0] || null;
  };

  const handleChapterClick = (chapter: Chapter, sectionChapters: Chapter[]) => {
    if (isChapterLocked(chapter, sectionChapters)) {
      // Don't dead-end the user on a toast: give them a path to the
      // program page where they can enrol (web) or apply (native; the
      // offering page hides price/buy UI itself per the Reader Rule).
      toast("This chapter is locked", {
        description: "Enrol in this course to unlock all chapters.",
        ...(offeringSlug
          ? {
              action: {
                label: "View program",
                onClick: () => navigate(`/p/${offeringSlug}`),
              },
            }
          : {}),
      });
      return;
    }
    navigate(`/chapters/${chapter.id}`);
  };

  const handleEnrollOrContinue = () => {
    if (hasAccess) {
      const next = getNextIncompleteChapter();
      if (next) {
        navigate(`/chapters/${next.id}`);
        return;
      }
      // No incomplete chapter: either fully completed (review from start) or
      // course is still empty. Fall through to the first chapter if one
      // exists; otherwise do nothing (the button should be disabled in that
      // case by the render guard above).
      const first = chapters[0];
      if (first) navigate(`/chapters/${first.id}`);
    } else {
      // Not entitled: send them to the offering page where they can
      // actually enrol, not back to the homepage. Fall back to browse
      // when no public offering is linked to this course.
      navigate(offeringSlug ? `/p/${offeringSlug}` : `/`);
    }
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s > 0 ? `${s}s` : ""}`.trim() : `${s}s`;
  };

  if (loading) {
    // Structured skeleton (P6-T2) — hero block + a content card with 6
    // chapter-row lines, at the real dimensions (hero `min-h-[14rem]` = 224px,
    // rows `min-h-[44px]`) so the resolved page swaps in with no layout shift,
    // replacing the old centered spinner.
    return (
      <div className="max-w-4xl mx-auto space-y-8" aria-busy="true" aria-live="polite">
        <SkeletonBlock height={224} className="rounded-[20px]" />
        <div className="bg-card border border-border rounded-[16px] overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <SkeletonLine width="40%" height="20px" />
          </div>
          <div className="p-4 space-y-1">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex items-center gap-3 min-h-[44px] px-2">
                <span className="skeleton-shimmer h-5 w-5 rounded-full shrink-0" aria-hidden />
                <SkeletonLine width={`${68 - i * 6}%`} height="14px" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (isError) {
    // A real fetch failure (thrown from the query) — a retryable ErrorState,
    // NOT the "Course not found" screen (P6-T2). `refetch` re-runs the load.
    return (
      <ErrorState
        title="Couldn't load this course"
        description="Check your connection and try again."
        onRetry={() => refetch()}
      />
    );
  }

  if (!course) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <BookOpen className="h-12 w-12 text-muted-foreground" />
          <h1 className="text-xl font-semibold text-foreground">Course not found</h1>
          <p className="text-sm text-muted-foreground">This course doesn't exist or is no longer available.</p>
          <Link to="/home" className="text-sm text-primary hover:underline">← Back to Home</Link>
        </div>
      </>
    );
  }

  const totalChapters = chapters.length;
  const completedCount = progress.filter((p) => p.completed_at).length;
  const progressPct =
    totalChapters > 0 ? Math.round((completedCount / totalChapters) * 100) : 0;
  const isComplete = totalChapters > 0 && completedCount >= totalChapters;
  // Total watch time proxy: furthest position reached across this course's
  // chapters (in minutes). Lower-bound, since we don't log per-session deltas.
  const watchMinutes = Math.round(
    progress.reduce((sum, p) => sum + (p.last_position_seconds || 0), 0) / 60
  );

  return (
    <>
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Hero */}
        <div className="relative rounded-[20px] overflow-hidden bg-card border border-border">
          {course.hero_image_url && (
            <img
              src={course.hero_image_url}
              alt=""
              aria-hidden="true"
              className="absolute inset-0 w-full h-full object-cover opacity-40"
            />
          )}
          {/* Content drives the card height (via min-h) rather than being pinned
              inside the fixed image box — so at phone widths wrapped meta/CTA rows
              grow the hero instead of being clipped by overflow-hidden. */}
          <div className="relative p-6 sm:p-8 flex flex-col justify-end gap-3 min-h-[14rem]">
            <div className="flex flex-wrap items-center gap-2">
              {categoryName && (
                <Badge variant="secondary" className="font-mono text-xs uppercase tracking-wider">
                  {categoryName}
                </Badge>
              )}
              {course.level && (
                <Badge variant="outline" className="text-xs capitalize">
                  {course.level}
                </Badge>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">{course.title}</h1>
            {course.subtitle && (
              <p className="text-muted-foreground text-base max-w-2xl">{course.subtitle}</p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground mt-1">
              {course.instructor_display_name && (
                <span>by {course.instructor_display_name}</span>
              )}
              {course.duration_minutes ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" />
                  {(() => {
                    const h = Math.floor(course.duration_minutes / 60);
                    const m = course.duration_minutes % 60;
                    if (h && m) return `${h}h ${m}m`;
                    if (h) return `${h}h`;
                    return `${m}m`;
                  })()}
                </span>
              ) : null}
              <span className="flex items-center gap-1">
                <BookOpen className="h-3.5 w-3.5" />
                {totalChapters} lessons
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-2">
              {hasAccess && totalChapters === 0 ? (
                // Enrolled but the course has no chapters yet. Don't show a
                // "Continue Learning" button that does nothing; be honest — but
                // keep it on-brand. The champagne variant carries a disabled
                // floor (saturate-[.75]/opacity-70) so the quiet state reads as
                // dimmed champagne, never flat gray on black.
                <Button size="lg" variant="champagne" disabled>
                  Content coming soon
                </Button>
              ) : hasAccess && completedCount >= totalChapters && totalChapters > 0 ? (
                // Fully completed: give the user something meaningful to do.
                // Champagne fill = the redesign's primary-action treatment
                // (matches Home's "Explore" CTA); one accent per screen moment.
                <Button
                  size="lg"
                  onClick={handleEnrollOrContinue}
                  className="btn-champagne font-semibold text-[hsl(var(--cream-text))]"
                >
                  Review Course →
                </Button>
              ) : (
                <Button
                  size="lg"
                  onClick={handleEnrollOrContinue}
                  className="btn-champagne font-semibold text-[hsl(var(--cream-text))]"
                >
                  {hasAccess
                    ? "Continue Learning →"
                    : isNative()
                      ? "Explore programs →"
                      : "Enroll Now"}
                </Button>
              )}
              {hasAccess && totalChapters > 0 && (
                <div className="flex items-center gap-2.5">
                  <ProgressRing pct={progressPct} size={40} label />
                  <span className="text-sm text-muted-foreground">
                    {completedCount}/{totalChapters} lessons
                  </span>
                </div>
              )}
              {hasAccess && isComplete && (
                <Button
                  size="lg"
                  variant="outline"
                  onClick={() => setRecapOpen(true)}
                  className="gap-1.5"
                >
                  <Sparkles className="h-4 w-4" />
                  View recap
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {course.description && (
          <div className="bg-card border border-border rounded-[16px] p-6">
            <h2 className="text-lg font-semibold mb-3">About this course</h2>
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
              {course.description}
            </p>
          </div>
        )}

        {/* Phase 4 content blocks: each renders-and-hides if the data isn't there yet */}
        <UrgencyStrip
          seatsLeft={offeringUrgency?.seats_left}
          batchStartsAt={offeringUrgency?.batch_starts_at}
        />
        <Outcomes outcomes={course.outcomes} />
        <PortfolioPieces pieces={course.portfolio_pieces} />
        <InstructorCard
          name={course.instructor_display_name}
          bio={course.instructor_bio}
          credentials={course.instructor_credentials}
          avatarUrl={course.instructor_avatar_url}
          links={course.instructor_links}
        />
        <CohortSchedule sessions={offeringUrgency?.cohort_sessions} />
        <TestimonialsCarousel courseId={courseId!} />
        <FAQ faqs={course.faqs} />

        {/* Ratings & Reviews */}
        <div className="bg-card border border-border rounded-[16px] p-6 space-y-6">
          <div className="flex items-center gap-2">
            <Star className="h-5 w-5 text-gold fill-gold" />
            <h2 className="text-lg font-semibold">Ratings & Reviews</h2>
          </div>
          <ReviewList courseId={courseId!} isEnrolled={hasAccess} />
        </div>

        {/* Sections + Chapters */}
        <div className="bg-card border border-border rounded-[16px] overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold">
              Course Content
              <span className="text-sm text-muted-foreground font-normal ml-2">
                {sections.length} sections · {totalChapters} lessons
              </span>
            </h2>
          </div>
          <Accordion type="multiple" defaultValue={sections.map((s) => s.id)} className="px-2">
            {sections.map((section) => {
              const sectionChapters = chapters
                .filter((c) => c.section_id === section.id)
                .sort((a, b) => a.sort_order - b.sort_order);
              const sectionCompleted = sectionChapters.filter((c) =>
                isChapterCompleted(c.id)
              ).length;

              return (
                <AccordionItem key={section.id} value={section.id} className="border-border">
                  <AccordionTrigger className="px-4 hover:no-underline">
                    <div className="flex items-center gap-3 text-left">
                      <span className="font-medium">{section.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {sectionCompleted}/{sectionChapters.length}
                      </span>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="px-2 pb-2">
                    <div className="space-y-0.5">
                      {sectionChapters.map((chapter, idx) => {
                        const locked = isChapterLocked(chapter, sectionChapters);
                        const completed = isChapterCompleted(chapter.id);

                        const chapterProg = getChapterProgress(chapter.id);
                        const posSeconds = chapterProg?.last_position_seconds || 0;
                        // Only draw the bar when we know the chapter's real
                        // duration; dividing by an arbitrary fallback (600s)
                        // produced bogus widths for untimed content. Without
                        // a duration the row simply shows no bar.
                        const durationSeconds = chapter.duration_seconds ?? 0;
                        const showProgressBar = posSeconds > 0 && !completed && durationSeconds > 0;

                        return (
                          <div key={chapter.id}>
                            <button
                              onClick={() => handleChapterClick(chapter, sectionChapters)}
                              className="pressable w-full flex items-start gap-3 min-h-[44px] py-2 px-4 rounded-lg text-left text-sm hover:bg-accent/50 group"
                            >
                              <span className="w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                                {completed ? (
                                  <CheckCircle2 className="h-4 w-4 text-[hsl(var(--accent-emerald))]" />
                                ) : locked ? (
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                ) : (
                                  <Play className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground" />
                                )}
                              </span>
                              <span
                                className={`flex-1 line-clamp-2 leading-snug ${
                                  locked ? "text-muted-foreground" : "text-foreground"
                                }`}
                              >
                                {idx + 1}. {chapter.title}
                              </span>
                              {chapter.make_free && !hasAccess && (
                                <Badge variant="outline" className="text-[10px] h-5 px-1.5 mt-0.5 shrink-0">
                                  Free
                                </Badge>
                              )}
                              {chapter.duration_seconds ? (
                                <span className="text-xs text-muted-foreground font-mono shrink-0 mt-0.5">
                                  {formatDuration(chapter.duration_seconds)}
                                </span>
                              ) : null}
                            </button>
                            {showProgressBar && (
                              <div className="h-0.5 bg-surface-2 rounded-full overflow-hidden mx-4 mt-0.5">
                                <div
                                  className="h-full bg-[hsl(var(--cream))] rounded-full transition-all"
                                  style={{ width: `${Math.min((posSeconds / durationSeconds) * 100, 100)}%` }}
                                />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        </div>
      </div>

      <CompletionRecap
        open={recapOpen}
        onClose={() => setRecapOpen(false)}
        courseTitle={course.title}
        instructorName={course.instructor_display_name}
        lessonsCompleted={completedCount}
        minutesWatched={watchMinutes}
        imageUrl={course.hero_image_url}
      />
    </>
  );
};

export default CourseDetail;
