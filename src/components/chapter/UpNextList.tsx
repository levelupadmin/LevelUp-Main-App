import { Link, useNavigate } from "react-router-dom";
import { Play } from "lucide-react";
import type { ChapterSibling } from "@/components/chapter/types";

interface Props {
  siblings: ChapterSibling[];
  currentIndex: number;
  currentChapterId: string;
  courseId: string | null;
}

/**
 * The "Up Next" sidebar lesson navigator — up to 6 lessons from the current
 * position, each with thumbnail (or numbered fallback), title, description
 * excerpt and duration. Extracted verbatim from ChapterViewer; behaviour
 * unchanged (chapter.id is now passed in as currentChapterId).
 */
export default function UpNextList({ siblings, currentIndex, currentChapterId, courseId }: Props) {
  const navigate = useNavigate();

  return (
    <>
      {siblings.length === 0 ? (
        <p className="text-sm text-muted-foreground/60">No other lessons in this course.</p>
      ) : (
        <>
          {(() => {
            const start = currentIndex;
            const visible = siblings.slice(start, start + 6);
            return visible.map((s, idx) => {
              const absIndex = start + idx;
              const isCurrent = s.id === currentChapterId;
              const mins = s.duration_seconds ? Math.max(1, Math.round(s.duration_seconds / 60)) : null;
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
                  {/* Thumbnail with overlaid lesson number badge.
                      Resolution order matches the admin contract:
                        1. Custom thumbnail_url (creator override)
                        2. vdocipher_thumbnail_url (auto-fetched poster)
                        3. Numbered tile fallback
                      Only the last branch shows a big centered number;
                      the others get a small black chip in the top-left. */}
                  {(() => {
                    const thumb = s.thumbnail_url || s.vdocipher_thumbnail_url || null;
                    return (
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
                      </div>
                    );
                  })()}
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <p className={`text-sm leading-tight line-clamp-2 ${isCurrent ? "font-semibold" : ""}`}>
                      {s.title}
                    </p>
                    {s.description && (
                      <p className="text-[11px] text-muted-foreground line-clamp-2 mt-1 leading-snug">
                        {s.description}
                      </p>
                    )}
                    {mins && (
                      <p className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                        {mins} min
                      </p>
                    )}
                  </div>
                </button>
              );
            });
          })()}
          {courseId && siblings.length > 6 && (
            <Link
              to={`/courses/${courseId}`}
              className="block w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors py-2 mt-1"
            >
              View all {siblings.length} lessons
            </Link>
          )}
        </>
      )}
    </>
  );
}
