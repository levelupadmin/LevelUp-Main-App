import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarClock, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { tapTick } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import {
  isInterviewSlotsError,
  isInterviewSlotsSilent,
  useInterviewSlots,
  type InterviewSlot,
} from "@/hooks/useInterviewSlots";

export interface SlotButtonsProps {
  /**
   * The `cohort_applications` row this booking belongs to. Used to scope the
   * slot cache and to identify the applicant to the CALLER's own analytics. It
   * is deliberately NOT sent to Calendly: INTEG-PAY-1 retired seeding an app id
   * into the intake chain, and ENTRY-PARITY-1 requires the invitee record
   * produced here to be identical to the one the marketing path's hosted link
   * produces (`src/pages/ThankYou.tsx:796`).
   */
  applicationId: string | undefined;
  /**
   * Resolves the Calendly event type server-side, via `offerings.calendly_url`.
   * May be `undefined` while the parent still resolves the application row: the
   * component shows its skeleton rather than the empty state, but only for
   * `PARENT_RESOLVE_TIMEOUT_MS`, after which it assumes the id is never coming
   * and degrades to the hosted calendar. A parent whose row query has failed
   * therefore gets a way forward, not a permanent shimmer.
   */
  offeringId: string | undefined;
  /** Prefill for Calendly's booking form. All optional — guests may have none. */
  email?: string | null;
  name?: string | null;
  /**
   * Accepted so callers can pass the applicant they already hold, but
   * deliberately NOT prefilled into Calendly — see `withPrefill` below. The
   * marketing path sends only `name` and `email`, and an extra field on one
   * path alone changes which key the webhook reconciles that booking on
   * (ENTRY-PARITY-1).
   */
  phone?: string | null;
  /**
   * The offering's hosted Calendly link, when the parent already has it. Used
   * as the "see all times" fallback before the server answers, and if the
   * server can't resolve one. Pinned to calendly.com before it is ever opened.
   */
  hostedUrl?: string | null;
  /** How many soonest slots to offer. Default 3 (the brief's number). */
  count?: number;
  /**
   * Fires when the applicant has been handed off to Calendly for `slot` — i.e.
   * booking INTENT at peak intent, NOT a confirmed booking. Nothing here can
   * confirm a booking: Calendly owns the write, and the confirmation arrives
   * asynchronously through the `calendly-webhook` receiver. Callers must not
   * render a "booked" state off this callback.
   */
  onBooked?: (slot: InterviewSlot) => void;
  className?: string;
}

/**
 * Same guard `ThankYou.tsx:48` applies before embedding the hosted iframe: pin
 * every Calendly URL to calendly.com before handing it to a browser, so a
 * mis-pasted or tampered admin link can't turn the booking step into a phishing
 * hop. Duplicated rather than imported because that helper is page-local.
 */
function isCalendlyUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return parsed.hostname === "calendly.com" || parsed.hostname.endsWith(".calendly.com");
  } catch {
    return false;
  }
}

/**
 * Calendly's documented prefill query params — `name` and `email`, and nothing
 * else. Applied to EVERY hand-off to Calendly, the slot buttons and the two
 * "full calendar" links alike.
 *
 * The links matter as much as the buttons. The marketing path prefills every
 * invitee (`ThankYou.tsx:804` builds its iframe src with `name=` and `email=`),
 * so an app-path applicant who leaves through a bare link and types
 * `rahul@gmial.com` produces an invitee `calendly-webhook` cannot match to a
 * `cohort_applications` row (phone-primary, email-fallback, INTEG-KEY-1). They
 * booked, and they reconcile as "fee paid, interview not scheduled" — the loss
 * REQ-INT-0 exists to close, re-created by an unprefilled href.
 *
 * ENTRY-PARITY-1 is why the list stops there. The marketing path builds its
 * iframe src with exactly `name=` and `email=` (`ThankYou.tsx:804`), so adding
 * a field here would make the two paths produce DIFFERENT invitee records:
 * `_shared/calendly.ts` reads `invitee.text_reminder_number` as the phone and
 * `calendly-webhook` matches phone-primary with email as fallback, so an
 * app-path booking prefilled with a phone would reconcile on a different join
 * key than the identical marketing-path booking. Same fields, same invitee
 * shape, same join key, both paths.
 *
 * (If phone-primary matching is wanted for both, the change belongs to the task
 * that owns `ThankYou.tsx` — adding it on one side only is the divergence.)
 *
 * Prefill is a convenience, never a requirement: an unparseable URL falls back
 * to the raw link rather than blocking the booking.
 */
