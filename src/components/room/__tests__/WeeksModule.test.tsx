import { type ReactNode } from "react";
import { MemoryRouter, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WeeksModule — the acceptances that would otherwise be a manual check.
 *
 * The load-bearing one is the TWO-SESSIONS-IN-ONE-WEEK fixture. The week row
 * from `get_room_weeks` carries exactly ONE session by design (the RPC's
 * LEFT JOIN LATERAL … LIMIT 1, 20260729100200_cohort_room_rpcs.sql:990-1003),
 * so a module that renders sessions off the week row silently drops the second
 * class of a two-class week and looks perfectly fine doing it. The fixture
 * below gives the week row session A and the envelope sessions A and B, and
 * asserts BOTH are on screen.
 *
 * ── Why every render here is wrapped in `RoomClockProvider` ────────────────
 * `useRoomClock()` falls back to a MODULE-LEVEL singleton clock when no provider
 * is above it (RoomClockProvider.tsx:156-157), so a test tree without the
 * provider does not fail — it quietly shares one process-wide store, and its
 * real interval, with every other test in the file. The provider is what
 * `RoomShell` mounts in production (RoomShell.tsx:159), so mounting it here
 * tests the real wiring AND keeps the one-interval assertion below honest.
 */

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/lib/haptics", () => ({ tapTick: vi.fn(() => Promise.resolve()) }));

const { default: WeeksModule, nextOpenDue, sessionsForWeek, groupSessionsByWeek, weeksProgress } =
  await import("@/components/room/WeeksModule");
const { weekLead, submissionStatusTone, weekStatusTone } = await import(
  "@/components/room/ThisWeekCard"
);
const { default: WeekRail } = await import("@/components/room/WeekRail");
const { default: RoomClockProvider } = await import("@/components/room/RoomClockProvider");
type RoomWeekRow = import("@/hooks/useCohortRooms").RoomWeekRow;
type RoomWeekBatch = import("@/hooks/useCohortRooms").RoomWeekBatch;
type RoomSession = import("@/hooks/useCohortRooms").RoomSession;
type CohortRoomEnvelope = import("@/hooks/useCohortRooms").CohortRoomEnvelope;
type CohortRoomSummary = import("@/hooks/useCohortRooms").CohortRoomSummary;
type RoomConfigRow = import("@/hooks/useCohortRooms").RoomConfigRow;
type RoomAssignmentSlotProps =
  import("@/components/room/ThisWeekCard").RoomAssignmentSlotProps;

const OFFERING = "11111111-1111-1111-1111-111111111111";

/** Fixed wall clock: Wed 5 Aug 2026, 12:00 IST. Every fixture hangs off it. */
const NOW = Date.parse("2026-08-05T06:30:00Z");

const weekRow = (over: Partial<RoomWeekRow> = {}): RoomWeekRow => ({
  cohort_batch_id: "batch-1",
  batch_label: "Batch A1",
  week_id: "week-4",
  week_number: 4,
  theme: "Blocking and coverage",
  description: null,
  starts_on: "2026-08-03",
  ends_on: "2026-08-09",
  assignment_prompt: "Cut your scene to 90 seconds.",
  assignment_due_at: "2026-08-08T12:00:00Z",
  feedback_session_at: null,
  week_status: "active",
  live_session_id: "session-a",
  live_session_title: "Coverage clinic",
  live_session_at: "2026-08-06T14:30:00Z",
  live_session_zoom_link: null,
  submission_id: null,
  submission_status: null,
  submission_rating: null,
  submission_feedback: null,
  submission_submitted_at: null,
  attended: false,
  attendance_marked: false,
  ...over,
});

const session = (over: Partial<RoomSession> = {}): RoomSession => ({
  id: "session-a",
  title: "Coverage clinic",
  scheduled_at: "2026-08-06T14:30:00Z",
  duration_minutes: 90,
  status: "scheduled",
  session_type: "class",
  week_id: "week-4",
  ...over,
});

const envelopeFor = (
  sessions: RoomSession[],
  config: RoomConfigRow | null = null,
  batchId: string | null = "batch-1",
  role = "member",
): CohortRoomEnvelope => ({
  offering_id: OFFERING,
  batch_id: batchId,
  role,
  access: "member",
  config,
  roster_count: 12,
  announcements: [],
  sessions,
  attendance_pct: 80,
});

/** A config row that carries nothing but the module matrix under test. */
const configWithModules = (modules: Record<string, unknown>): RoomConfigRow =>
  ({ modules }) as RoomConfigRow;

const roomFor = (over: Partial<CohortRoomSummary> = {}): CohortRoomSummary =>
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

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="room-location">{location.pathname}{location.search}</output>;
};

