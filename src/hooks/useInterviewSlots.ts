import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useInterviewSlots.ts — the reader behind the in-app Calendly booking embed.
 *
 * The FILE NAME is a leftover and is kept only so this task touches no path it
 * does not own; nothing here reads slots. INTEG-CAL-1 (04-INTEGRATION-CONTRACTS
 * §6.4) rules that the interview is booked through the EXISTING hosted Calendly
 * link in the intake chain, with an OPTIONAL in-app inline embed as the only
 * app-side surface. App-native buttons over Calendly's availability API are
 * PARKED (fast-follow, with CRO-1) — and they were also the double-booking risk
 * the ruling names, because a slot list we construct ourselves is a second,
 * staler opinion about a calendar Calendly alone writes.
 *
 * So this module reads exactly one thing: whether THIS offering has a booking
 * surface at all, and which Calendly URL it is. Availability is never read here
 * or on the server; it is inherited, in the strongest sense, by handing the
 * applicant Calendly's own booking page inside an iframe. Calendly stays the
 * sole reader AND writer of its own availability, so double-booking is
 * impossible by construction rather than by care.
 *
 * The read is a plain client select on `offerings`, which carries a public
 * SELECT policy (`offerings_public_read`, migration 20260407182236) — no edge
 * function, no `CALENDLY_TOKEN` anywhere in the stack, and it works signed-in
 * AND guest. Someone who paid the ₹400 through the hosted intake chain may have
 * no app session yet, and that is the exact person this surface exists for.
 */

/**
 * Why no embed was rendered. Drives the copy, and the caller MUST branch on it:
 * "the admin switched booking off" and "we could not read the offering" are
 * different facts and only one of them is ever true at a time.
 */
export type InterviewBookingReason =
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
  /**
   * The offering row is not VISIBLE to this applicant: zero rows came back and
   * the transport reported no error. In practice that means the offering was
   * archived — `AdminOfferings.tsx:85` flips `status` active↔archived with one
   * click, which is routine when a cohort closes while applicants are still
   * mid-funnel at `app_fee_paid`, and BOTH RLS policies on `offerings` are
   * scoped to `status = 'active'` for a non-admin (`offerings_read_active`,
   * `offerings_public_read`).
   *
   * This is a LIFECYCLE fact, not an outage, and the distinction is the whole
   * point of splitting it out: reported as `unavailable` it would render "we
   * could not load your interview calendar just now" plus a "Check again"
   * button that can NEVER succeed, plus a promise to text them — a permanent
   * fake outage. It is silent instead, for the same reason `booking_disabled`
   * is: the row we would need in order to offer a booking surface is not there,
   * so there is no booking surface, and copy on top of that is a promise made
   * about a state the applicant cannot influence.
   */
  | "no_offering"
  /** The offering row could not be READ at all — offline, or a transport error. */
  | "unavailable";

/**
 * The reasons that mean "we could not read the offering", as opposed to "we
 * read it and it says there is no booking surface". These get honest error copy
 * plus a retry. Conflating the two is how an outage starts telling applicants
 * something that is not true.
 */
export const INTERVIEW_BOOKING_ERROR_REASONS = new Set<InterviewBookingReason>([
  "unavailable",
]);

export function isInterviewBookingError(
  reason: InterviewBookingReason | null | undefined,
): boolean {
  return !!reason && INTERVIEW_BOOKING_ERROR_REASONS.has(reason);
}

/**
 * The reasons that mean "there is no booking surface for this offering at all":
 * the admin's own gate says so, or the offering the gate lives on is no longer
 * visible. The marketing path renders NOTHING for the first two
 * (`ThankYou.tsx:797` gates on `thankyou_show_calendly && isCalendlyUrl(...)`),
 * so the app path must render nothing too — copy of any kind here, graceful or
 * otherwise, is a promise made on a pure misconfiguration and it breaks
 * ENTRY-PARITY-1 on the exact axis that rule exists to hold. `no_offering` joins
 * them because an archived offering is the same shape of fact (see its docs
 * above): permanent, admin-owned, and not something a retry can move.
 */
export const INTERVIEW_BOOKING_SILENT_REASONS = new Set<InterviewBookingReason>([
  "booking_disabled",
  "no_calendly_url",
  "no_offering",
]);

