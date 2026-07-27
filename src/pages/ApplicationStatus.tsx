import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isIOS } from "@/lib/platform";
import { useFunnelStage } from "@/hooks/useFunnelStage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Check,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

/* ── Step definitions ──
   Each step carries a one-line expectation so the student knows what happens
   next at that stage (item 36). */
const STEPS = [
  { key: "submitted", label: "Applied", expect: "We've received your application." },
  { key: "app_fee_paid", label: "App Fee Paid", expect: "Pay the application fee to unlock your interview." },
  { key: "interview_done", label: "Interview", expect: "A mentor reviews your work in a short interview." },
  { key: "accepted", label: "Accepted", expect: "We let you know if you've earned a seat." },
  { key: "confirmation_paid", label: "Confirmation Paid", expect: "Confirm your seat with the booking amount." },
  { key: "balance_paid", label: "Balance Paid", expect: "Clear the remaining fee before the cohort starts." },
  { key: "enrolled", label: "Enrolled", expect: "You're in. Welcome to the cohort." },
] as const;

/* Which step index each status maps to (the highest completed step) */
const STATUS_TO_STEP: Record<string, number> = {
  submitted: 0,
  app_fee_paid: 1,
  interview_scheduled: 2,
  interview_done: 2,
  accepted: 3,
  confirmation_paid: 4,
  balance_paid: 5,
  enrolled: 6,
  rejected: -1,
  withdrawn: -1,
  waitlisted: -1,
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

interface ApplicationData {
  id: string;
  user_id: string;
  offering_id: string;
  status: string;
  created_at: string;
  rejection_reason: string | null;
  offerings: {
    title: string;
    price_inr: number | null;
    app_fee_inr: number | null;
    confirmation_amount_inr: number | null;
  } | null;
}

/* ── Reconciled funnel stage → home chip + single CTA (RC-T4) ──
   Consumed ONLY under `VITE_FUNNEL_RECON`, from the useFunnelStage/edge-fn
   payload — never off the `reconciled_*` mirror columns. Maps the reconciler's
   derived §6 stage to the label chip + one next-action CTA. Keys are the exact
   kebab strings of the `Stage` union in `supabase/functions/_shared/reconcile.ts`
   (the reconciler's `deriveStage` output) — the single source of the stage
   vocabulary. Stages that open no action here (`"unknown"` orphan, and
   `"accepted"`, which fires its own experience in a later phase) are left
   unmapped, so the surface falls back to the status-driven view below — the
   same degrade path as an unreachable fn.
   Payment CTAs reuse the existing checkout routes and stay hidden on iOS
   (Apple anti-steering), mirroring the staged-payment guard below. */
type ReconciledCta = { to: string; label: string; payment?: boolean };
const RECONCILED_STAGE_UI: Record<
  string,
  { chip: string; cta?: (app: ApplicationData) => ReconciledCta }
> = {
  partial: { chip: "Application started" },
  "completed-no-fee": {
    chip: "Application fee due",
    cta: (app) => ({
      to: `/checkout/${app.offering_id}?type=app_fee&app=${app.id}`,
      label: "Pay application fee",
      payment: true,
    }),
  },
  "fee-paid-no-interview": { chip: "Book your interview" },
  "interview-scheduled": { chip: "Interview scheduled" },
  "awaiting-decision": { chip: "Awaiting decision" },
  "confirm-paid-no-balance": {
    chip: "Balance due",
    cta: (app) => ({
      to: `/checkout/${app.offering_id}?type=balance&app=${app.id}`,
      label: "Pay balance",
      payment: true,
    }),
  },
  enrolled: { chip: "Enrolled" },
};

/* ── v1: reconciler drives NON-MONEY stages only ──
   Rahul RULED (2026-07-22, cohort-rc-v1-scope V1-1): disable reconciler payment
   CTAs in v1 — the reconciler's payment-CTA attribution from shared external
   amounts is structurally fragile (P1 null-floor, P2/P3 shared-amount wrong-
   cohort). MONEY_STAGES are the reconciled stages whose RECONCILED_STAGE_UI CTA
   carries `payment: true` (`completed-no-fee` → "Pay application fee",
   `confirm-paid-no-balance` → "Pay balance"). For these the client SUPPRESSES the
   entire reconciled override: the badge falls back to `statusLabel` and no
   reconciled CTA renders, so no reconciler-driven payment CTA can surface in v1.
   The status-driven timeline below still owns the staged payment CTAs. Money CTAs
   re-enable as a fast-follow once Phase-2 staged payments populate `payment_orders`
   for offering-exact, first-party attribution. Keep in sync with RECONCILED_STAGE_UI. */
const MONEY_STAGES = new Set<string>([
  "completed-no-fee",
  "confirm-paid-no-balance",
]);

/* Each reconciled stage's position on the STEPS ladder (the highest step it
   implies), used as a FLOOR against the application's own status. The reconciler
   is allowed to run AHEAD of `cohort_applications.status` (its whole purpose:
   surface an external signal the app hasn't mirrored yet), but it must never
   render BEHIND a positive local status — a derived `confirm-paid-no-balance`
   on an already-`enrolled` row would otherwise stamp a stale 'Pay balance' CTA
   on a paid student. Keys mirror RECONCILED_STAGE_UI exactly; keep them in sync. */
const RECONCILED_STAGE_STEP: Record<string, number> = {
  partial: 0,
  "completed-no-fee": 0,
  "fee-paid-no-interview": 1,
  "interview-scheduled": 2,
  "awaiting-decision": 2,
  "confirm-paid-no-balance": 4,
  enrolled: 6,
};

const ApplicationStatus = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

  // Reconciler read (dark behind VITE_FUNNEL_RECON). Flag off → `undefined`, so
  // every reconciled branch below is inert and the page renders byte-identically.
  // Scoped to THIS application's offering so the derived chip/CTA reflect this
  // offering only (no global-stage contamination); `offering_id` is undefined
  // while the application loads, which keeps the query disabled until it lands.
  const reconciled = useFunnelStage(user?.id, application?.offering_id).data;

  useEffect(() => {
    if (!applicationId || !user?.id) return;

    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("cohort_applications")
        .select(
          "*, offerings(title, price_inr, app_fee_inr, confirmation_amount_inr)"
        )
        .eq("id", applicationId)
        .single();

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Auth guard: only the owning user can view
      if (data.user_id !== user.id) {
        setUnauthorized(true);
        setLoading(false);
        return;
      }

      setApplication(data);
      setLoading(false);
    })();
  }, [applicationId, user?.id]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            Unauthorized
          </p>
          <p className="text-muted-foreground mb-4">
            You don't have permission to view this application.
          </p>
          <Button variant="outline" onClick={() => navigate("/home")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="text-center">
          <p className="text-lg font-semibold text-foreground mb-2">
            Application Not Found
          </p>
          <p className="text-muted-foreground mb-4">
            We couldn't find this application.
          </p>
          <Button variant="outline" onClick={() => navigate("/home")}>
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const isRejected = application.status === "rejected";
  const isWithdrawn = application.status === "withdrawn";
  const isFailed = isRejected || isWithdrawn;
  const currentStepIndex = STATUS_TO_STEP[application.status] ?? -1;

  /* Reconciled chip + single CTA — present only when the flag is on AND the
     derived stage maps to a known row. Two floors keep a POSITIVE derived stage
     from contaminating a row it shouldn't touch, because `deriveStage`'s Stage
     union has no rejected/withdrawn/waitlisted state and never reads
     `cohort_applications.status`:
       1. Non-progressing statuses (rejected, withdrawn, waitlisted — every status
          STATUS_TO_STEP maps to -1) suppress it entirely: a failed/held application
          whose offering still carries a captured payment in the externals would
          otherwise stamp a progress chip over its badge and route a payment CTA at
          a dead/un-accepted application (`currentStepIndex >= 0` gate).
       2. The derived stage must sit AT or AHEAD of the local status on the STEPS
          ladder. Running ahead is intended (reconciler surfaces an un-mirrored
          external signal); running BEHIND (e.g. `confirm-paid-no-balance` derived
          for an already-`enrolled` row) would show a stale 'Pay balance' CTA to a
          paid student, so it falls back to the status-driven UI instead.
     Flag off → `reconciled?.stage` is undefined → both floors are inert and this
     is byte-identical to the status-driven view below. */
  const reconciledStage = reconciled?.stage;
  const reconciledStep =
    reconciledStage != null ? RECONCILED_STAGE_STEP[reconciledStage] : undefined;
  const reconciledUiCandidate =
    currentStepIndex >= 0 &&
    reconciledStage &&
    reconciledStep !== undefined &&
    reconciledStep >= currentStepIndex
      ? RECONCILED_STAGE_UI[reconciledStage]
      : undefined;
  /* v1 money-stage suppression (V1-1). When the reconciled stage is money-
     bearing — in MONEY_STAGES OR its candidate CTA carries `payment: true` —
     suppress the ENTIRE reconciled override: `reconciledUi` goes undefined, so
     the badge falls back to `statusLabel(application.status)` and no reconciled
     CTA is computed. NON-money stages (partial, fee-paid-no-interview,
     interview-scheduled, awaiting-decision, enrolled) still let the reconciler
     drive chip + CTA exactly as before. The `payment: true` check makes this
     robust even if a new money CTA is added to RECONCILED_STAGE_UI without being
     listed in MONEY_STAGES. Flag off → `reconciledStage` is undefined → not money
     → inert, byte-identical to the status-driven view. */
  const reconciledIsMoney =
    !!reconciledStage &&
    (MONEY_STAGES.has(reconciledStage) ||
      reconciledUiCandidate?.cta?.(application)?.payment === true);
  const reconciledUi = reconciledIsMoney ? undefined : reconciledUiCandidate;
  /* Ambiguous money — withhold the CTA, keep the chip. When the reconciler
     can't pin a shared-tier amount to exactly one offering it flags
     `ambiguous`; we then render chip-only (information) and suppress any
     money CTA, degrading to the status-driven timeline below, which owns
     payments. In v1 this is a strict SUBSET of the money-stage suppression
     above (all money stages are already suppressed regardless of `ambiguous`),
     so it never fires today — kept intact and ready for the fast-follow
     re-enable. Flag off → `reconciled` is undefined → `ambiguous` is falsy →
     this is inert and byte-identical to the pre-reconciler CTA. */
  const reconciledCtaCandidate = reconciledUi?.cta?.(application);
  const reconciledCta =
    reconciledCtaCandidate?.payment && reconciled?.ambiguous
      ? undefined
      : reconciledCtaCandidate;

  /* Determine which step was "failed" at, for rejected/withdrawn */
  // For rejected, show failure at the step after the last completed step
  const failedAtIndex = isFailed
    ? Math.max(currentStepIndex + 1, 1)
    : -1;

  const getStepState = (
    index: number
  ): "completed" | "current" | "upcoming" | "failed" => {
    if (isFailed && index === failedAtIndex) return "failed";
    if (isFailed && index < failedAtIndex) return "completed";
    if (isFailed && index > failedAtIndex) return "upcoming";

    if (index < currentStepIndex) return "completed";
    if (index === currentStepIndex) return "current";
    return "upcoming";
  };

  /* ── Progress summary (item 36) ──
     "Step N of M" + a thin cream progress bar. We count the active step as the
     current one (1-based); failed applications show how far they reached. */
  const totalSteps = STEPS.length;
  const stepNumber = isFailed
    ? Math.max(failedAtIndex, 1)
    : Math.min(currentStepIndex + 1, totalSteps);
  const progressPct = Math.round(
    ((isFailed ? failedAtIndex : currentStepIndex + 1) / totalSteps) * 100
  );

  /* The first step's date is the real application date; later steps are
     forward-looking, so we show "Applied <date>" only on step 0 and a soft
     "Pending" hint on the active step. */
  const appliedDate = new Date(application.created_at).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-canvas">
      {/* Header */}
      <header className="sticky top-0 z-40 h-16 flex items-center px-4 md:px-8 border-b border-border bg-canvas/90 backdrop-blur-lg">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/home")}
          className="mr-3"
        >
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">Application Status</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 md:px-8 py-8 md:py-12">
        {/* Offering title + status badge */}
        <div className="mb-8">
          <h2 className="text-xl md:text-2xl font-bold text-foreground mb-2">
            {application.offerings?.title || "Application"}
          </h2>
          <Badge
            variant="outline"
            className="text-sm border-[hsl(var(--cream))]/30 bg-[hsl(var(--cream))]/10 text-[hsl(var(--cream))]"
          >
            {reconciledUi?.chip ?? statusLabel(application.status)}
          </Badge>

          {/* Single reconciled CTA (dark behind the flag). Payment CTAs stay
              hidden on iOS per Apple anti-steering — same rule as the staged
              timeline guard, kept as its own branch here. */}
          {reconciledCta &&
            (reconciledCta.payment && isIOS() ? (
              <p className="mt-4 text-xs text-muted-foreground">
                Complete this step from a web browser.
              </p>
            ) : (
              <div className="mt-4">
                <Link to={reconciledCta.to}>
                  <Button size="sm">
                    {reconciledCta.label}
                    <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </Link>
              </div>
            ))}
        </div>

        {/* Rejection reason: neutral surface, no red, to match the
            monochrome timeline. The reason text is still surfaced. */}
        {isRejected && application.rejection_reason && (
          <div className="mb-8 p-4 rounded-lg bg-surface border border-border">
            <p className="text-sm font-medium text-foreground mb-1">
              Decision note
            </p>
            <p className="text-sm text-muted-foreground">
              {application.rejection_reason}
            </p>
          </div>
        )}

        {/* Step summary + thin cream progress bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-foreground">
              Step {stepNumber} of {totalSteps}
            </p>
            <p className="text-xs font-mono text-muted-foreground">{progressPct}%</p>
          </div>
          <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-[hsl(var(--cream))] transition-[width] duration-500 ease-out"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Timeline: monochrome cream */}
        <div className="relative">
          {STEPS.map((step, index) => {
            const state = getStepState(index);
            const isLast = index === STEPS.length - 1;
            const isDone = state === "completed";
            const isCurrent = state === "current";

            return (
              <div key={step.key} className="relative flex gap-4 pb-8">
                {/* Vertical line: cream once the step is done, dim otherwise */}
                {!isLast && (
                  <div
                    className={`absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-16px)] ${
                      isDone ? "bg-[hsl(var(--cream))]" : "bg-border"
                    }`}
                  />
                )}

                {/* Icon: filled cream check (done), pulsing cream ring
                    (current), dim ring (future / not reached) */}
                <div className="relative z-10 shrink-0 flex items-center justify-center w-[32px] h-[32px]">
                  {isDone ? (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(var(--cream))]">
                      <Check className="h-4 w-4 text-[hsl(var(--cream-text))]" strokeWidth={3} />
                    </div>
                  ) : isCurrent ? (
                    <div className="relative flex h-7 w-7 items-center justify-center">
                      <div className="absolute inset-0 rounded-full bg-[hsl(var(--cream))]/25 animate-pulse" />
                      <div className="h-7 w-7 rounded-full border-2 border-[hsl(var(--cream))] bg-canvas" />
                      <div className="absolute h-2 w-2 rounded-full bg-[hsl(var(--cream))]" />
                    </div>
                  ) : (
                    <div className="h-7 w-7 rounded-full border-2 border-border bg-canvas" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <p
                    className={`font-medium ${
                      isDone
                        ? "text-foreground"
                        : isCurrent
                          ? "text-[hsl(var(--cream))]"
                          : "text-muted-foreground/60"
                    }`}
                  >
                    {step.label}
                  </p>

                  {/* Date + one-line expectation copy per step */}
                  <p className="mt-0.5 text-xs text-muted-foreground/80">
                    {step.expect}
                  </p>
                  {index === 0 && (
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground/60">
                      Applied {appliedDate}
                    </p>
                  )}
                  {isCurrent && index !== 0 && (
                    <p className="mt-0.5 font-mono text-[11px] text-[hsl(var(--cream))]/70">
                      In progress
                    </p>
                  )}

                  {/* Pay buttons: hidden on iOS per Apple anti-steering
                      (no in-app purchase entry points or external-pay links).
                      Web + Android keep the existing checkout flow. */}
                  {state === "current" &&
                    step.key === "confirmation_paid" &&
                    application.status === "accepted" &&
                    (isIOS() ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Complete this step from a web browser.
                      </p>
                    ) : (
                      <Link
                        to={`/checkout/${application.offering_id}?type=confirmation&app=${application.id}`}
                      >
                        <Button size="sm" className="mt-2">
                          Pay Confirmation
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    ))}

                  {state === "current" &&
                    step.key === "balance_paid" &&
                    application.status === "confirmation_paid" &&
                    (isIOS() ? (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Complete this step from a web browser.
                      </p>
                    ) : (
                      <Link
                        to={`/checkout/${application.offering_id}?type=balance&app=${application.id}`}
                      >
                        <Button size="sm" className="mt-2">
                          Pay Balance
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default ApplicationStatus;
