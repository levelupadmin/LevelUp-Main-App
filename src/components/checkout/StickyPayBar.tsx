import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import PayButtonContent from "@/components/checkout/PayButtonContent";
import { durations, easings, useMotionSafe } from "@/lib/motion";

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
 * rendered on native: the parent CheckoutPage already swaps the whole pay UI
 * for a Continue-on-web card on Capacitor (Apple/Play reader-rule gating), so
 * this component is only ever mounted on web.
 *
 * The parent gates mounting on the in-card Pay button's visibility (mirrors the
 * offering page's sticky→inline handoff) so exactly ONE champagne CTA is lit at
 * any scroll offset. This component just owns the slide-up entrance / slide-down
 * exit for that handoff — a bounded decelerate tween (NOT a spring): the bar
 * carries a backdrop-blur, which Blink re-samples every frame the transform
 * moves, so a spring's sub-pixel settling tail would keep the compositor
 * re-blurring (the #1 dark-app jank source per DESIGN-STRATEGY). A tween ends
 * cleanly with no tail; it collapses to an instant cut under reduced motion.
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
  const ms = useMotionSafe();
  return (
    <motion.div
      initial={{ y: 96 }}
      animate={{ y: 0 }}
      exit={{ y: 96 }}
      transition={
        ms.reduced ? { duration: 0 } : { duration: durations.slow, ease: easings.out }
      }
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md pb-safe"
    >
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
          variant="champagne"
          size="lg"
          className="h-12 shrink-0 px-6"
          onClick={onPay}
          // onPay (CheckoutPage.handlePay) fires a deliberate hapticImpact("medium")
          // for the money moment; suppress the Button's default tapTick so the pay
          // tap doesn't double-buzz. Mirrors the primary Pay button.
          haptic={false}
          disabled={disabled || paying}
          // STEAL #2 processing arc: mirror `paying` to aria-busy (the label
          // crossfades to a quiet dot visually). Additive to disabled semantics.
          aria-busy={paying}
        >
          {/* Same CRED-style content layer as the in-card Pay button, so the two
              mirrored champagne CTAs read identically in flight. Driven off the
              existing `paying` flag — no change to handlePay. */}
          <PayButtonContent
            status={paying ? "processing" : "idle"}
            label={total <= 0 ? "Enrol free" : `Pay ₹${total.toLocaleString("en-IN")}`}
          />
        </Button>
      </div>
    </motion.div>
  );
}
