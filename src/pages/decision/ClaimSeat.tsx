import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Countdown } from "@/components/live/Countdown";
import { supabase } from "@/integrations/supabase/client";
import { isNative } from "@/lib/platform";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { useDecision } from "@/hooks/useDecision";

/**
 * `setTimeout` coerces a delay above the signed 32-bit ceiling to 1ms, which
 * would fire the transition immediately on an absurdly long window. Anything
 * past it is far beyond any real hold, so we simply don't schedule.
 */
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;

/**
 * Inside this much of the deadline the strip shows the live ticking clock.
 * Outside it, it shows the close time itself: `<Countdown>` renders `hh:mm:ss`
 * with no days rollover, so a 2-day window (the `confirmation_deadline_days`
 * default) would read "48:00:00" and a 7-day one "168:00:00".
 */
const LIVE_CLOCK_WINDOW_MS = MS_PER_DAY;

/**
 * The money terms, read off the OFFERING — the same public, marketing-class row
 * the offering page already exposes (VEIL-SOURCE-1). No application row is
 * touched here: `useDecision` owns that read and deliberately never selects
 * `bio` (the 100-word essay) or `tally_data`. Explicit columns, never `*`.
 */
const OFFERING_TERMS_COLUMNS = "app_fee_inr, confirmation_amount_inr, price_inr";

