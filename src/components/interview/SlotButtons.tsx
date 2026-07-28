import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarCheck, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { tapTick } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import { isNative } from "@/lib/platform";
import {
  isCalendlyUrl,
  isInterviewBookingError,
  isInterviewBookingSilent,
  useInterviewBooking,
} from "@/hooks/useInterviewSlots";

export interface InterviewEmbedProps {
  /**
   * The offering whose Calendly link this is. `offerings.calendly_url` is the
   * SAME link the marketing path embeds (`src/pages/ThankYou.tsx:796`) and the
   * same one the hosted intake chain hands out, which is what makes the two
   * entry points literally one Calendly event type (ENTRY-PARITY-1).
   *
   * May be `undefined` while a parent still resolves its row: nothing renders
   * and no request is made until it lands.
   */
  offeringId: string | undefined;
  /** Prefill for Calendly's booking form. All optional — guests may have none. */
  email?: string | null;
  name?: string | null;
  className?: string;
}

/**
 * The frame's reserved height, in px. ONE constant for the iframe and for the
 * skeleton that stands in for it, because they were 240 and 700: resolving the
 * query shoved the rejection note and the whole timeline down by ~460px, two
 * thirds of a 360×740 viewport. A placeholder that is not the size of the thing
 * it is holding space for is not holding space.
 */
const EMBED_MIN_HEIGHT = 700;

/**
 * The reserved height of the NATIVE hand-off panel (copy line + one 44px
 * control + padding). Native never renders the frame, so reserving 700px there
 * would be its own layout lie in the opposite direction.
 */
const NATIVE_PANEL_HEIGHT = 148;

/** Session-scoped "they booked in the frame" marker, per offering. */
const bookedKey = (offeringId: string) => `levelup.interview.booked.${offeringId}`;

function readBooked(offeringId: string | undefined): boolean {
  if (!offeringId) return false;
  try {
    return sessionStorage.getItem(bookedKey(offeringId)) === "1";
  } catch {
    // Private mode / storage disabled. The in-memory flag still covers the
    // mount the booking happened on, which is the common case.
    return false;
  }
}

function rememberBooked(offeringId: string): void {
  try {
    sessionStorage.setItem(bookedKey(offeringId), "1");
  } catch {
    // See readBooked.
  }
}

/**
 * Calendly's documented prefill query params — `name` and `email`, and nothing
 * else, exactly the pair the marketing path sends (`ThankYou.tsx:803` builds
 * its iframe src with `name=` and `email=`).
 *
 * ENTRY-PARITY-1 is why the list stops there. `_shared/calendly.ts` reads
 * `invitee.text_reminder_number` as the phone and `calendly-webhook` matches
 * phone-primary with email as fallback (INTEG-KEY-1), so an app-path booking
 * prefilled with an extra phone field would reconcile on a DIFFERENT join key
 * than the identical marketing-path booking. Same fields, same invitee shape,
 * same join key, both paths.
 *
 * (If phone-primary prefill is wanted, the change belongs to whoever owns
 * `ThankYou.tsx` — adding it on one side only IS the divergence.)
 *
 * Prefill is a convenience, never a requirement: an unparseable URL falls back
 * to the raw link rather than blocking the booking.
 */
function withPrefill(
  bookingUrl: string,
  fields: { name?: string | null; email?: string | null },
): string {
  try {
    const url = new URL(bookingUrl);
    if (fields.name) url.searchParams.set("name", fields.name);
    if (fields.email) url.searchParams.set("email", fields.email);
    return url.toString();
  } catch {
    return bookingUrl;
  }
}

