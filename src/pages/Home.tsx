import { useCallback, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, useScroll, useTransform } from "framer-motion";
import usePageTitle from "@/hooks/usePageTitle";
import PullIndicator from "@/components/patterns/PullIndicator";
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
// Measurement: drop two hidden 1px probes in normal flow at the top of the
// document — one `position: sticky`, one static reference — nudge the real
// scroller a few px, then read BOTH rects in a single layout pass to see
// whether the sticky probe held its viewport line while its static sibling
// rode the scroll, then restore the scroll position — all synchronously in one
// tick, so the browser never paints the intermediate state (imperceptible;
// changes NO CSS/overflow, so it is categorically NOT the June-14 class of
// persistent-overflow edits).
//
// Read/write discipline (this runs on mount and on every re-measure): all the
// scroller reads that gate the probe happen BEFORE any mutation, so the common
// short-page / skeleton case (nothing to scroll ⇒ parking is moot) bails with
// zero DOM writes and zero scroll writes — it never inserts a probe and never
// wakes useScroll's subscribers. On the measuring path the two rect reads are
// batched after the single nudge (no read→write→read interleave), so the probe
// costs one forced layout, not the previous double-reflow thrash.
const detectStickyParkingBroken = (): boolean => {
  if (typeof document === "undefined") return false;
  const scroller = document.scrollingElement as HTMLElement | null;
  if (!scroller) return false;

  // ── Reads first, mutations second ──
  const start = scroller.scrollTop;
  const room = scroller.scrollHeight - scroller.clientHeight;
  if (room < 1) return false; // nothing to scroll ⇒ parking is moot ⇒ sticky is fine

  const stickyProbe = document.createElement("div");
  stickyProbe.style.cssText =
    "position:sticky;top:0;height:1px;width:1px;visibility:hidden;pointer-events:none;";
  const flowProbe = document.createElement("div");
  flowProbe.style.cssText =
    "height:1px;width:1px;visibility:hidden;pointer-events:none;";
  document.body.insertBefore(flowProbe, document.body.firstChild);
  document.body.insertBefore(stickyProbe, flowProbe);
  try {
    // Nudge in whichever direction the scroller can actually move (one write).
    const delta = start + 6 <= room ? 6 : -6;
    scroller.scrollTop = start + delta;
    const moved = scroller.scrollTop - start;
    if (Math.abs(moved) < 1) return false;
    // Both reads land in the same forced layout — batched, no interleaved write.
    const stickyTop = stickyProbe.getBoundingClientRect().top;
    const flowTop = flowProbe.getBoundingClientRect().top;
    // A working sticky holds its viewport line while the static sibling rides
    // the scroll, so their gap ≈ the scroll delta; a broken sticky rides too,
    // collapsing the gap to ≈ 0.
    return Math.abs(stickyTop - flowTop) < Math.abs(moved) / 2;
  } finally {
    scroller.scrollTop = start; // restore same-tick, before paint
    stickyProbe.remove();
    flowProbe.remove();
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

  // Measured, then RE-measured whenever the result could change. Defaults to
  // `false` so the first paint uses native sticky — identical to the fallback at
  // scrollY 0, so the one-time flip on a broken engine is seamless.
  //
  // The probe early-returns `false` when the scroller has no room to move
  // (`scrollHeight - clientHeight < 1`) — parking is moot when nothing scrolls,
  // but that state also occurs on the SHORT first paint (while HomeFeedSkeleton is
  // mounted) and on short/tablet viewports, where it does NOT mean sticky works.
  // A single mount-time measurement would latch that `false` and leave the JS
  // fallback disarmed forever on a coarse engine whose native sticky is genuinely
  // broken — the band would ride the scroll once the tall real feed lands. So we
  // re-measure on the inputs that can flip room-to-scroll or sticky behaviour:
  //   • `finePointer` — flips whether the coarse overflow rule applies at all.
  //   • `isFeedLoading` — the skeleton→real-feed handoff is when the page grows
  //     from short to tall; effects run after commit, so `scrollHeight` already
  //     reflects the real feed by the time this re-runs.
  //   • resize / orientationchange — a rotate or split-view resize can cross the
  //     room<1 boundary in either direction (rAF-throttled so a rapid resize
  //     stream doesn't thrash the synchronous scroll-nudge probe).
  const [stickyParkingBroken, setStickyParkingBroken] = useState(false);

  // NOTE — no offscreen gate for the JS fallback (and none is possible). The
  // fallback PINS the band: `y: scrollY` translates it back down by exactly the
  // scroll amount so it holds its viewport line for the life of Home's scroll
  // context — the same pin native `position: sticky` gives on the working path.
  // A pinned element is, by construction, always at the top of the viewport, so
  // it can never self-report "offscreen": an IntersectionObserver reads the
  // transformed box and always sees it in-view (an earlier revision gated on
  // `useInView` here — that gate could never disengage and, worse, could latch
  // the band offscreen if Home mounted at non-zero scroll on a broken engine).
  // FeaturedHero can gate its ken-burns on inView because its section actually
  // scrolls away; a pinned band cannot. So the scroll-linked update genuinely
  // has to run every frame while the band is pinned — the mitigation is not to
  // skip the work but to keep it OFF the main thread: the fallback branch below
  // promotes the band to its own compositor layer (`transform-gpu
  // will-change-transform`), so framer's per-frame `y` write composites on the
  // GPU instead of stacking main-thread raster on the inner-header condense
  // transforms — which is the actual source of the mid-range Android jank.
  useEffect(() => {
    const measure = () => setStickyParkingBroken(detectStickyParkingBroken());
    let raf = 0;
    let idleTimer = 0;
    let lastScrollTs = 0;
    const onScroll = () => {
      lastScrollTs = performance.now();
    };
    // The probe writes scrollTop, and a programmatic scrollTop write cancels
    // an in-flight Blink fling — Android Chrome fires `resize` on URL-bar
    // collapse DURING scrolling, so probing straight off resize can dead-stop
    // the user's fling. Wait for ~200ms of scroll silence before probing.
    const measureWhenScrollIdle = () => {
      window.clearTimeout(idleTimer);
      if (performance.now() - lastScrollTs < 200) {
        idleTimer = window.setTimeout(measureWhenScrollIdle, 200);
      } else {
        measure();
      }
    };
    // Defer the (re)measure a frame instead of probing synchronously in the
    // effect body. This effect re-runs on the `isFeedLoading` skeleton→content
    // handoff; a synchronous probe here forces a reflow (scrollHeight read +
    // scrollTop nudge) inside that commit, stalling the crossfade paint. rAF
    // lets the handoff commit paint first, then lands the probe next frame —
    // same rAF gate the resize/orientation path already uses. The
    // reads-before-writes batching inside detectStickyParkingBroken is
    // unchanged.
    const scheduleMeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measureWhenScrollIdle);
    };
    scheduleMeasure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", scheduleMeasure);
    window.addEventListener("orientationchange", scheduleMeasure);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(idleTimer);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", scheduleMeasure);
      window.removeEventListener("orientationchange", scheduleMeasure);
    };
  }, [finePointer, isFeedLoading]);

  return (
    <>
      {/* Pull-to-refresh: branded node-mark indicator (overlays the top of the
          content, never reflows it). Always mounted so the release spring plays. */}
      <PullIndicator onRefresh={handleRefresh} />

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
            ? // `transform-gpu will-change-transform` promotes the parked band to
              // its own compositor layer so the scroll-linked translate composites
              // off the main thread instead of stacking main-thread raster work on
              // top of the inner-header condense transforms every scroll frame.
              "relative z-30 -mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 -mt-6 md:-mt-10 transform-gpu will-change-transform"
            : "sticky top-[calc(4rem+env(safe-area-inset-top))] z-30 -mx-4 md:-mx-8 lg:-mx-10 xl:-mx-12 -mt-6 md:-mt-10"
        }
        style={stickyParkingBroken ? { y: scrollY } : undefined}
      >
        {/* Header-strip occlusion — fallback path ONLY. The JS fallback pins the
            band at its flow slot `calc(4rem + safe-area)`, the line directly BELOW
            StudentLayout's app header. On the native-sticky path the header pins
            there and holds that 0→(4rem+safe) strip. But the fallback is armed by
            the SAME probe (`position:sticky;top:0`) the header relies on, so
            whenever we're here the header's own sticky is ALSO defeated by the
            coarse `overflow-x:hidden` root rule — it scrolls away and un-occludes
            the strip, letting hero/catalog content bleed through ABOVE the parked
            band. So the band must occlude that strip itself: an opaque bg-canvas
            panel anchored to the band's top (`bottom-full`) extending up by the
            header's exact height. Pinned with the band (child of the translated
            wrapper) so it holds the strip for the whole scroll. z-30 (< header's
            z-40): at scrollY 0 the real header renders ON TOP of it — no double
            paint, no jump, seamless with the native path — and as the header
            scrolls off, this keeps the strip covered. transform/opacity untouched;
            static under reduced motion. */}
        {stickyParkingBroken && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-full h-[calc(4rem+env(safe-area-inset-top))] bg-canvas"
          />
        )}
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
