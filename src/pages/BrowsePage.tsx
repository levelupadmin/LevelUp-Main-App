import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import { TierBadge, TIER_SECTION_CONFIG } from "@/components/TierBadge";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import usePageTitle from "@/hooks/usePageTitle";

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
  slug: string;
  description: string | null;
  thumbnail_url: string | null;
  product_tier: string;
  sort_order: number;
  duration_text: string | null;
  instructor_display_name: string | null;
  status: string;
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

  usePageTitle("Browse Programs");

  useEffect(() => {
    const load = async () => {
      const { data: coursesData } = await supabase
        .from("courses")
        .select("id, title, description, thumbnail_url, product_tier, sort_order, duration_text, instructor_display_name, status")
        .in("status", ["published", "upcoming"])
        .order("sort_order", { ascending: true });

      if (!coursesData?.length) { setLoading(false); return; }

      const courseIds = coursesData.map((c) => c.id);
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("course_id, offering_id")
        .in("course_id", courseIds);

      const offeringIds = [...new Set((ocs ?? []).map((oc) => oc.offering_id))];
      const { data: offerings } = offeringIds.length
        ? await supabase
            .from("offerings")
            .select("id, price_inr, mrp_inr")
            .in("id", offeringIds)
            .eq("status", "active")
        : { data: [] };

      const ocMap: Record<string, string> = {};
      (ocs ?? []).forEach((oc) => { if (!ocMap[oc.course_id]) ocMap[oc.course_id] = oc.offering_id; });

      const offeringMap: Record<string, { price_inr: number; mrp_inr: number | null }> = {};
      (offerings ?? []).forEach((o) => { offeringMap[o.id] = { price_inr: o.price_inr, mrp_inr: o.mrp_inr }; });

      setCourses(
        coursesData.map((c) => {
          const offId = ocMap[c.id] ?? null;
          const off = offId ? offeringMap[offId] : null;
          return { ...c, offering_id: offId, price_inr: off?.price_inr ?? null, mrp_inr: off?.mrp_inr ?? null };
        })
      );
      setLoading(false);
    };
    load();
  }, []);

  const filtered =
    activeFilter === "All"
      ? courses
      : courses.filter((c) => c.product_tier === TIER_MAP[activeFilter]);

  // Group by tier
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
              <div key={i} className="bg-surface border border-border rounded-xl h-[340px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-lg font-serif-italic text-cream mb-2">No programs found</p>
            <p className="text-muted-foreground text-sm">Try a different filter to explore more.</p>
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
                          <img
                            src={c.thumbnail_url}
                            alt={c.title}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        )}
                        <div className="absolute top-2 left-2">
                          <TierBadge tier={c.product_tier} />
                        </div>
                        {c.status === "upcoming" && (
                          <div className="absolute top-2 right-2 bg-foreground/80 text-background text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded font-mono">
                            Coming Soon
                          </div>
                        )}
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
                                  <span className="text-sm text-muted-foreground line-through">
                                    ₹{formatPrice(Number(c.mrp_inr))}
                                  </span>
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
