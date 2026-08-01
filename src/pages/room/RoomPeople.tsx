import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Users } from "lucide-react";

import { EmptyState, ErrorState, SkeletonGrid } from "@/components/patterns";
import MentorCard from "@/components/room/MentorCard";
import RosterGrid, {
  dedupeRosterEntries,
  isRoomStaff,
  rosterDisplayName,
  rosterOneLiner,
  staffWordmark,
} from "@/components/room/RosterGrid";
import { isLobbyEnvelope, useRoomOutlet, useRoomRoster } from "@/hooks/useCohortRooms";
import { moduleEnabled } from "@/lib/room";

/**
 * RoomPeople — who is in the room (`/room/:slug/people`).
 *
 * Mentors and hosts on top, then the cohort-mate grid and a count line in mono.
 * It replaces the `RoomModuleRoute module="roster"` placeholder for THIS slot
 * only: `feed` and `resources` keep saying they open here, because they do not
 * open anywhere yet, and a slot with no module must keep saying so.
 *
 * ── One data source, six columns ──────────────────────────────────────────
 * `useRoomRoster` → `get_room_roster(p_offering)`, whose `RETURNS TABLE` is
 * `(user_id, full_name, avatar_url, occupation, city, role)`. There is no phone
 * and no email in it, deliberately, and the projection is pinned in the
 * migration's signature — the adversarial suite's C1 asserts that exact column
 * list over the wire (`npm run test:room-access`). Nothing on this page reaches
 * past those six, and `cohort_applications.bio` / `tally_data` (NFR-COPY-1)
 * appear nowhere in the room surfaces at all.
 *
 * ── The gate lives here ───────────────────────────────────────────────────
 * Mounted DIRECTLY in `App.tsx`, not through `RoomModuleRoute`, so this file
 * owns the `roster` gate exactly as `RoomScreenings` owns `recordings`. The
 * off-note sentence below is that component's, word for word (its LINK is not:
 * see the note on `ModuleOff`): one cohort setting must not produce two empty
 * states. (`ModuleOffNote` in `RoomHome.tsx` is the third copy of the same
 * sentence and is deliberately NOT imported — importing it would put this page
 * in that module's chunk, which is the thing the lazy split in `App.tsx` buys.)
 *
 * ── The lobby has NO count, and that is a server fact ─────────────────────
 * A `pre_member` is denied `get_room_roster` by design, so the query is not
 * fired at all for a lobby envelope. What the lobby does NOT have is a number to
 * show in its place: `get_cohort_room.roster_count` counts
 * `cohort_room_roster_ids` narrowed to `role IN ('member','alumni')`, and §1b of
 * that migration never lists a `pre_member` row at all, on top of which the
 * lobby row carries no batch (the whitelist is offering-LEVEL, so `sessions` and
 * `roster_count` "resolve EMPTY until enrolment assigns a batch"). So
 * `roster_count` is STRUCTURALLY 0 for every lobby caller, and "0 in this room"
 * is not a count line, it is a wrong one. The lobby therefore gets the sentence
 * and nothing else. Giving the lobby a real number is an upstream product
 * change (give the queued row its batch), which that migration already flags as
 * a product question — not something to paper over here.
 *
 * ── A denial is not the lobby ─────────────────────────────────────────────
 * A `42501` on the roster for a caller whose envelope says `member` is a
 * different state: their membership went away underneath a cached envelope. They
 * are not waiting for doors that already opened for them, so they get their own
 * sentence, and no count — least of all the envelope's, which is a number the
 * server just refused them.
 *
 * ── ROSTER-SCOPE-1 ────────────────────────────────────────────────────────
 * No DMs, no follow, no profile drilldown in v1. Nothing on this page is a link
 * to a person, which is why nothing here is clickable except "show more".
 */

