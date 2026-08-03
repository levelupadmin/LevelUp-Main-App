import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useFunnelStage } from "@/hooks/useFunnelStage";
import { usePendingClaims, type PendingClaim } from "@/hooks/useClaimApplication";

/**
 * useApplicantStage — the ONE applicant surface Home reads (REQ-IDENT-4).
 *
 * It answers a single question: does the signed-in user have a live cohort
 * application, and if so which of the label states is it in? There is NO new
 * state machine here — the states are a projection of two vocabularies that
 * already exist:
 *   • `cohort_applications.status` (first-party truth, the same vocabulary the
 *     `ApplicationStatus` timeline renders), and
 *   • the reconciled funnel stage from `useFunnelStage` — consumed, never
 *     reimplemented, and completely inert unless `VITE_FUNNEL_RECON` is on.
 *
 * `useFunnelStage` returns `undefined` (flag off / still loading) or `null`
 * (fn unreachable, it fail-softs rather than throwing). BOTH mean exactly one
 * thing here: fall back to `cohort_applications.status`. Neither is an error
 * state, and neither ever holds the card in a spinner.
 *
 * It reads THREE sources, not two, and the third is why the claim step has an
 * entry point at all: a parked collision row has `user_id` NULL by construction
 * (S-2 stamps nothing when it cannot tell whose it is), so it is invisible to
 * the owned-row read below — `students_read_own_applications` only ever returns
 * rows already stamped with this uid. S-4's `usePendingClaims` is the discovery
 * read for exactly those rows (it calls the argument-free RPC
 * `get_my_pending_claim()`, whose SELECT list is a whitelist: an id, the
 * offering, the channel still to prove and a MASK — never the applicant's
 * essay, raw submission or identifiers), and it is consumed here rather than
 * reimplemented. Without it `/claim/:applicationId` is unreachable from
 * anywhere in the app and a collided applicant never gets offered the claim.
 */

/** The label states the card can render. Nothing else is a stage. */
export type ApplicantStage = "draft" | "fee-pending" | "in-review" | "decision-ready";

/**
 * What Home renders. A discriminated union so the card can never show a stage
 * chip for a row that has not been claimed, and never invents a CTA for a stage
 * it does not understand.
 */
export type ApplicantStageView =
  | { kind: "claim"; applicationId: string; offeringTitle: string | null }
  | { kind: "stage"; stage: ApplicantStage; applicationId: string; offeringTitle: string | null }
  | { kind: "neutral"; applicationId: string; offeringTitle: string | null };

/**
 * The projection of the row this hook reads. `pending_claim` is deliberately
 * absent: a row this query can see is a row the caller already owns, so the
 * flag has nothing left to decide (see `deriveApplicantStage`). The query below
 * still selects `*` so it never depends on S-2's column existing yet.
 */
export interface ApplicantApplicationRow {
  id: string;
  offering_id: string;
  status: string;
  offerings?: { title: string | null } | null;
}

/**
 * `cohort_applications.status` → label state. Mirrors the vocabulary of
 * `ApplicationStatus`'s STATUS_TO_STEP (that page owns the full timeline; this
 * is only the four-state projection of it).
 *
 * `"hidden"` means the applicant surface is over and the card must be ABSENT:
 * a paid/enrolled student is served by the rest of the feed, and a withdrawn
 * row has no next step to point at. Hiding is a FIRST-PARTY decision only —
 * nothing the reconciler derives can delete the card (see RECONCILED_STAGE).
 *
 * NOTHING maps to `draft`, and nothing can today: `cohort_applications.status`
 * has no such value (the table's CHECK constraint, migration 20260413100000,
 * lists none) and a half-filled Tally form is never inserted in the first place
 * (`isIngestableSubmission`). The state stays in the vocabulary because
 * REQ-IDENT-4 names it and because the day a first-party draft status exists,
 * ONE line here lights it up — the spec's "changing the underlying status
 * changes the surface with no other code change". What it must NOT be is
 * back-filled from a derived signal: see RECONCILED_STAGE on `partial`.
 *
 * A status this build does not know (the server gains one and shipped
 * Capacitor clients lag it by days) is deliberately absent from this map: it
 * falls through to the neutral card rather than guessing a CTA.
 */
