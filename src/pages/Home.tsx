import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useScroll, useTransform } from "framer-motion";
import { Loader2 } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useAuth } from "@/contexts/AuthContext";
import { useMotionSafe, useFinePointer } from "@/lib/motion";
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

// Feed-shaped placeholder for the first paint: a resume-rail row plus the
// catalog header + card grid. Built from the shared skeleton primitives and
// sized to mirror the real feed's above-the-fold block so the LoadingSwap
// crossfade lands with no layout shift (see LoadingSwap's zero-CLS contract).
const HomeFeedSkeleton = () => (
  <div className="space-y-10" aria-busy="true" aria-live="polite">
    <div className="space-y-3">
      <SkeletonLine width="42%" height="20px" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <SkeletonCard key={i} variant="media" />
        ))}
      </div>
    </div>
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

// ── Native-sticky parking probe ──
// The condensing greeting parks at the top of the feed. Where the engine allows
// it we park with compositor-native `position: sticky` — pinned by the compositor
// with ZERO lag. But the mandatory coarse-pointer rule in index.css
// (`@media (pointer: coarse){ html,body{ overflow-x: hidden } }` — the June-14
// scroll fix, which must NOT change) forces the scroll root's `overflow-y` to
// resolve to `auto` (per CSS, when one overflow axis is non-visible the other
// computes to `auto`), turning the document root into a scroll container that
// DEFEATS native sticky on Chromium — empirically confirmed: the band rides the
// scroll instead of holding its line. WebKit's sticky may survive the same
// condition, so rather than ASSUME from pointer type (the old `!useFinePointer()`
// gate blindly swept every touch engine — incl. iOS — onto a JS fallback), we
// MEASURE the real behaviour on the actual device and only fall back where sticky
// provably fails to park.
//
// Measurement: drop a hidden `position: sticky` probe at the top of the document,
// nudge the real scroller a few px, read whether the probe held its viewport line,
// then restore the scroll position — all synchronously in one tick, so the browser
// never paints the intermediate state (imperceptible; changes NO CSS/overflow, so
// it is categorically NOT the June-14 class of persistent-overflow edits).
const detectStickyParkingBroken = (): boolean => {
  if (typeof document === "undefined") return false;
  const scroller = document.scrollingElement as HTMLElement | null;
  if (!scroller) return false;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:sticky;top:0;height:1px;width:1px;visibility:hidden;pointer-events:none;";
  document.body.insertBefore(probe, document.body.firstChild);
  const start = scroller.scrollTop;
  try {
    const room = scroller.scrollHeight - scroller.clientHeight;
    if (room < 1) return false; // nothing to scroll ⇒ parking is moot ⇒ sticky is fine
    const before = probe.getBoundingClientRect().top;
    // Nudge in whichever direction the scroller can actually move.
    const delta = start + 6 <= room ? 6 : -6;
    scroller.scrollTop = start + delta;
    const moved = scroller.scrollTop - start;
    if (Math.abs(moved) < 1) return false;
    const after = probe.getBoundingClientRect().top;
    // A working sticky holds its line (after ≈ before); a broken one rides the
    // scroll (after drifts by ~ -moved).
    return Math.abs(after - before) >= Math.abs(moved) / 2;
  } finally {
    scroller.scrollTop = start; // restore same-tick, before paint
    probe.remove();
  }
};

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
  // and fades in place while PARKED at the top of Home's own scroll context.
  // Choreography is transform/opacity only, driven entirely off the viewport
  // scrollY MotionValue — no layout reads in the handler — and scoped to Home's
  // own band; StudentLayout's sticky header and html/body/overflow are never
  // touched (June-14 scroll lesson). transform-origin left keeps the serif name
  // anchored as it shrinks against the parked band.
  //
  // PARKING STRATEGY — measured, native-first, no html/body edit (June-14, Tier-1):
  // The band parks with compositor-native `position: sticky` wherever the engine
  // honours it (fine-pointer/desktop always; touch engines whose sticky survives
  // the coarse overflow rule) — pinned by the compositor with zero lag/judder. The
  // ONLY place that fails is where the mandatory coarse-pointer
  // `@media (pointer: coarse) { html, body { overflow-x: hidden } }` rule (the
  // June-14 scroll fix, which must NOT change) turns the scroll root into an
  // `overflow-y: auto` scroll container that defeats sticky (see the probe note
  // above). There we, and ONLY there, fall back to an in-flow transform that
  // translates the band back DOWN by the scroll amount so it holds its slot. We
  // detect that condition by MEASURING native sticky on the real device rather
  // than assuming it from `(pointer: coarse)` — so a touch engine (e.g. iOS
  // WKWebView) whose sticky actually parks keeps the native path and is never
  // degraded to the JS fallback. `position: fixed` is NOT an option here: the
  // shell's `.page-enter` content wrapper carries an entrance transform, and a
  // transformed ancestor re-bases `position: fixed` onto itself (it would scroll
  // away), so an in-flow transform is the only lag-source that still parks in this
  // DOM. Transform/opacity only; the document root always keeps scrolling.
  const { reduced } = useMotionSafe();
  const finePointer = useFinePointer();
  const { scrollY } = useScroll();
  const greetingScale = useTransform(scrollY, [0, 120], [1, 0.82]);
  const greetingOpacity = useTransform(scrollY, [0, 100], [1, 0.7]);
  const greetingY = useTransform(scrollY, [0, 120], [0, -4]);
  // The sub-line ("Pick up where you left off") fades out fully as the greeting
  // condenses, so the parked band reads as a single tight line once collapsed.
  const subOpacity = useTransform(scrollY, [0, 60], [1, 0]);

  // Measured once on mount (and re-measured if the primary pointer flips, which
  // changes whether the coarse overflow rule applies). Defaults to `false` so the
  // first paint uses native sticky — identical to the fallback at scrollY 0, so the
  // one-time flip on a broken engine is seamless.
  const [stickyParkingBroken, setStickyParkingBroken] = useState(false);
  useEffect(() => {
    setStickyParkingBroken(detectStickyParkingBroken());
  }, [finePointer]);

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
          transform/opacity only; static under reduced motion. The wrapper
          carries the parked backdrop; the inner motion element carries the
          condense transform.

          Native sticky works → `position: sticky` at the header line (compositor,
          cheap, no lag). Sticky measurably BROKEN (coarse overflow rule defeats it
          on this engine) → `position: relative` + a scroll-linked `y: scrollY`
          translate that pins the band at the SAME line (see the parking-strategy
          note above). The band's natural flow slot already lands at
          `calc(4rem + safe-area-inset-top)` — StudentLayout's header is
          `safe-top` padding + min-h-16 — so both paths park on the same line
          with no visual jump. Parking (not the condense) stays on under reduced
          motion, matching the sticky path which is always live. */}
      <motion.div
        className={
          stickyParkingBroken
            ? "relative z-30 -mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 -mt-6 md:-mt-10"
            : "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 -mt-6 md:-mt-10"
        }
        style={stickyParkingBroken ? { y: scrollY } : undefined}
      >
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
      </motion.div>

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
        skeleton={<HomeFeedSkeleton />}
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
