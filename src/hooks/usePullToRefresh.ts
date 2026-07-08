import { useEffect, useRef, useState, useCallback } from "react";
import {
  animate,
  useMotionValue,
  useTransform,
  type AnimationPlaybackControls,
  type MotionValue,
} from "framer-motion";
import { tapTick, confirm } from "@/lib/haptics";
import { durations, easings, useMotionSafe } from "@/lib/motion";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
}

interface PullToRefreshState {
  /** Refresh in flight — React state (flips twice per gesture, never per frame). */
  isRefreshing: boolean;
  /** Resisted pull distance in px. Drives translateY; written imperatively. */
  pullDistance: MotionValue<number>;
  /** 0→1 pull completion (distance / threshold, clamped). Drives the stroke draw. */
  pullProgress: MotionValue<number>;
}

/**
 * Pull-to-refresh gesture for mobile (touch-only; desktop is untouched).
 *
 * Detects a touch drag down ONLY when the document is at scrollTop 0 (the June-14
 * guard — never reads/fights native overscroll otherwise) and never touches
 * html/body overflow.
 *
 * PERF (phase-4): the per-frame gesture value lives in a framer `MotionValue`, not
 * React state, so a drag writes `pullDistance`/`pullProgress` straight to the
 * compositor without reconciling the React tree — the host feed (Home/Community)
 * no longer re-renders ~60×/sec during a pull. `<PullIndicator />` owns this hook
 * and binds the MotionValues to `motion.*` styles, so even the indicator leaf
 * doesn't reconcile per frame. Only `isRefreshing` is React state (it flips exactly
 * twice per gesture — start and end of the refresh — to toggle the spin).
 *
 * The finger-follow is a direct `.set()` (1:1, no easing); the release + refresh
 * hold + retract are driven imperatively with framer `animate()` on the SAME curve
 * the CSS transition used to use (`--motion-base` / `--ease-spring`). Reduced motion
 * collapses that to an instant cut.
 *
 * Haptics: `tapTick()` fires exactly once as the pull crosses the threshold
 * (armed/disarmed so it can't repeat within a single continuous pull), and
 * `confirm(true)` settles on a successful refresh.
 */
export function usePullToRefresh({
  onRefresh,
  threshold = 80,
}: UsePullToRefreshOptions): PullToRefreshState {
  const { reduced } = useMotionSafe();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Per-frame gesture value — MotionValue, NOT state, so writes never reconcile.
  const pullDistance = useMotionValue(0);

  // Refs so the touch handlers can read live values without becoming reactive
  // (keeps them identity-stable → the document listeners attach ONCE, no churn).
  const thresholdRef = useRef(threshold);
  thresholdRef.current = threshold;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const pullProgress = useTransform(pullDistance, (d) =>
    Math.max(0, Math.min(d / thresholdRef.current, 1)),
  );

  const startY = useRef(0);
  const pulling = useRef(false);
  // Ref mirror of isRefreshing so handlers stay non-reactive.
  const refreshing = useRef(false);
  // Threshold-haptic latch: armed once we cross the line, disarmed when we fall
  // back under it, so the tick can't repeat while the finger holds past it.
  const armed = useRef(false);
  // In-flight release/retract animation, so a new touch can take it over.
  const settleAnim = useRef<AnimationPlaybackControls | null>(null);

  // Animate pullDistance to a target on the glide curve (or instant when reduced).
  const settle = useCallback(
    (to: number) => {
      settleAnim.current?.stop();
      settleAnim.current = animate(pullDistance, to, {
        duration: reducedRef.current ? 0 : durations.base,
        ease: easings.spring,
      });
    },
    [pullDistance],
  );

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (refreshing.current) return;
    if (window.scrollY > 0) return; // June-14 guard: only engage at scrollTop 0
    settleAnim.current?.stop(); // take over any in-flight retract for 1:1 follow
    startY.current = e.touches[0].clientY;
    pulling.current = true;
    armed.current = false;
  }, []);

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || refreshing.current) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        pullDistance.set(0);
        armed.current = false;
        return;
      }
      // Apply resistance so it feels natural; write straight to the compositor.
      const distance = dy * 0.4;
      pullDistance.set(distance);
      // Fire the threshold tick once per crossing (arm), reset when we retreat.
      if (distance >= thresholdRef.current && !armed.current) {
        armed.current = true;
        void tapTick();
      } else if (distance < thresholdRef.current && armed.current) {
        armed.current = false;
      }
    },
    [pullDistance],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    armed.current = false;

    if (pullDistance.get() >= thresholdRef.current && !refreshing.current) {
      refreshing.current = true;
      setIsRefreshing(true);
      settle(thresholdRef.current); // hold at threshold while refreshing
      try {
        await onRefreshRef.current();
        void confirm(true); // success settle — errors fall through to retract
      } finally {
        refreshing.current = false;
        setIsRefreshing(false);
        settle(0); // retract on the glide curve
      }
    } else {
      settle(0); // retract on the glide curve
    }
  }, [pullDistance, settle]);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      settleAnim.current?.stop();
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { isRefreshing, pullDistance, pullProgress };
}
