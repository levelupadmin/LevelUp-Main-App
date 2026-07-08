import { motion, useTransform } from "framer-motion";
import { cn } from "@/lib/utils";
import { useMotionSafe } from "@/lib/motion";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// LevelUp node-mark — the four "node" rings + three connectors lifted verbatim
// from the wordmark's decorative cluster (LevelUpWordmark.tsx, the group commented
// "decorative dots and lines"). Kept as raw <path> data, NOT an image asset, so
// Home + Community share ONE branded indicator with zero new files in the bundle.
// Coordinates stay in the wordmark's 115×56 space; the viewBox below frames just
// the cluster. Rendered as strokes (fill:none) so the mark can DRAW with pull
// progress via stroke-dashoffset.
const NODE_MARK_PATHS = [
  // rings (nodes)
  "M71.9524 12.1978C71.2961 12.1978 70.6545 12.3914 70.1087 12.7541C69.563 13.1169 69.1376 13.6325 68.8865 14.2358C68.6352 14.839 68.5695 15.5028 68.6975 16.1432C68.8257 16.7836 69.1417 17.3719 69.6058 17.8336C70.0699 18.2953 70.6612 18.6098 71.305 18.7371C71.9488 18.8645 72.616 18.7992 73.2224 18.5492C73.8288 18.2994 74.3471 17.8762 74.7117 17.3333C75.0764 16.7904 75.271 16.1521 75.271 15.4991C75.271 15.0656 75.1852 14.6363 75.0184 14.2358C74.8517 13.8353 74.6072 13.4713 74.299 13.1647C73.9908 12.8582 73.625 12.615 73.2224 12.4491C72.8198 12.2832 72.3882 12.1978 71.9524 12.1978ZM71.9524 17.4462C71.565 17.4462 71.1864 17.3318 70.8644 17.1176C70.5424 16.9034 70.2915 16.5989 70.1436 16.2427C69.9957 15.8865 69.9573 15.4947 70.0334 15.1169C70.1094 14.739 70.2965 14.3921 70.5709 14.12C70.8453 13.848 71.1947 13.6631 71.5748 13.5888C71.9548 13.5144 72.3486 13.5539 72.7061 13.7023C73.0636 13.8507 73.3688 14.1013 73.583 14.4223C73.7973 14.7434 73.9109 15.1205 73.9096 15.5059C73.9096 16.0222 73.7033 16.5175 73.3363 16.8826C72.9693 17.2477 72.4715 17.4529 71.9524 17.4529V17.4462Z",
  "M85.6363 1.81836C84.9801 1.81836 84.3384 2.01198 83.7925 2.37474C83.2466 2.7375 82.8211 3.25311 82.5704 3.85636C82.319 4.45961 82.253 5.12341 82.3811 5.76381C82.5091 6.40422 82.8257 6.99248 83.2896 7.45418C83.7534 7.91587 84.3453 8.23031 84.9885 8.35773C85.6325 8.48507 86.2995 8.41972 86.9059 8.16986C87.5124 7.91994 88.0306 7.49681 88.3956 6.9539C88.7597 6.41099 88.9545 5.7727 88.9545 5.11975C88.9545 4.24416 88.6049 3.40444 87.9831 2.78531C87.3606 2.16618 86.5165 1.81836 85.6363 1.81836ZM85.6363 7.06676C85.2492 7.06676 84.8704 6.95257 84.5484 6.73863C84.2272 6.52469 83.9757 6.2206 83.8278 5.86483C83.6798 5.50907 83.6407 5.11759 83.7166 4.7399C83.7917 4.36222 83.9788 4.01529 84.2525 3.743C84.5262 3.4707 84.8743 3.28527 85.2545 3.21014C85.634 3.13502 86.0273 3.17357 86.3854 3.32094C86.7426 3.4683 87.0485 3.71786 87.2632 4.03805C87.4786 4.35823 87.5936 4.73466 87.5936 5.11975C87.5913 5.63467 87.3836 6.12776 87.0171 6.49109C86.6506 6.85442 86.1538 7.05839 85.6363 7.05839V7.06676Z",
  "M98.4442 10.125C97.7879 10.125 97.1462 10.3186 96.6004 10.6814C96.0553 11.0442 95.6298 11.5598 95.3783 12.163C95.1276 12.7662 95.0617 13.4301 95.1897 14.0705C95.3177 14.7109 95.6336 15.2991 96.0974 15.7608C96.562 16.2226 97.1531 16.5369 97.7971 16.6643C98.4404 16.7917 99.1081 16.7263 99.7146 16.4765C100.321 16.2266 100.839 15.8035 101.203 15.2605C101.568 14.7176 101.763 14.0794 101.763 13.4264C101.763 12.5508 101.413 11.7111 100.791 11.092C100.168 10.4728 99.3243 10.125 98.4442 10.125ZM98.4442 15.3734C98.057 15.3737 97.6783 15.2598 97.3563 15.0461C97.0343 14.8323 96.7836 14.5284 96.6349 14.1726C96.4869 13.8169 96.4478 13.4253 96.5229 13.0476C96.5981 12.6698 96.7844 12.3227 97.0581 12.0502C97.3318 11.7778 97.6806 11.5921 98.0601 11.5169C98.4404 11.4416 98.8337 11.4801 99.1909 11.6274C99.549 11.7747 99.8549 12.0242 100.07 12.3445C100.285 12.6647 100.4 13.0412 100.4 13.4264C100.401 13.6824 100.35 13.9359 100.253 14.1726C100.155 14.4093 100.01 14.6245 99.8288 14.8058C99.6471 14.9871 99.4317 15.131 99.194 15.2293C98.9563 15.3275 98.7018 15.3782 98.4442 15.3784V15.3734Z",
  "M111.656 1.69869e-06C110.999 -0.00066067 110.358 0.192399 109.812 0.554758C109.265 0.917119 108.84 1.43249 108.587 2.03568C108.336 2.63887 108.27 3.30278 108.397 3.94341C108.525 4.58403 108.841 5.1726 109.305 5.63464C109.769 6.09668 110.36 6.41144 111.004 6.5391C111.648 6.66675 112.316 6.60157 112.922 6.3518C113.528 6.10202 114.047 5.67888 114.412 5.13589C114.777 4.59291 114.971 3.95448 114.971 3.30138C114.971 2.42638 114.622 1.58717 114.001 0.968133C113.379 0.349101 112.536 0.000889127 111.656 1.69869e-06ZM111.656 5.24673C111.269 5.24706 110.89 5.13311 110.568 4.9193C110.246 4.70549 109.995 4.40142 109.846 4.04558C109.698 3.68974 109.659 3.29812 109.735 2.92028C109.81 2.54245 109.996 2.19536 110.27 1.92296C110.545 1.65057 110.893 1.46511 111.273 1.39003C111.652 1.31496 112.046 1.35366 112.404 1.50123C112.762 1.6488 113.068 1.89861 113.282 2.21906C113.497 2.5395 113.612 2.91616 113.611 3.30138C113.611 3.81732 113.406 4.31213 113.039 4.67695C112.672 5.04177 112.175 5.24673 111.656 5.24673Z",
  // connectors
  "M82.5152 5.49316L73.6094 13.572L74.4315 14.4688L83.3378 6.39003L82.5152 5.49316Z",
  "M109.615 4.60693L100.709 12.6857L101.532 13.5826L110.437 5.5038L109.615 4.60693Z",
  "M88.4832 5.0835L87.6904 6.00671L95.8255 12.9134L96.6175 11.9903L88.4832 5.0835Z",
];

