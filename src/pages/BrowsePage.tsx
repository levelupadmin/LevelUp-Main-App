import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import { TierBadge, TIER_SECTION_CONFIG } from "@/components/TierBadge";
import { Input } from "@/components/ui/input";
import LazyImage from "@/components/LazyImage";
import { ArrowRight, Search, Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import usePageTitle from "@/hooks/usePageTitle";
import { useWishlist } from "@/hooks/useWishlist";
import { useEnrolmentCounts, formatEnrolmentLabel, isHotCourse } from "@/hooks/useEnrolmentCounts";
import { useDebounce } from "@/hooks/useDebounce";

const TIER_ORDER = ["live_cohort", "masterclass", "advanced_program", "workshop"] as const;
const TIER_FILTERS = ["All", "Mentorship Cohorts", "Masterclasses", "Programs", "Workshops"] as const;
const TIER_MAP: Record<string, string> = {
  "Mentorship Cohorts": "live_cohort",
  Masterclasses: "masterclass",
  Programs: "advanced_program",
  Workshops: "workshop",
};

interface CourseWithOffering {
  id: string;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
  product_tier: string;
  sort_order: number;
  duration_text: string | null;
  instructor_display_name: string | null;
  status: string;
  primary_offering_id: string | null;
  offering_id: string | null;
  price_inr: number | null;
  mrp_inr: number | null;
}

const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-IN").format(amount);

const BrowsePage = () => {
  const [courses, setCourses] = useState<CourseWithOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);
  const { wishlistedIds, toggle: toggleWishlist } = useWishlist();

  usePageTitle("Browse Programs");

  // Batch-fetch enrolment counts for all offering IDs
  const offeringIds = useMemo(
    () => courses.map((c) => c.offering_id).filter(Boolean) as string[],
    [courses]
  );
  const { counts: enrolmentCounts, popularIds } = useEnrolmentCounts(offeringIds);

  useEffect(() => {
    const load = async () => {
      // Use select("*") and client-side filter for show_on_browse so the
      // query doesn't fail if the migration hasn't run yet
      const { data: rawCourses } = await supabase
        .from("courses")
        .select("*")
        .in("status", ["published", "upcoming"])
        .order("sort_order", { ascending: true });

      // Filter out courses hidden from browse (default to shown if column doesn't exist yet)
      const coursesData = (rawCourses || []).filter(
        (c: any) => c.show_on_browse !== false
      );

      if (!coursesData.length) { setLoading(false); return; }

      // Read primary_offering_id via a separate raw query since types may not be regenerated yet
      const courseIds = coursesData.map((c) => c.id);
      const { data: primaryData } = await supabase
        .from("courses")
        .select("id, primary_offering_id")
        .in("id", courseIds) as any;

      const primaryMap: Record<string, string | null> = {};
      (primaryData ?? []).forEach((p: any) => { primaryMap[p.id] = p.primary_offering_id ?? null; });

      // Load pricing for primary offerings
      const primaryOfferingIds = [...new Set(
        Object.values(primaryMap).filter(Boolean) as string[]
      )];

      let offeringMap: Record<string, { price_inr: number; mrp_inr: number | null }> = {};

      if (primaryOfferingIds.length) {
        const { data: offerings } = await supabase
          .from("offerings")
          .select("id, price_inr, mrp_inr")
          .in("id", primaryOfferingIds)
          .eq("status", "active");

        (offerings ?? []).forEach((o) => {
          offeringMap[o.id] = { price_inr: o.price_inr, mrp_inr: o.mrp_inr };
        });
      }

      // Fallback for courses without primary_offering_id
      const coursesWithoutPrimary = coursesData.filter((c) => !primaryMap[c.id]);
      const fallbackOcMap: Record<string, string> = {};

      if (coursesWithoutPrimary.length) {
        const fallbackCourseIds = coursesWithoutPrimary.map((c) => c.id);
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("course_id, offering_id")
          .in("course_id", fallbackCourseIds);

        const fallbackOfferingIds = [...new Set((ocs ?? []).map((oc) => oc.offering_id))];
        if (fallbackOfferingIds.length) {
          const { data: fallbackOfferings } = await supabase
            .from("offerings")
            .select("id, price_inr, mrp_inr")
            .in("id", fallbackOfferingIds)
            .eq("status", "active");

          (fallbackOfferings ?? []).forEach((o) => {
            if (!offeringMap[o.id]) offeringMap[o.id] = { price_inr: o.price_inr, mrp_inr: o.mrp_inr };
          });
        }

        (ocs ?? []).forEach((oc) => { if (!fallbackOcMap[oc.course_id]) fallbackOcMap[oc.course_id] = oc.offering_id; });
      }

      setCourses(
        coursesData.map((c) => {
          const offId = primaryMap[c.id] || fallbackOcMap[c.id] || null;
          const off = offId ? offeringMap[offId] : null;
          return {
            ...c,
            primary_offering_id: primaryMap[c.id] || null,
            offering_id: offId,
            price_inr: off?.price_inr ?? null,
            mrp_inr: off?.mrp_inr ?? null,
          };
        })
      );
      setLoading(false);
    };
    load();
  }, []);

  const filtered = courses.filter((c) => {
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

  return (
    <StudentLayout title="Browse Programs">
      <div className="space-y-8">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold leading-tight">Browse Programs</h1>
          <p className="text-base text-muted-foreground mt-1">Find your next creative skill</p>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search courses..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-surface border-border"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          {TIER_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border min-h-[44px] sm:min-h-0",
                activeFilter === f
                  ? "bg-foreground text-background border-foreground"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground hover:border-border-hover"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl overflow-hidden animate-pulse">
                <div className="aspect-video bg-surface-2" />
                <div className="p-4 space-y-2">
                  <div className="h-4 bg-surface-2 rounded w-3/4" />
                  <div className="h-3 bg-surface-2 rounded w-1/2" />
                  <div className="h-3 bg-surface-2 rounded w-full" />
                  <div className="h-3 bg-surface-2 rounded w-2/3" />
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                    <div className="h-4 bg-surface-2 rounded w-20" />
                    <div className="h-3 bg-surface-2 rounded w-14" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium text-foreground mb-1">No programs match your filters</p>
            <p className="text-muted-foreground text-sm">Try a different search term or adjust your filters.</p>
            {(activeFilter !== "All" || searchQuery.trim()) && (
              <button
                onClick={() => { setActiveFilter("All"); setSearchQuery(""); }}
                className="mt-4 px-5 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-12">
            {groupedByTier.map(({ tier, config, items }) => (
              <section key={tier}>
                <div className="flex items-center gap-3 mb-5">
                  <div className={cn("w-1 h-6 rounded-full", config.accentColor)} />
                  <h2 className="text-xl font-semibold">{config.heading}</h2>
                  <span className="text-sm text-muted-foreground font-mono">({items.length})</span>
                </div>
                <div className={cn(
                  "grid gap-4",
                  tier === "workshop"
                    ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                    : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
                )}>
                  {items.map((c) => (
                    <div
                      key={c.id}
                      className="bg-surface border border-border rounded-xl overflow-hidden card-hover"
                    >
                      <div className="aspect-video bg-surface-2 relative">
                        {c.thumbnail_url && (
                          <LazyImage
                            src={c.thumbnail_url}
                            alt={c.title}
                            className="w-full h-full"
                          />
                        )}
                        <div className="absolute top-2 left-2 flex items-center gap-1.5">
                          <TierBadge tier={c.product_tier} />
                          {c.offering_id && popularIds.has(c.offering_id) && (
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono bg-orange-500 text-white">
                              Popular
                            </span>
                          )}
                        </div>
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {c.status === "upcoming" && (
                            <span className="bg-foreground/80 text-background text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono">
                              Coming Soon
                            </span>
                          )}
                          {c.offering_id && (
                            <button
                              aria-label={wishlistedIds.has(c.offering_id!) ? "Remove from wishlist" : "Add to wishlist"}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const wasWishlisted = wishlistedIds.has(c.offering_id!);
                                toggleWishlist(c.offering_id!);
                                if (wasWishlisted) {
                                  toast("Removed from wishlist");
                                } else {
                                  toast.success("Added to wishlist");
                                }
                              }}
                              className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm hover:bg-black/60 transition-colors"
                            >
                              <Heart className={`h-4 w-4 transition-transform ${wishlistedIds.has(c.offering_id!) ? "fill-red-400 text-red-400 heart-bounce" : "text-white"}`} />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-4 flex flex-col gap-1.5">
                        <h3 className={cn(
                          "font-semibold line-clamp-1",
                          tier === "workshop" ? "text-base" : "text-lg"
                        )}>
                          {c.title}
                        </h3>
                        {c.instructor_display_name && (
                          <p className="text-sm text-muted-foreground line-clamp-1">{c.instructor_display_name}</p>
                        )}
                        {c.offering_id && formatEnrolmentLabel(enrolmentCounts[c.offering_id]) && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1">
                            {isHotCourse(enrolmentCounts[c.offering_id]) && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-orange-500" />
                            )}
                            {formatEnrolmentLabel(enrolmentCounts[c.offering_id])}
                          </p>
                        )}
                        {tier !== "workshop" && c.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                        )}
                        {c.duration_text && (
                          <p className="font-mono text-xs text-muted-foreground">{c.duration_text}</p>
                        )}
                        <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                          <div className="flex items-baseline gap-2">
                            {c.status === "upcoming" ? (
                              <span className="text-sm font-medium text-muted-foreground">Upcoming</span>
                            ) : c.price_inr != null ? (
                              <>
                                <span className="text-base font-semibold">
                                  ₹{formatPrice(Number(c.price_inr))}
                                </span>
                                {c.mrp_inr && Number(c.mrp_inr) > Number(c.price_inr) && (
                                  <>
                                    <span className="text-sm text-muted-foreground line-through">
                                      ₹{formatPrice(Number(c.mrp_inr))}
                                    </span>
                                    <span className="text-[10px] font-bold uppercase tracking-wider font-mono px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                                      Save {Math.round((1 - Number(c.price_inr) / Number(c.mrp_inr)) * 100)}%
                                    </span>
                                  </>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground">Price TBA</span>
                            )}
                          </div>
                          {c.status === "upcoming" ? (
                            <span className="text-sm font-medium text-muted-foreground">Notify me</span>
                          ) : c.offering_id ? (
                            <Link
                              to={`/checkout/${c.offering_id}`}
                              className="text-sm font-medium text-cream flex items-center gap-1 hover:gap-2 transition-all min-h-[44px] sm:min-h-0 items-center"
                            >
                              Enroll <ArrowRight className="h-3 w-3" />
                            </Link>
                          ) : (
                            <Link
                              to={`/courses/${c.id}`}
                              className="text-sm font-medium text-cream flex items-center gap-1 hover:gap-2 transition-all"
                            >
                              View <ArrowRight className="h-3 w-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </StudentLayout>
  );
};

export default BrowsePage;
