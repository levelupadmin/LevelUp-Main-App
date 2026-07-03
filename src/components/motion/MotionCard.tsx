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

import { springs, useFinePointer, useMotionSafe } from "@/lib/motion";

// A motion-enabled Slot so `asChild` consumers still get the tap/hover springs.
const MotionSlot = motion.create(Slot);

// Card press: a touch softer than a button's (0.98 vs 0.97), but on the SAME snap
// spring so the press feels as snappy as MotionButton. The per-target transition
// pins snap here; the component-level `glide` transition governs the hover lift.
const cardPress = {
  scale: 0.98,
  transition: springs.snap,
} as const satisfies TargetAndTransition;

export interface MotionCardProps extends HTMLMotionProps<"div"> {
  /** Render the child element (Radix Slot) instead of a <div>. */
  asChild?: boolean;
}

/**
 * Press-and-lift card primitive. Forwards refs and props; drops all scale/lift
 * animation under reduced motion and the hover lift on coarse (touch) pointers.
 *
 * The press/lift springs read as a pressable surface, so when an `onClick` is
 * supplied the card becomes a keyboard-operable button: it defaults `role`,
 * `tabIndex`, and Enter/Space keyboard activation that fires the click (WCAG
 * 2.1.1), matching native-button semantics — Enter activates on keydown, Space
 * activates on keyup (keydown Space only preventDefaults to suppress page
 * scroll), and a held key never multi-fires. Every default is overridable via
 * forwarded props, and a card with no `onClick` stays a plain, non-focusable
 * <div> (tabIndex -1) with no button semantics — which also suppresses
 * framer-motion's whileTap tabIndex={0} auto-injection.
 *
 * Accessible-name contract: an interactive card (one with `onClick`) exposes the
 * `button` role, so it MUST have a discernible accessible name — supply either an
 * `aria-label`/`aria-labelledby` or visible text content (the course title, etc.).
 * In development a card that is interactive with no discernible name emits a
 * one-off `console.warn` (cheap heuristic: no aria-label/aria-labelledby and no
 * text content); the check is stripped in production builds.
 */
const MotionCard = React.forwardRef<HTMLDivElement, MotionCardProps>(
  (
    { asChild = false, onClick, onKeyDown, onKeyUp, role, tabIndex, ...props },
    ref,
  ) => {
    const motionSafe = useMotionSafe();
    const finePointer = useFinePointer();
    const Comp = asChild ? MotionSlot : motion.div;

    // Reduced motion ⇒ no scale; coarse pointer ⇒ no hover lift.
    const whileTap = motionSafe.reduced ? undefined : cardPress;
    const whileHover =
      motionSafe.reduced || !finePointer ? undefined : { y: -4 };

    // A card with an onClick presents as pressable — so it must be reachable and
    // operable by keyboard. Give it button semantics by default (all overridable
    // by the caller): a focusable tab stop, an ARIA role, and Enter/Space → click.
    const interactive = typeof onClick === "function";

    // Dev-only accessible-name guard. An interactive card carries the `button`
    // role, so a screen reader announces "button" with no name unless the caller
    // gives it one. Warn (once per render path, dev builds only — stripped in prod)
    // using a cheap heuristic: no aria-label/aria-labelledby AND no text content.
    if (import.meta.env.DEV && interactive) {
      const hasAriaName =
        typeof props["aria-label"] === "string" &&
        props["aria-label"].trim() !== "";
      const hasAriaLabelledby =
        typeof props["aria-labelledby"] === "string" &&
        props["aria-labelledby"].trim() !== "";
      const hasTextContent =
        typeof props.children === "string"
          ? props.children.trim() !== ""
          : props.children != null;
      if (!hasAriaName && !hasAriaLabelledby && !hasTextContent) {
        console.warn(
          "MotionCard: interactive card (onClick) has no discernible accessible name. " +
            "Provide an aria-label, aria-labelledby, or text content so screen readers " +
            "announce more than \"button\".",
        );
      }
    }

    // framer-motion auto-injects tabIndex={0} on ANY element with whileTap when
    // tabIndex is left undefined (render/html/use-props) — which is exactly how a
    // non-interactive card became a focusable-but-inert tab trap. Always resolve an
    // explicit tabIndex so that injection never fires: interactive cards default to
    // a real tab stop (0); non-interactive cards stay out of the tab order (-1).
    // A caller-supplied tabIndex always wins.
    const resolvedTabIndex = tabIndex ?? (interactive ? 0 : -1);

    // Bridge keyboard activation to the click path with native-button semantics.
    // Enter/Space on a <div> do NOT synthesize a click the way they do on a native
    // <button>, so translate them here. Native buttons fire Enter on keydown and
    // Space on keyup; on keydown Space only preventDefaults to stop the page from
    // scrolling. The caller's own onKeyDown/onKeyUp still run (and can preventDefault
    // to opt out). Guarded to interactive cards so a plain card keeps no key handling.
    const handleKeyDown: NonNullable<HTMLMotionProps<"div">["onKeyDown"]> = (
      event,
    ) => {
      onKeyDown?.(event);
      if (!interactive || event.defaultPrevented) return;
      // event.repeat guards against key-repeat multi-fire while a key is held.
      if (event.key === "Enter" && !event.repeat) {
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
      } else if (event.key === " ") {
        // Suppress page scroll on Space keydown; the activation waits for keyup.
        event.preventDefault();
      }
    };

    const handleKeyUp: NonNullable<HTMLMotionProps<"div">["onKeyUp"]> = (
      event,
    ) => {
      onKeyUp?.(event);
      if (!interactive || event.defaultPrevented) return;
      // Space activates on keyup, matching native-button semantics.
      if (event.key === " ") {
        event.preventDefault();
        onClick?.(event as unknown as React.MouseEvent<HTMLDivElement>);
      }
    };

    return (
      <Comp
        ref={ref}
        whileTap={whileTap}
        whileHover={whileHover}
        transition={motionSafe.springs.glide}
        role={interactive ? role ?? "button" : role}
        tabIndex={resolvedTabIndex}
        onClick={onClick}
        onKeyDown={interactive ? handleKeyDown : onKeyDown}
        onKeyUp={interactive ? handleKeyUp : onKeyUp}
        {...props}
      />
    );
  },
);
MotionCard.displayName = "MotionCard";

export { MotionCard };
export default MotionCard;
