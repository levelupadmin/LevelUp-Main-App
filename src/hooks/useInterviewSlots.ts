import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * One open interview time, exactly as Calendly reports it. `schedulingUrl` is
 * Calendly's OWN public booking URL deep-linked to this start time — it is the
 * only thing that can actually create the invitee, because Calendly exposes
 * availability reads but no public create-invitee API. See the header of
 * `supabase/functions/calendly-slots/index.ts`.
 */
export interface InterviewSlot {
  /** ISO-8601 UTC start. */
  startTime: string;
  /** Calendly's public booking URL for this exact time. */
  schedulingUrl: string;
  /** Event-type duration in minutes, or null when Calendly omits it. */
  durationMinutes: number | null;
}

/**
 * Why the list came back empty. Drives the copy, never a dead end — the caller
 * MUST branch on this, because "Calendly is down" and "nothing is open" are
 * different sentences and only one of them is true at a time.
 */
export type InterviewSlotsReason =
  /**
   * `offerings.thankyou_show_calendly` is off — the first conjunct of the
   * marketing path's gate (`src/pages/ThankYou.tsx:797`).
   */
  | "booking_disabled"
  /**
   * `offerings.calendly_url` is blank or not a calendly.com URL — the SECOND
   * conjunct of that same gate. Both are saved independently by the admin
   * editor with no coupling, so "switch on, URL blank" is reachable.
   */
  | "no_calendly_url"
  | "not_configured"
  | "event_type_unresolved"
  | "no_availability"
  | "unavailable"
  | "rate_limited";

/**
 * The reasons that mean "we could not read availability", as opposed to "we
 * read it and nothing is open". These get honest error copy plus the hosted
 * calendar; only a genuine `no_availability` earns the "we'll text you" copy.
 * Conflating them is how an outage starts telling applicants a lie.
 *
 * `not_configured` (CALENDLY_TOKEN unset or misnamed at deploy) belongs here
 * and not with the graceful copy: Calendly was never asked, so "no times are
 * open" would be a false statement — and a reassuring one, which is how a
 * missing deploy secret goes unnoticed for a day.
 */
export const INTERVIEW_SLOTS_ERROR_REASONS = new Set<InterviewSlotsReason>([
  "unavailable",
  "rate_limited",
  "event_type_unresolved",
  "not_configured",
]);

export function isInterviewSlotsError(
  reason: InterviewSlotsReason | null | undefined,
): boolean {
  return !!reason && INTERVIEW_SLOTS_ERROR_REASONS.has(reason);
}

/**
 * The reasons that mean "the admin's own gate says this offering shows no
 * booking surface at all". The marketing path renders NOTHING for either one
 * (`ThankYou.tsx:797` gates on `thankyou_show_calendly && isCalendlyUrl(...)`),
 * so the app path must render nothing too — copy of any kind here, graceful or
 * otherwise, is a promise made on a pure misconfiguration and it breaks
 * ENTRY-PARITY-1 on the exact axis that rule exists to hold.
 */
export const INTERVIEW_SLOTS_SILENT_REASONS = new Set<InterviewSlotsReason>([
  "booking_disabled",
  "no_calendly_url",
]);

export function isInterviewSlotsSilent(
  reason: InterviewSlotsReason | null | undefined,
): boolean {
  return !!reason && INTERVIEW_SLOTS_SILENT_REASONS.has(reason);
}

export interface InterviewSlotsPayload {
  slots: InterviewSlot[];
  /** The offering's hosted Calendly link — the "see all times" escape hatch. */
  hostedUrl: string | null;
  reason: InterviewSlotsReason | null;
}

/** The empty, fail-soft payload. Callers render the graceful no-slots state. */
const EMPTY: InterviewSlotsPayload = { slots: [], hostedUrl: null, reason: "unavailable" };

export interface UseInterviewSlotsOptions {
  /** How many soonest slots to ask for. Server clamps to 1..5. Default 3. */
  count?: number;
  /**
   * Lets a parent keep the whole path inert behind an off-by-default flag —
   * the query never runs and no request is made.
   */
  enabled?: boolean;
}

