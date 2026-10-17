import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { masterclassRefundSentence, watchRuleApplies } from "@shared/refundPolicy";

interface GuaranteeBadgeProps {
  days: number | null | undefined;
  /** offerings.product_tier. Masterclasses state the watch rule; see below. */
  productTier?: string | null;
  className?: string;
}

/**
 * The refund line beside a buy button. Driven by offering.refund_policy_days;
 * renders nothing when the policy is absent or zero so we never promise a
 * refund that doesn't exist.
 *
 * Masterclasses state the one rule the marketing site states, word for word
 * (@shared/refundPolicy): full refund within 7 days of buying if less than a
 * quarter has been watched, with a link to the policy. An unconditional
 * "money-back guarantee" promised more than the written policy gives.
 *
 * Other tiers (live programmes, workshops, their resource bundles) keep the
 * short pill: their terms differ and are set out on /refunds.
 */
export default function GuaranteeBadge({ days, productTier, className }: GuaranteeBadgeProps) {
  const n = Number(days ?? 0);
  if (n <= 0) return null;

  if (watchRuleApplies(productTier)) {
    return (
      <p
        className={cn(
          "flex items-start gap-2 rounded-xl border border-[hsl(var(--accent-emerald)/0.4)] bg-[hsl(var(--accent-emerald)/0.10)] px-3 py-2 text-left text-xs leading-relaxed text-foreground",
          className,
        )}
      >
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--accent-emerald))]" aria-hidden />
        <span>
          {masterclassRefundSentence(n)}{" "}
          <Link
            to="/refunds#masterclasses"
            className="whitespace-nowrap font-medium text-[hsl(var(--accent-emerald))] underline underline-offset-2"
          >
            Refund policy
          </Link>
        </span>
      </p>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-[hsl(var(--accent-emerald)/0.4)] bg-[hsl(var(--accent-emerald)/0.10)] px-3 py-1 text-xs font-medium text-[hsl(var(--accent-emerald))]",
        className,
      )}
    >
      <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0" />
      {n}-day money-back guarantee
    </span>
  );
}
