import { type ReactNode } from "react";
import { CalendarDays, Clock, MessagesSquare, Video } from "lucide-react";

import { ROOM_MODULE_DEFAULTS, sessionTimeState, type SessionTimeState } from "@/lib/room";
import { cn } from "@/lib/utils";
import type { RoomSession, RoomWeekRow, RoomWeekStatus } from "@/hooks/useCohortRooms";
import SessionSlot, { isCancelledSession, sessionJoinUrl } from "./SessionSlot";
import { useRoomClock } from "./RoomClockProvider";

/**
 * ThisWeekCard — the hero of the weeks module.
 *
 * TODAY-FIRST DISCIPLINE IS THE POINT OF THIS CARD. The serif line at the top
 * is not the week's theme, it is the next TIMED thing in the week, chosen in a
 * fixed precedence: a session that has not finished, then an assignment
 * deadline, then the feedback session. A student opening the room at 19:40 on a
 * class night should read "Starts in 20 minutes." before anything else on the
 * page, and a student opening it on a quiet Tuesday should read the deadline.
 * The theme rides the mono eyebrow (`E04 · Blocking and coverage`) so the
 * episode is still named without spending the loudest line on something that
 * does not move.
 *
 * ── Where the sessions come from ──────────────────────────────────────────
 * `week.live_session_*` is ONE session by construction: `get_cohort_progress`
 * elects a single session per week through a LEFT JOIN LATERAL … LIMIT 1 so
 * that a three-session week stops emitting three week rows
 * (20260729100200_cohort_room_rpcs.sql:990-1003). It cannot hand over both. The
 * FULL list lives in the room envelope's `sessions` array, keyed by `week_id`,
 * and that is what this card renders: the caller passes every session for the
 * week and all of them appear. The week row is read for week METADATA only.
 *
 * ── One session row, and it is R2-T2's ────────────────────────────────────
 * The sessions column mounts `SessionSlot` (R2-T2) and owns no session UI of
 * its own. It carried a thinner local row for exactly as long as it took the
 * two files to land: a card that states a title and a date, beside a component
 * that also carries the T-60 countdown, the join gate and add-to-calendar, is a
 * second implementation of the phase's centrepiece that quietly wins because it
 * is the one that is mounted. What this card owns is the ARRANGEMENT — which
 * slot gets the single champagne treatment, where the recording lives, and what
 * rides along as the calendar note.
 *
 * ── The module gate ───────────────────────────────────────────────────────
 * `assignmentsEnabled` / `peerReviewEnabled` are `moduleEnabled(config, …)`
 * (src/lib/room.ts), resolved by the CALLER because that is where the room
 * envelope is. A cohort that switched assignments off renders no assignment
 * column at all — §5's rule is that a disabled module is ABSENT, not disabled —
 * and the sessions column takes the full width rather than leaving a hole.
 *
 * ── The assignment seam ───────────────────────────────────────────────────
 * There is no assignments tab (RoomShell's rail is weeks/screenings/feed/
 * people/resources), so the assignment UI lives inside this card exactly as it
 * did on the old page. R2-T4 owns `AssignmentModule`; this file owns the SLOT.
 * `renderAssignment` is the seam: integration passes
 * `renderAssignment={(props) => <AssignmentModule {...props} />}` and never
 * touches the internals here. With no renderer supplied the slot degrades to
 * the prompt, the deadline and the existing empty-state copy, so the module is
 * shippable on its own.
 *
 * ── WHERE THE CLOCK IS READ, AND WHY IT IS NOT READ HERE ──────────────────
 * `RoomClockProvider` promises that "a tick re-renders the components that asked
 * for the time and nothing else in the room" (RoomClockProvider.tsx:52-54), and
 * inside T-60 that clock runs at 1s. If THIS component subscribed, every tick
 * for the hour before a class would re-render the whole card — the header, the
 * feedback line, and the assignment column with R2-T4's submission form and
 * peer-review lane inside it — sixty times a minute, for something only two
 * lines of it care about.
 *
 * So the subscription lives in the two LEAVES that need it and nowhere else:
 *   · `WeekLeadLine`   — the serif today-first line (a countdown to the minute).
 *   · `SessionsColumn` — the champagne election, and the slots below it, which
 *                        each read the clock themselves for their own state.
 * The card itself re-renders only when its DATA changes. The assignment column
 * is a sibling of the ticking part, not a child of it.
 */

