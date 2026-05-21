import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import InitialsAvatar from "@/components/InitialsAvatar";
import { Check, ShieldCheck, Star } from "lucide-react";

interface Testimonial {
  id: string;
  student_name: string;
  student_avatar_url: string | null;
  quote: string;
  cohort_label: string | null;
  rating: number | null;
}

interface Props {
  courseId?: string | null;
  courseTitle?: string | null;
  courseThumbnailUrl?: string | null;
  instructorName?: string | null;
  durationMinutes?: number | null;
  batchStartsAt?: string | null;
  /**
   * Feature bullets to render in "What's included". Admin-configurable in a
   * follow-up; for now we take a static list from the caller.
   */
  included?: string[];
}

const TrustPanel = ({
  courseId,
  courseTitle,
  courseThumbnailUrl,
  instructorName,
  durationMinutes,
  batchStartsAt,
  included = [
    "Lifetime access to all lessons",
    "Community of fellow creators",
    "Downloadable resources",
    "Certificate on completion",
  ],
}: Props) => {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);

  useEffect(() => {
    if (!courseId) return;
    let cancelled = false;
    (supabase as any)
      .from("course_testimonials")
      .select("id, student_name, student_avatar_url, quote, cohort_label, rating")
      .eq("course_id", courseId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(2)
      .then(({ data }: any) => {
        if (cancelled) return;
        setTestimonials((data as Testimonial[]) ?? []);
      });
    return () => { cancelled = true; };
  }, [courseId]);

  const hMins = durationMinutes ?? 0;
  const durationLabel =
    hMins >= 60
      ? `${Math.floor(hMins / 60)}h${hMins % 60 ? ` ${hMins % 60}m` : ""}`
      : hMins > 0
        ? `${hMins}m`
        : null;

  const whatHappensNext = batchStartsAt
    ? `Batch starts ${new Date(batchStartsAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`
    : "Instant access after payment";

  return (
    <aside className="hidden lg:block w-[420px] flex-shrink-0 space-y-6">
      {/* Course summary */}
      {courseTitle && (
        <div className="bg-surface border border-border rounded-xl overflow-hidden">
          {courseThumbnailUrl && (
            <div className="aspect-video bg-surface-2">
              <img
                src={courseThumbnailUrl}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
          )}
          <div className="p-4">
            <h3 className="text-base font-semibold leading-tight">{courseTitle}</h3>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
              {instructorName && <span>by {instructorName}</span>}
              {durationLabel && <span>· {durationLabel}</span>}
            </div>
          </div>
        </div>
      )}

      {/* What's included */}
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
          What's included
        </p>
        <ul className="space-y-2">
          {included.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-sm">
              <Check className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />
              <span className="text-foreground">{item}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* What happens next */}
      <div className="bg-[hsl(var(--accent-amber)/0.08)] border border-[hsl(var(--accent-amber)/0.25)] rounded-xl p-4">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-1">
          What happens next
        </p>
        <p className="text-sm text-foreground">{whatHappensNext}</p>
      </div>

      {/* Testimonials */}
      {testimonials.length > 0 && (
        <div className="space-y-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Students say
          </p>
          {testimonials.map((t) => (
            <figure
              key={t.id}
              className="bg-surface border border-border rounded-xl p-4"
            >
              {t.rating !== null && (
                <div className="flex items-center gap-0.5 mb-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={
                        i < (t.rating ?? 0)
                          ? "h-3 w-3 fill-yellow-400 text-yellow-400"
                          : "h-3 w-3 text-muted-foreground/30"
                      }
                    />
                  ))}
                </div>
              )}
              <blockquote className="text-sm text-foreground leading-relaxed">
                "{t.quote}"
              </blockquote>
              <figcaption className="flex items-center gap-2.5 mt-3 pt-3 border-t border-border">
                {t.student_avatar_url ? (
                  <img
                    src={t.student_avatar_url}
                    alt={t.student_name}
                    className="w-7 h-7 rounded-full object-cover"
                  />
                ) : (
                  <InitialsAvatar name={t.student_name} size={28} />
                )}
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{t.student_name}</p>
                  {t.cohort_label && (
                    <p className="text-[11px] text-muted-foreground truncate">{t.cohort_label}</p>
                  )}
                </div>
              </figcaption>
            </figure>
          ))}
        </div>
      )}

      {/* Trust badge */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t border-border">
        <ShieldCheck className="h-4 w-4" />
        <span>Secure checkout · Razorpay</span>
      </div>
    </aside>
  );
};

export default TrustPanel;
