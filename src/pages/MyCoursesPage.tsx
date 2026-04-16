import { useEffect, useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { TierBadge } from "@/components/TierBadge";
import { Progress } from "@/components/ui/progress";
import LazyImage from "@/components/LazyImage";
import { ArrowRight, BookOpen, Sparkles, Award } from "lucide-react";

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
  price_inr: number | null;
}

const MyCoursesPage = () => {
  usePageTitle("My Courses");
  const { user } = useAuth();
  const [courses, setCourses] = useState<EnrolledCourse[]>([]);
  const [recommendations, setRecommendations] = useState<RecommendedCourse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetch = async () => {
      // Get active enrolments
      const { data: enrs } = await supabase
        .from("enrolments")
        .select("id, offering_id")
        .eq("user_id", user.id)
        .eq("status", "active");

      if (!enrs?.length) {
        setLoading(false);
        return;
      }

      // Get offering → course mappings
      const offeringIds = enrs.map((e) => e.offering_id);
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("offering_id, course_id")
        .in("offering_id", offeringIds);

      if (!ocs?.length) {
        setLoading(false);
        return;
      }

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
      const completedChapterIds = new Set(
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
      enrs.forEach((e) => enrolmentMap.set(e.offering_id, e.id));

      const result: EnrolledCourse[] = [];
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

      setCourses(result);

      // ── Recommendations: courses the user hasn't enrolled in ──
      const enrolledCourseIds = new Set(result.map((c) => c.course_id));
      const enrolledTiers = [...new Set(
        (await supabase.from("courses").select("product_tier").in("id", [...enrolledCourseIds])).data?.map((c: any) => c.product_tier) || []
      )];

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

      // Fetch prices for primary offerings
      const recOfferingIds = candidates.map((c: any) => c.primary_offering_id).filter(Boolean);
      let recOfferingMap: Record<string, number> = {};
      if (recOfferingIds.length) {
        const { data: recOffs } = await supabase
          .from("offerings")
          .select("id, price_inr")
          .in("id", recOfferingIds)
          .eq("status", "active");
        (recOffs || []).forEach((o) => { recOfferingMap[o.id] = o.price_inr; });
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
          price_inr: c.primary_offering_id ? (recOfferingMap[c.primary_offering_id] ?? null) : null,
        }))
      );

      setLoading(false);
    };
    fetch();
  }, [user]);

  return (
    <>
      <div className="space-y-8">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">My Courses</h1>
          <p className="text-base text-muted-foreground mt-1">
            Your enrolled programs and progress
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl h-[280px] animate-pulse" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium text-foreground mb-1">
              You haven't enrolled in any courses yet
            </p>
            <p className="text-muted-foreground text-sm">
              Explore our catalog and find the perfect program for you.
            </p>
            <Link
              to="/browse"
              className="inline-flex items-center gap-1.5 mt-4 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Browse Programs <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((c) => (
              <Link
                key={c.course_id}
                to={`/courses/${c.course_id}`}
                className="bg-surface border border-border rounded-xl overflow-hidden hover:-translate-y-1 hover:border-border-hover transition-all duration-200"
              >
                <div className="aspect-video bg-surface-2">
                  {c.thumbnail_url && (
                    <LazyImage src={c.thumbnail_url} alt="" className="w-full h-full" />
                  )}
                </div>
                <div className="p-4 space-y-2">
                  <h3 className="text-base font-semibold line-clamp-1">{c.title}</h3>
                  {c.instructor_display_name && (
                    <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                  )}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-muted-foreground">
                        {c.progress_pct}% complete
                      </span>
                    </div>
                    <Progress value={c.progress_pct} className="h-1.5" />
                  </div>
                  <div className="flex items-center gap-1 text-sm text-cream pt-1">
                    {c.progress_pct >= 100 ? (
                      <>
                        <Award className="h-3.5 w-3.5" />
                        Completed
                      </>
                    ) : (
                      <>
                        Continue <ArrowRight className="h-3 w-3" />
                      </>
                    )}
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
              <h2 className="text-xl font-semibold">Recommended for You</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommendations.map((c) => (
                <Link
                  key={c.id}
                  to={c.offering_id ? `/checkout/${c.offering_id}` : `/courses/${c.id}`}
                  className="bg-surface border border-border rounded-xl overflow-hidden hover:-translate-y-1 hover:border-border-hover transition-all duration-200"
                >
                  <div className="aspect-video bg-surface-2 relative">
                    {c.thumbnail_url && (
                      <LazyImage src={c.thumbnail_url} alt="" className="w-full h-full" />
                    )}
                    <div className="absolute top-2 left-2">
                      <TierBadge tier={c.product_tier} />
                    </div>
                  </div>
                  <div className="p-4 space-y-1.5">
                    <h3 className="text-base font-semibold line-clamp-1">{c.title}</h3>
                    {c.instructor_display_name && (
                      <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                    )}
                    {c.description && (
                      <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                    )}
                    <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                      {c.price_inr != null ? (
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
