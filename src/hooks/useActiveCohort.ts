import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns the offering id of the user's current active cohort (staged-payment
 * offering with an active enrolment and at least one cohort_week). Returns
 * null if no active cohort. Used to surface "My Cohort" in the sidebar only
 * when relevant.
 */
export function useActiveCohort(): { offeringId: string | null; loading: boolean } {
  const { user } = useAuth();
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) { setLoading(false); setOfferingId(null); return; }
    let cancelled = false;
    (async () => {
      // Find any active enrolment on a staged-payment offering for this user.
      // Then ensure the batch has at least one cohort_week so the page is
      // worth linking to.
      const { data } = await supabase
        .from("enrolments")
        .select(`
          offering_id,
          offerings:offering_id (id, payment_mode),
          cohort_batch_members:offering_id ()
        `)
        .eq("user_id", user.id)
        .eq("status", "active");
      if (cancelled) return;
      const cohortEnrolment = (data || []).find((e: any) => e.offerings?.payment_mode === "staged");
      if (!cohortEnrolment) { setOfferingId(null); setLoading(false); return; }

      // Confirm a cohort_week exists for any of the user's batches in this offering
      const { data: members } = await supabase
        .from("cohort_batch_members")
        .select("batch_id, enrolments:enrolment_id (offering_id, user_id)")
        .eq("enrolments.user_id", user.id);
      const batchIds = (members || [])
        .filter((m: any) => m.enrolments?.offering_id === cohortEnrolment.offering_id)
        .map((m: any) => m.batch_id);
      if (batchIds.length === 0) { setOfferingId(null); setLoading(false); return; }

      const { count } = await supabase
        .from("cohort_weeks")
        .select("id", { head: true, count: "exact" })
        .in("cohort_batch_id", batchIds);
      if (cancelled) return;
      setOfferingId((count || 0) > 0 ? cohortEnrolment.offering_id : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { offeringId, loading };
}