/* ──────────────────────────────────────────────────────────────────────────
 * THE STATUS → TOKEN MAP
 *
 * Defined ONCE, here, for the whole weeks module (WeekRail imports it). The
 * P5-T7 map the brief refers to was never built — `grep -rn
 * 'statusToken|STATUS_TOKEN' src/` returns nothing — so rather than scatter a
 * fourth opinion about which colour "needs revision" is, every status in this
 * module resolves to one of seven TONES and each tone resolves to exactly one
 * pair of existing semantic tokens (src/index.css:270-300,
 * tailwind.config.ts:44-85). No new palette entries, no raw colour classes, no
 * arbitrary values.
 *
 * The choices, and why:
 *   neutral   → surface-2 / muted-foreground   nothing is claimed
 *   accent    → room-accent                    the room's own colour, for the
 *                                              week the student is IN
 *   info      → accent-indigo                  submitted, waiting on someone else
 *   positive  → success                        done, cleared, attended
 *   attention → accent-amber                   act soon, and the LATE case
 *                                              (R2-T4: late is amber, not red)
 *   critical  → destructive                    a deadline that has passed
 *   live      → accent-crimson                 a class running right now
 *
 * Text uses the `-text` lightness of each pair where one exists
 * (`--destructive-text`, `--accent-crimson-text`, `--accent-indigo-text`,
 * `--room-accent-text`): those tokens exist precisely because the base fill
 * lightness reads under AA at badge sizes on the dark card.
 * ────────────────────────────────────────────────────────────────────────── */

export type RoomStatusTone =
  | "neutral"
  | "accent"
  | "info"
  | "positive"
  | "attention"
  | "critical"
  | "live";

/** Tint + text for a status pill. The one place a tone becomes classes. */
export const STATUS_TONE_CLASS: Readonly<Record<RoomStatusTone, string>> = {
  neutral: "bg-surface-2 text-muted-foreground",
  accent: "bg-room-accent/15 text-room-accent-text",
  info: "bg-accent-indigo/15 text-accent-indigo-text",
  positive: "bg-success/15 text-success",
  attention: "bg-accent-amber/15 text-accent-amber",
  critical: "bg-destructive/15 text-destructive-text",
  live: "bg-accent-crimson/15 text-accent-crimson-text",
};

/** Text-only usage of a tone (no tint), for inline labels inside a card. */
export const STATUS_TONE_TEXT: Readonly<Record<RoomStatusTone, string>> = {
  neutral: "text-muted-foreground",
  accent: "text-room-accent-text",
  info: "text-accent-indigo-text",
  positive: "text-success",
  attention: "text-accent-amber",
  critical: "text-destructive-text",
  live: "text-accent-crimson-text",
};

/** `cohort_weeks.status` → tone. Archived reads as completed: both are past. */
export function weekStatusTone(status: RoomWeekStatus): RoomStatusTone {
  if (status === "completed" || status === "archived") return "positive";
  if (status === "active") return "accent";
  return "neutral";
}

/** The word a week wears. Archived is still "Done" to the student. */
export function weekStatusLabel(status: RoomWeekStatus): string {
  if (status === "completed" || status === "archived") return "Done";
  if (status === "active") return "This week";
  return "Upcoming";
}

/**
 * `cohort_week_submissions.status` → tone.
 *
 * `late` is ATTENTION, never critical: the work arrived, and painting it red
 * tells a student who did the thing that they failed. An unknown status falls
 * to `info`, the "we have it, someone is looking" tone.
 */
export function submissionStatusTone(status: string | null): RoomStatusTone {
  switch (status) {
    case "reviewed":
    case "cleared":
      return "positive";
    case "needs_revision":
    case "late":
      return "attention";
    case "under_review":
      return "accent";
    default:
      return "info";
  }
}

/** The submission words, matching the old dashboard's labels verbatim. */
export function submissionStatusLabel(status: string | null): string {
  switch (status) {
    case "under_review":
      return "Under review";
    case "reviewed":
      return "Reviewed";
    case "cleared":
      return "Cleared";
    case "needs_revision":
      return "Needs revision";
    case "late":
      return "Submitted late";
    default:
      return "Submitted";
  }
}

