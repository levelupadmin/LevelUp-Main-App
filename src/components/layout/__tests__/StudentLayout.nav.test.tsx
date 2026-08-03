import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, within, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CohortRoomSummary } from "@/hooks/useCohortRooms";

/**
 * R1-T4 — the My Cohorts nav slot, and the two things that could go wrong with it.
 *
 * `StudentLayout` renders on EVERY student screen, so the first half of this file
 * is not about the new feature at all: it pins the FLAG-OFF render of both
 * "Main navigation" trees against HTML captured from the unmodified component
 * before R1-T4 touched it (see `DESKTOP_NAV_FLAG_OFF` / `MOBILE_NAV_FLAG_OFF`
 * below). The claim "flag off = zero behavioural diff" is then a string equality,
 * not an opinion — and it covers the mobile drawer too, which had no cohort entry
 * at all and must still have none.
 *
 * Zero diff includes the NETWORK: `useMyCohortRooms()` is argument-less and
 * `enabled: !!user.id`, so calling it from the layout would fire
 * `get_my_cohort_rooms()` for every signed-in student on every page load with the
 * surface down. `RoomNavSlot` owns that call and is mounted only when the
 * shared server-authoritative context is enabled, so `h.roomQueryCalls` is the
 * proof: 0 while disabled. (`useCohortRooms.ts`
 * is by contract the ONLY caller of that RPC, so not calling the hook is not
 * calling the RPC.)
 *
 * The second half is the slot's own contract — 0 rooms hidden, 1 room wearing its
 * `wordmark_text`, >1 becoming "My Cohorts" — plus the case the whole task exists
 * for: a `pre_start` membership with NO authored weeks, which the legacy
 * `useActiveCohort` link required and therefore never showed.
 *
 * The `/rooms` list assertions live here rather than in a page-level file because
 * R1-T4 is allotted this one spec file; they are grouped in their own describe.
 *
 * Everything below 44px-related is asserted as the utility class the element
 * carries — jsdom does no layout, so the real measurement is recorded in the
 * task report, taken in a browser at 360×740 and 375×812.
 */

/* ── Harness state (hoisted so the vi.mock factories can close over it) ───── */

const h = vi.hoisted(() => ({
  /** What `useMyCohortRooms()` hands back. */
  rooms: [] as unknown[],
  /** How many times the hook was CALLED — must be 0 with the flag off. */
  roomQueryCalls: 0,
  /** The legacy `useActiveCohort` answer. */
  activeCohortId: null as string | null,
  /** The one resolved context value shared with App's route table. */
  roomsSurfaceEnabled: false,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "user-1" },
    profile: { full_name: "Test Student", member_number: 4242, role: "student", avatar_url: null },
    signOut: vi.fn(),
  }),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [],
    unreadCount: 0,
    loading: false,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
  }),
}));

vi.mock("@/hooks/useStudio", () => ({ useStudioEnabled: () => ({ data: false }) }));

vi.mock("@/hooks/useActiveCohort", () => ({
  useActiveCohort: () => ({ offeringId: h.activeCohortId, loading: false }),
}));

vi.mock("@/contexts/CohortRoomsSurfaceContext", () => ({
  useCohortRoomsSurfaceValue: () => ({ enabled: h.roomsSurfaceEnabled, pending: false }),
}));

// The ONE room data boundary. Counting calls here is what makes the "no query
// with the flag down" claim mechanical.
vi.mock("@/hooks/useCohortRooms", () => ({
  useMyCohortRooms: () => {
    h.roomQueryCalls += 1;
    return {
      data: h.rooms,
      isPending: false,
      isFetching: false,
      isError: false,
      denied: false,
      refetch: vi.fn(),
    };
  },
}));

// Imported AFTER the mocks are registered. `resolveTheme` is deliberately NOT
// mocked — the nameplate must come out of the real R0 helper.
import StudentLayout from "../StudentLayout";
import MyCohortsPage from "@/pages/MyCohortsPage";

/* ── Fixtures ─────────────────────────────────────────────────────────────── */

const makeRoom = (over: Partial<CohortRoomSummary> = {}): CohortRoomSummary => ({
  offering_id: "off-1",
  offering_title: "Filmmaking with Nelson",
  room_slug: "filmmaking-s1",
  batch_id: "batch-1",
  batch_name: "Batch 1",
  role: "member",
  phase: "live",
  theme: { wordmark_text: "SEASON ONE" },
  modules: null,
  total_weeks: 12,
  current_week: 4,
  next_session_at: null,
  next_due_at: null,
  unseen_announcements: 0,
  ...over,
});

