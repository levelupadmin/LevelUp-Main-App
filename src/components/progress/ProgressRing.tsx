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
  className,
}: ProgressRingProps) => {
  const target = Math.max(0, Math.min(100, Math.round(pct)));
  const sw = strokeWidth ?? Math.max(3, Math.round(size * 0.1));
  const radius = (size - sw) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const rafRef = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(target);
      return;
    }

    const t0 = performance.now();
    const from = 0;
    const durationMs = 700;
    const tick = (now: number) => {
      const t = Math.min((now - t0) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplay(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target]);

  const dashOffset = circumference * (1 - display / 100);
  const labelText =
    label === true ? `${Math.round(display)}%` : typeof label === "string" ? label : null;

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
