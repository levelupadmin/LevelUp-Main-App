import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { isIOS } from "@/lib/platform";
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
  { key: "enrolled", label: "Enrolled", expect: "You're in — welcome to the cohort." },
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

const ApplicationStatus = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [application, setApplication] = useState<ApplicationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [unauthorized, setUnauthorized] = useState(false);

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
            {statusLabel(application.status)}
          </Badge>
        </div>

        {/* Rejection reason — neutral surface, no red, to match the
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

        {/* Timeline — monochrome cream */}
        <div className="relative">
          {STEPS.map((step, index) => {
            const state = getStepState(index);
            const isLast = index === STEPS.length - 1;
            const isDone = state === "completed";
            const isCurrent = state === "current";

            return (
              <div key={step.key} className="relative flex gap-4 pb-8">
                {/* Vertical line — cream once the step is done, dim otherwise */}
                {!isLast && (
                  <div
                    className={`absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-16px)] ${
                      isDone ? "bg-[hsl(var(--cream))]" : "bg-border"
                    }`}
                  />
                )}

                {/* Icon — filled cream check (done), pulsing cream ring
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

                  {/* Pay buttons — hidden on iOS per Apple anti-steering
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
