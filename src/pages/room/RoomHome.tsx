import { useMemo } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarClock, Users } from "lucide-react";
import { moduleEnabled, sessionTimeState, type RoomModuleKey } from "@/lib/room";
import { SkeletonLine, SurfaceCard } from "@/components/patterns";
import { useAuth } from "@/contexts/AuthContext";
import {
  isLobbyEnvelope,
  useRoomOfferingMeta,
  useRoomOutlet,
  useRoomResources,
  useRoomSeenWatermark,
  useRoomWeeks,
  type RoomSession,
} from "@/hooks/useCohortRooms";
import AnnouncementsModule from "@/components/room/AnnouncementsModule";
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
 * modules behind them, and R3 puts the noticeboard here IN FULL rather than as
 * the one-line teaser that slot used to carry. The top slot is now R2-T1's This
 * Week hero — the same `ThisWeekCard` the weeks module opens on — and the cards
 * that remain link onward. Nothing here is a stub: a summary CARD with nothing
 * to say does not render at all. The noticeboard is the one thing that renders
 * empty, and it is not an exception to that rule: a card is a teaser for
 * something elsewhere, so an empty one is a dead end, while the board IS the
 * surface and "Nothing on the board yet." is a true answer to the question the
 * student came with (the brief's own edge case).
 *
 * ── Round trips ───────────────────────────────────────────────────────────
 * R1's docstring said a room open costs ONE round trip, and for the lobby it
 * still does not cost the hero's. The hero costs a SECOND (`useRoomWeeks`),
 * because week metadata — theme, assignment, `feedback_session_at`, the caller's
 * own submission — is simply not in the envelope (rpcs.sql carries sessions and
 * announcements, no weeks). It is the same query key `WeeksModule` uses, so
 * tapping through to `weeks/:n` is a cache hit rather than a third call, and it
 * is not fired at all in the lobby or when the cohort has switched `weeks` off.
 *
 * R3-T1's board costs a THIRD, on BOTH branches: the envelope's `announcements`
 * array is capped at ten rows and carries no author, so `AnnouncementsModule`
 * reads `get_room_announcements` instead. The lobby pays it too, and that is a
 * decision rather than an oversight — see "the lobby gets the whole board".
 * R3 round 2 adds one CONDITIONAL binder read on the member branch, only while
 * the resources module is enabled. It exists solely to avoid drawing a dead
 * home card for an empty binder, shares the route's cache key, and stays idle
 * in the lobby.
 *
 * There is also exactly ONE WRITE on open — the `cohort_room_seen` watermark,
 * which is what clears the unseen dot on `/rooms`. It is written by whichever
 * surface can honestly claim the board has been SEEN: the module, once its rows
 * are in hand, and this file only for a cohort that runs no board at all.
 *
 * ── The lobby gets the whole board ────────────────────────────────────────
 * A `pre_member`'s entire whitelist is masthead / schedule / presence /
 * announcements-READ (MEMBER-1), so the noticeboard is not a nice-to-have down
 * there, it is the tier's only content. `PreStartCard` shows exactly ONE notice
 * (`(room.announcements ?? [])[0]`), which was enough while nothing wrote the
 * watermark and became a data loss the moment something did: a cohort that
 * posts three notices before doors open would have had two of them marked seen
 * for ever with no surface that listed them. So the lobby renders the same
 * board every member sees, and the card is handed the envelope WITHOUT its
 * announcements so exactly one surface owns them. `PreStartCard` itself is
 * untouched: it still renders its teaser for any caller that gives it notices.
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

  // R3-T1's watermark, and this file writes it in exactly ONE case: a cohort
  // that runs no announcements module. `get_my_cohort_rooms` counts
  // announcements whatever the module config says, so without this the dot on
  // `/rooms` would have no way to clear for those cohorts. Every other case
  // belongs to `AnnouncementsModule`, which writes it once its rows are in hand
  // — a watermark is a claim that the whole board has been seen, and only the
  // surface that showed the board can honestly make it. Both branches below
  // mount that module, the lobby included.
  useRoomSeenWatermark(room.offering_id, { enabled: !canSee("announcements") });

  // The lobby's whitelist is the masthead, the schedule, the announcements and
  // a cohort-mate COUNT — which is exactly what the induction renders. So the
  // lobby lands here whatever the phase says: `phase` and `access` are
  // independent axes, and a pre_member of a LIVE room is still in the lobby.
  const isLobby = room.phase === "pre_start" || isLobbyEnvelope(envelope);
  // Unlike the feed, an empty binder must not leave a dead summary card on
  // home. This bounded read is idle in the lobby and when the module is off.
  const resourcesQuery = useRoomResources(room.offering_id, {
    batchId: envelope.batch_id,
    enabled: !isLobby && canSee("resources"),
  });

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

  // The induction card's own single-notice teaser would duplicate the board's
  // top row now that the lobby renders the board, so the card is handed the
  // envelope WITHOUT announcements and draws no notice block at all
  // (`PreStartCard` builds it from `(room.announcements ?? [])[0]`). Nothing in
  // that file changes: this is the caller deciding which surface owns the
  // noticeboard, which is the same call `RoomHome` already makes for every other
  // module on this page.
  const lobbyRoom = useMemo(() => ({ ...envelope, announcements: [] }), [envelope]);

  if (isLobby) {
    return (
      <div className="space-y-4">
        <PreStartCard
          // R1-T6's published contract takes the ENVELOPE as `room` — the
          // membership row's week count is the one thing the envelope lacks.
          room={lobbyRoom}
          totalWeeks={room.total_weeks}
          startsAt={meta.data?.cohort_start_date ?? null}
          whatsappGroupLink={meta.data?.whatsapp_group_link ?? null}
          // The server's own phase flip is what swaps the layout — never a
          // client-side guess that the doors must be open by now.
          onDoorsOpen={refetch}
        />

        {/* MEMBER-1's whole whitelist for this tier. `get_room_announcements`
            admits the lobby by name (`cohort_room_in_lobby`) and returns the
            offering-level rows only, so the module needs no lobby branch of its
            own. */}
        {canSee("announcements") && <AnnouncementsModule />}
      </div>
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
            // The room's own clock, already read above for the fallback card, so
            // the hero and everything else on this page agree on one instant.
            nowMs={nowMs}
            assignmentsEnabled={canSee("assignments")}
            peerReviewEnabled={canSee("peer_review")}
            // RELATIVE, and correct from the INDEX route only: `weeks/:n` passes
            // `"../screenings"` for the same target. No `renderAssignment` — see
            // the "one submission surface" note above.
            recordingHref="screenings"
            calendarNote={room.offering_title}
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

      {/*
        R3-T1's noticeboard, in the slot R1's one-line summary card used to
        hold. There is no `announcements` tab and no announcements route
        (`ROOM_TABS`, RoomShell.tsx), so this is the module's ONLY mount point:
        the board reads better here than behind a tab anyway, because a notice
        is the thing a student opens the room to find.

        The gate stays HERE rather than moving inside the module, matching every
        other slot on this page: one file decides what a cohort's config
        switches off.
      */}
      {canSee("announcements") && <AnnouncementsModule />}

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

      {canSee("resources") && (resourcesQuery.data?.resources.length ?? 0) > 0 && (
        <SurfaceCard to="resources" padding="md">
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <BookOpen size={12} strokeWidth={1.5} className="mr-2 inline align-[-1px]" />
            Reference binder
          </p>
          <p className="mt-2 text-base text-foreground">
            {resourcesQuery.data?.resources.length}{" "}
            {resourcesQuery.data?.resources.length === 1 ? "resource" : "resources"}
          </p>
          <p className="body-muted mt-1 text-sm">Files, links and recordings from the cohort team.</p>
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
 *     contract (`WeeksModuleProps`), so this call site is the ONLY reason R2-T4's
 *     submission loop reaches a student at all. It is passed UNCONDITIONALLY:
 *     `WeeksModule` reads `assignments` and `peer_review` off the envelope itself
 *     and stops the column upstream of the renderer, so re-deciding it here would
 *     be a second copy of one gate.
 *
 * It lives in this file rather than its own because it is the same "a module tab
 * is only ever reached from the home it renders beside" chunk, and because the
 * gate needs the shell's envelope, which `App.tsx` cannot read.
 */
export const RoomWeeksRoute = () => {
  const { envelope } = useRoomOutlet();

  if (!moduleEnabled(envelope.config, "weeks")) return <ModuleOffNote title="Weeks" />;

  return <WeeksModule renderAssignment={(props) => <AssignmentModule {...props} />} />;
};
