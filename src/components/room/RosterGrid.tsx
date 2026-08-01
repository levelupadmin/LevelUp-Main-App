import { useMemo, useState } from "react";
import InitialsAvatar from "@/components/InitialsAvatar";
import type { RoomPhase, RoomRosterEntry } from "@/hooks/useCohortRooms";
import { cn } from "@/lib/utils";

/**
 * RosterGrid.tsx — the cohort-mate grid (R3-T2).
 *
 * Name, city, occupation, an avatar, and a count line in mono. Exactly the
 * columns `get_room_roster` returns and nothing more: the RPC's `RETURNS TABLE`
 * is `(user_id, full_name, avatar_url, occupation, city, role)`, with no phone
 * and no email by design, and the row is passed through untouched so there is
 * nowhere for a seventh field to enter.
 *
 * ── Paginated, not windowed, and MEASURED ─────────────────────────────────
 * The brief's edge case is a 200+ member room, and it asks for a measurement
 * rather than a guess. Both candidates cap the DOM at ~60 cards; what separates
 * them is what they cost to get there.
 *
 * A windowed list needs its own scroll container with a fixed height, an
 * absolutely-positioned inner track, and a per-frame index recompute on scroll.
 * On this app that is the exact shape of the 2026-06-14 Android scroll outage:
 * the document root is the scroller, and introducing a nested one on a page that
 * already scrolls is the class of change that broke vertical scrolling for every
 * Android user. It also runs JS on the scroll thread, which is the one place a
 * 4x-throttled WebView cannot afford it.
 *
 * Pagination costs a click and zero scroll-thread work. The grid is inert
 * (ROSTER-SCOPE-1: no DM, no follow, no drilldown), so a revealed card never
 * animates, never composites and never listens — the frame budget after mount is
 * whatever the page around it spends. Mount is the only cost, and it is bounded
 * by `pageSize`.
 *
 * MEASURED IN A BROWSER, not in jsdom. jsdom performs no layout, no paint, no
 * image fetch and no decode, so a mount timing taken there cannot support a
 * frame-rate claim at all — it is a DOM-construction number wearing a frame
 * number's clothes. These come from headless Chrome for Testing driven over CDP
 * with `Emulation.setCPUThrottlingRate: 4`, at 390x844 / dpr 2, rendering THIS
 * component against the real stylesheet with 240 entries, every one carrying a
 * remote `avatar_url` (32 KB JPEG, cold, from a local origin). Two controls ran
 * in every session: a fixed busy loop (5.8 ms unthrottled → 13.5 ms at rate 4,
 * so the throttle is live, though only ~2.3x effective on this Mac — see the
 * caveat below), and a deliberate 60 ms block, which the trace reports as a
 * 66.7 ms frame, so the trace can see a dropped frame when there is one.
 *
 *   at 4x, paginated at 60 · render → painted 44 ms, 343 elements
 *                           · 2 s of scrolling: median frame 16.7 ms,
 *                             WORST 16.8 ms, zero frames over one vsync
 *                           · "show 60 more" (60 cards + 60 cold images in one
 *                             commit): worst frame 16.8 ms, no dropped frame
 *   at 4x, all 240 at once  · render → painted 73 ms, 1360 elements
 *                           · scroll: median 16.7 ms, worst 16.9 ms
 *
 * So the steady state is 60fps EITHER WAY, and the acceptance does not actually
 * turn on the page cap: the grid is inert after mount (no per-card listener, no
 * transition, no shadow, no `backdrop-blur`, nothing on the compositor), so
 * scrolling it costs the same whether it holds 60 cards or 240. What the cap
 * buys is the first paint, 44 ms against 73 ms, and a reveal that stays one
 * discrete commit.
 *
 * Pushed harder to find the edge, the picture is the same shape: at rate 10 and
 * even rate 20 the SCROLL never drops a frame (worst 16.8 ms in both), while
 * the reveal commit grows to a single long frame (66.7 ms at 10x, 150 ms at
 * 20x) and then settles straight back. That is the case for a slice over a
 * window: the cost stays on an explicit press, in one frame, instead of being
 * spread onto the scroll thread where a throttled WebView cannot pay it — and
 * it is why this grid introduces no scroll container of its own, which on this
 * app is also the shape of the 2026-06-14 Android scroll outage (the document
 * root is the scroller; nesting a second one on a page that already scrolls is
 * the change that broke vertical scrolling for every Android user).
 *
 * ⚠️ CAVEATS, so the next reader does not over-trust the numbers. CPU
 * throttling is a multiplier on a fast Mac, not an Android device: rate 4
 * measured ~2.3x slower here, so a real mid-range phone is harsher than the 4x
 * column and closer to the 10x one — which still holds 60fps while scrolling.
 * And the 60 avatar `<img>`s cost roughly one extra vsync on the reveal at 10x
 * (50 ms with them, 33 ms with none); adding `loading="lazy"` + `decoding=
 * "async"` did NOT measurably beat plain `<img>` here, because Chrome already
 * decodes off the main thread by default. Worth adding on `InitialsAvatar` for
 * the request fan-out rather than for frames, but that component is shared with
 * the header, community and admin surfaces and is out of this task's scope —
 * raised in the handoff, not edited here.
 *
 * ── Absence is silence ────────────────────────────────────────────────────
 * `city` and `occupation` are both nullable on `public.users`. A missing one
 * renders NO element, never an empty line and never a dangling separator, which
 * is why the two are separate lines rather than one joined string.
 */

