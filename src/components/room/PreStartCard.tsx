import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { CalendarDays, ExternalLink, MessageCircle, Pin, Users } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SkeletonLine } from "@/components/patterns";
import { tapTick } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import { moduleEnabled } from "@/lib/room";
import { cn } from "@/lib/utils";
import {
  isLobbyEnvelope,
  useRoomRoster,
  type CohortRoomEnvelope,
  type RoomRosterEntry,
  type RoomSession,
} from "@/hooks/useCohortRooms";

/**
 * PreStartCard — the induction window (`phase === 'pre_start'`).
 *
 * The stretch between "I paid" and "week 1 starts" is the window the product
 * currently shows NOTHING for. This is what it shows instead: when the doors
 * open, who else is already inside, the first word from the team, the WhatsApp
 * group while R-D5 coexistence holds, and what the season is shaped like.
 *
 * ── Two axes, never conflated ─────────────────────────────────────────────
 * `phase` (pre_start | live | wrap | alumni) and `access` (member | pre_member)
 * are independent, and a LOBBY visitor is the likeliest person to land here.
 * The server REDACTS their envelope: `sessions` and `rosterCount` resolve empty
 * because a lobby row carries no batch (`get_cohort_room`, rpcs.sql:476/:506),
 * and `get_room_roster` RAISES for them outright (rpcs.sql:639). None of that
 * is a denial and none of it is an error. It is a smaller room, so the modules
 * that have nothing to say are NOT rendered as empty shells: every block below
 * is pushed into `blocks` only once it has real content, which is what makes
 * "no dead modules" structural rather than a thing to remember.
 *
 * ── Data ownership ────────────────────────────────────────────────────────
 * The envelope arrives from the shell's outlet context (R1-T1's
 * `RoomOutletContext.envelope`) as the `room` prop, and the one field it does
 * not carry — the membership row's week count — arrives beside it as
 * `totalWeeks`; the roster comes from `useRoomRoster` (R1-T1). This file never calls
 * `supabase.rpc('get_room_roster')` itself: the hook owns the denied-vs-empty
 * mapping, and re-deriving it here would give the app two answers to the one
 * question R0 was careful to keep single.
 *
 * The masthead is NOT rendered here. `RoomShell` mounts `RoomMasthead` above
 * the `<Outlet/>` for every phase, so a title card in this file would be the
 * second one on the page.
 *
 * ── Time ──────────────────────────────────────────────────────────────────
 * The countdown is DAY granularity on the IST calendar members actually live
 * in, computed on instants with a fixed +05:30 offset (IST has no DST), so the
 * answer is identical on a device set to any timezone. See `istDayIndex`.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * IST day arithmetic
 * Mirrors the private helpers in `src/lib/room.ts` (which does not export
 * them). Same constants, same derivation, same reason: a member travelling
 * must not see a different room from the cohort-mate beside them.
 * ────────────────────────────────────────────────────────────────────────── */

/** IST is a fixed UTC+05:30 with no DST, which is why this can be arithmetic. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

const IST_TIME_ZONE = "Asia/Kolkata";

/** Which IST calendar day an instant falls on, as a day number (IST midnights). */
function istDayIndex(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
}

/**
 * Whole IST days from `nowMs` until `startMs`.
 *
 * DAY granularity means the answer changes at IST MIDNIGHT, not at the hour the
 * cohort happens to begin: at 23:59 IST the day before, this is 1 ("Tomorrow");
 * two minutes later, at 00:01 IST, it is 0 ("Today"). `offerings.cohort_start_date`
 * is a `date` column (20260610090000:29), so it arrives as "YYYY-MM-DD" and
 * parses to UTC midnight, which lands inside the very IST day it names.
 */
function istDaysUntil(startMs: number, nowMs: number): number {
  return istDayIndex(startMs) - istDayIndex(nowMs);
}

/** How often the countdown re-checks the clock. Day granularity, so a minute is ample. */
const COUNTDOWN_TICK_MS = 60_000;

const doorsDateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "long",
  day: "numeric",
  month: "long",
});

const noticeDateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const weekdayFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "long",
});

const clockFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Clock time in IST, with the meridiem uppercased to match the rest of the app
 * (`eventDateTimeLabel` formats "h:mm a", which yields "8:00 PM"). `en-IN`
 * hands back a lowercase "pm", and the two would otherwise disagree on the same
 * screen.
 */
function istClockLabel(ms: number): string {
  return clockFormat.format(ms).replace(/\b([ap])\.?m\.?\b/gi, (match) => match.toUpperCase());
}

/* ──────────────────────────────────────────────────────────────────────────
 * Small pure helpers
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * The earliest scheduled airing in the envelope, or null.
 *
 * `get_cohort_room` already orders `sessions` by `scheduled_at`, but the first
 * row is only the earliest if every row has a date, so this scans rather than
 * trusting position.
 */
function firstScheduledAt(sessions: RoomSession[] | null | undefined): string | null {
  let bestValue: string | null = null;
  let bestMs = Number.POSITIVE_INFINITY;
  for (const session of sessions ?? []) {
    const ms = parseMs(session.scheduled_at);
    if (Number.isFinite(ms) && ms < bestMs) {
      bestMs = ms;
      bestValue = session.scheduled_at ?? null;
    }
  }
  return bestValue;
}

/** Epoch ms for a nullable ISO/date string, or NaN. */
function parseMs(value: string | null | undefined): number {
  return value ? Date.parse(value) : NaN;
}

/**
 * An external link we are willing to put in an `href`.
 *
 * `offerings.whatsapp_group_link` is a free-text admin field, so http(s) only:
 * a `javascript:` URL typed into that box must render as no card at all rather
 * than as a live one. Same whitelist posture as `resolveTheme`'s hero check.
 */
function externalHttpUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://") ? trimmed : null;
}

/** First name for a roster tile; initials cover the no-name row. */
function firstName(fullName: string | null): string | null {
  const trimmed = (fullName ?? "").trim();
  if (!trimmed) return null;
  return trimmed.split(/\s+/)[0];
}

