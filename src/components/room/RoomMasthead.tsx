/**
 * RoomMasthead.tsx — the title card of a cohort room (R1-T3).
 *
 * This is the surface that decides whether a room reads as a PLACE or as a page
 * with a header. It is the "Season One" masthead from
 * `design/cohorts/ROOMS-ARCHITECTURE.md` §4.1: landscape hero art behind a
 * scrim, the room's monogram, the wordmark in mono/tracking-widest at the room
 * accent, a serif-italic tagline, and one status line ("WEEK 4 OF 12").
 *
 * Layout notes that are load-bearing, not decoration:
 *  - The art layer is ABSOLUTE. The block's height comes from the nameplate and
 *    its top padding, so a slow (or missing, or broken) hero can never resize
 *    the card — CLS stays at zero and there is never a collapsed void.
 *  - With no `heroUrl` the same box renders a monogram crest washed in the room
 *    accent, so an unarted room is a different-looking room, not an empty one.
 *  - Accent colours come from `--room-accent` via the `room-accent` Tailwind
 *    alias (R1-T2); `:root` defaults it to cream, so a masthead rendered outside
 *    a `RoomThemeProvider` still paints a legible nameplate.
 *  - `grain` is the EXISTING util (src/index.css) at its existing ≤4% opacity.
 *    No backdrop-filter, no per-room motion, no custom fonts — §4.1's hard rules.
 *
 * Every `theme` field arrives from `resolveTheme()` already trimmed, length
 * capped and scheme checked, so nothing here re-validates or re-truncates; the
 * 2-line clamp on the wordmark is purely visual.
 */
import { motion } from "framer-motion";
import ArtworkImage from "@/components/media/ArtworkImage";
import { useRoomEntrance, useRoomEntranceContext } from "@/components/room/RoomEntrance";
import type { RoomTheme } from "@/lib/room";
import { cn } from "@/lib/utils";

/** The room's lifecycle phase (`cohort_room_configs.phase`). */
export type RoomPhase = "pre_start" | "live" | "wrap" | "alumni";

export interface RoomMastheadProps {
  /** Room slug — keys the once-per-session entrance. */
  slug: string;
  /** The resolved theme from `resolveTheme()` (camelCase, already sanitised). */
  theme: RoomTheme;
  /** Room phase. Defaults to `live`, the state a themed room spends most of its life in. */
  phase?: RoomPhase;
  /** 1-based current week, when weeks are authored. */
  weekNumber?: number | null;
  /** Total authored weeks. */
  weekCount?: number | null;
  /** ISO batch start — the "Starts {date}" line in `pre_start`. */
  startsAt?: string | null;
  /** Offering title, used as the nameplate only when the theme has no wordmark. */
  title?: string | null;
  /** Applied to the outer block (e.g. `rounded-none border-x-0` for a full-bleed shell). */
  className?: string;
  /** A shallower nameplate for nested room routes, where the module is primary. */
  compact?: boolean;
}

/**
 * The accent wash behind the art. Inline because it is a gradient over the
 * accent var (no Tailwind alias covers that), and it is what keeps two rooms
 * carrying the SAME artwork reading as two different places.
 */
const ACCENT_WASH =
  "radial-gradient(120% 85% at 50% 0%, hsl(var(--room-accent) / 0.16), transparent 68%)";

/** Day-granularity date in the calendar members actually live in (R-D: IST). */
const IST_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

function istDay(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return IST_DAY.format(date);
}

/**
 * The one status line under the tagline. Uppercased by CSS, so it reads
 * "WEEK 4 OF 12" / "STARTS 12 AUG". Returns null when there is genuinely
 * nothing true to say — the line is then omitted rather than faked.
 */
function statusLine({
  phase,
  weekNumber,
  weekCount,
  startsAt,
}: Pick<RoomMastheadProps, "phase" | "weekNumber" | "weekCount" | "startsAt">): string | null {
  if (phase === "pre_start") {
    const day = istDay(startsAt);
    return day ? `Starts ${day}` : "Starts soon";
  }
  if (phase === "alumni") {
    return weekCount ? `Completed · ${weekCount} weeks` : "Completed";
  }
  if (weekNumber && weekCount) return `Week ${weekNumber} of ${weekCount}`;
  if (weekCount) return `${weekCount} weeks`;
  return null;
}

