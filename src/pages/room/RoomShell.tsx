import { useEffect, useMemo, type ReactNode } from "react";
import { NavLink, Navigate, Outlet, useParams } from "react-router-dom";
import { moduleEnabled, resolveTheme, type RoomModuleKey } from "@/lib/room";
import { cn } from "@/lib/utils";
import usePageTitle from "@/hooks/usePageTitle";
import {
  isRoomAccessDenied,
  resolveRoomOffering,
  useCohortRoom,
  useMyCohortRooms,
  useRoomView,
  type RoomOutletContext,
} from "@/hooks/useCohortRooms";
import { RoomLoadingState, RoomPrivateState, RoomUnavailableState } from "./RoomStates";
import RoomThemeProvider from "@/components/room/RoomThemeProvider";
import RoomEntrance from "@/components/room/RoomEntrance";
import RoomMasthead from "@/components/room/RoomMasthead";
import RoomSwitcher from "@/components/room/RoomSwitcher";

/**
 * RoomShell — the layout route behind `/room/:slug`.
 *
 * It resolves the slug through the caller's own memberships, opens the room
 * envelope, mounts the theme provider ONCE, and renders the masthead, the
 * switcher and the module rail around an `<Outlet/>`.
 *
 * THREE ACCESS TIERS, NOT TWO
 * ---------------------------
 * `get_cohort_room` answers with `access: 'member' | 'pre_member'` or it RAISES.
 * A `pre_member` is a LOBBY visitor: neither a full member nor a denied one. The
 * server has already stripped everything outside the lobby whitelist, so the
 * lobby renders the room CHROME on the redacted payload and never sees an error
 * state — it simply has no module rail, because every module the rail would
 * link to is one the redaction emptied (recordings, weeks, roster).
 */

/** The module rail, in the order the room reads. */
const ROOM_TABS: ReadonlyArray<{ to: string; label: string; module: RoomModuleKey }> = [
  { to: "weeks", label: "Weeks", module: "weeks" },
  { to: "screenings", label: "Screenings", module: "recordings" },
  { to: "feed", label: "Feed", module: "feed" },
  { to: "people", label: "People", module: "roster" },
  { to: "resources", label: "Resources", module: "resources" },
];

/** Remembered so the nav slot can reopen the room the student was last in. */
const LAST_ROOM_KEY = "lu_last_room";

const tabClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    "focus-ring pressable inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors",
    isActive
      ? "border-room-accent/40 bg-room-accent/10 text-room-accent"
      : "border-border text-muted-foreground hover:text-foreground",
  );

const RoomShell = () => {
  const { slug } = useParams<{ slug: string }>();
  const { status, room, envelope, rooms } = useRoomView(slug);

  // The config row is authoritative; the membership row's copy of `theme` is the
  // same jsonb and covers the window before the envelope lands. Neither present
  // (an offering with no config row) resolves to the documented defaults.
  const theme = useMemo(
    () => resolveTheme(envelope?.config ?? room ?? null),
    [envelope?.config, room],
  );

  usePageTitle(theme.wordmarkText ?? room?.offeringTitle ?? "Room");

  useEffect(() => {
    if (status !== "ready" || !slug) return;
    try {
      localStorage.setItem(LAST_ROOM_KEY, slug);
    } catch {
      // Private mode / locked-down WebView — the room still opens.
    }
  }, [status, slug]);

  const tabs = useMemo(() => {
    // The lobby's rail is empty by construction: every module it could link to
    // is redacted server-side for a pre_member, and a tab that opens an empty
    // page is exactly the "dead module" the brief forbids.
    if (!envelope || envelope.isLobby) return [];
    return ROOM_TABS.filter((tab) => moduleEnabled(envelope.config, tab.module));
  }, [envelope]);

  if (status === "loading") return <RoomLoadingState />;
  if (status === "denied") return <RoomPrivateState />;
  if (status !== "ready" || !room || !envelope) return <RoomUnavailableState />;

  const outletContext: RoomOutletContext = { room, envelope, theme, rooms };
  const weeksHref = `weeks/${room.currentWeek ?? 1}`;

  return (
    <RoomThemeProvider theme={theme}>
      <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 space-y-6">
        {/* R1-T5 owns the single-vs-many behaviour: one membership renders the
            nameplate as static text, more than one turns it into a menu. */}
        <RoomSwitcher rooms={rooms} activeSlug={room.roomSlug ?? ""} />

        {/* R1-T3: the entrance plays once per session per room and wraps the
            masthead so the art fade and the nameplate rise stay one gesture. */}
        <RoomEntrance slug={room.roomSlug ?? room.offeringId}>
          <RoomMasthead
            theme={theme}
            phase={room.phase}
            currentWeek={room.currentWeek}
            totalWeeks={room.totalWeeks}
            offeringTitle={room.offeringTitle}
            nextSessionAt={room.nextSessionAt}
          />
        </RoomEntrance>

        {tabs.length > 0 && (
          <nav
            aria-label="Room sections"
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0"
          >
            <NavLink to="." end className={tabClasses}>
              Home
            </NavLink>
            {tabs.map((tab) => (
              <NavLink
                key={tab.to}
                to={tab.to === "weeks" ? weeksHref : tab.to}
                className={tabClasses}
              >
                {tab.label}
              </NavLink>
            ))}
          </nav>
        )}

        <Outlet context={outletContext} />
      </div>
    </RoomThemeProvider>
  );
};

