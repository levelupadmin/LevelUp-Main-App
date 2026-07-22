import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { flag, FUNNEL_RECON } from "@/lib/flags";

/**
 * Reconciled funnel stage payload returned by the `reconcile-funnel-stage`
 * edge fn. This is the app's first first-party read of the caller's funnel
 * stage — derived server-side from Tally / TeleCRM / Razorpay and mirrored onto
 * `cohort_applications`. Consumers read it from THIS payload, never off the
 * `reconciled_*` mirror columns.
 */
export interface FunnelStage {
  /** Derived §6 stage key (kebab-case), or `"unknown"` for an orphan. */
  stage: string;
  /** Which key resolved the caller across the external systems. */
  resolvedKey: "phone" | "email" | null;
  /** The two markers invisible in `cohort_applications.status` today. */
  markers: {
    completedNoFee: boolean;
    contactablePartial: boolean;
  };
  /**
   * The money signal behind this stage could not be pinned to exactly one
   * offering (a shared ₹400/₹8k/₹15k amount with no corroborating first-party
   * row or lead status). When true the client withholds the money CTA and
   * degrades to the status-driven timeline, which owns payments — "when in
   * doubt, show information, never a money CTA."
   */
  ambiguous: boolean;
}

/**
 * useFunnelStage — read the caller's reconciled funnel stage for ONE offering,
 * ONLY when `VITE_FUNNEL_RECON` is on.
 *
 * `offeringId` scopes the derivation to a single application's offering: the
 * edge fn requires `offering_id` in the body (it 400s without it) and returns a
 * per-application stage, so the chip/CTA can never bleed a sibling offering's
 * global progress onto this row. It is part of the query key so each offering
 * caches independently.
 *
 * Flag off — or no `uid`/`offeringId` yet (the application is still loading) —
 * the query never runs and `data` stays `undefined`, so consumers fall back to
 * `cohort_applications.status` exactly as today (zero behavioral diff). The
 * whole reconciler path is inert. A fail-soft `null` (fn unreachable) degrades
 * the surface to the status-only view — the queryFn resolves rather than
 * throwing, so there is never a spinner-lock or retry storm.
 */
export function useFunnelStage(uid: string | undefined, offeringId: string | undefined) {
  const enabled = flag(FUNNEL_RECON) && !!uid && !!offeringId;

  return useQuery<FunnelStage | null>({
    queryKey: ["funnel", "stage", uid, offeringId],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("reconcile-funnel-stage", {
        body: { offering_id: offeringId },
      });
      // Degrade to status-only on any error/empty — never throw (no spinner-lock).
      if (error || !data) return null;
      return data as FunnelStage;
    },
  });
}
