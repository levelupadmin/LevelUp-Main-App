import { useEffect } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";

import { durations, easings } from "@/lib/motion";

interface ProgressRingProps {
  /** Completion percentage, 0–100. Clamped internally. */
  pct: number;
  /** Outer diameter in px. Default 44 (a tap-target-friendly size). */
  size?: number;
  /** Stroke width in px. Defaults to a proportion of `size`. */
  strokeWidth?: number;
  /**
   * Center label. When `true`, shows "<pct>%". When a string, shows that
   * verbatim. When `false`/omitted, the ring renders with no center text.
   */
  label?: boolean | string;
  /**
   * Celebratory register. When true the in-place sweep uses an overshoot
   * ("bounce") easing instead of the default ease-out cubic — the needle
   * springs to its new value. Used by the completion arc (ChapterViewer);
   * shared consumers (Your Week, My Courses) leave it off for a calm fill.
   */
  emphasis?: boolean;
  className?: string;
}

// Clamp a raw (possibly overshooting) sweep value to the renderable 0–100 range.
// The overshoot easing can push the MotionValue a hair past the ends; clamping
// here keeps the arc and the live label inside their bounds.
const clampPct = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Champagne SVG ring-arc progress token. The track sits at low opacity over the
 * dark canvas; the arc is the cream/champagne accent. Animates from 0 → pct on
 * first paint (skipped under reduced motion). Mirrors the easing cadence used
 * by <CountUp> so a ring + number read as one motion.
 *
 * The sweep is driven off a framer-motion MotionValue: `animate()` writes the
 * arc's dashoffset (and the live "%" label) straight to the DOM each frame, so
 * the React tree never re-renders during the animation. The MotionValue also
 * persists across renders, so a later `pct` bump sweeps IN PLACE from wherever
 * the needle currently sits rather than snapping back to 0. Timing and easing
 * come from the motion token module — no per-component magic numbers.
 */
export const ProgressRing = ({
  pct,
  size = 44,
  strokeWidth,
  label,
  emphasis = false,
  className,
}: ProgressRingProps) => {
  const target = Math.max(0, Math.min(100, Math.round(pct)));
  const sw = strokeWidth ?? Math.max(3, Math.round(size * 0.1));
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const reduced = useReducedMotion() ?? false;

  // The single source of truth for the sweep, in percent (0–100). Persists
  // across renders like a ref, so each `animate()` starts from the current
  // needle position — the in-place sweep behavior the completion arc relies on.
  const progress = useMotionValue(0);
  const dashOffset = useTransform(
    progress,
    (v) => circumference * (1 - clampPct(v) / 100),
  );
  const percentText = useTransform(progress, (v) => `${Math.round(clampPct(v))}%`);

  useEffect(() => {
    if (reduced) {
      // No animation under reduced motion — cut straight to the target.
      progress.set(target);
      return;
    }
    const controls = animate(progress, target, {
      duration: durations.sweep,
      // Overshoot ("spring") easing for the celebratory register, ease-out
      // otherwise — both settle exactly on the target; emphasis briefly
      // overshoots before clampPct reins the render back in.
      ease: emphasis ? easings.spring : easings.out,
    });
    return () => controls.stop();
  }, [target, emphasis, reduced, progress]);

  const labelClassName =
    "absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums text-cream";
  const labelStyle = { fontSize: Math.max(9, Math.round(size * 0.26)) };

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative" }}
      role="img"
      aria-label={`${target}% complete`}
    >
      <svg width={size} height={size} className="block -rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--cream) / 0.14)"
          strokeWidth={sw}
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--cream))"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: dashOffset }}
        />
      </svg>
      {label === true && (
        <motion.span className={labelClassName} style={labelStyle}>
          {percentText}
        </motion.span>
      )}
      {typeof label === "string" && (
        <span className={labelClassName} style={labelStyle}>
          {label}
        </span>
      )}
    </div>
  );
};

export default ProgressRing;
