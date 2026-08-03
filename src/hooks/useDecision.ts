import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { useFunnelStage } from "@/hooks/useFunnelStage";

/**
 * The outcome, as the student experiences it. `"pending"` means the decision
 * experience must NOT fire and the surface falls back to today's status-driven
 * view — either because no decision has reached the app yet, or because the
 * student has already ACTED on one (see `deriveVerdict`).
 */
export type DecisionVerdict = "accepted" | "rejected" | "waitlisted" | "pending";

/**
 * Everything the decision surfaces are allowed to personalise from. STRUCTURED
 * FIELDS ONLY (NFR-COPY-1): `cohort_applications.bio` IS the 100-word essay
 * (`FIELD_ALIASES.bio`, supabase/functions/_shared/tally.ts) and `tally_data` is
 * the raw submission — neither is selected by this hook, so no decision surface,
 * artifact or public page can leak essay text even by accident.
 */
export interface Decision {
  /** `cohort_applications.id` — the route param the reveal was opened with. */
  applicationId: string;
  /** The offering this application belongs to (scopes the reconciler read). */
  offeringId: string;
  /** The verdict the reveal announces. */
  verdict: DecisionVerdict;
  /** `full_name`, trimmed. Used by the card lockup (CD-06-CARD-02). */
  name: string;
  /** First token of `full_name` — the reveal addresses the student by it. */
  firstName: string;
  /** The programme/cohort lockup — `offerings.title`. */
  cohort: string;
  /** Their craft: `occupation` when they gave one, else the offering they applied to. */
  craft: string;
  /** `city`, trimmed, or null when they left it blank. */
  city: string | null;
  /**
   * When the held seat closes (REQ-DEC-5) — `cohort_applications.accepted_at`
   * plus `offerings.confirmation_deadline_days` plus
   * `offerings.confirmation_grace_hours`. `null` only when the anchor is absent
   * (no acceptance observed yet) or unparseable, and for any non-accepted
   * verdict; consumers then render the no-deadline copy rather than a fabricated
   * window.
   *
   * The anchor is `accepted_at` and NOTHING else, which is the whole reason that
   * column exists (migration `20260728120000`). The two timestamps already on the
   * row are reconciler bookkeeping: `reconciled_at` is re-stamped with `now()` on
   * EVERY reconcile run and `updated_at` moves with that same write, so — since
   * `useFunnelStage` re-invokes the fn on every mount past its staleTime — a
   * deadline hung off either would slide forward each time the student opened the
   * app, and would read as ALREADY LAPSED for someone accepted since the last
   * run. `accepted_at` is stamped ONCE, the first time the reconciler observes
   * the flip, and never moved.
   *
   * It is therefore FIRST-OBSERVATION time, not TeleCRM's decision time (the
   * reconciler cannot see one). That is the student-fair reading: the hold window
   * starts when the student could first learn they were in, so it can never
   * present as already lapsed on the very first open. Being server-side, it also
   * survives a refresh and a device swap — which is what makes the countdown
   * honest rather than resettable by clearing storage.
   *
   * **It is a DISPLAY value, never an entitlement gate.** A consumer may change
   * its copy once this time has passed; it must not withdraw the confirmation
   * path on it. The anchor is stamped ONCE and there is no write path to it
   * anywhere in the app (SOR-1), so it is never cleared and never re-based: a
   * student re-admitted into a later batch still carries the original stamp and
   * arrives with this value already in the past. Gating the ₹8k step on it would
   * make the "your acceptance carries to the next batch" promise unimplementable
   * without hand-written SQL, and would put this app's own surfaces in
   * disagreement — `ApplicationStatus.tsx` offers the same confirmation checkout
   * for an `accepted` row and applies no lapse check at all. Release is a manual
   * admin action in v1 (SEAT-1); the clock says how urgent, not who is allowed.
   */
  seatHeldUntil: Date | null;
}

export interface UseDecisionResult {
  /** The decision, or null while loading / flag off / not this user's row. */
  decision: Decision | null;
  /** True while the flag is on and either read is still in flight. */
  isLoading: boolean;
  /**
   * The read is PAUSED, not failed: react-query's default
   * `networkMode: "online"` parks a query with `fetchStatus: "paused"` while the
   * device is offline, which is neither loading (`isLoading` is false) nor an
   * answer. Consumers must branch on this BEFORE they treat a null decision as
   * "no decision" — see the Offline note on `useDecision`.
   */
  isOffline: boolean;
  /**
   * The read FAILED after its retries — a transport error, a 5xx, a broken
   * connection that still reports `navigator.onLine === true` (captive portal,
   * edge-of-signal mobile data: the common Android-WebView case, and the one
   * `isOffline` cannot see).
   *
   * This is distinct from `isOffline` and, more importantly, distinct from "no
   * decision". A failed read that degrades to a null decision looks exactly like
   * a student with nothing to see, and the consumers respond to that by
   * redirecting to `/my-application/:id` — whose own uncached fetch is failing
   * for the same reason and renders "Application Not Found". Consumers must
   * branch on this before the pending/redirect path so a flaky connection never
   * turns the emotional peak into a not-found page.
   */
  isError: boolean;
  /** Re-run the failed read. Wired to the retry affordance on the error state. */
  refetch: () => void;
  /** Whether the decision read path is live at all (`VITE_DECISION_FLOW`). */
  enabled: boolean;
}

