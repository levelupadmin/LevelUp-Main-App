import { Link, Navigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { DECISION_FLOW, flag } from "@/lib/flags";
import { useDecision } from "@/hooks/useDecision";

/**
 * The fee + schedule terms, read off the OFFERING — the same public,
 * marketing-class row the offering page already exposes (VEIL-SOURCE-1). Every
 * figure on this page is per-SKU for that reason: nothing is hardcoded, so a
 * cohort with a different fee split, price or start date renders its own
 * numbers. No application row is touched here (`useDecision` owns that read and
 * never selects `bio` or `tally_data`). Explicit columns, never `*`.
 */
const OFFERING_TERMS_COLUMNS =
  "app_fee_inr, confirmation_amount_inr, price_inr, cohort_start_date";

interface OfferingTerms {
  app_fee_inr: number | null;
  confirmation_amount_inr: number | null;
  price_inr: number | null;
  cohort_start_date: string | null;
}

const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * `app_fee_inr` / `confirmation_amount_inr` / `price_inr` all carry a DB DEFAULT
 * of 0 rather than NULL (migration `20260413100000`), and
 * `AdminOfferingEditor.tsx` writes an explicit 0 for any offering that is not on
 * the staged-payment mode. So "missing" reads back as 0, not null, and a
 * `!== null` guard would happily render "Seat confirmation, due now ₹0". Only a
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
 * `app_fee_inr` here would overstate the balance by the application fee.
 */
const balanceAfterStages = (
  total: number | null,
  appFee: number | null,
  confirmation: number | null,
): number | null => {
  if (total === null || confirmation === null) return null;
  return Math.max(0, total - (appFee ?? 0) - confirmation);
};

const formatDate = (value: string | Date): string | null => {
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
};

/** The seat window closes at an hour, not on a day, so it states the hour. */
const formatDateTime = (date: Date): string | null => {
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
};

/**
 * EnrollmentDetails — the long-form answer to "what am I actually signing up
 * for", reachable from both the acceptance card and the claim page.
 *
 * Route: `/decision/:applicationId/details`, inside the student shell.
 *
 * Three sections: what happens when you claim, the per-SKU fee structure, and
 * the schedule. No essay text and no seat number, and no payment entry point of
 * its own — the money CTA lives on ClaimSeat behind the `isIOS()` guard, so
 * this page links there rather than to checkout.
 */
const EnrollmentDetails = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { decision, isLoading, isOffline } = useDecision(applicationId);

  const offeringId = decision?.offeringId;
  const terms = useQuery<OfferingTerms | null>({
    queryKey: ["decision", "enrolment-terms", offeringId],
    enabled: !!offeringId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select(OFFERING_TERMS_COLUMNS)
        .eq("id", offeringId!)
        .single();
      // Degrade to "no figures" rather than throwing: a missing amount hides a
      // row instead of stating a wrong one.
      if (error || !data) return null;
      return data as OfferingTerms;
    },
  });

  const todaysPath = `/my-application/${applicationId ?? ""}`;

  if (!flag(DECISION_FLOW)) return <Navigate to={todaysPath} replace />;

  /* Every money line on this page depends on the offering read, including the
     step titles. Rendering the steps first and swapping "You confirm the seat"
     for "You pay ₹8,000" a beat later would show two different pages to the
     same reader, so the spinner covers both reads. A disabled query reports
     `isLoading: false` in react-query v5, so this never hangs. */
  if (isLoading || terms.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  /* Offline with no answer yet. `useDecision` PAUSES rather than fails, so a
     null decision here means "no answer", not "no decision" — and redirecting
     on it lands the student on /my-application/:id, whose own fetch also fails
     offline and renders "Application Not Found". Same branch, same reason, as
     DecisionReveal. */
  if (isOffline && (!decision || decision.verdict !== "accepted")) {
    return (
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            Offline
          </p>
          <h1 className="mt-4 text-xl font-bold text-foreground md:text-2xl">
            These load when you're back online
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            You're not connected right now, so the fees and dates for your cohort
            haven't loaded. Nothing is lost, and your seat is not affected. This
            page fills itself in the moment the connection returns.
          </p>
        </div>
      </div>
    );
  }

  if (!decision || decision.verdict !== "accepted") {
    return <Navigate to={todaysPath} replace />;
  }

  const confirmation = positiveAmount(terms.data?.confirmation_amount_inr);
  const appFee = positiveAmount(terms.data?.app_fee_inr);
  const total = positiveAmount(terms.data?.price_inr);
  const balance = balanceAfterStages(total, appFee, confirmation);
  /* `appFee` belongs in this guard: `balanceAfterStages` returns null whenever
     the confirmation amount is unset, so an offering whose only positive figure
     is `app_fee_inr` (a single-payment SKU that still charged to apply) would
     otherwise suppress the one real number the page has and fall through to the
     "figures are elsewhere" note. */
  const hasFeeRows =
    appFee !== null || confirmation !== null || balance !== null || total !== null;

  const startDate = terms.data?.cohort_start_date
    ? formatDate(terms.data.cohort_start_date)
    : null;
  /* Server-derived in `useDecision` (the row's acceptance stamp plus the
     offering's confirmation window), never a client clock — so the date shown
     here and the countdown on the claim page cannot disagree. Null whenever the
     row carries no acceptance stamp, in which case the row simply does not
     render: an absent deadline is stated as absent rather than fabricated. */
  const heldUntilLabel = decision.seatHeldUntil
    ? formatDateTime(decision.seatHeldUntil)
    : null;

  /* What claiming actually does. Step 2 is deliberately narrow: under MEMBER-1 a
     confirmed student enters as a scoped `pre_member` and reads a redacted slice
     of the room, not the whole thing. Promising the full room here would be a
     promise the access boundary does not keep. */
  const claimSteps = [
    {
      title: confirmation !== null ? `You pay ${inr(confirmation)}` : "You confirm the seat",
      body: "The seat comes off the list for this batch and stops being offered to anyone else.",
    },
    {
      title: "The previews open, part way",
      body: "You get a limited view of the room: the masthead, the week ahead, your cohort-mates and the schedule. Session recordings, assignments and mentor feedback stay closed until you are enrolled.",
    },
    {
      title:
        balance !== null ? `You clear the balance of ${inr(balance)}` : "You clear the balance",
      body: "Due before the cohort begins. You can pay it any time between confirming and the first session.",
    },
    {
      title: "You are enrolled",
      body: "Everything opens. Curriculum, recordings, assignments, mentor feedback and the community.",
    },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-8 md:py-12">
        <Link
          to={`/decision/${applicationId}/accepted`}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Back to your acceptance
        </Link>

        <h1 className="mt-4 text-xl font-bold text-foreground md:text-2xl">
          {decision.cohort || "Your cohort"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          What happens when you claim, what it costs, and when it runs.
        </p>

        <section className="mt-8" aria-labelledby="claim-steps-heading">
          <h2 id="claim-steps-heading" className="text-sm font-medium text-foreground">
            What happens when you claim
          </h2>
          <ol className="mt-3 space-y-2">
            {claimSteps.map((step, index) => (
              <li
                key={step.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface p-4"
              >
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 font-mono text-[11px] text-muted-foreground">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-10" aria-labelledby="fees-heading">
          <h2 id="fees-heading" className="text-sm font-medium text-foreground">
            The fee structure
          </h2>
          {/* Only rendered when there is at least one real figure: an empty
              bordered <dl> is a stray 2px rectangle, not a table. */}
          {hasFeeRows && (
            <dl className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {appFee !== null && (
                <div className="flex items-baseline justify-between gap-4 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Application fee, already paid
                  </dt>
                  <dd className="font-mono text-sm text-foreground">{inr(appFee)}</dd>
                </div>
              )}
              {confirmation !== null && (
                <div className="flex items-baseline justify-between gap-4 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Seat confirmation, due now
                  </dt>
                  <dd className="font-mono text-sm text-foreground">{inr(confirmation)}</dd>
                </div>
              )}
              {balance !== null && (
                <div className="flex items-baseline justify-between gap-4 p-4">
                  <dt className="text-sm text-muted-foreground">
                    Balance, before the cohort begins
                  </dt>
                  <dd className="font-mono text-sm text-foreground">{inr(balance)}</dd>
                </div>
              )}
              {total !== null && (
                <div className="flex items-baseline justify-between gap-4 p-4">
                  <dt className="text-sm font-medium text-foreground">
                    Total programme fee
                  </dt>
                  <dd className="font-mono text-sm font-medium text-foreground">
                    {inr(total)}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {/* FEE-1: the application fee is non-refundable, but it IS counted
              towards the programme fee. `create-razorpay-order` subtracts it
              from `price_inr` when it stages the balance, so the three rows
              above add up to the total and a student who adds the application
              fee back on top would over-budget by exactly that amount.

              Gated on the same `hasFeeRows` as the <dl> it describes: without
              the guard the error/all-zero state says "the rows above add up"
              with no rows above it, immediately before the fallback saying the
              figures are somewhere else entirely. The "rows above" clause is
              narrowed further to the case where the application-fee row is
              actually one of them. */}
          {hasFeeRows && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              {appFee !== null
                ? "The application fee you already paid counts towards the total programme fee, so the rows above add up rather than stack on top of each other. It is not refundable on its own: if you do not take a seat, it is not returned."
                : "The application fee you already paid counts towards the total programme fee rather than stacking on top of it. It is not refundable on its own: if you do not take a seat, it is not returned."}
            </p>
          )}
          {!hasFeeRows && (
            <p className="mt-3 text-xs text-muted-foreground">
              The exact figures for this cohort are on your claim page and on the
              checkout screen before you pay anything.
            </p>
          )}
        </section>

        <section className="mt-10" aria-labelledby="schedule-heading">
          <h2 id="schedule-heading" className="text-sm font-medium text-foreground">
            The schedule
          </h2>
          <dl className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
            {heldUntilLabel && (
              <div className="flex items-baseline justify-between gap-4 p-4">
                <dt className="text-sm text-muted-foreground">Seat held until</dt>
                <dd className="font-mono text-sm text-foreground">{heldUntilLabel}</dd>
              </div>
            )}
            {startDate && (
              <div className="flex items-baseline justify-between gap-4 p-4">
                <dt className="text-sm text-muted-foreground">Cohort begins</dt>
                <dd className="font-mono text-sm text-foreground">{startDate}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-4 p-4">
              <dt className="text-sm text-muted-foreground">Balance due</dt>
              <dd className="font-mono text-sm text-foreground">
                Before the first session
              </dd>
            </div>
          </dl>
          {!startDate && (
            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
              Session dates are confirmed with the batch once it fills. You get
              them well before the balance is due.
            </p>
          )}
        </section>

        {/* The lapse, said here too, because this is the page someone reads when
            they are deciding whether to take their time. */}
        <p className="mt-10 rounded-lg border border-border bg-surface p-4 text-xs leading-relaxed text-muted-foreground">
          If your held-seat window closes before you confirm, the seat releases
          for this batch and your acceptance carries to the next one. You would
          not have to apply again.
        </p>

        <Link to={`/decision/${applicationId}/claim`} className="mt-8 block">
          <Button size="lg" className="w-full">
            Claim my seat
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default EnrollmentDetails;