interface OfferingTerms {
  app_fee_inr: number | null;
  confirmation_amount_inr: number | null;
  price_inr: number | null;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * `app_fee_inr` / `confirmation_amount_inr` / `price_inr` all carry a DB DEFAULT
 * of 0 rather than NULL (migration `20260413100000`), and
 * `AdminOfferingEditor.tsx` writes an explicit 0 for any offering that is not on
 * the staged-payment mode. So "missing" reads back as 0, not null, and a
 * `!== null` guard would happily render "Due now to confirm ₹0". Only a
 * POSITIVE amount is a real figure.
 */
const positiveAmount = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

/**
 * What is still owed after the application fee and the seat confirmation, i.e.
 * exactly what `/checkout/{id}?type=balance` will charge. `create-razorpay-order`
 * subtracts BOTH already-captured stages from `price_inr`
 * (`index.ts` `payment_type === "balance"`), and the same
 * `price − app_fee − confirmation` formula is the balance floor in
 * `reconcile-funnel-stage` and the preview in `AdminOfferingEditor`. Dropping
 * `app_fee_inr` here would overstate the balance by the application fee on the
 * first surface in the app that ever states the number.
 */
const balanceAfterStages = (
  total: number | null,
  appFee: number | null,
  confirmation: number | null,
): number | null => {
  if (total === null || confirmation === null) return null;
  return Math.max(0, total - (appFee ?? 0) - confirmation);
};

/** Absolute close time, e.g. "29 Jul, 6:30 pm". Never goes stale. */
const formatCloseTime = (date: Date): string =>
  date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;

/**
 * Coarse remaining time for the screen-reader sentence. Deliberately not a
 * ticking value and deliberately days-aware: the visible clock carries the
 * urgency, this carries the meaning.
 */
const spokenRemaining = (ms: number): string => {
  if (ms < MS_PER_MINUTE) return "less than a minute";
  const days = Math.floor(ms / MS_PER_DAY);
  const hours = Math.floor((ms % MS_PER_DAY) / MS_PER_HOUR);
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  if (days > 0) {
    return hours > 0
      ? `${plural(days, "day")} and ${plural(hours, "hour")}`
      : plural(days, "day");
  }
  if (hours > 0) {
    return minutes > 0
      ? `${plural(hours, "hour")} and ${plural(minutes, "minute")}`
      : plural(hours, "hour");
  }
  return plural(minutes, "minute");
};

/**
 * `held` — the window is open but further out than the live clock is useful for.
 * `closing` — inside the last day, the clock ticks.
 * `closed` — the window has lapsed.
 */
type SeatPhase = "held" | "closing" | "closed";

const phaseFor = (untilMs: number | null): SeatPhase => {
  // No known window: there is nothing to close, and no strip renders.
  if (untilMs === null) return "held";
  const remaining = untilMs - Date.now();
  if (remaining <= 0) return "closed";
  return remaining <= LIVE_CLOCK_WINDOW_MS ? "closing" : "held";
};

/**
 * ClaimSeat — the honest held-seat window, then the EXISTING confirmation
 * checkout (REQ-DEC-5).
 *
 * Route: `/decision/:applicationId/claim`, inside the student shell.
 *
 * **INTEG-PAY-1: this page originates no order.** The seat-confirm runs on the
 * pipeline that already exists — the CTA is a plain `<Link>` to the
 * `/checkout/{offering_id}?type=confirmation&app={application_id}` route
 * `CheckoutPage` has always served, and `CheckoutPage` owns the
 * `create-razorpay-order` call from there. Nothing in this file talks to
 * Razorpay, mints a payment link, or writes a funnel status. The ROUTE is the
 * pre-existing thing, not a sibling surface offering it: the one place
 * `ApplicationStatus.tsx` spells the same URL out sits behind a condition that
 * cannot be satisfied (see "Do not cite `ApplicationStatus.tsx`" below), so no
 * live sibling is holding this link open for an `accepted` student. Nor is this
 * page one yet — it is dark behind `VITE_DECISION_FLOW` (the
 * `flag(DECISION_FLOW)` redirect further down), and the accepted signal needs
 * `VITE_FUNNEL_RECON` on top of that (`useDecision.ts`). The honest distinction
 * between the two surfaces is unsatisfiable-condition there versus flag-dark
 * here; neither is "in front of a student" today, and nothing below should be
 * read as claiming otherwise.
 *
 * **The store guard is `isNative()`, never `isIOS()`.** Both shells forbid this
 * surface, for different reasons. Google Play's Reader Rule (Path B) is the
 * binding one on Android: the shell must carry NO purchase UI at all, not even a
 * price chip that merely looks like it could lead to checkout
 * (`src/lib/platform.ts`, `capacitor.config.ts`). Apple's anti-steering rules
 * (3.1.1 / 3.1.3) forbid the in-app purchase AND the link out to one. An
 * `isIOS()` test here would have satisfied neither: it is false on Android, so
 * every rupee figure below and a "Claim my seat" button would have shipped
 * inside a live Play build. So the whole money block — the FIGURES as well as
 * the CTA — is suppressed inside BOTH native shells, on one platform test, and
 * the SAME thing stands in its place in both.
 *
 * **What stands in its place: an instruction, not a link.** Both shells get a
 * pointer saying where the figure itself is, then a one-line, link-free,
 * price-free sentence — "Complete this step from a web browser." — in the slot
 * the button had. The wording is lifted verbatim from the three iOS branches
 * `ApplicationStatus.tsx` carries, for one voice across the funnel and NOTHING
 * more: all three of those branches are unreachable in v1 (see "Do not cite
 * `ApplicationStatus.tsx`" below), so this is reuse of a phrase, not evidence
 * that the phrase has been battle-tested in front of a student. It has not
 * been, and no sibling makes it so: `EnrollmentDetails.tsx` pairs the same two
 * lines on native, but that branch is this phase's own new code and that page
 * sits behind the same `flag(DECISION_FLOW)` redirect, so it has faced no
 * student either. The claim is consistency of wording inside this phase and
 * nothing beyond it: whichever surface and whichever shell the student
 * eventually opens, one money step gets one explanation of it.
 *
 * The sentence is stated here rather than delegated to `ContinueOnWebCTA`
 * because that component fits NEITHER shell. Its guard is `isIOS()`, not
 * `isNative()` (`ContinueOnWebCTA.tsx`) — precisely the test this page rejects
 * above. On Android it therefore falls through to the outbound "Continue on
 * web" link, which is purchase UI inside a Play build and does not leave the
 * WebView anyway (next paragraph). On iOS it returns `null` for
 * `variant="inline"`, and for `variant="card"` it ignores the `body` prop and
 * hardcodes "Everything you're enrolled in lives right here in the app: every
 * lesson, ready whenever you are." — false for an accepted student who has not
 * paid the confirmation fee, and a flat contradiction of the lapsed copy above
 * it. That file is outside this task's fence, so it is flagged for integration
 * rather than edited here; the flag is the `isIOS()`/`isNative()` split, not a
 * one-line `body` fix.
 *
 * **Why there is no "Continue on web" bounce here, on Android either: because
 * on this shell it does not bounce.** `ContinueOnWebCTA` targets
 * `https://app.leveluplearning.in` — which is ALSO the origin the Android
 * WebView serves the bundled build from (`capacitor.config.ts`
 * `server.hostname`), and is separately covered by its
 * `allowNavigation: ["*.leveluplearning.in"]`. Capacitor's
 * `Bridge.launchIntent()` fires `ACTION_VIEW` only when the host differs from
 * the app URL's host AND misses the allow-navigation mask; here both tests
 * pass, so it returns false and the WebView navigates INTERNALLY, off the
 * bundled assets. `target="_blank"` does not escape either — nothing in
 * `@capacitor/android` or `MainActivity.java` sets `setSupportMultipleWindows`
 * or overrides `onCreateWindow`. So the "bounce" would re-enter this same SPA
 * in-shell, where `isNative()` is TRUE, and `CheckoutPage`'s native fallback
 * would drop `?type=confirmation&app=` and re-route to the full-price
 * `/p/{slug}` first-purchase page — the K-2 dead end exactly, charging a
 * confirmed student the wrong amount. The link is therefore not offered, rather
 * than offered broken. Even given a real escape it would still not carry: a
 * system browser holds no Supabase session, and `Login.tsx` reads only
 * `location.state.from.pathname`, never the `?next=` param `CheckoutPage`
 * redirects anonymous users with, so the confirmation query string dies at the
 * login wall and the student lands on `/home`. `ContinueOnWebCTA.tsx`,
 * `CheckoutPage.tsx` and `Login.tsx` are all outside this task's fence and the
 * second is the payment pipeline, so all three are flagged for integration.
 *
 * **Where the Android student goes from here.** Out to a browser, on their own
 * — the path forward is an instruction, so it depends on no link and on no
 * upstream surface. `DecisionReveal.tsx` and `AcceptanceCard.tsx` RELABEL their
 * forward CTAs on this same `isNative()` test rather than deleting them, so this
 * page is still reached in the Play shell, as it is by deep link, bookmark and
 * back stack; but nothing here needs that to hold. Both of those files' comments
 * were written against an earlier draft in which this page carried a "Continue
 * on web" bounce, and both were corrected at integration to describe what
 * actually stands here now — the pointer and the browser instruction. Their
 * BEHAVIOUR never depended on it.
 *
 * **SEAT-1:** release stays a manual admin action in v1. This page states the
 * consequence of a lapse, it does not automate one, and every sentence about
 * that consequence is HEDGED and in the future tense for exactly that reason: a
 * clock hands nobody's seat on, so neither this page nor `AcceptanceCard.tsx`
 * may say the window itself puts the seat back. Because it does not automate
 * one, a lapsed window must not dead-end. `accepted_at` is stamped once and never
 * cleared and the app holds no write path to it, so a student re-admitted into a
 * later batch arrives with the ORIGINAL anchor still in place and the window
 * already lapsed. Dead-ending on that would make the "your acceptance carries to
 * the next batch" promise unimplementable in product, and would leave a student
 * whose seat may well still be open with hand-written SQL as the only way back
 * in. SEAT-1 settles it on its own: the clock releases nothing, so this page may
 * not withdraw the path as though it had. The lapse changes the COPY, never the
 * path forward.
 *
 * **Do not cite `ApplicationStatus.tsx` as a precedent for that.** Earlier
 * revisions of this comment rested the ruling on that page "keeping offering the
 * same confirmation link for an `accepted` row". It does not: its two staged-pay
 * CTAs are UNREACHABLE. `STEPS[4].key` is `confirmation_paid` while
 * `STATUS_TO_STEP.accepted` is 3, and `getStepState` returns `"current"` only
 * where `index === currentStepIndex`, so "Pay Confirmation" asks for
 * `currentStepIndex` to be 4 (the step) and 3 (the status) at once. "Pay
 * Balance" is dead the same way: `STEPS[5]` against
 * `STATUS_TO_STEP.confirmation_paid` of 4.
 *
 * Its THIRD money CTA — the reconciled one — is unreachable too, for a separate
 * reason, and this is the one that is easy to miss because the condition reads
 * as though it could fire. `reconciledUi` is `reconciledIsMoney ? undefined :
 * reconciledUiCandidate`, and `reconciledIsMoney` is true whenever the
 * candidate's own CTA carries `payment: true`; so a DEFINED `reconciledUi`
 * proves the CTA derived from it is not payment-bearing, and
 * `reconciledCta.payment && isIOS()` can never both hold. (Both payment-bearing
 * entries in `RECONCILED_STAGE_UI` — `completed-no-fee` and
 * `confirm-paid-no-balance` — are additionally listed in `MONEY_STAGES`, and the
 * whole reconciled block is dark behind `VITE_FUNNEL_RECON` on top of that.)
 *
 * So all three "Complete this step from a web browser." callsites on that page,
 * and all three checkout links paired with them, render to nobody in v1. Every
 * one of those conditions is pre-existing — unchanged by this phase, and NOT
 * this phase's to fix. Recorded here only so the next reader does not re-derive
 * a live precedent, a shipped-copy precedent, or a sibling-link precedent out of
 * a surface that renders nothing.
 */
const ClaimSeat = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { decision, isLoading, isOffline } = useDecision(applicationId);

