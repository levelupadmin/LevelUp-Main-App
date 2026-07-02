// MotionCard — a motion primitive for tappable card surfaces.
//
// Applies a subtle whileTap press (scale 0.98 on the snap spring) plus a gentle
// hover lift on the glide spring — but the hover lift is gated behind a desktop
// pointer media query (`(pointer: fine)`) so touch devices never get a stuck
// hover state. Respects useMotionSafe(): under reduced motion both the scale and
// the lift are dropped and states resolve instantly.
//
// NOT adopted anywhere yet — the visible phases will layer this into SurfaceCard.
// Depends only on src/lib/motion (T2).

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { motion, type HTMLMotionProps, type TargetAndTransition } from "framer-motion";

import { useMotionSafe } from "@/lib/motion";

// A motion-enabled Slot so `asChild` consumers still get the tap/hover springs.
const MotionSlot = motion.create(Slot);

// Card press: a touch softer than a button's, on the same snap spring family.
const cardPress = { scale: 0.98 } as const satisfies TargetAndTransition;

// Detect a fine (mouse/trackpad) pointer so the hover lift stays desktop-only.
const useFinePointer = (): boolean => {
  const [fine, setFine] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(pointer: fine)");
    setFine(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setFine(e.matches);
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);
  return fine;
};

export interface MotionCardProps extends HTMLMotionProps<"div"> {
  /** Render the child element (Radix Slot) instead of a <div>. */
  asChild?: boolean;
}

/**
 * Press-and-lift card primitive. Forwards refs and props; drops all scale/lift
 * animation under reduced motion and the hover lift on coarse (touch) pointers.
 */
const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  ({ asChild = false, ...props }, ref) => {
    const motionSafe = useMotionSafe();
    const finePointer = useFinePointer();
    const Comp = asChild ? MotionSlot : motion.div;

    // Reduced motion ⇒ no scale; coarse pointer ⇒ no hover lift.
    const whileTap = motionSafe.reduced ? undefined : cardPress;
    const whileHover =
      motionSafe.reduced || !finePointer ? undefined : { y: -4 };

    return (
      <Comp
        ref={ref}
        whileTap={whileTap}
        whileHover={whileHover}
        transition={motionSafe.springs.glide}
        {...props}
      />
    );
  },
);
MotionCard.displayName = "MotionCard";

export { MotionCard };
export default MotionCard;
