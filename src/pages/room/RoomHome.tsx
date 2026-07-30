import { useMemo } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, Megaphone, Users } from "lucide-react";
import { moduleEnabled, sessionTimeState, type RoomModuleKey } from "@/lib/room";
import { SkeletonLine, SurfaceCard } from "@/components/patterns";
import { useAuth } from "@/contexts/AuthContext";
import {
  isLobbyEnvelope,
  useRoomOfferingMeta,
  useRoomOutlet,
  useRoomWeeks,
  type RoomSession,
} from "@/hooks/useCohortRooms";
import PreStartCard from "@/components/room/PreStartCard";
import AssignmentModule from "@/components/room/AssignmentModule";
import ThisWeekCard from "@/components/room/ThisWeekCard";
import WeeksModule, {
  defaultWeek,
  groupSessionsByWeek,
  sessionsForWeek,
} from "@/components/room/WeeksModule";
import { useRoomClock } from "@/components/room/RoomClockProvider";

/**
 * RoomHome — what a room opens onto.
 *
 * R1 rendered the ORDERED module stack as summary cards; R2 puts the real
 * modules behind them. The top slot is now R2-T1's This Week hero — the same
 * `ThisWeekCard` the weeks module opens on — and everything below it stays a
 * card that links onward. Nothing here is a stub: a card with nothing to say
 * does not render at all.
 *
 * ── Round trips ───────────────────────────────────────────────────────────
 * R1's docstring said a room open costs ONE round trip, and for the lobby it
 * still does. The hero costs a SECOND (`useRoomWeeks`), because week metadata —
 * theme, assignment, `feedback_session_at`, the caller's own submission — is
 * simply not in the envelope (rpcs.sql carries sessions and announcements, no
 * weeks). It is the same query key `WeeksModule` uses, so tapping through to
 * `weeks/:n` is a cache hit rather than a third call, and it is not fired at all
 * in the lobby or when the cohort has switched `weeks` off.
 *
 * ── One submission surface, not two ───────────────────────────────────────
 * The hero deliberately does NOT receive `renderAssignment`, so it shows the
 * prompt, the due date and the submission status READ-ONLY (`ThisWeekCard`'s own
 * fallback body). The submit → review → resubmit loop is mounted in exactly one
 * place, `RoomWeeksRoute` below, which is what makes "the loop is preserved
 * byte-for-byte" a checkable claim rather than two copies to keep in step.
 */

/** The next session that has not finished yet, in the envelope's own order. */
function nextSession(sessions: RoomSession[], now = Date.now()): RoomSession | null {
  return (
    sessions.find((session) => {
      const state = sessionTimeState(session, now);
      return state === "live" || state === "soon" || state === "tonight" || state === "scheduled";
    }) ?? null
  );
}

/** Day + time in the calendar members actually live in (R-D: IST). */
const IST_DATE = new Intl.DateTimeFormat("en-IN", {
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});

