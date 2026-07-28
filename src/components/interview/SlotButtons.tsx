import { useEffect, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarCheck, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { tapTick } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import { isNative } from "@/lib/platform";
import {
  CALENDLY_BOOKED_COPY,
  calendlyBookingUrl,
  calendlyEmbedUrl,
  isInterviewBookingError,
  isInterviewBookingSilent,
  useCalendlyBookedSignal,
  useInterviewBooking,
} from "@/hooks/useInterviewSlots";

export interface InterviewEmbedProps {
  /**
   * The offering whose Calendly link this is. `offerings.calendly_url` is the
   * SAME link the marketing path embeds (`src/pages/ThankYou.tsx`) and the
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

  /* ── "They already booked" ──
     The page's `application` row is fetched once and has no realtime channel,
     so without this the applicant books successfully, comes back, and is served
     a fresh open calendar under the heading "Book your interview / This is the
     last step" — an invitation to take a SECOND slot, which is the §6.4 hazard.

     Calendly's embed posts `calendly.event_scheduled` on completion (it only
     does so because the frame src carries `embed_domain`/`embed_type`; see
     `calendlyEmbedUrl`), and that is the only in-page signal a booking
     happened. It arrives once, in one document, and a signal that exists only
     until refresh is not a booking record — so it is written down, in the same
     hook the marketing path uses (ENTRY-PARITY-1: same flow, not just the same
     URL). The webhook is the DURABLE record, but it is asynchronous and can
     lag, and this marker covers exactly that gap and is bounded to it.

     `email` is the identity the marker is scoped to — the same value the frame
     is prefilled with, so the marker belongs to the person whose booking it
     records and cannot withdraw the calendar from the next person to open this
     page on a shared handset.

     WHAT THIS DOES NOT COVER, deliberately: a booking completed OUTSIDE this
     document — the native hand-off below, and the "open in a new tab" escape
     hatch — sends no `postMessage` by design, so nothing is written and the
     calendar stays offered until the webhook lands and the parent's own gate
     closes this surface. That residual webhook-lag window belongs to the
     receiver and to the parent gate; this component cannot observe it, and
     inventing a self-reported "I booked" control here would let a mis-tap
     withdraw a calendar with no booking behind it at all.

     It changes no funnel status and claims none: it withdraws the calendar and
     says the confirmation is still in flight. */
  const { booked, reopen: reopenCalendar } = useCalendlyBookedSignal(offeringId, email, {
    listen: embedInline,
  });

  /* Two builds of the same link, from the same builder, so every route out of
     this component produces the same invitee record (ENTRY-PARITY-1):
       • `embedUrl` — the iframe src, carrying `embed_domain`/`embed_type` so
         Calendly knows it is embedded and posts its completion message back;
       • `hostedUrl` — the escape hatch and the native hand-off, which open
         Calendly as a TOP-LEVEL page where those params would be a lie.
     Same event type, same prefill fields, same reconcilable booking either way. */
  const hostedUrl = useMemo(() => {
    if (!data?.bookingUrl) return null;
    return calendlyBookingUrl(data.bookingUrl, { name, email });
  }, [data?.bookingUrl, name, email]);

  const embedUrl = useMemo(() => {
    if (!data?.bookingUrl) return null;
    return calendlyEmbedUrl(data.bookingUrl, { name, email });
  }, [data?.bookingUrl, name, email]);

  const heading = (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-foreground">Book your interview</h3>
      <p className="text-sm text-muted-foreground">
        This is the last step before your application is reviewed.
      </p>
    </div>
  );

  // ── Booked in place ── FIRST, above every other branch including the
  // skeleton. `booked` is seeded synchronously from storage and needs no
  // network, whereas `isWaiting` is true for the whole `offerings` round trip on
  // every cold reload — so checking the skeleton first paints a 700px
  // placeholder for a frame that is never going to render, then collapses to
  // this ~200px panel when the query lands, shoving the reschedule card and the
  // entire timeline up by ~500px on a 360×740 screen. That is the exact layout
  // lie `EMBED_MIN_HEIGHT` exists to prevent, arriving through the back door.
  //
  // It also outranks the gates below on their own merits: withdrawing the
  // calendar is the whole point, and it must not be re-offered because a
  // refetch went sideways afterwards.
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
        {/* The way back out, and it must name BOTH reasons somebody standing
            here needs it.

            The parent mounts this component for the REBOOK path as well as the
            never-booked one, so a student whose slot was cancelled can land on
            this panel. Copy reading "my booking did not go through" is factually
            false for that student — theirs went through and was then cancelled —
            and false copy on the only exit argues them out of the tap they need
            to make, which is the stranding this phase exists to remove. Naming
            the cancellation explicitly is what makes this a door rather than a
            wall. (`CALENDLY_BOOKED_TTL_MS` is the other half of that fix: the
            marker no longer outlives a same-day cancellation at all.)

            Still worded as a correction rather than an offer — it costs a
            deliberate tap after reading that the slot is held, which is the
            opposite of the open calendar this state exists to prevent, and it is
            not a reschedule route (`RescheduleControl` owns that budget). */}
        <motion.button
          type="button"
          whileTap={m.pressTap}
          onClick={() => {
            void tapTick();
            reopenCalendar();
          }}
          className={cn(
            // `items-start` because this line wraps to two or three rows at
            // 360px; a vertically-centred icon against wrapped text reads as
            // misaligned. `py-2` keeps the 44px target on the single-row case.
            "inline-flex min-h-[44px] items-start gap-2 rounded-lg px-1 py-2 text-left text-sm",
            "text-muted-foreground underline underline-offset-4",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          <RotateCw className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Booking did not complete, or your time was cancelled? Reopen the calendar
        </motion.button>
      </motion.section>
    );
  }

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

  // No booking surface at all: the admin's gate is off, the URL is not a
  // Calendly one, or the offering row is not visible (archived). The marketing
  // path renders nothing for its two (the same gate in `ThankYou.tsx`), so the app path
  // renders nothing either — that is ENTRY-PARITY-1 as a property rather than a
  // claim. Copy here would be a promise triggered by a state the applicant
  // cannot influence, on the exact axis the rule guards.
  if (isInterviewBookingSilent(data.reason)) return null;

  if (!hostedUrl || !embedUrl) {
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
            href={hostedUrl}
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

      {/* Calendly's own booking page, in place. Same builder, same prefill
          fields and same sandbox posture as the marketing path's embed
          (`ThankYou.tsx`), so both entry points produce one invitee shape.
          `loading="lazy"` so Calendly's booking bundle is fetched when the
          applicant actually reaches it rather than on every render of this page.
          The wrapper carries the height, so lazy costs no layout shift.
          `bg-white` because Calendly renders its own light UI inside the frame
          and a transparent surface would show our canvas through its gaps.

          `referrerPolicy="no-referrer"` STAYS, and it is why `embed_domain` is
          not optional: the referrer is the implicit "I am embedded" signal, and
          this route's URL carries the applicant's identifiers, so leaking it to
          a third party on every frame load buys nothing that `embed_domain`
          does not state outright. See `calendlyEmbedUrl`. */}
      <div
        className="rounded-xl border border-border overflow-hidden bg-white"
        style={{ minHeight: EMBED_MIN_HEIGHT }}
      >
        <iframe
          src={embedUrl}
          className="w-full"
          style={{ minHeight: EMBED_MIN_HEIGHT, border: 0 }}
          title="Schedule your interview"
          loading="lazy"
          sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      </div>

      {/* Escape hatch. A browser that blocks the frame, or a student who would
          rather finish in a tab, still has a prefilled way through.

          A booking made HERE is invisible to this document — a top-level
          Calendly page posts to no parent — so it writes no marker and this
          surface keeps offering the calendar until the webhook lands. Same for
          the native hand-off above. That window belongs to the receiver and the
          parent's gate, not to this component; see the `booked` comment. */}
      <a
        href={hostedUrl}
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
