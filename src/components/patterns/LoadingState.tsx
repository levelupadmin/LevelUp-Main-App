import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { durations, easings, useMotionSafe } from "@/lib/motion";

/**
 * LoadingState: unified loading primitives.
 *
 * `<SkeletonLine />`, `<SkeletonBlock />`, `<SkeletonCard />`, and the
 * grid-of-skeleton `<SkeletonGrid />` all use the `.skeleton-shimmer`
 * animation defined in index.css so every loading screen breathes at
 * the same cadence.
 *
 * Replaces the 10+ places that reached for raw `animate-pulse bg-surface-2`.
 *
 * `<LoadingSwap />` is the reusable skeleton→content handoff — see its own doc.
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
 * SkeletonCard: visually-matched placeholder for `SurfaceCard` content.
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

/** Grid of skeleton cards, handy for list loading states. */
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

/**
 * LoadingSwap: reusable skeleton→content handoff.
 *
 * While `loading` is true it renders `skeleton`; the moment it flips false the
 * skeleton fades OUT while `children` fade IN — one produced moment instead of an
 * instant pop. Timing comes straight from the motion tokens
 * (`durations.base` / `easings.out`) so the handoff matches every other
 * transition in the app; no one-off durations or easings.
 *
 * ONLY the OPACITY crossfade is owned here — deliberately NO translateY. The
 * entrance RISE belongs to the content itself (Home's feed rises via its own
 * `.anim-rise` keyframe). If LoadingSwap ALSO translated the content, that rise
 * would compose with the child's — two translateYs stacking on different
 * curves/durations (framer glide vs CSS keyframe) for a doubled, rough glide.
 * So LoadingSwap crossfades; the content owns its own rise (or simply fades in
 * cleanly when it brings none).
 *
 * Zero-CLS by construction: skeleton and content are stacked in a SINGLE
 * CSS-grid cell (both pinned to row/col 1), so they overlap during the
 * crossfade rather than stacking — the container is sized by whichever child is
 * mounted, and there is no flash-of-both-heights. Keep the skeleton built to the
 * content's dimensions and the swap introduces no layout shift.
 *
 * Reduced motion ⇒ instant swap: framer is bypassed entirely and the surface
 * simply renders skeleton-or-content, preserving the pre-choreography behaviour.
 *
 * Exported for adoption anywhere a query gates a surface — live on Home today,
 * and wired-ready for ChapterViewer's loading path (import it directly from
 * `@/components/patterns/LoadingState`).
 */
export function LoadingSwap({
  loading,
  skeleton,
  children,
  className,
}: {
  loading: boolean;
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { reduced } = useMotionSafe();

  // Reduced motion: no AnimatePresence, no crossfade — swap in place instantly.
  if (reduced) {
    return <div className={className}>{loading ? skeleton : children}</div>;
  }

  const transition = { duration: durations.base, ease: easings.out };

  return (
    // grid + one cell (`[&>*]:col/row-start-1`): the skeleton and the content
    // occupy the SAME cell so they crossfade in place. `mode="sync"` keeps both
    // mounted through the transition; `initial={false}` stops the first paint
    // from animating (the skeleton just appears, no fade-in flash).
    <div className={cn("grid grid-cols-1 [&>*]:col-start-1 [&>*]:row-start-1", className)}>
      <AnimatePresence initial={false} mode="sync">
        {loading ? (
          // No `aria-hidden` here: the skeleton branch carries the loading live
          // region (`aria-busy`/`aria-live`), and hiding this wrapper would bury
          // that region in an aria-hidden subtree so it never announces under
          // normal motion — while the reduced-motion branch above (which has no
          // wrapper) would announce. Leaving it exposed keeps the announcement
          // consistent across both motion paths.
          <motion.div
            key="skeleton"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
          >
            {skeleton}
          </motion.div>
        ) : (
          <motion.div
            key="content"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={transition}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * RevealOnMount: crossfade a resolved surface in from its skeleton on MOUNT.
 *
 * Use when the skeleton and the loaded content live in SEPARATE render branches —
 * e.g. a page whose loaded content sits PAST early-return guards (a `!data` /
 * platform revenue-guard that must not move), so a single `<LoadingSwap>` can't
 * stay mounted across the handoff and flipping its `loading` prop is impossible
 * without hoisting those guards. Render `<RevealOnMount>` ONLY in the loaded
 * branch (data already resolved, guards passed): it shows `skeleton` for the
 * first frame — seamlessly continuing whatever skeleton the loading branch was
 * already painting — then, on the next animation frame, crossfades to `children`.
 *
 * It owns no animation of its own: it just drives one mounted `<LoadingSwap>`
 * whose `loading` flips true→false, so the opacity handoff, timing tokens and
 * zero-CLS grid overlap are byte-identical to every other LoadingSwap handoff.
 *
 * Reduced motion ⇒ instant: `revealed` starts true, so content shows immediately
 * with no skeleton re-flash and no crossfade.
 */
export function RevealOnMount({
  skeleton,
  children,
  className,
}: {
  skeleton: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const { reduced } = useMotionSafe();
  // reduced ⇒ start revealed (instant, no re-flash); otherwise paint the
  // skeleton once, then flip on the next frame so the crossfade has a `from`.
  const [revealed, setRevealed] = useState(reduced);

  useEffect(() => {
    if (revealed) return;
    const id = requestAnimationFrame(() => setRevealed(true));
    return () => cancelAnimationFrame(id);
  }, [revealed]);

  return (
    <LoadingSwap loading={!revealed} skeleton={skeleton} className={className}>
      {children}
    </LoadingSwap>
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
