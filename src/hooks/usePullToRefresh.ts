import { useEffect, useState, useRef, useCallback } from "react";

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void> | void;
  threshold?: number;
}

/**
 * Lightweight pull-to-refresh hook for mobile.
 * Detects touch drag down when scrolled to the top of the page,
 * shows a visual indicator, calls `onRefresh`, and auto-dismisses.
 *
 * Returns `{ isRefreshing, pullProgress, indicatorRef }`.
 * Render a refresh indicator (e.g. Loader2) whose visibility/transform
 * is driven by `pullProgress` (0-1) and `isRefreshing`.
 */
export function usePullToRefresh({ onRefresh, threshold = 80 }: UsePullToRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);

  const pullProgress = Math.min(pullDistance / threshold, 1);

  const handleTouchStart = useCallback(
    (e: TouchEvent) => {
      if (isRefreshing) return;
      if (window.scrollY > 0) return;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    },
    [isRefreshing],
  );

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!pulling.current || isRefreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy < 0) {
        setPullDistance(0);
        return;
      }
      // Apply resistance so it feels natural
      setPullDistance(dy * 0.4);
    },
    [isRefreshing],
  );

  const handleTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold); // hold at threshold while refreshing
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
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

  return { isRefreshing, pullProgress, pullDistance };
}