/** Session time state → tone. Mirrors TimeStateBadge's own register. */
export function sessionStateTone(state: SessionTimeState): RoomStatusTone {
  if (state === "live") return "live";
  if (state === "soon" || state === "tonight") return "accent";
  return "neutral";
}

/* ──────────────────────────────────────────────────────────────────────────
 * IST time
 * Mirrors the private helpers in `src/lib/room.ts` and `PreStartCard.tsx`:
 * same constants, same derivation, same reason. A member travelling must not
 * see a different room from the cohort-mate beside them.
 * ────────────────────────────────────────────────────────────────────────── */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_TIME_ZONE = "Asia/Kolkata";

/** Sessions from this IST hour onward read as "Tonight" rather than "Today". */
const EVENING_IST_HOUR = 16;

const dayMonthFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const weekdayDayMonthFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const clockFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Which IST calendar day an instant falls on, as a day number. */
export function istDayIndex(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
}

/** Whole IST days from `nowMs` to `targetMs`. Changes at IST midnight. */
export function istDaysUntil(targetMs: number, nowMs: number): number {
  return istDayIndex(targetMs) - istDayIndex(nowMs);
}

/** Hours since IST midnight, e.g. 20.0 for 20:00 IST. */
function istHourOfDay(ms: number): number {
  return (ms + IST_OFFSET_MS - istDayIndex(ms) * DAY_MS) / (60 * 60 * 1000);
}

/** Epoch ms for a nullable ISO/date string, or NaN. */
export function parseMs(value: string | null | undefined): number {
  return value ? Date.parse(value) : NaN;
}

/** "8 Aug". */
export function formatIstDayMonth(ms: number): string {
  return dayMonthFormat.format(ms);
}

/** "Sat 8 Aug". */
export function formatIstWeekdayDate(ms: number): string {
  return weekdayDayMonthFormat.format(ms);
}

/**
 * "8:00 PM" — meridiem uppercased so this agrees with the rest of the app,
 * which formats "h:mm a" and yields an uppercase PM while `en-IN` does not.
 */
export function formatIstClock(ms: number): string {
  return clockFormat.format(ms).replace(/\b([ap])\.?m\.?\b/gi, (match) => match.toUpperCase());
}