function renderModule({
  rows,
  sessions = [session()],
  room = roomFor(),
  config = null,
  path = "/room/the-forge/weeks/4",
  renderAssignment,
  queryState = "success",
  batchRows = [],
  envelopeBatchId = "batch-1",
  batchQueryState = "success",
  rowsByBatch,
}: {
  rows: RoomWeekRow[];
  sessions?: RoomSession[];
  room?: CohortRoomSummary;
  config?: RoomConfigRow | null;
  path?: string;
  renderAssignment?: (props: RoomAssignmentSlotProps) => ReactNode;
  queryState?: "success" | "pending" | "error";
  batchRows?: RoomWeekBatch[];
  envelopeBatchId?: string | null;
  batchQueryState?: "success" | "pending" | "error";
  rowsByBatch?: Record<string, RoomWeekRow[]>;
}) {
  rpc.mockImplementation((fn: string, args: Record<string, unknown>) => {
    if (fn === "get_room_week_batches") {
      if (batchQueryState === "pending") return new Promise(() => {});
      if (batchQueryState === "error") {
        return Promise.resolve({ data: null, error: { code: "500", message: "network" } });
      }
      return Promise.resolve({ data: batchRows, error: null });
    }
    if (queryState === "pending") return new Promise(() => {});
    if (queryState === "error") {
      return Promise.resolve({ data: null, error: { code: "500", message: "network" } });
    }
    const batchRowsForCall = rowsByBatch?.[String(args.p_batch)] ?? rows;
    return Promise.resolve({ data: batchRowsForCall, error: null });
  });

  const context = {
    room,
    envelope: envelopeFor(sessions, config, envelopeBatchId, room.role ?? "member"),
    theme: null as never,
    rooms: [room],
    refetch: () => {},
  };

  const client = new QueryClient({
    defaultOptions: { queries: { gcTime: 0, staleTime: 0, retry: false } },
  });

  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );

  return render(
    <MemoryRouter initialEntries={[path]}>
      {/* The room's ONE clock, exactly where RoomShell mounts it. */}
      <RoomClockProvider>
        <Routes>
          <Route path="/room/:slug" element={<Outlet context={context} />}>
            <Route
              path="weeks/:n"
              element={(
                <>
                  <WeeksModule renderAssignment={renderAssignment} />
                  <LocationProbe />
                </>
              )}
            />
          </Route>
        </Routes>
      </RoomClockProvider>
    </MemoryRouter>,
    { wrapper },
  );
}