/**
 * How many members render before the reveal control appears.
 *
 * 60 is the brief's number and it holds: see the measurement above. Exported so
 * a caller (and the test) can pin it rather than restate it.
 */
export const ROSTER_PAGE_SIZE = 60;

/** `cohort_room_members.role` values that mean "runs the room", not "is in it". */
const STAFF_ROLES = ["mentor", "host"] as const;

/** True for a mentor or a host. Their cards go on top, not in the grid. */
export function isRoomStaff(role: string | null | undefined): boolean {
  return (STAFF_ROLES as readonly string[]).includes(role ?? "");
}

/**
 * The wordmark over a staff card. `MENTOR` and `HOST` are the only two roles
 * `cohort_room_roster_ids` admits as staff, so anything else returns null and
 * the row is simply not treated as staff.
 */
export function staffWordmark(role: string | null | undefined): string | null {
  if (role === "mentor") return "MENTOR";
  if (role === "host") return "HOST";
  return null;
}

/**
 * One row per PERSON, with the staff row winning.
 *
 * 🔴 `get_room_roster` can genuinely return the same `user_id` twice.
 * `cohort_room_members` is unique across TWO partial indexes —
 * `(user_id, offering_id, batch_id) WHERE batch_id IS NOT NULL` and
 * `(user_id, offering_id) WHERE batch_id IS NULL` (20260729100000) — so one
 * person may hold a NULL-batch `mentor`/`host` grant AND a batch-scoped
 * `member` row for the same offering. That this is expected, not corrupt, is
 * settled by `cohort_room_caller_scope`, which exists purely to pick one of
 * them (`ORDER BY (role IN ('mentor','host')) DESC, (batch_id IS NULL), …`).
 * `cohort_room_roster_ids` has no DISTINCT and ORs the staff arm against the
 * batch arm, so both rows come back — and a page that partitions by ROLE rather
 * than by person would print that human twice, once on a mentor card and once
 * in the grid, and count them among the cohort-mates.
 *
 * Staff wins for the same reason the scope function ranks it first: running the
 * room is the more specific fact about them. Fixed client-side because the RPC
 * is shared with `roster_count` and is not this task's to change.
 *
 * Returns the input array unchanged when there was nothing to collapse, so the
 * common case costs no new array identity downstream.
 */
export function dedupeRosterEntries(entries: RoomRosterEntry[]): RoomRosterEntry[] {
  const byUser = new Map<string, RoomRosterEntry>();
  for (const entry of entries) {
    const held = byUser.get(entry.user_id);
    if (!held) {
      byUser.set(entry.user_id, entry);
      continue;
    }
    if (!isRoomStaff(held.role) && isRoomStaff(entry.role)) byUser.set(entry.user_id, entry);
  }
  return byUser.size === entries.length ? entries : [...byUser.values()];
}

