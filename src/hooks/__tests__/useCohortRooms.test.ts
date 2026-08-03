import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * useCohortRooms — the tests that matter for the room data layer.
 *
 * The one invariant under test everywhere below: DENIED and EMPTY are different
 * answers. `error.code === '42501'` is the only denial signal; an empty array,
 * an empty session list and a zero roster count are all legitimate successes,
 * and any code that conflates them locks out the students the room is for.
 */

const rpc = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

const {
  asRoomPhase,
  envelopePhase,
  isLobbyEnvelope,
  isRoomAccessDenied,
  resolveRoomOffering,
  resolveRoomSlug,
  roomWeekBatchesKey,
  roomWeeksKey,
  useCohortRoom,
  useMyCohortRooms,
  useRoomFeed,
  useRoomResources,
  useRoomWeekBatches,
  useRoomWeeks,
  useRoomView,
} = await import("@/hooks/useCohortRooms");

const OFFERING = "11111111-1111-1111-1111-111111111111";

const denial = () => ({
  code: "42501",
  message: "not a member of this room",
  details: "",
  hint: "",
});

const membershipRow = (over: Record<string, unknown> = {}) => ({
  offering_id: OFFERING,
  offering_title: "The Forge",
  room_slug: "the-forge",
  batch_id: "b-1",
  batch_name: "Batch A1",
  role: "member",
  phase: "live",
  theme: { accent_h: 258, accent_s: 90, accent_l: 68, wordmark_text: "THE FORGE" },
  modules: { leaderboard: true },
  total_weeks: 12,
  current_week: 4,
  next_session_at: "2026-08-01T10:00:00Z",
  next_due_at: null,
  unseen_announcements: 2,
  ...over,
});

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    // `retry` is left to the hooks — the denied-is-terminal rule is theirs to
    // prove. Only the BACKOFF is flattened, so a retried transport failure
    // resolves in the test rather than four seconds later.
    defaultOptions: { queries: { gcTime: 0, staleTime: 0, retryDelay: 0 } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  rpc.mockReset();
});

describe("isRoomAccessDenied", () => {
  it("is true only for the 42501 the RPCs raise", () => {
    expect(isRoomAccessDenied(denial())).toBe(true);
    expect(isRoomAccessDenied({ code: "PGRST116", message: "no rows" })).toBe(false);
    expect(isRoomAccessDenied(new Error("network"))).toBe(false);
  });

  it("never reads an empty result as a denial", () => {
    expect(isRoomAccessDenied([])).toBe(false);
    expect(isRoomAccessDenied(null)).toBe(false);
    expect(isRoomAccessDenied(undefined)).toBe(false);
  });
});

describe("asRoomPhase", () => {
  it("passes the four CHECK-constrained phases through", () => {
    for (const phase of ["pre_start", "live", "wrap", "alumni"]) {
      expect(asRoomPhase(phase)).toBe(phase);
    }
  });

  it("falls back to pre_start for a room with no config row", () => {
    expect(asRoomPhase(null)).toBe("pre_start");
    expect(asRoomPhase("LIVE")).toBe("pre_start");
  });
});

describe("slug resolution", () => {
  const rooms = [
    { offering_id: OFFERING, room_slug: "the-forge" },
    { offering_id: "other", room_slug: null },
  ] as never;

  it("resolves a slug the caller is a member of", () => {
    expect(resolveRoomSlug(rooms, "the-forge")?.offering_id).toBe(OFFERING);
  });

  it("returns null for a slug outside the caller's memberships", () => {
    expect(resolveRoomSlug(rooms, "someone-elses-room")).toBeNull();
    expect(resolveRoomSlug(rooms, undefined)).toBeNull();
  });

  it("resolves an offering id, including one with no slug", () => {
    expect(resolveRoomOffering(rooms, "other")?.room_slug).toBeNull();
    expect(resolveRoomOffering(rooms, "nope")).toBeNull();
  });
});

