import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Circle,
  XCircle,
  Loader2,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";

/* ── Step definitions ── */
const STEPS = [
  { key: "submitted", label: "Applied" },
  { key: "app_fee_paid", label: "App Fee Paid" },
  { key: "interview_done", label: "Interview" },
  { key: "accepted", label: "Accepted" },
  { key: "confirmation_paid", label: "Confirmation Paid" },
  { key: "balance_paid", label: "Balance Paid" },
  { key: "enrolled", label: "Enrolled" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

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

const STATUS_BADGE_COLORS: Record<string, string> = {
  submitted: "bg-gray-600/20 text-gray-300 border-gray-600/40",
  app_fee_paid: "bg-blue-600/20 text-blue-300 border-blue-600/40",
  interview_scheduled: "bg-amber-600/20 text-amber-300 border-amber-600/40",
  interview_done: "bg-cyan-600/20 text-cyan-300 border-cyan-600/40",
  accepted: "bg-green-600/20 text-green-300 border-green-600/40",
  rejected: "bg-red-600/20 text-red-300 border-red-600/40",
  confirmation_paid: "bg-violet-600/20 text-violet-300 border-violet-600/40",
  balance_paid: "bg-indigo-600/20 text-indigo-300 border-indigo-600/40",
  enrolled: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  withdrawn: "bg-orange-600/20 text-orange-300 border-orange-600/40",
  waitlisted: "bg-yellow-600/20 text-yellow-300 border-yellow-600/40",
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
            className={`text-sm ${STATUS_BADGE_COLORS[application.status] || "bg-gray-600/20 text-gray-300"}`}
          >
            {statusLabel(application.status)}
          </Badge>
        </div>

        {/* Rejection reason */}
        {isRejected && application.rejection_reason && (
          <div className="mb-8 p-4 rounded-lg bg-red-950/30 border border-red-800/40">
            <p className="text-sm font-medium text-red-300 mb-1">
              Rejection Reason
            </p>
            <p className="text-sm text-red-200/80">
              {application.rejection_reason}
            </p>
          </div>
        )}

        {/* Timeline */}
        <div className="relative">
          {STEPS.map((step, index) => {
            const state = getStepState(index);
            const isLast = index === STEPS.length - 1;

            return (
              <div key={step.key} className="relative flex gap-4 pb-8">
                {/* Vertical line */}
                {!isLast && (
                  <div
                    className={`absolute left-[15px] top-[32px] w-0.5 h-[calc(100%-16px)] ${
                      state === "completed"
                        ? "bg-green-500"
                        : state === "failed"
                          ? "bg-red-500"
                          : "bg-border"
                    }`}
                  />
                )}

                {/* Icon */}
                <div className="relative z-10 shrink-0 flex items-center justify-center w-[32px] h-[32px]">
                  {state === "completed" ? (
                    <CheckCircle2 className="h-7 w-7 text-green-500" />
                  ) : state === "current" ? (
                    <div className="relative">
                      <Circle className="h-7 w-7 text-[hsl(var(--accent-amber))]" />
                      <div className="absolute inset-0 h-7 w-7 rounded-full bg-[hsl(var(--accent-amber)/0.3)] animate-pulse" />
                    </div>
                  ) : state === "failed" ? (
                    <XCircle className="h-7 w-7 text-red-500" />
                  ) : (
                    <Circle className="h-7 w-7 text-muted-foreground/40" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 pt-0.5">
                  <p
                    className={`font-medium ${
                      state === "completed"
                        ? "text-green-400"
                        : state === "current"
                          ? "text-[hsl(var(--accent-amber))]"
                          : state === "failed"
                            ? "text-red-400"
                            : "text-muted-foreground/60"
                    }`}
                  >
                    {step.label}
                  </p>

                  {/* Pay Now buttons */}
                  {state === "current" &&
                    step.key === "confirmation_paid" &&
                    application.status === "accepted" && (
                      <Link
                        to={`/checkout/${application.offering_id}?type=confirmation&app=${application.id}`}
                      >
                        <Button size="sm" className="mt-2">
                          Pay Confirmation
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    )}

                  {state === "current" &&
                    step.key === "balance_paid" &&
                    application.status === "confirmation_paid" && (
                      <Link
                        to={`/checkout/${application.offering_id}?type=balance&app=${application.id}`}
                      >
                        <Button size="sm" className="mt-2">
                          Pay Balance
                          <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                      </Link>
                    )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Applied date */}
        <div className="mt-4 pt-4 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Applied on{" "}
            {new Date(application.created_at).toLocaleDateString("en-IN", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </p>
        </div>
      </div>
    </div>
  );
};

export default ApplicationStatus;