function initials(fullName: string | null): string {
  const parts = (fullName ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}

/** Roster roles that are staff rather than cohort-mates (rpcs.sql:658 orders them first). */
const STAFF_ROLES = new Set(["mentor", "host"]);

/** How many faces the grid shows before it summarises the rest. */
const ROSTER_FACES_SHOWN = 8;

/** Modal (most frequent) value of a list, with the count that won. */
function modal(values: string[]): { value: string; count: number } | null {
  const tally = new Map<string, number>();
  for (const value of values) tally.set(value, (tally.get(value) ?? 0) + 1);

  let bestValue: string | null = null;
  let bestCount = 0;
  for (const [value, count] of tally) {
    if (count > bestCount) {
      bestValue = value;
      bestCount = count;
    }
  }
  return bestValue === null ? null : { value: bestValue, count: bestCount };
}

/** What the "What to expect" block found. Every field may be absent. */
interface Expectation {
  weeks: number | null;
  sessionCount: number;
  cadence: string | null;
}

/**
 * The shape of the season, from whatever the room actually has authored.
 *
 * Nothing is invented: with no weeks authored and no sessions scheduled this
 * returns all-empty and the caller drops the block instead of rendering a shell
 * of dashes. A lobby envelope lands here too (its sessions array is empty by
 * construction) and takes the same exit.
 */
function summariseExpectation(
  sessions: RoomSession[] | null | undefined,
  totalWeeks: number | null | undefined,
): Expectation {
  const list = sessions ?? [];
  const dated = list
    .map((session) => parseMs(session.scheduled_at))
    .filter((ms) => Number.isFinite(ms));

  const authoredWeekIds = new Set(
    list.map((session) => session.week_id).filter((id): id is string => Boolean(id)),
  );
  const weeks =
    typeof totalWeeks === "number" && totalWeeks > 0
      ? totalWeeks
      : authoredWeekIds.size > 0
        ? authoredWeekIds.size
        : null;

  // Cadence is only claimed when the schedule repeats: one session on a Sunday
  // is a date, not a rhythm, and "Sundays" would be a promise the room invented.
  const dominantDay = modal(dated.map((ms) => weekdayFormat.format(ms)));
  let cadence: string | null = null;
  if (dominantDay && dominantDay.count >= 2) {
    const onThatDay = dated.filter((ms) => weekdayFormat.format(ms) === dominantDay.value);
    const dominantTime = modal(onThatDay.map((ms) => istClockLabel(ms)));
    cadence =
      dominantTime && dominantTime.count >= 2
        ? `${dominantDay.value}s at ${dominantTime.value} IST`
        : `${dominantDay.value}s`;
  }

  return { weeks, sessionCount: dated.length, cadence };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Component
 * ────────────────────────────────────────────────────────────────────────── */

export interface PreStartCardProps {
  /** The `get_cohort_room` envelope from the shell's outlet context. */
  room: CohortRoomEnvelope;
  /**
   * `offerings.cohort_start_date` ("YYYY-MM-DD"), via `useRoomOfferingMeta`. It
   * is NOT in either RPC, so without it the countdown falls back to the first
   * scheduled airing, which is when the doors open in practice. With neither,
   * the countdown block does not render at all.
   */
  startsAt?: string | null;
  /**
   * `offerings.whatsapp_group_link`, via `useRoomOfferingMeta`. Null (or
   * absent) hides the WhatsApp card entirely.
   */
  whatsappGroupLink?: string | null;
  /**
   * `get_my_cohort_rooms.total_weeks` for this room. The envelope does not
   * carry a week count, so an absent value falls back to the distinct weeks the
   * scheduled sessions name.
   */
  totalWeeks?: number | null;
  /**
   * Fired ONCE when the doors-open day has arrived while the page is open (and
   * on mount if it already had). Refetch the room on this: the server's own
   * phase flip is what swaps the layout, never a client guess.
   */
  onDoorsOpen?: () => void;
  className?: string;
}

export function PreStartCard({
  room,
  startsAt,
  whatsappGroupLink,
  totalWeeks,
  onDoorsOpen,
  className,
}: PreStartCardProps) {
  const motionSafe = useMotionSafe();
  const isLobby = isLobbyEnvelope(room);

  /* ── The clock ──
   * `cohort_start_date` when the caller supplies it, else the first scheduled
   * airing — the same fallback RoomShell hands the masthead's "Starts {date}"
   * line. A lobby caller has neither unless `startsAt` is passed: their
   * envelope carries no sessions at all (rpcs.sql:506). */
  const doorsAtRaw = startsAt ?? firstScheduledAt(room.sessions);
  const startMs = parseMs(doorsAtRaw);
  const hasStart = Number.isFinite(startMs);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    if (!hasStart) return;
    const id = window.setInterval(() => setNowMs(Date.now()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, [hasStart]);

  const daysUntil = hasStart ? istDaysUntil(startMs, nowMs) : null;

  // Tell the slot to refetch the moment the IST day arrives. Kept in a ref so a
  // parent passing an inline callback does not re-arm the effect, and fired at
  // most once so a server still reporting `pre_start` cannot loop us.
  const doorsOpenRef = useRef(onDoorsOpen);
  useEffect(() => {
    doorsOpenRef.current = onDoorsOpen;
  }, [onDoorsOpen]);

  const doorsOpenFired = useRef(false);
  useEffect(() => {
    if (daysUntil === null || daysUntil > 0 || doorsOpenFired.current) return;
    doorsOpenFired.current = true;
    doorsOpenRef.current?.();
  }, [daysUntil]);

  /* ── The roster ──
   * `enabled` is a NETWORK decision, not a security one: RLS and the RPC's own
   * assert are what keep a lobby visitor out of the roster. This just declines
   * to fire a call whose only possible answer is a 42501. A denial that arrives
   * anyway (a membership revoked between renders) collapses the module rather
   * than raising an error state over a room the visitor is legitimately in. */
  const rosterModuleOn = moduleEnabled(room.config, "roster");
  const rosterWanted = rosterModuleOn && !isLobby;
  const roster = useRoomRoster(room.offering_id, { enabled: rosterWanted });
  const people: RoomRosterEntry[] = rosterWanted && !roster.denied ? (roster.data ?? []) : [];
  const rosterLoading = rosterWanted && !roster.denied && roster.isLoading;

  /* ── The first notice ── */
  const announcement = moduleEnabled(room.config, "announcements")
    ? (room.announcements ?? [])[0] ?? null
    : null;

  /* ── The season shape ── */
  const expectation = useMemo(
    () => summariseExpectation(room.sessions, totalWeeks),
    [room.sessions, totalWeeks],
  );

  const whatsappUrl = externalHttpUrl(whatsappGroupLink);

  /* ── Blocks ──
   * Built as a list so a module with nothing to say is never PUSHED, which is
   * what makes the "no dead modules" acceptance structural. The order is the
   * brief's: when, then who, then the first word, then the group, then shape. */
  const blocks: { key: string; node: ReactNode }[] = [];

  if (daysUntil !== null) {
    // `openNow` is strictly the PAST case. The start day itself still reads
    // "Today." — the phase flip is the server's call, and a room whose date has
    // arrived but whose phase has not yet moved should say the true thing about
    // the calendar rather than promise a door that is not open yet.
    const openNow = daysUntil < 0;
    const headline =
      daysUntil > 1 ? `${daysUntil} days` : daysUntil === 1 ? "Tomorrow" : "Today";
    // A LOBBY visitor whose start date has already passed is not someone whose
    // doors are open — they are watching a season that began without them, and
    // "Doors are open" would be a promise this card cannot keep. The calendar
    // fact is the same; only the claim about their access changes.
    const openedLine = isLobby ? "The season is under way." : "The room is opening up.";

    blocks.push({
      key: "countdown",
      node: (
        <div className="rounded-xl border border-border bg-surface p-5">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            {openNow ? (isLobby ? "Already started" : "Doors are open") : "Doors open"}
          </p>
          <p className="mt-2 font-serif text-2xl leading-none text-foreground sm:text-3xl">
            {openNow ? (
              openedLine
            ) : (
              <>
                <span className="text-room-accent">{headline}</span>
                {daysUntil > 1 ? " to go." : "."}
              </>
            )}
          </p>
          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <CalendarDays size={14} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
            <span>{doorsDateFormat.format(startMs)}</span>
          </p>
        </div>
      ),
    });
  }

  if (rosterLoading) {
    blocks.push({
      key: "roster-loading",
      node: (
        <div className="rounded-xl border border-border bg-surface p-5">
          <BlockHeading icon={Users} eyebrow="Your cohort" />
          <div className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {[0, 1, 2, 3].map((slot) => (
              <div key={slot} className="flex flex-col items-center gap-2">
                <SkeletonLine className="rounded-full" width={48} height={48} />
                <SkeletonLine width="70%" height="10px" />
              </div>
            ))}
          </div>
        </div>
      ),
    });
  } else if (people.length > 0) {
    const shown = people.slice(0, ROSTER_FACES_SHOWN);
    const overflow = people.length - shown.length;

    blocks.push({
      key: "roster",
      node: (
        <div className="rounded-xl border border-border bg-surface p-5">
          <BlockHeading icon={Users} eyebrow="Your cohort" aside={`${people.length} in the room`} />
          <ul className="mt-4 grid grid-cols-4 gap-3 sm:grid-cols-6">
            {shown.map((person) => {
              const staff = STAFF_ROLES.has(person.role);
              return (
                <li key={person.user_id} className="flex flex-col items-center gap-2 text-center">
                  <Avatar
                    className={cn(
                      "h-12 w-12",
                      staff && "ring-2 ring-room-accent ring-offset-2 ring-offset-surface",
                    )}
                  >
                    {person.avatar_url ? <AvatarImage src={person.avatar_url} alt="" /> : null}
                    <AvatarFallback className="bg-surface-2 text-xs text-muted-foreground">
                      {initials(person.full_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {firstName(person.full_name) ?? "Member"}
                  </span>
                  {/* The accent ring is decoration until it is named. Staff get
                      the word too, so the difference is legible and never a
                      colour-only signal. */}
                  {staff && (
                    <span className="-mt-1 font-mono text-[10px] uppercase tracking-[0.24em] text-room-accent">
                      {person.role === "host" ? "Host" : "Mentor"}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          {overflow > 0 && (
            <p className="body-muted mt-3 text-xs">and {overflow} more already inside.</p>
          )}
        </div>
      ),
    });
  } else if (isLobby) {
    // The lobby's honest stand-in for the roster: a real line about where they
    // stand, never a spinner and never an error. `get_room_roster` raises for a
    // pre_member by design, so there are no faces to show yet.
    blocks.push({
      key: "lobby",
      node: (
        <div className="rounded-xl border border-border bg-surface p-5">
          <BlockHeading icon={Users} eyebrow="Your seat" />
          <p className="body-muted mt-2 text-sm">
            You are in the lobby. The full room, cohort-mates included, opens as soon as your
            seat is confirmed.
          </p>
        </div>
      ),
    });
  }

  if (announcement) {
    const noticeMs = parseMs(announcement.created_at);
    blocks.push({
      key: "announcement",
      node: (
        <div className="rounded-xl border border-border bg-surface p-5">
          <BlockHeading
            icon={Pin}
            eyebrow="From the team"
            aside={Number.isFinite(noticeMs) ? noticeDateFormat.format(noticeMs) : undefined}
          />
          {announcement.title && (
            <h3 className="mt-2 font-serif text-lg leading-snug text-foreground">
              {announcement.title}
            </h3>
          )}
          <p className="body-muted mt-2 whitespace-pre-line text-sm leading-relaxed line-clamp-6">
            {announcement.body}
          </p>
        </div>
      ),
    });
  }

  if (whatsappUrl) {
    blocks.push({
      key: "whatsapp",
      node: (
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={tapTick}
          className="focus-ring flex min-h-[44px] items-center gap-3 rounded-xl border border-border bg-surface p-5 transition-colors hover:border-border-hover"
        >
          <MessageCircle
            size={20}
            strokeWidth={1.5}
            className="shrink-0 text-room-accent"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-foreground">
              Join the WhatsApp group
            </span>
            <span className="body-muted block text-xs">
              Day to day chatter lives there until the room takes over.
            </span>
          </span>
          <ExternalLink
            size={16}
            strokeWidth={1.5}
            className="shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        </a>
      ),
    });
  }

  if (expectation.weeks !== null || expectation.sessionCount > 0) {
    const rows: { label: string; value: string }[] = [];
    if (expectation.weeks !== null) {
      rows.push({
        label: "Length",
        value: `${expectation.weeks} ${expectation.weeks === 1 ? "week" : "weeks"}`,
      });
    }
    if (expectation.sessionCount > 0) {
      rows.push({ label: "Live sessions", value: `${expectation.sessionCount} scheduled` });
    }
    if (expectation.cadence) {
      rows.push({ label: "Cadence", value: expectation.cadence });
    }

    blocks.push({
      key: "expect",
      node: (
        <div className="rounded-xl border border-border bg-surface p-5">
          <BlockHeading icon={CalendarDays} eyebrow="What to expect" />
          <dl className="mt-3 space-y-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-baseline justify-between gap-4">
                <dt className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                  {row.label}
                </dt>
                <dd className="text-right text-sm text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ),
    });
  }

  return (
    <section className={cn("space-y-4", className)}>
      {blocks.map((block, index) => (
        <motion.div
          key={block.key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            ...motionSafe.springs.glide,
            delay: motionSafe.reduced ? 0 : index * 0.05,
          }}
        >
          {block.node}
        </motion.div>
      ))}
    </section>
  );
}

/** Shared block header: mono eyebrow, optional right-aligned aside. */
function BlockHeading({
  icon: Icon,
  eyebrow,
  aside,
}: {
  icon: typeof Users;
  eyebrow: string;
  aside?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" aria-hidden="true" />
      <h2 className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
        {eyebrow}
      </h2>
      {aside && (
        <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
          {aside}
        </span>
      )}
    </div>
  );
}

export default PreStartCard;
