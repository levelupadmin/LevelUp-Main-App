import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EnrolmentCounts {
  /** offering_id -> active enrolment count */
  counts: Record<string, number>;
  /** Top 3 offering_ids by total enrolment count */
  popularIds: Set<string>;
}

/**
 * Batch-fetch active enrolment counts grouped by offering_id.
 * Returns counts map and a set of the top-3 "Popular" offering IDs.
 *
 * Pass the offering IDs you care about so the query stays scoped.
 * If offeringIds is empty, returns empty results.
 */
export const useEnrolmentCounts = (offeringIds: string[]) => {
  const [data, setData] = useState<EnrolmentCounts>({ counts: {}, popularIds: new Set() });

  useEffect(() => {
    if (!offeringIds.length) return;

    const load = async () => {
      // Single RPC-free query: fetch all active enrolments for the given offerings
      // and count client-side. Supabase JS doesn't support GROUP BY natively,
      // so we select minimal columns and aggregate in JS.
      // Using a raw count per offering via multiple .eq would be N+1, so instead
      // we fetch offering_id only for active enrolments and tally.
      const { data: rows, error } = await supabase
        .from("enrolments")
        .select("offering_id")
        .in("offering_id", offeringIds)
        .eq("status", "active");

      if (error || !rows) return;

      const counts: Record<string, number> = {};
      rows.forEach((r: { offering_id: string }) => {
        counts[r.offering_id] = (counts[r.offering_id] || 0) + 1;
      });

      // Top 3 by count = "Popular"
      const sorted = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .filter(([, count]) => count >= 10); // only mark as popular if at least 10 enrolments

      setData({
        counts,
        popularIds: new Set(sorted.map(([id]) => id)),
      });
    };

    load();
  }, [offeringIds.join(",")]); // stable dependency

  return data;
};

/**
 * Format enrolment count for display.
 * Returns null if count is too low to show.
 */
export const formatEnrolmentLabel = (count: number | undefined): string | null => {
  if (!count || count < 10) return null;
  if (count >= 100) return `${count}+ enrolled`;
  if (count >= 50) return `${count}+ enrolled`;
  return `${count} students`;
};

/**
 * Whether to show the flame/hot indicator (count >= 100).
 */
export const isHotCourse = (count: number | undefined): boolean => {
  return !!count && count >= 100;
};
