import { AlertCircle, CheckCircle2, Info, Loader2, MessageCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { useMotionSafe } from "@/lib/motion";
import { supportWhatsAppLink } from "@/lib/support";
import { cn } from "@/lib/utils";

/**
 * What went wrong with the last Pay attempt, and the one next step for it.
 * Shown inline under the Pay button instead of a toast that vanishes: a buyer
 * who closed the payment sheet, had a card declined or hit a verification
 * hiccup needs to know what to tap next.
 *
 * The copy never says that no money moved: a UPI payment can finish in the
 * UPI app after the sheet has closed, and the page cannot know that. Where
 * money may have moved, the notice offers "Check payment status" and the
 * checkout keeps Pay locked (see `paymentLocked` in lib/checkoutOpenOrder).
 */
export type PaymentIssue =
  | { kind: "dismissed" }
  | { kind: "failed"; detail?: string | null }
  | { kind: "order_error"; message: string }
  | { kind: "rate_limited" }
  | { kind: "already_enrolled"; guest: boolean }
  | { kind: "identity_mismatch"; message: string }
  | { kind: "verify_pending"; message?: string | null }
  /** A status check could not clear the last order. `locked`: Pay is off meanwhile. */
  | { kind: "check_needed"; reason: "pending" | "unknown"; locked: boolean }
  | { kind: "no_payment_found" }
  | { kind: "script_missing" };

/** Notices that offer "Check payment status" (when the checkout has an order to check). */
function offersStatusCheck(issue: PaymentIssue): boolean {
  return issue.kind === "verify_pending" || issue.kind === "check_needed" || issue.kind === "dismissed";
}

type Props = {
  issue: PaymentIssue | null;
  courseTitle: string;
  onOpenCourse: () => void;
  onSignIn: () => void;
  /** Ask again whether the last order was paid. Omitted when there is no order to check. */
  onCheckStatus?: () => void;
  checking?: boolean;
};

function copyFor(issue: PaymentIssue): { tone: "info" | "error" | "ok"; title: string; body: string } {
  switch (issue.kind) {
    case "dismissed":
      return {
        tone: "info",
        title: "Payment not finished",
        body: "If you paid in your UPI or bank app, tap Check payment status first. If not, tap Pay to try again.",
      };
    case "failed":
      return {
        tone: "error",
        title: "The payment didn't go through",
        body: `${issue.detail ? `${issue.detail.replace(/\.?$/, ".")} ` : ""}If money left your account, your bank returns it automatically. Try again, or pick another method.`,
      };
    case "order_error":
      return { tone: "error", title: "We couldn't start the payment", body: issue.message };
    case "rate_limited":
      return {
        tone: "error",
        title: "Too many tries in a short time",
        body: "Wait a few minutes, then tap Pay again.",
      };
    case "already_enrolled":
      return {
        tone: "ok",
        title: "You already own this course",
        body: issue.guest
          ? "It's on the account for this phone number. Sign in with a one-time code to watch. No need to pay again."
          : "It's in your library. No need to pay again.",
      };
    case "identity_mismatch":
      return {
        tone: "info",
        title: "This email or phone is on another account",
        body: `${issue.message.replace(/\.?$/, ".")} Sign in to buy on your account, or use a different email.`,
      };
    case "verify_pending":
      return {
        tone: "info",
        title: "Payment received. Confirming it now",
        body:
          issue.message ||
          "Your course unlocks within a few minutes and we'll email you. Please don't pay again.",
      };
    case "check_needed":
      return issue.reason === "pending"
        ? {
            tone: "info",
            title: "Your last payment is still open",
            body: `If you're paying in your UPI or bank app, finish there, then tap Check payment status.${
              issue.locked ? " Pay comes back once that payment finishes or lapses." : ""
            }`,
          }
        : {
            tone: "info",
            title: "We couldn't check your last payment",
            body: "If you paid in your UPI or bank app, please don't pay again. Tap Check payment status in a moment, or message us on WhatsApp.",
          };
    case "no_payment_found":
      return {
        tone: "info",
        title: "No payment found",
        body: "Your last attempt has no completed payment. Tap Pay to try again.",
      };
    case "script_missing":
      return {
        tone: "error",
        title: "The payment screen didn't load",
        body: "Check your connection, then tap Pay again. If you're in the Instagram or Facebook app, opening this page in your browser can help.",
      };
  }
}

export default function PaymentNotice({ issue, courseTitle, onOpenCourse, onSignIn, onCheckStatus, checking = false }: Props) {
  const { springs } = useMotionSafe();
  return (
    <AnimatePresence initial={false} mode="wait">
      {issue && (
        <motion.div
          key={issue.kind}
          role={issue.kind === "dismissed" || issue.kind === "no_payment_found" ? "status" : "alert"}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={springs.glide}
          className={cn(
            "rounded-xl border px-4 py-3 text-left space-y-2",
            copyFor(issue).tone === "error" && "border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.10)]",
            copyFor(issue).tone === "info" && "border-border bg-surface-2",
            copyFor(issue).tone === "ok" && "border-[hsl(var(--accent-emerald)/0.4)] bg-[hsl(var(--accent-emerald)/0.08)]",
          )}
        >
          {(() => {
            const c = copyFor(issue);
            const Icon = c.tone === "error" ? AlertCircle : c.tone === "ok" ? CheckCircle2 : Info;
            return (
              <>
                <div className="flex items-start gap-2.5">
                  <Icon
                    className={cn(
                      "h-4 w-4 mt-0.5 shrink-0",
                      c.tone === "error" && "text-[hsl(var(--destructive-text))]",
                      c.tone === "info" && "text-[hsl(var(--cream))]",
                      c.tone === "ok" && "text-[hsl(var(--accent-emerald))]",
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-semibold text-foreground">{c.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{c.body}</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-6">
                  {issue.kind === "already_enrolled" && (
                    <Button size="sm" variant="champagne" className="h-11" onClick={issue.guest ? onSignIn : onOpenCourse}>
                      {issue.guest ? "Sign in to watch" : "Open your course"}
                    </Button>
                  )}
                  {issue.kind === "identity_mismatch" && (
                    <Button size="sm" variant="outline" className="h-11" onClick={onSignIn}>
                      Sign in instead
                    </Button>
                  )}
                  {onCheckStatus && offersStatusCheck(issue) && (
                    <Button
                      size="sm"
                      variant={issue.kind === "dismissed" ? "outline" : "champagne"}
                      className="h-11"
                      onClick={onCheckStatus}
                      disabled={checking}
                      aria-busy={checking}
                    >
                      {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                      {checking ? "Checking" : "Check payment status"}
                    </Button>
                  )}
                  <a
                    href={supportWhatsAppLink(
                      issue.kind === "verify_pending" || issue.kind === "check_needed" ||
                        issue.kind === "failed" || issue.kind === "dismissed"
                        ? `Hi! I paid (or tried to pay) for ${courseTitle} and need help with access.`
                        : `Hi! I need help buying ${courseTitle}.`,
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-1 text-xs font-medium text-[hsl(var(--cream))] hover:underline"
                  >
                    <MessageCircle className="h-3.5 w-3.5" aria-hidden />
                    WhatsApp us
                  </a>
                </div>
              </>
            );
          })()}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
