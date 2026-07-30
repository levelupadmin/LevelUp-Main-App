import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Clock } from "lucide-react";

import { ProgressRing } from "@/components/progress/ProgressRing";
import { SkeletonLine } from "@/components/patterns";
import { TimeStateBadge } from "@/components/live/TimeStateBadge";
import { useAuth } from "@/contexts/AuthContext";
import { moduleEnabled } from "@/lib/room";
import { cn } from "@/lib/utils";
import {
  useRoomOutlet,
  useRoomWeeks,
  type RoomSession,
  type RoomWeekRow,
} from "@/hooks/useCohortRooms";
import { useRoomClock } from "./RoomClockProvider";
import ThisWeekCard, {
  istDaysUntil,
  parseMs,
  type RoomAssignmentSlotProps,
} from "./ThisWeekCard";
import WeekRail from "./WeekRail";

/**
 * WeeksModule — the room's weekly rhythm, at `/room/:slug/weeks/:n`.
 *
 * ── Data ──────────────────────────────────────────────────────────────────
 * TWO sources, and neither substitutes for the other:
 *
 *   · WEEK METADATA (theme, assignment, `feedback_session_at`, week status,
 *     the caller's submission) comes from `useRoomWeeks` — the room-scoped
 *     `get_cohort_progress` hook in `useCohortRooms.ts`. The room ENVELOPE
 *     carries no week metadata at all, so there is nothing to read it from.
 *
 *   · SESSIONS come from the envelope's `sessions` array, grouped by
 *     `week_id`. The week row's `live_session_*` columns are ONE session by
 *     design (the RPC's LEFT JOIN LATERAL … LIMIT 1 elects exactly one per
 *     week so a multi-session week stops duplicating week rows,
 *     20260729100200_cohort_room_rpcs.sql:990-1003). Rendering a week off that
 *     column would silently hide the second class of a two-class week. The
 *     envelope's array has no LIMIT and carries `week_id` on every row, so it
 *     is the only source that can show both.
 *
 * ── The week count ────────────────────────────────────────────────────────
 * `room.total_weeks` counts DISTINCT `week_number` server-side (rpcs.sql:311).
 * The old dashboard used `rows.length` (CohortDashboard.tsx:144) and divided by
 * it for the progress percentage (:157); after the row collapse that number is
 * not a week count, and the same migration says so in as many words. The
 * footer ring below reaches parity with the CORRECT number, not with the old
 * page's arithmetic.
 *
 * ── One clock, and it is the ROOM's ───────────────────────────────────────
 * Every relative-time read on this page — the hero's countdown line, the
 * footer's next-due, each session slot's state — comes from
 * `useRoomClock()`, the single store `RoomShell` mounts for the whole room
 * (`RoomClockProvider`). This module used to run its own minute
 * `window.setInterval` beside it, which is precisely the thing that contract
 * exists to prevent: a twelve-week room with sessions on screen would have
 * accumulated a second timer for no additional information, and the two would
 * have disagreed about "now" by up to a minute on the same screen. The provider
 * also does two things a local interval cannot — it drops to 1s only while a
 * doors-open countdown is mounted, and it stops dead while the document is
 * hidden.
 *
 * ── The per-cohort feature matrix ─────────────────────────────────────────
 * `moduleEnabled(envelope.config, key)` is read HERE, where the envelope is,
 * and passed down: `assignments` gates the assignment column outright, and
 * `peer_review` rides through `ThisWeekCard`'s slot into R2-T4's module, which
 * holds no config of its own. A cohort that switched assignments off previously
 * still got the whole column, flag or no flag.
 */

/** Group the envelope's sessions by the week they belong to. */
export function groupSessionsByWeek(sessions: RoomSession[]): Map<string, RoomSession[]> {
  const byWeek = new Map<string, RoomSession[]>();
  for (const session of sessions) {
    if (!session.week_id) continue;
    const bucket = byWeek.get(session.week_id);
    if (bucket) bucket.push(session);
    else byWeek.set(session.week_id, [session]);
  }
  for (const bucket of byWeek.values()) {
    bucket.sort((a, b) => {
      const left = parseMs(a.scheduled_at);
      const right = parseMs(b.scheduled_at);
      if (!Number.isFinite(left)) return 1;
      if (!Number.isFinite(right)) return -1;
      return left - right;
    });
  }
  return byWeek;
}

/**
 * Every session for a week.
 *
 * The envelope is authoritative. The week row's elected session is a FALLBACK
 * for the case where the envelope carries no sessions for this week at all (a
 * member whose batch scope differs from the week's, say): showing the one
 * session the RPC elected beats showing none, and it is a real session either
 * way. It is never merged with the envelope's list, because the elected session
 * is already in that list whenever the list exists.
 */
