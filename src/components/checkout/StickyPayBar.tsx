import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Mobile-only sticky pay bar for the checkout page.
 *
 * The order summary + pay button live deep in a scrollable card; on a phone
 * the buyer has to scroll back down to commit. This bar pins the live total
 * and a one-tap "Pay" to the bottom of the viewport so the decision is always
 * one thumb-reach away. It mirrors the in-card button's state (label, disabled,
 * processing) so the two never drift.
 *
 * Hidden on lg+ (the desktop layout keeps the pay button in view) and never
 * rendered on native — the parent CheckoutPage already swaps the whole pay UI
 * for a Continue-on-web card on Capacitor (Apple/Play reader-rule gating), so
 * this component is only ever mounted on web.
 */
interface StickyPayBarProps {
  /** Final amount to charge, in INR. */
  total: number;
  /** Combined MRP + coupon savings in INR; renders a chip when > 0. */
  savings: number;
  /** Optional stage label for staged payments (e.g. "Application Fee"). */
  stagedLabel?: string;
  paying: boolean;
  disabled: boolean;
  onPay: () => void;
}

export default function StickyPayBar({
  total,
  savings,
  stagedLabel,
  paying,
  disabled,
  onPay,
}: StickyPayBarProps) {
  return (
    <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md pb-safe">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-lg font-semibold text-foreground leading-none">
              ₹{total.toLocaleString("en-IN")}
            </span>
            {savings > 0 && (
              <span className="inline-flex items-center rounded-full bg-[hsl(var(--accent-emerald)/0.15)] px-2 py-0.5 text-[11px] font-medium text-[hsl(var(--accent-emerald))]">
                Save ₹{savings.toLocaleString("en-IN")}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground truncate">
            {stagedLabel ? stagedLabel : "Total payable"}
          </p>
        </div>
        <Button
          size="lg"
          className="h-12 shrink-0 px-6"
          onClick={onPay}
          disabled={disabled || paying}
        >
          {paying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Processing…
            </>
          ) : (
            `Pay ₹${total.toLocaleString("en-IN")}`
          )}
        </Button>
      </div>
    </div>
  );
}