const STATUS_STAGE: Record<string, ApplicantStage | "hidden" | undefined> = {
  submitted: "fee-pending",
  app_fee_paid: "in-review",
  interview_scheduled: "in-review",
  interview_done: "in-review",
  accepted: "decision-ready",
  rejected: "decision-ready",
  waitlisted: "decision-ready",
  confirmation_paid: "hidden",
  balance_paid: "hidden",
  enrolled: "hidden",
  withdrawn: "hidden",
};

/**
 * Reconciled `Stage` (the kebab union from `_shared/reconcile.ts`) → label
 * state, consumed only when `VITE_FUNNEL_RECON` is on.
 *
 * A stage earns a line here only if it passes BOTH tests:
 *   1. `ApplicationStatus` itself consumes it — it is in that page's
 *      RECONCILED_STAGE_UI *and* RECONCILED_STAGE_STEP (:79-101, :127-135) — so
 *      the two surfaces can never draw opposite conclusions from one payload;
 *   2. it has a first-party TWIN in STATUS_STAGE that lands on the same label,
 *      so the reconciler is only ever mirroring a status the app has not
 *      written yet, never asserting a state first-party truth cannot express.
 *
 * An unmapped stage means exactly one thing: fall back to
 * `cohort_applications.status`. Nothing here can hide the card.
 *
 * DELIBERATELY UNMAPPED:
 *   • `"unknown"` — the orphan. It asserts nothing, so the status decides (and
 *     when the status is unknown too, the neutral card does).
 *   • `"accepted"` — fails test 1. `ApplicationStatus` omits it from both of its
 *     maps on purpose ("fires its own experience in a later phase", :69-72), so
 *     that page renders the status-driven timeline for it. Mapping it here put
 *     a "See your decision" CTA on Home that routed to a page showing no
 *     decision — two surfaces, one payload, contradictory conclusions.
 *   • `"partial"` — fails test 2. It has no first-party twin: there is no draft
 *     status (see STATUS_STAGE), and it fires on a Tally-unreachable run or a
 *     bare TeleCRM `new` (`reconcile.ts:600`), both of which co-occur with a
 *     genuinely ingested, COMPLETE application. It is not evidence that anyone
 *     left a form half-finished, so it may not tell a submitted applicant their
 *     application is unfinished. (Prior art agrees in its own register:
 *     `ApplicationStatus` renders it chip-only, with no action.)
 *   • `"completed-no-fee"` and `"confirm-paid-no-balance"` — the RC v1 ruling
 *     (cohort-rc-v1-scope V1-1): the reconciler's money attribution from shared
 *     external amounts is structurally fragile, so a money-bearing reconciled
 *     stage drives NOTHING here. See MONEY_STAGES.
 *   • `"enrolled"` — it is an INFERENCE from an external payment signal, and an
 *     inference must degrade the card, never delete it. Mapping it to a hidden
 *     surface stranded the exact person it described: a row whose first-party
 *     status is still `accepted` (confirmation payment owed) would lose its
 *     only entry point on Home. Unmapped, it degrades to the status-driven view
 *     — the same way ApplicationStatus falls back to its status-driven timeline.
 */
const RECONCILED_STAGE: Record<string, ApplicantStage | undefined> = {
  "fee-paid-no-interview": "in-review",
  "interview-scheduled": "in-review",
  "awaiting-decision": "in-review",
};

/**
 * The money-bearing reconciled stages, suppressed outright (RC v1 ruling). They
 * are already absent from RECONCILED_STAGE, so this is a second, explicit lock:
 * if either is ever added to that map, this set still drops it back to the
 * status-driven view. Nothing in this file renders a payment CTA — the card's
 * single action always routes to the application's own page, which owns the
 * staged payment buttons AND their `isIOS()` anti-steering guard — so a
 * reconciled stage (ambiguous or not) has no path to reintroduce one.
 */