interface PullIndicatorProps {
  /** Refresh handler run when the pull crosses the threshold. */
  onRefresh: () => Promise<void> | void;
  /** Pull distance (px, resisted) at which a release triggers a refresh. */
  threshold?: number;
}

/**
 * Branded pull-to-refresh indicator shared by Home + Community. A 44px surface-2
 * circle holding the 28px LevelUp node-mark whose cream stroke DRAWS with pull
 * progress and SPINS while refreshing.
 *
 * Positioning: `absolute` at the top of the page's content wrapper (which is
 * `position: relative` — StudentLayout's inner container), so it overlays the top
 * of the feed and slides down WITHOUT reflowing content — no layout thrash, and it
 * never touches html/body overflow (the June-14 invariant). It sits at `z-40` so
 * it paints OVER Home's opaque `z-30` sticky greeting band (which is a sibling in
 * the same content wrapper — at a lower z the branded mark would be occluded by
 * that band for nearly the whole pull, diverging from Community which has no such
 * band). It stays confined to the wrapper's own `z-10` stacking context, so this
 * can never escape above StudentLayout's `z-40` app header — both pages now show
 * the mark identically.
 *
 * PERF: this component OWNS the pull gesture (via `usePullToRefresh`) and binds its
 * `MotionValue`s directly to `motion.*` styles, so a drag writes transform/stroke
 * straight to the compositor and NEVER reconciles the host feed (Home/Community) —
 * or even this leaf — per frame. The host just passes `onRefresh`.
 *
 * Motion is transform/opacity only; the finger-follow is 1:1 and the release
 * retracts on the glide curve (`--ease-spring` / `--motion-base`, driven by framer
 * `animate()` inside the hook) instead of snapping. Reduced motion → static mark,
 * no draw, instant retract.
 *
 * A11y: the moving mark is decorative (`aria-hidden` + `pointer-events-none`), so
 * the refresh is announced instead by a sibling `role="status"` live region — on
 * BOTH the animated and reduced paths. Because reduced motion gates OFF the spin
 * (the only in-progress cue), the reduced path also renders a STATIC "Refreshing…"
 * label so sighted reduced-motion users still see the refresh is in flight.
 */
