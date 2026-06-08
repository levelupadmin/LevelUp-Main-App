import { SkeletonLine, SkeletonBlock } from "@/components/patterns";

/**
 * RouteFallback — the Suspense fallback for top-level lazy routes.
 *
 * Replaces the old black-screen + centered-spinner fallback that made every
 * lazy navigation feel like the app had stalled. Instead we paint a calm,
 * branded skeleton on the real app background (`--canvas`) the instant a chunk
 * starts loading, so the transition reads as "content arriving" rather than
 * "app frozen".
 *
 * Design notes:
 * - Uses the same `.skeleton-shimmer` cadence as every in-page skeleton, so
 *   the route-level placeholder and the page's own loaders breathe together.
 * - `bg-canvas` matches the layout shells (StudentLayout / AdminLayout both
 *   use `bg-canvas`), so there is zero color flash when the chunk resolves.
 * - Safe-area aware (`safe-top`) so the placeholder header never tucks under
 *   the Dynamic Island / status bar on iOS, matching the real top bar.
 * - No spinner: a spinner communicates "indeterminate wait"; a skeleton
 *   communicates "this exact layout is loading", which feels faster.
 */
const RouteFallback = () => (
  <div className="min-h-screen bg-canvas safe-top" role="status" aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading…</span>

    {/* Mimics the sticky top bar so the chrome appears instantly, not after the chunk lands */}
    <div className="flex items-center justify-between px-4 md:px-8 h-16 border-b border-border">
      <SkeletonLine width={120} height="20px" className="rounded-md" />
      <SkeletonLine width={36} height="36px" className="rounded-full" />
    </div>

    {/* Content placeholder — a hero block + a couple of text rows + a card row.
        Generic enough to fit any page, specific enough to feel like real content. */}
    <div className="px-4 md:px-8 py-6 space-y-6 max-w-5xl mx-auto w-full">
      <SkeletonBlock height={180} className="rounded-2xl" />

      <div className="space-y-3">
        <SkeletonLine width="45%" height="18px" />
        <SkeletonLine width="80%" height="12px" />
        <SkeletonLine width="65%" height="12px" />
      </div>

      <div className="flex gap-4 overflow-hidden">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock
            key={i}
            height={140}
            className="rounded-2xl flex-1 min-w-[180px]"
          />
        ))}
      </div>
    </div>
  </div>
);

export default RouteFallback;
