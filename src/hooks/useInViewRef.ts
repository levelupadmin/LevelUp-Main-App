import { useCallback, useRef, useState } from "react";

/**
 * `useInView` variant that binds via a CALLBACK ref, so the observer
 * re-subscribes every time the observed node actually mounts / unmounts.
 *
 * Why not framer-motion's `useInView`? That hook binds its IntersectionObserver
 * in a mount-only effect (`deps: [ref, …]`, the stable RefObject) and early-
 * returns when `ref.current` is null AT THAT MOMENT — then never re-binds when
 * the element later appears. It silently fails whenever the target is rendered
 * *after* the first commit. On the checkout that's exactly what happens: the
 * in-card Pay button lives inside `<RevealOnMount>`, whose skeleton branch owns
 * the first frame (under normal motion `revealed` starts false) and only swaps
 * the real content in on the next animation frame. framer's observer attaches to
 * nothing on that first frame, so the boolean stays pinned to `false` forever —
 * the sticky bar never cedes and two identical champagne CTAs light at once.
 * (Under reduced motion `revealed` starts true, the button is present on the
 * first commit, and framer's hook happens to work — which is why the bug hides.)
 *
 * A callback ref runs on every attach/detach React performs, so we tear down the
 * previous observer and observe the new node each time — correct no matter when,
 * or how many times, the target mounts. SSR / WebViews without IntersectionObserver
 * keep the boolean `false`, preserving the historical (bar-shown) behaviour.
 */
export function useInViewRef<T extends Element = Element>(
  options?: { rootMargin?: string; threshold?: number | number[] },
): [(node: T | null) => void, boolean] {
  const rootMargin = options?.rootMargin;
  const threshold = options?.threshold;
  const [inView, setInView] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = useCallback(
    (node: T | null) => {
      // Always drop the previous observer before (re)binding.
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node) return;

      // SSR / older WebViews without IntersectionObserver: stay false so callers
      // preserve their historical fallback (the sticky bar stays shown).
      if (typeof window === "undefined" || !("IntersectionObserver" in window)) {
        return;
      }

      const observer = new IntersectionObserver(
        // Single observed node ⇒ single entry; reflect its live visibility.
        (entries) => setInView(entries.some((entry) => entry.isIntersecting)),
        { rootMargin, threshold },
      );
      observer.observe(node);
      observerRef.current = observer;
    },
    [rootMargin, threshold],
  );

  return [setRef, inView];
}