/**
 * The EXPLICIT column list. Never `*`, and never `bio` / `tally_data` — see the
 * `Decision` docblock. Contact fields (email, phone) are omitted too: no
 * decision surface renders them, so they are not fetched. The reconciler mirror
 * columns are not read either: they record when reconciliation RAN, and nothing
 * here is allowed to date the acceptance off them (see `seatHeldUntil`) —
 * `accepted_at` is the one timestamp that means the acceptance itself.
 */
const DECISION_COLUMNS =
  "id, user_id, offering_id, status, full_name, city, occupation, accepted_at, " +
  "offerings(title, confirmation_deadline_days, confirmation_grace_hours)";

/** The row shape `DECISION_COLUMNS` returns. */
interface DecisionRow {
  id: string;
  user_id: string | null;
  offering_id: string;
  status: string;
  full_name: string;
  city: string | null;
  occupation: string | null;
  /** Stamped ONCE on first observation of `accepted` (migration 20260728120000). */
  accepted_at: string | null;
  offerings: {
    title: string;
    confirmation_deadline_days: number | null;
    confirmation_grace_hours: number | null;
  } | null;
}

/** `offerings.confirmation_deadline_days` DB default (migration 20260413100000). */
const DEFAULT_CONFIRMATION_DEADLINE_DAYS = 2;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/** A nullable numeric offering setting, floored at 0 and defaulted when absent. */
function positiveNumber(value: number | null | undefined, fallback: number): number {
  const n = typeof value === "number" ? value : Number.NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * The held-seat window (REQ-DEC-5): `accepted_at` + the offering's confirmation
 * deadline + its grace hours. Pure, and exported so the arithmetic behind the
 * countdown copy is asserted directly rather than through a rendered page.
 *
 * Returns null — never a guess — when the anchor is missing or unparseable. A
 * missing window is stated as missing by the consumers; a fabricated one is what
 * makes a countdown lie.
 */
export function deriveSeatHeldUntil(
  acceptedAt: string | null | undefined,
  deadlineDays: number | null | undefined,
  graceHours: number | null | undefined,
): Date | null {
  if (!acceptedAt) return null;
  const anchor = new Date(acceptedAt).getTime();
  if (!Number.isFinite(anchor)) return null;
  const days = positiveNumber(deadlineDays, DEFAULT_CONFIRMATION_DEADLINE_DAYS);
  // Grace is genuinely optional (nullable with no default) — absent means none.
  const grace = positiveNumber(graceHours, 0);
  return new Date(anchor + days * DAY_MS + grace * HOUR_MS);
}

/**
 * The exact shape of the ONE query this hook makes. ApplicationStatus reaches
 * for `(supabase as any)`; this is the same escape hatch narrowed to a single
 * read — a SELECT, and nothing else. There is deliberately no
 * `insert`/`update`/`upsert`/`rpc` on it: the app never writes a funnel status
 * (SOR-1), and this type makes that unrepresentable.
 */
interface DecisionQueryClient {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: string,
      ): { single(): Promise<{ data: unknown; error: PostgrestLikeError | null }> };
    };
  };
}

/** The only two fields of a supabase error this hook needs to branch on. */
interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
}

/**
 * PostgREST's "JSON object requested, multiple (or no) rows returned" — what
 * `.single()` returns when the row does not exist OR when RLS declines it. That
 * is a real, final answer ("there is no such row for you"), not a failed read,
 * so it resolves to null and the surface falls back to today's path. EVERY other
 * error is a failure to read and is thrown: react-query then retries it and, if
 * it still fails, reports `isError` so the consumer can say so instead of
 * pretending there is no decision.
 */
const NO_ROWS_CODE = "PGRST116";

/**
 * Statuses that are a decision in their own right. The reconciler's `Stage`
 * union (`supabase/functions/_shared/reconcile.ts`) has NO negative state, so a
 * rejection/waitlist can only be read off `cohort_applications.status` — and it
 * must win over any positive derived stage, the same floor ApplicationStatus
 * applies to the reconciled chip.
 */
const NEGATIVE_STATUS: Record<string, DecisionVerdict> = {
  rejected: "rejected",
  waitlisted: "waitlisted",
};

