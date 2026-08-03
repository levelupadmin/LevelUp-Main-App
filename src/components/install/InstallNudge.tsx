// InstallNudge — the install OFFER at a value moment (REQ-INSTALL-1/2).
//
// Renders nothing unless `VITE_INSTALL_NUDGE` is on (it defaults OFF) AND
// `useInstallMoment` says this exact moment may offer: web only, a real captured
// `beforeinstallprompt` in hand, not dismissed this session. That "nothing" is
// the common case today (no service worker is registered in this repo, so the
// browser event does not fire) and it is the correct degrade: no dead button, no
// empty card, no reserved space.
//
// It is an inline card in the page's own column, NOT a sheet, modal, toast or
// sticky bar. Nothing is covered, nothing is blocked, and the applicant's next
// action on the page stays exactly where it was. Web is the entire journey; this
// is a shortcut being offered, never a step being demanded.
//
// COPY: every string below comes from the phase copy deck
// (design/cohorts/docs/07-COPY-DECK.md §4.3) and carries its deck ID. Two
// deliberate divergences, both flagged in the handoff:
//   1. The deck writes value moment 1 for "after a draft is saved". There is no
//      draft-save moment in this app — the application form is Tally's, and the
//      first in-app state the applicant lands on after acting is `app_fee_paid`.
//      So moment 1 mounts there, and the two strings that name a Tally draft
//      (CD-03-INST-01, CD-03-INST-03) are adapted to what is actually true at
//      that state. CD-03-INST-02/04/05 ship verbatim.
//   2. CD-03-ACC-04's honest-equivalence sentence and CD-03-ACC-03's items lose
//      their em dashes (house rule: no em dashes in LevelUp-facing copy); the
//      words are otherwise the deck's.
// CD-03-INST-06's promise ("This card won't ask twice") is rendered at BOTH
// moments, because the one-ask contract is what makes this an offer rather than
// a wall, and it should be visible to the applicant, not only true in code.
//
// Motion: transform + opacity only (y + opacity), physics from src/lib/motion.ts,
// collapsed to an instant cut under reduced motion. No backdrop-blur (Android
// WebView compositing budget) — a flat --surface panel.

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  isInstallNudgeEnabled,
  registerInstallCapture,
  useInstallMoment,
  type InstallMoment,
} from "@/hooks/useInstallMoment";
import { durations, easings, instant, useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

// Idempotent fallback. src/main.tsx owns the EARLY registration (the browser
// fires `beforeinstallprompt` once per page load, long before this lazy route
// chunk exists); this call only guarantees the listener is never missing when
// the component is rendered outside that entry — a test, a story, a future host.
// Flag-gated for the same reason main.tsx is: with `VITE_INSTALL_NUDGE` off,
// importing this module must not put a listener on `window`.
if (isInstallNudgeEnabled()) registerInstallCapture();

interface MomentCopy {
  /** Small label naming the thing that just happened. */
  eyebrow: string;
  /** The benefit, in the deck's serif voice. */
  title: string;
  /** The concrete "what do I get right now". */
  body: string;
  /** Optional itemised value list (moment 2 only). */
  items?: readonly string[];
  /** Primary action. */
  cta: string;
  /** The decline. Equal weight to the primary, by requirement. */
  decline: string;
  /** The enforced promise: nothing is lost, and this is the only ask. */
  promise: string;
}

/**
 * Copy per moment, held here rather than passed in, so a call site is one line
 * (`<InstallNudge moment="accepted" />`) and every moment's wording stays in one
 * reviewable place next to its deck ID.
 */
const MOMENT_COPY: Record<InstallMoment, MomentCopy> = {
  "fee-paid": {
    // CD-03-INST-01 (adapted: the deck's "Draft saved" names the action just
    // taken; at this mount that action is the ₹400, not a Tally draft save).
    eyebrow: "Application fee paid",
    // CD-03-INST-02 — verbatim.
    title: "Get reminded where you left off.",
    // CD-03-INST-03 (adapted: the deck's "your draft sits on your lock screen,
    // one tap back to step 3" describes the Tally form, which is finished by the
    // time this state exists; the shape and the promise are kept).
    body: "Install the app and your application sits on your lock screen. One tap back to your interview details, instead of hunting for this link.",
    // CD-03-INST-04 — verbatim.
    cta: "Install · keep my place",
    // CD-03-INST-05 — verbatim.
    decline: "I'll finish on the web",
    // CD-03-INST-06 ("your draft is held" → "your application is held", same
    // reason as the body).
    promise: "Either way, your application is held. This card won't ask twice.",
  },
  accepted: {
    // No deck eyebrow exists for 3C; this states the status the card sits under.
    eyebrow: "Seat offered",
    // CD-03-ACC-01 — verbatim.
    title: "Your cohort lives here.",
    // CD-03-ACC-02, closing sentence. The deck's earlier sentences in that entry
    // name specific session times ("Sunday mornings", "2:00 PM") that no
    // scheduling source in this repo can back yet, so the itemised CD-03-ACC-03
    // list carries the benefits instead of inventing a timetable.
    body: "Twelve weeks run better on your home screen.",
    // CD-03-ACC-03 — the deck's three items, em dashes → colons.
    items: [
      "Session doors: one tap from the notification into the room",
      "The weekly unlock: your cohort starts together, you'll know the second it does",
      "Feedback: when a mentor publishes, you hear about it first",
    ],
    // CD-03-ACC-04 — verbatim.
    cta: "Install the app",
    // CD-03-ACC-04 — verbatim.
    decline: "Continue on the web",
    // CD-03-ACC-04's equivalence line (em dash → full stop) + CD-03-INST-06's
    // enforced promise.
    promise: "The web room is identical. This card won't ask twice.",
  },
};

/**
 * What the screen reader hears once the card has actually left. Staged from what
 * the browser DID, never from the tap: `promptInstall()` resolves with the real
 * outcome, so a refused `prompt()` can never be announced as a dialog that
 * opened. Nothing is staged on the paths where the card stays put.
 */
const EXIT_MESSAGE = {
  declined: "Install declined. Everything keeps working on the web.",
  prompted: "Opening your browser's install dialog.",
  retired: "Install is not available right now. Everything keeps working on the web.",
} as const;

// >= 44px tap targets (WCAG 2.5.5 / iOS HIG). `size="sm"` is h-8 and the default
// is h-10, so both actions carry an explicit min-height instead: min-height wins
// over the size variant's fixed height without fighting it in twMerge.
const TAP_TARGET = "min-h-[44px]";

// Both actions are first-class (REQ-INSTALL-2: "Declining is a first-class
// button"), so they share one shape: full width while the column is narrow, side
// by side from `sm` up, identical height and padding. The decline differs from
// the primary by fill only, never by size and never by muted text.
const ACTION = cn(TAP_TARGET, "w-full px-4 sm:w-auto");

export interface InstallNudgeProps {
  /** Which of the two registered value moments this instance speaks for. */
  moment: InstallMoment;
  /** Extra classes for the outer card (spacing at the call site). */
  className?: string;
}

/**
 * Dismissible, once-per-session install offer for a single value moment.
 * Renders nothing at all when the moment may not offer.
 */
const InstallNudge = ({ moment, className }: InstallNudgeProps) => {
  const { offered, promptInstall, dismiss } = useInstallMoment(moment);
  const motionSafe = useMotionSafe();
  const copy = MOMENT_COPY[moment];

  // ── Focus + announcement handoff ──
  // Both actions destroy the control the user is standing on. Without a handoff
  // the browser drops focus to <body> and the next Tab restarts at the top of
  // the page instead of continuing from where the card was. So a zero-height
  // sr-only live region stays behind at the card's exact DOM position, takes
  // focus when OUR button caused the exit (never when the card left for some
  // other reason, e.g. an `appinstalled` from another tab), and announces what
  // happened.
  const sentinelRef = useRef<HTMLParagraphElement>(null);
  const pendingExitRef = useRef<{
    restoreFocus: boolean;
    message: string;
  } | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Latches once the card has been shown, so the wrapper (and therefore the exit
  // animation and its onExitComplete) survives `offered` flipping false. The
  // wrapper carries no classes and its only child is `sr-only` (position:
  // absolute), so it occupies zero layout — nothing is reserved before the first
  // offer and nothing is left behind after it.
  const [wasOffered, setWasOffered] = useState(false);

  useEffect(() => {
    if (offered) setWasOffered(true);
  }, [offered]);

  const handleInstall = useCallback(() => {
    void promptInstall().then((outcome) => {
      // Staged only on the two outcomes that actually retire the card, and only
      // after the user agent has answered. `refused` (offer handed back) and
      // `unavailable` (nothing captured / already in flight) leave the card on
      // screen, so they leave no note behind to be announced later by an exit
      // they did not cause.
      if (outcome !== "shown" && outcome !== "retired") return;
      pendingExitRef.current = {
        restoreFocus: true,
        message:
          outcome === "shown" ? EXIT_MESSAGE.prompted : EXIT_MESSAGE.retired,
      };
    });
  }, [promptInstall]);

  const handleDecline = useCallback(() => {
    // Declining always retires the card, synchronously, so this one can be
    // staged before the call.
    pendingExitRef.current = {
      restoreFocus: true,
      message: EXIT_MESSAGE.declined,
    };
    dismiss();
  }, [dismiss]);

  const handleExitComplete = useCallback(() => {
    const pending = pendingExitRef.current;
    pendingExitRef.current = null;
    if (!pending) return;
    setAnnouncement(pending.message);
    if (pending.restoreFocus) sentinelRef.current?.focus();
  }, []);

  // A decline should leave faster than the card arrived, so the exit is a short
  // `fast` tween on the shared --ease-out curve rather than the entry spring
  // settling backwards. Reduced motion cuts both directions instantly.
  const exitTransition = motionSafe.reduced
    ? instant
    : { duration: durations.fast, ease: easings.out };

  // Feature dark: render literally nothing, and do it as its own statement
  // rather than folded into the line below, so the gate survives any future
  // rework of the offered/wasOffered latch. (`offered` is already false while
  // the flag is off, so this is belt to that brace — deliberately.)
  if (!isInstallNudgeEnabled()) return null;

  // Never offered, never will be: render literally nothing.
  if (!offered && !wasOffered) return null;

  return (
    <div>
      <AnimatePresence onExitComplete={handleExitComplete}>
        {offered && copy && (
          <motion.aside
            key="install-nudge"
            aria-label="Add LevelUp to your home screen"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4, transition: exitTransition }}
            transition={motionSafe.springs.glide}
            className={cn(
              "rounded-xl border border-border bg-surface p-4",
              className,
            )}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2">
                <Smartphone
                  className="h-4 w-4 text-[hsl(var(--cream))]"
                  aria-hidden="true"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {copy.eyebrow}
                </p>
                <p className="mt-1 font-serif-italic text-lg leading-snug text-[hsl(var(--cream))]">
                  {copy.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {copy.body}
                </p>
                {copy.items && (
                  <ul className="mt-2 space-y-1">
                    {copy.items.map((item) => (
                      <li
                        key={item}
                        className="text-xs leading-relaxed text-muted-foreground"
                      >
                        {item}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Button size="sm" className={ACTION} onClick={handleInstall}>
                {copy.cta}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className={ACTION}
                onClick={handleDecline}
              >
                {copy.decline}
              </Button>
            </div>

            {/* The enforced promise, last, where it answers the hesitation the
                buttons just created. */}
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {copy.promise}
            </p>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Focus landing pad + polite announcement. Zero layout (sr-only is
          absolutely positioned), tabIndex -1 so it is programmatically
          focusable but never a stop in the tab order. */}
      <p
        ref={sentinelRef}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {announcement}
      </p>
    </div>
  );
};

export default InstallNudge;
