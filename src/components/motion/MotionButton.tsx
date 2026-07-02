// MotionButton — a motion.button primitive with the canonical press-tap spring.
//
// Wraps children in `motion.button` (or a Slot for `asChild`) applying the
// `pressTap` whileTap from src/lib/motion. Ships the app's focus-visible ring by
// default (overridable via className) and optionally fires a selection haptic
// tick from the unified activation path (onClick) so pointer taps AND keyboard
// activation (Enter/Space) get both the ring and the tick. Respects
// useMotionSafe(): under reduced motion the scale animation is dropped and the
// tap becomes an instant state change.
//
// NOT adopted anywhere yet — the visible phases will drop this into ui/button.tsx
// and SurfaceCard. Depends on src/lib/motion (T2); the haptic tick is resolved
// lazily/defensively so a not-yet-present tapTick helper (T5) never breaks render.

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion, type HTMLMotionProps } from "framer-motion";

import { useMotionSafe } from "@/lib/motion";
import { cn } from "@/lib/utils";

// App-canonical focus-visible ring (src/index.css `.focus-ring`). Applied by
// default so keyboard users get a visible focus indicator (WCAG 2.4.7); goes
// first in the merge so a caller's className can still override it.
const FOCUS_RING = "focus-ring";

// A motion-enabled Slot so `asChild` consumers still get the whileTap spring.
const MotionSlot = motion.create(Slot);

// Fire the selection haptic tick without hard-depending on the helper existing.
// tapTick lands in src/lib/haptics via T5; until then this import resolves to
// undefined and the call is skipped, so rendering and pressing stay safe.
const fireTapTick = (): void => {
  import("@/lib/haptics")
    .then((mod) => {
      const tick = (mod as { tapTick?: () => void }).tapTick;
      if (typeof tick === "function") tick();
    })
    .catch(() => {
      /* haptics unavailable — silent no-op */
    });
};

export interface MotionButtonProps extends HTMLMotionProps<"button"> {
  /** Render the child element (Radix Slot) instead of a <button>. */
  asChild?: boolean;
  /** Fire a selection haptic tick on press. Defaults to true. */
  haptic?: boolean;
}

/**
 * Press-animated button primitive. Forwards refs and props to the underlying
 * element and collapses the scale animation under reduced motion.
 */
const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ asChild = false, haptic = true, className, onClick, ...props }, ref) => {
    const motionSafe = useMotionSafe();
    const Comp = asChild ? MotionSlot : motion.button;

    // Fire the haptic tick from the unified activation path (onClick) so keyboard
    // activation (Enter/Space → click) gets the same tick as a pointer tap. A
    // pointer tap dispatches a single native click, so firing here — instead of
    // on framer's onTapStart pointer gesture — reaches both without double-firing.
    const handleClick: NonNullable<HTMLMotionProps<"button">["onClick"]> = (
      event,
    ) => {
      if (haptic) fireTapTick();
      onClick?.(event);
    };

    return (
      <Comp
        ref={ref}
        className={cn(FOCUS_RING, className)}
        whileTap={motionSafe.pressTap}
        onClick={handleClick}
        {...props}
      />
    );
  },
);
MotionButton.displayName = "MotionButton";

export { MotionButton };
export default MotionButton;
