/**
 * RoomMasthead.tsx — the title card of a cohort room (R1-T3).
 *
 * The room's name, its tagline, and the cohort's weeks drawn as the line from
 * one segment per week (RoomWeekLine), with one status line under it ("WEEK 4 OF
 * 12 · 8 WEEKS TO GO"). Optional hero art sits as a band above the name.
 *
 * Layout notes that are load-bearing, not decoration:
 *  - The art layer is ABSOLUTE. The block's height comes from the nameplate and
 *    its top padding, so a slow (or missing, or broken) hero can never resize
 *    the card — CLS stays at zero and there is never a collapsed void.
 *  - With no `heroUrl` the nameplate sits on the card with a faint accent wash;
 *    the week line is what makes one room look different from the next.
 *  - Accent colours come from `--room-accent` via the `room-accent` Tailwind
 *    alias (R1-T2); `:root` defaults it to cream, so a masthead rendered outside
 *    a `RoomThemeProvider` still paints a legible nameplate.
 *  - No grain, no backdrop-filter, no per-room motion, no custom fonts.
 *
 * Every `theme` field arrives from `resolveTheme()` already trimmed, length
 * capped and scheme checked, so nothing here re-validates or re-truncates; the
 * 2-line clamp on the wordmark is purely visual.
 */
import { motion } from "framer-motion";
import ArtworkImage from "@/components/media/ArtworkImage";
import { useRoomEntrance, useRoomEntranceContext } from "@/components/room/RoomEntrance";
import type { RoomTheme } from "@/lib/room";
import RoomWeekLine from "@/components/room/RoomWeekLine";
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
  "radial-gradient(90% 120% at 100% 0%, hsl(var(--room-accent) / 0.10), transparent 62%)";

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

  const kicker = phase === "alumni" ? "Alumni" : "Live cohort";
  const weeksLeft =
    phase === "live" && weekNumber && weekCount ? Math.max(0, weekCount - weekNumber) : null;

  return (
    <header
      data-testid="room-masthead"
      data-room-phase={phase}
      className={cn(
        "relative isolate overflow-hidden rounded-2xl border border-border bg-surface",
        className,
      )}
    >
      {/* ── Art layer ── a hero, when the room has one, sits as a band above
          the nameplate; without one the room is the nameplate and its line,
          over a faint wash of the room accent. Absolute either way, so a slow
          or broken image never moves the text. */}
      <motion.div
        data-testid="room-masthead-art"
        className="absolute inset-0 z-0 transform-gpu"
        aria-hidden="true"
        {...entrance.art}
      >
        {theme.heroUrl && (
          <>
            <ArtworkImage
              src={theme.heroUrl}
              alt=""
              aspect="video"
              priority
              className="absolute inset-0 h-full w-full"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-surface/85 to-surface/20" />
          </>
        )}
        <div className="absolute inset-0" style={{ backgroundImage: ACCENT_WASH }} />
      </motion.div>

      {/* ── Nameplate ── the block's height comes from here. */}
      <motion.div
        data-testid="room-masthead-plate"
        className={cn(
          "relative z-10 transform-gpu px-5 sm:px-7",
          compact ? "pb-4 pt-4" : theme.heroUrl ? "pb-5 pt-28 sm:pt-36" : "pb-5 pt-5 sm:pb-6 sm:pt-6",
        )}
        {...entrance.plate}
      >
        {!compact && (
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
            {kicker}
          </p>
        )}
        <div className={cn("flex items-center gap-3", !compact && "mt-2")}>
          {crest && theme.heroUrl && (
            <span
              aria-hidden="true"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-room-accent/30 bg-surface/60 font-mono text-[12px] uppercase text-room-accent"
            >
              {crest}
            </span>
          )}
          {nameplate && (
            <h1
              className={cn(
                "line-clamp-2 break-words font-display font-bold leading-[1.1] tracking-tight text-foreground",
                compact ? "text-[19px]" : "text-[27px] sm:text-[32px]",
              )}
            >
              {nameplate}
            </h1>
          )}
        </div>

        {!compact && theme.tagline && (
          <p className="mt-1.5 font-serif-italic text-[17px] leading-snug text-room-accent-text/75 sm:text-[19px]">
            {theme.tagline}
          </p>
        )}

        {weekCount && weekCount > 1 ? (
          <RoomWeekLine
            total={weekCount}
            current={phase === "pre_start" ? null : weekNumber ?? null}
            complete={phase === "alumni"}
            className={compact ? "mt-3 max-w-[260px]" : "mt-5 max-w-[420px]"}
          />
        ) : null}

        {(status || weeksLeft !== null) && (
          <p
            className={cn(
              "flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground",
              compact ? "mt-2 max-w-[260px]" : "mt-3 max-w-[420px]",
            )}
          >
            {status && <span className="text-foreground/80">{status}</span>}
            {weeksLeft !== null && weeksLeft > 0 && (
              <span>
                {weeksLeft} {weeksLeft === 1 ? "week" : "weeks"} to go
              </span>
            )}
            {weeksLeft === 0 && <span>Final week</span>}
          </p>
        )}
      </motion.div>
    </header>
  );
};

export default RoomMasthead;