  /* The countdown anchor is SERVER-DERIVED — `useDecision` builds it from the
     row's once-stamped acceptance time plus the offering's
     `confirmation_deadline_days` / `confirmation_grace_hours` — and it is
     deliberately never mirrored into localStorage. That is what keeps "closes
     {countdown}" honest: it survives a refresh, it survives a device swap, and
     it cannot be reset by clearing storage or by opening the page for the first
     time on a second phone.

     It is null whenever the row carries no acceptance stamp (a student accepted
     before the column existed, say). That is a real state and it is handled as
     one: the strip does not render, and the page states the hold WITHOUT a
     deadline rather than inventing one. Every branch below reads this single
     value, so there is no second source that could disagree with it. */
  const heldUntil = decision?.seatHeldUntil ?? null;
  const heldUntilMs = heldUntil ? heldUntil.getTime() : null;

  const [phase, setPhase] = useState<SeatPhase>(() => phaseFor(heldUntilMs));
  /* Bumped by each boundary timer purely to re-run the scheduler below.
     Scheduling off `phase` instead would wedge: if a fire resolves to the SAME
     phase — routine on Android WebView, where an NTP correction can step the
     system clock backwards — React bails out of the re-render, the effect never
     re-runs, no successor timeout is armed, and the strip goes on reading "seat
     held · closes …" for a window that has already run out, until something
     else remounts the page. A monotonic token always changes, so the machine
     always re-arms. */
  const [boundary, setBoundary] = useState(0);

