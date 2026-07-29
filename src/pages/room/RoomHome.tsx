import { Link } from "react-router-dom";
import { CalendarClock, Megaphone, Users } from "lucide-react";
import { moduleEnabled, sessionTimeState, type RoomModuleKey } from "@/lib/room";
import { SurfaceCard } from "@/components/patterns";
import {
  isLobbyEnvelope,
  useRoomOfferingMeta,
  useRoomOutlet,
  type RoomSession,
} from "@/hooks/useCohortRooms";
import PreStartCard from "@/components/room/PreStartCard";

/**
 * RoomHome — what a room opens onto.
 *
 * R1 renders the ORDERED module stack; R2 fills each module out. Every card
 * here is built from data the shell already holds (the envelope), so opening a
 * room costs one round trip, and nothing on this page is a stub with no
 * meaning — a card that has nothing to say does not render at all.
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
  // `cohort_start_date` / `whatsapp_group_link` live on `offerings`, not in the
  // room envelope. Same query key as the shell's, so this is a cache hit.
  const meta = useRoomOfferingMeta(room.offering_id);

  const session = nextSession(envelope.sessions);
  const announcement = envelope.announcements[0] ?? null;
  const canSee = (key: RoomModuleKey) => moduleEnabled(envelope.config, key);

  // The lobby's whitelist is the masthead, the schedule, the announcements and
  // a cohort-mate COUNT — which is exactly what the induction renders. So the
  // lobby lands here whatever the phase says: `phase` and `access` are
  // independent axes, and a pre_member of a LIVE room is still in the lobby.
  if (room.phase === "pre_start" || isLobbyEnvelope(envelope)) {
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
 * The nested module routes (`weeks/:n`, `screenings`, `feed`, `people`,
 * `resources`).
 *
 * R1 gives each one its own address, its own heading and the room's own data;
 * R2 replaces the body with the real module. A module the cohort has switched
 * OFF is not reachable by typing its URL either — `moduleEnabled` decides here
 * exactly as it decides in the rail, so a disabled module reads as absent
 * rather than as an empty page.
 */
export const RoomModuleRoute = ({
  module,
  title,
}: {
  module: RoomModuleKey;
  title: string;
}) => {
  const { envelope, room } = useRoomOutlet();

  if (!moduleEnabled(envelope.config, module)) {
    return (
      <p className="body-muted py-10 text-center text-sm">
        This cohort doesn&apos;t use {title.toLowerCase()}.{" "}
        <Link to="." className="text-room-accent underline-offset-4 hover:underline">
          Back to the room
        </Link>
      </p>
    );
  }

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
