import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight, CalendarCheck, Loader2, RotateCw } from "lucide-react";
import { formatSlotLabel } from "@shared/calendly";
import { cn } from "@/lib/utils";
import { tapTick } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import { isNative } from "@/lib/platform";
import {
  CALENDLY_BOOKED_COPY,
  INTERVIEW_SLOTS_COPY,
  type InterviewSlot,
  calendlyBookingUrl,
  calendlyEmbedUrl,
  isInterviewBookingError,
  isInterviewBookingSilent,
  useCalendlyBookedSignal,
  useInterviewBooking,
  useInterviewSlots,
} from "@/hooks/useInterviewSlots";

export interface InterviewSlotsProps {
  /**
   * The offering whose Calendly link this is. `offerings.calendly_url` is the
   * SAME link the marketing path uses (`src/pages/ThankYou.tsx`, which mounts
   * THIS component) and the same one the hosted intake chain hands out, which is
   * what makes the two entry points literally one Calendly event type
   * (ENTRY-PARITY-1).
   *
   * May be `undefined` while a parent still resolves its row: nothing renders
   * and no request is made until it lands.
   */
  offeringId: string | undefined;
  /**
   * Optional app-owned application row. The edge function accepts it only after
   * verifying the current bearer owns that row and that it belongs to this
   * offering; guests therefore keep the established identity fallback.
   */
  applicationId?: string;
  /** Prefill for Calendly's booking form. All optional — guests may have none. */
  email?: string | null;
  name?: string | null;
  className?: string;
}

/**
 * The reserved height of ONE slot button, and of the pulse row that stands in for
 * it. Comfortably over the 44px minimum target (see the row's own note).
 */
const SLOT_ROW_HEIGHT = 64;

/**
 * The inline embed's reserved height — the FALLBACK path's, now. One constant for
 * the iframe and for anything holding space for it.
 */
const EMBED_MIN_HEIGHT = 700;

/**
 * The reserved height of the NATIVE hand-off panel (copy line + one 44px control
 * + padding). Native never renders the frame.
 */
const NATIVE_PANEL_HEIGHT = 148;

/**
 * InterviewSlots — the three soonest openings as one-tap buttons, at the step
 * where the applicant has paid the ₹400 and has yet to book.
 *
 * RULED — REQ-INT-0 IS BACK ON (Rahul, 2026-07-28), reversing the §6.4 park of
 * app-native slot buttons in favour of an inline embed. Rahul wants a native
 * surface at this moment, not a third-party iframe. The reversal is recorded in
 * `04-INTEGRATION-CONTRACTS.md` §6.4 and in `design/briefs/cohort-iv.md` V-2;
 * this component is what it asked for.
 *
 * (The file name and the sibling hook's name were always `SlotButtons` /
 * `useInterviewSlots` — leftovers from the first attempt at this surface. They
 * are now literal.)
 *
 * WHY THIS DOES NOT REOPEN THE DOUBLE-BOOKING HAZARD THE PARK NAMED. The app
 * still cannot book: this integration never calls Calendly's invitee-creation
 * API. Each button opens `scheduling_url`, Calendly's own deep link to THAT EXACT
 * SLOT, and the applicant confirms it on Calendly's surface. Our list is an OFFER, never a hold —
 * the calendar keeps exactly one writer. What a self-rendered list CAN get wrong
 * is being stale, and that is handled at the only moment it matters: every tap
 * re-checks availability before it opens anything (`recheck`), and a slot that
 * has gone re-offers the new three instead of dead-ending.
 *
 * NEVER A DEAD END — the whole point of the fallback ladder below:
 *   • slots → three buttons, plus the full calendar one tap away;
 *   • no slots, a Calendly outage, or a rate limit → the hosted calendar exactly
 *     as it shipped before this task (web: the inline embed; native: the hosted
 *     link, because on Android an inline Calendly frame launches the system
 *     browser by itself — see `embedInline`);
 *   • no booking surface at all (admin switch off, no Calendly URL, offering
 *     archived) → NOTHING, exactly like the marketing gate. That is not a dead
 *     end, it is the absence of a step: copy there is a promise made on a pure
 *     misconfiguration, and a "check again" button that can never succeed is a
 *     permanent fake outage;
 *   • the offering row could not be READ → says so, with the retry that can
 *     actually change it.
 *
 * THE FRAME IS WEB-ONLY, and that is unchanged. `ApplicationStatus` is natively
 * reachable, and `capacitor.config.ts` `server.allowNavigation` does not list
 * `calendly.com`. On Android that is not a frame that quietly fails: Capacitor's
 * `BridgeWebViewClient.shouldOverrideUrlLoading` has no `isForMainFrame()` check,
 * so the iframe's SUBFRAME navigation reaches `Bridge.launchIntent`, misses the
 * allow-list and fires `startActivity(ACTION_VIEW)` — the system browser opens on
 * its own, with no user gesture, the moment the embed mounts.
 *
 * HOW A SLOT ACTUALLY OPENS, per shell, because `window.open` is NOT one
 * mechanism and an earlier revision of this file assumed it was:
 *   • WEB — a tab is opened SYNCHRONOUSLY inside the gesture and navigated once
 *     the re-check answers. A window opened after an `await` is a popup by every
 *     browser's reckoning. If the browser refuses both, `window.open` returns
 *     null and we say so (`handOff` below) instead of claiming a tab that is not
 *     there;
 *   • ANDROID — `window.open` opens NOTHING. `Bridge.java` sets only
 *     `setJavaScriptCanOpenWindowsAutomatically(true)`; nothing in the shell sets
 *     `setSupportMultipleWindows(true)` or implements `onCreateWindow`, so the
 *     WebView's default applies and a `_blank` open is dropped on the floor —
 *     the same fact `src/lib/invoice.ts` records in its own words. What DOES work
 *     is a top-level navigation: `BridgeWebViewClient.shouldOverrideUrlLoading`
 *     hands it to `Bridge.launchIntent`, calendly.com misses `allowNavigation`,
 *     and `startActivity(ACTION_VIEW)` opens the system browser while the WebView
 *     stays exactly where it was;
 *   • iOS — `createWebViewWith` would forward a `_blank` open to
 *     `UIApplication.shared.open`, but WKWebView never receives one:
 *     `javaScriptCanOpenWindowsAutomatically` is not set anywhere in the shell,
 *     so it is false, and the call is issued after an awaited round trip with no
 *     gesture token. A top-level navigation works for the same reason it does on
 *     Android: `WebViewDelegationHandler.decidePolicyFor` sees a main-frame
 *     navigation to a host outside `allowNavigation`, calls
 *     `UIApplication.shared.open` and cancels the WebView's own navigation.
 * So native hands off with `window.open(href, "_self")` — a navigation of the
 * CURRENT window, which no popup blocker applies to and which both shells are
 * built to intercept. And every post-tap panel carries a real `<a target="_blank">`
 * as well, the one hand-off that needs no platform reasoning at all, so a student
 * whose tap was swallowed anywhere still has a live route to their slot.
 *
 * It writes nothing, reads no session, owns no route, and claims no funnel state
 * (SOR-1). A parent mounts it behind an off-by-default flag.
 */
