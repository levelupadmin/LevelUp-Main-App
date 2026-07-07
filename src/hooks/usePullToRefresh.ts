import { useEffect, useState, useRef, useCallback } from "react";
import { tapTick, confirm } from "@/lib/haptics";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
}

/**
 * Pull-to-refresh gesture for mobile (touch-only; desktop is untouched).
 *
 * Detects a touch drag down ONLY when the document is at scrollTop 0 (the June-14
 * guard — never reads/fights native overscroll otherwise) and never touches
 * html/body overflow. Emits state that <PullIndicator /> renders as the branded
 * node-mark: `pullProgress` (0-1) drives the stroke draw, `pullDistance` the
 * translate, `isRefreshing` the spin, and `isPulling` toggles the release spring.
 *
 * Haptics: `tapTick()` fires exactly once as the pull crosses the 80px threshold
 * (armed/disarmed so it can't repeat within a single continuous pull), and
 * `confirm(true)` settles on a successful refresh.
 */
export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  // Threshold-haptic latch: armed once we cross 80px, disarmed when we fall back
  // under it, so the tick can't repeat while the finger holds past the line.
  const armed = useRef(false);

  const pullProgress = Math.min(pullDistance / threshold, 1);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing) return;
      if (window.scrollY > 0) return; // June-14 guard: only engage at scrollTop 0
      startY.current = e.touches[0].clientY;
      pulling.current = true;
      armed.current = false;
    },
    [isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || isRefreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) {
        setPullDistance(0);
        setIsPulling(false);
        armed.current = false;
        return;
      }
      setIsPulling(true); // finger-driven: PullIndicator follows 1:1 (no transition)
      // Apply resistance so it feels natural.
      const distance = dy * 0.4;
      setPullDistance(distance);
      // Fire the threshold tick once per crossing (arm), reset when we retreat.
      if (distance >= threshold && !armed.current) {
        armed.current = true;
        void tapTick();
      } else if (distance < threshold && armed.current) {
        armed.current = false;
      }
    },
    [isRefreshing, threshold],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;
    armed.current = false;
    setIsPulling(false); // release: PullIndicator retracts on the glide spring

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // hold at threshold while refreshing
      try {
        await onRefresh();
        void confirm(true); // success settle — errors fall through to retract
      } finally {
        setIsRefreshing(false);
        setPullDistance(0); // springs back via PullIndicator's transition
      }
    } else {
      setPullDistance(0); // springs back
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: true });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  return { isRefreshing, pullProgress, pullDistance, isPulling };
}