const RoomHome = () => {
  const { room, envelope, refetch } = useRoomOutlet();
  const { user } = useAuth();
  // `cohort_start_date` / `whatsapp_group_link` live on `offerings`, not in the
  // room envelope. Same query key as the shell's, so this is a cache hit.
  const meta = useRoomOfferingMeta(room.offering_id);

  const canSee = (key: RoomModuleKey) => moduleEnabled(envelope.config, key);

  // The lobby's whitelist is the masthead, the schedule, the announcements and
  // a cohort-mate COUNT — which is exactly what the induction renders. So the
  // lobby lands here whatever the phase says: `phase` and `access` are
  // independent axes, and a pre_member of a LIVE room is still in the lobby.
  const isLobby = room.phase === "pre_start" || isLobbyEnvelope(envelope);

  // The hero's data. Idle in the lobby (whose envelope is redacted anyway) and
  // idle when the cohort runs no weeks, so neither pays for a query it cannot
  // render. `RoomShell` mounts the clock this reads, so one interval serves the
  // whole room.
  const wantsHero = !isLobby && canSee("weeks");
  const weeksQuery = useRoomWeeks(room.offering_id, { enabled: wantsHero });
  const nowMs = useRoomClock();

  const weeks = useMemo(() => weeksQuery.data ?? [], [weeksQuery.data]);
  const heroWeek = useMemo(() => (wantsHero ? defaultWeek(weeks) : null), [wantsHero, weeks]);
  const heroSessions = useMemo(
    () => (heroWeek ? sessionsForWeek(heroWeek, groupSessionsByWeek(envelope.sessions)) : []),
    [heroWeek, envelope.sessions],
  );

  const session = nextSession(envelope.sessions, nowMs);
  const announcement = envelope.announcements[0] ?? null;

  if (isLobby) {
    return (
      <PreStartCard
        // R1-T6's published contract takes the ENVELOPE as `room` — the
        // membership row's week count is the one thing the envelope lacks.
        room={envelope}
        totalWeeks={room.total_weeks}
        startsAt={meta.data?.cohort_start_date ?? null}
        whatsappGroupLink={meta.data?.whatsapp_group_link ?? null}
        // The server's own phase flip is what swaps the layout — never a
        // client-side guess that the doors must be open by now.
        onDoorsOpen={refetch}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/*
        THE TOP SLOT, in one of three states.

        1. The hero: the week the season is actually on, rendered by the same
           card `/weeks/:n` opens with, so home and the weeks tab never disagree
           about the same week.
        2. Its skeleton, for the one round trip the week rows cost.
        3. R1's summary cards — the fallback whenever there is no week to lead
           with: the weeks module is off, the schedule has not been authored, or
           the week query failed. It is the same "never dead-end" posture the
           `/cohort` shim takes, applied to a card instead of a route.

        ⚠️ `canSee("sessions")` gates the FALLBACK card only. Inside the hero the
        session list is the WEEK's content, gated by `weeks` exactly as it is at
        `/weeks/:n` — making home stricter than the weeks tab about the same week
        would be a bug, not a gate.
      */}
      {wantsHero && weeksQuery.isPending ? (
        <div
          className="space-y-3 rounded-xl border border-border bg-surface p-5"
          role="status"
          aria-busy="true"
        >
          <span className="sr-only">Loading this week</span>
          <SkeletonLine width="35%" height="12px" />
          <SkeletonLine width="80%" height="24px" />
          <SkeletonLine width="55%" height="12px" />
        </div>
      ) : heroWeek ? (
        <>
          <ThisWeekCard
            week={heroWeek}
            sessions={heroSessions}
            userId={user?.id ?? null}
            batchId={envelope.batch_id}
            nowMs={nowMs}
          />
          <SurfaceCard to={`weeks/${heroWeek.week_number}`} padding="md">
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              Curriculum
            </p>
            <p className="mt-2 text-base text-foreground">
              Week {heroWeek.week_number} of {room.total_weeks || weeks.length}
            </p>
            <p className="body-muted mt-1 text-sm">
              {heroWeek.assignment_prompt && !heroWeek.submission_id
                ? "Open the week to submit."
                : "Every week of the season."}
            </p>
          </SurfaceCard>
        </>
      ) : (
        <>
          {canSee("sessions") && session && (
            <SurfaceCard to="screenings" padding="md">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Next up
              </p>
              <p className="mt-2 text-base text-foreground">{session.title ?? "Live session"}</p>
              {session.scheduled_at && (
                <p className="body-muted mt-1 flex items-center gap-2 text-sm">
                  <CalendarClock size={14} strokeWidth={1.5} />
                  {IST_DATE.format(new Date(session.scheduled_at))} IST
                </p>
              )}
            </SurfaceCard>
          )}

          {canSee("weeks") && room.total_weeks > 0 && (
            <SurfaceCard to={`weeks/${room.current_week ?? 1}`} padding="md">
              <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
                Curriculum
              </p>
              <p className="mt-2 text-base text-foreground">
                {room.current_week
                  ? `Week ${room.current_week} of ${room.total_weeks}`
                  : `${room.total_weeks} weeks`}
              </p>
            </SurfaceCard>
          )}
        </>
      )}

      {canSee("announcements") && announcement && (
        <SurfaceCard padding="md" variant="static">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <Megaphone size={12} strokeWidth={1.5} className="mr-2 inline align-[-1px]" />
            From the team
          </p>
          <p className="mt-2 text-base text-foreground">
            {announcement.title ?? "New announcement"}
          </p>
          {announcement.body && (
            <p className="body-muted mt-1 line-clamp-2 text-sm">{announcement.body}</p>
          )}
        </SurfaceCard>
      )}

      {canSee("roster") && envelope.roster_count > 0 && (
        <SurfaceCard to="people" padding="md">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <Users size={12} strokeWidth={1.5} className="mr-2 inline align-[-1px]" />
            In the room
          </p>
          <p className="mt-2 text-base text-foreground">
            {envelope.roster_count} {envelope.roster_count === 1 ? "person" : "people"}
          </p>
        </SurfaceCard>
      )}
    </div>
  );
};