/**
 * useInterviewSlots — read the soonest open interview times for one offering.
 *
 * Availability is read server-side by the `calendly-slots` edge function so
 * `CALENDLY_TOKEN` never reaches the client. What comes back is start times
 * plus Calendly's own public booking URLs, so the list always INHERITS
 * Calendly's availability truth: our buttons are a hint, Calendly's booking
 * page is the writer, and double-booking stays impossible by construction.
 *
 * Works signed-in AND guest. It deliberately takes no session and reads no
 * `auth.uid` — `supabase.functions.invoke` sends the anon key when there is no
 * session, which is all this read needs. Someone who paid the ₹400 through the
 * hosted intake chain has no app account yet, and that is the exact person this
 * surface exists for.
 *
 * `applicationId` scopes the cache only. It is NOT sent to Calendly: per
 * INTEG-PAY-1 the app seeds no id of its own into the intake chain, and per
 * ENTRY-PARITY-1 the invitee data produced here must be identical to the
 * marketing path's hosted link (`src/pages/ThankYou.tsx:796`).
 *
 * Fail-soft by contract: the queryFn RESOLVES on every error rather than
 * throwing, so a Calendly outage degrades to honest error copy plus a retry
 * instead of a spinner-lock or a retry storm.
 *
 * `staleTime` is short and refetch-on-focus is ON: availability moves under us,
 * and the applicant's most common return path is tabbing back from the Calendly
 * booking page, at which point the list must re-offer what is actually left.
 */
export interface UseInterviewSlotsResult {
  data: InterviewSlotsPayload | undefined;
  /**
   * "A request is out and has not answered yet" — the gate for the loading
   * skeleton, and NOTHING else.
   *
   * It is deliberately false when `offeringId` is undefined. A react-query v5
   * query that is disabled and holds no data reports `status: "pending"`
   * forever, so gating the skeleton on `isPending` alone would shimmer
   * indefinitely for a parent whose application row failed to load and will
   * never supply an id — a dead end at the peak-intent moment, with no retry
   * and no hosted link. Waiting on the PARENT is a different state from
   * waiting on the SERVER, and the caller has to be able to bound it.
   *
   * (`isLoading` is also wrong here for the opposite reason: v5 computes it as
   * `isPending && isFetching`, so it reads false while a disabled query still
   * has no data, which would flash the empty state instead.)
   */
  isWaiting: boolean;
  /** True while a retry / focus refetch is in flight. Drives the retry button. */
  isFetching: boolean;
  refetch: () => void;
}

export function useInterviewSlots(
  offeringId: string | undefined,
  applicationId: string | undefined,
  options: UseInterviewSlotsOptions = {},
): UseInterviewSlotsResult {
  const { count = 3, enabled = true } = options;

  const query = useQuery<InterviewSlotsPayload>({
    queryKey: ["interview", "slots", offeringId, applicationId, count],
    enabled: enabled && !!offeringId,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    // The fn already degrades internally; a client retry only multiplies load
    // on Calendly's rate limit for no user-visible gain. The applicant gets an
    // explicit retry control instead, which is both honest and cheaper.
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("calendly-slots", {
        body: { offering_id: offeringId, count },
      });
      // `functions.invoke` surfaces any non-2xx as `error` WITHOUT parsing the
      // body (`FunctionsHttpError` carries the raw Response and `data` is
      // null), which is exactly why `calendly-slots` answers 200 for every
      // upstream problem including throttling — a 429 would discard the
      // `reason` and the hosted link. What is left here is genuine transport
      // failure (offline, DNS, CORS), and EMPTY's `unavailable` is the honest
      // reading of that: error copy plus a retry, never "nothing is open".
      if (error || !data) return EMPTY;
      const payload = data as Partial<InterviewSlotsPayload>;
      return {
        slots: Array.isArray(payload.slots) ? payload.slots : [],
        hostedUrl: payload.hostedUrl ?? null,
        reason: payload.reason ?? null,
      };
    },
  });

  return {
    data: query.data,
    // Both `enabled: false` and an unresolved `offeringId` leave the query
    // disabled, and a disabled query is pending forever. Neither is a wait on
    // the server: one is a deliberate inert state, the other is a wait on the
    // PARENT, which only the caller can bound. Reporting either as `isWaiting`
    // is how a skeleton becomes permanent.
    isWaiting: enabled && !!offeringId && query.isPending,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
  };
}
