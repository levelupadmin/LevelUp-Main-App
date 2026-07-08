import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useMotionSafe, durations, instant } from "@/lib/motion";
import type { ChapterSibling } from "@/components/chapter/types";

interface Props {
  siblings: ChapterSibling[];
  currentIndex: number;
  currentChapterId: string;
  courseId: string | null;
  /**
   * Live completion state of the CURRENT chapter, lifted from ChapterViewer.
   * The per-sibling `progress` map is fetched once, so without this the
   * momentum bar wouldn't move the instant the learner marks the lesson done.
   * Merging it in flips the current lesson to "complete" immediately, and the
   * glide-spring bar animates to its new fraction on that state change.
   */
  currentCompleted?: boolean;
  /**
   * Section/module title of the current chapter, for the "Lesson N of M ·
   * Module X" context line. Derived from data ChapterViewer already loads
   * (the sections rows) — no extra query here.
   */
  moduleTitle?: string | null;
}

/** Per-chapter watch state derived from chapter_progress. */
interface ProgressInfo {
  completed: boolean;
  lastPositionSeconds: number;
}

/** Format whole-second duration as a compact M:SS clock for the thumb chip. */
function clock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

/**
 * The "Up Next" sidebar lesson navigator: up to 6 lessons from the current
 * position. Each row shows a thumbnail (or numbered fallback), title,
 * description excerpt, and a watch-state line:
 *   - "Played ✓" once chapter_progress.completed_at is set
 *   - "{n} min left" while partway through (from last_position_seconds)
 *   - duration otherwise
 * A 2px cream progress bar runs along the bottom of each thumbnail, the
 * current row is tinted cream, and a black duration chip sits bottom-right
 * of every thumb. Progress is fetched once per sibling set for the signed-in
 * user; failures degrade silently to the plain (duration-only) view.
 */