beforeEach(() => {
  rpc.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

/* ────────────────────────────────────────────────────────────────────────── */

describe("two sessions in one week", () => {
  it("renders BOTH, from the envelope rather than the week row", async () => {
    const sessions = [
      session({ id: "session-a", title: "Coverage clinic" }),
      session({
        id: "session-b",
        title: "Cutting room",
        scheduled_at: "2026-08-08T14:30:00Z",
      }),
    ];
    // The week row knows about session A only — that is what the LATERAL
    // elects. If the module read sessions off the row, "Cutting room" would
    // never appear.
    renderModule({ rows: [weekRow({ live_session_id: "session-a" })], sessions });

    const panel = await screen.findByRole("region", { name: "Live sessions" });
    expect(within(panel).getByText("Coverage clinic")).toBeInTheDocument();
    expect(within(panel).getByText("Cutting room")).toBeInTheDocument();
  });

  it("groups the envelope's sessions by week_id and drops the unkeyed ones", () => {
    const grouped = groupSessionsByWeek([
      session({ id: "b", scheduled_at: "2026-08-08T14:30:00Z" }),
      session({ id: "a", scheduled_at: "2026-08-06T14:30:00Z" }),
      session({ id: "other", week_id: "week-5" }),
      session({ id: "orphan", week_id: null }),
    ]);
    expect(grouped.get("week-4")?.map((s) => s.id)).toEqual(["a", "b"]);
    expect(grouped.get("week-5")?.map((s) => s.id)).toEqual(["other"]);
    expect(grouped.has("null")).toBe(false);
  });

  it("falls back to the week row's elected session when the envelope has none", () => {
    const fallback = sessionsForWeek(weekRow(), new Map());
    expect(fallback).toHaveLength(1);
    expect(fallback[0].id).toBe("session-a");
    expect(sessionsForWeek(weekRow({ live_session_id: null }), new Map())).toHaveLength(0);
  });
});

describe("today-first precedence", () => {
  const base = weekRow({
    assignment_due_at: "2026-08-08T12:00:00Z",
    feedback_session_at: "2026-08-09T09:00:00Z",
  });

  it("leads with the session even when an assignment is due sooner", () => {
    const lead = weekLead(base, [session({ scheduled_at: "2026-08-09T14:30:00Z" })], NOW);
    expect(lead.kind).toBe("session");
  });

  it("falls to the assignment once every session has ended", () => {
    const lead = weekLead(
      base,
      [session({ scheduled_at: "2026-08-01T14:30:00Z", duration_minutes: 60 })],
      NOW,
    );
    expect(lead.kind).toBe("assignment");
    expect(lead.line).toBe("Assignment due in 3 days.");
  });

  it("falls to the feedback session when nothing else is outstanding", () => {
    const lead = weekLead(
      { ...base, assignment_due_at: null },
      [session({ scheduled_at: "2026-08-01T14:30:00Z" })],
      NOW,
    );
    expect(lead.kind).toBe("feedback");
    expect(lead.line).toContain("Feedback session");
  });

  it("keeps assignment urgency personal while staff retain the authored date", () => {
    const lead = weekLead(base, [], NOW, false);
    expect(lead.kind).toBe("feedback");
    expect(lead.line).toContain("Feedback session");
  });

  it("counts a running class as live and an imminent one in minutes", () => {
    expect(weekLead(base, [session({ scheduled_at: "2026-08-05T06:00:00Z" })], NOW).line).toBe(
      "Live right now.",
    );
    expect(weekLead(base, [session({ scheduled_at: "2026-08-05T07:00:00Z" })], NOW).line).toBe(
      "Starts in 30 minutes.",
    );
  });

  it("shouts about an overdue assignment only while the work is outstanding", () => {
    const overdue = { ...base, assignment_due_at: "2026-08-01T12:00:00Z" };
    expect(weekLead(overdue, [], NOW)).toMatchObject({
      kind: "assignment",
      line: "Assignment overdue.",
      tone: "critical",
    });
    expect(weekLead({ ...overdue, submission_id: "sub-1" }, [], NOW).kind).not.toBe("assignment");
  });

  it("says so plainly when the week holds nothing timed", () => {
    const quiet = weekRow({ assignment_due_at: null, feedback_session_at: null });
    expect(weekLead(quiet, [], NOW)).toMatchObject({ kind: "none", tone: "neutral" });
  });
});

describe("footer parity", () => {
  it("takes the week count from room.total_weeks, never from rows.length", () => {
    // Six rows, twelve weeks in the season: `rows.length` would read 50% done
    // off three completed rows. The correct denominator is 12.
    const rows = [
      weekRow({ week_id: "w1", week_number: 1, week_status: "completed" }),
      weekRow({ week_id: "w2", week_number: 2, week_status: "completed" }),
      weekRow({ week_id: "w3", week_number: 3, week_status: "archived" }),
      weekRow({ week_id: "w4", week_number: 4, week_status: "active" }),
      weekRow({ week_id: "w5", week_number: 5, week_status: "upcoming" }),
      weekRow({ week_id: "w6", week_number: 6, week_status: "upcoming" }),
    ];
    expect(weeksProgress(rows, 12)).toMatchObject({
      totalWeeks: 12,
      completedCount: 3,
      weekOf: 4,
      progressPct: 25,
    });
    // A room that reports no week count at all falls back to the rows.
    expect(weeksProgress(rows, 0).totalWeeks).toBe(6);
  });

  it("clamps the week number into the season and survives an empty list", () => {
    expect(weeksProgress([], 12)).toMatchObject({ weekOf: 1, progressPct: 0 });
    expect(
      weeksProgress([weekRow({ week_number: 40, week_status: "active" })], 12).weekOf,
    ).toBe(12);
  });

  it("finds the soonest OPEN deadline, ignoring submitted and past ones", () => {
    const rows = [
      weekRow({ week_id: "w1", assignment_due_at: "2026-08-01T12:00:00Z" }),
      weekRow({ week_id: "w2", assignment_due_at: "2026-08-06T12:00:00Z", submission_id: "s" }),
      weekRow({ week_id: "w3", assignment_due_at: "2026-08-07T12:00:00Z" }),
      weekRow({ week_id: "w4", assignment_due_at: "2026-08-20T12:00:00Z" }),
    ];
    expect(nextOpenDue(rows, NOW)).toMatchObject({ at: "2026-08-07T12:00:00Z", days: 2 });
    expect(nextOpenDue([weekRow({ assignment_due_at: null })], NOW)).toBeNull();
  });

  it("renders the ring, the week line and the next-due label", async () => {
    renderModule({
      rows: [
        weekRow({ week_id: "w3", week_number: 3, week_status: "completed" }),
        weekRow({ week_id: "week-4", week_number: 4, week_status: "active" }),
      ],
    });

    expect(await screen.findByText(/Week 4 of 12/)).toBeInTheDocument();
    expect(screen.getByText(/1 done/)).toBeInTheDocument();
    expect(screen.getByText("assignment due in 3d")).toBeInTheDocument();
  });
});

describe("offering-wide batch selection", () => {
  const batches: RoomWeekBatch[] = [
    { batch_id: "batch-1", batch_label: "Batch A1" },
    { batch_id: "batch-2", batch_label: "Batch A2" },
  ];
  const staffRoom = roomFor({
    batch_id: null,
    batch_name: null,
    role: "mentor",
    total_weeks: 12,
    current_week: 1,
  });
  const a1 = weekRow({
    cohort_batch_id: "batch-1",
    batch_label: "Batch A1",
    week_id: "a1-week-1",
    week_number: 1,
    theme: "A1 curriculum",
    assignment_prompt: "A1 assignment",
    week_status: "completed",
  });
  const a2 = weekRow({
    cohort_batch_id: "batch-2",
    batch_label: "Batch A2",
    week_id: "a2-week-1",
    week_number: 1,
    theme: "A2 curriculum",
    assignment_prompt: "A2 assignment",
    week_status: "active",
  });

  it("waits for authorized batch metadata before requesting curriculum", async () => {
    renderModule({
      rows: [],
      room: staffRoom,
      envelopeBatchId: null,
      batchQueryState: "pending",
    });

    await waitFor(() => expect(rpc).toHaveBeenCalledWith(
      "get_room_week_batches",
      { p_offering: OFFERING },
    ));
    expect(rpc.mock.calls.map((call) => call[0])).toEqual(["get_room_week_batches"]);
    expect(screen.getByText("Loading weeks")).toBeInTheDocument();
  });

  it("renders only the queried batch and passes its id to the assignment seam", async () => {
    const seen: RoomAssignmentSlotProps[] = [];
    renderModule({
      rows: [],
      rowsByBatch: { "batch-1": [a1], "batch-2": [a2] },
      batchRows: batches,
      room: staffRoom,
      envelopeBatchId: null,
      path: "/room/the-forge/weeks/1?batch=batch-2",
      sessions: [
        session({ id: "a1-session", week_id: "a1-week-1", title: "A1 session" }),
        session({ id: "a2-session", week_id: "a2-week-1", title: "A2 session" }),
      ],
      renderAssignment: (props) => {
        seen.push(props);
        return <p>A2 assignment renderer</p>;
      },
    });

    const selector = await screen.findByRole("combobox", { name: "Cohort batch" });
    expect(selector).toHaveValue("batch-2");
    expect(screen.getByText("A2 curriculum")).toBeInTheDocument();
    expect(screen.queryByText("A1 curriculum")).toBeNull();
    expect(screen.getByText("A2 session")).toBeInTheDocument();
    expect(screen.queryByText("A1 session")).toBeNull();
    expect(seen.at(-1)).toMatchObject({ batchId: "batch-2", weekId: "a2-week-1" });
    expect(screen.getByText("Week 1 of 1")).toBeInTheDocument();
    expect(screen.getByText("Batch curriculum progress.")).toBeInTheDocument();
    expect(screen.queryByText(/you.re all caught up/i)).toBeNull();
    expect(rpc).toHaveBeenCalledWith("get_room_weeks", {
      p_offering: OFFERING,
      p_batch: "batch-2",
    });
  });

  it("resets the visible week and preserves the selected batch in navigation", async () => {
    renderModule({
      rows: [],
      rowsByBatch: { "batch-1": [a1], "batch-2": [a2] },
      batchRows: batches,
      room: staffRoom,
      envelopeBatchId: null,
      path: "/room/the-forge/weeks/1?batch=batch-1",
      sessions: [],
    });

    const selector = await screen.findByRole("combobox", { name: "Cohort batch" });
    expect(screen.getByText("A1 curriculum")).toBeInTheDocument();
    fireEvent.change(selector, { target: { value: "batch-2" } });

    await waitFor(() => expect(screen.getByText("A2 curriculum")).toBeInTheDocument());
    expect(screen.queryByText("A1 curriculum")).toBeNull();
    expect(screen.getByTestId("room-location")).toHaveTextContent(
      "/room/the-forge/weeks/1?batch=batch-2",
    );
    expect(rpc).toHaveBeenCalledWith("get_room_weeks", {
      p_offering: OFFERING,
      p_batch: "batch-2",
    });
  });

  it("does not render a selector for a member's single resolved batch", async () => {
    renderModule({ rows: [weekRow()] });
    await screen.findByText("Blocking and coverage");
    expect(screen.queryByRole("combobox", { name: "Cohort batch" })).toBeNull();
  });
});

describe("edge cases", () => {
  it("wraps unbroken week copy instead of widening the hero", async () => {
    const longDescription = "D".repeat(200);
    const longPrompt = "P".repeat(200);
    renderModule({
      rows: [weekRow({ description: longDescription, assignment_prompt: longPrompt })],
    });

    expect(await screen.findByText(longDescription)).toHaveClass("break-words");
    expect(screen.getByText(longPrompt)).toHaveClass("break-words");
    expect(screen.getByRole("region", { name: "Live sessions" })).toHaveClass("min-w-0");
    expect(screen.getByRole("region", { name: "Assignment" })).toHaveClass("min-w-0");
  });

  it("keeps the loading placeholders inside a responsive grid", () => {
    renderModule({ rows: [], queryState: "pending" });
    const rail = screen.getByTestId("weeks-loading-rail");
    expect(rail.className).toContain("grid-cols-1");
    expect(rail.className).toContain("sm:grid-cols-2");
    expect(rail.innerHTML).not.toContain("w-[13.5rem]");
  });

  it("shows a retryable error instead of claiming a failed request is an empty schedule", async () => {
    renderModule({ rows: [], queryState: "error" });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(await screen.findByText("The weeks didn't load")).toBeInTheDocument();
    expect(screen.queryByText("The schedule is being set.")).toBeNull();
    const callsBeforeRetry = rpc.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(rpc.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
  });

  it("renders the serif holding line when a live room has no weeks", async () => {
    renderModule({ rows: [] });
    expect(await screen.findByText("The schedule is being set.")).toBeInTheDocument();
  });

  it("keeps the existing 'No assignment this week' copy", async () => {
    renderModule({ rows: [weekRow({ assignment_prompt: null, assignment_due_at: null })] });
    expect(await screen.findByText("No assignment this week")).toBeInTheDocument();
  });

  it("renders feedback_session_at, which no surface showed before", async () => {
    renderModule({ rows: [weekRow({ feedback_session_at: "2026-08-09T09:00:00Z" })] });
    expect(await screen.findByText("Feedback session")).toBeInTheDocument();
    expect(screen.getByText(/9 Aug, 2:30 PM IST/)).toBeInTheDocument();
  });

  it("mounts the assignment seam with the week's own submission state", async () => {
    const seen: RoomAssignmentSlotProps[] = [];
    renderModule({
      rows: [weekRow({ submission_id: "sub-1", submission_status: "needs_revision" })],
      renderAssignment: (props) => {
        seen.push(props);
        return <p>assignment module here</p>;
      },
    });

    expect(await screen.findByText("assignment module here")).toBeInTheDocument();
    expect(seen[0]).toMatchObject({
      weekId: "week-4",
      weekNumber: 4,
      userId: "user-1",
      batchId: "batch-1",
      submissionId: "sub-1",
      submissionStatus: "needs_revision",
      // R2-T4 holds no config of its own; the flag arrives through the slot.
      peerReviewEnabled: true,
    });
    expect(typeof seen[0].onChange).toBe("function");
  });
});

/* ── The centrepiece interaction is the one that is MOUNTED ───────────────── */

describe("the session slot inside the week", () => {
  it("mounts R2-T2's slot, not a thinner local row", async () => {
    renderModule({ rows: [weekRow()] });

    const panel = await screen.findByRole("region", { name: "Live sessions" });
    // `data-session-state` is SessionSlot's own contract with the tests; a row
    // that only stated a title and a date would carry nothing here.
    const slot = within(panel).getByRole("article");
    expect(slot).toHaveAttribute("data-session-state", "scheduled");
    // Add-to-calendar is part of the choreography the local row did not have.
    expect(within(panel).getByRole("button", { name: /add to calendar/i })).toBeInTheDocument();
  });

  it("runs the doors-open countdown and the join gate inside T-60", async () => {
    renderModule({
      rows: [weekRow()],
      // 12:30 IST, thirty minutes after NOW: inside the T-60 window.
      sessions: [session({ scheduled_at: "2026-08-05T07:00:00Z", zoom_link: null })],
    });

    const panel = await screen.findByRole("region", { name: "Live sessions" });
    expect(within(panel).getByRole("article")).toHaveAttribute("data-session-state", "soon");
    expect(within(panel).getByRole("timer")).toHaveTextContent("30:00");
    // The server withheld the link, so the slot says where it will appear
    // instead of rendering a button that goes nowhere.
    expect(within(panel).getByText("Link drops here 1 hour before.")).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: /join/i })).not.toBeInTheDocument();
  });

  it("keeps the champagne singular when a week holds two imminent sessions", async () => {
    renderModule({
      rows: [weekRow()],
      sessions: [
        session({ id: "a", scheduled_at: "2026-08-05T07:00:00Z", zoom_link: "https://zoom.us/j/1" }),
        session({ id: "b", scheduled_at: "2026-08-05T07:20:00Z", zoom_link: "https://zoom.us/j/2" }),
      ],
    });

    const panel = await screen.findByRole("region", { name: "Live sessions" });
    const joins = within(panel).getAllByRole("link", { name: /join/i });
    expect(joins).toHaveLength(2);
    expect(joins.filter((join) => join.className.includes("btn-champagne"))).toHaveLength(1);
    // And it is the one that happens FIRST.
    expect(joins[0].className).toContain("btn-champagne");
  });

  it("points the recorded state at the screenings route, relative to this one", async () => {
    renderModule({
      rows: [weekRow()],
      sessions: [
        session({
          scheduled_at: "2026-08-01T14:30:00Z",
          recording_url: "https://vimeo.com/1",
        }),
      ],
    });

    const panel = await screen.findByRole("region", { name: "Live sessions" });
    expect(within(panel).getByRole("article")).toHaveAttribute("data-session-state", "recorded");
    expect(
      within(panel).getByRole("link", { name: /watch the recording/i }),
    ).toHaveAttribute("href", "/room/the-forge/screenings");
  });
});

