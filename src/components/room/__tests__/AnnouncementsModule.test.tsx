import { type ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * AnnouncementsModule — R3-T1's acceptances that would otherwise be a manual check.
 *
 * THE LOAD-BEARING ONE IS THE COMPOSER. The brief's acceptance is "a member
 * fixture sees no composer", and the thing that makes that assertion worth
 * writing is that it is NOT the security boundary: `ann_host_insert`
 * (20260729100100) is, and it would refuse a member's insert whatever this
 * component renders. What these tests pin is that the client does not DANGLE a
 * form in front of someone the database will refuse, and that it still draws it
 * for the two room roles that can post plus an admin, who holds every room
 * through `is_admin()` and carries no room role at all. The same argument covers
 * the two AMEND verbs (retract, pin/unpin), which R0 built `ann_host_retract`
 * for and which nothing else in the product exposes.
 *
 * THE SECOND IS THAT FOUR ANSWERS STAY FOUR. Loading, refused, failed and empty
 * are different things. "Nothing on the board yet." must not be what a dropped
 * request looks like, and it must not be what a 42501 looks like either:
 * useCohortRooms.ts's header states the rule ("'denied' and 'empty' are
 * genuinely different answers"), and a board that breaks it tells a student
 * whose membership just moved that their cohort has gone quiet.
 *
 * THE THIRD IS THE MOUNT POINT AND THE WATERMARK, and it renders `RoomHome`
 * rather than this module (§5 below). There is no announcements ROUTE and no
 * announcements tab, so `RoomHome` is the board's only mount point and a test
 * that only ever mounted `<AnnouncementsModule/>` directly would keep passing if
 * the module became dead code. The watermark is the other half: it is brand-new
 * client code writing a table no client wrote before, and it is a claim that the
 * WHOLE board has been seen — so the cases below pin who may make that claim
 * (the surface holding the rows), who may not (a failed read), and the one case
 * `RoomHome` still owns (a cohort with no board at all).
 *
 * ── What is deliberately NOT tested here ──────────────────────────────────
 * The fan-out, the volume cap, the retract cleanup and the batch scoping are
 * SERVER behaviour and are proven in qa-harness/announcement-fanout.sql against
 * a real Postgres. A mocked client cannot prove a trigger, and a test that
 * pretended to would be the most dangerous file in this task.
 */

const rpc = vi.fn();
const insert = vi.fn();
const upsert = vi.fn();
const update = vi.fn();
const updateEq = vi.fn();
const maybeSingle = vi.fn();
/**
 * One shim for the four shapes this round's surfaces use: the composer's
 * `insert`, the amend verbs' `update(...).eq("id", ...)`, the watermark's
 * `upsert`, and `RoomHome`'s `offerings` read (`useRoomOfferingMeta`). The table
 * name is asserted through `from` itself, which is what keeps "the watermark
 * went to cohort_room_seen" checkable.
 */
const from = vi.fn((_table: string) => ({
  insert,
  upsert,
  update: (values: Record<string, unknown>) => {
    update(values);
    return { eq: (column: string, value: string) => updateEq(column, value) };
  },
  select: () => ({ eq: () => ({ maybeSingle }) }),
}));
const auth = vi.hoisted(() => ({
  value: { user: { id: "mentor-1" }, profile: { role: "student" } } as {
    user: { id: string } | null;
    profile: { role: string } | null;
  },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => rpc(...args),
    from: (table: string) => from(table),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => auth.value,
}));

vi.mock("@/lib/haptics", () => ({ tapTick: vi.fn(() => Promise.resolve()) }));

/**
 * Radix's Checkbox measures its hidden bubble input with a ResizeObserver, and
 * jsdom ships none. `src/test/setup.ts` polyfills `matchMedia` for the whole
 * suite but not this, and that file is shared, so the stub is local: it is the
 * composer's pin toggle that needs it and nothing else in this round does.
 */
class NoopResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal("ResizeObserver", NoopResizeObserver);

const {
  default: AnnouncementsModule,
  authorWordmark,
  pinnedFirst,
  relativeNoticeDate,
} = await import("@/components/room/AnnouncementsModule");
const { default: RoomClockProvider } = await import("@/components/room/RoomClockProvider");
const { default: RoomHome } = await import("@/pages/room/RoomHome");
const { cohortRoomsKey, ROOM_ANNOUNCEMENTS_PAGE_SIZE } = await import(
  "@/hooks/useCohortRooms"
);

type RoomAnnouncementDetail = import("@/hooks/useCohortRooms").RoomAnnouncementDetail;
type RoomAnnouncement = import("@/hooks/useCohortRooms").RoomAnnouncement;
type CohortRoomEnvelope = import("@/hooks/useCohortRooms").CohortRoomEnvelope;
type CohortRoomSummary = import("@/hooks/useCohortRooms").CohortRoomSummary;
type RoomConfigRow = import("@/hooks/useCohortRooms").RoomConfigRow;

const OFFERING = "11111111-1111-1111-1111-111111111111";

/** Fixed wall clock: Wed 5 Aug 2026, 12:00 IST. Every fixture hangs off it. */
const NOW = Date.parse("2026-08-05T06:30:00Z");

const notice = (over: Partial<RoomAnnouncementDetail> = {}): RoomAnnouncementDetail => ({
  id: "notice-1",
  offering_id: OFFERING,
  batch_id: null,
  title: "Week one starts on Monday",
  body: "Bring a scene you have already shot.",
  is_pinned: false,
  created_at: "2026-08-05T04:30:00Z",
  author_id: "mentor-1",
  author_name: "Nelson Dilipkumar",
  author_role: "mentor",
  ...over,
});

const roomFor = (over: Partial<CohortRoomSummary> = {}) =>
  ({
    offering_id: OFFERING,
    offering_title: "The Forge",
    room_slug: "the-forge",
    batch_id: "batch-1",
    batch_name: "Batch A1",
    role: "member",
    phase: "live",
    theme: null,
    modules: null,
    total_weeks: 12,
    current_week: 4,
    next_session_at: null,
    next_due_at: null,
    unseen_announcements: 0,
    ...over,
  }) as CohortRoomSummary;

const envelopeFor = (
  role: string | null,
  batchId: string | null = "batch-1",
  access: "member" | "pre_member" = "member",
  over: Partial<CohortRoomEnvelope> = {},
) =>
  ({
    offering_id: OFFERING,
    batch_id: batchId,
    role,
    access,
    config: null,
    roster_count: 41,
    announcements: [],
    sessions: [],
    attendance_pct: null,
    ...over,
  }) as CohortRoomEnvelope;

type BoardMode = "ok" | "network" | "denied";

/**
 * `supabase.rpc` for a whole page, not just this module.
 *
 * `RoomHome` fires `get_cohort_progress` and, in the lobby, `PreStartCard` may
 * fire `get_room_roster`. Answering every RPC with the noticeboard's rows would
 * make those two surfaces render announcement rows as weeks and as people, so
 * the mock dispatches on the function name and hands everything else a
 * legitimate empty set.
 *
 * It also PAGES, honouring `p_limit`/`p_offset` the way the RPC does. A mock
 * that returned every row whatever it was asked would make the "Show older
 * notices" case pass without the offset ever being sent.
 */
function mockRpc(rows: RoomAnnouncementDetail[], mode: BoardMode) {
  rpc.mockImplementation((fn: string, args?: Record<string, unknown>) => {
    if (fn !== "get_room_announcements") {
      return Promise.resolve({ data: [], error: null });
    }
    if (mode === "network") {
      return Promise.resolve({ data: null, error: { code: "PGRST301", message: "network" } });
    }
    if (mode === "denied") {
      return Promise.resolve({ data: null, error: { code: "42501", message: "denied" } });
    }
    const limit = Number(args?.p_limit ?? ROOM_ANNOUNCEMENTS_PAGE_SIZE);
    const offset = Number(args?.p_offset ?? 0);
    return Promise.resolve({ data: rows.slice(offset, offset + limit), error: null });
  });
}

function renderBoard({
  rows = [notice()],
  role = "member",
  batchId = "batch-1" as string | null,
  adminProfile = false,
  mode = "ok" as BoardMode,
}: {
  rows?: RoomAnnouncementDetail[];
  role?: string | null;
  batchId?: string | null;
  adminProfile?: boolean;
  mode?: BoardMode;
} = {}) {
  mockRpc(rows, mode);
  auth.value = {
    user: { id: "mentor-1" },
    profile: { role: adminProfile ? "admin" : "student" },
  };

  const room = roomFor();
  const context = {
    room,
    envelope: envelopeFor(role, batchId),
    theme: null as never,
    rooms: [room],
    refetch: () => {},
  };

  const client = new QueryClient({
    // `retry` is NOT overridable here: `useRoomAnnouncements` sets its own
    // `retryUnlessDenied`, which is the behaviour under test in the transport
    // case. `retryDelay` is left to the default, so it IS overridable, and 0 is
    // what keeps that case from spending three real seconds on backoff.
    defaultOptions: { queries: { gcTime: 0, staleTime: 0, retryDelay: 0 } },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return render(
    <MemoryRouter initialEntries={["/room/the-forge"]}>
      {/* The room's ONE clock, exactly where RoomShell mounts it. */}
      <RoomClockProvider>
        <Routes>
          <Route path="/room/:slug" element={<Outlet context={context} />}>
            <Route index element={<AnnouncementsModule />} />
          </Route>
        </Routes>
      </RoomClockProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

/**
 * `RoomHome` with the board under it — the board's ONLY real mount point.
 *
 * It is rendered under the same `<Outlet context>` the shell hands every module
 * route, because that is the contract `RoomHome` actually reads
 * (`RoomOutletContext`, useCohortRooms.ts). The returned `invalidate` spy is how
 * the watermark's effect on the `/rooms` dot is checked: nothing in a mocked
 * client can observe `unseen_announcements` going to zero, but the KEY that
 * refetches it is checkable, and it has to be the one `useMyCohortRooms` reads.
 */
function renderHome({
  rows = [notice()],
  access = "member" as "member" | "pre_member",
  phase = "live",
  startsAt = null as string | null,
  userId = "member-1",
  mode = "ok" as BoardMode,
  config = null as RoomConfigRow | null,
  envelopeNotices = [] as RoomAnnouncement[],
}: {
  rows?: RoomAnnouncementDetail[];
  access?: "member" | "pre_member";
  phase?: string;
  startsAt?: string | null;
  userId?: string;
  mode?: BoardMode;
  config?: RoomConfigRow | null;
  envelopeNotices?: RoomAnnouncement[];
} = {}) {
  mockRpc(rows, mode);
  auth.value = { user: { id: userId }, profile: { role: "student" } };
  maybeSingle.mockResolvedValue({
    data: { cohort_start_date: startsAt, whatsapp_group_link: null },
    error: null,
  });

  const room = roomFor({ phase } as Partial<CohortRoomSummary>);
  const context = {
    room,
    envelope: envelopeFor("member", "batch-1", access, {
      config,
      announcements: envelopeNotices,
    }),
    theme: null as never,
    rooms: [room],
    refetch: () => {},
  };

  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, staleTime: 0, retryDelay: 0, retry: false } },
  });
  const invalidate = vi.spyOn(client, "invalidateQueries");

  const view = render(
    <MemoryRouter initialEntries={["/room/the-forge"]}>
      <RoomClockProvider>
        <Routes>
          <Route path="/room/:slug" element={<Outlet context={context} />}>
            <Route index element={<RoomHome />} />
          </Route>
        </Routes>
      </RoomClockProvider>
    </MemoryRouter>,
    { wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ) },
  );

  return { ...view, invalidate };
}