/**
 * The crest glyph. `theme.monogram` is the authored answer; initials of the
 * nameplate are the fallback so an unarted, un-monogrammed room still has a
 * mark instead of a hole. Capped at 3 characters, matching the authored field.
 */
function crestGlyph(theme: RoomTheme, title: string | null | undefined): string | null {
  if (theme.monogram) return theme.monogram;
  const source = theme.wordmarkText ?? title;
  if (!source) return null;
  const initials = source
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word[0])
    .join("")
    .slice(0, 3);
  return initials ? initials.toUpperCase() : null;
}

/**
 * The room's title card. Mounted by `RoomShell` (R1-T1); wrap it in
 * `<RoomEntrance slug>` only if other surfaces need to share the same beat.
 */
const RoomMasthead = ({
  slug,
  theme,
  phase = "live",
  weekNumber,
  weekCount,
  startsAt,
  title,
  className,
  compact = false,
}: RoomMastheadProps) => {
  // A provider above us owns the beat when present; otherwise we own it. Both
  // hooks run unconditionally, but the local one stays inert (no ledger read or
  // write) whenever the provider is driving.
  const provided = useRoomEntranceContext();
  const own = useRoomEntrance(slug, { enabled: !provided });
  const entrance = provided ?? own;

  const nameplate = theme.wordmarkText ?? title ?? null;
  const crest = crestGlyph(theme, title);
  const status = statusLine({ phase, weekNumber, weekCount, startsAt });

  return (
    <header
      data-testid="room-masthead"
      data-room-phase={phase}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-border bg-canvas",
        theme.texture === "grain" && "grain",
        className,
      )}
    >
      {/* ── Art layer ── absolute, so nothing it does can move the nameplate. */}
      <motion.div
        data-testid="room-masthead-art"
        className="absolute inset-0 z-0 transform-gpu"
        aria-hidden="true"
        {...entrance.art}
      >
        {theme.heroUrl ? (
          <ArtworkImage
            src={theme.heroUrl}
            alt=""
            aspect="video"
            priority
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <div
            data-testid="room-masthead-crest"
            className="absolute inset-0 grid place-items-center bg-gradient-to-b from-surface-2 to-canvas"
          >
            {crest && (
              <span className="select-none font-mono text-[clamp(72px,26vw,148px)] uppercase leading-none tracking-[0.14em] text-room-accent opacity-[0.16]">
                {crest}
              </span>
            )}
          </div>
        )}

        {/* Accent wash — the same art under two themes still reads as two rooms. */}
        <div className="absolute inset-0" style={{ backgroundImage: ACCENT_WASH }} />
        {/* Scrim — owned here, not by ArtworkImage's own half-height one, so the
            hero and the crest get identical legibility treatment. */}
        <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/80 to-canvas/25" />
      </motion.div>

      {/* ── Nameplate ── the block's height comes from here. */}
      <motion.div
        data-testid="room-masthead-plate"
        className={cn(
          "relative z-10 transform-gpu px-5",
          compact
            ? "pb-5 pt-14 sm:px-6 sm:pb-6 sm:pt-16"
            : "pb-6 pt-32 sm:px-8 sm:pb-8 sm:pt-44",
        )}
        {...entrance.plate}
      >
        {phase === "alumni" && (
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.34em] text-room-accent-text">
            Alumni
          </p>
        )}
        <div className="flex items-start gap-3">
          {/* The chip carries the mark when the hero does not; with no hero the
              crest behind the plate is already doing that job. */}
          {crest && theme.heroUrl && (
            <span
              aria-hidden="true"
              className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-md border border-room-accent/30 bg-canvas/50 font-mono text-[12px] uppercase tracking-[0.06em] text-room-accent"
            >
              {crest}
            </span>
          )}
          {nameplate && (
            <h1 className="line-clamp-2 break-words font-mono text-[17px] uppercase leading-[1.35] tracking-widest text-room-accent sm:text-[22px]">
              {nameplate}
            </h1>
          )}
        </div>

        {!compact && theme.tagline && (
          <p className="mt-2 font-serif-italic text-[18px] leading-snug text-cream/75 sm:text-[22px]">
            {theme.tagline}
          </p>
        )}

        {status && (
          <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-cream/55">
            {status}
          </p>
        )}
      </motion.div>
    </header>
  );
};

export default RoomMasthead;