/* ── One clock for the room, and this module does not add a second ────────── */

describe("the room's single clock", () => {
  it("reads the provider's clock instead of starting an interval of its own", async () => {
    const setInterval = vi.spyOn(window, "setInterval");
    renderModule({ rows: [weekRow()] });
    await screen.findByRole("region", { name: "Live sessions" });

    // ONE minute timer for the module, the card, and every slot inside it — the
    // provider's. A SECOND 60s entry is the regression: it is exactly what the
    // module's own `window.setInterval(() => setNowMs(Date.now()), 60_000)` looked
    // like, running beside the room clock and disagreeing with it by up to a
    // minute. (The other cadences the spy sees belong to the shipped
    // `TimeStateBadge` at 30s and to testing-library's own poller; neither is
    // room-clock code, and neither is this task's to change.)
    const minuteTimers = setInterval.mock.calls.filter((call) => call[1] === 60_000);
    expect(minuteTimers).toHaveLength(1);

    setInterval.mockRestore();
  });
});

/* ── The per-cohort feature matrix ───────────────────────────────────────── */

describe("the assignments module flag", () => {
  it("renders no assignment column at all for a cohort that switched it off", async () => {
    renderModule({
      rows: [weekRow()],
      config: configWithModules({ assignments: false }),
      renderAssignment: () => <p>assignment module here</p>,
    });

    await screen.findByRole("region", { name: "Live sessions" });
    // ABSENT, not disabled (ROOMS-ARCHITECTURE §5) — and the renderer is never
    // called, so nothing behind the flag can fetch either.
    expect(screen.queryByRole("region", { name: "Assignment" })).not.toBeInTheDocument();
    expect(screen.queryByText("assignment module here")).not.toBeInTheDocument();
    expect(screen.queryByText("Cut your scene to 90 seconds.")).not.toBeInTheDocument();
  });

  it("renders the column when the key is absent, because the default is on", async () => {
    renderModule({ rows: [weekRow()], config: configWithModules({ leaderboard: true }) });
    expect(await screen.findByRole("region", { name: "Assignment" })).toBeInTheDocument();
  });

  it("threads the peer_review flag through the slot to R2-T4", async () => {
    const seen: RoomAssignmentSlotProps[] = [];
    renderModule({
      rows: [weekRow()],
      config: configWithModules({ peer_review: false }),
      renderAssignment: (props) => {
        seen.push(props);
        return <p>assignment module here</p>;
      },
    });

    await screen.findByText("assignment module here");
    expect(seen[0].peerReviewEnabled).toBe(false);
  });
});

