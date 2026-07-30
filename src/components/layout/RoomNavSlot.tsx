import { Link, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { resolveTheme } from "@/lib/room";
import { cn } from "@/lib/utils";
import { useMyCohortRooms, type CohortRoomSummary } from "@/hooks/useCohortRooms";

/**
 * RoomNavSlot — the one nav entry that makes the cohort rooms reachable (R1-T4).
 *
 * Three states, and no fourth:
 *   · 0 memberships → NOTHING. Not a disabled row, not an empty "My Cohorts"
 *     link into a page that would only say "No cohort yet."
 *   · exactly 1     → that room's own `wordmark_text`, linking straight to it.
 *     The nameplate is the point: a student in one cohort should see the cohort's
 *     name in their sidebar, not the generic word "Cohort".
 *   · more than 1   → "My Cohorts", linking `/rooms`.
 *
 * ── It shows from `pre_start` ──────────────────────────────────────────────
 * There is deliberately NO phase filter and NO `total_weeks > 0` condition here.
 * The hook returns every membership the RPC grants, `pre_start` included, and
 * that is the whole reason this slot exists: the legacy `useActiveCohort` link
 * it stands beside required at least one authored `cohort_week`, so a student who
 * had paid but whose curriculum was not written yet saw no cohort at all. That
 * enrolled-but-invisible window is the bug; re-adding either condition would
 * re-open it.
 *
 * ── Why this is its own component ──────────────────────────────────────────
 * `useMyCohortRooms()` is `enabled: !!user.id` internally and takes no
 * arguments, so calling it from `StudentLayout` — which renders on every student
 * screen — would fire `get_my_cohort_rooms()` for every signed-in student on
 * every page load even with `VITE_COHORT_ROOMS` down. "Flag off = zero
 * behavioural diff" includes the network. StudentLayout therefore mounts this
 * child only when the flag is on, and the query cannot run before then. The
 * conditional mount is what keeps that true without moving a hook call into a
 * condition: the hooks inside this component always run, the component itself is
 * what does or does not exist.
 *
 * Flag reading stays in StudentLayout. This component does not know the flag
 * exists, so nothing here can mistake a surface flag for authorisation
 * (NFR-CONFIG-2) — R0's RLS gates the data either way.
 */

export type RoomNavSlotVariant = "desktop" | "mobile";

/**
 * Where the slot points. A room with no `room_slug` has no config row and
 * therefore no address of its own, so it links to the legacy
 * `/cohort/:offering_id` page rather than to an invented slug. Deliberately a
 * local copy of the same two lines in `MyCohortsPage`: the shared home for it
 * would be `src/lib/room.ts`, which is R0-shipped and out of scope, and a page
 * chunk is not something the always-loaded layout should import from.
 */
const roomHref = (room: CohortRoomSummary) =>
  room.room_slug ? `/room/${room.room_slug}` : `/cohort/${room.offering_id}`;

interface Props {
  /** Which nav renders it — picks the sibling styling and the LayoutGroup id. */
  variant: RoomNavSlotVariant;
  /** Mobile drawer: close the drawer on tap, exactly as its siblings do. */
  onNavigate?: () => void;
}

const RoomNavSlot = ({ variant, onNavigate }: Props) => {
  const location = useLocation();
  const { data } = useMyCohortRooms();

  const rooms = data ?? [];
  // Nothing to reach → no slot. Every hook above has already run, so this early
  // return cannot shift hook order between renders.
  if (rooms.length === 0) return null;

  const only = rooms.length === 1 ? rooms[0] : null;
  // `resolveTheme` has already trimmed, length-capped and contrast-floored the
  // config row, so both the label and the accent render as-is.
  const theme = only ? resolveTheme(only) : null;
  const to = only ? roomHref(only) : "/rooms";
  const label = only
    ? (theme?.wordmarkText ?? (only.offering_title || "Cohort room"))
    : "My Cohorts";

  // `/cohort/` is in the set because a room with no config row still lives
  // there, so the slot must read as active when it lands you on the old page.
  const path = location.pathname;
  const active =
    path === "/rooms" ||
    path.startsWith("/rooms/") ||
    path.startsWith("/room/") ||
    path.startsWith("/cohort/");

  return (
    <>
      <div className="my-3 border-t border-border" />
      <Link
        to={to}
        onClick={() => onNavigate?.()}
        className={cn(
          "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 min-h-[44px]",
          variant === "mobile" &&
            "focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2",
          active
            ? "text-foreground bg-cream/[0.08] font-medium"
            : "text-cream hover:bg-cream/[0.06]"
        )}
      >
        {active && (
          // A STATIC bar, exactly like the legacy `/cohort` slot beside it — NOT
          // a framer `layoutId` element. Sharing the sibling nav items'
          // `layoutId` was tried first and measurably broke the mobile drawer:
          // tapping the slot mounts this bar in the very subtree AnimatePresence
          // is exiting, the shared-layout animation never settles, `onExitComplete`
          // never fires and the drawer stays mounted with `pointer-events: auto`
          // over the page (reproduced in StudentLayout.nav.test.tsx — the drawer
          // was still open 600ms after the tap). A 3px bar is not worth a stuck
          // overlay, and the sibling items keep their glide untouched.
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-cream" />
        )}
        <Sparkles
          className="h-[18px] w-[18px] shrink-0"
          // One room → wear its colour. Contrast-floored by `resolveTheme`
          // against `--surface-2`, the lightest surface the app draws on, so it
          // clears AA on the sidebar's canvas by construction.
          style={theme ? { color: `hsl(${theme.accentTextVar})` } : undefined}
        />
        <span className="min-w-0 truncate">{label}</span>
      </Link>
    </>
  );
};

export default RoomNavSlot;
