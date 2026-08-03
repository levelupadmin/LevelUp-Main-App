import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const roomRole = { current: "member" };

vi.mock("@/hooks/useCohortRooms", () => ({
  isLobbyEnvelope: vi.fn(),
  useRoomOfferingMeta: vi.fn(),
  useRoomOutlet: () => ({
    room: { role: roomRole.current, phase: "live" },
    envelope: { batch_id: "batch-1", config: { modules: { weeks: true } } },
  }),
  useRoomResources: vi.fn(),
  useRoomSeenWatermark: vi.fn(),
  useRoomWeeks: vi.fn(),
}));

vi.mock("@/components/room/WeeksModule", () => ({
  default: ({ renderAssignment }: { renderAssignment?: unknown }) => (
    <div data-testid="weeks-route" data-has-assignment={String(!!renderAssignment)} />
  ),
  defaultWeek: vi.fn(),
  groupSessionsByWeek: vi.fn(),
  sessionsForWeek: vi.fn(),
}));

const { RoomWeeksRoute } = await import("@/pages/room/RoomHome");

describe("RoomWeeksRoute assignment role", () => {
  beforeEach(() => {
    roomRole.current = "member";
  });

  it.each(["member", "alumni"])("keeps submission controls for %s", (role) => {
    roomRole.current = role;
    render(<RoomWeeksRoute />);
    expect(screen.getByTestId("weeks-route")).toHaveAttribute(
      "data-has-assignment",
      "true",
    );
  });

  it.each(["mentor", "host", "pre_member"])(
    "keeps the assignment prompt read-only for %s",
    (role) => {
      roomRole.current = role;
      render(<RoomWeeksRoute />);
      expect(screen.getByTestId("weeks-route")).toHaveAttribute(
        "data-has-assignment",
        "false",
      );
    },
  );
});