export function sessionsForWeek(
  week: RoomWeekRow,
  byWeek: Map<string, RoomSession[]>,
): RoomSession[] {
  const fromEnvelope = byWeek.get(week.week_id);
  if (fromEnvelope && fromEnvelope.length > 0) return fromEnvelope;
  if (!week.live_session_id) return [];
  return [
    {
      id: week.live_session_id,
      title: week.live_session_title,
      scheduled_at: week.live_session_at,
      duration_minutes: null,
      status: null,
      session_type: null,
      week_id: week.week_id,
      zoom_link: week.live_session_zoom_link,
    },
  ];
}

/** The week the module opens on when the route names none: active, else first. */
export function defaultWeek(weeks: RoomWeekRow[]): RoomWeekRow | null {
  return (
    weeks.find((week) => week.week_status === "active") ??
    weeks.find((week) => week.week_status === "upcoming") ??
    weeks[0] ??
    null
  );
}

export interface WeeksProgress {
  /** `room.total_weeks`, falling back to the rows only when the RPC says zero. */
  totalWeeks: number;
  completedCount: number;
  /** The week the student is ON, 1-based and clamped into the season. */
  weekOf: number;
  progressPct: number;
}

/**
 * The footer's arithmetic, in one pure function so the numbers are testable.
 *
 * `weekOf` follows the old page's intent (the active week, else however many
 * are behind you) but reads the ACTIVE WEEK'S OWN NUMBER rather than its index
 * in a row list that is not one-row-per-week by contract.
 */
export function weeksProgress(weeks: RoomWeekRow[], totalWeeksFromRoom: number): WeeksProgress {
  const totalWeeks = totalWeeksFromRoom > 0 ? totalWeeksFromRoom : weeks.length;
  const completedCount = weeks.filter(
    (week) => week.week_status === "completed" || week.week_status === "archived",
  ).length;
  const active = weeks.find((week) => week.week_status === "active");
  const raw = active ? active.week_number : completedCount;
  const ceiling = totalWeeks > 0 ? totalWeeks : 1;
  return {
    totalWeeks,
    completedCount,
    weekOf: Math.min(Math.max(1, raw), ceiling),
    progressPct: totalWeeks > 0 ? Math.round((completedCount / totalWeeks) * 100) : 0,
  };
}

/**
 * The soonest OPEN assignment deadline still ahead: a due date with no
 * submission against it. Same rule as the old page's footer.
 */
export function nextOpenDue(
  weeks: RoomWeekRow[],
  nowMs: number,
): { at: string; ms: number; days: number } | null {
  let best: { at: string; ms: number } | null = null;
  for (const week of weeks) {
    if (!week.assignment_due_at || week.submission_id) continue;
    const ms = parseMs(week.assignment_due_at);
    if (!Number.isFinite(ms) || ms <= nowMs) continue;
    if (!best || ms < best.ms) best = { at: week.assignment_due_at, ms };
  }
  if (!best) return null;
  return { ...best, days: Math.max(0, istDaysUntil(best.ms, nowMs)) };
}

export interface WeeksModuleProps {
  /**
   * R2-T4's `AssignmentModule`, mounted inside `ThisWeekCard`. There is no
   * assignments tab, so this is where the submission loop lives; integration
   * wires it as `renderAssignment={(props) => <AssignmentModule {...props} />}`
   * without touching anything in this file.
   */
  renderAssignment?: (props: RoomAssignmentSlotProps) => ReactNode;
  className?: string;
}

