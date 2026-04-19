import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Star } from "lucide-react";

interface Testimonial {
  id: string;
  student_name: string;
  student_avatar_url: string | null;
  quote: string;
  cohort_label: string | null;
  rating: number | null;
}

interface Props {
  courseId: string;
}

const TestimonialsCarousel = ({ courseId }: Props) => {
  const [items, setItems] = useState<Testimonial[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (supabase as any)
      .from("course_testimonials")
      .select("id, student_name, student_avatar_url, quote, cohort_label, rating")
      .eq("course_id", courseId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(5)
      .then(({ data }: any) => {
        if (cancelled) return;
        setItems((data as Testimonial[]) ?? []);
        setLoaded(true);
      });
    return () => { cancelled = true; };
  }, [courseId]);

  // Render-and-hide: null until loaded to avoid empty-box flash, null if empty.
  if (!loaded || items.length === 0) return null;

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        Students say
      </p>
      <div className="flex gap-4 overflow-x-auto snap-x hide-scrollbar pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible sm:gap-6">
        {items.map((t) => (
          <figure
            key={t.id}
            className="min-w-[80vw] sm:min-w-0 snap-start bg-surface border border-border rounded-xl p-5 flex flex-col"
          >
            {t.rating !== null && (
              <div className="flex items-center gap-0.5 mb-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star
                    key={i}
                    className={
                      i < (t.rating ?? 0)
                        ? "h-3.5 w-3.5 fill-yellow-400 text-yellow-400"
                        : "h-3.5 w-3.5 text-muted-foreground/30"
                    }
                  />
                ))}
              </div>
            )}
            <blockquote className="text-sm text-foreground leading-relaxed flex-1">
              "{t.quote}"
            </blockquote>
            <figcaption className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              {t.student_avatar_url ? (
                <img
                  src={t.student_avatar_url}
                  alt={t.student_name}
                  className="w-9 h-9 rounded-full object-cover border border-border"
                />
              ) : (
                <InitialsAvatar name={t.student_name} size={36} />
              )}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{t.student_name}</p>
                {t.cohort_label && (
                  <p className="text-xs text-muted-foreground truncate">{t.cohort_label}</p>
                )}
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
};

export default TestimonialsCarousel;
