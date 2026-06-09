import { useMemo, useState } from "react";
import { Search, WifiOff, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TIER_SECTION_CONFIG } from "@/components/TierBadge";
import EmptyState from "@/components/EmptyState";
import CourseCardSkeleton from "@/components/skeletons/CourseCardSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { useWishlist } from "@/hooks/useWishlist";
import { useNotifyRequests } from "@/hooks/useNotifyRequests";
import { useEnrolmentCounts } from "@/hooks/useEnrolmentCounts";
import { cn } from "@/lib/utils";
import CatalogCard from "./CatalogCard";
import { useCatalog, useEnrolledOfferingIds } from "./useCatalog";

const TIER_ORDER = ["live_cohort", "masterclass", "advanced_program", "workshop"] as const;
const TIER_FILTERS = ["All", "Mentorship Cohorts", "Masterclasses", "Programs", "Workshops"] as const;
const TIER_MAP: Record<string, string> = {
  "Mentorship Cohorts": "live_cohort",
  Masterclasses: "masterclass",
  Programs: "advanced_program",
  Workshops: "workshop",
};

// The full catalogue, embedded in the Home feed (Browse merged into Home).
const CatalogSection = () => {
  const { data: courses, isLoading, isError, refetch } = useCatalog();
  const { data: enrolledOfferingIds } = useEnrolledOfferingIds();
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  const { wishlistedIds, toggle: toggleWishlist } = useWishlist();
  const { requestedIds: notifyRequestedIds, pending: notifyPending, requestNotify } =
    useNotifyRequests();

  const offeringIds = useMemo(
    () => (courses ?? []).map((c) => c.offering_id).filter((id): id is string => Boolean(id)),
    [courses]
  );
  const { counts: enrolmentCounts, popularIds } = useEnrolmentCounts(offeringIds);

  const filtered = (courses ?? []).filter((c) => {
    const matchesTier = activeFilter === "All" || c.product_tier === TIER_MAP[activeFilter];
    if (!matchesTier) return false;
    if (!debouncedSearch.trim()) return true;
    const q = debouncedSearch.toLowerCase();
    return (
      c.title.toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      (c.instructor_display_name || "").toLowerCase().includes(q)
    );
  });

  const groupedByTier = TIER_ORDER
    .map((tier) => ({
      tier,
      config: TIER_SECTION_CONFIG[tier],
      items: filtered.filter((c) => c.product_tier === tier),
    }))
    .filter((g) => g.items.length > 0);

  const hasActiveFilters = activeFilter !== "All" || !!searchQuery.trim();

  return (
    <div className="space-y-6">
      {/* Compressed header: eyebrow + one-line heading + search + chip rail.
          No paragraph subtitle — first card must land inside one viewport. */}
      <div className="space-y-2">
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
          Explore
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold tracking-[-0.02em] leading-[1.1]">
          Find your next <span className="font-serif-italic text-cream">craft</span>
        </h2>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search instructors, classes, topics…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-11 bg-surface border-border"
        />
      </div>

      {/* Single horizontally-scrollable chip rail — never wraps. */}
      <div className="flex gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1">
        {TIER_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setActiveFilter(f)}
            className={cn(
              "pressable flex-shrink-0 whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors border min-h-[44px] sm:min-h-0",
              activeFilter === f
                ? "bg-foreground text-background border-foreground"
                : "bg-surface border-border text-muted-foreground hover:text-foreground hover:border-border-hover"
            )}
          >
            {f}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="text-center py-16">
          <WifiOff className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium text-foreground mb-1">Something went wrong</p>
          <p className="text-muted-foreground text-sm">
            We couldn't load this. Check your connection and try again.
          </p>
          <Button onClick={() => refetch()} variant="outline" className="mt-4 gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No programs match your filters"
          sub="Try a different search term or adjust your filters."
          cta={
            hasActiveFilters
              ? {
                  label: "Clear all filters",
                  onClick: () => {
                    setActiveFilter("All");
                    setSearchQuery("");
                  },
                }
              : undefined
          }
        />
      ) : (
        <div className="space-y-12">
          {groupedByTier.map(({ tier, config, items }) => (
            <section key={tier}>
              <div className="flex items-center gap-3 mb-5">
                <div className={cn("w-1 h-6 rounded-full", config.accentColor)} />
                <h3 className="text-xl font-semibold">{config.heading}</h3>
              </div>
              <div
                className={cn(
                  "anim-stagger grid gap-4",
                  tier === "workshop"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                )}
              >
                {items.map((c) => (
                  <CatalogCard
                    key={c.id}
                    course={c}
                    isEntitled={!!(c.offering_id && enrolledOfferingIds?.has(c.offering_id))}
                    wishlisted={!!(c.offering_id && wishlistedIds.has(c.offering_id))}
                    onToggleWishlist={toggleWishlist}
                    notifyRequested={notifyRequestedIds.has(c.id)}
                    notifyPending={notifyPending.has(c.id)}
                    onNotify={requestNotify}
                    enrolmentCount={c.offering_id ? enrolmentCounts[c.offering_id] : undefined}
                    isPopular={!!(c.offering_id && popularIds.has(c.offering_id))}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
};

export default CatalogSection;
