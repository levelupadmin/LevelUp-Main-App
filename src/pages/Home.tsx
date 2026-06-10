import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useAuth } from "@/contexts/AuthContext";
import Reveal from "@/components/motion/Reveal";
import FeaturedHero from "@/components/home/FeaturedHero";
import QuickPick from "@/components/home/QuickPick";
import EditorialBreaker from "@/components/home/EditorialBreaker";
import ContinueLearning from "@/components/home/ContinueLearning";
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

  return (
    <div className="space-y-10 anim-rise">
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

      {/* One warm line, no date, no member number, no big cream card. */}
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-[-0.01em]">
          {greetingForHour(new Date().getHours())},{" "}
          <span className="font-serif-italic text-cream">{firstName}</span>
        </h1>
        {hasEnrolments && (
          <p className="text-sm text-muted-foreground mt-1">Pick up where you left off</p>
        )}
      </header>

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

      {/* Editorial breaker: full-bleed typographic band marking the seam
          between the personal "resume" half of the feed and the catalogue. */}
      <EditorialBreaker />

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
  );
};

export default Home;