  /* One-shot transitions at the two boundaries, NOT a second clock: <Countdown>
     owns the ticking display. This only walks the page held → closing → closed
     so someone sitting on the page isn't left reading a live countdown, or a
     held-seat strip, for a window that has already closed. The claim step
     itself is deliberately NOT withdrawn at the boundary — the phase drives the
     strip and the copy, nothing else (see the SEAT-1 note in the docblock).
     Each run schedules the NEXT boundary only. It terminates because every
     scheduled delay is strictly positive: `held` only holds while more than
     LIVE_CLOCK_WINDOW_MS remains, and `closing` only while some time remains. */
  useEffect(() => {
    const next = phaseFor(heldUntilMs);
    setPhase(next);
    if (heldUntilMs === null || next === "closed") return;
    const remaining = heldUntilMs - Date.now();
    const delay = next === "held" ? remaining - LIVE_CLOCK_WINDOW_MS : remaining;
    if (delay > MAX_TIMEOUT_MS) return;
    const id = window.setTimeout(
      () => setBoundary((n) => n + 1),
      Math.max(0, delay),
    );
    return () => window.clearTimeout(id);
  }, [heldUntilMs, boundary]);

  /* Whether the page is showing the lapsed presentation. Read here rather than
     next to the render because the layout effect below is a hook, and hooks
     cannot sit behind the early returns further down. */
  const lapsed = phase === "closed";

