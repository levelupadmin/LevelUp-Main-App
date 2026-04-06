import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

const TYPE_FILTERS = ["All", "Live Cohort", "Masterclass", "Workshop"] as const;

interface Offering {
  id: string;
  title: string;
  description: string | null;
  price_inr: number;
  mrp_inr: number | null;
  thumbnail_url: string | null;
  type: string;
  status: string;
  course_count: number;
}

const BrowsePage = () => {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<string>("All");

  useEffect(() => {
    const fetch = async () => {
      const { data, error } = await supabase
        .from("offerings")
        .select("id, title, description, price_inr, mrp_inr, thumbnail_url, type, status")
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (error || !data) {
        setLoading(false);
        return;
      }

      // Get course counts per offering
      const { data: ocs } = await supabase
        .from("offering_courses")
        .select("offering_id, course_id")
        .in("offering_id", data.map((o) => o.id));

      const countMap: Record<string, number> = {};
      (ocs ?? []).forEach((oc) => {
        countMap[oc.offering_id] = (countMap[oc.offering_id] || 0) + 1;
      });

      setOfferings(
        data.map((o) => ({ ...o, course_count: countMap[o.id] || 0 }))
      );
      setLoading(false);
    };
    fetch();
  }, []);

  const filtered =
    activeFilter === "All"
      ? offerings
      : offerings.filter(
          (o) => o.type?.toLowerCase() === activeFilter.toLowerCase().replace(" ", "_")
        );

  return (
    <StudentLayout title="Browse Programs">
      <div className="space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-[32px] font-semibold leading-tight">Browse Programs</h1>
          <p className="text-base text-muted-foreground mt-1">
            Find your next creative skill
          </p>
        </div>

        {/* Filter pills */}
        <div className="flex gap-2 flex-wrap">
          {TYPE_FILTERS.map((f) => (
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

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl h-[340px] animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-12 text-center">
            No programs found in this category.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((o) => (
              <div
                key={o.id}
                className="bg-surface border border-border rounded-xl overflow-hidden hover:-translate-y-1 hover:border-border-hover transition-all duration-200"
              >
                <div className="aspect-video bg-surface-2">
                  {o.thumbnail_url && (
                    <img src={o.thumbnail_url} alt="" className="w-full h-full object-cover" />
                  )}
                </div>
                <div className="p-4 flex flex-col gap-2">
                  <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                    {o.type?.replace("_", " ")}
                  </p>
                  <h3 className="text-xl font-semibold line-clamp-1">{o.title}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {o.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1 font-mono text-xs text-muted-foreground">
                    {o.course_count > 0 && <span>{o.course_count} course{o.course_count > 1 ? "s" : ""}</span>}
                  </div>
                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-border">
                    <div className="flex items-baseline gap-2">
                      <span className="text-base font-semibold">
                        ₹{Number(o.price_inr).toLocaleString()}
                      </span>
                      {o.mrp_inr && Number(o.mrp_inr) > Number(o.price_inr) && (
                        <span className="text-sm text-muted-foreground line-through">
                          ₹{Number(o.mrp_inr).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <Link
                      to={`/checkout/${o.id}`}
                      className="text-sm font-medium text-cream flex items-center gap-1 hover:gap-2 transition-all"
                    >
                      Enroll <ArrowRight className="h-3 w-3" />
                    </Link>
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
