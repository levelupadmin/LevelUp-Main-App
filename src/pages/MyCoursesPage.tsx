import { useQuery } from "@tanstack/react-query";
import usePageTitle from "@/hooks/usePageTitle";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TierBadge } from "@/components/TierBadge";
import { ArtworkImage } from "@/components/media/ArtworkImage";
import { ArrowRight, BookOpen, Clock, Sparkles, Award } from "lucide-react";
import CourseCardSkeleton from "@/components/skeletons/CourseCardSkeleton";
import CourseRatingBadge from "@/components/reviews/CourseRatingBadge";
import { isNative } from "@/lib/platform";
import { ProgressRing } from "@/components/progress/ProgressRing";
import { WeeklyStats } from "@/components/progress/WeeklyStats";
import { CountUp } from "@/components/motion/CountUp";
import {
  EmptyState,
  StatCard,
  SurfaceCard,
  ErrorState,
  SkeletonLine,
} from "@/components/patterns";

interface EnrolledCourse {
  enrolment_id: string;
  course_id: string;
  title: string;
  description: string | null;
  instructor_display_name: string | null;
  thumbnail_url: string | null;
  offering_title: string;
  progress_pct: number;
}

interface RecommendedCourse {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  product_tier: string;
  instructor_display_name: string | null;
  offering_id: string | null;
  offering_slug: string | null;
  price_inr: number | null;
}

interface LearningStats {
  lessonsCompleted: number;
  coursesInProgress: number;
  certificates: number;
}

interface MyCoursesData {
  courses: EnrolledCourse[];
  recommendations: RecommendedCourse[];
  stats: LearningStats;
}

const EMPTY_STATS: LearningStats = {
  lessonsCompleted: 0,
  coursesInProgress: 0,
  certificates: 0,
};

const LOAD_ERROR = "We couldn't load this. Check your connection and try again.";

