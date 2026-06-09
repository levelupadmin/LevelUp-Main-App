import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface GuaranteeBadgeProps {
  days: number | null | undefined;
  className?: string;
}

/**
 * "{n}-day money-back guarantee" pill. Driven by offering.refund_policy_days;
 * renders nothing when the policy is absent or zero so we never promise a
 * guarantee that doesn't exist.
 */
export default function GuaranteeBadge({ days, className }: GuaranteeBadgeProps) {
  const n = Number(days ?? 0);
  if (n <= 0) return null;
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
