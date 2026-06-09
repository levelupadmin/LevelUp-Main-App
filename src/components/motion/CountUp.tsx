import { useEffect, useRef, useState } from "react";

interface CountUpProps {
  value: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  durationMs?: number;
  className?: string;
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * Animated number: counts from 0 to `value` on first reveal (threshold 0.15,
 * runs once). Renders the final value immediately under reduced motion or
 * where IntersectionObserver is unavailable.
 */
export const CountUp = ({
  value,
  prefix = "",
  suffix = "",
  format = defaultFormat,
  durationMs = 600,
  className,
}: CountUpProps) => {
  const ref = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);
  const rafRef = useRef(0);
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setDisplay(value);
      return;
    }

    // Already counted once — just track subsequent value changes directly.
    if (startedRef.current) {
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
        setDisplay(value * eased);
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
  }, [value, durationMs]);

  return (
    <span ref={ref} className={className}>
      {prefix}
      {format(display)}
      {suffix}
    </span>
  );
};

export default CountUp;
