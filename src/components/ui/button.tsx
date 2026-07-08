import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, type HTMLMotionProps } from "framer-motion";

import { useFinePointer, useMotionSafe } from "@/lib/motion";
import { tapTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // ⚠️ CLOBBER CLASS — keep this `transition-colors`, NEVER `transition-all`.
  // The motion path (motion.button below) owns the inline `transform` via framer's
  // per-frame `whileTap`/`whileHover` writes. A `transition-*` that includes
  // `transform` (i.e. `transition-all`) makes CSS retarget every one of those
  // per-frame writes, smearing the snap-spring press into ~200ms of mush on every
  // non-asChild Button and double-costing the compositor on mid-range Android.
  // shadcn's own base is `transition-colors` for exactly this reason: transition
  // only the paint props (bg/border/text on hover), never transform/opacity that
  // framer drives. Do NOT reintroduce `transition-all` here.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] text-sm font-medium transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 shadow-design-sm",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-design-sm",
        outline: "border border-input bg-transparent hover:bg-accent/10 hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        // The champagne pay moment — the redesign's primary money-path CTA. Mirrors
        // the `.btn-champagne` treatment (index.css:310) as cva classes: vertical
        // champagne gradient, warm-dark cream text, soft inner highlight + warm glow.
        // Hover brightness is explicitly wrapped in `[@media(hover:hover)]` — Tailwind's
        // bare `hover:` is NOT pointer-gated in this project (no `hoverOnlyWhenSupported`
        // in tailwind.config.ts, so `hover:` compiles to a plain `&:hover`), and an
        // ungated hover would leave brightness(1.04) stuck on the primary Pay CTA after
        // a touch tap on both shipping mobile WebViews. This mirrors `.btn-champagne`'s
        // own `@media (hover: hover)` gate (index.css:317). Deliberately NO
        // `:active`/whileTap transform here — framer's inline whileTap owns the press on
        // the motion path (index.css:320 doctrine); a transform in this class would be a
        // competing owner. Disabled desaturates + dims, but the champagne-specific floor
        // (saturate-75 + opacity-70, lifted above the base disabled:opacity-50) lives in
        // the compoundVariants block below so it emits AFTER the base and wins twMerge
        // — never gray-swaps.
        champagne:
          "bg-[linear-gradient(180deg,hsl(var(--champagne-from)),hsl(var(--champagne-to)))] text-[hsl(var(--cream-text))] font-medium rounded-2xl shadow-[inset_0_1px_0_hsl(0_0%_100%/0.35),0_10px_28px_hsl(var(--champagne-to)/0.18)] [@media(hover:hover)]:hover:brightness-[1.04]",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 rounded-[10px] px-3 text-xs",
        lg: "h-12 rounded-[12px] px-8 text-base",
        xl: "h-14 rounded-[14px] px-10 text-base font-semibold",
        icon: "h-10 w-10",
      },
    },
    // cva emits classes in this order: base → variant → size → compoundVariants →
    // caller className. So every sized champagne CTA would otherwise take the size's
    // radius/weight (lg/xl set `rounded-[12px|14px]`, xl sets `font-semibold`) and
    // twMerge — keeping the LAST of each conflicting utility — would strip the
    // champagne variant's own `rounded-2xl` + `font-medium`. This compound re-asserts
    // both AFTER the size classes so the money CTA renders at the spec'd 16px radius
    // and medium weight on every size (matching `.btn-champagne`), while a caller's
    // className (emitted last) can still override intentionally.
    //
    // It also carries the champagne disabled floor. The base sets `disabled:opacity-50`,
    // and stacking that with a `disabled:saturate-50` over the pure-black canvas flattened
    // the in-flight Pay beat (`disabled={paying}`) to a warm-gray that killed the gold
    // identity. Emitting `disabled:saturate-[.75] disabled:opacity-70` HERE (after the
    // base) lets twMerge — last-wins per conflict group — lift both the saturation and the
    // opacity floor for champagne ONLY, so the CTA still registers as gold while clearly
    // disabled. No other variant is touched (base opacity-50 still applies to them).
    compoundVariants: [
      {
        variant: "champagne",
        class: "rounded-2xl font-medium disabled:saturate-[.75] disabled:opacity-70",
      },
    ],
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /**
   * Whether this button fires its own `tapTick()` selection haptic on activation
   * (default `true`). Set `false` when the caller's `onClick` already fires a
   * deliberate, distinct haptic on the same gesture (e.g. a heavier confirm on a
   * money moment), so the tap doesn't double-buzz. Mirrors MotionButton's opt-out.
   */
  haptic?: boolean;
}

