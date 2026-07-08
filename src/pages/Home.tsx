import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useScroll, useTransform } from "framer-motion";
import usePageTitle from "@/hooks/usePageTitle";
import PullIndicator from "@/components/patterns/PullIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useMotionSafe } from "@/lib/motion";
import Reveal from "@/components/motion/Reveal";
import FeaturedHero from "@/components/home/FeaturedHero";
import QuickPick from "@/components/home/QuickPick";
import ContinueLearning from "@/components/home/ContinueLearning";
import YourWeek from "@/components/home/YourWeek";
import UpcomingSessions from "@/components/home/UpcomingSessions";
import PopularCommunity from "@/components/home/PopularCommunity";
import UpcomingEvents from "@/components/home/UpcomingEvents";
import NewMembers from "@/components/home/NewMembers";
import CatalogSection from "@/components/catalog/CatalogSection";
import {
  LoadingSwap,
  SkeletonBlock,
  SkeletonCard,
  SkeletonGrid,
  SkeletonLine,
} from "@/components/patterns/LoadingState";
import {
  useCatalog,
  useEnrolledOfferingIds,
  CATALOG_QUERY_KEY,
  ENROLLED_OFFERINGS_QUERY_KEY,
} from "@/components/catalog/useCatalog";

// Feed-shaped placeholder for the first paint: the above-the-fold block plus
// the catalog header + card grid. Built from the shared skeleton primitives and
// sized to mirror the real feed's above-the-fold block so the LoadingSwap
// crossfade lands with no layout shift (see LoadingSwap's zero-CLS contract).
//
// The above-the-fold block is BRANCHED on the same enrolment signal the feed
// itself gates on, so the placeholder matches the shape that is about to paint:
//   • Enrolled users lead with the resume rail (YourWeek / ContinueLearning) →
//     a 3-card media row.
//   • Zero-enrolment users have NO resume rail; their feed leads with
//     FeaturedHero → a full-bleed banner block mirroring the hero's bleed +
//     aspect ratios.
// `hasEnrolments` is guaranteed accurate at the crossfade: LoadingSwap only
// swaps once `isFeedLoading` is false, which requires `enrolmentsLoading` false,
// so the skeleton's final frame always matches the real feed (no
// flash-of-wrong-shape at the handoff).
const HomeFeedSkeleton = ({ hasEnrolments }: { hasEnrolments: boolean }) => (
  <div className="space-y-10" aria-busy="true" aria-live="polite">
    {hasEnrolments ? (
      <div className="space-y-3">
        <SkeletonLine width="42%" height="20px" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} variant="media" />
          ))}
        </div>
      </div>
    ) : (
      // Mirrors FeaturedHero's outer frame: same `-mx-4 md:mx-0` full-bleed and
      // `rounded-none md:rounded-3xl`, and the same responsive aspect ratios +
      // `max-h-[520px]` so the banner placeholder occupies the hero's exact box.
      <div
        aria-hidden
        className="skeleton-shimmer -mx-4 md:mx-0 rounded-none md:rounded-3xl aspect-[4/5] sm:aspect-[16/8] lg:aspect-[21/8] max-h-[520px] w-full"
      />
    )}
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonLine width="18%" height="12px" />
        <SkeletonLine width="55%" height="28px" />
      </div>
      <SkeletonBlock height={44} className="max-w-md" />
      <SkeletonGrid count={6} variant="media" />
    </div>
  </div>
);

const greetingForHour = (hour: number) =>
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