export default RoomHome;

/**
 * What a module the cohort has switched OFF says.
 *
 * One implementation, because a disabled module must read the same however it
 * was reached — the rail hides the tab, so the only way in is a typed URL, and
 * `RoomScreenings` already owns this exact sentence for `recordings`. Two
 * spellings of it would be one cohort setting producing two empty states.
 */
const ModuleOffNote = ({ title }: { title: string }) => (
  <p className="body-muted py-10 text-center text-sm">
    This cohort doesn&apos;t use {title.toLowerCase()}.{" "}
    <Link to="." className="text-room-accent underline-offset-4 hover:underline">
      Back to the room
    </Link>
  </p>
);

/**
 * `weeks/:n` — R2-T1's weeks module, gated and given its assignment renderer.
 *
 * TWO things happen here and nowhere else:
 *
 *  1. **The gate.** `WeeksModule` has none of its own, so without this wrapper a
 *     cohort with `weeks: false` would still serve the module to a typed URL.
 *     `RoomScreenings` gates itself (`:349`), which is why `screenings` is
 *     mounted directly and only `weeks` needs wrapping.
 *  2. **The assignment seam.** `renderAssignment` is injected from outside by
 *     contract (WeeksModule.tsx:174-183), so this call site is the ONLY reason
 *     R2-T4's submission loop reaches a student at all. It is additionally gated
 *     on the `assignments` module: switched off, `ThisWeekCard` falls back to the
 *     read-only prompt instead of a form nobody is meant to see.
 *
 * It lives in this file rather than its own because it is the same "a module tab
 * is only ever reached from the home it renders beside" chunk (App.tsx:104-117),
 * and because the gate needs the shell's envelope, which `App.tsx` cannot read.
 */
export const RoomWeeksRoute = () => {
  const { envelope } = useRoomOutlet();

  if (!moduleEnabled(envelope.config, "weeks")) return <ModuleOffNote title="Weeks" />;

  return moduleEnabled(envelope.config, "assignments") ? (
    <WeeksModule renderAssignment={(props) => <AssignmentModule {...props} />} />
  ) : (
    <WeeksModule />
  );
};

/**
 * The nested module routes still waiting on their module (`feed`, `people`,
 * `resources`).
 *
 * R1 gives each one its own address, its own heading and the room's own data;
 * the phase that builds it replaces the body. `weeks` and `screenings` have
 * graduated out of here — see `RoomWeeksRoute` above and `RoomScreenings`. A
 * module the cohort has switched OFF is not reachable by typing its URL either:
 * `moduleEnabled` decides here exactly as it decides in the rail, so a disabled
 * module reads as absent rather than as an empty page.
 */
export const RoomModuleRoute = ({
  module,
  title,
}: {
  module: RoomModuleKey;
  title: string;
}) => {
  const { envelope, room } = useRoomOutlet();

  if (!moduleEnabled(envelope.config, module)) return <ModuleOffNote title={title} />;

  return (
    <section aria-labelledby={`room-module-${module}`} className="space-y-4">
      <h2
        id={`room-module-${module}`}
        className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
      >
        {title}
      </h2>
      <p className="body-muted text-sm">
        {room.offering_title} · {title} opens here.
      </p>
    </section>
  );
};
