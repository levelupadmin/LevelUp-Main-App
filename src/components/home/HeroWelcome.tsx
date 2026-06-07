import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import LazyImage from "@/components/LazyImage";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Play } from "lucide-react";

// ── Welcome / Resume hero ──
// If the user has an in-progress course, this becomes a full-bleed
// cinematic "Pick up where you left off" hero featuring that course.
// Otherwise it falls back to the original cream welcome card so brand-new
// users still get a warm greeting.
const HeroWelcome = () => {
  const { profile, user } = useAuth();
  const firstName = profile?.full_name?.split(" ")[0] ?? "there";
  const today = format(new Date(), "EEEE, MMM d, yyyy");
  const [resume, setResume] = useState<{
    courseTitle: string;
    courseThumb: string | null;
    instructor: string | null;
    nextChapterId: string | null;
    courseId: string;
    progressPct: number;
    lessonNumber: number | null;
    lessonTotal: number;
    nextChapterTitle: string | null;
  } | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);

  useEffect(() => {
    if (!user) { setResumeLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        // The user's most-recently-touched chapter is the strongest signal
        // for "where they left off" - matches what Netflix calls Continue
        // Watching. We grab the latest row, then resolve the course's
        // next-uncompleted chapter as the actual resume target.
        const { data: lastProgress } = await supabase
          .from("chapter_progress")
          .select("course_id")
          .eq("user_id", user.id)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        let cid: string | null = lastProgress?.course_id ?? null;

        // Fallback: brand-new buyer who paid but hasn't watched anything
        // yet. Use their most-recent active enrolment so the hero still
        // says "start watching" with the right course art instead of
        // collapsing to a generic greeting.
        if (!cid) {
          const { data: enrolment } = await supabase
            .from("enrolments")
            .select("offering_id, created_at")
            .eq("user_id", user.id)
            .eq("status", "active")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (enrolment?.offering_id) {
            const { data: oc } = await supabase
              .from("offering_courses")
              .select("course_id")
              .eq("offering_id", enrolment.offering_id)
              .limit(1)
              .maybeSingle();
            cid = oc?.course_id ?? null;
          }
        }

        if (!cid || cancelled) { setResumeLoading(false); return; }
        const [{ data: course }, { data: sections }, { data: allProgress }] = await Promise.all([
          supabase.from("courses").select("id, title, thumbnail_url, instructor_display_name").eq("id", cid).maybeSingle(),
          supabase.from("sections").select("id, sort_order").eq("course_id", cid).order("sort_order"),
          supabase.from("chapter_progress").select("chapter_id, completed_at").eq("user_id", user.id),
        ]);
        if (!course || cancelled) { setResumeLoading(false); return; }

        const sectionIds = (sections ?? []).map((s: any) => s.id);
        const { data: chapters } = sectionIds.length
          ? await supabase
              .from("chapters")
              .select("id, title, section_id, sort_order")
              .in("section_id", sectionIds)
              .order("sort_order")
          : { data: [] as any[] };

        const sectionSort: Record<string, number> = {};
        (sections ?? []).forEach((s: any) => { sectionSort[s.id] = s.sort_order; });
        const sorted = ((chapters ?? []) as any[]).sort((a, b) => {
          const sa = sectionSort[a.section_id] ?? 0;
          const sb = sectionSort[b.section_id] ?? 0;
          return sa !== sb ? sa - sb : a.sort_order - b.sort_order;
        });
        const completedSet = new Set(
          (allProgress ?? []).filter((p: any) => p.completed_at).map((p: any) => p.chapter_id)
        );
        const next = sorted.find((ch) => !completedSet.has(ch.id));
        const nextIndex = next ? sorted.findIndex((ch) => ch.id === next.id) : -1;
        const progressPct = sorted.length ? Math.round((completedSet.size / sorted.length) * 100) : 0;

        if (cancelled) return;
        setResume({
          courseTitle: course.title,
          courseThumb: course.thumbnail_url ?? null,
          instructor: course.instructor_display_name ?? null,
          nextChapterId: next?.id ?? null,
          courseId: cid,
          progressPct,
          lessonNumber: nextIndex >= 0 ? nextIndex + 1 : null,
          lessonTotal: sorted.length,
          nextChapterTitle: next?.title ?? null,
        });
      } catch {
        // Resume is a nice-to-have on top of the greeting - if it
        // fails we silently fall back to the greeting card.
      } finally {
        if (!cancelled) setResumeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // While we don't yet know whether the user has progress to resume,
  // hold the slot with a low-key skeleton so users with enrolments
  // don't get a brief greeting flash before the cinematic hero swaps
  // in. The skeleton matches the hero's aspect ratio so layout doesn't
  // jump.
  if (resumeLoading) {
    return (
      <div className="rounded-3xl overflow-hidden bg-surface-2 animate-pulse aspect-[5/4] sm:aspect-[16/9] lg:aspect-[21/8] max-h-[520px]" />
    );
  }

  // Cinematic resume hero - only renders when we have an in-progress
  // course AND there's an actual next chapter to play. If the user
  // finished the course we fall through to the greeting so it doesn't
  // look stale.
  if (resume && resume.nextChapterId) {
    const allComplete = resume.progressPct === 100;
    const linkTo = allComplete ? `/courses/${resume.courseId}` : `/chapters/${resume.nextChapterId}`;
    return (
      <Link
        to={linkTo}
        className="block relative rounded-3xl overflow-hidden group ring-1 ring-white/5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]"
      >
        <div className="aspect-[5/4] sm:aspect-[16/9] lg:aspect-[21/8] max-h-[520px] bg-surface-2 relative">
          {resume.courseThumb && (
            <LazyImage
              src={resume.courseThumb}
              alt=""
              className="absolute inset-0 w-full h-full group-hover:scale-[1.02] transition-transform duration-700"
            />
          )}
          {/* Heavy left + bottom gradient so overlaid text stays legible
              regardless of the image's content. */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/50 to-black/10" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8 lg:p-12">
            <div className="max-w-xl space-y-3 sm:space-y-4">
              <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/80">
                {allComplete ? "Revisit your masterclass" : "Pick up where you left off"}
              </p>
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.01em] leading-[1.05] text-white">
                {resume.courseTitle}
              </h1>
              {resume.nextChapterTitle && resume.lessonNumber && (
                <p className="text-sm sm:text-base text-white/80 line-clamp-1">
                  <span className="font-mono text-white/50 mr-2">Lesson {resume.lessonNumber} of {resume.lessonTotal}</span>
                  <span className="hidden sm:inline">·</span>{" "}
                  <span className="block sm:inline mt-0.5 sm:mt-0">{resume.nextChapterTitle}</span>
                </p>
              )}
              {/* Progress bar - subtle, full width of the text column */}
              {resume.progressPct > 0 && resume.progressPct < 100 && (
                <div className="h-1 bg-white/15 rounded-full overflow-hidden max-w-[260px]">
                  <div
                    className="h-full bg-[hsl(var(--cream))] rounded-full transition-all"
                    style={{ width: `${resume.progressPct}%` }}
                  />
                </div>
              )}
              <div className="flex items-center gap-3 pt-1">
                <span className="btn-champagne inline-flex items-center gap-2 h-11 px-6 text-sm group-hover:-translate-y-0.5">
                  <Play className="h-4 w-4 fill-current" />
                  {allComplete ? "Review course" : resume.progressPct > 0 ? "Resume watching" : "Start watching"}
                </span>
                {resume.instructor && (
                  <span className="text-xs sm:text-sm text-white/70 hidden sm:inline">
                    With {resume.instructor}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // Fallback greeting for brand-new users with no progress yet.
  return (
    <div className="bg-cream rounded-3xl px-6 sm:px-10 py-6 sm:py-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div>
        <h1 className="heading-1 text-cream-text">
          Welcome back,{" "}
          <span className="font-serif-italic">{firstName}</span>
        </h1>
        <p className="body-muted !text-cream-text/70 mt-1">Pick up where you left off</p>
      </div>
      <div className="font-mono text-xs text-cream-text/60 sm:text-right">
        <p>{today}</p>
        <p>Member #{profile?.member_number ?? "—"}</p>
      </div>
    </div>
  );
};

export default HeroWelcome;
