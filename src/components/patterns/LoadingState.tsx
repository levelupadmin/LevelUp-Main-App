import { cn } from "@/lib/utils";

/**
 * LoadingState — unified loading primitives.
 *
 * `<SkeletonLine />`, `<SkeletonBlock />`, `<SkeletonCard />`, and the
 * grid-of-skeleton `<SkeletonGrid />` all use the `.skeleton-shimmer`
 * animation defined in index.css so every loading screen breathes at
 * the same cadence.
 *
 * Replaces the 10+ places that reached for raw `animate-pulse bg-surface-2`.
 */

export function SkeletonLine({
  className,
  width = "100%",
  height = "1em",
}: { className?: string; width?: string | number; height?: string | number }) {
  return (
    <span
      className={cn("skeleton-shimmer block rounded-md", className)}
      style={{ width, height }}
      aria-hidden
    />
  );
}

export function SkeletonBlock({
  className,
  height = 120,
}: { className?: string; height?: string | number }) {
  return (
    <div
      className={cn("skeleton-shimmer rounded-xl", className)}
      style={{ height }}
      aria-hidden
    />
  );
}

/**
 * SkeletonCard — visually-matched placeholder for `SurfaceCard` content.
 * Pass `variant="media"` for cards that have a top image block.
 */
export function SkeletonCard({
  variant = "default",
  className,
}: { variant?: "default" | "media"; className?: string }) {
  if (variant === "media") {
    return (
      <div className={cn("surface-card overflow-hidden", className)}>
        <SkeletonBlock className="rounded-none rounded-t-xl" height={160} />
        <div className="p-4 space-y-2">
          <SkeletonLine height="14px" width="70%" />
          <SkeletonLine height="12px" width="40%" />
        </div>
      </div>
    );
  }
  return (
    <div className={cn("surface-card p-4 space-y-2", className)}>
      <SkeletonLine height="14px" width="60%" />
      <SkeletonLine height="12px" width="40%" />
      <SkeletonLine height="12px" width="80%" />
    </div>
  );
}

/** Grid of skeleton cards — handy for list loading states. */
export function SkeletonGrid({
  count = 4,
  variant = "default",
  cols = "sm:grid-cols-2 lg:grid-cols-3",
  className,
}: {
  count?: number;
  variant?: "default" | "media";
  cols?: string;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-4", cols, className)} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} variant={variant} />
      ))}
    </div>
  );
}

/** Full-page spinner centered in the viewport (kept for transitions). */
export function PageSpinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20" role="status">
      <span className="h-10 w-10 rounded-full border-2 border-border border-t-cream animate-spin" />
      {label && <p className="caption">{label}</p>}
    </div>
  );
}