export function WeeksModule({ renderAssignment, className }: WeeksModuleProps) {
  const { room, envelope } = useRoomOutlet();
  const { user } = useAuth();
  const { slug, n } = useParams<{ slug: string; n: string }>();
  const navigate = useNavigate();
  const weeksQuery = useRoomWeeks(room.offering_id);

  const weeks = useMemo(() => weeksQuery.data ?? [], [weeksQuery.data]);
  const sessionsByWeek = useMemo(
    () => groupSessionsByWeek(envelope.sessions),
    [envelope.sessions],
  );

  /* ── The room's clock, not a second one ── */
  const nowMs = useRoomClock();

  /* ── The per-cohort feature matrix (UX only, never a security gate) ── */
  const assignmentsEnabled = moduleEnabled(envelope.config, "assignments");
  const peerReviewEnabled = moduleEnabled(envelope.config, "peer_review");

  /* ── Which week is on screen ──
   * The URL is the source of truth when it names a week. `pending` covers the
   * case where the module is mounted outside the `weeks/:n` route (or before a
   * navigation lands), so a selection always shows even without routing. */
  const [pending, setPending] = useState<number | null>(null);
  const routeWeek = Number.parseInt(n ?? "", 10);
  const requested = Number.isFinite(routeWeek) ? routeWeek : pending;
  const selected =
    weeks.find((week) => week.week_number === requested) ?? defaultWeek(weeks);

  const selectWeek = (week: RoomWeekRow) => {
    setPending(week.week_number);
    if (slug) navigate(`/room/${slug}/weeks/${week.week_number}`);
  };

  /* ── The footer's numbers ── */
  const progress = useMemo(() => weeksProgress(weeks, room.total_weeks), [weeks, room.total_weeks]);
  const nextDue = useMemo(() => nextOpenDue(weeks, nowMs), [weeks, nowMs]);

  /* ── After a submission, re-read the weeks ──
   * Kept in a ref so the callback handed down the tree is stable and the
   * assignment module never re-renders just because this one did. */
  const refetchRef = useRef(weeksQuery.refetch);
  useEffect(() => {
    refetchRef.current = weeksQuery.refetch;
  }, [weeksQuery.refetch]);
  const handleSubmissionChange = useCallback(() => {
    void refetchRef.current();
  }, []);

  if (weeksQuery.isPending) {
    return (
      <div className={cn("space-y-4", className)} role="status" aria-busy="true">
        <span className="sr-only">Loading weeks</span>
        <SkeletonLine width="40%" height="12px" />
        <div className="h-48 rounded-xl border border-border bg-surface" />
        <div className="flex gap-3">
          <div className="h-28 w-[13.5rem] shrink-0 rounded-xl border border-border bg-surface" />
          <div className="h-28 w-[13.5rem] shrink-0 rounded-xl border border-border bg-surface" />
        </div>
      </div>
    );
  }

  // A room whose schedule has not been authored yet. Pre-start induction is
  // R1's PreStartCard and RoomHome routes to it; a LIVE room with no weeks is
  // this: one honest line, not a shell of empty cards.
  if (weeks.length === 0 || !selected) {
    return (
      <section className={cn("py-12 text-center", className)} aria-label="Weeks">
        <p className="font-serif text-2xl leading-tight text-foreground">
          The schedule is being set.
        </p>
        <p className="body-muted mx-auto mt-2 max-w-sm text-sm">
          Weeks appear here as soon as the team locks them in.
        </p>
      </section>
    );
  }

  const selectedSessions = sessionsForWeek(selected, sessionsByWeek);

  return (
    <section className={cn("space-y-6", className)} aria-label="Weeks">
      <ThisWeekCard
        week={selected}
        sessions={selectedSessions}
        userId={user?.id ?? null}
        batchId={envelope.batch_id}
        nowMs={nowMs}
        assignmentsEnabled={assignmentsEnabled}
        peerReviewEnabled={peerReviewEnabled}
        // RELATIVE, and correct from this route only: React Router resolves `..`
        // against the ROUTE tree, so from `weeks/:n` this is
        // `/room/:slug/screenings` (App.tsx:263-272). A slot with no recording
        // yet never renders it.
        recordingHref="../screenings"
        calendarNote={room.offering_title}
        renderAssignment={renderAssignment}
        onSubmissionChange={handleSubmissionChange}
      />

      <WeekRail weeks={weeks} activeWeekId={selected.week_id} onSelect={selectWeek} />

      <WeeksFooter progress={progress} nextDue={nextDue} />
    </section>
  );
}

/**
 * The sticky progress footer: where the student is in the season, and the next
 * thing that is actually due, anchored by the ring.
 *
 * STICKY, NOT FIXED, and lifted clear of the app's mobile tab bar (which is
 * `fixed … z-50`, StudentLayout.tsx:464): a fixed bar at the old page's z-30
 * sits UNDER that tab bar on a phone. No backdrop blur either — the Android
 * WebView pays for every blurred layer, and an opaque canvas reads the same.
 */
function WeeksFooter({
  progress,
  nextDue,
}: {
  progress: WeeksProgress;
  nextDue: { at: string; ms: number; days: number } | null;
}) {
  const dueLabel = nextDue
    ? nextDue.days === 0
      ? "assignment due today"
      : nextDue.days === 1
        ? "assignment due in 1d"
        : `assignment due in ${nextDue.days}d`
    : null;

  return (
    <div
      className={cn(
        "sticky z-20 -mx-4 flex items-center gap-3 border-t border-border bg-canvas px-4 py-3 md:mx-0 md:rounded-xl md:border",
        // Clear of the mobile tab bar (56px + the home-indicator inset); flush
        // to the viewport bottom from md up, where that bar is hidden.
        "bottom-[calc(3.5rem+env(safe-area-inset-bottom))] md:bottom-0",
      )}
    >
      <ProgressRing pct={progress.progressPct} size={40} label={`${progress.weekOf}`} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          Week {progress.weekOf} of {progress.totalWeeks}
          <span className="text-muted-foreground"> · {progress.completedCount} done</span>
        </p>
        {dueLabel ? (
          <p className="body-muted mt-0.5 flex items-center gap-1.5 truncate text-xs">
            <Clock size={12} strokeWidth={1.5} className="shrink-0" aria-hidden="true" />
            {dueLabel}
          </p>
        ) : (
          <p className="body-muted mt-0.5 truncate text-xs">
            No assignments due, you&apos;re all caught up.
          </p>
        )}
      </div>
      {nextDue && <TimeStateBadge date={nextDue.at} className="shrink-0" />}
    </div>
  );
}

export default WeeksModule;