// ── Home: the single feed ──
// Browse is merged in: resume, what's next, then shop. Every section hides
// itself when it has nothing to show, so the feed never renders dead blocks.
const Home = () => {
  usePageTitle("Home");
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: enrolledOfferingIds, isLoading: enrolmentsLoading } =
    useEnrolledOfferingIds();
  const hasEnrolments = !!enrolledOfferingIds && enrolledOfferingIds.size > 0;

  // First-paint gate for the feed's skeleton→content handoff. Subscribes to the
  // same react-query keys the feed already reads (no extra fetch — dedup'd), so
  // the crossfade fires once both the catalogue and the user's entitlements have
  // landed and the feed can paint complete. `isLoading` is only true with an
  // empty cache, so revisits skip the skeleton and render instantly; a
  // pull-to-refresh refetch keeps `isLoading` false (data stays cached) and
  // never re-triggers the skeleton.
  const { isLoading: catalogLoading } = useCatalog();
  const isFeedLoading = catalogLoading || enrolmentsLoading;

  const [refreshKey, setRefreshKey] = useState(0);
  const handleRefresh = useCallback(async () => {
    // Catalog + entitlements live in react-query; legacy sections refetch
    // on remount via the refreshKey.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: [ENROLLED_OFFERINGS_QUERY_KEY] }),
    ]);
    setRefreshKey((k) => k + 1);
  }, [queryClient]);

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  // Condensing greeting: as the page scrolls, the large serif greeting shrinks
  // and fades in place while PARKED at the top of Home's own scroll context.
  // Choreography is transform/opacity only, driven entirely off the viewport
  // scrollY MotionValue — no layout reads in the handler — and scoped to Home's
  // own band; StudentLayout's sticky header and html/body/overflow are never
  // touched (June-14 scroll lesson). transform-origin left keeps the serif name
  // anchored as it shrinks against the parked band.
  //
  // PARKING: plain compositor-native `position: sticky` on the band's wrapper —
  // every engine, every pointer type, zero lag. This is only possible because
  // P5-X1 moved the horizontal-overflow clip OFF the html/body scroll root and
  // onto `#root` (see index.css), so the document root no longer resolves to a
  // scroll container that used to defeat native sticky on coarse Chromium. No
  // probe, no JS fallback, no occlusion panel — the ~200-line machinery that
  // worked around the old root-overflow rule is gone. Transform/opacity only;
  // the document root always keeps scrolling.
  const { reduced } = useMotionSafe();
  const { scrollY } = useScroll();
  const greetingScale = useTransform(scrollY, [0, 120], [1, 0.82]);
  const greetingOpacity = useTransform(scrollY, [0, 100], [1, 0.7]);
  const greetingY = useTransform(scrollY, [0, 120], [0, -4]);
  // The sub-line ("Pick up where you left off") fades out fully as the greeting
  // condenses, so the parked band reads as a single tight line once collapsed.
  const subOpacity = useTransform(scrollY, [0, 60], [1, 0]);

  return (
    <>
      {/* Pull-to-refresh: branded node-mark indicator (overlays the top of the
          content, never reflows it). Always mounted so the release spring plays. */}
      <PullIndicator onRefresh={handleRefresh} />

      {/* One warm line, no date, no member number, no big cream card.
          Condenses on scroll AND parks: the band is plain `position: sticky` at
          the header line so it holds its spot instead of scrolling off (the
          momentum cue lands rather than vanishing). Native sticky now works on
          every engine because P5-X1 moved the horizontal-overflow clip off the
          html/body scroll root onto #root (index.css) — no probe, no JS fallback.

          CRITICAL: this sticky wrapper MUST stay a DIRECT child of the page
          scroll context and OUTSIDE the .anim-rise feed container below. A
          persistent CSS transform on any ancestor (the .anim-rise div runs
          `motion-rise` with `both` fill, so its transform matrix never clears)
          establishes a containing block that silently kills position:sticky —
          the band scrolls away instead of parking. Keep it as a sibling of the
          feed, never a descendant of an animated/transformed element.

          The band uses a SOLID bg-canvas (no backdrop-filter) — the brief forbids
          any new backdrop-blur, and a solid fill is what actually reads as
          "parked" over the dark feed anyway. Choreography is transform/opacity
          only; static under reduced motion.

          It parks at `calc(4rem + safe-area-inset-top)` — the line directly below
          StudentLayout's app header (`safe-top` padding + min-h-16) — so the two
          sticky chromes stack cleanly with no visual jump. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 -mt-6 md:-mt-10">
        {/* The header carries the SOLID bg-canvas fill and must stay fully
            opaque so the parked band actually occludes the hero image + catalog
            title/pills scrolling beneath it — hence NO opacity here. The
            condense-fade lives on the inner text wrapper below, so only the
            greeting text recedes while the backdrop keeps blocking. */}
        <motion.header className="px-4 md:px-8 lg:px-10 xl:px-12 pt-6 md:pt-10 pb-3 bg-canvas">
          <motion.div
            style={
              reduced
                ? undefined
                : {
                    scale: greetingScale,
                    y: greetingY,
                    opacity: greetingOpacity,
                    transformOrigin: "left center",
                  }
            }
          >
            <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em]">
              {greetingForHour(new Date().getHours())},{" "}
              <span className="font-serif-italic text-cream">{firstName}</span>
            </h1>
            {hasEnrolments && (
              <motion.p
                className="text-sm text-muted-foreground mt-1"
                style={reduced ? undefined : { opacity: subOpacity }}
              >
                Pick up where you left off
              </motion.p>
            )}
          </motion.div>
        </motion.header>
      </div>

      {/* The feed itself, behind a skeleton→content crossfade (LoadingSwap) that
          fires once the catalogue + entitlements land. The LoadingSwap owns the
          top rhythm (mt-10) so both the skeleton and the real feed share it; the
          inner .anim-rise keeps its transform-bearing entrance stagger. Neither
          wraps the sticky greeting band above — that stays a sibling, so no
          transform establishes a containing block that would break its parking
          (June-14 sticky/containing-block lesson). */}
      <LoadingSwap
        className="mt-10"
        loading={isFeedLoading}
        skeleton={<HomeFeedSkeleton hasEnrolments={hasEnrolments} />}
      >
      <div className="space-y-10 anim-rise">
      {/* Your-Week glance strip — most-active course ring, lessons completed,
          next-lesson resume. Gated on hasEnrolments (mirrors ContinueLearning);
          renders nothing for zero-enrolment users. */}
      {hasEnrolments && <YourWeek key={`yw-${refreshKey}`} />}

      {hasEnrolments && (
        <Reveal className="empty:hidden">
          <ContinueLearning key={`cl-${refreshKey}`} />
        </Reveal>
      )}

      <Reveal className="empty:hidden">
        <UpcomingSessions key={`us-${refreshKey}`} />
      </Reveal>

      <Reveal className="empty:hidden">
        <FeaturedHero />
      </Reveal>

      {/* Quick Pick: four highest-intent jumps, directly under the hero. */}
      <Reveal>
        <QuickPick />
      </Reveal>

      {/* NOT in a <Reveal>: the catalog spans several viewports, so the
          0.15 intersection threshold may never be reached (15% of a very
          tall element can exceed the screen) and it would stay invisible.
          The page-root .anim-rise covers its entrance instead. */}
      <CatalogSection />

      <Reveal className="empty:hidden">
        <PopularCommunity key={`pc-${refreshKey}`} />
      </Reveal>

      <Reveal className="empty:hidden">
        <UpcomingEvents key={`ue-${refreshKey}`} />
      </Reveal>

      <Reveal className="empty:hidden">
        <NewMembers key={`nm-${refreshKey}`} />
      </Reveal>
      </div>
      </LoadingSwap>
    </>
  );
};

export default Home;