const MONEY_STAGES = new Set<string>(["completed-no-fee", "confirm-paid-no-balance"]);

/** Position of each label state on the applicant ladder. */
const STAGE_RANK: Record<ApplicantStage, number> = {
  draft: 0,
  "fee-pending": 1,
  "in-review": 2,
  "decision-ready": 3,
};

/**
 * The lowest rung a status will let the reconciler render, i.e. the FLOOR. The
 * reconciler may run AHEAD of `cohort_applications.status` (that is its whole
 * purpose: surface an external signal the app has not mirrored yet) but never
 * BEHIND progress somebody actually recorded.
 *
 * `-1` when the status is one this build does not know: it asserts nothing, so
 * any understood reconciled stage may render.
 */
const floorFor = (fromStatus: ApplicantStage | undefined): number =>
  fromStatus === undefined ? -1 : STAGE_RANK[fromStatus];

export const APPLICANT_STAGE_QUERY_KEY = "applicant-stage";

/**
 * Every cache root this card reads through, so ONE pull-to-refresh on Home
 * moves it. The owned row alone is not enough: with `VITE_FUNNEL_RECON` on, the
 * reconciler is the only source that sees a payment captured in the external
 * Razorpay browser (`cohort_applications.status` has not been mirrored yet), and
 * its query lives under a different root with a 60s staleTime and the app-wide
 * `refetchOnWindowFocus: false` — so without invalidating it too, the pull
 * refetches the row, gets the same answer, and the card never moves.
 *
 * The two foreign roots are spelled out rather than imported because neither
 * hook exports a prefix builder: `["funnel","stage",uid,offeringId]`
 * (useFunnelStage.ts:53) and `pendingClaimsKey` = `["claim","pending",uid]`
 * (useClaimApplication.ts:268). Prefixes match every user-scoped variant.
 */
export const APPLICANT_STAGE_REFRESH_KEYS: readonly (readonly unknown[])[] = [
  [APPLICANT_STAGE_QUERY_KEY],
  ["claim", "pending"],
  ["funnel", "stage"],
];

/**
 * Pure projection: the application row (+ the reconciled stage when the flag is
 * on, + any row parked for this caller to claim) → what the card renders, or
 * `null` for "render nothing".
 *
 * Order of precedence, and why:
 *   1. A parked `pending_claim` row → the claim step (S-4), NOT a stage chip.
 *      It is the applicant's real open loop (nothing else in the app can attach
 *      it) and no stage may be asserted about a row that is not yet proven to
 *      belong to this account. It outranks an owned row for the same reason.
 *   2. No owned row → nothing. Non-applicants never see this card.
 *   3. A terminal status → nothing. Only a first-party status hides the card:
 *      an enrolled/withdrawn row has no applicant next step. A derived stage
 *      never removes the surface, it only ever changes what it says.
 *   4. The reconciled stage, if it is non-money, understood, and at or above
 *      the floor this row's status imposes (see `floorFor`).
 *   5. Otherwise the status-derived stage.
 *   6. Neither vocabulary understood it → the neutral card. Never a wrong CTA.
 *      Reachable whenever the server's status vocabulary runs ahead of this
 *      build (a new status + a shipped client that lags it by days) and the
 *      reconciler is off, unreachable, or itself reports `unknown`.
 *
 * Note what is NOT here: the owned row's own `pending_claim` flag. A row this
 * caller can read through `students_read_own_applications` is already stamped
 * with their uid, so the identity question is settled whatever the flag says —
 * and routing a stamped row to the claim step would land on that screen's
 * "Nothing to confirm" dead end (discovery filters `user_id IS NULL`).
 */
