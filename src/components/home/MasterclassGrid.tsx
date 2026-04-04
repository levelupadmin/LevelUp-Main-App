import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";

const MasterclassGrid = () => {
  const navigate = useNavigate();

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ["masterclasses-home"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, slug, title, thumbnail_url, instructor_name, instructor_image_url, short_description, tags, student_count, rating")
        .eq("course_type", "masterclass")
        .eq("status", "published")
        .order("student_count", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return (
      <section className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="aspect-[3/4] rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (courses.length === 0) return null;

  return (
    <section className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <span className="inline-block rounded-full border border-border/50 bg-card/60 px-4 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            On-Demand Masterclasses
          </span>
          <h2 className="font-display text-2xl font-bold text-foreground sm:text-3xl">
            India's greatest creative minds.{" "}
            <span className="text-gradient-amber">Now your mentors.</span>
          </h2>
        </div>
        <button
          onClick={() => navigate("/explore")}
          className="hidden items-center gap-1 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          View all <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {courses.map((course) => (
          <button
            key={course.id}
            onClick={() => navigate(`/learn/course/${course.slug}`)}
            className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-border/30 bg-card transition-all duration-300 hover:border-highlight/30 hover:shadow-[0_0_20px_2px_hsl(38_75%_55%/0.15)]"
            style={{ perspective: "600px" }}
          >
            <div className="absolute inset-0 transition-transform duration-500 group-hover:[transform:rotateY(2deg)_scale(1.02)]">
              <img
                src={course.thumbnail_url || course.instructor_image_url || "/placeholder.svg"}
                alt={course.title}
                className="h-full w-full object-cover"
              />
              {/* Gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            </div>

            {/* Content at bottom */}
            <div className="absolute inset-x-0 bottom-0 p-4">
              <p className="font-display text-sm font-bold leading-tight text-foreground sm:text-base">
                {course.instructor_name}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                {course.short_description || course.title}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};

export default MasterclassGrid;