/**
 * What a room with the module switched off says. Same sentence as the shelf.
 *
 * 🔴 `to=".."`, NOT `to="."`. This element is rendered by the nested `people`
 * route, so a relative `.` resolves to the CURRENT path and the only way out of
 * a module-off page would navigate straight back to it. `..` climbs to the
 * parent route, `/room/:slug`, which is the room this sentence offers to return
 * to. (`RoomHome`'s `ModuleOffNote` and `RoomScreenings` still carry the `.`
 * form; both are outside this task's files and are raised in the handoff.)
 */
const ModuleOff = () => (
  <p className="body-muted py-10 text-center text-sm">
    This cohort doesn&apos;t use people.{" "}
    <Link to=".." className="text-room-accent underline-offset-4 hover:underline">
      Back to the room
    </Link>
  </p>
);

const RoomPeople = () => {
  const { room, envelope } = useRoomOutlet();

  const moduleOn = moduleEnabled(envelope.config, "roster");
  // A lobby visitor is denied this RPC by design, and a room with the module off
  // has nothing to render it into. Neither pays for a round trip.
  const lobby = isLobbyEnvelope(envelope);
  const roster = useRoomRoster(room.offering_id, { enabled: moduleOn && !lobby });

  // Deduped BEFORE the partition, because the partition is by role and a person
  // can hold two roles here — see `dedupeRosterEntries`.
  const entries = useMemo(() => dedupeRosterEntries(roster.data ?? []), [roster.data]);
  const staff = useMemo(() => entries.filter((entry) => isRoomStaff(entry.role)), [entries]);
  const members = useMemo(() => entries.filter((entry) => !isRoomStaff(entry.role)), [entries]);

  if (!moduleOn) return <ModuleOff />;

  /**
   * Neither state has a roster to draw, and neither has an honest number to put
   * where one would go, but they are not the same state — see the header. The
   * lobby is waiting; a denied member has lost something they had.
   */
  const noRoster = lobby || roster.denied;

  return (
    <section aria-labelledby="room-module-roster" className="space-y-4">
      <h2
        id="room-module-roster"
        className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
      >
        People
      </h2>

      {noRoster ? (
        <p className="body-muted text-sm">
          {lobby
            ? "You will see who else is here when the doors open."
            : "Your access to this room's roster has ended."}
        </p>
      ) : roster.isPending ? (
        <SkeletonGrid count={6} cols="grid-cols-2 sm:grid-cols-3 lg:grid-cols-4" />
      ) : roster.isError ? (
        <ErrorState
          title="The roster didn't load"
          description="Check your connection and try again."
          onRetry={() => void roster.refetch()}
        />
      ) : (
        <>
          {staff.length > 0 && (
            <div className="grid gap-2 sm:grid-cols-2">
              {staff.map((entry) => (
                <MentorCard
                  key={entry.user_id}
                  name={rosterDisplayName(entry)}
                  avatarUrl={entry.avatar_url}
                  // `isRoomStaff` already narrowed this to mentor | host, so the
                  // fallback is unreachable rather than a guess.
                  wordmark={staffWordmark(entry.role) ?? "MENTOR"}
                  line={rosterOneLiner(entry)}
                />
              ))}
            </div>
          )}

          {/* Keyed on MEMBERS, not on the whole roster. A staff-only roster is
              reachable — a NULL-batch mentor is offering-wide, so before the
              first enrolment lands `cohort_room_roster_ids` returns the staff
              and nobody else — and testing `entries` there would skip this and
              paint "0 in this room" over an empty grid. The count line lives
              inside `RosterGrid`, so the grid must only be mounted when it has
              cohort-mates to count. */}
          {members.length > 0 ? (
            <RosterGrid entries={members} phase={room.phase} />
          ) : (
            <EmptyState
              icon={<Users size={22} strokeWidth={1.5} />}
              title="The room is still filling up."
              description="Everyone in your batch appears here as they join."
            />
          )}
        </>
      )}
    </section>
  );
};

export default RoomPeople;