beforeEach(() => {
  rpc.mockReset();
  insert.mockReset();
  insert.mockResolvedValue({ data: null, error: null });
  upsert.mockReset();
  upsert.mockResolvedValue({ data: null, error: null });
  update.mockReset();
  updateEq.mockReset();
  updateEq.mockResolvedValue({ data: null, error: null });
  maybeSingle.mockReset();
  maybeSingle.mockResolvedValue({ data: null, error: null });
  from.mockClear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/* ────────────────────────────────────────────────────────────────────────────
 * 1. The composer is drawn for the roles that can post, and for nobody else
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the composer", () => {
  const COMPOSER = "Post to the board";

  it("is NOT rendered for a member", async () => {
    renderBoard({ role: "member" });
    await screen.findByText("Week one starts on Monday");
    expect(screen.queryByRole("button", { name: COMPOSER })).toBeNull();
  });

  it("is NOT rendered for an alumnus or a pre_member either", async () => {
    for (const role of ["alumni", "pre_member"]) {
      const view = renderBoard({ role });
      await screen.findByText("Week one starts on Monday");
      expect(screen.queryByRole("button", { name: COMPOSER })).toBeNull();
      view.unmount();
    }
  });

  it("IS rendered for a mentor and for a host", async () => {
    for (const role of ["mentor", "host"]) {
      const view = renderBoard({ role });
      expect(await screen.findByRole("button", { name: COMPOSER })).toBeInTheDocument();
      view.unmount();
    }
  });

  it("IS rendered for an admin, who holds every room and carries no room role", async () => {
    renderBoard({ role: null, adminProfile: true });
    expect(await screen.findByRole("button", { name: COMPOSER })).toBeInTheDocument();
  });

  it("posts the caller's own batch and authorship, never a batch it was handed", async () => {
    renderBoard({ role: "mentor", batchId: "batch-1" });

    fireEvent.click(await screen.findByRole("button", { name: COMPOSER }));
    fireEvent.change(screen.getByLabelText("Notice"), {
      target: { value: "  Screening moves to Friday.  " },
    });
    fireEvent.click(screen.getByLabelText(/Pin this to the top/));
    fireEvent.click(screen.getByRole("button", { name: "Post" }));

    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("cohort_announcements");
    expect(insert).toHaveBeenCalledWith({
      offering_id: OFFERING,
      batch_id: "batch-1",
      author_id: "mentor-1",
      title: null,
      body: "Screening moves to Friday.",
      is_pinned: true,
    });
  });

  it("refuses to post a body that is only whitespace", async () => {
    renderBoard({ role: "host" });

    fireEvent.click(await screen.findByRole("button", { name: COMPOSER }));
    fireEvent.change(screen.getByLabelText("Notice"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: "Post" })).toBeDisabled();
    expect(insert).not.toHaveBeenCalled();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 2. Retract and unpin — the two verbs R0 built and nothing else exposes
 *
 * `AdminAnnouncements.tsx` writes `admin_announcements` and never touches
 * `cohort_announcements`, so after this round the in-room controls are the only
 * way a wrong or permanently-pinned notice comes off a live cohort's board
 * without raw SQL against prod.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the amend verbs", () => {
  const RETRACT = "Retract Week one starts on Monday";

  it("are NOT offered to a member", async () => {
    renderBoard({ role: "member" });
    await screen.findByText("Week one starts on Monday");

    expect(screen.queryByRole("button", { name: RETRACT })).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Pin to top Week one starts on Monday" }),
    ).toBeNull();
  });

  it("retract asks first, and then soft-deletes the row it names", async () => {
    renderBoard({ role: "mentor" });

    fireEvent.click(await screen.findByRole("button", { name: RETRACT }));
    // The confirmation is inline, not a native dialog: a WebView alert blocks
    // the main thread and reads as the browser talking, not the room.
    expect(screen.getByText(/It leaves the board for everyone/)).toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Retract" }));

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("cohort_announcements");
    // A soft delete, never a DELETE: there is no member DELETE policy on the
    // table, and the trigger keys its inbox cleanup off this transition.
    expect(update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
    expect(updateEq).toHaveBeenCalledWith("id", "notice-1");
  });

  it("keeps the notice when the confirmation is declined", async () => {
    renderBoard({ role: "host" });

    fireEvent.click(await screen.findByRole("button", { name: RETRACT }));
    fireEvent.click(screen.getByRole("button", { name: "Keep it" }));

    expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: RETRACT })).toBeInTheDocument();
  });

  it("unpins a pinned notice, which is the lever a host would otherwise wait on an admin for", async () => {
    renderBoard({ role: "mentor", rows: [notice({ is_pinned: true })] });

    fireEvent.click(
      await screen.findByRole("button", { name: "Unpin Week one starts on Monday" }),
    );

    await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
    expect(update).toHaveBeenCalledWith({ is_pinned: false });
    expect(updateEq).toHaveBeenCalledWith("id", "notice-1");
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 3. The board itself
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the board", () => {
  it("renders the empty line in the serif when there is nothing on it", async () => {
    renderBoard({ rows: [] });

    const empty = await screen.findByText("Nothing on the board yet.");
    expect(empty).toBeInTheDocument();
    expect(empty.className).toContain("font-serif");
  });

  it("does NOT claim the board is empty when the request failed", async () => {
    renderBoard({ mode: "network" });

    expect(await screen.findByText(/The board did not load/)).toBeInTheDocument();
    expect(screen.queryByText("Nothing on the board yet.")).toBeNull();
  });

  it("says it was REFUSED on a 42501, which is neither empty nor a transport error", async () => {
    // The states are a membership revoked between two fetches, or an is_admin()
    // flip. Telling that student the cohort is quiet, or offering them a Try
    // again button that will refuse them again, are both lies about the room.
    renderBoard({ mode: "denied" });

    expect(await screen.findByText("This board is not open to you.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing on the board yet.")).toBeNull();
    expect(screen.queryByText(/The board did not load/)).toBeNull();
  });

  it("puts pinned notices first whatever order the rows arrive in", async () => {
    renderBoard({
      rows: [
        notice({ id: "new", title: "Newest", created_at: "2026-08-05T06:00:00Z" }),
        notice({
          id: "pin",
          title: "Read this first",
          is_pinned: true,
          created_at: "2026-07-01T06:00:00Z",
        }),
      ],
    });

    const headings = await screen.findAllByRole("heading", { level: 3 });
    expect(headings.map((node) => node.textContent)).toEqual([
      "Read this first",
      "Newest",
    ]);
  });

  it("renders the author, the role wordmark and a relative date", async () => {
    renderBoard({ rows: [notice({ author_role: "host", author_name: "Rahul" })] });

    expect(await screen.findByText("Rahul")).toBeInTheDocument();
    expect(screen.getByText("HOST")).toBeInTheDocument();
    expect(screen.getByText("2 hours ago")).toBeInTheDocument();
  });

  it("falls back to a neutral byline when the author row is gone", async () => {
    // `author_id` is ON DELETE SET NULL (20260729100100 §1): a host's account can
    // be deleted without erasing the noticeboard of every cohort they ran, and
    // the board has to survive that.
    renderBoard({ rows: [notice({ author_id: null, author_name: null, author_role: null })] });

    expect(await screen.findByText("The team")).toBeInTheDocument();
    expect(screen.getByText("TEAM")).toBeInTheDocument();
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 4. Paging — the reason `p_offset` is not dead client-side
 * ──────────────────────────────────────────────────────────────────────────── */

describe("older notices", () => {
  const OLDER = "Show older notices";

  /** One more than a page, so the first fetch comes back exactly full. */
  const manyNotices = () =>
    Array.from({ length: ROOM_ANNOUNCEMENTS_PAGE_SIZE + 1 }, (_, index) =>
      notice({
        id: `notice-${index}`,
        title: `Notice ${index}`,
        // Descending, so the server's own order needs no re-sorting here.
        created_at: new Date(NOW - index * 3_600_000).toISOString(),
      }),
    );

  it("offers the control only when a page came back FULL", async () => {
    renderBoard({ rows: [notice()] });
    await screen.findByText("Week one starts on Monday");
    expect(screen.queryByRole("button", { name: OLDER })).toBeNull();
  });

  it("pages with the offset the RPC expects, and stops offering once it is done", async () => {
    // Without this the board would be capped at forty with no affordance, which
    // is the envelope's silent LIMIT 10 one order of magnitude out.
    renderBoard({ rows: manyNotices() });

    expect(await screen.findByText("Notice 0")).toBeInTheDocument();
    expect(screen.queryByText(`Notice ${ROOM_ANNOUNCEMENTS_PAGE_SIZE}`)).toBeNull();

    fireEvent.click(await screen.findByRole("button", { name: OLDER }));

    expect(
      await screen.findByText(`Notice ${ROOM_ANNOUNCEMENTS_PAGE_SIZE}`),
    ).toBeInTheDocument();
    expect(rpc).toHaveBeenCalledWith(
      "get_room_announcements",
      expect.objectContaining({ p_offset: ROOM_ANNOUNCEMENTS_PAGE_SIZE }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: OLDER })).toBeNull(),
    );
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 5. The pure helpers, as tables
 * ──────────────────────────────────────────────────────────────────────────── */

describe("relativeNoticeDate", () => {
  const CASES: ReadonlyArray<[label: string, iso: string, expected: string]> = [
    ["seconds old", "2026-08-05T06:29:40Z", "Just now"],
    ["minutes old", "2026-08-05T06:05:00Z", "25 min ago"],
    ["one hour", "2026-08-05T05:20:00Z", "1 hour ago"],
    ["hours old", "2026-08-05T00:30:00Z", "6 hours ago"],
    ["one day", "2026-08-04T05:00:00Z", "1 day ago"],
    ["days old", "2026-08-02T06:30:00Z", "3 days ago"],
    ["past the week", "2026-07-20T06:30:00Z", "20 Jul"],
    ["last year", "2025-07-20T06:30:00Z", "20 Jul 2025"],
    // Device clock skew, not a scheduled notice: `created_at` is now() on the
    // server, so a future stamp is the phone being wrong. It must never read
    // "in 3 hours".
    ["stamped in the future", "2026-08-05T09:00:00Z", "Just now"],
  ];

  for (const [label, iso, expected] of CASES) {
    it(`${label} reads "${expected}"`, () => {
      expect(relativeNoticeDate(iso, NOW)).toBe(expected);
    });
  }

  it("renders nothing at all for an unparseable stamp", () => {
    expect(relativeNoticeDate(null, NOW)).toBe("");
    expect(relativeNoticeDate("not a date", NOW)).toBe("");
  });
});

describe("authorWordmark", () => {
  it("maps the two room roles that can post, and calls everything else TEAM", () => {
    expect(authorWordmark("host")).toBe("HOST");
    expect(authorWordmark("mentor")).toBe("MENTOR");
    // An admin passes is_admin() and holds no membership row, so the RPC's
    // lateral resolves NULL. The student's relationship is with the cohort's
    // team, not with the platform's permission model.
    expect(authorWordmark(null)).toBe("TEAM");
    expect(authorWordmark("member")).toBe("TEAM");
  });
});

describe("pinnedFirst", () => {
  it("is stable, non-mutating, and sorts newest-first inside each group", () => {
    const input = [
      notice({ id: "a", created_at: "2026-08-01T00:00:00Z" }),
      notice({ id: "pinned-old", is_pinned: true, created_at: "2026-06-01T00:00:00Z" }),
      notice({ id: "b", created_at: "2026-08-04T00:00:00Z" }),
      notice({ id: "pinned-new", is_pinned: true, created_at: "2026-07-01T00:00:00Z" }),
    ];
    const order = pinnedFirst(input).map((row) => row.id);

    expect(order).toEqual(["pinned-new", "pinned-old", "b", "a"]);
    // The caller's array is react-query's cached value. Sorting it in place
    // would mutate the cache.
    expect(input.map((row) => row.id)).toEqual(["a", "pinned-old", "b", "pinned-new"]);
  });
});

/* ────────────────────────────────────────────────────────────────────────────
 * 6. The mount point, and the watermark that clears the dot
 *
 * These render `RoomHome`, not the module. Everything above proves the board
 * behaves; this proves the board is REACHED — on both branches — and that
 * opening it tells the server so, but only when there was something to open.
 * ──────────────────────────────────────────────────────────────────────────── */

describe("the mount point", () => {
  it("puts the board on RoomHome, which is the only place it is mounted", async () => {
    // There is no `announcements` tab and no announcements route (ROOM_TABS,
    // RoomShell.tsx). If this slot ever loses the module, the module is dead
    // code and every other test in this file passes anyway.
    renderHome();

    expect(await screen.findByText("Week one starts on Monday")).toBeInTheDocument();
  });

  it("gives the LOBBY the whole board, not one notice off the envelope", async () => {
    // MEMBER-1 makes announcements-READ a pre_member's entire whitelist, and
    // `PreStartCard` shows exactly one notice. Leaving the lobby on that teaser
    // while the watermark claimed the board had been read is how notices 2..N
    // were marked seen with no surface that listed them.
    renderHome({
      access: "pre_member",
      startsAt: "2026-08-15T00:00:00Z",
      envelopeNotices: [
        {
          id: "envelope-1",
          offering_id: OFFERING,
          batch_id: null,
          author_id: "mentor-1",
          title: "Teaser only",
          body: "Should not be drawn twice.",
          is_pinned: false,
          created_at: "2026-08-04T04:30:00Z",
        } as RoomAnnouncement,
      ],
      rows: [notice(), notice({ id: "notice-2", title: "And the second one" })],
    });

    expect(await screen.findByText("Doors open")).toBeInTheDocument();
    expect(await screen.findByText("Week one starts on Monday")).toBeInTheDocument();
    expect(screen.getByText("And the second one")).toBeInTheDocument();
    // The card is handed the envelope WITHOUT announcements, so exactly one
    // surface owns them and the top notice is not drawn twice.
    expect(screen.queryByText("Teaser only")).toBeNull();
  });
});

describe("the seen watermark", () => {
  const WATERMARK_KEY = { queryKey: cohortRoomsKey("member-1") };

  it("upserts on the (user_id, offering_id) primary key once the board has loaded", async () => {
    renderHome();

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("cohort_room_seen");
    // `cohort_room_seen` is PRIMARY KEY (user_id, offering_id) — 20260729100100.
    // The conflict target has to name that pair or a second open inserts a
    // second row instead of moving the one that exists.
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "member-1", offering_id: OFFERING }),
      { onConflict: "user_id,offering_id" },
    );
  });

  it("invalidates the key /rooms reads, which is what clears the unseen dot", async () => {
    // `unseen_announcements` rides `get_my_cohort_rooms`, and MyCohortsPage
    // reads it through `useMyCohortRooms` on exactly this key. Invalidating
    // anything else would write the watermark and leave the dot lit.
    const { invalidate } = renderHome();

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(WATERMARK_KEY));
  });

  it("fires for the LOBBY too, because that tier's dot must be able to clear", async () => {
    renderHome({ access: "pre_member", startsAt: "2026-08-15T00:00:00Z" });

    expect(await screen.findByText("Doors open")).toBeInTheDocument();
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(from).toHaveBeenCalledWith("cohort_room_seen");
  });

  it("does NOT claim a board was seen when the board never loaded", async () => {
    // THE LOAD-BEARING ONE. The watermark is a single timestamp and the RPC
    // counts every notice stamped after it, so writing it is a claim about the
    // WHOLE board. A failed read showed the student nothing; marking their
    // notices seen would lose them with no surface left to find them on.
    renderHome({ mode: "network" });

    expect(await screen.findByText(/The board did not load/)).toBeInTheDocument();
    expect(upsert).not.toHaveBeenCalled();
  });

  it("is still written for a cohort that runs NO board, where nothing can be unseen", async () => {
    // `get_my_cohort_rooms` counts announcements whatever the module config
    // says, so this is the one case `RoomHome` keeps for itself.
    renderHome({ config: { modules: { announcements: false } } as RoomConfigRow });

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(rpc.mock.calls.map((call) => call[0])).not.toContain("get_room_announcements");
  });

  it("still clears the dot when the room is left before the write lands", async () => {
    // The write is already on its way to the server, so the server's answer is
    // "seen" whatever the client does next. Short-circuiting the invalidation on
    // unmount would leave the dot lit over a watermark that DID land.
    let settle: (value: { data: null; error: null }) => void = () => {};
    upsert.mockReturnValueOnce(
      new Promise<{ data: null; error: null }>((resolve) => {
        settle = resolve;
      }),
    );

    const { invalidate, unmount } = renderHome();
    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));

    unmount();
    settle({ data: null, error: null });

    await waitFor(() => expect(invalidate).toHaveBeenCalledWith(WATERMARK_KEY));
  });

  it("does not invalidate when the write failed", async () => {
    upsert.mockResolvedValue({ data: null, error: { code: "42501", message: "denied" } });

    const { invalidate } = renderHome();

    await waitFor(() => expect(upsert).toHaveBeenCalledTimes(1));
    expect(invalidate).not.toHaveBeenCalledWith(WATERMARK_KEY);
  });
});