/**
 * Statuses that sit AT OR AHEAD of `accepted` on the application's own ladder
 * (`STATUS_TO_STEP` in `src/pages/ApplicationStatus.tsx`): the student has
 * already acted on the decision, so the decision experience is behind them.
 *
 * This is the second floor — the "never render BEHIND a positive local status"
 * rule ApplicationStatus already applies to the reconciled chip — and it is the
 * one that keeps a PAID student off the claim flow. The reconciler's `accepted`
 * stage is NOT a reliable "has not paid yet" signal: `deriveStage`
 * (`supabase/functions/_shared/reconcile.ts`) only advances past `accepted` when
 * it can SEE the seat-confirm in Razorpay under the join key, so a ₹8k paid from
 * another phone/email — or any run where Razorpay is unavailable and the fn
 * fail-softs to no products — falls straight through to `accepted` for a
 * `confirmation_paid`/`balance_paid`/`enrolled` row. Without this floor that row
 * gets "Your decision is ready" → "you're in." → "Claim my seat" → the
 * confirmation checkout: a pay-twice chase on the most visible surface in the
 * programme. `cohort_applications.status` is first-party truth here (the app's
 * own payment webhook writes it), so it wins.
 *
 * `withdrawn` is in the same bucket for the opposite reason: it never carries a
 * positive decision at all (`STATUS_TO_STEP` maps it to -1).
 */
const DECISION_ALREADY_ACTED: ReadonlySet<string> = new Set([
  "confirmation_paid",
  "balance_paid",
  "enrolled",
  "withdrawn",
]);

/**
 * Derive the verdict from the two READS. Nothing here writes: `accepted` is
 * observed (the reconciler saw TeleCRM flip), never authored (SOR-1).
 *
 * Exported for the D-1 spec — the floors below are the difference between a
 * reveal and a second charge, so they are asserted directly rather than through
 * a rendered page.
 */
export function deriveVerdict(
  status: string,
  funnelStage: string | undefined,
): DecisionVerdict {
  const s = status?.trim().toLowerCase() ?? "";
  // A rejection/waitlist is a decision in its own right and outranks any
  // positive derived stage.
  const negative = NEGATIVE_STATUS[s];
  if (negative) return negative;
  // Already acted on (or non-progressing) → the decision experience stays shut
  // and the status-driven timeline owns the surface.
  if (DECISION_ALREADY_ACTED.has(s)) return "pending";
  return funnelStage === "accepted" ? "accepted" : "pending";
}

function toDecision(row: DecisionRow, funnelStage: string | undefined): Decision {
  const verdict = deriveVerdict(row.status, funnelStage);
  const name = row.full_name?.trim() ?? "";
  const cohort = row.offerings?.title?.trim() ?? "";
  const occupation = row.occupation?.trim() ?? "";
  const city = row.city?.trim() ?? "";
  return {
    applicationId: row.id,
    offeringId: row.offering_id,
    verdict,
    name,
    // Address them by their first name; falls back to the whole string for a
    // single-token name, and to "" for a blank one (call sites render a generic
    // line rather than an empty address).
    firstName: name.split(/\s+/)[0] ?? "",
    cohort,
    // Craft comes from what they told us they do; when they left `occupation`
    // blank the offering they applied to stands in for it.
    craft: occupation || cohort,
    city: city || null,
    // Only an ACCEPTED verdict has a seat to hold. A rejection/waitlist, or a
    // student who has already acted on the decision, must never be shown a
    // countdown — even if the anchor happens to be stamped on their row.
    seatHeldUntil:
      verdict === "accepted"
        ? deriveSeatHeldUntil(
            row.accepted_at,
            row.offerings?.confirmation_deadline_days,
            row.offerings?.confirmation_grace_hours,
          )
        : null,
  };
}