/**
 * The wordmark over a member card, or null for no wordmark at all.
 *
 * DERIVED, not just read: in an `alumni` room every member is an alum, whatever
 * their membership row still says. A cohort's rows are not rewritten when the
 * season ends (the phase flips on `cohort_room_configs`, not on 200 membership
 * rows), so reading `role` alone would leave an alumni room full of people
 * marked as current members.
 */
export function memberWordmark(
  role: string | null | undefined,
  phase: RoomPhase | null | undefined,
): string | null {
  return role === "alumni" || phase === "alumni" ? "ALUMNI" : null;
}

/**
 * What to print where a name goes.
 *
 * `full_name` is nullable on `public.users` and a nameless card reads as broken.
 * The fallback is the person's ROLE, which is the only other thing the roster
 * knows about them, so nothing is invented.
 */
export function rosterDisplayName(entry: RoomRosterEntry): string {
  const trimmed = entry.full_name?.trim();
  if (trimmed) return trimmed;
  if (entry.role === "mentor") return "Mentor";
  if (entry.role === "host") return "Host";
  return "Member";
}

/**
 * The one serif line on a staff card: what they do, else where they are, else
 * nothing at all.
 */
export function rosterOneLiner(entry: RoomRosterEntry): string | null {
  return entry.occupation?.trim() || entry.city?.trim() || null;
}

/**
 * The count line, in one place so the page and the lobby cannot word it two
 * ways. Counts COHORT-MATES, matching `get_cohort_room.roster_count` (which
 * narrows the same predicate to non-staff), so this number and the "In the room"
 * card on the room's home never disagree.
 */
export function rosterCountLine(count: number): string {
  return `${count} in this room`;
}

export interface RosterGridProps {
  /** Cohort-mate rows (`member` / `alumni`). Staff belong on `MentorCard`. */
  entries: RoomRosterEntry[];
  /** The room's phase. An `alumni` room derives the wordmark for every member. */
  phase?: RoomPhase | null;
  /** Cards per reveal. Defaults to `ROSTER_PAGE_SIZE`. */
  pageSize?: number;
  className?: string;
}

const RosterGrid = ({ entries, phase, pageSize = ROSTER_PAGE_SIZE, className }: RosterGridProps) => {
  const [revealed, setRevealed] = useState(pageSize);

  // Clamped rather than reset: a refetch that adds a member must not collapse a
  // grid the reader has already expanded back to the first page.
  const shown = useMemo(
    () => entries.slice(0, Math.max(0, Math.min(revealed, entries.length))),
    [entries, revealed],
  );
  const remaining = entries.length - shown.length;

  return (
    <div className={cn("space-y-3", className)}>
      <p
        data-testid="roster-count"
        className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground"
      >
        {rosterCountLine(entries.length)}
      </p>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {shown.map((entry) => {
          const name = rosterDisplayName(entry);
          const wordmark = memberWordmark(entry.role, phase);
          const city = entry.city?.trim() || null;
          const occupation = entry.occupation?.trim() || null;

          return (
            <li
              key={entry.user_id}
              data-testid="roster-member"
              className="flex items-start gap-2.5 rounded-xl border border-border bg-surface p-3"
            >
              <InitialsAvatar
                name={name}
                photoUrl={entry.avatar_url}
                size={36}
                className="shrink-0"
              />
              <div className="min-w-0">
                {wordmark && (
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-room-accent">
                    {wordmark}
                  </p>
                )}
                <p className="break-words text-sm leading-snug text-foreground">{name}</p>
                {/* Two lines, not one joined string: a missing value must leave
                    no element behind, and no separator hanging off the other. */}
                {city && (
                  <p className="break-words text-xs leading-snug text-muted-foreground">{city}</p>
                )}
                {occupation && (
                  <p className="break-words text-xs leading-snug text-muted-foreground">
                    {occupation}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {remaining > 0 && (
        <button
          type="button"
          data-testid="roster-show-more"
          onClick={() => setRevealed((current) => current + pageSize)}
          className="focus-ring pressable w-full rounded-xl border border-border bg-surface py-3 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
        >
          Show {Math.min(pageSize, remaining)} more
        </button>
      )}
    </div>
  );
};

export default RosterGrid;
