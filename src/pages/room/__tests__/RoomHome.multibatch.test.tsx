import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useRoomWeeks: vi.fn(),
  useRoomWeekBatches: vi.fn(),
  state: {
    room: {} as Record<string, unknown>,
    envelope: {} as Record<string, unknown>,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "user-1" } }),
}));

vi.mock("@/hooks/useCohortRooms", () => ({
  isLobbyEnvelope: () => false,
  useRoomOutlet: () => ({ ...mocks.state, refetch: vi.fn() }),
  useRoomOfferingMeta: () => ({ data: null }),
  useRoomResources: () => ({ data: { resources: [] } }),
  useRoomSeenWatermark: vi.fn(),
  useRoomWeekBatches: (...args: unknown[]) => mocks.useRoomWeekBatches(...args),
  useRoomWeeks: (...args: unknown[]) => mocks.useRoomWeeks(...args),
}));

vi.mock("@/components/room/RoomClockProvider", () => ({
  useRoomClock: () => Date.parse("2026-08-05T06:30:00Z"),
}));

vi.mock("@/components/room/WeeksModule", () => ({
  default: () => null,
  defaultWeek: (weeks: Array<{ week_status: string }>) =>
    weeks.find((week) => week.week_status === "active") ?? weeks[0] ?? null,
  groupSessionsByWeek: () => new Map(),
  sessionsForWeek: () => [],
}));

vi.mock("@/components/room/ThisWeekCard", () => ({
  default: ({
    batchId,
    assignmentUrgency,
  }: {
    batchId: string | null;
    assignmentUrgency: boolean;
  }) => (
    <div
      data-testid="home-week-hero"
      data-batch-id={batchId ?? "none"}
      data-assignment-urgency={String(assignmentUrgency)}
    />
  ),
}));

vi.mock("@/components/room/AnnouncementsModule", () => ({ default: () => null }));
vi.mock("@/components/room/PreStartCard", () => ({ default: () => null }));
vi.mock("@/components/room/AssignmentModule", () => ({ default: () => null }));
vi.mock("@/components/room/CertificateMoment", () => ({ default: () => null }));
vi.mock("@/components/room/AlumniBanner", () => ({ default: () => null }));

const RoomHome = (await import("@/pages/room/RoomHome")).default;

const batchRows = [
  { batch_id: "batch-1", batch_label: "Batch A1" },
  { batch_id: "batch-2", batch_label: "Batch A2" },
];

const week = (batchId: string, label: string) => ({
  cohort_batch_id: batchId,
  batch_label: label,
  week_id: `${batchId}-week-1`,
  week_number: 1,
  theme: `${label} curriculum`,
  assignment_prompt: `${label} assignment`,
  submission_id: null,
  week_status: "active",
});

function renderHome(path = "/room/the-forge") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <RoomHome />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.useRoomWeeks.mockReset();
  mocks.useRoomWeekBatches.mockReset();
  mocks.state.room = {
    offering_id: "offering-1",
    offering_title: "The Forge",
    room_slug: "the-forge",
    batch_id: null,
    batch_name: null,
    role: "mentor",
    phase: "live",
    total_weeks: 12,
    current_week: 1,
  };
  mocks.state.envelope = {
    offering_id: "offering-1",
    batch_id: null,
    role: "mentor",
    access: "member",
    config: { modules: { weeks: true } },
    roster_count: 0,
    announcements: [],
    sessions: [],
  };
  mocks.useRoomWeekBatches.mockReturnValue({
    data: batchRows,
    isPending: false,
    isError: false,
  });
  mocks.useRoomWeeks.mockReturnValue({
    data: [],
    isPending: true,
    isError: false,
  });
});

describe("RoomHome offering-wide Weeks hero", () => {
  it("does not choose an arbitrary hero when several batches exist", () => {
    renderHome();

    expect(mocks.useRoomWeeks).toHaveBeenCalledWith("offering-1", {
      batchId: null,
      enabled: false,
    });
    expect(screen.queryByTestId("home-week-hero")).toBeNull();
    expect(screen.getByText("Choose a cohort batch")).toBeInTheDocument();
  });

  it("uses a valid query selection, labels it, and carries it into Weeks", () => {
    mocks.useRoomWeeks.mockReturnValue({
      data: [week("batch-2", "Batch A2")],
      isPending: false,
      isError: false,
    });
    renderHome("/room/the-forge?batch=batch-2");

    expect(mocks.useRoomWeeks).toHaveBeenCalledWith("offering-1", {
      batchId: "batch-2",
      enabled: true,
    });
    expect(screen.getByTestId("home-week-hero")).toHaveAttribute("data-batch-id", "batch-2");
    expect(screen.getByTestId("home-week-hero")).toHaveAttribute(
      "data-assignment-urgency",
      "false",
    );
    expect(screen.getByText("Curriculum · Batch A2")).toBeInTheDocument();
    expect(screen.getByText("Open the week to review the curriculum.")).toBeInTheDocument();
    expect(screen.queryByText("Open the week to submit.")).toBeNull();
    expect(screen.getByRole("link", { name: /Curriculum · Batch A2/i })).toHaveAttribute(
      "href",
      expect.stringContaining("weeks/1?batch=batch-2"),
    );
  });

  it("uses the only authorized batch without requiring a selector", () => {
    mocks.useRoomWeekBatches.mockReturnValue({
      data: [batchRows[0]],
      isPending: false,
      isError: false,
    });
    mocks.useRoomWeeks.mockReturnValue({
      data: [week("batch-1", "Batch A1")],
      isPending: false,
      isError: false,
    });
    renderHome();

    expect(mocks.useRoomWeeks).toHaveBeenCalledWith("offering-1", {
      batchId: "batch-1",
      enabled: true,
    });
    expect(screen.getByTestId("home-week-hero")).toHaveAttribute("data-batch-id", "batch-1");
  });
});