/**
 * useDecision — READ one application's decision, ONLY when `VITE_DECISION_FLOW`
 * is on.
 *
 * **This hook only ever reads.** The app never writes a funnel status: TeleCRM
 * is the system of record (SOR-1) and there is no in-app admin decision RPC
 * (SEC-DECISION-1 was removed). The reveal fires because the reconciler
 * OBSERVED the flip to `accepted`.
 *
 * **Both flags must be on for an acceptance to surface.** The positive signal is
 * taken from `useFunnelStage` (Phase RC), which is itself gated on
 * `VITE_FUNNEL_RECON` — so with `VITE_DECISION_FLOW` on but `VITE_FUNNEL_RECON`
 * off, the stage read never runs, the verdict stays `"pending"`, and the surface
 * falls back to today's path. Rejections/waitlists come off the application's
 * own status and need only `VITE_DECISION_FLOW`.
 *
 * **Offline.** Neither this read nor the funnel read is eligible for the
 * persisted cache: `PERSISTED_QUERY_ROOTS` in `src/lib/queryClient.ts` lists
 * four roots and neither `"decision"` nor `"funnel"` is among them. That is a
 * decision, not an oversight — the whitelist exists to keep sensitive payloads
 * off disk, and this is the most sensitive payload in the app: the verdict plus
 * `full_name`/`city`/`occupation`, written to `localStorage`, would leave one
 * student's outcome on a shared device for whoever opens the app next. So there
 * is deliberately no offline COPY of the decision, and no second cache is built
 * to fake one.
 *
 * What there is instead is an honest offline STATE. react-query's default
 * `networkMode: "online"` PAUSES a query while the device is offline
 * (`fetchStatus: "paused"`, `isLoading` false, data undefined) rather than
 * erroring; `isOffline` surfaces exactly that, so the reveal can hold the seal
 * with an offline note instead of treating "no answer" as "no decision" and
 * redirecting to a page that cannot load either. react-query resumes the paused
 * fetch itself on the `online` event, so the reveal fires the moment the
 * connection returns — or on the next open.
 *
 * **Known deviation from the brief, stated plainly.** D-1's edge case reads
 * "`accepted` arriving offline → reveal on next open". What ships is: the reveal
 * fires on the next open WITH CONNECTIVITY. An open that is still offline shows
 * the holding screen, not the verdict, because there is no offline copy of the
 * decision to show — see the paragraph above for why one is not created. The
 * verdict is never lost and never late by more than a reconnect; it is simply
 * not readable from disk. Widening `PERSISTED_QUERY_ROOTS` is the only thing
 * that would close the gap literally, and it is a deliberate no.
 *
 * **A failed read is NOT an offline read.** `navigator.onLine` — which is all
 * `isOffline` can see — reports `true` on the most common Android-WebView
 * failure: attached to Wi-Fi with no working internet, a captive portal, mobile
 * data at the edge of signal. Those take the ERROR path, which is why `isError`
 * exists separately. Collapsing it into "no decision" is what bounces an
 * accepted student onto `/my-application/:id`, whose own uncached fetch is
 * failing identically and renders "Application Not Found".
 *
 * Flag off — or no `applicationId`/`uid` yet — the query never runs and
 * `decision` stays null, so every consumer is inert and the surface is
 * byte-identical to today.
 */
export function useDecision(applicationId: string | undefined): UseDecisionResult {
  const { user } = useAuth();
  const enabled = flag(DECISION_FLOW) && !!applicationId && !!user?.id;

  const application = useQuery<DecisionRow | null>({
    queryKey: ["decision", "application", applicationId, user?.id],
    enabled,
    staleTime: 60_000,
    // Bounded on purpose. The default (3, backing off past 7s) leaves the
    // student on a spinner at the emotional peak; two attempts settle into the
    // honest error state inside ~3s, and the state itself offers a retry.
    retry: 2,
    queryFn: async () => {
      // `enabled` already guarantees both, but the queryFn is typed on its own.
      if (!applicationId || !user?.id) return null;
      // Read-only by construction — see `DecisionQueryClient`.
      const { data, error } = await (supabase as unknown as DecisionQueryClient)
        .from("cohort_applications")
        .select(DECISION_COLUMNS)
        .eq("id", applicationId)
        .single();

      if (error) {
        // "No such row for you" (missing, or RLS declining it) is an ANSWER —
        // resolve to null and let the surface fall back to today's path.
        if (error.code === NO_ROWS_CODE) return null;
        // Everything else is a FAILURE to read. Throwing is what keeps it
        // distinguishable from "no decision": resolving here would collapse a
        // captive portal into a redirect onto a page that is also failing.
        throw new Error(error.message || "Could not read the decision");
      }
      if (!data) return null;
      const row = data as DecisionRow;
      // Ownership guard on top of RLS: only the owning student sees a decision.
      if (row.user_id !== user?.id) return null;
      return row;
    },
  });

  const row = application.data ?? null;
  // Scoped to THIS application's offering, so a sibling application's stage can
  // never announce this one's decision. Undefined offering id keeps it disabled.
  const funnel = useFunnelStage(user?.id, row?.offering_id);

  return {
    decision: row ? toDecision(row, funnel.data?.stage) : null,
    isLoading: enabled && (application.isLoading || funnel.isLoading),
    // Either read parked by the offline network mode. Reported even when the
    // application row is already in memory: without the funnel read the verdict
    // can only be `"pending"`, and a redirect on THAT is the not-found degrade
    // this exists to prevent.
    isOffline:
      enabled &&
      (application.fetchStatus === "paused" || funnel.fetchStatus === "paused"),
    // Only the application read can report this: `useFunnelStage` fail-softs to
    // `null` by design (a stage it cannot derive degrades the surface to the
    // status-driven view, which is a correct answer, not an error).
    isError: enabled && application.isError,
    refetch: () => {
      void application.refetch();
    },
    enabled,
  };
}
