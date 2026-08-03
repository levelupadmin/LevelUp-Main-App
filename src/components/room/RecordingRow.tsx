import type { ReactNode } from "react";
import { ExternalLink, Play } from "lucide-react";

import { tapTick } from "@/lib/haptics";
import { cn } from "@/lib/utils";

/**
 * RecordingRow — one shelf row: poster, week eyebrow, serif title, duration,
 * and the watched hairline.
 *
 * PRESENTATIONAL ONLY. It is handed strings and a percentage; every derivation
 * (which week a session belongs to, what its real length is, how much of it has
 * been watched) happens once in `RoomScreenings` where the envelope is, so two
 * rows can never disagree about the same session.
 *
 * ── The two kinds of row ──────────────────────────────────────────────────
 * `href` set   → a LINK-OUT. Renders a real `<a target="_blank">`, exactly what
 *                the shipped `MySessionsPage` does, because a URL we cannot
 *                embed is a URL we cannot report a position for. It never shows
 *                a resume bar; the caller records `completed` on open instead.
 * `href` unset → an EMBED. Renders a `<button>` that mounts the player passed as
 *                `children` underneath. This is the only row that resumes.
 *
 * ── The hairline ──────────────────────────────────────────────────────────
 * A 1px rule at the foot of the row, filled left-to-right in `--room-accent`
 * with a `scaleX` transform — no width animation, so it composites on the GPU
 * inside the Android WebView. The global `prefers-reduced-motion` block in
 * index.css collapses its transition, so there is no second reduced-motion path
 * to keep in sync here.
 *
 * `progressPct: null` means the caller cannot state a fraction it would stand
 * behind, and the fill is then not rendered AT ALL — the groove keeps the row's
 * height, and the row says where the student stopped in its status line instead.
 * A bar that is drawn is a bar that is claimed.
 */

export interface RecordingRowProps {
  /**
   * The session this row is for. Rendered as `data-session-id` so the Continue
   * watching rail can find the row it just opened without threading a ref per
   * row through the list.
   */
  sessionId: string;
  /** Mono eyebrow — "WEEK 03", or the IST date when the week is not derivable. */
  eyebrow: string;
  /** What sits in the poster tile: the episode ordinal, e.g. "03". */
  posterLabel: string;
  title: string;
  /** "48 min" / "1h 12m". Null when the row has nothing truthful to say. */
  durationLabel: string | null;
  /**
   * 0–100, or null when no fraction is known well enough to draw. Always 0 for a
   * link-out, which has no position to report.
   */
  progressPct: number | null;
  /** "Resume at 12:30" / "Watched" / "Opened" — the row's one status line. */
  statusLabel: string | null;
  /** Set for a link-out; the row becomes an anchor. */
  href?: string | null;
  /** True while this row's player is mounted below it. */
  open?: boolean;
  onOpen: () => void;
  /** The player. Rendered under the poster row when `open`. */
  children?: ReactNode;
  className?: string;
}

const posterClasses =
  "relative flex h-[45px] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-surface-2 sm:h-[54px] sm:w-24";

export function RecordingRow({
  sessionId,
  eyebrow,
  posterLabel,
  title,
  durationLabel,
  progressPct,
  statusLabel,
  href,
  open,
  onOpen,
  children,
  className,
}: RecordingRowProps) {
  // Clamped here as well as at the source: a hairline is a claim about how much
  // of the recording has been watched, and it must never overrun its rail.
  const fill =
    typeof progressPct === "number" && Number.isFinite(progressPct)
      ? Math.min(100, Math.max(0, progressPct)) / 100
      : null;

  const inner = (
    <>
      <span className={posterClasses} aria-hidden="true">
        <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground">
          {posterLabel}
        </span>
        <span className="absolute inset-0 flex items-center justify-center text-room-accent opacity-0 transition-opacity group-hover:opacity-100">
          {href ? (
            <ExternalLink size={16} strokeWidth={1.5} />
          ) : (
            <Play size={16} strokeWidth={1.5} />
          )}
        </span>
      </span>

      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
          {eyebrow}
        </span>
        <span className="mt-1 block truncate font-serif text-lg leading-tight text-foreground">
          {title}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {durationLabel && <span>{durationLabel}</span>}
          {durationLabel && statusLabel && <span aria-hidden="true">·</span>}
          {statusLabel && <span className="text-room-accent">{statusLabel}</span>}
          {href && (
            <>
              <span aria-hidden="true">·</span>
              <span>Opens in a new tab</span>
            </>
          )}
        </span>
      </span>
    </>
  );

  const triggerClasses =
    "focus-ring pressable group flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-surface-2/60";

  return (
    <li
      data-session-id={sessionId}
      className={cn("relative rounded-xl border border-border bg-surface", className)}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void tapTick();
            onOpen();
          }}
          className={triggerClasses}
        >
          {inner}
        </a>
      ) : (
        <button
          type="button"
          aria-expanded={!!open}
          onClick={() => {
            void tapTick();
            onOpen();
          }}
          className={triggerClasses}
        >
          {inner}
        </button>
      )}

      {open && children && <div className="px-3 pb-3">{children}</div>}

      {/* The watched hairline. The GROOVE is rendered for every row so the shelf
          keeps one baseline and no row changes height when a length becomes
          known; the FILL only exists when there is a fraction to stand behind.
          Inset by the row's own padding so it aligns with the content column and
          never crosses the card's rounded corner — the card cannot be
          `overflow-hidden`, which would clip the trigger's focus ring. */}
      <div className="mx-3 mb-3 h-px overflow-hidden bg-border">
        {fill !== null && (
          <div
            data-testid="recording-hairline"
            data-fill-pct={Math.round(fill * 100)}
            className="h-full w-full origin-left bg-room-accent transition-transform"
            style={{
              transform: `scaleX(${fill})`,
              transitionDuration: "var(--motion-base)",
              transitionTimingFunction: "var(--ease-out)",
            }}
          />
        )}
      </div>
    </li>
  );
}

export default RecordingRow;