const renderLayout = (path = "/profile") =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <StudentLayout>
        <div>content</div>
      </StudentLayout>
    </MemoryRouter>,
  );

/** Both "Main navigation" trees: [0] the desktop sidebar, [1] the open drawer. */
const openDrawer = async () => {
  await act(async () => {
    fireEvent.click(screen.getByLabelText("Open menu"));
  });
  return screen.getAllByRole("navigation", { name: "Main navigation" });
};

const desktopNav = () => screen.getAllByRole("navigation", { name: "Main navigation" })[0];

beforeEach(() => {
  h.rooms = [];
  h.roomQueryCalls = 0;
  h.activeCohortId = null;
  h.roomsSurfaceEnabled = false;
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/* ────────────────────────────────────────────────────────────────────────────
 * 1. Flag OFF — zero behavioural diff, asserted against captured HTML
 * ──────────────────────────────────────────────────────────────────────────── */

describe("StudentLayout nav — flag OFF is byte-identical", () => {
  it("renders the desktop sidebar exactly as it did before R1-T4", () => {
    h.activeCohortId = "off-legacy-1";
    // Non-empty on purpose: with the flag down the slot must be absent because
    // of the FLAG, not because there happened to be no rooms.
    h.rooms = [makeRoom(), makeRoom({ offering_id: "off-2", room_slug: "writing-s1" })];

    renderLayout();

    expect(desktopNav().outerHTML).toBe(DESKTOP_NAV_FLAG_OFF);
  });

  it("renders the mobile drawer nav exactly as it did before R1-T4", async () => {
    h.activeCohortId = "off-legacy-1";
    h.rooms = [makeRoom()];

    renderLayout();
    const navs = await openDrawer();

    expect(navs).toHaveLength(2);
    expect(navs[1].outerHTML).toBe(MOBILE_NAV_FLAG_OFF);
  });

  it("treats the mobile drawer as a focus-managed, scrollable dialog", async () => {
    renderLayout();
    await openDrawer();

    const drawer = screen.getByRole("dialog", { name: "Main menu" });
    expect(drawer).toHaveAttribute("aria-modal", "true");
    expect(within(drawer).getByRole("navigation", { name: "Main navigation" }).className)
      .toContain("overflow-y-auto");
    await waitFor(() => expect(screen.getByRole("button", { name: "Close menu" })).toHaveFocus());
  });

  it("fires no get_my_cohort_rooms() query at all", async () => {
    h.activeCohortId = "off-legacy-1";
    h.rooms = [makeRoom()];

    renderLayout();
    await openDrawer();

    expect(h.roomQueryCalls).toBe(0);
  });

  it("keeps the legacy /cohort link and adds nothing to the drawer", async () => {
    h.activeCohortId = "off-legacy-1";
    h.rooms = [makeRoom()];

    renderLayout();
    const navs = await openDrawer();

    expect(within(navs[0]).getByRole("link", { name: "My Cohort" })).toHaveAttribute(
      "href",
      "/cohort/off-legacy-1",
    );
    expect(within(navs[1]).queryByRole("link", { name: /cohort/i })).toBeNull();
    expect(screen.queryByRole("link", { name: "SEASON ONE" })).toBeNull();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Flag ON — the slot's three states
 * ──────────────────────────────────────────────────────────────────────────── */

describe("StudentLayout nav — flag ON", () => {
  beforeEach(() => {
    h.roomsSurfaceEnabled = true;
  });

  it("hides the slot entirely for 0 rooms — including the legacy link", () => {
    h.activeCohortId = "off-legacy-1";
    h.rooms = [];

    renderLayout();

    expect(screen.queryByRole("link", { name: "My Cohorts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "My Cohort" })).toBeNull();
    // Only the three base nav items remain in the sidebar.
    expect(within(desktopNav()).getAllByRole("link")).toHaveLength(3);
  });

  it("shows the room's own wordmark_text for exactly 1 room, linking /room/:slug", async () => {
    h.rooms = [makeRoom()];

    renderLayout();
    const navs = await openDrawer();

    for (const nav of navs) {
      const link = within(nav).getByRole("link", { name: "SEASON ONE" });
      expect(link).toHaveAttribute("href", "/room/filmmaking-s1");
      // NOT the literal legacy label.
      expect(within(nav).queryByRole("link", { name: "My Cohort" })).toBeNull();
      expect(within(nav).queryByRole("link", { name: "My Cohorts" })).toBeNull();
    }
  });

  it("falls back to the offering title when the room has no wordmark", () => {
    h.rooms = [makeRoom({ theme: null })];

    renderLayout();

    expect(
      within(desktopNav()).getByRole("link", { name: "Filmmaking with Nelson" }),
    ).toHaveAttribute("href", "/room/filmmaking-s1");
  });

  it("links a room with no config row to its legacy /cohort address", () => {
    h.rooms = [makeRoom({ room_slug: null, offering_id: "off-9" })];

    renderLayout();

    expect(within(desktopNav()).getByRole("link", { name: "SEASON ONE" })).toHaveAttribute(
      "href",
      "/cohort/off-9",
    );
  });

  it('shows "My Cohorts" → /rooms for more than 1 room', async () => {
    h.rooms = [
      makeRoom(),
      makeRoom({ offering_id: "off-2", room_slug: "writing-s1", theme: { wordmark_text: "WRITING" } }),
    ];

    renderLayout();
    const navs = await openDrawer();

    for (const nav of navs) {
      expect(within(nav).getByRole("link", { name: "My Cohorts" })).toHaveAttribute(
        "href",
        "/rooms",
      );
      expect(within(nav).queryByRole("link", { name: "SEASON ONE" })).toBeNull();
    }
  });

  // THE POINT OF THE TASK: the legacy link required at least one authored
  // cohort_week, so a paid-up student with no curriculum yet saw nothing.
  it("SHOWS a pre_start room with no weeks and no batch (the invisible window)", async () => {
    h.activeCohortId = null; // exactly what useActiveCohort returns for this student
    h.rooms = [
      makeRoom({
        phase: "pre_start",
        total_weeks: 0,
        current_week: null,
        batch_id: null,
        batch_name: null,
      }),
    ];

    renderLayout();
    const navs = await openDrawer();

    for (const nav of navs) {
      expect(within(nav).getByRole("link", { name: "SEASON ONE" })).toHaveAttribute(
        "href",
        "/room/filmmaking-s1",
      );
    }
  });

  it("marks the slot active on a room route and keeps a ≥44px target", async () => {
    h.rooms = [makeRoom()];

    renderLayout("/room/filmmaking-s1");
    const navs = await openDrawer();

    for (const nav of navs) {
      const link = within(nav).getByRole("link", { name: "SEASON ONE" });
      expect(link.className).toContain("min-h-[44px]");
      expect(link.className).toContain("bg-cream/[0.08]");
    }
  });

  it("closes the drawer when the mobile slot is tapped", async () => {
    h.rooms = [makeRoom()];

    renderLayout();
    const navs = await openDrawer();
    expect(document.querySelector('[data-overlay-open="true"]')).not.toBeNull();

    await act(async () => {
      fireEvent.click(within(navs[1]).getByRole("link", { name: "SEASON ONE" }));
    });

    // The drawer must UNMOUNT, not just fade: AnimatePresence holds the subtree
    // through the exit glide, so "gone" is the only end state worth asserting.
    // This is the assertion that caught a real bug — with a shared framer
    // `layoutId` on the slot's active bar (the first implementation) the bar
    // mounted inside the very subtree AnimatePresence was exiting,
    // `onExitComplete` never fired, and the drawer was STILL mounted with
    // `pointer-events: auto` over the page 3 SECONDS later. The bar is a static
    // span for exactly that reason; the exit now settles in ~600ms.
    await waitFor(
      () => {
        expect(screen.getAllByRole("navigation", { name: "Main navigation" })).toHaveLength(1);
      },
      { timeout: 2000 },
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 3. /rooms — the list the slot points at
 * ──────────────────────────────────────────────────────────────────────────── */

describe("MyCohortsPage — the room cards", () => {
  const renderPage = () =>
    render(
      <MemoryRouter>
        <MyCohortsPage />
      </MemoryRouter>,
    );

  it("lists a two-room fixture in the RPC's order, alumni on their own shelf", () => {
    h.rooms = [
      makeRoom({ theme: { wordmark_text: "SEASON ONE" } }),
      makeRoom({
        offering_id: "off-2",
        room_slug: "writing-s1",
        theme: { wordmark_text: "THE WRITING ROOM" },
      }),
      makeRoom({
        offering_id: "off-3",
        room_slug: "editing-s0",
        phase: "alumni",
        theme: { wordmark_text: "EDITING CLASS OF 24" },
      }),
    ];

    renderPage();

    const names = screen.getAllByRole("link").map((link) => link.textContent);
    expect(names[0]).toContain("SEASON ONE");
    expect(names[1]).toContain("THE WRITING ROOM");
    // Alumni sit below, under their own heading.
    expect(names[2]).toContain("EDITING CLASS OF 24");
    expect(screen.getByRole("heading", { name: "Alumni" })).toBeInTheDocument();
  });

  it("renders a pre_start room with no weeks without inventing a week line", () => {
    h.rooms = [makeRoom({ phase: "pre_start", total_weeks: 0, current_week: null })];

    renderPage();

    expect(screen.getByText("Starting soon")).toBeInTheDocument();
    expect(screen.queryByText(/Week \d+ of/)).toBeNull();
  });

  it("counts down to next_session_at — minutes inside the hour, date beyond", () => {
    const now = Date.now();
    h.rooms = [
      makeRoom({ next_session_at: new Date(now + 25 * 60_000).toISOString() }),
      makeRoom({
        offering_id: "off-2",
        room_slug: "writing-s1",
        theme: { wordmark_text: "WRITING" },
        next_session_at: new Date(now + 9 * 24 * 60 * 60_000).toISOString(),
      }),
    ];

    renderPage();

    expect(screen.getByText(/Starts in 2[45] min/)).toBeInTheDocument();
    expect(screen.getByText(/^Next · /)).toBeInTheDocument();
  });

  it("says nothing at all when there is no next session", () => {
    h.rooms = [makeRoom({ next_session_at: null })];

    renderPage();

    expect(screen.queryByText(/Starts in/)).toBeNull();
    expect(screen.queryByText(/^Next · /)).toBeNull();
  });

  it("shows the serif empty state for a student with no rooms", () => {
    h.rooms = [];

    renderPage();

    expect(screen.getByText("No cohort yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See live cohorts" })).toHaveAttribute(
      "href",
      "/learn?seg=live",
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * The captured baselines
 *
 * Taken from `StudentLayout.tsx` at commit-time BEFORE R1-T4 edited it, by
 * rendering the component with `activeCohortId = "off-legacy-1"`, the flag unset
 * and the route `/profile` (a route no nav item matches, so no framer
 * `layoutId` bar is mounted and the markup is deterministic), then dumping
 * `getAllByRole('navigation', { name: 'Main navigation' })[n].outerHTML`.
 *
 * If a future change to the desktop sidebar or the drawer is INTENDED, these
 * strings have to be re-captured deliberately — which is the point.
 * ──────────────────────────────────────────────────────────────────────────── */

const DESKTOP_NAV_FLAG_OFF =
  '<nav aria-label="Main navigation" class="flex-1 px-3 space-y-1"><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-surface" href="/home"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-house h-[18px] w-[18px]"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>Home</a><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-surface" href="/learn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open h-[18px] w-[18px]"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>Learn</a><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-muted-foreground hover:text-foreground hover:bg-surface" href="/community"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square h-[18px] w-[18px]"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>Community</a><div class="my-3 border-t border-border"></div><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 text-cream hover:bg-cream/[0.06]" href="/cohort/off-legacy-1"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sparkles h-[18px] w-[18px]"><path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"></path><path d="M20 3v4"></path><path d="M22 5h-4"></path><path d="M4 17v2"></path><path d="M5 18H3"></path></svg>My Cohort</a></nav>';

const MOBILE_NAV_FLAG_OFF =
  '<nav aria-label="Main navigation" class="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4"><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 text-muted-foreground hover:text-foreground" href="/home"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-house h-[18px] w-[18px]"><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"></path><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>Home</a><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 text-muted-foreground hover:text-foreground" href="/learn"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-book-open h-[18px] w-[18px]"><path d="M12 7v14"></path><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path></svg>Learn</a><a class="relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cream focus-visible:ring-offset-2 text-muted-foreground hover:text-foreground" href="/community"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-message-square h-[18px] w-[18px]"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>Community</a></nav>';
