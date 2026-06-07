import { useState } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { Loader2 } from "lucide-react";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import HeroCarousel from "@/components/HeroCarousel";
import HeroWelcome from "@/components/home/HeroWelcome";
import ContinueLearning from "@/components/home/ContinueLearning";
import PopularCommunity from "@/components/home/PopularCommunity";
import UpcomingEvents from "@/components/home/UpcomingEvents";
import UpcomingSessions from "@/components/home/UpcomingSessions";
import BrowsePrograms from "@/components/home/BrowsePrograms";
import NewMembers from "@/components/home/NewMembers";

// ── Main Home Page ──
// Composes the dashboard sections (each extracted to src/components/home/).
// Sections are independent — they fetch their own data — so a pull-to-refresh
// just remounts them via the refreshKey.
const Home = () => {
  usePageTitle("Dashboard");
  const [refreshKey, setRefreshKey] = useState(0);
  const { isRefreshing, pullProgress, pullDistance } = usePullToRefresh({
    onRefresh: async () => {
      setRefreshKey((k) => k + 1);
    },
  });

  return (
    <>
      <div className="space-y-8">
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
        <HeroCarousel />
        <HeroWelcome />
        <ContinueLearning key={`cl-${refreshKey}`} />
        <PopularCommunity key={`pc-${refreshKey}`} />
        <UpcomingEvents key={`ue-${refreshKey}`} />
        <UpcomingSessions key={`us-${refreshKey}`} />
        <BrowsePrograms key={`bp-${refreshKey}`} />
        <NewMembers key={`nm-${refreshKey}`} />
      </div>
    </>
  );
};

export default Home;