describe("useMyCohortRooms", () => {
  it("maps the RPC row onto the summary shape", async () => {
    rpc.mockResolvedValue({ data: [membershipRow()], error: null });
    const { result } = renderHook(() => useMyCohortRooms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const room = result.current.data![0];
    expect(room).toMatchObject({
      offering_id: OFFERING,
      room_slug: "the-forge",
      phase: "live",
      total_weeks: 12,
      current_week: 4,
      next_due_at: null,
      unseen_announcements: 2,
    });
    // Structurally a RoomConfigInput, so it feeds resolveTheme with no adapter.
    expect(room.theme).toMatchObject({ accent_h: 258 });
  });

  it("marks a membership with no config row as unroutable, not broken", async () => {
    rpc.mockResolvedValue({
      data: [membershipRow({ room_slug: null, phase: null, total_weeks: 0, current_week: null })],
      error: null,
    });
    const { result } = renderHook(() => useMyCohortRooms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data![0]).toMatchObject({
      room_slug: null,
      phase: "pre_start",
      total_weeks: 0,
      current_week: null,
    });
  });

  it("treats zero rooms as a legitimate empty, never an error", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useMyCohortRooms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("throws the PostgrestError so error.code survives", async () => {
    rpc.mockResolvedValue({ data: null, error: denial() });
    const { result } = renderHook(() => useMyCohortRooms(), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(isRoomAccessDenied(result.current.error)).toBe(true);
    // The hook hands the answer back as a boolean so no consumer re-derives it.
    expect(result.current.denied).toBe(true);
    // Denials are terminal — exactly one attempt, no retry storm.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not mark a successful empty list as denied", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useMyCohortRooms(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.denied).toBe(false);
  });
});

describe("useCohortRoom", () => {
  it("normalises a member envelope", async () => {
    rpc.mockResolvedValue({
      data: {
        offering_id: OFFERING,
        batch_id: "b-1",
        role: "member",
        access: "member",
        config: { slug: "the-forge", phase: "live", theme: {}, modules: {} },
        roster_count: 18,
        announcements: [{ id: "a1", body: "Welcome" }],
        sessions: [{ id: "s1", title: "Week 1", scheduled_at: "2026-08-01T10:00:00Z" }],
        attendance_pct: 92,
      },
      error: null,
    });
    const { result } = renderHook(() => useCohortRoom(OFFERING), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      access: "member",
      roster_count: 18,
      attendance_pct: 92,
    });
    expect(result.current.data!.sessions).toHaveLength(1);
  });

  it("reads a pre_member as the lobby — a real room, redacted, not an error", async () => {
    rpc.mockResolvedValue({
      data: {
        offering_id: OFFERING,
        batch_id: null,
        role: "pre_member",
        access: "pre_member",
        config: { slug: "the-forge", phase: "pre_start" },
        roster_count: 0,
        announcements: [],
        sessions: [],
      },
      error: null,
    });
    const { result } = renderHook(() => useCohortRoom(OFFERING), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({
      access: "pre_member",
      roster_count: 0,
      // Absent in the lobby branch — null, never a fabricated 0.
      attendance_pct: null,
    });
    // The lobby is a SUCCESS, not a denial, and not an error.
    expect(isLobbyEnvelope(result.current.data)).toBe(true);
    expect(result.current.denied).toBe(false);
    expect(envelopePhase(result.current.data)).toBe("pre_start");
    expect(result.current.isError).toBe(false);
  });

  it("does not fire while the offering id is unknown", () => {
    renderHook(() => useCohortRoom(null), { wrapper });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("feed and resource envelopes", () => {
  it("normalises one feed page and keeps the server cursor explicit", async () => {
    rpc.mockResolvedValue({
      data: {
        posts: [{
          id: "post-1",
          offering_id: OFFERING,
          batch_id: "b-1",
          batch_name: "Batch A1",
          author_id: "user-2",
          author_name: "Meera",
          kind: "question",
          body: "Where should I start?",
          media: [],
          channel_key: "this_week",
          cohort_week_id: "week-4",
          week_number: 4,
          reply_count: 1,
          last_activity_at: "2026-08-03T10:00:00Z",
          created_at: "2026-08-03T09:00:00Z",
          replies: [{ id: "reply-1", author_id: "mentor-1", author_name: "Priya", body: "Start here.", is_mentor_answer: true, created_at: "2026-08-03T10:00:00Z" }],
          replies_truncated: false,
        }],
        batches: [{ id: "b-1", name: "Batch A1", channels: ["this_week", "general"], channel_labels: { ai_tools: "AI Tools" }, weeks: [{ id: "week-4", week_number: 4, theme: "Movement", status: "active" }] }],
        selected_batch_id: "b-1",
        has_more: true,
        next_cursor: { activity: "2026-08-03T10:00:00Z", id: "post-1" },
      },
      error: null,
    });
    const { result } = renderHook(() => useRoomFeed(OFFERING, { batchId: "b-1", channel: "this_week" }), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.posts[0]).toMatchObject({ kind: "question", week_number: 4 });
    expect(result.current.posts[0]?.replies[0]).toMatchObject({ is_mentor_answer: true });
    expect(result.current.batches[0]?.channels).toEqual(["this_week", "general"]);
    expect(result.current.batches[0]?.channel_labels).toEqual({ ai_tools: "AI Tools" });
    expect(result.current.hasNextPage).toBe(true);
    expect(rpc).toHaveBeenCalledWith("get_room_feed", expect.objectContaining({
      p_offering: OFFERING,
      p_batch: "b-1",
      p_channel: "this_week",
      p_before_activity: null,
      p_before_id: null,
    }));
  });

  it("keeps an empty binder successful and a 42501 binder refused", async () => {
    rpc.mockResolvedValueOnce({
      data: { resources: [], batches: [{ id: "b-1", name: "Batch A1" }], selected_batch_id: "b-1", truncated: false },
      error: null,
    });
    const first = renderHook(() => useRoomResources(OFFERING, { batchId: "b-1" }), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    expect(first.result.current.data?.resources).toEqual([]);
    expect(first.result.current.denied).toBe(false);
    first.unmount();

    rpc.mockResolvedValue({ data: null, error: denial() });
    const second = renderHook(() => useRoomResources(OFFERING, { batchId: "b-1" }), { wrapper });
    await waitFor(() => expect(second.result.current.isError).toBe(true));
    expect(second.result.current.denied).toBe(true);
  });
});

describe("useRoomWeeks", () => {
  const week = {
    cohort_batch_id: "b-1",
    batch_label: "Batch A1",
    week_id: "week-1",
    week_number: 1,
    theme: "Find the signal",
    description: null,
    starts_on: "2026-08-03",
    ends_on: "2026-08-09",
    assignment_prompt: "Publish one useful idea.",
    assignment_due_at: null,
    feedback_session_at: null,
    week_status: "active",
    live_session_id: null,
    live_session_title: null,
    live_session_at: null,
    live_session_zoom_link: null,
    submission_id: null,
    submission_status: null,
    submission_rating: null,
    submission_feedback: null,
    submission_submitted_at: null,
    attended: false,
    attendance_marked: false,
  };

  it("reads the server-authorized room batch without a client-supplied user id", async () => {
    rpc.mockResolvedValue({ data: [week], error: null });
    const { result } = renderHook(
      () => useRoomWeeks(OFFERING, { batchId: "b-1" }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({
      cohort_batch_id: "b-1",
      week_id: "week-1",
      week_status: "active",
    });
    expect(rpc).toHaveBeenCalledWith("get_room_weeks", {
      p_offering: OFFERING,
      p_batch: "b-1",
    });
    expect(rpc.mock.calls[0]?.[1]).not.toHaveProperty("p_user_id");
  });

  it("keeps batch and user identity in the cache key", () => {
    expect(roomWeeksKey(OFFERING, "b-1", "user-1")).not.toEqual(
      roomWeeksKey(OFFERING, "b-2", "user-1"),
    );
    expect(roomWeeksKey(OFFERING, "b-1", "user-1")).not.toEqual(
      roomWeeksKey(OFFERING, "b-1", "user-2"),
    );
  });

  it("distinguishes a room denial from a legitimate empty schedule", async () => {
    rpc.mockResolvedValueOnce({ data: [], error: null });
    const empty = renderHook(
      () => useRoomWeeks(OFFERING, { batchId: "b-1" }),
      { wrapper },
    );
    await waitFor(() => expect(empty.result.current.isSuccess).toBe(true));
    expect(empty.result.current.data).toEqual([]);
    expect(empty.result.current.denied).toBe(false);
    empty.unmount();

    rpc.mockResolvedValue({ data: null, error: denial() });
    const refused = renderHook(
      () => useRoomWeeks(OFFERING, { batchId: "b-1" }),
      { wrapper },
    );
    await waitFor(() => expect(refused.result.current.isError).toBe(true));
    expect(refused.result.current.denied).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("useRoomWeekBatches", () => {
  it("reads only the server-authorized metadata choices", async () => {
    rpc.mockResolvedValue({
      data: [
        { batch_id: "b-1", batch_label: "Batch A1" },
        { batch_id: "b-2", batch_label: "Batch A2" },
      ],
      error: null,
    });
    const { result } = renderHook(() => useRoomWeekBatches(OFFERING), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { batch_id: "b-1", batch_label: "Batch A1" },
      { batch_id: "b-2", batch_label: "Batch A2" },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_room_week_batches", { p_offering: OFFERING });
  });

  it("keeps caller identity in the batch-choice cache key", () => {
    expect(roomWeekBatchesKey(OFFERING, "user-1")).not.toEqual(
      roomWeekBatchesKey(OFFERING, "user-2"),
    );
  });
});

describe("useRoomView", () => {
  it("is ready when the slug resolves and the envelope opens", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "get_my_cohort_rooms"
        ? Promise.resolve({ data: [membershipRow()], error: null })
        : Promise.resolve({
            data: {
              offering_id: OFFERING,
              access: "member",
              config: { slug: "the-forge", phase: "live" },
              roster_count: 3,
              announcements: [],
              sessions: [],
            },
            error: null,
          }),
    );
    const { result } = renderHook(() => useRoomView("the-forge"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.room?.offering_id).toBe(OFFERING);
    expect(result.current.envelope?.roster_count).toBe(3);
  });

  it("collapses private and non-existent into one non-revealing state", async () => {
    rpc.mockResolvedValue({ data: [membershipRow()], error: null });
    const { result } = renderHook(() => useRoomView("someone-elses-room"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    // Never probed the envelope: an unresolved slug is not an offering id, so
    // the route cannot be used to test which rooms exist.
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("surfaces a resolved-but-denied room as denied, not as empty", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "get_my_cohort_rooms"
        ? Promise.resolve({ data: [membershipRow()], error: null })
        : Promise.resolve({ data: null, error: denial() }),
    );
    const { result } = renderHook(() => useRoomView("the-forge"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("denied"));
  });

  it("calls a dropped envelope request an error, not a private room", async () => {
    rpc.mockImplementation((fn: string) =>
      fn === "get_my_cohort_rooms"
        ? Promise.resolve({ data: [membershipRow()], error: null })
        : Promise.resolve({ data: null, error: { code: "PGRST301", message: "network" } }),
    );
    const { result } = renderHook(() => useRoomView("the-forge"), { wrapper });

    // Transport, not access: a member of this very room must not be told it is
    // private because the request fell over.
    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("treats an unauthenticated membership denial as non-revealing, not retryable", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { ...denial(), message: "authentication required to read cohort rooms" },
    });
    const { result } = renderHook(() => useRoomView("the-forge"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
  });

  it("never leaves a signed-in visitor on a permanent spinner", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useRoomView("the-forge"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.rooms).toEqual([]);
  });
});
