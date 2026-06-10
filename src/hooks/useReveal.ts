import { useEffect, useRef, type RefObject } from "react";

/**
 * Adds the `reveal-in` class to the element so the `.reveal` motion class
 * (index.css) fades/slides it in. Progressive on scroll where possible, but
 * FAIL-SAFE: content can never stay hidden.
 *
 * Why fail-safe matters: the previous version relied solely on
 * IntersectionObserver (threshold 0.15). On Android System WebView the
 * observer can fire late or not at all (and 0.15 never triggers for sections
 * taller than ~6.6x the viewport) — which left every below-the-fold section
 * stuck at opacity:0, so users "couldn't scroll down" (the content was there
 * but invisible). Now we:
 *   1. reveal immediately if the element is already in view at mount,
 *   2. reveal on intersection (threshold 0, the reliable trigger),
 *   3. ALWAYS reveal after a short fallback timeout, even if the observer
 *      never fires.
 * Reduced-motion / SSR / no-IO environments reveal instantly.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(): RefObject<T> {
  const ref = useRef<T>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reveal = () => el.classList.add("reveal-in");

    if (
      typeof window === "undefined" ||
      !("IntersectionObserver" in window) ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      reveal();
      return;
    }

    // Already on screen at mount (above the fold, or IO's initial callback is
    // delayed) → reveal now so the first screenful is never blank.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      reveal();
      return;
    }

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      reveal();
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          finish();
          observer.disconnect();
        }
      },
      { threshold: 0, rootMargin: "0px 0px -8% 0px" }
    );
    observer.observe(el);

    // Safety net: never let a section stay invisible if the observer is flaky
    // on this WebView. 900ms keeps the scroll-reveal feel for quick scrollers
    // while guaranteeing content always appears.
    const fallback = window.setTimeout(() => {
      finish();
      observer.disconnect();
    }, 900);

    return () => {
      observer.disconnect();
      clearTimeout(fallback);
    };
  }, []);

  return ref;
}
