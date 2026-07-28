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
  useCohortRoom,
  useMyCohortRooms,
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
    defaultOptions: { queries: { gcTime: 0, staleTime: 0 } },
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

  it("never leaves a signed-in visitor on a permanent spinner", async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useRoomView("the-forge"), { wrapper });

    await waitFor(() => expect(result.current.status).toBe("unavailable"));
    expect(result.current.rooms).toEqual([]);
  });
});