/** "in 3 days" / "tomorrow" / "today", on the IST calendar. */
function relativeDayPhrase(targetMs: number, nowMs: number): string {
  const days = istDaysUntil(targetMs, nowMs);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/* ──────────────────────────────────────────────────────────────────────────
 * The lead — the one timed thing the hero opens with
 * ────────────────────────────────────────────────────────────────────────── */

export type WeekLeadKind = "session" | "assignment" | "feedback" | "none";

export interface WeekLead {
  kind: WeekLeadKind;
  /** The serif line. Sentence-cased, ends in a full stop. */
  line: string;
  tone: RoomStatusTone;
  /** The instant the line is about, for a badge beside it. Null for `none`. */
  at: string | null;
}

/** A session still ahead of the student (or running). Ended ones are history. */
function isPending(state: SessionTimeState): boolean {
  return state !== "ended" && state !== "recorded";
}

/**
 * The next timed thing in a week, in the brief's precedence:
 * session countdown > assignment due > feedback session.
 *
 * Precedence is by KIND, not by clock: a class three days out still leads over
 * an assignment due tomorrow, because the class is the appointment a student
 * has to be somewhere for. Within the session kind the EARLIEST pending session
 * wins, so a two-session week opens on the one that happens first.
 */
export function weekLead(
  week: RoomWeekRow,
  sessions: RoomSession[],
  nowMs: number,
): WeekLead {
  const pending = sessions
    .map((session) => ({ session, state: sessionTimeState(session, nowMs), ms: parseMs(session.scheduled_at) }))
    .filter((entry) => isPending(entry.state) && Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);

  const next = pending[0];
  if (next) {
    const tone = sessionStateTone(next.state);
    if (next.state === "live") {
      return { kind: "session", line: "Live right now.", tone, at: next.session.scheduled_at ?? null };
    }
    if (next.state === "soon") {
      const minutes = Math.max(1, Math.ceil((next.ms - nowMs) / 60_000));
      return {
        kind: "session",
        line: `Starts in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`,
        tone,
        at: next.session.scheduled_at ?? null,
      };
    }
    if (next.state === "tonight") {
      const when = istHourOfDay(next.ms) >= EVENING_IST_HOUR ? "Tonight" : "Today";
      return {
        kind: "session",
        line: `${when} at ${formatIstClock(next.ms)}.`,
        tone,
        at: next.session.scheduled_at ?? null,
      };
    }
    return {
      kind: "session",
      line: `${formatIstWeekdayDate(next.ms)}, ${formatIstClock(next.ms)}.`,
      tone,
      at: next.session.scheduled_at ?? null,
    };
  }

  const dueMs = parseMs(week.assignment_due_at);
  if (Number.isFinite(dueMs)) {
    if (dueMs < nowMs) {
      // An overdue deadline only shouts while the work is still outstanding.
      // Once it is in, the deadline is history and the week moves on.
      if (!week.submission_id) {
        return { kind: "assignment", line: "Assignment overdue.", tone: "critical", at: week.assignment_due_at };
      }
    } else {
      const days = istDaysUntil(dueMs, nowMs);
      return {
        kind: "assignment",
        line: `Assignment due ${relativeDayPhrase(dueMs, nowMs)}.`,
        tone: days <= 1 ? "attention" : "neutral",
        at: week.assignment_due_at,
      };
    }
  }

  const feedbackMs = parseMs(week.feedback_session_at);
  if (Number.isFinite(feedbackMs) && feedbackMs >= nowMs) {
    return {
      kind: "feedback",
      line: `Feedback session ${relativeDayPhrase(feedbackMs, nowMs)}.`,
      tone: "accent",
      at: week.feedback_session_at,
    };
  }

  return { kind: "none", line: "Nothing on the clock this week.", tone: "neutral", at: null };
}

/* ──────────────────────────────────────────────────────────────────────────
 * The assignment seam (R2-T4)
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * What this card hands R2-T4's `AssignmentModule`.
 *
 * Every field is already coerced by `useRoomWeeks`, so the renderer takes it as
 * given. `onChange` refetches the week rows: it is the same "the submission
 * moved, re-read the truth" callback the old page ran after a submit
 * (CohortDashboard.tsx:264-273), and it is passed rather than imported so the
 * assignment module never learns which query key the weeks live under.
 */
export interface RoomAssignmentSlotProps {
  weekId: string;
  weekNumber: number;
  /** Null only before auth resolves; the slot is not rendered in that window. */
  userId: string;
  /** `cohort_batches.id` for the room, from the envelope. */
  batchId: string | null;
  prompt: string | null;
  dueAt: string | null;
  submissionId: string | null;
  submissionStatus: string | null;
  submissionRating: number | null;
  submissionFeedback: string | null;
  submittedAt: string | null;
  /**
   * `moduleEnabled(config, "peer_review")` for this room, resolved by the caller
   * and threaded through because `AssignmentModule` reads no config of its own.
   * ALWAYS PRESENT here: this card is the one place that knows both halves of
   * the slot contract, so a room with peer review switched off must not depend
   * on the renderer guessing. R2-T4 reads it as `!== false`, which keeps the
   * lane on for any caller that has not been taught the flag yet.
   */
  peerReviewEnabled: boolean;
  /** Re-read the week rows after a submit / resubmit. */
  onChange: () => void;
}

export interface ThisWeekCardProps {
  week: RoomWeekRow;
  /**
   * EVERY session for this week, from `envelope.sessions` grouped by `week_id`
   * and ordered by `scheduled_at`. Not `week.live_session_*`, which is one
   * elected session by design.
   */
  sessions: RoomSession[];
  /** The signed-in user. Null suppresses the assignment slot, nothing else. */
  userId: string | null;
  batchId: string | null;
  /**
   * The room's wall clock, when the caller already holds it — `WeeksModule`
   * passes its `useRoomClock()` read so the hero line, the footer and the
   * session slots all agree on the same instant.
   *
   * OPTIONAL, and absent means "read the room's clock" rather than "assume a
   * time": there is exactly ONE clock per room (`RoomClockProvider`, mounted by
   * `RoomShell`), and this prop is a way to share it, never a second one.
   */
  nowMs?: number;
  /**
   * `moduleEnabled(config, "assignments")`. Absent takes the documented module
   * default so the card is still correct when mounted without a config in hand.
   */
  assignmentsEnabled?: boolean;
  /** `moduleEnabled(config, "peer_review")`, forwarded to the assignment slot. */
  peerReviewEnabled?: boolean;
  /**
   * Where a landed recording lives (R2-T3's shelf), handed to every session
   * slot. RELATIVE, and therefore the caller's to state: `"../screenings"` from
   * `/room/:slug/weeks/:n`, `"screenings"` from `/room/:slug`. Absent renders
   * the recorded line without a link rather than guessing a route.
   */
  recordingHref?: string | null;
  /** Rides along as the calendar entry's description, e.g. the cohort title. */
  calendarNote?: string | null;
  /** R2-T4's module. Absent renders the fallback assignment body. */
  renderAssignment?: (props: RoomAssignmentSlotProps) => ReactNode;
  /** Re-read the week rows (passed straight to the assignment slot). */
  onSubmissionChange?: () => void;
  className?: string;
}

const EYEBROW = "font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground";
const PILL =
  "inline-flex shrink-0 items-center gap-1.5 rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider";

/** `E04`, `E12`, and honest about a week number the server never set. */
export function episodeCode(weekNumber: number): string {
  return `E${String(Math.max(0, weekNumber)).padStart(2, "0")}`;
}

export function ThisWeekCard({
  week,
  sessions,
  userId,
  batchId,
  nowMs: nowMsProp,
  assignmentsEnabled = ROOM_MODULE_DEFAULTS.assignments,
  peerReviewEnabled = ROOM_MODULE_DEFAULTS.peer_review,
  recordingHref,
  calendarNote,
  renderAssignment,
  onSubmissionChange,
  className,
}: ThisWeekCardProps) {
  // The room's single clock, unless the caller is already reading it and passed
  // its value down. Subscribing twice to one store is free; a second interval is
  // what this file must never create.
  const clockMs = useRoomClock();
  const nowMs = nowMsProp ?? clockMs;

  const lead = weekLead(week, sessions, nowMs);
  const startsMs = parseMs(week.starts_on);
  const endsMs = parseMs(week.ends_on);
  const feedbackMs = parseMs(week.feedback_session_at);
  const dueMs = parseMs(week.assignment_due_at);

  /**
   * THE ONE CHAMPAGNE MOMENT ON THE SCREEN (R2-T2's rule): the first session in
   * its T-60 window, and no other. A week with two classes an hour apart would
   * otherwise open two champagne buttons and the moment would stop being one. A
   * cancelled session is skipped — it renders no countdown and no Join, so
   * spending the treatment on it would spend it on nothing.
   */
  const champagneSessionId =
    sessions.find(
      (session) => !isCancelledSession(session) && sessionTimeState(session, nowMs) === "soon",
    )?.id ?? null;

  const handleChange = () => onSubmissionChange?.();

  return (
    <article
      className={cn("overflow-hidden rounded-xl border border-border bg-surface", className)}
    >
      <header className="border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <p className={cn(EYEBROW, "min-w-0 truncate")}>
            {episodeCode(week.week_number)}
            {week.theme ? ` · ${week.theme}` : ""}
          </p>
          <span className={cn(PILL, STATUS_TONE_CLASS[weekStatusTone(week.week_status)])}>
            {weekStatusLabel(week.week_status)}
          </span>
        </div>

        {/* The today-first line. Serif, and the largest thing in the module. */}
        <p className="mt-2 font-serif text-2xl leading-tight text-foreground sm:text-3xl">
          <span className={lead.kind === "none" ? undefined : STATUS_TONE_TEXT[lead.tone]}>
            {lead.line}
          </span>
        </p>

        {Number.isFinite(startsMs) && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <CalendarDays size={13} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
            <span className="font-mono">
              {formatIstDayMonth(startsMs)}
              {Number.isFinite(endsMs) ? ` to ${formatIstDayMonth(endsMs)}` : ""}
            </span>
          </p>
        )}

        {week.description && (
          <p className="body-muted mt-3 max-w-prose text-sm leading-relaxed">{week.description}</p>
        )}
      </header>

      <div
        className={cn(
          "grid grid-cols-1 divide-y divide-border",
          // A room with assignments switched off has one column, and it takes
          // the whole width instead of leaving half the card empty.
          assignmentsEnabled && "md:grid-cols-2 md:divide-x md:divide-y-0",
        )}
      >
        {/* ── Sessions ── every session the week holds, not the elected one,
            each one R2-T2's slot with its full doors-open choreography. */}
        <section className="p-5" aria-label="Live sessions">
          <div className="flex items-center gap-2">
            <Video size={14} strokeWidth={1.5} className="shrink-0 text-room-accent" aria-hidden="true" />
            <h3 className={EYEBROW}>Live sessions</h3>
          </div>

          {sessions.length > 0 ? (
            <ul className="mt-3 space-y-3">
              {sessions.map((session) => (
                <li key={session.id}>
                  {/* `bg-surface-2` because the card behind it is already
                      `bg-surface`: the slot has to read as a panel INSIDE the
                      week, not as the same sheet with a stray border. */}
                  <SessionSlot
                    session={session}
                    recordingHref={recordingHref ?? null}
                    calendarNote={calendarNote ?? null}
                    champagne={session.id === champagneSessionId}
                    className="bg-surface-2"
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="body-muted mt-3 text-sm">Not scheduled yet</p>
          )}

          {/* `feedback_session_at` renders here for the first time (V3). It is
              a cohort_weeks column, not a live_sessions row, so it has no
              status, no link and no attendance: a date the room owes them. */}
          {Number.isFinite(feedbackMs) && (
            <p className="mt-4 flex items-center gap-2 border-t border-border pt-3 text-sm text-foreground">
              <MessagesSquare
                size={14}
                strokeWidth={1.5}
                className="shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block">Feedback session</span>
                <span className="body-muted block font-mono text-xs">
                  {formatIstWeekdayDate(feedbackMs)}, {formatIstClock(feedbackMs)} IST
                </span>
              </span>
            </p>
          )}
        </section>

        {/* ── Assignment ── R2-T4 mounts here, and only for a cohort that runs
            assignments at all: `modules.assignments === false` renders NOTHING,
            per §5's "a disabled module is absent". */}
        {assignmentsEnabled && (
          <section className="p-5" aria-label="Assignment">
            <div className="flex flex-wrap items-center gap-2">
              <Clock size={14} strokeWidth={1.5} className="shrink-0 text-room-accent" aria-hidden="true" />
              <h3 className={EYEBROW}>Assignment</h3>
              {week.submission_id && (
                <span
                  className={cn(
                    PILL,
                    STATUS_TONE_CLASS[submissionStatusTone(week.submission_status)],
                  )}
                >
                  {submissionStatusLabel(week.submission_status)}
                </span>
              )}
            </div>

            {week.assignment_prompt ? (
              <div className="mt-3 space-y-3">
                {Number.isFinite(dueMs) && (
                  <p className="body-muted font-mono text-xs">
                    Due {formatIstWeekdayDate(dueMs)}, {formatIstClock(dueMs)} IST
                  </p>
                )}
                {renderAssignment && userId ? (
                  renderAssignment({
                    weekId: week.week_id,
                    weekNumber: week.week_number,
                    userId,
                    batchId,
                    prompt: week.assignment_prompt,
                    dueAt: week.assignment_due_at,
                    submissionId: week.submission_id,
                    submissionStatus: week.submission_status,
                    submissionRating: week.submission_rating,
                    submissionFeedback: week.submission_feedback,
                    submittedAt: week.submission_submitted_at,
                    peerReviewEnabled,
                    onChange: handleChange,
                  })
                ) : (
                  <p className="line-clamp-4 text-sm text-foreground">{week.assignment_prompt}</p>
                )}
              </div>
            ) : (
              /* The old page's copy, verbatim. It is the line students already
                 know, and rewording it would be a change nobody asked for. */
              <p className="body-muted mt-3 text-sm">No assignment this week</p>
            )}
          </section>
        )}
      </div>
    </article>
  );
}

export default ThisWeekCard;
