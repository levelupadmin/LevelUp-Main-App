import { useCallback, useEffect, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TierBadge } from "@/components/TierBadge";
import { Button } from "@/components/ui/button";
import { ArtworkImage } from "@/components/media/ArtworkImage";
import { ArrowRight, BookOpen, Sparkles, Award, WifiOff, RefreshCw, GraduationCap, PlayCircle } from "lucide-react";
import CourseCardSkeleton from "@/components/skeletons/CourseCardSkeleton";
import CourseRatingBadge from "@/components/reviews/CourseRatingBadge";
import { isNative } from "@/lib/platform";
import { ProgressRing } from "@/components/progress/ProgressRing";
import { WeeklyStats } from "@/components/progress/WeeklyStats";
import { CountUp } from "@/components/motion/CountUp";

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

const MyCoursesPage = () => {
  usePageTitle("My courses");
  const { user } = useAuth();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedCourse[]>([]);
  const [stats, setStats] = useState<LearningStats>({
    lessonsCompleted: 0,
    coursesInProgress: 0,
    certificates: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Get active enrolments
      const { data: enrs, error: enrsError } = await supabase
        .from("enrolments")
        .select("id, offering_id")
        .eq("user_id", user.id)
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
          .eq("user_id", user.id)
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

      setCourses(result);

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
        .eq("user_id", user.id);
      setStats({
        lessonsCompleted,
        coursesInProgress,
        certificates: certCount ?? 0,
      });

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
      let recOfferingMap: Record<string, { slug: string | null; price_inr: number | null }> = {};
      if (recOfferingIds.length) {
        const { data: recOffs } = await supabase
          .from("offerings")
          .select("id, slug, price_inr")
          .in("id", recOfferingIds)
          .eq("status", "active");
        (recOffs || []).forEach((o: any) => { recOfferingMap[o.id] = { slug: o.slug, price_inr: o.price_inr }; });
      }

      setRecommendations(
        candidates.map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          thumbnail_url: c.thumbnail_url,
          product_tier: c.product_tier,
          instructor_display_name: c.instructor_display_name,
          offering_id: c.primary_offering_id || null,
          offering_slug: c.primary_offering_id ? (recOfferingMap[c.primary_offering_id]?.slug ?? null) : null,
          price_inr: c.primary_offering_id ? (recOfferingMap[c.primary_offering_id]?.price_inr ?? null) : null,
        }))
      );

      setLoading(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Failed to load my courses:", err);
      setError("We couldn't load this. Check your connection and try again.");
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetch(); }, [fetch]);

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">My courses</h1>
          <p className="text-base text-muted-foreground mt-1">
            Your enrolled programs and progress
          </p>
        </div>

        {/* This-week watch-time card + 3-stat strip, only once the user has courses */}
        {!loading && !error && courses.length > 0 && user && (
          <div className="space-y-4">
            <WeeklyStats userId={user.id} />
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: GraduationCap, value: stats.lessonsCompleted, label: "Lessons completed" },
                { icon: PlayCircle, value: stats.coursesInProgress, label: "In progress" },
                { icon: Award, value: stats.certificates, label: "Certificates" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-xl border border-border bg-surface p-4 flex flex-col gap-1"
                >
                  <s.icon className="h-4 w-4 text-cream" />
                  <span className="text-2xl font-semibold leading-none mt-1 tabular-nums">
                    <CountUp value={s.value} />
                  </span>
                  <span className="text-xs text-muted-foreground leading-tight">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <CourseCardSkeleton key={i} />
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <WifiOff className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium text-foreground mb-1">Something went wrong</p>
            <p className="text-muted-foreground text-sm">{error}</p>
            <Button onClick={() => fetch()} variant="outline" className="mt-4 gap-2">
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : courses.length === 0 ? (
          // Inline empty state (matches the shared <EmptyState> visual language)
          // so the CTA can be a 44px-tall (h-11) touch target at 360px — the
          // shared component's CTA is h-10 (40px), which fails the min touch
          // target on this Learn landing. `.pressable` gives it the same press
          // feedback as the other CTAs on the page.
          <div className="anim-rise flex flex-col items-center justify-center text-center px-6 py-12">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-cream/20 bg-surface/60 text-cream mb-5">
              <BookOpen size={22} strokeWidth={1.5} />
            </div>
            <h3 className="font-serif-italic text-xl text-cream">
              You haven't enrolled in any courses yet
            </h3>
            <p className="text-muted-foreground text-sm mt-2 max-w-[300px] leading-relaxed">
              Explore our catalog and find the perfect program for you.
            </p>
            <Link
              to="/"
              className="focus-ring pressable mt-6 inline-flex items-center justify-center h-11 px-5 rounded-full bg-cream text-cream-text font-medium text-sm hover:bg-cream/90 transition-colors"
            >
              Explore programs
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <Link
                key={c.course_id}
                to={`/courses/${c.course_id}`}
                className="pressable bg-surface border border-border rounded-xl overflow-hidden hover:-translate-y-1 hover:border-border-hover transition-all duration-base"
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
              </Link>
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
                <Link
                  key={c.id}
                  // Recommended cards on My Courses: send to the offering
                  // page so the user can evaluate, not straight to
                  // checkout. Skipping /p makes the back-button history
                  // weird and pressures the user into a buy decision
                  // before they've seen the trailer.
                  to={c.offering_slug ? `/p/${c.offering_slug}` : `/courses/${c.id}`}
                  className="pressable bg-surface border border-border rounded-xl overflow-hidden hover:-translate-y-1 hover:border-border-hover transition-all duration-base"
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
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
};

export default MyCoursesPage;