export default RoomShell;

/* ────────────────────────────────────────────────────────────────────────────
 * The `/cohort/:offeringId` redirect shim (R-D9)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * `/cohort/:offeringId` → `/room/:slug`, when and only when a slug resolves.
 *
 * 🔴 THIS ROUTE IS IN PEOPLE'S INBOXES. Notification emails link
 * `/cohort/{{offering_id}}` and those mails are already sent, so every path
 * through here that is not a redirect MUST land on the legacy dashboard the
 * link has always opened. The shim adds an exit, never a wall.
 *
 * Resolution order:
 *   1. The caller's own memberships (`get_my_cohort_rooms`) — the common case,
 *      already cached by the nav slot, and costs no extra round trip.
 *   2. `get_cohort_room(uuid)` — catches the callers who legitimately hold the
 *      room but own no membership ROW, i.e. admins and offering-wide staff, for
 *      whom the membership list is empty by design. Its `config.slug` is the
 *      only other slug source a client has.
 *   3. Anything else → `fallback`.
 *
 * ON THE 42501 SPLIT. `get_cohort_room` raises `42501` for a denied caller and
 * returns a payload otherwise, so the split IS available here (unlike the slug
 * route, where private and absent are indistinguishable). This shim consumes it
 * to STOP — no retry, no second probe — and then hands back to the legacy page.
 * It deliberately does NOT render "this room is private", because a `42501`
 * here does not mean the visitor lacks access to the cohort: membership rows
 * are only minted for offerings that already have a `cohort_room_configs` row
 * (backbone.sql:868-875), so every enrolled student of a cohort that has not
 * been given a room yet gets a `42501` from this RPC. Turning that into a
 * private wall would strand exactly the students R-D9 exists to protect. The
 * distinction that matters is kept — denied stops, empty falls through — it is
 * just not spent on a wall.
 */
export const CohortRoomRedirect = ({ fallback }: { fallback: ReactNode }) => {
  const { offeringId } = useParams<{ offeringId: string }>();
  const memberships = useMyCohortRooms();

  const membership = resolveRoomOffering(memberships.data, offeringId);
  const membershipSettled = !memberships.isPending || !memberships.isFetching;

  // Probe only once the membership list has settled without a routable slug.
  const shouldProbe = membershipSettled && !membership?.roomSlug && !!offeringId;
  const probe = useCohortRoom(shouldProbe ? offeringId : null);

  if (membership?.roomSlug) {
    return <Navigate to={`/room/${membership.roomSlug}`} replace />;
  }
  if (!membershipSettled) return <RoomLoadingState />;

  if (shouldProbe) {
    // A denial is terminal (isRoomAccessDenied short-circuits the retry), so
    // stop waiting on it. A payload without a slug means the offering has no
    // room to send them to. Both land on the page the email promised.
    const denied = probe.isError && isRoomAccessDenied(probe.error);
    if (!denied && probe.isPending && probe.isFetching) return <RoomLoadingState />;
    if (!probe.isError && probe.data?.slug) {
      return <Navigate to={`/room/${probe.data.slug}`} replace />;
    }
  }

  return <>{fallback}</>;
};
