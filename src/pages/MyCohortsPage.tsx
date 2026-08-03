import { useEffect, useMemo, useState } from "react";
import { GraduationCap } from "lucide-react";
import { EmptyState, SurfaceCard } from "@/components/patterns";
import { resolveTheme, sessionTimeState } from "@/lib/room";
import { cn } from "@/lib/utils";
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

/* ──────────────────────────────────────────────────────────────────────────
 * The next-session line
 *
 * `sessionTimeState` (R0, `src/lib/room.ts`) owns WHICH state a session is in —
 * it is IST-safe by construction and already tested, so this file only puts
 * words to its answer. The formatting stays LOCAL on purpose: there is no shared
 * countdown formatter in `src/lib`, and `PreStartCard`'s day-granularity helpers
 * are module-private. Exporting them would trade this leaf change for a
 * cross-cutting one for the sake of two Intl instances.
 * ────────────────────────────────────────────────────────────────────────── */

const IST_TIME_ZONE = "Asia/Kolkata";

/** From this IST hour on, a session that day is "Tonight" rather than "Today". */
const EVENING_IST_HOUR = 16;

/** Day granularity is enough for everything but `soon`, so a minute is ample. */
const COUNTDOWN_TICK_MS = 60_000;

const istDateFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const istClockFormat = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const istHourFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST_TIME_ZONE,
  hour: "2-digit",
  hourCycle: "h23",
});

/** Meridiem uppercased so this agrees with every other clock in the app. */
const istClockLabel = (ms: number) =>
  istClockFormat.format(ms).replace(/\b([ap])\.?m\.?\b/gi, (match) => match.toUpperCase());

const istHour = (ms: number) => Number.parseInt(istHourFormat.format(ms), 10);

interface NextSessionNote {
  label: string;
  /** Inside the T-24h window — worth the room's accent rather than grey. */
  urgent: boolean;
}

/**
 * What to say about `next_session_at`, or null for nothing to say.
 *
 * A session that ENDED while the page sat open returns null rather than a stale
 * countdown: the RPC hands back the next airing, and once it is over the honest
 * answer is silence until the next refetch.
 */
function nextSessionNote(at: string | null, nowMs: number): NextSessionNote | null {
  if (!at) return null;
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return null;

  switch (sessionTimeState({ scheduled_at: at }, nowMs)) {
    case "live":
      return { label: "Live now", urgent: true };
    case "soon": {
      const minutes = Math.max(1, Math.ceil((ms - nowMs) / 60_000));
      return { label: `Starts in ${minutes} min`, urgent: true };
    }
    case "tonight":
      return {
        label: `${istHour(ms) >= EVENING_IST_HOUR ? "Tonight" : "Today"}, ${istClockLabel(ms)}`,
        urgent: true,
      };
    case "scheduled":
      return { label: `Next · ${istDateFormat.format(ms)}, ${istClockLabel(ms)}`, urgent: false };
    default:
      return null;
  }
}

/** One clock for the whole list — N rows must not mean N intervals. */
function useNowMs(active: boolean): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNowMs(Date.now()), COUNTDOWN_TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
  return nowMs;
}

const RoomRow = ({ room, nowMs }: { room: CohortRoomSummary; nowMs: number }) => {
  const theme = resolveTheme(room);
  const nextSession = nextSessionNote(room.next_session_at, nowMs);
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
          {nextSession && (
            <p
              className={cn(
                "mt-1.5 truncate font-mono text-[11px] uppercase tracking-[0.24em]",
                !nextSession.urgent && "text-muted-foreground",
              )}
              // Accent only while it is imminent; a date three weeks out is
              // information, not a call to action.
              style={nextSession.urgent ? { color: `hsl(${theme.accentTextVar})` } : undefined}
            >
              {nextSession.label}
            </p>
          )}
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

  // The tick only runs when something is actually counting down.
  const nowMs = useNowMs((data ?? []).some((room) => room.next_session_at !== null));

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
            <RoomRow
              key={`${room.offering_id}-${room.batch_id ?? "none"}`}
              room={room}
              nowMs={nowMs}
            />
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
            <RoomRow
              key={`${room.offering_id}-${room.batch_id ?? "none"}`}
              room={room}
              nowMs={nowMs}
            />
          ))}
        </section>
      )}
    </div>
  );
};

export default MyCohortsPage;
