import { BookOpen, Play } from "lucide-react";
import Reveal from "@/components/motion/Reveal";
import { hapticSelection } from "@/lib/haptics";

/**
 * Minimal chapter/section shapes the browser needs. Kept structurally
 * compatible with PublicOffering's ChapterRow/SectionRow so the page can
 * pass its fetched sections straight through.
 */
export interface LessonBrowserChapter {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  make_free: boolean | null;
  sort_order: number;
  thumbnail_url: string | null;
  vdocipher_thumbnail_url: string | null;
}
export interface LessonBrowserSection {
  id: string;
  title: string;
  sort_order: number;
  chapters: LessonBrowserChapter[];
}

interface LessonBrowserProps {
  sections?: LessonBrowserSection[];
  durationMinutes?: number | null;
  totalLessons?: number | null;
  /** id of the make_free chapter surfaced as the free preview, if any. */
  freeChapterId?: string | null;
  /** Tapped a free row → page scrolls to + auto-plays the preview. */
  onPreview?: () => void;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds || seconds <= 0) return null;
  const mins = Math.max(1, Math.round(seconds / 60));
  return `${mins} min`;
}

/**
 * LessonBrowser: the single MasterClass-style curriculum list that
 * replaces the old "What you'll learn" preview rail + separate text
 * curriculum accordion. Every chapter renders as one numbered row with a
 * thumbnail, title, optional description, and a duration chip.
 *
 * make_free rows become tappable: tapping one scrolls to and starts the
 * existing FreePreviewPlayer (via onPreview). Locked rows are static.
 * Section headers only appear when the course has more than one section,
 * so a single-section masterclass reads as one clean numbered list.
 */
export default function LessonBrowser({
  sections,
  durationMinutes,
  totalLessons,
  freeChapterId,
  onPreview,
}: LessonBrowserProps) {
  if (!sections?.length) return null;

  const sorted = [...sections].sort((a, b) => a.sort_order - b.sort_order);
  const allChapters = sorted.flatMap((s) => s.chapters || []);
  if (!allChapters.length) return null;

  const multiSection = sorted.length > 1;
  const lessonCount = totalLessons || allChapters.length;
  // Running 1-based lesson index across all sections, so a 3-section
  // course numbers 01 → 12 continuously rather than restarting each block.
  let runningIndex = 0;

  return (
    <Reveal className="space-y-5">
      <div className="space-y-3">
        <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
          The lessons
        </p>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground tracking-[-0.01em]">
            What you'll learn, lesson by lesson
          </h2>
          <div className="text-xs text-muted-foreground font-mono">
            {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
            {durationMinutes ? ` · ${Math.round(durationMinutes / 60)}h` : ""}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {sorted.map((section) => {
          const chapters = [...(section.chapters || [])].sort(
            (a, b) => a.sort_order - b.sort_order,
          );
          if (!chapters.length) return null;
          return (
            <div key={section.id} className="space-y-2">
              {multiSection && (
                <h3 className="px-1 text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">
                  {section.title}
                </h3>
              )}
              <ol className="overflow-hidden rounded-2xl border border-border bg-[hsl(var(--surface))] divide-y divide-border">
                {chapters.map((ch) => {
                  runningIndex += 1;
                  const number = String(runningIndex).padStart(2, "0");
                  const thumb =
                    ch.thumbnail_url || ch.vdocipher_thumbnail_url || null;
                  const duration = formatDuration(ch.duration_seconds);
                  // A row is the tappable free preview when it's flagged
                  // free AND it's the chapter the page surfaces (so two
                  // free chapters never both claim the single player).
                  const isPreview =
                    !!ch.make_free &&
                    !!onPreview &&
                    (!freeChapterId || ch.id === freeChapterId);

                  const inner = (
                    <>
                      <div className="relative w-24 h-[54px] sm:w-28 sm:h-16 flex-shrink-0 overflow-hidden rounded-lg bg-[hsl(var(--surface-2))]">
                        {thumb ? (
                          <img
                            src={thumb}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            className="absolute inset-0 h-full w-full object-cover"
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-muted-foreground/30">
                            <BookOpen className="h-5 w-5" />
                          </span>
                        )}
                        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] text-white tabular-nums">
                          {number}
                        </span>
                        {isPreview && (
                          <span className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 transition-opacity group-hover:opacity-100">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))]">
                              <Play className="ml-0.5 h-4 w-4 fill-current" />
                            </span>
                          </span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground sm:text-base">
                          {ch.title}
                        </p>
                        {ch.description && (
                          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:text-sm">
                            {ch.description}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-shrink-0 flex-col items-end gap-1.5 self-start pt-0.5">
                        {ch.make_free && (
                          <span className="rounded border border-[hsl(var(--accent-emerald)/0.4)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[hsl(var(--accent-emerald))]">
                            {isPreview ? "Preview" : "Free"}
                          </span>
                        )}
                        {duration && (
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {duration}
                          </span>
                        )}
                      </div>
                    </>
                  );

                  if (isPreview) {
                    return (
                      <li key={ch.id}>
                        <button
                          type="button"
                          onClick={() => {
                            void hapticSelection();
                            onPreview?.();
                          }}
                          aria-label={`Play free preview: ${ch.title}`}
                          className="group flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-[hsl(var(--surface-2))] sm:gap-4 sm:p-4"
                        >
                          {inner}
                        </button>
                      </li>
                    );
                  }

                  return (
                    <li
                      key={ch.id}
                      className="group flex items-center gap-3 p-3 sm:gap-4 sm:p-4"
                    >
                      {inner}
                    </li>
                  );
                })}
              </ol>
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}