export default function PullIndicator({ onRefresh, threshold }: PullIndicatorProps) {
  const { reduced } = useMotionSafe();
  const { isRefreshing, pullDistance, pullProgress } = usePullToRefresh({
    onRefresh,
    threshold,
  });

  // Stroke draw: full ring under reduced motion (static mark, no draw); otherwise
  // mapped to pull progress — which is animated to 1 while refreshing, so the mark
  // holds fully drawn during the spin. pathLength={1} normalises every subpath to
  // one unit, so a single dashoffset draws the whole cluster in unison.
  const dashoffset = useTransform(pullProgress, (p) => (reduced ? 0 : Math.max(0, 1 - p)));

  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-col items-center"
        style={{ y: pullDistance, opacity: pullProgress }}
      >
        <div className="mt-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-2 shadow-sm">
          <svg
            viewBox="68 -1 48 21"
            className={cn(
              "h-7 w-7 text-[hsl(var(--cream))]",
              isRefreshing && !reduced && "animate-spin",
            )}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            xmlns="http://www.w3.org/2000/svg"
          >
            {NODE_MARK_PATHS.map((d) => (
              <motion.path
                key={d}
                d={d}
                pathLength={1}
                strokeDasharray={1}
                // Draw follows the pull 1:1 (finger-follow) and un-draws on release as
                // the hook animates pullDistance→0; dashoffset is derived from the same
                // MotionValue, so no CSS transition is needed and nothing reconciles.
                style={{ strokeDashoffset: dashoffset }}
              />
            ))}
          </svg>
        </div>
        {/* Reduced-motion in-progress affordance: the spin is gated OFF above, so the
            static mark alone can't distinguish a held pull from an in-flight refresh.
            A static caption fills that gap. Decorative (this branch inherits the
            wrapper's aria-hidden) — the live region below owns the announcement. */}
        {reduced && isRefreshing && (
          <span className="mt-1.5 text-[11px] font-medium text-muted-foreground">
            Refreshing…
          </span>
        )}
      </motion.div>
      {/* The mark above is aria-hidden, so pull-to-refresh was otherwise silent to
          screen readers. This polite live region announces the in-flight refresh on
          both the animated and reduced paths (empty string ⇒ nothing to announce). */}
      <span role="status" aria-live="polite" className="sr-only">
        {isRefreshing ? "Refreshing…" : ""}
      </span>
    </>
  );
}