export const InterviewSlots = ({
  offeringId,
  applicationId,
  email,
  name,
  className,
}: InterviewSlotsProps) => {
  const m = useMotionSafe();
  const { data, isWaiting, isFetching, refetch } = useInterviewBooking(offeringId);

  /* Availability is only asked for once we know this offering HAS a booking
     surface. Asking first would put a Calendly lookup behind every archived
     cohort and every offering whose admin switch is off. */
  const hasBookingSurface = !!data?.bookingUrl;
  const {
    slots,
    applicationToken,
    isWaiting: slotsWaiting,
    recheck,
  } = useInterviewSlots(offeringId, { enabled: hasBookingSurface, applicationId });

  // Web renders Calendly in place when it has to fall back; native hands off to
  // the hosted link. See the docblock.
  const embedInline = !isNative();

  /**
   * The slot the applicant tapped, the exact prefilled link it was handed off to,
   * and whether the hand-off ACTUALLY happened.
   *
   * `handedOff` is the whole point of holding this as an object rather than a
   * slot: on web the browser answers whether a tab opened, and when the answer is
   * no the surface must not say one did — nor offer "I confirmed my time", which
   * writes the booked marker and withdraws the calendar for two hours. It carries
   * the href so the panel can render a real link back to the SAME slot, which is
   * the recovery on every platform.
   */
  const [tapped, setTapped] = useState<{
    slot: InterviewSlot;
    href: string;
    handedOff: boolean;
  } | null>(null);
  /** A re-check found the tapped slot gone; the list below is the replacement. */
  const [slotTaken, setSlotTaken] = useState(false);
  /** The start instant currently being re-checked — one spinner, on one row. */
  const [checking, setChecking] = useState<string | null>(null);

  const showSlots = slots.length > 0;
  /** The embed only exists on the fallback branch now, so only it may listen. */
  const embedRendered = embedInline && !showSlots && !slotsWaiting && hasBookingSurface;

  /* ── "They already booked" ──
     The page's `application` row is fetched once and has no realtime channel, so
     without this the applicant books successfully, comes back, and is served a
     fresh open calendar under "Book your interview" — an invitation to take a
     SECOND slot, which is the §6.4 hazard.

     TWO SIGNALS FEED IT, because the two paths are observable in different ways:
       • the EMBED fallback posts `calendly.event_scheduled` to this document
         (that is what `embed_domain`/`embed_type` buy), so it is observed;
       • a SLOT button opens Calendly as a top-level page in another tab, which
         posts to nobody. Nothing in this document can see that booking. So the
         surface asks, once, and only after a tap: `selfReportReady`. It never
         claims the booking itself — the panel says "confirm it there", and the
         student's own guarded confirmation is what writes the marker.

     `email` is the identity the marker is scoped to — the same value the booking
     link is prefilled with — so it belongs to the person whose booking it records
     and cannot withdraw the calendar from the next person to open this page on a
     shared handset.

     It changes no funnel status and claims none: it withdraws the calendar and
     says the confirmation is still in flight. The webhook is the durable record;
     this marker only covers the lag before it lands. */
  const booked = useCalendlyBookedSignal(offeringId, email, {
    listen: embedRendered,
    // Only a hand-off that ACTUALLY happened may arm the self-report. A tap the
    // browser blocked opened nothing, so there is nothing to have confirmed, and
    // a control that writes "booked" on top of that is the stranding this phase
    // exists to remove, inverted.
    selfReportReady: !!tapped?.handedOff,
  });

  /* Two builds of the same link, from the same builder, so every route out of
     this component produces the same invitee record (ENTRY-PARITY-1):
       • `hostedUrl` — the full calendar, the native hand-off and the "see all
         times" escape hatch, all top-level pages;
       • `embedUrl` — the fallback iframe src, carrying `embed_domain`/`embed_type`
         so Calendly knows it is embedded and posts its completion message back.
     Slot links go through `calendlyBookingUrl` too (see `openSlot`), so the deep
     link carries the SAME two prefill fields and reconciles on the same join key
     as a booking made any other way. */
  const hostedUrl = useMemo(() => {
    if (!data?.bookingUrl) return null;
    return calendlyBookingUrl(
      data.bookingUrl,
      { name, email },
      { applicationToken },
    );
  }, [data?.bookingUrl, name, email, applicationToken]);

  const embedUrl = useMemo(() => {
    if (!data?.bookingUrl) return null;
    return calendlyEmbedUrl(
      data.bookingUrl,
      { name, email },
      { applicationToken },
    );
  }, [data?.bookingUrl, name, email, applicationToken]);

  /**
   * Hand `href` to the browser, and ANSWER WHETHER IT WENT.
   *
   * The return value is not decoration: it decides whether the panel below says
   * Calendly opened and offers the control that marks the applicant booked. Every
   * branch here therefore either knows the hand-off happened or reports false.
   *
   * NATIVE takes `_self`, not `_blank`, and the docblock at the top of this file
   * has the whole derivation: a `_blank` open is dropped by the Android WebView
   * and never issued by WKWebView, whereas a navigation of the CURRENT window is
   * intercepted by both shells and turned into a system-browser hand-off with the
   * app left exactly where it was. `_self` also sidesteps popup blocking by
   * construction — it targets an existing window, so there is no popup to block.
   * Nothing observable comes back from the shells, so native reports `true` on the
   * mechanism both of them are built around; the panel's own `<a target="_blank">`
   * is the belt to that braces.
   *
   * THE LAST-RESORT OPEN PASSES NO FEATURES STRING, and that is load-bearing
   * rather than a tidy-up. `window.open(url, target, "noopener,…")` RETURNS NULL
   * BY SPECIFICATION whenever the features include `noopener` (and `noreferrer`
   * implies it) — the whole point of `noopener` is that the caller is handed no
   * window object. An earlier revision passed `"noopener,noreferrer"` and then
   * believed the `!!` of the result, so this branch could only ever report a
   * blocked tab: a student whose browser DID open Calendly read "nothing opened,
   * so nothing is booked yet" while their slot sat in the next tab, and the
   * confirmation control was withheld from them. The disown is done by hand
   * instead (`opened.opener = null`, the same assignment the pre-opened tab
   * gets), which keeps the answer real.
   *
   * NOTHING HERE MAY THROW. Reading `.closed` on a disowned window and calling
   * `location.replace` on a content-blocker's stub both raise `SecurityError`,
   * and this function is called during the state update that puts the post-tap
   * panel on screen — a throw would take the panel with it and leave the applicant
   * looking at a surface that says nothing about the tab they are now standing in.
   * Every branch is wrapped, and a refused branch falls through to the next
   * mechanism rather than out of the function.
   */
  const handOff = useCallback((href: string, preopened: Window | null): boolean => {
    if (isNative()) {
      try {
        window.open(href, "_self");
        return true;
      } catch {
        return false;
      }
    }
    try {
      if (preopened && !preopened.closed) {
        try {
          preopened.opener = null;
        } catch {
          // Some engines refuse the assignment; the navigation still stands.
        }
        preopened.location.replace(href);
        return true;
      }
    } catch {
      // The pre-opened handle was a stub, or has been disowned. Fall through to
      // the named open rather than reporting a hand-off that did not happen.
    }
    // The in-gesture open was refused. Try once more — some browsers allow a
    // named open they would have blocked as a blank one — and BELIEVE THE ANSWER,
    // which is only possible because no `noopener` features string is passed.
    try {
      const opened = window.open(href, "_blank");
      if (!opened) return false;
      try {
        opened.opener = null;
      } catch {
        // See above: refused assignment, live navigation.
      }
      return true;
    } catch {
      return false;
    }
  }, []);

  /**
   * Open a slot, and RE-CHECK IT FIRST.
   *
   * On web the tab is opened SYNCHRONOUSLY, inside the gesture, and pointed at the
   * slot only after the re-check answers. A `window.open` issued after an await is
   * a popup by every browser's reckoning and is blocked — which would turn the
   * safety check into the thing that breaks the booking. `opener` is dropped
   * before we navigate, so the Calendly tab gets no handle on this document.
   *
   * A re-check that FAILS does not block the tap: we open the slot the applicant
   * chose and let Calendly's own page be the authority. Refusing on a network
   * hiccup invents a dead end out of a working booking.
   *
   * What the tap records is `handOff`'s answer, never an assumption. A blocked
   * tab renders the blocked panel, not "Calendly opened".
   *
   * THE PANEL GOES UP BEFORE THE HAND-OFF, NOT AFTER IT. It used to be a single
   * `setTapped({ …, handedOff: handOff(...) })`, which made the panel's existence
   * conditional on the hand-off returning at all: a `SecurityError` out of
   * `location.replace` (a disowned popup, a content blocker's stub) propagated out
   * of the argument list, `setTapped` never ran, and the applicant — whose tab had
   * in some cases already navigated — was left with no panel, no confirmation
   * control and no blocked-state copy, which is the one outcome the two-faced
   * panel exists to make impossible. So the panel is raised in its blocked face
   * first and PROMOTED when the hand-off answers yes. The `catch` below is the
   * belt to that braces: whatever went wrong, the tap ends with a panel.
   */
  const openSlot = useCallback(
    async (slot: InterviewSlot) => {
      void tapTick();
      setSlotTaken(false);
      setChecking(slot.startTime);

      let target: Window | null = null;
      if (!isNative()) {
        try {
          target = window.open("", "_blank");
        } catch {
          // Blocked outright; the direct open inside `handOff` is the fallback.
        }
      }

      try {
        const fresh = await recheck();
        const trusted = fresh.reason !== "unavailable" && fresh.reason !== "rate_limited";
        const current = fresh.slots.find((s) => s.startTime === slot.startTime);

        if (trusted && !current) {
          // Gone in the seconds since it was rendered. Close the tab we opened
          // and hand over the replacement list rather than a dead Calendly page.
          try {
            target?.close();
          } catch {
            // Nothing to do: the tab is the applicant's now.
          }
          setSlotTaken(true);
          return;
        }

        const chosen = current ?? slot;
        const href = calendlyBookingUrl(
          chosen.bookingUrl,
          { name, email },
          { applicationToken },
        );
        setTapped({ slot: chosen, href, handedOff: false });
        if (handOff(href, target)) {
          setTapped((prev) =>
            prev && prev.href === href ? { ...prev, handedOff: true } : prev,
          );
        }
      } catch {
        // The re-check or the hand-off failed in a way neither of them models.
        // The applicant tapped a time and is owed an answer either way, and the
        // honest one is the blocked face: it withholds the control that writes the
        // booked marker and offers the anchor that needs no platform reasoning.
        try {
          target?.close();
        } catch {
          // The tab is the applicant's now.
        }
        setTapped({
          slot,
          href: calendlyBookingUrl(
            slot.bookingUrl,
            { name, email },
            { applicationToken },
          ),
          handedOff: false,
        });
      } finally {
        setChecking(null);
      }
    },
    [recheck, name, email, applicationToken, handOff],
  );

  /**
   * The applicant used the panel's own link. That IS the hand-off — a real
   * anchor on a real tap, which nothing blocks — so the panel stops apologising
   * and offers the confirmation it was withholding.
   */
  const markHandedOff = useCallback(() => {
    void tapTick();
    setTapped((prev) => (prev && !prev.handedOff ? { ...prev, handedOff: true } : prev));
  }, []);

  const heading = (
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-foreground">
        {INTERVIEW_SLOTS_COPY.heading}
      </h3>
      <p className="text-sm text-muted-foreground">{INTERVIEW_SLOTS_COPY.subheading}</p>
    </div>
  );

  /** The full-calendar route out. Present on every branch that has a URL. */
  const moreTimesLink = hostedUrl ? (
    <a
      href={hostedUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => void tapTick()}
      className={cn(
        "inline-flex min-h-[44px] items-center gap-1.5 text-sm",
        "text-muted-foreground underline underline-offset-4",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {INTERVIEW_SLOTS_COPY.moreTimes}
      <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
    </a>
  ) : null;

  /* ── The re-offer notice, and it belongs to EVERY branch a re-check can land on.
     `role="status"` because the surface underneath has just silently changed out
     from under somebody who was reaching for a specific row; a sighted user sees
     the times move, and this is the same fact said out loud.

     It lived inside the slot branch once, which meant the one case it was written
     for could never render it: a re-check that legitimately comes back EMPTY is a
     trustworthy answer, so it overwrites the list, `showSlots` goes false, and the
     student watched three buttons become a 700px iframe (web) or a hand-off panel
     (native) with no explanation at all. Hence a node built here and rendered on
     the slot branch AND both fallbacks, with copy that matches which of them the
     applicant is actually looking at. */
  const slotTakenNotice = slotTaken ? (
    <p role="status" className="text-sm font-medium text-foreground">
      {showSlots ? INTERVIEW_SLOTS_COPY.slotTaken : INTERVIEW_SLOTS_COPY.slotTakenEmpty}
    </p>
  ) : null;

  /* ── The guarded confirmation, ONE node with two callers.
     Saying "yes" here writes the booked marker and withdraws the calendar for two
     hours, so it is never a single tap: the question names the only condition
     under which it is true (Calendly showed a confirmation) and the way back if it
     is not. Both the post-tap panel and the silent-embed hatch below ask it in
     exactly these words, because they are the same claim about the same booking. */
  const selfReportQuestion = (
    <>
      <p className="text-sm font-medium text-foreground">
        {CALENDLY_BOOKED_COPY.selfReportQuestion}
      </p>
      <p className="text-sm text-muted-foreground">
        {CALENDLY_BOOKED_COPY.selfReportWarning}
      </p>
      <div className="flex flex-wrap gap-2">
        <motion.button
          type="button"
          whileTap={m.pressTap}
          onClick={() => {
            void tapTick();
            booked.confirmSelfReport();
          }}
          className={cn(
            "inline-flex min-h-[44px] items-center rounded-lg px-4 py-2",
            "bg-cream text-sm font-semibold text-cream-text transition-opacity hover:opacity-90",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {CALENDLY_BOOKED_COPY.selfReportConfirm}
        </motion.button>
        <motion.button
          type="button"
          whileTap={m.pressTap}
          onClick={booked.cancelSelfReport}
          className={cn(
            "inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2",
            "bg-surface text-sm font-medium text-foreground transition-colors hover:border-border-hover",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        >
          {CALENDLY_BOOKED_COPY.selfReportCancel}
        </motion.button>
      </div>
    </>
  );

  /* ── After a tap ── AND IT BELONGS TO EVERY BRANCH, which is the whole reason
     it is built out here instead of inside the slot list.

     The booking is being confirmed on Calendly's page, away from this document,
     which cannot see it happen. So the panel states exactly that and asks — it
     never claims the booking. The confirmation is guarded (`selfReport*`) because
     a mis-tap here withdraws a calendar with no booking behind it, which is the
     stranding this phase exists to close.

     IT LIVED INSIDE THE `showSlots` BRANCH, and that made it — and with it the ONLY
     control that can record a booking made through a slot button — hostage to the
     next answer from the availability API. `refetchOnWindowFocus` fires exactly
     when the student returns from Calendly, and any answer of zero slots emptied
     the list, took this branch away and served a fresh open calendar to somebody
     who had just booked: no panel, no confirmation, no notice, and an invitation
     to hold a second slot that carries no `old_invitee` for the receiver to
     reconcile against. That is the §6.4 hazard, arriving through the fix for it.
     Two changes close it and both are needed — the query no longer lets an
     untrustworthy answer blank a good list (`useInterviewSlots`), and an honest
     empty answer no longer costs the applicant this panel.

     IT HAS TWO FACES, and the difference is not cosmetic. `handedOff` is `handOff`'s
     own answer, so the branch below is the difference between "Calendly is open,
     confirm there" and "your browser blocked the tab, nothing is booked" — and only
     the first is allowed to offer "I confirmed my time", the control that writes
     the booked marker. Both faces carry the same real `<a target="_blank">` back to
     the SAME slot, because a link on a live tap is the one hand-off no browser and
     no WebView refuses. */
  const handOffPanel = tapped ? (
    <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
      {booked.selfReportPending ? (
        selfReportQuestion
      ) : (
        <>
          <p className="text-sm font-medium text-foreground">
            {tapped.handedOff
              ? INTERVIEW_SLOTS_COPY.openedHeading
              : INTERVIEW_SLOTS_COPY.blockedHeading}
          </p>
          <p className="text-sm text-muted-foreground">
            {tapped.handedOff
              ? INTERVIEW_SLOTS_COPY.openedBody
              : INTERVIEW_SLOTS_COPY.blockedBody}
          </p>
          <div className="flex flex-wrap gap-2">
            {/* The link back to the SAME slot. It is the PRIMARY control when
                nothing opened — the applicant's only live route — and a quiet one
                beside the confirmation when something did. An anchor either way:
                this is the mechanism, not a mimic of one, so it survives the popup
                blocker that just fired and both native shells' hand-off rules. */}
            <a
              href={tapped.href}
              target="_blank"
              rel="noopener noreferrer"
              onClick={markHandedOff}
              className={cn(
                "inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-4 py-2",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tapped.handedOff
                  ? "border border-border bg-surface text-sm font-medium text-foreground transition-colors hover:border-border-hover"
                  : "bg-cream text-sm font-semibold text-cream-text transition-opacity hover:opacity-90",
              )}
            >
              {tapped.handedOff
                ? INTERVIEW_SLOTS_COPY.openedReopen
                : INTERVIEW_SLOTS_COPY.blockedOpen}
              <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
            </a>
            {/* Only offered once something actually opened. See the panel's note:
                this control writes the booked marker. */}
            {tapped.handedOff && (
              <motion.button
                type="button"
                whileTap={m.pressTap}
                onClick={() => {
                  void tapTick();
                  booked.requestSelfReport();
                }}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-lg px-4 py-2",
                  "bg-cream text-sm font-semibold text-cream-text transition-opacity hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {INTERVIEW_SLOTS_COPY.openedConfirm}
              </motion.button>
            )}
            <motion.button
              type="button"
              whileTap={m.pressTap}
              onClick={() => setTapped(null)}
              className={cn(
                "inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2",
                "bg-surface text-sm font-medium text-foreground transition-colors hover:border-border-hover",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {INTERVIEW_SLOTS_COPY.openedDismiss}
            </motion.button>
          </div>
        </>
      )}
    </div>
  ) : null;

  /* ── The SILENT-EMBED hatch — the fallback branch's own way to say "I already
     have my time", and the reason `canSelfReport` is computed at all.

     The frame below is Calendly's real booking page, so a booking made in it is
     real whether or not `calendly.event_scheduled` ever reaches this document —
     and `currentEmbedDomain`'s docblock is explicit that we cannot prove the
     channel from here. When the frame has said NOTHING for
     `CALENDLY_SELF_REPORT_AFTER_MS` the hook raises this, and without a control
     behind it the applicant who booked in a channel-dead frame is offered that
     same calendar forever. Suppressed while `handOffPanel` is up, which asks the
     identical question about a specific slot. */
  const selfReportHatch =
    !tapped && booked.canSelfReport ? (
      <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
        {booked.selfReportPending ? (
          selfReportQuestion
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              {CALENDLY_BOOKED_COPY.selfReportBody}
            </p>
            <motion.button
              type="button"
              whileTap={m.pressTap}
              onClick={() => {
                void tapTick();
                booked.requestSelfReport();
              }}
              className={cn(
                "inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2",
                "bg-surface text-sm font-medium text-foreground transition-colors hover:border-border-hover",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              {CALENDLY_BOOKED_COPY.selfReportPrompt}
            </motion.button>
          </>
        )}
      </div>
    ) : null;

  // ── Booked in place ── FIRST, above every other branch including the skeleton.
  // `booked` is seeded synchronously from storage and needs no network, whereas
  // `isWaiting` covers the whole `offerings` round trip on every cold reload — so
  // checking the skeleton first paints a placeholder for a surface that is never
  // going to render, then collapses to this panel, shoving the reschedule card
  // and the entire timeline on a 360×740 screen. It also outranks the gates below
  // on their own merits: withdrawing the calendar is the point, and it must not be
  // re-offered because a refetch went sideways afterwards.
  if (booked.booked) {
    return (
      <motion.section
        initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={m.springs.glide}
        className={cn("space-y-4", className)}
        {...(booked.announceBooked ? { role: "status" as const } : {})}
      >
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-foreground">
            {CALENDLY_BOOKED_COPY.heading}
          </h3>
          <p className="text-sm text-muted-foreground">{CALENDLY_BOOKED_COPY.body}</p>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-border bg-surface p-4">
          <CalendarCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">
            {CALENDLY_BOOKED_COPY.reassurance}
          </p>
        </div>

        {/* The way back out, and it must name BOTH reasons somebody standing here
            needs it. The parent mounts this component for the REBOOK path as well
            as the never-booked one, so a student whose slot was cancelled can land
            on this panel; copy reading "my booking did not go through" is factually
            false for them and argues them out of the tap they need to make.

            It is a two-step, and the second step names the COST rather than merely
            asking twice: a second held slot carries no `old_invitee` for the
            receiver to reconcile against (§6.4). A hard time-lock was considered
            and rejected — it would also block the student whose booking genuinely
            failed, which is the stranding this phase exists to remove. */}
        {booked.reopenPending ? (
          <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
            <p className="text-sm font-medium text-foreground">
              {CALENDLY_BOOKED_COPY.reopenQuestion}
            </p>
            <p className="text-sm text-muted-foreground">
              {CALENDLY_BOOKED_COPY.reopenWarning}
            </p>
            <div className="flex flex-wrap gap-2">
              <motion.button
                type="button"
                whileTap={m.pressTap}
                onClick={() => {
                  void tapTick();
                  booked.confirmReopen();
                }}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-lg px-4 py-2",
                  "bg-cream text-sm font-semibold text-cream-text transition-opacity hover:opacity-90",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {CALENDLY_BOOKED_COPY.reopenConfirm}
              </motion.button>
              <motion.button
                type="button"
                whileTap={m.pressTap}
                onClick={booked.cancelReopen}
                className={cn(
                  "inline-flex min-h-[44px] items-center rounded-lg border border-border px-4 py-2",
                  "bg-surface text-sm font-medium text-foreground transition-colors hover:border-border-hover",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {CALENDLY_BOOKED_COPY.reopenCancel}
              </motion.button>
            </div>
          </div>
        ) : (
          <motion.button
            type="button"
            whileTap={m.pressTap}
            onClick={() => {
              void tapTick();
              booked.requestReopen();
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
            {CALENDLY_BOOKED_COPY.reopenPrompt}
          </motion.button>
        )}
      </motion.section>
    );
  }

  // ── Waiting ── a request is genuinely in flight. A parent that has not supplied
  // `offeringId` is a different state and renders nothing at all, rather than
  // shimmering on something that may never arrive.
  //
  // The placeholder is the size of the SLOT LIST, which is what replaces it in
  // the overwhelmingly common case. When availability comes back empty the
  // fallback embed is taller, so the block below GROWS — deliberately the
  // direction chosen: growing pushes the timeline down as the surface arrives,
  // where the old 700px-placeholder-then-collapse yanked it ~500px UP after
  // paint, which is the layout lie that rule exists to prevent.
  if (isWaiting || (hasBookingSurface && slotsWaiting)) {
    return (
      <section className={cn("space-y-4", className)} aria-busy="true">
        {heading}
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-border bg-surface animate-pulse"
              style={{ height: SLOT_ROW_HEIGHT }}
            />
          ))}
        </div>
        <span className="sr-only">Loading your interview times</span>
      </section>
    );
  }

  // Inert: no offering id, so no request was ever made.
  if (!data) return null;

  // No booking surface at all: the admin's gate is off, the URL is not a Calendly
  // one, or the offering row is not visible (archived). The marketing gate renders
  // nothing for its two, so the app path renders nothing either — that is
  // ENTRY-PARITY-1 as a property rather than a claim.
  if (isInterviewBookingSilent(data.reason)) return null;

  if (!hostedUrl || !embedUrl) {
    // We could not read the offering. Say that, and give them the one control that
    // can actually change it. `isInterviewBookingError` is asserted rather than
    // assumed so a future reason added to the union cannot silently inherit this
    // copy — and so a NON-retryable reason can never inherit a retry button.
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

  /* ── THE PRIMARY PATH ── three soonest slots, one tap each.

     MEASURED, not estimated (headless Chromium over this exact markup and these
     exact token values, 2026-07-28):
       • 360×740 — surface 328×418px, rows 66px each (64 + the 1px border top and
         bottom), "see all times" 44px, no horizontal overflow, and every day and
         time label renders on ONE line, including the widest ("Wed, 29 Jul");
       • 375×812 — surface 343×418px, identical row and control heights.
     418px inside `ApplicationStatus`'s `py-8` column puts the whole surface, and
     the top of the card beneath it, above the fold on the smaller of the two.

     RE-MEASURED after the post-tap panel gained its own link (same method, same
     token values, 2026-07-28):
       • 360×740 — blocked panel 328×238px, handed-off panel 328×290px, every
         control exactly 44px tall, the widest ("Open your time on Calendly")
         240px inside a 294px control row, so it holds one line; the handed-off
         panel's three controls wrap to two rows, which is what `flex-wrap` is
         there for and is why it is the taller of the two;
       • 375×812 — 343px wide, identical control and panel heights;
       • `documentElement.scrollWidth === clientWidth` at both widths: no
         horizontal overflow on either, from any of the four panel states.

     THOSE NUMBERS STILL STAND after the panel was hoisted onto the fallback
     branches, and this note says why rather than restating them as if they were
     re-measured: the panel's markup is unchanged and it renders in the SAME
     `space-y-4` column at the SAME two widths, so its box is the one measured
     above. What changed is only which branches render it and where in their flow
     (above the calendar on both, so it is never below 700px of iframe). The one
     genuinely new box is the silent-embed hatch, which is a paragraph plus a
     single control on the same 44px token; its floor is asserted executably in
     `__tests__/InterviewEmbed.test.tsx` rather than claimed here, because no
     headless browser was available on this pass to measure it honestly. */
  if (showSlots) {
    return (
      <motion.section
        initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={m.springs.glide}
        className={cn("space-y-4", className)}
      >
        {heading}
        <p className="text-sm text-muted-foreground">{INTERVIEW_SLOTS_COPY.slotsLead}</p>

        {slotTakenNotice}

        <ul className="space-y-2">
          {slots.map((slot, i) => {
            const label = formatSlotLabel(slot.startTime);
            // An instant we cannot render is an instant we must not offer: a
            // button reading "Invalid Date" is worse than one fewer button, and
            // the full calendar below still covers it.
            if (!label) return null;
            const busy = checking === slot.startTime;
            return (
              <motion.li
                key={slot.startTime}
                initial={{ opacity: 0, y: m.reduced ? 0 : 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...m.springs.glide, delay: m.reduced ? 0 : i * 0.05 }}
              >
                <motion.button
                  type="button"
                  whileTap={m.pressTap}
                  disabled={!!checking}
                  onClick={() => {
                    void openSlot(slot);
                  }}
                  aria-label={`Book ${label.aria}`}
                  className={cn(
                    // 64px tall: comfortably past the 44px minimum, and tall
                    // enough to carry two lines of type without the day and the
                    // time crowding each other at 360px.
                    "flex min-h-[64px] w-full items-center justify-between gap-3 rounded-xl",
                    "border border-border bg-surface px-4 py-3 text-left transition-colors",
                    "hover:border-border-hover",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    "disabled:opacity-60",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                      {label.day}
                    </span>
                    <span className="block truncate text-base font-semibold text-foreground">
                      {label.time}
                    </span>
                  </span>
                  {busy ? (
                    <Loader2
                      className="h-4 w-4 shrink-0 animate-spin text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowUpRight
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </motion.button>
              </motion.li>
            );
          })}
        </ul>

        {handOffPanel}

        {moreTimesLink}
      </motion.section>
    );
  }

  // ── FALLBACK, NATIVE ── the hosted link, opened on an explicit tap. See the
  // docblock: an inline frame here launches the system browser BY ITSELF on
  // Android.
  if (!embedInline) {
    return (
      <motion.section
        initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={m.springs.glide}
        className={cn("space-y-4", className)}
      >
        {heading}
        {/* Why the times went, when this branch was reached by a tap rather than
            by an empty first read. Without it the three buttons become this panel
            in silence. */}
        {slotTakenNotice}
        {/* ABOVE the calendar, deliberately. A student who reaches this branch
            with a tap behind them has already chosen a time and is being asked to
            confirm it; the open calendar underneath is the alternative, not the
            instruction. See the panel's own note for why it is built outside the
            slot branch at all. */}
        {handOffPanel}
        <div
          className="rounded-xl border border-border bg-surface p-4 space-y-3"
          style={{ minHeight: NATIVE_PANEL_HEIGHT }}
        >
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

  // ── FALLBACK, WEB ── Calendly's own booking page, in place. Reached when the
  // availability API has nothing to offer, errors, or throttles us. Same builder,
  // same prefill fields and same sandbox posture as before this task, so the
  // fallback is byte-for-byte the surface that shipped.
  //
  // `loading="lazy"` so Calendly's booking bundle is fetched when the applicant
  // actually reaches it. The wrapper carries the height, so lazy costs no layout
  // shift. `bg-white` because Calendly renders its own light UI inside the frame.
  //
  // `referrerPolicy="no-referrer"` STAYS, and it is why `embed_domain` is not
  // optional: the referrer is the implicit "I am embedded" signal, and this
  // route's URL carries the applicant's identifiers, so leaking it to a third
  // party on every frame load buys nothing that `embed_domain` does not state
  // outright.
  return (
    <motion.section
      initial={{ opacity: 0, y: m.reduced ? 0 : 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={m.springs.glide}
      className={cn("space-y-4", className)}
    >
      {heading}
      {/* Same reason as the native branch: a re-check that emptied the list swaps
          three buttons for a 700px frame, and that must not happen wordlessly. */}
      {slotTakenNotice}
      {/* ABOVE the 700px frame, for the same reason as on native and with more
          force: a panel rendered under this iframe is a panel the student never
          scrolls to. Whichever of the two is up, it is the one thing on this
          branch that can record a booking already made. */}
      {handOffPanel}
      {selfReportHatch}
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
          rather finish in a tab, still has a prefilled way through. A booking made
          THERE is invisible to this document — a top-level Calendly page posts to
          no parent — so it writes no marker and this surface keeps offering the
          calendar until the webhook lands and the parent's own gate closes it. */}
      {moreTimesLink}
    </motion.section>
  );
};

export default InterviewSlots;