// The whole My-Courses read as one function (P6-T2): enrolments →
// offering_courses → courses/offerings/sections/chapters/progress → stats →
// recommendations. Query shapes and derivation are UNCHANGED from the old
// `fetch` useCallback — only the state plumbing moves to react-query so a
// revisit within staleTime is a cache hit (zero refetches). It throws on the
// enrolments error exactly like the old `try/catch`, which surfaces as the same
// ErrorState below.
const fetchMyCourses = async (userId: string): Promise<MyCoursesData> => {
  // Get active enrolments
  const { data: enrs, error: enrsError } = await supabase
    .from("enrolments")
    .select("id, offering_id")
    .eq("user_id", userId)
    .eq("status", "active");

  if (enrsError) throw enrsError;

      // Enrolled-course processing. When the user has no active enrolments
      // (or their offerings map to no courses), `result` stays empty and we
      // fall straight through to the recommendations fetch below — that's the
      // zero-enrollment path, and it must still surface the catalog so the
      // empty state isn't a dead end.
  const result: EnrolledCourse[] = [];
  let completedChapterIds = new Set<string>();

  const offeringIds = (enrs ?? []).map((e) => e.offering_id);
  const { data: ocs } = offeringIds.length
    ? await supabase
        .from("offering_courses")
        .select("offering_id, course_id")
        .in("offering_id", offeringIds)
    : { data: [] };

  if (ocs?.length) {
    const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

    // Get course details
    const { data: coursesData } = await supabase
      .from("courses")
      .select("id, title, description, instructor_display_name, thumbnail_url")
      .in("id", courseIds);

    // Get offering titles
    const { data: offData } = await supabase
      .from("offerings")
      .select("id, title")
      .in("id", offeringIds);

    // Get all chapters for these courses (via sections)
    const { data: sections } = await supabase
      .from("sections")
      .select("id, course_id")
      .in("course_id", courseIds);

    const sectionIds = (sections ?? []).map((s) => s.id);
    const { data: chapters } = sectionIds.length
      ? await supabase
          .from("chapters")
          .select("id, section_id")
          .in("section_id", sectionIds)
      : { data: [] };

    // Get user progress
    const { data: progress } = await supabase
      .from("chapter_progress")
      .select("chapter_id, completed_at")
      .eq("user_id", userId)
      .in("course_id", courseIds);

    // Map section → course
    const sectionCourseMap: Record<string, string> = {};
    (sections ?? []).forEach((s) => {
      sectionCourseMap[s.id] = s.course_id;
    });

    // Count chapters per course
    const totalPerCourse: Record<string, number> = {};
    const completedPerCourse: Record<string, number> = {};
    completedChapterIds = new Set(
      (progress ?? []).filter((p) => p.completed_at).map((p) => p.chapter_id)
    );

    (chapters ?? []).forEach((ch) => {
      const cid = sectionCourseMap[ch.section_id];
      if (!cid) return;
      totalPerCourse[cid] = (totalPerCourse[cid] || 0) + 1;
      if (completedChapterIds.has(ch.id)) {
        completedPerCourse[cid] = (completedPerCourse[cid] || 0) + 1;
      }
    });

    const courseMap = Object.fromEntries((coursesData ?? []).map((c) => [c.id, c]));
    const offMap = Object.fromEntries((offData ?? []).map((o) => [o.id, o]));

    // Build enrolment → offering → course → entry mapping
    const enrolmentMap = new Map<string, string>();
    (enrs ?? []).forEach((e) => enrolmentMap.set(e.offering_id, e.id));

    const seen = new Set<string>();

    ocs.forEach((oc) => {
      if (seen.has(oc.course_id)) return;
      seen.add(oc.course_id);
      const c = courseMap[oc.course_id];
      if (!c) return;
      const total = totalPerCourse[oc.course_id] || 0;
      const completed = completedPerCourse[oc.course_id] || 0;
      result.push({
        enrolment_id: enrolmentMap.get(oc.offering_id) ?? "",
        course_id: c.id,
        title: c.title,
        description: c.description,
        instructor_display_name: c.instructor_display_name,
        thumbnail_url: c.thumbnail_url,
        offering_title: offMap[oc.offering_id]?.title ?? "",
        progress_pct: total > 0 ? Math.round((completed / total) * 100) : 0,
      });
    });
  }

  // ── Aggregate learning stats for the 3-stat strip ──
  // lessonsCompleted: every completed chapter across enrolled courses.
  // coursesInProgress: enrolled courses started but not yet 100%.
  // certificates: count of issued certificates for this user.
  const lessonsCompleted = completedChapterIds.size;
  const coursesInProgress = result.filter(
    (c) => c.progress_pct > 0 && c.progress_pct < 100
  ).length;
  const { count: certCount } = await (supabase as any)
    .from("certificates")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  const stats: LearningStats = {
    lessonsCompleted,
    coursesInProgress,
    certificates: certCount ?? 0,
  };

  // ── Recommendations: courses the user hasn't enrolled in ──
  // Runs for EVERY user, including zero-enrollment — this is what turns the
  // empty Courses state into a browsable catalog instead of a dead end.
  const enrolledCourseIds = new Set(result.map((c) => c.course_id));
  const enrolledTiers = enrolledCourseIds.size
    ? [...new Set(
        (await supabase.from("courses").select("product_tier").in("id", [...enrolledCourseIds])).data?.map((c: any) => c.product_tier) || []
      )]
    : [];

  const { data: recCourses } = await supabase
    .from("courses")
    .select("id, title, description, thumbnail_url, product_tier, instructor_display_name, primary_offering_id")
    .eq("status", "published")
    .neq("show_on_browse", false)
    .order("sort_order", { ascending: true });

  const candidates = (recCourses || [])
    .filter((c: any) => !enrolledCourseIds.has(c.id))
    // Prioritize same tier, then others
    .sort((a: any, b: any) => {
      const aMatch = enrolledTiers.includes(a.product_tier) ? 0 : 1;
      const bMatch = enrolledTiers.includes(b.product_tier) ? 0 : 1;
      return aMatch - bMatch;
    })
    .slice(0, 6);

  // Fetch slug + price for primary offerings. We need the slug to
  // route card clicks to the offering page (/p/&lt;slug&gt;) rather
  // than checkout - so the buyer can evaluate before being asked
  // to pay.
  const recOfferingIds = candidates.map((c: any) => c.primary_offering_id).filter(Boolean);
  const recOfferingMap: Record<string, { slug: string | null; price_inr: number | null }> = {};
  if (recOfferingIds.length) {
    const { data: recOffs } = await supabase
      .from("offerings")
      .select("id, slug, price_inr")
      .in("id", recOfferingIds)
      .eq("status", "active");
    (recOffs || []).forEach((o: any) => { recOfferingMap[o.id] = { slug: o.slug, price_inr: o.price_inr }; });
  }

  const recommendations: RecommendedCourse[] = candidates.map((c: any) => ({
    id: c.id,
    title: c.title,
    description: c.description,
    thumbnail_url: c.thumbnail_url,
    product_tier: c.product_tier,
    instructor_display_name: c.instructor_display_name,
    offering_id: c.primary_offering_id || null,
    offering_slug: c.primary_offering_id ? (recOfferingMap[c.primary_offering_id]?.slug ?? null) : null,
    price_inr: c.primary_offering_id ? (recOfferingMap[c.primary_offering_id]?.price_inr ?? null) : null,
  }));

  return { courses: result, recommendations, stats };
};