  /* The boundary above can fire while someone is mid-read, and the lapsed
     presentation carries more copy than the open one. This file already refuses
     to let a late-arriving fee card push the claim button down under the
     reader's thumb — that is the whole justification for the spinner gate below
     — so a transition the page schedules for ITSELF does not get to do it
     either.

     Two things hold it still. The two presentations use the same slots — window
     strip, heading, lead, the shared payment block, footnote — so the boundary
     rewrites copy instead of restacking the page. And what is left of the
     difference (a longer lead) comes back out of the scroll offset in the same
     frame, before the browser paints, so the payment block stays where the
     reader left it.

     The measurement is DOCUMENT-relative (`+ scrollY`), so a scroll the reader
     performed between renders is never mistaken for a layout change and undone.
     Nothing here touches html/body overflow or any scroll container: it reads a
     scroll position and restores it, once, and only for a reader who is already
     scrolled — at the top of the page there is nothing to restore, and the copy
     grows below the line they are reading rather than above it. */
  const payRef = useRef<HTMLDivElement>(null);
  const payTopRef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = payRef.current;
    const top = el ? el.getBoundingClientRect().top + window.scrollY : null;
    const previous = payTopRef.current;
    payTopRef.current = top;
    if (previous === null || top === null) return;
    const delta = top - previous;
    if (Math.abs(delta) < 1 || window.scrollY <= 0) return;
    window.scrollBy(0, delta);
  }, [lapsed]);

  /* Read once, used by both the query gate and the render, so the page cannot
     end up half-guarded — the figures and the CTA are one decision. ONE test,
     with no second platform branch under it: both native shells are handed the
     same store-legal replacement (see the docblock). */
  const native = isNative();

  /* NOT read in a native shell: every figure this returns is suppressed there
     (see the store-guard note in the docblock), so fetching it would buy a
     native-only round trip on the highest-stakes screen in the funnel for data
     that never paints. A disabled query reports `isLoading: false` in
     react-query v5, so skipping it also takes native off the spinner gate
     below. */
  const offeringId = decision?.offeringId;
  const terms = useQuery<OfferingTerms | null>({
    queryKey: ["decision", "offering-terms", offeringId],
    enabled: !!offeringId && !native,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select(OFFERING_TERMS_COLUMNS)
        .eq("id", offeringId!)
        .single();
      // Degrade to "no figures" rather than throwing: a missing amount hides a
      // row, it never blocks the claim.
      if (error || !data) return null;
      return data as OfferingTerms;
    },
  });

  const todaysPath = `/my-application/${applicationId ?? ""}`;

  if (!flag(DECISION_FLOW)) return <Navigate to={todaysPath} replace />;

  /* The money terms are part of this page being READY, not a late enhancement.
     Painting the fee card only once the offering query lands would push the
     "Claim my seat" button down under the reader's thumb mid-read, so the
     spinner covers both reads. That reasoning is web-only, and so is this half
     of the gate: in a native shell there is no fee card and no button to push
     down, the terms query is never enabled, and `terms.isLoading` is therefore
     false — native paints on the decision read alone. Same for an offering-less
     read: a disabled query reports `isLoading: false` in react-query v5, so
     this never hangs when there is nothing to read. */
  if (isLoading || terms.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Offline with no answer yet. `useDecision` PAUSES rather than fails
     (react-query's `networkMode: "online"`), so a null decision here is "no
     answer", not "no decision" — and redirecting on it lands the student on
     /my-application/:id, whose own fetch also fails offline and renders
     "Application Not Found". Same branch, same reason, as DecisionReveal. The
     seat is unaffected by the connection, and saying so is the point: this is
     the page where a blank screen reads as a lost seat. */
  if (isOffline && (!decision || decision.verdict !== "accepted")) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Offline
          </p>
          <h1 className="mt-4 text-xl font-bold text-foreground md:text-2xl">
            Your seat is still held
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You're not connected right now, so this page can't load your details
            yet. Nothing is lost and nothing is released by being offline. Open
            this again once you're back online and you can confirm from here.
          </p>
        </div>
      </div>
    );
  }

  /* Accepted-only. Once the confirmation is captured the reconciler's stage
     moves past `accepted`, the verdict falls back to `pending`, and this page
     hands the student to the status timeline — so a paid student can never be
     shown a second claim CTA. */
  if (!decision || decision.verdict !== "accepted") {
    return <Navigate to={todaysPath} replace />;
  }

  const confirmation = positiveAmount(terms.data?.confirmation_amount_inr);
  const appFee = positiveAmount(terms.data?.app_fee_inr);
  const total = positiveAmount(terms.data?.price_inr);
  const balance = balanceAfterStages(total, appFee, confirmation);

  const checkoutTo = `/checkout/${decision.offeringId}?type=confirmation&app=${applicationId}`;

  /* ONE payment path, rendered identically by the open branch and the lapsed
     one. The countdown is an urgency device, not an entitlement gate: seats are
     released by hand (SEAT-1), so the deadline passing takes nothing away, and
     the ₹8k runs on the existing checkout (INTEG-PAY-1). Withholding the path
     at the boundary would have this page enforce a release nothing performed,
     and would leave the student with hand-written SQL as the only remedy. Only
     the copy around this block knows about the lapse. SEAT-1 is the whole of
     that argument: no other surface seconds it, because
     `ApplicationStatus.tsx`'s staged-pay CTAs are unreachable dead code (see
     the docblock) and offer an `accepted` student nothing.

     On native the guard swallows the FIGURES as well as the CTA — see the
     docblock. Nothing below reaches Razorpay or mints a link: on web it is a
     <Link> to the route that already exists, and on native it is prose with no
     href at all, because an outbound link to the web origin is served straight
     back into this same WebView on Android (docblock again) and would land the
     student on the full-price offering page.

     The wrapper is what the layout effect measures: one element, present in
     both phases and in both platform branches, whose document position is the
     thing that must not move when the window closes under a reader. It carries
     no styling, so it collapses out of the layout. */
  const paymentPath = (
    <div ref={payRef}>
      {native ? (
        /* Both shells, one treatment: the pointer that stands in for the fee
           card, then the sentence that stands in for the button. The pointer is
           not optional dressing — without it a native reader is told to go and
           complete a money step with no idea where the amount is stated, which
           is the one thing `EnrollmentDetails.tsx` is careful to tell them on
           the very same platform. Neither line carries a figure or an href. */
        <>
          <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
            The exact amount due to confirm is shown on the checkout screen when
            you open this page in a web browser, before you pay anything.
          </p>
          <p className="mt-3 text-xs text-muted-foreground">
            Complete this step from a web browser.
          </p>
        </>
      ) : (
        <>
          {confirmation !== null ? (
            <div className="mt-6 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Due now to confirm
                </span>
                <span className="text-lg font-semibold text-foreground">
                  {inr(confirmation)}
                </span>
              </div>
              {balance !== null && (
                <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-border pt-2">
                  <span className="text-xs text-muted-foreground">
                    Balance, due before the cohort begins
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {inr(balance)}
                  </span>
                </div>
              )}
            </div>
          ) : (
            /* No positive confirmation amount on the offering, or the terms
               read failed. Say so plainly rather than rendering ₹0. */
            <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
              The exact amount due to confirm is shown on the checkout screen
              before you pay anything.
            </p>
          )}

          <div className="mt-6">
            <Link to={checkoutTo} className="block">
              <Button size="lg" className="w-full">
                Claim my seat
                <ArrowRight className="ml-1 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-canvas">
      {/* REQ-DEC-5, the v1 conversion lever. Sticky, so it persists across
          scroll; derived from the server, so it persists across refresh. It
          renders ABOVE the payment CTA in the DOM on purpose — the honest
          window is read before the button is.

          The offset is the student shell's own header, which is `min-h-16`
          PLUS `safe-top` (`env(safe-area-inset-top)`). A flat `top-16` pins the
          strip inside that band on iOS, where the shell header's opaque
          background paints straight over it and the lever disappears the moment
          anyone scrolls. Same offset Home.tsx uses for its in-shell sticky bar;
          the inset is 0 on Android WebView and web, so nothing moves there.

          The negative margins come from that same precedent and are not
          decoration: StudentLayout wraps its outlet in `px-4 md:px-8 lg:px-10
          xl:px-12 py-6 md:py-10`, so without them the strip is double-padded
          and its `border-b` stops short of the container edges on every
          platform, reading as a floating box rather than a shelf. They cancel
          the shell's padding exactly, and the strip re-applies its own.

          It keeps its slot once the window has closed — the same bar, the same
          height, saying the closed thing — rather than unmounting. Unmounting
          it would pull the whole page up by its height at the exact moment the
          copy below is growing, which is the shift the layout effect above
          exists to prevent. It drops `sticky` there, though: a closed window is
          not worth following the reader down the page. */}
      {heldUntil && (
        <div
          className={`z-30 -mx-4 -mt-6 border-b border-border bg-surface px-4 py-2.5 md:-mx-8 md:-mt-10 md:px-8 lg:-mx-10 xl:-mx-12${
            lapsed ? "" : " sticky top-[calc(4rem+env(safe-area-inset-top))]"
          }`}
        >
          <p className="mx-auto flex max-w-2xl items-center gap-2 text-xs text-muted-foreground">
            {/* Hidden from assistive tech and replaced by the sentence below:
                <Countdown> is a session-start component whose hardcoded
                aria-label reads "Starts in …", the exact opposite of a window
                closing, and it exposes no prop to override it. */}
            <span aria-hidden="true" className="flex items-center gap-2">
              {lapsed ? (
                <>
                  <span className="font-medium text-[hsl(var(--cream))]">
                    seat window
                  </span>
                  <span className="opacity-40">·</span>
                  <span>closed {formatCloseTime(heldUntil)}</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-[hsl(var(--cream))]">seat held</span>
                  <span className="opacity-40">·</span>
                  <span>closes</span>
                  {phase === "closing" ? (
                    <Countdown target={heldUntil} joinLabel="Window closed" className="text-xs" />
                  ) : (
                    <span className="font-mono tabular-nums text-[hsl(var(--cream))]">
                      {formatCloseTime(heldUntil)}
                    </span>
                  )}
                </>
              )}
            </span>
            {/* ONE element across both phases, so the boundary UPDATES a live
                region that already exists rather than inserting a new one —
                which is what makes the change actually announce. It is the only
                announcement available: the ticking clock beside it is
                aria-hidden, so nothing else here speaks. */}
            <span className="sr-only" role="status">
              {lapsed
                ? `The seat window closed on ${formatCloseTime(heldUntil)}. Your acceptance has not closed with it.`
                : `Seat held. Closes in ${spokenRemaining(
                    heldUntil.getTime() - Date.now(),
                  )}, on ${formatCloseTime(heldUntil)}.`}
            </span>
          </p>
        </div>
      )}

      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
        <Link
          to={`/decision/${applicationId}/accepted`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to your acceptance
        </Link>

        {lapsed ? (
          <>
            {/* The lapse, in the only order that is honest about ALL of it:
                the window closed; release is a manual admin action (SEAT-1) so
                nothing was automatically taken at the deadline and this page
                cannot know whether the seat is still there; the way to FIND
                OUT, before any money moves; and only then the step itself.
                Stating a flat "the seat goes back to the list" here would be a
                past-tense claim about something no clock performs, and putting
                the ₹8k CTA above the check-first line would sell a seat the
                same screen had just called gone.

                It says nothing about a step "below", and makes no claim that
                the step still works. In neither native shell is the block
                underneath the ₹8k step this copy would be introducing: it is a
                pointer to where the figure is stated and one line asking the
                reader to open a browser, which is a way OUT of the shell rather
                than a step within it. And "it
                still works" is a sentence about a checkout route that a fast
                reader takes as a sentence about the seat — on the same screen
                that just said the seat may be gone. The page offers the path
                and lets it speak for itself.

                Slots, in order, are the same as the open branch below —
                heading, lead, the shared payment block, footnote — so the
                boundary rewrites copy rather than restacking the page under
                someone's thumb. */}
            <h1 className="mt-4 text-xl font-bold text-foreground md:text-2xl">
              Your window has closed.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your acceptance does not expire with it. Seats here are released by
              hand, not by the clock, so yours may still be open, or it may
              already have been passed on to someone else in this batch. This
              page cannot tell you which.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              If you would rather know where you stand before you pay anything,
              reply to your decision email first. We can tell you honestly
              whether this batch is still open to you.
            </p>

            {paymentPath}

            {/* The other half of not dead-ending: what happens if they go ahead
                and the answer turns out to be no. Nothing downstream stops that
                charge — `create-razorpay-order` checks ownership, the app fee
                and a duplicate confirmation, and has no window or status test —
                so the page that surfaces the path owes the student the remedy
                for the one outcome it just told them it cannot rule out. */}
            <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
              Either way your acceptance stays valid and carries to the next
              batch, so you are not starting again and you would not have to
              apply again. And if you do go ahead and the seat here has already
              gone, that payment is not lost: reply to the same email and it
              moves with you to the next batch, or comes back to you.
            </p>
          </>
        ) : (
          <>
            <h1 className="mt-4 text-xl font-bold text-foreground md:text-2xl">
              Confirm the seat, and the locks come off.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              {heldUntil
                ? "Your seat is held for you until the window above runs out. Nobody else is offered it while it is held."
                : "Your seat is held for you while you confirm. Nobody else is offered it in the meantime."}
            </p>

            {/* Apple anti-steering plus the money, in one block, shared with
                the lapsed branch above. */}
            {paymentPath}

            {/* Lapse behaviour stated BEFORE the deadline, not after it. Saying
                it plainly is the point: it removes the resentment a hidden
                deadline creates, and it keeps a missed window as pipeline
                rather than a loss.

                It is HEDGED, and in the future tense, because that is the only
                version of it that is true. Release is a manual admin action
                (SEAT-1): no clock hands the seat on, so "the seat goes back to
                the list" would promise an event nothing performs — and it would
                contradict the lapsed branch above, which tells the same student
                their seat may well still be open. Two surfaces disagreeing
                about one seat is the defect this page was rewritten to remove;
                it does not get to come back as copy.

                What it deliberately does NOT do is announce the soft landing.
                The window is the v1 conversion lever (REQ-DEC-5) and this is
                the pre-deadline surface; telling a student here that the ₹8k
                step outlives the countdown would spend the lever before it has
                been pulled. The promise made here is the one that is actually
                needed — the ACCEPTANCE survives — and it is the same promise
                the lapsed branch keeps. */}
            <p className="mt-6 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
              If the window closes before you confirm, we may pass the seat to
              someone else in this batch. Your acceptance stays valid and carries
              to the next batch. You would not have to apply again.
            </p>
          </>
        )}

        <Link
          to={`/decision/${applicationId}/details`}
          className="mt-6 block text-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Read the fee structure and schedule
        </Link>
      </div>
    </div>
  );
};

export default ClaimSeat;