describe("the rail past twelve weeks", () => {
  it("scrolls with snap and never squeezes a tile", () => {
    const weeks = Array.from({ length: 20 }, (_, index) =>
      weekRow({ week_id: `w${index + 1}`, week_number: index + 1 }),
    );
    const { container } = render(
      <WeekRail weeks={weeks} activeWeekId="w9" onSelect={() => {}} />,
    );

    const track = screen.getByRole("list", { name: "Weeks" });
    expect(track.className).toContain("overflow-x-auto");
    expect(track.className).toContain("snap-x");
    // Twenty authored episodes plus R4's permanent anticipation tile.
    expect(track.children).toHaveLength(21);
    for (const tile of Array.from(track.children)) {
      expect(tile.className).toContain("shrink-0");
      expect(tile.className).toContain("snap-start");
    }
    // The strip is one segment per week, and decorative: twenty hit boxes
    // across a phone are 13px wide, under the WCAG 2.5.8 floor, so the rail
    // below is the control and the strip is hidden from the a11y tree.
    expect(container.querySelectorAll("[data-week]")).toHaveLength(20);
    expect(container.querySelector("[data-week]")?.closest("[aria-hidden]")).not.toBeNull();
  });
});

describe("the status token map", () => {
  it("keeps late amber and revision amber, never red", () => {
    expect(submissionStatusTone("late")).toBe("attention");
    expect(submissionStatusTone("needs_revision")).toBe("attention");
    expect(submissionStatusTone("cleared")).toBe("positive");
    expect(submissionStatusTone("reviewed")).toBe("positive");
    expect(submissionStatusTone(null)).toBe("info");
  });

  it("treats archived weeks as done and unknown ones as upcoming", () => {
    expect(weekStatusTone("archived")).toBe("positive");
    expect(weekStatusTone("completed")).toBe("positive");
    expect(weekStatusTone("active")).toBe("accent");
    expect(weekStatusTone("upcoming")).toBe("neutral");
  });
});

describe("the weeks query", () => {
  it("asks the room-scoped RPC for the envelope batch, once", async () => {
    renderModule({ rows: [weekRow()] });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    expect(rpc).toHaveBeenCalledWith("get_room_weeks", {
      p_batch: "batch-1",
      p_offering: OFFERING,
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
  });
});