/**
 * InterviewEmbed — the OPTIONAL in-app inline Calendly embed sanctioned by
 * INTEG-CAL-1 (`04-INTEGRATION-CONTRACTS.md` §6.4), rendered at the step where
 * the applicant has paid the ₹400 and has yet to book.
 *
 * The file name is a leftover; the surface is the embed. App-native buttons
 * over Calendly's availability API were PARKED with CRO-1 by that same ruling,
 * and the app inserts nothing into the intake chain: booking still happens on
 * the existing hosted Calendly link, this is that link rendered in place.
 *
 * WHY AN IFRAME IS THE POINT, NOT A SHORTCUT. Because the embed is Calendly's
 * own booking page, it INHERITS Calendly's availability truth directly — there
 * is no second, staler list of times anywhere in our stack that could offer a
 * slot Calendly has already given away. Double-booking is impossible by
 * construction. The confirmation comes back asynchronously through the
 * `calendly-webhook` receiver, and this component NEVER renders a funnel state
 * the webhook has not confirmed. It writes nothing, reads no session, and owns
 * no route; a parent mounts it behind an off-by-default flag.
 *
 * THE FRAME IS WEB-ONLY, AND THAT IS NOT A DEGRADATION — it is the doc's own
 * primary shape. `ApplicationStatus` is natively reachable (it carries `isIOS()`
 * guards precisely because it renders there), and `capacitor.config.ts`
 * `server.allowNavigation` does not list `calendly.com`. On Android that is not
 * a frame that quietly fails: Capacitor's `BridgeWebViewClient
 * .shouldOverrideUrlLoading` has no `isForMainFrame()` check, so the iframe's
 * SUBFRAME navigation reaches `Bridge.launchIntent`, misses the allow-list, and
 * fires `startActivity(ACTION_VIEW)` — the system browser opens on its own, with
 * no user gesture, the moment the embed mounts. (iOS diverges: its delegate
 * computes `toplevelNavigation` from `targetFrame?.isMainFrame` and lets the
 * subframe load.) So on native we render the HOSTED link instead, behind an
 * explicit tap — which is exactly what §6.4 calls the v1 path, with the inline
 * embed as the optional extra. Same URL, same prefill, same Calendly event type,
 * therefore the same reconcilable booking (ENTRY-PARITY-1). Adding
 * `calendly.com` to `allowNavigation` is a separate, native-shell decision and
 * is NOT a precondition for this surface.
 *
 * Never a dead end, and never a lie:
 *   • no booking surface — the admin's switch is off, the URL is not a Calendly
 *     one, or the offering row is not visible (archived) → renders NOTHING,
 *     exactly like the marketing path (ENTRY-PARITY-1). A promise ("we'll text
 *     you") on a misconfiguration or on an archived cohort is the failure mode
 *     here, and a retry button that can never succeed is the other one;
 *   • the offering could not be READ (transport failed) → says so, and offers
 *     the retry that can actually change it;
 *   • booked in place → the calendar is withdrawn immediately, see `booked`.
 */
