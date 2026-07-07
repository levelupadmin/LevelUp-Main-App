import { useEffect, useRef } from "react";
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
 * any scroll offset. That gate is an IntersectionObserver whose bottom rootMargin
 * must equal THIS bar's rendered footprint, so the in-card Pay counts as "in view"
 * (and the bar cedes) exactly as it reaches the bar's top edge — never a frame
 * where the lit in-card button peeks ABOVE the still-mounted bar. The bar's height
 * is content + env(safe-area-inset-bottom), which varies per device, so a fixed
 * pixel margin is wrong on any device whose safe-area differs from the guess (a
 * hardcoded -96px overshot by the safe-area amount on 0-safe-area viewports —
 * 375/360, desktop, most WebViews — leaving a ~24px band where BOTH CTAs lit at
 * steady state). We therefore MEASURE this bar (`onMeasure`) and feed the real
 * height back to the observer's margin. This component just owns the slide
 * entrance / exit for that handoff — a bounded decelerate tween (NOT a spring).
 * Both legs carry OPACITY as
 * well as y: the bar fades 0→1 as it slides up and 1→0 as it slides down, on the
 * same tokenized tween. This matches the offering page's grammar — there the bar's
 * opacity is scroll-SCRUBBED to 0 before its AnimatePresence exit even runs, so it
 * is already dark by the time it slides away; checkout's gate is a binary
 * IntersectionObserver with no scrub, so the fade has to live on the exit itself.
 * Without it the bar slid out at FULL opacity while the in-card champagne Pay was
 * already lit — two lit CTAs in a ~90px band (litInView=2). The opacity leg holds
 * the handoff to a single lit pay action at every offset.
 *
 * The fill is a solid near-black (bg-surface; --surface = 0 0% 4%, fully opaque —
 * NO /[0.97] alpha, NO backdrop-filter): the earlier 3% alpha gap let the in-card
 * Pay label ghost through the bar. On the pure-black canvas an opaque near-black
 * surface is visually indistinguishable from a blurred one, and dropping
 * backdrop-blur removes the per-frame re-sampling Blink does whenever a blurred
 * layer's transform moves (the #1 dark-app jank source per DESIGN-STRATEGY). The
 * tween is still preferred over a spring so the slide ends cleanly with no
 * sub-pixel settling tail; it collapses to an instant cut under reduced motion.
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
  /**
   * Reports the bar's rendered footprint (content + safe-area) in px whenever it
   * mounts or resizes. The parent feeds this to the sticky→inline handoff gate's
   * bottom rootMargin so the in-card Pay cedes exactly at the bar's top edge —
   * see the class doc. Only non-zero heights are reported (the bar is lg:hidden
   * on desktop, where a 0 measure would collapse the gate margin).
   */
  onMeasure?: (height: number) => void;
}

export default function StickyPayBar({
  total,
  savings,
  stagedLabel,
  paying,
  disabled,
  onPay,
  onMeasure,
}: StickyPayBarProps) {
  const ms = useMotionSafe();
  const barRef = useRef<HTMLDivElement | null>(null);

  // Measure the bar's live footprint (content + env(safe-area-inset-bottom)) and
  // report it up so the handoff gate's rootMargin tracks the real height on every
  // device. A translateY entrance/exit doesn't change layout height, so this
  // fires once on mount and thereafter only on genuine resizes (orientation,
  // safe-area, dynamic content). Skip 0-height measures (bar hidden at lg+).
  useEffect(() => {
    const el = barRef.current;
    if (!el || !onMeasure) return;
    const report = () => {
      const h = el.getBoundingClientRect().height;
      if (h > 0) onMeasure(h);
    };
    report();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMeasure]);

  return (
    <motion.div
      ref={barRef}
      initial={{ y: 96, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 96, opacity: 0 }}
      transition={
        ms.reduced ? { duration: 0 } : { duration: durations.slow, ease: easings.out }
      }
      className="lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface pb-safe"
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