const MyCoursesPage = () => {
  usePageTitle("My courses");
  const { user } = useAuth();

  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["my-courses", user?.id ?? "anon"],
    queryFn: () => fetchMyCourses(user!.id),
    enabled: !!user,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });

  const courses = data?.courses ?? [];
  const recommendations = data?.recommendations ?? [];
  const stats = data?.stats ?? EMPTY_STATS;
  // `enabled: !!user` means the query is 'pending' until it runs; this page is
  // auth-gated so `user` is always present and the query fires immediately. On a
  // warm revisit within staleTime the data is served from cache and `isPending`
  // is false, so the skeleton is skipped.
  const loading = isPending;
  const error = isError ? LOAD_ERROR : null;

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">My courses</h1>
          <p className="text-base text-muted-foreground mt-1">
            Your enrolled programs and progress
          </p>
        </div>

        {/* This-week watch-time card + 3-stat strip. Skeleton parity while
            loading reserves the block's footprint so the resolved stats settle
            into place instead of popping in (kills the old `!loading &&`
            pop-in — P4-T5 CLS budget). Hidden entirely once we KNOW the user
            has no enrolments: the empty state owns that surface. */}
        {user && (loading || (!error && courses.length > 0)) && (
          <div className="space-y-4">
            <WeeklyStats userId={user.id} />
            {loading ? (
              <div className="grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <SurfaceCard key={i} variant="static" padding="md">
                    <div className="flex items-start justify-between gap-3">
                      <SkeletonLine width="60%" height="11px" className="mt-1" />
                      <span
                        className="skeleton-shimmer h-8 w-8 rounded-lg shrink-0"
                        aria-hidden
                      />
                    </div>
                    <SkeletonLine width="45%" height="32px" className="mt-2" />
                    <div className="mt-1" aria-hidden />
                  </SurfaceCard>
                ))}
              </div>
            ) : (
              // Calm STEAL-6 register: the resolved cards rise in with a gentle
              // sequential stagger (`.anim-stagger` — transform/opacity only,
              // reduced-motion instant). CountUp runs its in-view intro once per
              // mount; tabular-nums keeps the digits from reflowing.
              <div className="grid grid-cols-3 gap-3 anim-stagger">
                {[
                  { icon: BookOpen, value: stats.lessonsCompleted, label: "Lessons completed" },
                  { icon: Clock, value: stats.coursesInProgress, label: "In progress" },
                  { icon: Award, value: stats.certificates, label: "Certificates" },
                ].map((s) => (
                  <StatCard
                    key={s.label}
                    label={s.label}
                    value={<CountUp value={s.value} />}
                    icon={<s.icon className="h-4 w-4" />}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <ErrorState description={error} onRetry={() => refetch()} />
        ) : courses.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="h-5 w-5" />}
            title="You haven't enrolled in any courses yet"
            description="Explore the catalog and find the program that fits your craft."
            action={{ to: "/home", label: "Explore programs" }}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <SurfaceCard
                key={c.course_id}
                to={`/courses/${c.course_id}`}
                padding="none"
              >
                <ArtworkImage src={c.thumbnail_url} alt="" aspect="video" />
                <div className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-base font-semibold line-clamp-1 flex-1">{c.title}</h3>
                    <CourseRatingBadge courseId={c.course_id} />
                  </div>
                  {c.instructor_display_name && (
                    <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                  )}
                  <div className="flex items-center gap-3 pt-1">
                    <ProgressRing pct={c.progress_pct} size={44} label />
                    <div className="min-w-0">
                      {c.progress_pct >= 100 ? (
                        <span className="flex items-center gap-1 text-sm font-medium text-cream">
                          <Award className="h-3.5 w-3.5" />
                          Completed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-sm font-medium text-cream">
                          {c.progress_pct > 0 ? "Continue" : "Start course"}{" "}
                          <ArrowRight className="h-3 w-3" />
                        </span>
                      )}
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {c.progress_pct}% complete
                      </p>
                    </div>
                  </div>
                </div>
              </SurfaceCard>
            ))}
          </div>
        )}
        {/* Recommendations */}
        {!loading && recommendations.length > 0 && (
          <section className="pt-4">
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="h-5 w-5 text-cream" />
              <h2 className="text-xl font-semibold">Recommended for you</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendations.map((c) => (
                <SurfaceCard
                  key={c.id}
                  // Recommended cards on My Courses: send to the offering
                  // page so the user can evaluate, not straight to
                  // checkout. Skipping /p makes the back-button history
                  // weird and pressures the user into a buy decision
                  // before they've seen the trailer.
                  to={c.offering_slug ? `/p/${c.offering_slug}` : `/courses/${c.id}`}
                  padding="none"
                >
                  <div className="relative">
                    <ArtworkImage src={c.thumbnail_url} alt="" aspect="video" />
                    <div className="absolute top-2 left-2">
                      <TierBadge tier={c.product_tier} />
                    </div>
                  </div>
                  <div className="p-4 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-base font-semibold line-clamp-1 flex-1">{c.title}</h3>
                      <CourseRatingBadge courseId={c.id} />
                    </div>
                    {c.instructor_display_name && (
                      <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                    )}
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                      {!isNative() && c.price_inr != null ? (
                        <span className="text-base font-semibold">
                          ₹{new Intl.NumberFormat("en-IN").format(c.price_inr)}
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">View details</span>
                      )}
                      <span className="text-sm font-medium text-cream flex items-center gap-1">
                        Explore <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </SurfaceCard>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default MyCoursesPage;
