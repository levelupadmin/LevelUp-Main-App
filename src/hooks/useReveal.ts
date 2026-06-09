import { useEffect, useRef, type RefObject } from "react";

/**
 * Adds the `reveal-in` class to the element the first time it intersects the
 * viewport (threshold 0.15, fires once). Pair with the `.reveal` CSS class
 * from the motion system in index.css.
 *
 * SSR / reduced-motion / no-IntersectionObserver environments reveal
 * immediately (`.reveal` itself only hides content under
 * prefers-reduced-motion: no-preference, so nothing can stay invisible).
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      el.classList.add("reveal-in");
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          el.classList.add("reveal-in");
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return ref;
}
