import { useEffect, useRef, useState } from "react";

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

/**
 * Champagne SVG ring-arc progress token. The track sits at low opacity over the
 * dark canvas; the arc is the cream/champagne accent. Animates from 0 → pct on
 * first paint (skipped under reduced motion). Mirrors the easing cadence used
 * by <CountUp> so a ring + number read as one motion.
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

  const rafRef = useRef(0);
  const [display, setDisplay] = useState(0);
  // Latest settled display value, read at the START of each animation so the
  // sweep runs IN PLACE from wherever the needle currently sits — not always
  // from 0. On first paint this is 0 (unchanged 0→pct intro for every
  // consumer); on a later `pct` bump (e.g. a lesson completes) it animates the
  // delta so the user sees the needle move.
  const displayRef = useRef(0);
  displayRef.current = display;

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(target);
      return;
    }

    const from = displayRef.current;
    if (from === target) return;
    const t0 = performance.now();
    const durationMs = 700;
    // Overshoot ("back") easing for the celebratory register, ease-out cubic
    // otherwise. Both settle exactly on 1 at t=1; emphasis briefly overshoots.
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const ease = (t: number) =>
      emphasis
        ? 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
        : 1 - Math.pow(1 - t, 3);
    const tick = (now: number) => {
      const t = Math.min((now - t0) / durationMs, 1);
      setDisplay(from + (target - from) * ease(t));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, emphasis]);

  // Overshoot can push `display` a hair past the ends; clamp what we render so
  // the arc + label stay within 0–100.
  const shown = Math.max(0, Math.min(100, display));
  const dashOffset = circumference * (1 - shown / 100);
  const labelText =
    label === true ? `${Math.round(shown)}%` : typeof label === "string" ? label : null;

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
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--cream))"
          strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
        />
      </svg>
      {labelText !== null && (
        <span
          className="absolute inset-0 flex items-center justify-center font-mono font-semibold tabular-nums text-cream"
          style={{ fontSize: Math.max(9, Math.round(size * 0.26)) }}
        >
          {labelText}
        </span>
      )}
    </div>
  );
};

export default ProgressRing;