export default function UpNextList({ siblings, currentIndex, currentChapterId, courseId, currentCompleted = false, moduleTitle = null }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const motionSafe = useMotionSafe();
  const [progress, setProgress] = useState<Record<string, ProgressInfo>>({});

  useEffect(() => {
    if (!user || siblings.length === 0) {
      setProgress({});
      return;
    }
    let cancelled = false;
    const ids = siblings.map((s) => s.id);
    void supabase
      .from("chapter_progress")
      .select("chapter_id, completed_at, last_position_seconds")
      .eq("user_id", user.id)
      .in("chapter_id", ids)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const map: Record<string, ProgressInfo> = {};
        for (const row of data) {
          map[row.chapter_id] = {
            completed: row.completed_at != null,
            lastPositionSeconds: row.last_position_seconds ?? 0,
          };
        }
        setProgress(map);
      });
    return () => {
      cancelled = true;
    };
  }, [user, siblings]);

  if (siblings.length === 0) {
    return <p className="text-sm text-muted-foreground/60">No other lessons in this course.</p>;
  }

  const start = currentIndex;
  const visible = siblings.slice(start, start + 6);

  // Course-level momentum. Completed = the fetched per-sibling state, OR the
  // live current-lesson state lifted from ChapterViewer (so the bar moves the
  // moment the learner marks the current lesson done, before any refetch).
  const completedCount = siblings.reduce((n, s) => {
    const done =
      (progress[s.id]?.completed ?? false) ||
      (s.id === currentChapterId && currentCompleted);
    return n + (done ? 1 : 0);
  }, 0);
  const courseFraction = siblings.length > 0 ? completedCount / siblings.length : 0;

  return (
    <>
      {/* Momentum header: a course-level COMPLETION readout (label + a
          "done / total" count + the progress bar below). This is the completion
          half of the counter family — the position counter ("Lesson N of M")
          lives once, in the main-column header, and is deliberately NOT repeated
          here. The label carries the module name only when it's real context;
          it falls back to "Course progress" for single-section / placeholder
          courses (suppressed upstream, so moduleTitle is already null there).
          The bar fill is a transform-only scaleX (per the motion/perf budget —
          no width animation) that glides to its new fraction on the glide spring
          whenever a lesson completes; collapses to an instant set under reduced
          motion. */}
      <div className="mb-3 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="min-w-0 truncate text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
            {moduleTitle || "Course progress"}
          </p>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
            {completedCount}/{siblings.length}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="Course progress"
          aria-valuemin={0}
          aria-valuemax={siblings.length}
          aria-valuenow={completedCount}
        >
          <motion.div
            className="h-full w-full rounded-full bg-[hsl(var(--cream))]"
            style={{ transformOrigin: "left" }}
            initial={false}
            animate={{ scaleX: courseFraction }}
            transition={motionSafe.springs.glide}
          />
        </div>
      </div>
      {visible.map((s, idx) => {
        const absIndex = start + idx;
        const isCurrent = s.id === currentChapterId;
        const thumb = s.thumbnail_url || s.vdocipher_thumbnail_url || null;

        const duration = s.duration_seconds ?? 0;
        const info = progress[s.id];
        const completed = (info?.completed ?? false) || (isCurrent && currentCompleted);
        const pos = info?.lastPositionSeconds ?? 0;

        // Fraction watched (0–1) for the thumbnail progress bar. Completed
        // rows read full; in-progress rows clamp to their last position.
        const watchedFraction = completed
          ? 1
          : duration > 0
            ? Math.min(1, Math.max(0, pos / duration))
            : 0;

        // Watch-state line. "min left" is computed from the remaining
        // duration, floored at 1 so a near-finished lesson never says
        // "0 min left".
        let stateLabel: string;
        if (completed) {
          stateLabel = "Played";
        } else if (pos > 0 && duration > 0) {
          const minsLeft = Math.max(1, Math.round((duration - pos) / 60));
          stateLabel = `${minsLeft} min left`;
        } else if (duration > 0) {
          const mins = Math.max(1, Math.round(duration / 60));
          stateLabel = `${mins} min`;
        } else {
          stateLabel = "";
        }

        return (
          <button
            key={s.id}
            onClick={() => !isCurrent && navigate(`/chapters/${s.id}`)}
            disabled={isCurrent}
            className={`relative overflow-hidden w-full flex gap-3 p-2.5 rounded-lg text-left transition-colors min-h-[68px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
              isCurrent
                ? "bg-[hsl(var(--cream))]/10 ring-1 ring-[hsl(var(--cream))]/40 cursor-default"
                : "hover:bg-surface/60 active:bg-surface"
            }`}
          >
            {/* STEAL-4 row fill — the currently-playing row's background fills
                left→right with its watched fraction (transform-only scaleX on a
                cream layer behind the content). Linear, playback-driven: it
                glides to the resume position on mount and snaps to full the
                instant the lesson completes. Reduced motion sets it instantly. */}
            {isCurrent && watchedFraction > 0 && (
              <motion.span
                aria-hidden
                className="absolute inset-y-0 left-0 z-0 w-full origin-left bg-[hsl(var(--cream))]/[0.08]"
                initial={false}
                animate={{ scaleX: watchedFraction }}
                transition={motionSafe.reduced ? instant : { duration: durations.slow, ease: "linear" }}
              />
            )}
            {/* Thumbnail: cover image (or numbered fallback) + lesson-number
                chip, optional current-row play badge, a black duration chip
                bottom-right, and a 2px cream watched-progress bar pinned to
                the bottom edge. */}
            <div className="relative z-10 w-[88px] sm:w-[104px] aspect-video rounded-md overflow-hidden shrink-0 bg-surface-2">
              {thumb && (
                <img
                  src={thumb}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
              )}
              {thumb && !isCurrent && (
                <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] font-mono text-white">
                  {absIndex + 1}
                </span>
              )}
              {!thumb && !isCurrent && (
                <div className="absolute inset-0 flex items-center justify-center font-mono text-base font-semibold text-muted-foreground/50">
                  {absIndex + 1}
                </div>
              )}
              {isCurrent && (
                <span className="absolute inset-0 bg-[hsl(var(--cream))]/15 flex items-center justify-center">
                  <Play className="h-4 w-4 fill-[hsl(var(--cream))] text-[hsl(var(--cream))]" />
                </span>
              )}
              {duration > 0 && (
                <span className="absolute bottom-1 right-1 px-1 py-0.5 rounded bg-black/80 text-[9px] font-mono leading-none text-white">
                  {clock(duration)}
                </span>
              )}
              {watchedFraction > 0 && (
                <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-black/40">
                  <span
                    className="block h-full bg-[hsl(var(--cream))]"
                    style={{ width: `${watchedFraction * 100}%` }}
                  />
                </span>
              )}
            </div>
            <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-center">
              <p className={`text-sm leading-tight line-clamp-2 ${isCurrent ? "font-semibold" : ""}`}>
                {s.title}
              </p>
              {s.description && (
                <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
                  {s.description}
                </p>
              )}
              {stateLabel && (
                <p
                  className={`text-[10px] mt-1 font-mono flex items-center gap-1 ${
                    completed
                      ? "text-[hsl(var(--accent-emerald))]/80"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {completed && <Check className="h-3 w-3" strokeWidth={2.5} />}
                  {stateLabel}
                </p>
              )}
            </div>
          </button>
        );
      })}
      {courseId && siblings.length > 6 && (
        <Link
          to={`/courses/${courseId}`}
          className="flex w-full min-h-[44px] items-center justify-center text-center text-xs text-muted-foreground hover:text-foreground transition-colors mt-1"
        >
          View all {siblings.length} lessons
        </Link>
      )}
    </>
  );
}
