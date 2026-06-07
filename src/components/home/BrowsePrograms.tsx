import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import LazyImage from "@/components/LazyImage";
import { TierBadge } from "@/components/TierBadge";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useEnrolmentCounts, formatEnrolmentLabel, isHotCourse } from "@/hooks/useEnrolmentCounts";
import CourseRatingBadge from "@/components/reviews/CourseRatingBadge";
import { isNative } from "@/lib/platform";

// ── Browse Programs ──
const BrowsePrograms = () => {
  const { user } = useAuth();
  const [courses, setCourses] = useState<any[]>([]);
  // Set of offering_ids the current user has an active enrolment in — used
  // to swap the card CTA from "Enroll" to "Continue" and route to the
  // course page instead of checkout. Without this, signed-in students saw
  // "Enroll" on courses they already own, which is jarring.
  const [enrolledOfferingIds, setEnrolledOfferingIds] = useState<Set<string>>(new Set());

  const offeringIds = useMemo(
    () => courses.map((c: any) => c.offering_id).filter(Boolean) as string[],
    [courses]
  );
  const { counts: enrolmentCounts, popularIds } = useEnrolmentCounts(offeringIds);

  useEffect(() => {
    if (!user) {
      setEnrolledOfferingIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("enrolments")
        .select("offering_id")
        .eq("user_id", user.id)
        .eq("status", "active");
      if (cancelled) return;
      setEnrolledOfferingIds(new Set((data || []).map((e) => e.offering_id).filter(Boolean)));
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, slug, title, description, thumbnail_url, product_tier, sort_order, duration_text, instructor_display_name, status")
          .in("status", ["published", "upcoming"])
          .order("sort_order", { ascending: true })
          .limit(6);

        if (!coursesData?.length) return;

        const courseIds = coursesData.map((c) => c.id);

        const { data: primaryData } = await supabase
          .from("courses")
          .select("id, primary_offering_id")
          .in("id", courseIds) as any;

        const primaryMap: Record<string, string | null> = {};
        (primaryData ?? []).forEach((p: any) => { primaryMap[p.id] = p.primary_offering_id ?? null; });

        const primaryOfferingIds = [...new Set(
          Object.values(primaryMap).filter(Boolean) as string[]
        )];

        let offeringMap: Record<string, any> = {};

        if (primaryOfferingIds.length) {
          const { data: offs } = await supabase
            .from("offerings")
            .select("id, slug, price_inr, mrp_inr")
            .in("id", primaryOfferingIds)
            .eq("status", "active");
          (offs ?? []).forEach((o) => { offeringMap[o.id] = o; });
        }

        const coursesWithoutPrimary = coursesData.filter((c) => !primaryMap[c.id]);
        const fallbackOcMap: Record<string, string> = {};

        if (coursesWithoutPrimary.length) {
          const fallbackIds = coursesWithoutPrimary.map((c) => c.id);
          const { data: ocs } = await supabase
            .from("offering_courses")
            .select("course_id, offering_id")
            .in("course_id", fallbackIds);

          const fallbackOffIds = [...new Set((ocs ?? []).map((oc) => oc.offering_id))];
          if (fallbackOffIds.length) {
            const { data: fallbackOffs } = await supabase
              .from("offerings")
              .select("id, slug, price_inr, mrp_inr")
              .in("id", fallbackOffIds)
              .eq("status", "active");
            (fallbackOffs ?? []).forEach((o) => { if (!offeringMap[o.id]) offeringMap[o.id] = o; });
          }

          (ocs ?? []).forEach((oc) => { if (!fallbackOcMap[oc.course_id]) fallbackOcMap[oc.course_id] = oc.offering_id; });
        }

        setCourses(coursesData.map((c) => {
          const offId = primaryMap[c.id] || fallbackOcMap[c.id] || null;
          const off = offId ? offeringMap[offId] : null;
          return { ...c, offering_id: offId, offering_slug: off?.slug ?? null, price_inr: off?.price_inr, mrp_inr: off?.mrp_inr };
        }));
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load browse programs:", err);
      }
    };
    load();
  }, []);

  if (!courses.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Browse Programs</h2>
        <Link to="/browse" className="text-sm text-cream flex items-center gap-1">
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((c) => {
          const isEnrolled = !!c.offering_id && enrolledOfferingIds.has(c.offering_id);
          return (
          <Link
            key={c.id}
            // Enrolled: continue learning in the course detail view.
            // Not enrolled: send to the public offering page so they can
            // evaluate, watch the free preview, and *then* decide to
            // enrol. Jumping straight to /checkout from Home skipped the
            // entire marketing surface and broke the back-button history.
            to={isEnrolled
              ? `/courses/${c.id}`
              : c.offering_slug ? `/p/${c.offering_slug}` : `/courses/${c.id}`}
            className="bg-surface border border-border rounded-2xl overflow-hidden card-hover"
          >
            <div className="aspect-video bg-surface-2 relative">
              {c.thumbnail_url && <LazyImage src={c.thumbnail_url} alt="" className="w-full h-full" />}
              <div className="absolute top-2 left-2 flex items-center gap-1.5">
                <TierBadge tier={c.product_tier} />
                {c.offering_id && popularIds.has(c.offering_id) && (
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono bg-orange-500 text-white">
                    Popular
                  </span>
                )}
              </div>
            </div>
            <div className="p-4">
              <h3 className="text-base font-semibold mt-1 line-clamp-1">{c.title}</h3>
              {c.instructor_display_name && (
                <p className="text-xs text-muted-foreground mt-0.5">{c.instructor_display_name}</p>
              )}
              <CourseRatingBadge courseId={c.id} />
              {c.offering_id && formatEnrolmentLabel(enrolmentCounts[c.offering_id]) && (
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  {isHotCourse(enrolmentCounts[c.offering_id]) && (
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
                  )}
                  {formatEnrolmentLabel(enrolmentCounts[c.offering_id])}
                </p>
              )}
              {c.duration_text && (
                <p className="text-xs font-mono text-muted-foreground mt-1">{c.duration_text}</p>
              )}
              <div className="flex items-center justify-between mt-3">
                {/* Path B (Reader Rule): no price chips in the Android shell. */}
                {isNative() ? (
                  <span />
                ) : c.price_inr != null ? (
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-base font-semibold">₹{Number(c.price_inr).toLocaleString()}</span>
                    {c.mrp_inr && Number(c.mrp_inr) > Number(c.price_inr) && (
                      <>
                        <span className="text-sm text-muted-foreground line-through">₹{Number(c.mrp_inr).toLocaleString()}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                          Save {Math.round((1 - Number(c.price_inr) / Number(c.mrp_inr)) * 100)}%
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="text-sm text-muted-foreground">Price TBA</span>
                )}
                <span className="text-sm text-cream flex items-center gap-1">
                  {isEnrolled ? "Continue" : isNative() ? "View" : "Enroll"} <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </Link>
          );
        })}
      </div>
    </section>
  );
};

export default BrowsePrograms;