function withPrefill(
  schedulingUrl: string,
  fields: { name?: string | null; email?: string | null },
): string {
  try {
    const url = new URL(schedulingUrl);
    if (fields.name) url.searchParams.set("name", fields.name);
    if (fields.email) url.searchParams.set("email", fields.email);
    return url.toString();
  } catch {
    return schedulingUrl;
  }
}

// Interview times are always quoted in IST — the interviewers sit in India and
// the applicant must read the same wall clock they will. Formatting in the
// device timezone while labelling it "IST" would mislead anyone travelling.
const DAY_FMT = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

/**
 * How long the skeleton waits on a PARENT that has not supplied `offeringId`
 * yet before it stops shimmering. V-3's `ApplicationStatus` resolves the
 * application row asynchronously and `cohort_applications.offering_id` is
 * non-nullable, so a missing id means the row query is either still in flight
 * or has failed outright — and only one of those ever ends. Generous enough to
 * cover a slow row read on a bad connection, bounded so the failed case
 * degrades to the hosted calendar instead of shimmering forever at the exact
 * moment intent peaks.
 */
const PARENT_RESOLVE_TIMEOUT_MS = 8_000;

function slotLabel(startTime: string): string | null {
  const date = new Date(startTime);
  if (Number.isNaN(date.getTime())) return null;
  return `${DAY_FMT.format(date)}, ${TIME_FMT.format(date)} IST`;
}

function durationLabel(minutes: number | null): string | null {
  if (!minutes || minutes <= 0) return null;
  return `${minutes} min`;
}

/**
 * SlotButtons — the three soonest interview times as one-tap buttons, rendered
 * at the step that follows the ₹400 payment (REQ-INT-0 / CRO-2). Booking at
 * peak intent is the whole point: the loss this closes is "fee paid, interview
 * not scheduled", born in the hour between paying and scheduling.
 *
 * WHAT "ONE TAP" HONESTLY MEANS. Calendly exposes availability reads but no
 * public create-invitee API, so a tap cannot write a booking. It launches
 * Calendly's OWN scheduling page deep-linked to the chosen time and prefilled
 * with the applicant's details. That is deliberate, not a shortcut: Calendly
 * stays the sole writer of its calendar, so these buttons inherit Calendly's
 * availability truth and can never double-book. The confirmation comes back
 * asynchronously through the `calendly-webhook` receiver, and this component
 * NEVER renders a booked state the webhook has not confirmed.
 *
 * Self-contained and parent-agnostic: it owns no route, reads no session, and
 * writes nothing. A parent may mount it behind an off-by-default flag.
 *
 * Never a dead end, and never a lie. The empty paths are kept apart:
 *   • the admin's gate says no booking surface — switch off OR no valid
 *     Calendly URL, the same two conjuncts `ThankYou.tsx:797` tests → renders
 *     NOTHING, exactly like the marketing path (ENTRY-PARITY-1). A promise
 *     ("we'll text you") on a pure misconfiguration is the failure mode here;
 *   • availability read, nothing open → "we'll text you the next opening",
 *     plus a check-again control and the hosted calendar when we have it;
 *   • availability NOT read (Calendly down, token unset, event type unreadable)
 *     → says so, and offers a retry;
 *   • throttled → says so, and offers the hosted calendar INSTEAD of a retry,
 *     because the shared counter increments on every call and a retry provably
 *     cannot clear the window it is retrying against;
 *   • the parent never supplies an `offeringId` → the skeleton is bounded, then
 *     falls back to the hosted calendar (or to nothing, if we have no link).
 * Every rendered state carries at least one tappable way forward.
 */
