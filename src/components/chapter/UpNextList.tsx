import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Play, Check } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import type { ChapterSibling } from "@/components/chapter/types";

interface Props {
  siblings: ChapterSibling[];
  currentIndex: number;
  currentChapterId: string;
  courseId: string | null;
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
export default function UpNextList({ siblings, currentIndex, currentChapterId, courseId }: Props) {
  const navigate = useNavigate();
  const { user } = useAuth();
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

  return (
    <>
      {visible.map((s, idx) => {
        const absIndex = start + idx;
        const isCurrent = s.id === currentChapterId;
        const thumb = s.thumbnail_url || s.vdocipher_thumbnail_url || null;

        const duration = s.duration_seconds ?? 0;
        const info = progress[s.id];
        const completed = info?.completed ?? false;
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
            className={`w-full flex gap-3 p-2.5 rounded-lg text-left transition-colors min-h-[68px] ${
              isCurrent
                ? "bg-[hsl(var(--cream))]/10 ring-1 ring-[hsl(var(--cream))]/40 cursor-default"
                : "hover:bg-surface/60 active:bg-surface"
            }`}
          >
            {/* Thumbnail: cover image (or numbered fallback) + lesson-number
                chip, optional current-row play badge, a black duration chip
                bottom-right, and a 2px cream watched-progress bar pinned to
                the bottom edge. */}
            <div className="relative w-[88px] sm:w-[104px] aspect-video rounded-md overflow-hidden shrink-0 bg-surface-2">
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
            <div className="flex-1 min-w-0 flex flex-col justify-center">
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
          className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 mt-1"
        >
          View all {siblings.length} lessons
        </Link>
      )}
    </>
  );
}