export function isInterviewBookingSilent(
  reason: InterviewBookingReason | null | undefined,
): boolean {
  return !!reason && INTERVIEW_BOOKING_SILENT_REASONS.has(reason);
}

/**
 * Same guard `ThankYou.tsx:48` applies before embedding the hosted iframe: pin
 * every Calendly URL to calendly.com before handing it to a browser, so a
 * mis-pasted or tampered admin link cannot turn the booking step into a
 * phishing hop that arrives prefilled with the applicant's name and email.
 * Duplicated rather than imported because that helper is page-local, and this
 * task does not own `ThankYou.tsx`.
 */
export function isCalendlyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname === "calendly.com" || parsed.hostname.endsWith(".calendly.com");
  } catch {
    return false;
  }
}

export interface InterviewBookingPayload {
  /** The offering's Calendly booking URL, already pinned to calendly.com. */
  bookingUrl: string | null;
  reason: InterviewBookingReason | null;
}

/** The fail-soft payload: honest error copy plus a retry, never a dead end. */
const UNAVAILABLE: InterviewBookingPayload = { bookingUrl: null, reason: "unavailable" };

export interface UseInterviewBookingResult {
  data: InterviewBookingPayload | undefined;
  /**
   * "A request is out and has not answered yet" — the gate for the loading
   * skeleton, and NOTHING else.
   *
   * It is deliberately false when `offeringId` is undefined. A react-query v5
   * query that is disabled and holds no data reports `status: "pending"`
   * forever, so gating the skeleton on `isPending` alone would shimmer
   * indefinitely for a parent that will never supply an id. Waiting on the
   * PARENT is a different state from waiting on the SERVER.
   */
  isWaiting: boolean;
  /** True while a retry is in flight. Drives the retry button. */
  isFetching: boolean;
  refetch: () => void;
}

/**
 * Read whether this offering has an in-app booking surface, and its URL.
 *
 * Fail-soft by contract: the queryFn RESOLVES on every error rather than
 * throwing, so a bad connection degrades to honest copy plus a retry instead of
 * a spinner-lock or a retry storm.
 */
export function useInterviewBooking(
  offeringId: string | undefined,
): UseInterviewBookingResult {
  const query = useQuery<InterviewBookingPayload>({
    queryKey: ["interview", "booking", offeringId],
    enabled: !!offeringId,
    // The admin toggle and the URL change about as often as an offering is
    // edited, and the availability that actually moves lives inside Calendly's
    // own iframe — so there is nothing here worth re-reading on every focus.
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    // The applicant gets an explicit retry control instead, which is both
    // honest and cheaper than a background retry they cannot see.
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("calendly_url, thankyou_show_calendly")
        .eq("id", offeringId as string)
        .maybeSingle();

      // Transport failure and zero-rows are DIFFERENT facts and `maybeSingle`
      // is what makes them separable — it resolves `{data: null, error: null}`
      // for "no row matched" and only sets `error` for a real failure. Folding
      // them together (the old `if (error || !data)`) turned an archived
      // offering into a permanent, unfixable "we could not load your calendar,
      // check again" — an outage report and an SMS promise standing in for a
      // row-visibility fact. Only the first of these two is retryable.
      if (error) return UNAVAILABLE;
      if (!data) return { bookingUrl: null, reason: "no_offering" };

      // BOTH conjuncts of the marketing path's gate, reported separately so the
      // caller can go silent on either without pretending it knows which.
      if (data.thankyou_show_calendly !== true) {
        return { bookingUrl: null, reason: "booking_disabled" };
      }
      if (!isCalendlyUrl(data.calendly_url)) {
        return { bookingUrl: null, reason: "no_calendly_url" };
      }
      return { bookingUrl: data.calendly_url as string, reason: null };
    },
  });

  return {
    data: query.data,
    // A disabled query is pending forever, and that is a wait on the PARENT,
    // which only the caller can bound. Reporting it as `isWaiting` is how a
    // skeleton becomes permanent.
    isWaiting: !!offeringId && query.isPending,
    isFetching: query.isFetching,
    refetch: () => {
      void query.refetch();
    },
  };
}
