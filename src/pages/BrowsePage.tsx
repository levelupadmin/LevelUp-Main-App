import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import { TierBadge } from "@/components/TierBadge";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TIER_FILTERS = ["All", "Live Cohort", "Masterclass", "Program", "Workshop"] as const;
const TIER_MAP: Record<string, string> = {
  "Live Cohort": "live_cohort",
  Masterclass: "masterclass",
  Program: "advanced_program",
  Workshop: "workshop",
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
  offering_id: string | null;
  price_inr: number | null;
  mrp_inr: number | null;
}

const BrowsePage = () => {
  const [courses, setCourses] = useState<CourseWithOffering[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("All");

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
          return {
            ...c,
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

  const filtered =
    activeFilter === "All"
      ? courses
      : courses.filter((c) => c.product_tier === TIER_MAP[activeFilter]);

  return (
    <StudentLayout title="Browse Programs">
      <div className="space-y-8">
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Browse Programs</h1>
          <p className="text-base text-muted-foreground mt-1">Find your next creative skill</p>
        </div>

        <div className="flex gap-2 flex-wrap">
          {TIER_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
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
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl h-[340px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-12 text-center">No programs found in this category.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => (
              <div
                key={c.id}
                className="bg-surface border border-border rounded-xl overflow-hidden hover:-translate-y-1 hover:border-border-hover transition-all duration-200"
              >
                <div className="aspect-video bg-surface-2 relative">
                  {c.thumbnail_url && (
                    <img src={c.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  )}
                  <div className="absolute top-2 left-2">
                    <TierBadge tier={c.product_tier} />
                  </div>
                  {c.status === "upcoming" && (
                    <div className="absolute top-2 right-2 bg-foreground/80 text-background text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">
                      Coming Soon
                    </div>
                  )}
                </div>
                <div className="p-4 flex flex-col gap-1.5">
                  <h3 className="text-lg font-semibold line-clamp-1">{c.title}</h3>
                  {c.instructor_display_name && (
                    <p className="text-sm text-muted-foreground">{c.instructor_display_name}</p>
                  )}
                  <p className="text-sm text-muted-foreground line-clamp-2">{c.description}</p>
                  {c.duration_text && (
                    <p className="font-mono text-xs text-muted-foreground mt-1">{c.duration_text}</p>
                  )}
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <div className="flex items-baseline gap-2">
                      {c.price_inr != null ? (
                        <>
                          <span className="text-base font-semibold">
                            ₹{Number(c.price_inr).toLocaleString()}
                          </span>
                          {c.mrp_inr && Number(c.mrp_inr) > Number(c.price_inr) && (
                            <span className="text-sm text-muted-foreground line-through">
                              ₹{Number(c.mrp_inr).toLocaleString()}
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="text-sm text-muted-foreground">Price TBA</span>
                      )}
                    </div>
                    {c.offering_id ? (
                      <Link
                        to={`/checkout/${c.offering_id}`}
                        className="text-sm font-medium text-cream flex items-center gap-1 hover:gap-2 transition-all"
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
        )}
      </div>
    </StudentLayout>
  );
};

export default BrowsePage;