export const SlotButtons = ({
  applicationId,
  offeringId,
  email,
  name,
  hostedUrl,
  count = 3,
  onBooked,
  className,
}: SlotButtonsProps) => {
  const m = useMotionSafe();
  const [handedOffAt, setHandedOffAt] = useState<string | null>(null);

  const { data, isWaiting, isFetching, refetch } = useInterviewSlots(
    offeringId,
    applicationId,
    { count },
  );

  // Prefer the link the parent already holds; fall back to the one the server
  // resolved. Pinned either way — an unpinned URL is treated as absent, and
  // prefilled every time, so leaving through the calendar produces the same
  // invitee record as leaving through a slot button (ENTRY-PARITY-1).
  const fallbackUrl = useMemo(() => {
    const candidate = hostedUrl ?? data?.hostedUrl ?? null;
    if (!isCalendlyUrl(candidate)) return null;
    return withPrefill(candidate as string, { name, email });
  }, [hostedUrl, data?.hostedUrl, name, email]);

  // Waiting on the PARENT, not on the server: `offeringId` has not arrived, so
  // no request has been made and none will be until it does. Bounded, because
  // "still loading" and "will never arrive" look identical from in here.
  const awaitingParent = !offeringId;
  const [parentTimedOut, setParentTimedOut] = useState(false);
  useEffect(() => {
    if (!awaitingParent) {
      setParentTimedOut(false);
      return;
    }
    const timer = window.setTimeout(
      () => setParentTimedOut(true),
      PARENT_RESOLVE_TIMEOUT_MS,
    );
    return () => window.clearTimeout(timer);
  }, [awaitingParent]);

  // A slot that went past while this screen sat open is not offerable, and a
  // non-Calendly scheduling URL never gets rendered as a tap target.
  const slots = useMemo(() => {
    const now = Date.now();
    return (data?.slots ?? []).filter(
      (slot) =>
        isCalendlyUrl(slot.schedulingUrl) && new Date(slot.startTime).getTime() > now,
    );
  }, [data?.slots]);

  const handleTap = useCallback(
    (slot: InterviewSlot) => {
      void tapTick();
      const url = withPrefill(slot.schedulingUrl, { name, email });
      // Opened SYNCHRONOUSLY on the tap. Awaiting a re-validation first would
      // trip the browser's popup blocker (the open would no longer be inside
      // the user gesture) and add latency at the exact moment intent peaks.
      // We don't need the pre-check: Calendly's own booking page re-validates
      // the time and refuses a slot taken since render, which is precisely the
      // "inherit Calendly's availability truth" rule. The refetch below then
      // re-offers whatever is actually left.
      window.open(url, "_blank", "noopener,noreferrer");
      setHandedOffAt(slot.startTime);
      onBooked?.(slot);
      refetch();
    },
    [name, email, onBooked, refetch],
  );

  const listVariants = {
    hidden: {},
    show: { transition: { staggerChildren: m.reduced ? 0 : 0.05 } },
  };
  const itemVariants = {
    hidden: { opacity: 0, y: m.reduced ? 0 : 8 },
    show: { opacity: 1, y: 0, transition: m.springs.glide },
  };

  const heading = (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-foreground">Book your interview</h3>
      <p className="text-sm text-muted-foreground">
        {slots.length > 0
          ? "Pick the soonest time that works for you."
          : "This is the last step before your application is reviewed."}
      </p>
    </div>
  );

  const calendarLink = fallbackUrl && (
    <a
      href={fallbackUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-foreground underline underline-offset-4"
    >
      Check the full calendar
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  );

  const retryButton = (
    <motion.button
      type="button"
      whileTap={m.pressTap}
      onClick={() => {
        void tapTick();
        refetch();
      }}
      disabled={isFetching}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-border px-4 py-2",
        "bg-surface text-sm font-medium text-foreground transition-colors",
        "hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:opacity-60",
      )}
    >
      <RotateCw className="h-4 w-4" aria-hidden="true" />
      {isFetching ? "Checking…" : "Check again"}
    </motion.button>
  );

  // ── Waiting ── either a request is genuinely in flight, or the parent has
  // not handed us an `offeringId` yet and its grace window is still open. The
  // hook reports `isWaiting` only for the first of those, precisely so the
  // second can be bounded here rather than shimmering forever.
  if (isWaiting || (awaitingParent && !parentTimedOut)) {
    return (
      <section className={cn("space-y-4", className)} aria-busy="true">
        {heading}
        <div className="space-y-2">
          {Array.from({ length: count }).map((_, i) => (
            <div
              key={i}
              className="h-[56px] rounded-lg border border-border bg-surface animate-pulse"
            />
          ))}
        </div>
        <span className="sr-only">Loading interview times</span>
      </section>
    );
  }

  // The parent's grace window closed with no `offeringId`: its application row
  // failed or is absent, and no request will ever be made. Hand over the hosted
  // calendar if the parent gave us one, otherwise render nothing. Never a
  // permanent skeleton, and never a retry that cannot fire.
  if (awaitingParent) {
    if (!fallbackUrl) return null;
    return (
      <section className={cn("space-y-4", className)}>
        {heading}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          <p className="text-sm text-foreground">
            We could not load your interview times just now.
          </p>
          <p className="text-sm text-muted-foreground">
            Pick any time on the full calendar and we will hold it for you.
          </p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">{calendarLink}</div>
        </div>
      </section>
    );
  }

  // Inert: the parent switched the path off and no request was ever made.
  if (!data) return null;

  // The admin's own gate, BOTH conjuncts of it: `thankyou_show_calendly` off,
  // or no usable `offerings.calendly_url`. The marketing path renders nothing
  // for either (`ThankYou.tsx:797`), so the app path renders nothing too — that
  // is ENTRY-PARITY-1 as a property rather than a claim. Copy here would be a
  // promise triggered by a misconfiguration, on the exact axis the rule guards.
  if (isInterviewSlotsSilent(data.reason)) return null;

  if (slots.length === 0) {
    // "We couldn't read availability" and "there is nothing open" are different
    // facts. Only the second one earns the "we'll text you" sentence.
    const couldNotRead = isInterviewSlotsError(data.reason);
    // Throttled is a read failure with one extra property: retrying makes it
    // worse. The shared counter increments on EVERY call before comparing, and
    // its window is a fixed wall-clock bucket, so each press adds a write and
    // pushes the count further past the max. Offer the calendar instead.
    const throttled = data.reason === "rate_limited";
    // ...unless we have no calendar to offer, in which case the retry is the
    // only control left and a card with no control at all is the dead end.
    const showRetry = !throttled || !calendarLink;

    return (
      <section className={cn("space-y-4", className)}>
        {heading}
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3">
          {throttled ? (
            <>
              <p className="text-sm text-foreground">
                We are checking for times a little too often right now.
              </p>
              <p className="text-sm text-muted-foreground">
                Fresh times come back in a few minutes. The full calendar stays open in
                the meantime.
              </p>
            </>
          ) : couldNotRead ? (
            <>
              <p className="text-sm text-foreground">
                We could not load interview times just now.
              </p>
              <p className="text-sm text-muted-foreground">
                Check again in a moment. If it still will not load, we will text you to
                lock your time in.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm text-foreground">
                No interview times are open right now.
              </p>
              <p className="text-sm text-muted-foreground">
                We will text you as soon as the next one opens.
              </p>
            </>
          )}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {showRetry && retryButton}
            {calendarLink}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={cn("space-y-4", className)}>
      {heading}

      <motion.ul
        variants={listVariants}
        initial="hidden"
        animate="show"
        className="space-y-2"
      >
        {slots.map((slot) => {
          const label = slotLabel(slot.startTime);
          if (!label) return null;
          const duration = durationLabel(slot.durationMinutes);
          const isHandedOff = handedOffAt === slot.startTime;
          return (
            <motion.li key={slot.startTime} variants={itemVariants}>
              <motion.button
                type="button"
                whileTap={m.pressTap}
                onClick={() => handleTap(slot)}
                className={cn(
                  "flex w-full min-h-[56px] items-center gap-3 rounded-lg border px-4 py-3 text-left",
                  "border-border bg-surface transition-colors",
                  "hover:border-border-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isHandedOff && "border-border-hover",
                )}
              >
                <CalendarClock
                  className="h-5 w-5 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-foreground">
                    {label}
                  </span>
                  {duration && (
                    <span className="block text-xs text-muted-foreground">{duration}</span>
                  )}
                </span>
                <ArrowUpRight
                  className="h-4 w-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
              </motion.button>
            </motion.li>
          );
        })}
      </motion.ul>

      {handedOffAt && (
        // Honest status only. The tap opened Calendly; nothing is scheduled
        // until Calendly confirms it and the webhook mirrors it back.
        <p className="text-sm text-muted-foreground" role="status">
          Finish confirming the time on the Calendly tab. Your slot is held once
          Calendly confirms it.
        </p>
      )}

      {fallbackUrl && (
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4"
        >
          See all available times
          <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </a>
      )}
    </section>
  );
};

export default SlotButtons;
