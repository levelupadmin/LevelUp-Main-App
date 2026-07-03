import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useScroll, useTransform } from "framer-motion";
import { Loader2 } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
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
  useEnrolledOfferingIds,
  CATALOG_QUERY_KEY,
  ENROLLED_OFFERINGS_QUERY_KEY,
} from "@/components/catalog/useCatalog";

const greetingForHour = (hour: number) =>
  hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

// ── Home: the single feed ──
// Browse is merged in: resume, what's next, then shop. Every section hides
// itself when it has nothing to show, so the feed never renders dead blocks.
const Home = () => {
  usePageTitle("Home");
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: enrolledOfferingIds } = useEnrolledOfferingIds();
  const hasEnrolments = !!enrolledOfferingIds && enrolledOfferingIds.size > 0;

  const [refreshKey, setRefreshKey] = useState(0);
  const { isRefreshing, pullProgress, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      // Catalog + entitlements live in react-query; legacy sections refetch
      // on remount via the refreshKey.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: [ENROLLED_OFFERINGS_QUERY_KEY] }),
      ]);
      setRefreshKey((k) => k + 1);
    },
  });

  const firstName = profile?.full_name?.split(" ")[0] ?? "there";

  // Condensing greeting: as the page scrolls, the large serif greeting shrinks
  // and fades in place while PARKED at the top of Home's own scroll context
  // (the <header> is position:sticky, so it stops flowing away and holds its
  // spot). Choreography is transform/opacity only, driven entirely off the
  // viewport scrollY MotionValue — no layout reads in the handler — and scoped
  // to Home's own <header>; StudentLayout's sticky header and html/body/overflow
  // are never touched (June-14 scroll lesson). transform-origin left keeps the
  // serif name anchored as it shrinks against the parked band.
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
      {/* Pull-to-refresh indicator */}
      {(pullDistance > 0 || isRefreshing) && (
        <div className="flex justify-center" style={{ height: pullDistance > 0 ? pullDistance : 40 }}>
          <Loader2
            className="h-5 w-5 text-muted-foreground"
            style={{
              opacity: isRefreshing ? 1 : pullProgress,
              transform: `rotate(${pullProgress * 360}deg)`,
              animation: isRefreshing ? "spin 1s linear infinite" : "none",
            }}
          />
        </div>
      )}

      {/* One warm line, no date, no member number, no big cream card.
          Condenses on scroll AND parks: the band is position:sticky at the top
          of Home's scroll context so it holds its spot instead of scrolling off
          (the momentum cue lands rather than vanishing).

          CRITICAL: this sticky wrapper MUST stay a DIRECT child of the page
          scroll context and OUTSIDE the .anim-rise feed container below. A
          persistent CSS transform on any ancestor (the .anim-rise div runs
          `motion-rise` with `both` fill, so its transform matrix never clears)
          establishes a containing block that silently kills position:sticky —
          the band scrolls away instead of parking. Keep it as a sibling of the
          feed, never a descendant of an animated/transformed element.

          On pure black the band uses a SOLID bg-canvas (no backdrop-filter) —
          the brief forbids any new backdrop-blur, and a solid fill is what
          actually reads as "parked" over the dark feed anyway. Choreography is
          transform/opacity only; static under reduced motion. The sticky
          wrapper carries the parked backdrop; the inner motion element carries
          the transform so `sticky` (computed on the un-transformed box) is
          never fought by framer's transform writes. */}
      <div className="sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 -mt-6 md:-mt-10">
        <motion.header
          className="px-4 md:px-8 lg:px-10 xl:px-12 pt-6 md:pt-10 pb-3 bg-canvas"
          style={
            reduced
              ? undefined
              : {
                  opacity: greetingOpacity,
                }
          }
        >
          <motion.div
            style={
              reduced
                ? undefined
                : {
                    scale: greetingScale,
                    y: greetingY,
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

      {/* The feed itself. .anim-rise runs a transform-bearing entrance keyframe,
          so it MUST NOT wrap the sticky band above (transform ⇒ containing block
          ⇒ broken sticky). The band sits before it, as a sibling. mt-10
          restores the vertical rhythm the old shared `space-y-10` gave between
          the band and the first feed section now that the band is a sibling. */}
      <div className="space-y-10 anim-rise mt-10">
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
    </>
  );
};

export default Home;
