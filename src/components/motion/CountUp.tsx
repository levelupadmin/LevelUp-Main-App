import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
  /**
   * Skip the in-view intro. Seed the display to `value` on mount (so the number
   * reads correctly at rest, even below the fold, with no IntersectionObserver
   * gating) and, on every subsequent value change, roll from the PREVIOUS
   * displayed value to the new one. Use for a live figure like an order total
   * that must be correct immediately and must not re-roll from 0 on each edit.
   * Leave off (default) for the reveal-from-0 intro on Home / My Courses, which
   * legitimately wants the count-up to fire when scrolled into view.
   */
  immediate?: boolean;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-IN");

const prefersReducedMotion = () =>
  typeof window === "undefined" ||
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Animated number. By default counts from 0 to `value` on first reveal
 * (threshold 0.15, runs once). With `immediate`, seeds to `value` at rest and
 * animates from the previous value on changes (no observer, no remount).
 * Renders the final value immediately under reduced motion or where
 * IntersectionObserver is unavailable.
 */
export const CountUp = ({
  value,
  prefix = "",
  suffix = "",
  format = defaultFormat,
  durationMs = 600,
  className,
  immediate = false,
}: CountUpProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);
  const rafRef = useRef(0);
  // Seed to the target in immediate mode so the very first paint is correct
  // (no ₹0 flash below the fold); otherwise start at 0 for the intro count-up.
  const [display, setDisplay] = useState(() => (immediate ? value : 0));
  // Always mirrors the latest displayed number so an immediate-mode change can
  // animate from wherever the display currently sits — even mid-flight.
  const displayRef = useRef(display);

  // Immediate mode: no viewport gating. On mount the display already equals
  // `value` (seeded above); on later value changes, roll PREV → new.
  useEffect(() => {
    if (!immediate) return;

    if (prefersReducedMotion()) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const from = displayRef.current;
    if (from === value) return; // already showing the target (initial mount / no-op)

    const t0 = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - t0) / durationMs, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const next = from + (value - from) * eased;
      displayRef.current = next;
      setDisplay(next);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [immediate, value, durationMs]);

  // Default mode: count 0 → value once, when scrolled into view.
  useEffect(() => {
    if (immediate) return;
    const el = ref.current;
    if (!el) return;

    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      prefersReducedMotion()
    ) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    // Already counted once, just track subsequent value changes directly.
    if (startedRef.current) {
      displayRef.current = value;
      setDisplay(value);
      return;
    }

    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const t0 = performance.now();
      const tick = (now: number) => {
        const t = Math.min((now - t0) / durationMs, 1);
        const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
        const next = value * eased;
        displayRef.current = next;
        setDisplay(next);
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          observer.disconnect();
          start();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(rafRef.current);
    };
  }, [immediate, value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  );
};

export default CountUp;
