import { useEffect, useState } from "react";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import CountUp from "@/components/motion/CountUp";
import { cn } from "@/lib/utils";

export interface OfferingProof {
  /** Average course rating from course_rating_stats; null when no reviews. */
  avg: number | null;
  /** Active enrolment count for the offering; null when zero/unavailable. */
  enrolled: number | null;
}

/**
 * Fetches the social-proof numbers once per page: avg rating from the same
 * course_rating_stats view CourseRatingBadge reads, plus a cheap head-count
 * of active enrolments for the offering. Both signals resolve to null when
 * the data is zero or absent; callers render nothing in that case, we
 * never fake numbers. Pass a null offeringId to skip fetching entirely
 * (e.g. on native, where price/proof contexts are hidden).
 */
export function useOfferingProof(
  offeringId?: string | null,
  courseId?: string | null,
): OfferingProof {
  const [avg, setAvg] = useState<number | null>(null);
  const [enrolled, setEnrolled] = useState<number | null>(null);

  useEffect(() => {
    if (!offeringId) return;
    let cancelled = false;
    (async () => {
      try {
        const [ratingRes, countRes] = await Promise.all([
          courseId
            ? supabase
                .from("course_rating_stats")
                .select("avg_rating, total_reviews")
                .eq("course_id", courseId)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase
            .from("enrolments")
            .select("id", { count: "exact", head: true })
            .eq("offering_id", offeringId)
            .eq("status", "active"),
        ]);
        if (cancelled) return;
        const stats = ratingRes.data;
        if (stats && Number(stats.total_reviews ?? 0) > 0 && Number(stats.avg_rating ?? 0) > 0) {
          setAvg(Number(stats.avg_rating));
        }
        const count = countRes.count ?? 0;
        if (count > 0) setEnrolled(count);
      } catch {
        // Proof row is a nice-to-have, fail silent, render nothing.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offeringId, courseId]);

  return { avg, enrolled };
}

interface ProofRowProps extends OfferingProof {
  className?: string;
}

/**
 * "★ {avg} · {count} enrolled", display-only; pair with useOfferingProof
 * hoisted in the page so two placements (hero + purchase rail) share one
 * fetch. Renders nothing when both signals are absent.
 */
export default function ProofRow({ avg, enrolled, className }: ProofRowProps) {
  if (avg == null && enrolled == null) return null;
  return (
    <div className={cn("flex flex-wrap items-center gap-2 text-sm text-muted-foreground", className)}>
      {avg != null && (
        <span className="inline-flex items-center gap-1">
          <Star className="h-4 w-4 fill-gold text-gold" />
          <span className="font-medium text-foreground">{avg.toFixed(1)}</span>
        </span>
      )}
      {avg != null && enrolled != null && <span aria-hidden="true">·</span>}
      {enrolled != null && (
        <span>
          <CountUp value={enrolled} className="font-medium text-foreground" /> enrolled
        </span>
      )}
    </div>
  );
}
