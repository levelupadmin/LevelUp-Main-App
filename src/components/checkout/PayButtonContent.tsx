import { Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { durations, easings, useMotionSafe } from "@/lib/motion";

/**
 * PayButtonContent — the CRED/Swiggy-style processing arc for the champagne Pay
 * CTA, rendered as the *content* of an existing `<Button variant="champagne">`.
 * A button-level layer (STEAL #2, design/vision/INTERACTION-STEALS.md): the
 * button becomes a single continuous narrative — label → a quiet centered dot
 * pulse while the charge is in flight → a check that springs in on success —
 * inside a container that NEVER changes size or gray-swaps its gradient.
 *
 * Why a content layer (not a new button variant / not an edit to ui/button.tsx):
 * `button.tsx` is shared app-wide (tier-1 blast radius). This wrapper lives only
 * on the two money-path CTAs (in-card Pay + StickyPayBar), so it carries the
 * enrichment without touching every button in the app. The host Button keeps
 * owning press physics, disabled semantics, and the money-moment haptic — this
 * component only swaps what's drawn inside it.
 *
 * Revenue guard: this is a PURELY visual replacement for the old
 * `<Loader2 spin/> Processing…` swap. It reads a `status` derived from the
 * caller's existing `paying` flag; it does not touch `handlePay`, payloads,
 * navigation timing, or haptic flags. `status="processing"` mirrors `paying`;
 * on dismiss/failure `paying` flips back to false → `status="idle"` and the
 * label crossfades back in calmly (no extra wiring). The `success` state is
 * supported here for the P3-T4 ThankYou handoff to drive later WITHOUT any
 * change to the payment logic; the checkout call sites pass only idle/processing.
 *
 * Container size stability: an invisible, aria-hidden copy of `label` sits in
 * normal flow and defines the width/height for every state; the animated
 * label / dot / check layers are absolutely positioned and centered over it, so
 * no state resizes the button (spec: "the container never changes shape").
 *
 * Accessibility: the visible label layer stays in the a11y tree across states
 * (opacity, not display), so the button keeps its name (e.g. "Pay ₹4,999")
 * throughout; the caller sets `aria-busy` on the Button while processing. The
 * dot and check are decorative (aria-hidden).
 *
 * Reduced motion: no dot pulse, no spring — a plain text swap
 * (label → "Processing…" → check), matching the house reduced-motion contract.
 */
export type PayButtonStatus = "idle" | "processing" | "success";

interface PayButtonContentProps {
  status: PayButtonStatus;
  /** The at-rest CTA label (e.g. `Pay ₹4,999`, `Enrol free`, staged label). */
  label: React.ReactNode;
}

export default function PayButtonContent({ status, label }: PayButtonContentProps) {
  const ms = useMotionSafe();

  // Reduced motion: instant, text-only swap. No absolute layers, no pulse, no
  // bounce. The check is decorative; "Processing…" carries the busy state as
  // text (and the caller's aria-busy carries it to assistive tech).
  if (ms.reduced) {
    return (
      <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {status === "success" ? (
          // The check is decorative; keep the label in the a11y tree (visually
          // hidden) so the button retains its accessible name here, exactly as
          // the non-reduced path does with an opacity-0 label layer.
          <>
            <Check aria-hidden className="h-4 w-4" />
            <span className="sr-only">{label}</span>
          </>
        ) : status === "processing" ? (
          "Processing…"
        ) : (
          label
        )}
      </span>
    );
  }

  return (
    <span className="relative inline-flex items-center justify-center">
      {/* Invisible sizer — reserves the label's footprint so the button never
          resizes as the layers below crossfade over it. */}
      <span aria-hidden className="invisible whitespace-nowrap">
        {label}
      </span>

      {/* Label layer — the accessible name lives here; fades/lifts out when the
          charge goes in flight and fades back in on return to idle (dismiss/fail). */}
      <motion.span
        className="absolute inset-0 inline-flex items-center justify-center gap-2 whitespace-nowrap"
        initial={false}
        animate={{ opacity: status === "idle" ? 1 : 0, y: status === "idle" ? 0 : -4 }}
        transition={{ duration: durations.fast, ease: easings.out }}
      >
        {label}
      </motion.span>

      {/* Processing layer — a single quiet centered dot that pulses opacity
          0.4↔1 while in flight (the CRED move). The layer fades in on enter;
          the dot itself carries the pulse. */}
      <motion.span
        aria-hidden
        className="absolute inset-0 inline-flex items-center justify-center"
        initial={false}
        animate={{ opacity: status === "processing" ? 1 : 0 }}
        transition={{ duration: durations.fast, ease: easings.out }}
      >
        <motion.span
          className="block h-2 w-2 rounded-full bg-current"
          animate={
            status === "processing"
              ? { opacity: [0.4, 1] }
              : { opacity: 1 }
          }
          transition={
            status === "processing"
              ? {
                  duration: durations.base,
                  ease: easings.inOut,
                  repeat: Infinity,
                  repeatType: "reverse",
                }
              : { duration: 0 }
          }
        />
      </motion.span>

      {/* Success layer — the check pops on the celebration spring, one beat
          before the ThankYou handoff owns the celebration. Mounts only on
          success so the bounce plays from scratch. */}
      <AnimatePresence>
        {status === "success" && (
          <motion.span
            key="pay-success-check"
            aria-hidden
            className="absolute inset-0 inline-flex items-center justify-center"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={ms.springs.bounce}
          >
            <Check className="h-4 w-4" />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}
