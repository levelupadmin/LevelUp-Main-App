import AppShell from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Users, Clock, Loader2 } from "lucide-react";

const Workshops = () => {
  const navigate = useNavigate();

  const { data: workshops = [], isLoading } = useQuery({
    queryKey: ["workshops-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("courses")
        .select("id, title, slug, thumbnail_url, instructor_name, instructor_image_url, price, estimated_duration, max_students, student_count, status, category")
        .eq("course_type", "workshop")
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <AppShell>
      <div className="mx-auto max-w-4xl p-4 py-6 lg:p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Workshops</h1>
          <p className="text-sm text-muted-foreground">Live and recorded sessions by India's top creators</p>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : workshops.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">No workshops available right now</p>
          </div>
        ) : (
          <div className="space-y-4">
            {workshops.map((w) => (
              <button
                key={w.id}
                onClick={() => navigate(`/learn/course/${w.slug}`)}
                className="flex w-full flex-col sm:flex-row gap-4 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-muted-foreground/30"
              >
                {/* Thumbnail */}
                <div className="relative h-36 w-full sm:h-28 sm:w-44 shrink-0 overflow-hidden rounded-lg">
                  <img src={w.thumbnail_url || "/placeholder.svg"} alt={w.title} className="h-full w-full object-cover" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div>
                    <Badge variant="secondary" className="text-[10px] mb-2">{w.category}</Badge>
                    <h3 className="text-base font-bold text-foreground line-clamp-2 leading-tight">{w.title}</h3>
                    <div className="mt-1.5 flex items-center gap-2">
                      {w.instructor_image_url && (
                        <img src={w.instructor_image_url} alt={w.instructor_name} className="h-5 w-5 rounded-full object-cover" />
                      )}
                      <span className="text-xs text-muted-foreground">{w.instructor_name}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-base font-bold text-foreground">
                        {w.price === 0 ? "Free" : `₹${w.price}`}
                      </span>
                      {w.estimated_duration && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" /> {w.estimated_duration}
                        </span>
                      )}
                      {w.max_students && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Users className="h-3 w-3" /> {w.student_count}/{w.max_students}
                        </span>
                      )}
                    </div>
                    <Badge className="bg-[hsl(var(--highlight))] text-background text-[10px] font-bold">View</Badge>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
};

export default Workshops;
