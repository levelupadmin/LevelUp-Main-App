import { useCallback, useEffect, useState } from "react";
import { useIsRestoring, useQueryClient } from "@tanstack/react-query";
import {
  ENROLLED_PROGRESS_QUERY_KEY,
  enrolledProgressKey,
  useEnrolledProgress,
} from "@/hooks/useEnrolledProgress";
import { motion, useScroll, useTransform } from "framer-motion";
import usePageTitle from "@/hooks/usePageTitle";
import PullIndicator from "@/components/patterns/PullIndicator";
import { useAuth } from "@/contexts/AuthContext";
import { useMotionSafe } from "@/lib/motion";
import {
  APPLICANT_STAGE_REFRESH_KEYS,
  useApplicantStage,
} from "@/hooks/useApplicantStage";
import Reveal from "@/components/motion/Reveal";
import ApplicantStageCard from "@/components/home/ApplicantStageCard";
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

// The applicant card's reserved slot: its own BOX, not a guessed height. Same
// rounded-2xl surface and px/py as ApplicantStageCard, with one placeholder per
// element that card actually renders (chip, title, a two-line body, the 48px lg
// button) at each element's own type metrics. A single fixed height cannot
// serve this slot — the body wraps to two or three lines depending on variant
// and viewport — but mirroring the box tracks the real card to within one line
// on a 360px phone, where a flat number under-reserved every variant.
const ApplicantCardSkeleton = () => (
  <div
    aria-hidden
    className="rounded-2xl bg-surface ring-1 ring-white/5 px-4 py-4 sm:px-5 sm:py-5"
  >
    <SkeletonLine width="38%" height="22px" className="rounded-full" />
    <SkeletonLine width="62%" height="24px" className="mt-3" />
    <SkeletonLine width="100%" height="16px" className="mt-2" />
    <SkeletonLine width="72%" height="16px" className="mt-1.5" />
    <SkeletonBlock height={48} className="mt-4 w-full sm:w-44" />
  </div>
);

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
// swaps once `isFeedLoading` is false, which requires the persisted
// `enrolled-progress` query resolved, so the skeleton's final frame always
// matches the real feed (no flash-of-wrong-shape at the handoff).
//
// `hasApplicantCard` rides the same guarantee on a COLD open, where the gate
// also waits for the applicant read AND holds one render past it (see
// `isFeedLoading` below): the applicant card leads the feed, so without a
// matching slot it would inject the card's height ABOVE the hero after the
// crossfade and push the whole page down.
const HomeFeedSkeleton = ({
  hasEnrolments,
  hasApplicantCard,
}: {
  hasEnrolments: boolean;
  hasApplicantCard: boolean;
}) => (
  <div className="space-y-10" aria-busy="true" aria-live="polite">
    {hasApplicantCard && <ApplicantCardSkeleton />}
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
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // First-paint gate for the feed's skeleton→content handoff (P6-T3 warm open).
  // Gate ONLY on the two PERSISTED queries the feed's above-the-fold reads —
  // `enrolled-progress` (whitelisted, staleTime 5min) and `catalog`. Both are
  // restored from localStorage by PersistQueryClientProvider BEFORE any query
  // runs, so on a warm open `isLoading` is already false and the resume rail +
  // catalogue paint from last-known cache with ZERO network in the critical
  // path (stale-while-revalidate refreshes them in the background).
  //
  // Crucially this must NOT gate on `enrolled-offering-ids`: that query is
  // deliberately UNPERSISTED (it's the authoritative entitlement gate, staleTime
  // 0), so on a warm open it has no cache and its `isLoading` stays true until a
  // live round-trip returns — gating the feed on it forced the whole
  // personalized feed to wait for the network on every warm open, silently
  // defeating the persisted cache this lane built. We still subscribe to it (one
  // dedup'd call) so it revalidates from Home mount and keeps catalogue card
  // CTAs fresh, but it no longer blocks the crossfade.
  const { data: enrolledProgress, isLoading: progressLoading } =
    useEnrolledProgress(user?.id);
  const { isLoading: catalogLoading } = useCatalog();
  useEnrolledOfferingIds();
  const hasEnrolments = !!enrolledProgress?.hasEnrolments;

  // Applicant stage card (SP-5 / REQ-IDENT-4). `view` is null for anyone
  // without a live application — and for a terminal one — so the card is
  // ABSENT rather than empty, the same self-hiding contract every other
  // section on this feed follows. The hook fails soft (no throw, no spinner
  // lock), so a failed read or an unreachable reconciler is just "no card".
  const { view: applicantStage, isLoading: applicantLoading } = useApplicantStage();

  // Did this open have to FETCH the feed's own data (cold), or was it restored
  // from the persisted cache (warm)? Captured on the first render, so it stays a
  // stable property of the open rather than of time.
  //
  // It asks the CACHE directly rather than reading `isLoading`. During
  // PersistQueryClientProvider's restore window react-query pins every observer
  // to `fetchStatus: "idle"`, so `isLoading` is false for a cold open and a warm
  // one alike — a discriminator built on it happens to work today only because
  // Home is lazy-loaded (App.tsx) and therefore mounts after restore resolves,
  // and would silently invert if Home were ever eagerly imported, preloaded, or
  // mounted over a slow localStorage read in an Android WebView. Cached data for
  // the two persisted queries the feed's above-the-fold reads is the direct
  // signal, and `useIsRestoring` covers the one case where the cache cannot
  // answer yet. Both unknowns resolve to COLD, which is the safe direction: a
  // cold open reserves the applicant slot and waits for a read the feed is
  // fetching anyway (both probes are queries that gate the crossfade regardless),
  // so a false "cold" costs nothing while a false "warm" would drop the gate.
  const isRestoring = useIsRestoring();
  const [coldOpen] = useState(
    () =>
      isRestoring ||
      queryClient.getQueryData(CATALOG_QUERY_KEY) === undefined ||
      queryClient.getQueryData(enrolledProgressKey(user?.id)) === undefined,
  );

  // The applicant card is UNLIKE the other above-the-fold sections: its query
  // is not persisted, so it cannot resolve before first paint on a warm open.
  // Waiting for it unconditionally would put a network round-trip back in the
  // critical path of every warm open and silently defeat the persisted cache
  // (the exact regression the `enrolled-offering-ids` note above records). So
  // it joins the gate ONLY on a cold open, where the skeleton is on screen
  // anyway: the card then paints WITH the feed, in the slot the skeleton
  // reserved for it, instead of injecting above the hero afterwards.
  //
  // The release is deferred by ONE render on purpose. AnimatePresence renders an
  // EXITING child from the element it last held, so the skeleton crossfades out
  // with whatever props it had on the render BEFORE the swap. Dropping the gate
  // in the same render that the applicant read settles would therefore exit a
  // skeleton that never saw the answer — when the applicant query is the last of
  // the three to settle, the reserved slot would never paint at all and the feed
  // would still gain the card's height at the crossfade. Flipping this from an
  // effect guarantees one committed render where the read is settled and the
  // skeleton is still mounted, so it re-renders with the final shape first and
  // then exits with it.
  const [applicantGateReleased, setApplicantGateReleased] = useState(false);
  useEffect(() => {
    if (!applicantLoading) setApplicantGateReleased(true);
  }, [applicantLoading]);

  const isFeedLoading =
    catalogLoading || progressLoading || (coldOpen && !applicantGateReleased);

  const handleRefresh = useCallback(async () => {
    // Every Home section now reads through react-query (P6-T1), so a refresh is
    // pure cache invalidation — no `refreshKey` remount. Invalidating a key
    // prefix (e.g. ["enrolled-progress"]) matches all its user-scoped variants,
    // so the shared enrolment chain + each section key refetch together.
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: CATALOG_QUERY_KEY }),
      queryClient.invalidateQueries({ queryKey: [ENROLLED_OFFERINGS_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: [ENROLLED_PROGRESS_QUERY_KEY] }),
      queryClient.invalidateQueries({ queryKey: ["upcoming-sessions"] }),
      queryClient.invalidateQueries({ queryKey: ["quickpick"] }),
      queryClient.invalidateQueries({ queryKey: ["popular-community"] }),
      queryClient.invalidateQueries({ queryKey: ["upcoming-events"] }),
      queryClient.invalidateQueries({ queryKey: ["new-members"] }),
      // The applicant card too: an applicant who pays the app fee in the
      // external Razorpay browser comes back to a Home that was never
      // remounted, and with refetchOnWindowFocus off this pull is their only
      // way to move the card off its last-read stage. ALL THREE of its roots
      // (see APPLICANT_STAGE_REFRESH_KEYS) — with the reconciler on, the
      // funnel-stage query is the only one that sees that external capture, so
      // invalidating the application row alone leaves the card frozen.
      ...APPLICANT_STAGE_REFRESH_KEYS.map((queryKey) =>
        queryClient.invalidateQueries({ queryKey: [...queryKey] }),
      ),
    ]);
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
        skeleton={
          <HomeFeedSkeleton
            hasEnrolments={hasEnrolments}
            hasApplicantCard={!!applicantStage}
          />
        }
      >
      <div className="space-y-10 anim-rise">
      {/* The applicant's one line: label chip + a single primary action, or
          the claim step for a row that is not proven to be theirs yet. Leads
          the feed because for an applicant it IS the open loop; renders
          nothing at all for everyone else. On a cold open the crossfade has
          already waited for this read and the skeleton held its slot, so it
          arrives WITH the feed rather than pushing the hero down. */}
      {applicantStage && <ApplicantStageCard view={applicantStage} />}

      {/* Your-Week glance strip — most-active course ring, lessons completed,
          next-lesson resume. Gated on hasEnrolments (mirrors ContinueLearning);
          renders nothing for zero-enrolment users. */}
      {hasEnrolments && <YourWeek />}

      {hasEnrolments && (
        <Reveal className="empty:hidden">
          <ContinueLearning />
        </Reveal>
      )}

      <Reveal className="empty:hidden">
        <UpcomingSessions />
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
        <PopularCommunity />
      </Reveal>

      <Reveal className="empty:hidden">
        <UpcomingEvents />
      </Reveal>

      <Reveal className="empty:hidden">
        <NewMembers />
      </Reveal>
      </div>
      </LoadingSwap>
    </>
  );
};

export default Home;