// Tailwind's `-translate-y-*` scale in px, for the hover-lift utilities callers use
// on champagne/cream CTAs (0.5 = 0.125rem = 2px, 1 = 0.25rem = 4px). Once framer owns
// the element's inline `transform` (it does the moment `whileTap`/`whileHover` runs),
// an inline transform beats any class-driven `hover:-translate-y-*`, so that CSS lift
// would silently die after the first press. We hoist the lift into framer so translate
// and the press scale compose in ONE system, and strip the now-inert utility below.
const TRANSLATE_Y_PX: Record<string, number> = {
  "0.5": 2,
  "1": 4,
  "1.5": 6,
  "2": 8,
};
const HOVER_TRANSLATE_Y = /(?:^|\s)hover:-translate-y-(0\.5|1\.5|1|2)(?=\s|$)/;

// Pull any `hover:-translate-y-*` utility out of the class string and return both the
// cleaned class string and the equivalent framer hover lift (negative y = upward).
// Returns `y: 0` when no such utility is present, so the caller can skip whileHover.
const resolveHoverLift = (
  className: string,
): { className: string; y: number } => {
  const match = className.match(HOVER_TRANSLATE_Y);
  if (!match) return { className, y: 0 };
  return {
    className: className.replace(HOVER_TRANSLATE_Y, " ").replace(/\s+/g, " ").trim(),
    y: -TRANSLATE_Y_PX[match[1]],
  };
};

// Motion props framer-motion adds on top of the native button props. We accept the
// intersection so callers keep the exact shadcn `ButtonProps` surface while the
// motion.button path forwards whileTap etc. internally.
type MotionButtonProps = ButtonProps &
  Pick<HTMLMotionProps<"button">, "onClick">;

/**
 * shadcn Button with spring press physics. Renders a framer `motion.button` so
 * every button in the app inherits a snap-spring press-in (scale 0.97) plus a
 * `tapTick()` selection haptic on activation — in one edit, app-wide.
 *
 * - Reduced motion ⇒ no scale (useMotionSafe collapses the whileTap to instant).
 * - The haptic fires from the unified activation path (onClick), which a pointer
 *   tap AND a keyboard Enter/Space both route through on a native <button>, so
 *   both get one tick and neither double-fires.
 * - `asChild` (Slot) keeps a CSS-only press: Radix composition forwards our props
 *   onto the caller's element (often a Link that owns its own motion/haptics), so
 *   we do NOT wrap it in motion or fire a haptic here — that avoids breaking
 *   composition and prevents double-fire when nested in another haptic surface.
 * - A caller's `hover:-translate-y-*` lift can't survive alongside framer's inline
 *   transform (inline > class), so on the motion path we hoist that lift into a
 *   framer `whileHover` (fine pointer + motion allowed only) and drop the now-inert
 *   utility — translate and the press scale then compose in one system. The Slot
 *   path leaves the utility intact (framer never owns that element's transform).
 */
const Button = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ className, variant, size, asChild = false, haptic = true, onClick, ...props }, ref) => {
    const motionSafe = useMotionSafe();
    const finePointer = useFinePointer();
    const classes = cn(buttonVariants({ variant, size, className }));

    // Slot/asChild path: preserve Radix composition and native semantics exactly —
    // CSS-only press, no motion wrapper, no haptic (the composed child owns those).
    // The `hover:-translate-y-*` utility stays intact here: framer never owns this
    // element's transform, so the class-driven lift keeps working.
    if (asChild) {
      return <Slot className={classes} ref={ref} onClick={onClick} {...props} />;
    }

    // On the motion path framer takes over the inline transform, which would
    // permanently clobber any `hover:-translate-y-*` class after the first press.
    // Hoist that lift into a framer `whileHover` and strip the inert utility so the
    // hover micro-interaction survives — composed with the press scale in one system.
    const { className: motionClasses, y: hoverY } = resolveHoverLift(classes);
    const whileHover =
      hoverY !== 0 && !motionSafe.reduced && finePointer ? { y: hoverY } : undefined;

    // Fire the selection tick from the click path so pointer taps and keyboard
    // activation (Enter/Space → click) both get exactly one tick. Skipped when the
    // button is disabled (pointer-events-none already blocks pointer clicks; this
    // guards the keyboard path too) and when `haptic={false}` — the latter lets a
    // caller whose own onClick fires a deliberate, distinct haptic (e.g. a heavier
    // money-moment confirm) own the feedback without the tap double-buzzing.
    const handleClick: NonNullable<HTMLMotionProps<"button">["onClick"]> = (event) => {
      if (haptic && !props.disabled) tapTick();
      onClick?.(event);
    };

    return (
      <motion.button
        className={motionClasses}
        ref={ref}
        whileHover={whileHover}
        whileTap={motionSafe.pressTap}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