export function deriveApplicantStage(
  row: ApplicantApplicationRow | null | undefined,
  reconciledStage: string | null | undefined,
  pendingClaim?: PendingClaim | null,
): ApplicantStageView | null {
  if (pendingClaim) {
    return {
      kind: "claim",
      applicationId: pendingClaim.applicationId,
      offeringTitle: pendingClaim.offeringTitle,
    };
  }

  if (!row) return null;

  const applicationId = row.id;
  const offeringTitle = row.offerings?.title ?? null;

  const fromStatus = STATUS_STAGE[row.status];
  if (fromStatus === "hidden") return null;

  const reconciled =
    reconciledStage && !MONEY_STAGES.has(reconciledStage)
      ? RECONCILED_STAGE[reconciledStage]
      : undefined;

  const stage =
    reconciled && STAGE_RANK[reconciled] >= floorFor(fromStatus) ? reconciled : fromStatus;

  if (!stage) return { kind: "neutral", applicationId, offeringTitle };
  return { kind: "stage", stage, applicationId, offeringTitle };
}

/**
 * Read the signed-in user's most recent application — and any row parked for
 * them to claim — and project it onto the label states. `view` is `null`
 * whenever there is nothing honest to show (no user, no application, a terminal
 * row, or a read that failed), so Home can leave the card ABSENT rather than
 * render an empty block.
 *
 * `isLoading` is the "we do not know yet" window Home reserves the card's slot
 * against on a cold open. It is TRUE only while a real read is in flight: with
 * no signed-in user neither query runs, and a failed read resolves to `null`/
 * `[]` rather than staying pending, so this can never hold the feed open.
 */
export function useApplicantStage(): {
  view: ApplicantStageView | null;
  isLoading: boolean;
} {
  const { user } = useAuth();
  const uid = user?.id;

  const { data: application, isLoading } = useQuery<ApplicantApplicationRow | null>({
    queryKey: [APPLICANT_STAGE_QUERY_KEY, uid],
    enabled: !!uid,
    staleTime: 60_000,
    // A completed claim stamps `user_id` on a row this query has already cached
    // as `null`, and the claim path invalidates only its own discovery key
    // (useClaimApplication.ts:370) — so without this the applicant would land
    // back on Home and find no card for the application they just attached,
    // until the 60s staleTime lapsed. Refetching on mount costs one single-row
    // read and keeps the cached answer on screen while it runs (no spinner).
    refetchOnMount: "always",
    queryFn: async () => {
      if (!uid) return null;
      // `select("*")` on purpose: `pending_claim` is S-2's column (and S-2 owns
      // its `types.ts` entry), so naming it explicitly would both fail to type
      // here and 400 the whole read — blanking the card — on any client that
      // runs ahead of the migration. Mirrors ApplicationStatus's own read.
      const { data, error } = await supabase
        .from("cohort_applications")
        .select("*, offerings(title)")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Fail-soft, exactly like useFunnelStage: a failed read degrades to "no
      // card", never to a thrown query or a retry storm on the home feed.
      if (error || !data) return null;
      return data as ApplicantApplicationRow;
    },
  });

  // Discovery for parked collision rows (S-4). Fail-soft by construction: no
  // session, a policy that is not deployed yet, or any error all resolve to
  // `[]`. Most recent first, and one card shows one loop, so the newest parked
  // row is the one offered.
  const { data: pendingClaims, isLoading: claimsLoading } = usePendingClaims();
  const pendingClaim = pendingClaims?.[0] ?? null;

  // Scoped to THIS application's offering so a sibling offering's progress can
  // never bleed onto this row. `offering_id` is undefined until the application
  // lands, which keeps the query disabled; with the flag off it never runs at
  // all and `data` stays `undefined` — the status-only fallback.
  const reconciled = useFunnelStage(uid, application?.offering_id).data;

  const view = useMemo(
    () => deriveApplicantStage(application, reconciled?.stage, pendingClaim),
    [application, reconciled?.stage, pendingClaim],
  );

  // `!!uid &&` is belt-and-braces: react-query already reports a disabled query
  // as not-loading, and pinning it here means no future default can turn "no
  // signed-in user" into a permanently-open loading window for Home's gate.
  return { view, isLoading: !!uid && (isLoading || claimsLoading) };
}
