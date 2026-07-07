// MorphSheet — the app's reusable bottom-sheet grammar (P4-T1, STEAL-10).
//
// The signature sheet primitive every overlay in phase 4 inherits from: a vaul
// drawer (drag-to-dismiss + spring settle) with an accessible title/description,
// focus trap + restore, a spec'd drag handle, and — via the exported
// `MorphButton` — the Family-style button↔sheet `layoutId` FLIP-morph.
//
// P4-T2 / P4-T4 / P4-T6 / P4-T10 consume this READ-ONLY. First consumer:
// `components/profile/InvoiceDetailSheet.tsx` (P4-T1).
//
// ── What this provides, and where each guarantee comes from ──
// • Drag-to-dismiss + spring settle → vaul's gesture + its transform spring.
// • Focus trap + focus restore → vaul is built on `@radix-ui/react-dialog`,
//   whose focus-scope traps Tab inside the sheet and restores focus to the
//   trigger on close. We deliberately do NOT layer `useFocusTrap` on top — a
//   second trap would fight Radix's focus-scope (both moving/restoring focus).
// • Body-lock safety → vaul never writes `document.body.style.overflow`, and
//   `shouldScaleBackground` is OFF (see ui/drawer.tsx). CompletionTakeover stays
//   the sole overflow writer.
// • Reduced motion → vaul's CSS keyframes are flattened by the global
//   `prefers-reduced-motion` block (index.css); `MorphButton` drops its layoutId
//   so no morph is attempted (STEAL-10 reduced-motion clause).
// • Android back → Radix Dialog closes on Escape, which the App.tsx hardware-back
//   handler dispatches to `[role="dialog"][data-state="open"]`.

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";

import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useMotionSafe } from "@/lib/motion";
import { tapTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

export interface MorphSheetProps {
  /** Controlled open state. */
  open: boolean;
  /** Fires on every dismissal path (swipe, backdrop, Escape / Android back). */
  onOpenChange: (open: boolean) => void;
  /**
   * Accessible name for the sheet (Radix Dialog requires a title). Rendered
   * visually hidden — supply a visible heading inside `children` for sighted
   * users; this is the screen-reader label.
   */
  title: string;
  /** Optional screen-reader description, wired to `aria-describedby` by Radix. */
  description?: string;
  /** Sheet body. */
  children: React.ReactNode;
  /** Extra classes on the sheet surface. */
  className?: string;
  /**
   * Max height of the sheet content. Single content-height snap, capped so the
   * sheet never covers the full screen. Defaults to `92dvh` (P4-T1 spec).
   */
  maxHeight?: string;
  /** Allow swipe / backdrop / Escape dismissal. Defaults to true. */
  dismissible?: boolean;
  /** Hide the drag handle (rare). */
  hideHandle?: boolean;
}

/**
 * Reusable, drag-dismissable bottom sheet. Controlled via `open`/`onOpenChange`.
 */
const MorphSheet = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  maxHeight = "92dvh",
  dismissible = true,
  hideHandle = false,
}: MorphSheetProps) => (
  <Drawer open={open} onOpenChange={onOpenChange} dismissible={dismissible} shouldScaleBackground={false}>
    <DrawerContent
      hideHandle={hideHandle}
      style={{ maxHeight }}
      className={cn("overflow-y-auto px-4 pb-safe", className)}
    >
      {/* Radix requires a Title; description is optional but wires aria-describedby. */}
      <DrawerTitle className="sr-only">{title}</DrawerTitle>
      {description ? (
        <DrawerDescription className="sr-only">{description}</DrawerDescription>
      ) : null}
      {children}
    </DrawerContent>
  </Drawer>
);
MorphSheet.displayName = "MorphSheet";

export interface MorphButtonProps extends HTMLMotionProps<"button"> {
  /**
   * Shared FLIP-morph id (STEAL-10). Render a MorphButton with this id both as
   * the sheet's CTA and as its on-page twin — framer animates the container
   * between the two positions as one crosses-fades in and the other out. Pair
   * the two inside a framer `<LayoutGroup>` to scope the id. Omit for a plain
   * spring-press button (no morph).
   */
  layoutId?: string;
  /** Fire a selection haptic tick on activation. Defaults to true. */
  haptic?: boolean;
}

/**
 * The STEAL-10 morph primitive: a spring-press `motion.button` that can carry a
 * `layoutId` so it FLIP-morphs to/from an on-page twin with the same id when the
 * sheet opens/closes. Under reduced motion the layoutId is dropped (no morph —
 * the button state-swaps instantly) and the press becomes an instant state
 * change, matching every other motion primitive in the app.
 */
const MorphButton = React.forwardRef<HTMLButtonElement, MorphButtonProps>(
  ({ layoutId, haptic = true, className, onClick, disabled, ...props }, ref) => {
    const motionSafe = useMotionSafe();
    // Reduced motion ⇒ no FLIP morph (STEAL-10 clause).
    const morphId = motionSafe.reduced ? undefined : layoutId;

    const handleClick: NonNullable<HTMLMotionProps<"button">["onClick"]> = (event) => {
      if (haptic && !disabled) tapTick();
      onClick?.(event);
    };

    return (
      <motion.button
        ref={ref}
        layoutId={morphId}
        // Container morph settles on the sheet spring; the press keeps its own
        // snap transition (carried inside pressTap), so the two never compete.
        transition={motionSafe.springs.glide}
        whileTap={motionSafe.pressTap}
        disabled={disabled}
        onClick={handleClick}
        className={cn("focus-ring", className)}
        {...props}
      />
    );
  },
);
MorphButton.displayName = "MorphButton";

export { MorphSheet, MorphButton };
export default MorphSheet;
