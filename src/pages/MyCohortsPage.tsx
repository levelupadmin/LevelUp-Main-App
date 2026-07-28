import { useMemo } from "react";
import { GraduationCap } from "lucide-react";
import { EmptyState, SurfaceCard } from "@/components/patterns";
import { resolveTheme } from "@/lib/room";
import usePageTitle from "@/hooks/usePageTitle";
import { useMyCohortRooms, type CohortRoomSummary } from "@/hooks/useCohortRooms";
import { RoomErrorState, RoomLoadingState } from "@/pages/room/RoomStates";

/**
 * MyCohortsPage — `/rooms`, every room the student belongs to.
 *
 * R1-T1 lands the route and the shape (live rooms first, an alumni shelf below,
 * one branded empty state); R1-T4 dresses the cards and wires the nav slot.
 *
 * A room with no `room_slug` has no config row and therefore no address, so it
 * links to the legacy `/cohort/:offering_id` page rather than to a URL that
 * cannot resolve.
 */

const roomHref = (room: CohortRoomSummary) =>
  room.room_slug ? `/room/${room.room_slug}` : `/cohort/${room.offering_id}`;

const PHASE_LABEL: Record<CohortRoomSummary["phase"], string> = {
  pre_start: "Starting soon",
  live: "In session",
  wrap: "Wrapping up",
  alumni: "Alumni",
};

const RoomRow = ({ room }: { room: CohortRoomSummary }) => {
  const theme = resolveTheme(room);
  return (
    <SurfaceCard to={roomHref(room)} padding="md">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="h-10 w-1 shrink-0 rounded-full"
          style={{ background: `hsl(${theme.accentVar})` }}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-base text-foreground">
            {theme.wordmarkText ?? room.offering_title}
          </p>
          <p className="body-muted mt-1 text-sm">
            {PHASE_LABEL[room.phase]}
            {room.total_weeks > 0 && room.current_week
              ? ` · Week ${room.current_week} of ${room.total_weeks}`
              : ""}
          </p>
        </div>
        {room.unseen_announcements > 0 && (
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: `hsl(${theme.accentTextVar})` }}
            aria-label={`${room.unseen_announcements} unread announcements`}
          />
        )}
      </div>
    </SurfaceCard>
  );
};

const MyCohortsPage = () => {
  usePageTitle("My Cohorts");
  const { data, isPending, isFetching, isError, refetch } = useMyCohortRooms();

  const { live, alumni } = useMemo(() => {
    const rooms = data ?? [];
    return {
      live: rooms.filter((room) => room.phase !== "alumni"),
      alumni: rooms.filter((room) => room.phase === "alumni"),
    };
  }, [data]);

  if (isPending && isFetching) return <RoomLoadingState />;
  if (isError) return <RoomErrorState onRetry={() => void refetch()} />;

  if (live.length === 0 && alumni.length === 0) {
    return (
      <EmptyState
        icon={<GraduationCap size={22} strokeWidth={1.5} />}
        title="No cohort yet."
        description="Live cohorts run in small groups a few times a year. Have a look at what's open."
        action={{ to: "/learn?seg=live", label: "See live cohorts" }}
      />
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8 px-4 py-6 md:px-8">
      {live.length > 0 && (
        <section aria-labelledby="rooms-live" className="space-y-3">
          <h1
            id="rooms-live"
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
          >
            My Cohorts
          </h1>
          {live.map((room) => (
            <RoomRow key={`${room.offering_id}-${room.batch_id ?? "none"}`} room={room} />
          ))}
        </section>
      )}

      {alumni.length > 0 && (
        <section aria-labelledby="rooms-alumni" className="space-y-3">
          <h2
            id="rooms-alumni"
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
          >
            Alumni
          </h2>
          {alumni.map((room) => (
            <RoomRow key={`${room.offering_id}-${room.batch_id ?? "none"}`} room={room} />
          ))}
        </section>
      )}
    </div>
  );
};

export default MyCohortsPage;