export const InterviewEmbed = ({
  offeringId,
  email,
  name,
  className,
}: InterviewEmbedProps) => {
  const m = useMotionSafe();
  const { data, isWaiting, isFetching, refetch } = useInterviewBooking(offeringId);

  // Web renders Calendly in place; native hands off to the hosted link. See the
  // docblock — on Android the frame does not fail quietly, it launches a
  // browser unprompted.
  const embedInline = !isNative();

  /* ── "They already booked, in this frame, just now" ──
     The page's `application` row is fetched once and has no realtime channel,
     so without this the applicant books successfully, comes back to the tab,
     and is served a fresh open calendar under the heading "Book your interview
     / This is the last step" — an invitation to take a SECOND slot, which is
     the §6.4 hazard. Calendly's embed posts `calendly.event_scheduled` on
     completion; that is the only in-page signal a booking happened.
     It changes no funnel status and claims none: it withdraws the calendar and
     says the confirmation is still in flight. Session-scoped so it survives the
     unmount/remount of a tab switch without outliving the session, by which
     point the webhook owns the truth. */
  const [booked, setBooked] = useState(() => readBooked(offeringId));

  // `offeringId` can arrive late (parent still resolving its row), so the
  // initial read may have run against `undefined`.
  useEffect(() => {
    setBooked(readBooked(offeringId));
  }, [offeringId]);

  useEffect(() => {
    if (!offeringId || !embedInline) return;

    const onMessage = (event: MessageEvent) => {
      // Same calendly.com pin the URL itself gets — an arbitrary frame or
      // extension must not be able to blank this surface by posting at us.
      if (!isCalendlyUrl(event.origin)) return;
      const payload = event.data as { event?: unknown } | null;
      if (!payload || typeof payload !== "object") return;
      if (payload.event !== "calendly.event_scheduled") return;
      rememberBooked(offeringId);
      setBooked(true);
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [offeringId, embedInline]);

  // Prefilled once, used by the frame, the escape-hatch link AND the native
  // hand-off, so every route out of this component produces the same invitee
  // record (ENTRY-PARITY-1).
  const bookingUrl = useMemo(() => {
    if (!data?.bookingUrl) return null;
    return withPrefill(data.bookingUrl, { name, email });
  }, [data?.bookingUrl, name, email]);

  const heading = (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-foreground">Book your interview</h3>
      <p className="text-sm text-muted-foreground">
        This is the last step before your application is reviewed.
      </p>
    </div>
  );

  // ── Waiting ── a request is genuinely in flight. A parent that has not
  // supplied `offeringId` is a different state and renders nothing at all,
  // rather than shimmering on something that may never arrive. The skeleton is
  // the exact height of what replaces it, so resolving moves nothing below it.
  if (isWaiting) {
    return (
      <section className={cn("space-y-4", className)} aria-busy="true">
        {heading}
        <div
          className="rounded-xl border border-border bg-surface animate-pulse"
          style={{ height: embedInline ? EMBED_MIN_HEIGHT : NATIVE_PANEL_HEIGHT }}
        />
        <span className="sr-only">Loading your interview calendar</span>
      </section>
    );
  }

  // Inert: no offering id, so no request was ever made.
  if (!data) return null;

  // Booked in place. A fact we observed, so it outranks every gate below —
  // withdrawing the calendar is the whole point and it must not be re-offered
  // because a refetch went sideways afterwards.
  if (booked) {
    return (
      <motion.section
        initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={m.springs.glide}
        className={cn("space-y-4", className)}
      >
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            Your interview time is booked
          </h3>
          <p className="text-sm text-muted-foreground">
            Calendly is holding your slot and the confirmation is on its way to
            your inbox.
          </p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <CalendarCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            Nothing else to do right now. This page catches up once the booking
            reaches us.
          </p>
        </div>
      </motion.section>
    );
  }

  // No booking surface at all: the admin's gate is off, the URL is not a
  // Calendly one, or the offering row is not visible (archived). The marketing
  // path renders nothing for its two (`ThankYou.tsx:797`), so the app path
  // renders nothing either — that is ENTRY-PARITY-1 as a property rather than a
  // claim. Copy here would be a promise triggered by a state the applicant
  // cannot influence, on the exact axis the rule guards.
  if (isInterviewBookingSilent(data.reason)) return null;

  if (!bookingUrl) {
    // We could not read the offering. Say that, and give them the one control
    // that can actually change it. `isInterviewBookingError` is asserted rather
    // than assumed so a future reason added to the union cannot silently
    // inherit this copy — and so a NON-retryable reason can never inherit a
    // retry button.
    if (!isInterviewBookingError(data.reason)) return null;
    return (
      <section className={cn("space-y-4", className)}>
        {heading}
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className="text-sm text-foreground">
            We could not load your interview calendar just now.
          </p>
          <p className="text-sm text-muted-foreground">
            Check again in a moment. If it still will not load, we will text you to
            lock your time in.
          </p>
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
        </div>
      </section>
    );
  }

  // ── Native ── the hosted link, opened on an explicit tap. See the docblock:
  // an inline frame here launches the system browser BY ITSELF on Android.
  if (!embedInline) {
    return (
      <motion.section
        initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={m.springs.glide}
        className={cn("space-y-4", className)}
      >
        {heading}
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Your calendar opens in your browser with your details already filled
            in. Pick a time and you are done.
          </p>
          <a
            href={bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => void tapTick()}
            className={cn(
              "inline-flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-4",
              "bg-cream text-sm font-semibold text-cream-text transition-opacity hover:opacity-90",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            Open your calendar
            <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      </motion.section>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.springs.glide}
      className={cn("space-y-4", className)}
    >
      {heading}

      {/* Calendly's own booking page, in place. Same URL, same prefill fields
          and same sandbox posture as the marketing path's embed
          (`ThankYou.tsx:799-806`), so both entry points produce one invitee
          shape. `loading="lazy"` so Calendly's booking bundle is fetched when
          the applicant actually reaches it rather than on every render of this
          page. The wrapper carries the height, so lazy costs no layout shift.
          `bg-white` because Calendly renders its own light UI inside the frame
          and a transparent surface would show our canvas through its gaps. */}
      <div
        className="rounded-xl border border-border overflow-hidden bg-white"
        style={{ minHeight: EMBED_MIN_HEIGHT }}
      >
        <iframe
          src={bookingUrl}
          className="w-full"
          style={{ minHeight: EMBED_MIN_HEIGHT, border: 0 }}
          title="Schedule your interview"
          loading="lazy"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Escape hatch. A browser that blocks the frame, or a student who would
          rather finish in a tab, still has a prefilled way through. */}
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => void tapTick()}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm text-muted-foreground underline underline-offset-4"
      >
        Open the calendar in a new tab
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </a>
    </motion.section>
  );
};

export default InterviewEmbed;
