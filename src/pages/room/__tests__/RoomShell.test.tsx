import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";

const shellState = {
  room: {
    offering_id: "offering-1",
    offering_title: "Creator Academy",
    room_slug: "creator-academy",
    batch_id: "batch-1",
    batch_name: "Edition 2",
    role: "member",
    phase: "live",
    current_week: 1,
    total_weeks: 2,
    theme: null,
    modules: null,
  },
  envelope: {
    offering_id: "offering-1",
    batch_id: "batch-1",
    role: "member",
    access: "member",
    config: {
      offering_id: "offering-1",
      batch_id: "batch-1",
      slug: "creator-academy",
      phase: "live",
      theme: null,
      vocab: null,
      modules: {
        weeks: true,
        recordings: true,
        feed: true,
        roster: true,
        resources: true,
        demo_day: false,
      },
      alumni_since: null,
      created_at: "2026-08-01T00:00:00Z",
      updated_at: "2026-08-01T00:00:00Z",
    },
    roster_count: 1,
    announcements: [],
    sessions: [],
    attendance_pct: null,
  },
  rooms: [] as Array<Record<string, unknown>>,
  refetch: vi.fn(),
};

vi.mock("@/hooks/usePageTitle", () => ({ default: vi.fn() }));

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));

vi.mock("@/hooks/useCohortRooms", () => ({
  isLobbyEnvelope: (envelope: { access?: string }) => envelope.access === "pre_member",
  resolveRoomOffering: vi.fn(),
  useCohortRoom: vi.fn(),
  useMyCohortRooms: vi.fn(),
  useRoomOfferingMeta: () => ({ data: { cohort_start_date: null } }),
  useRoomView: () => ({
    status: "ready",
    room: shellState.room,
    envelope: shellState.envelope,
    rooms: shellState.rooms,
    refetch: shellState.refetch,
  }),
}));

vi.mock("@/components/room/RoomClockProvider", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/room/RoomEntrance", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/room/RoomMasthead", () => ({
  default: ({ compact }: { compact?: boolean }) => (
    <div data-testid="room-masthead-stub" data-compact={String(!!compact)} />
  ),
}));

vi.mock("@/components/room/RoomSwitcher", () => ({
  default: () => <div data-testid="room-switcher-stub" />,
}));

const RoomShell = (await import("../RoomShell")).default;

const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  HTMLElement.prototype,
  "scrollIntoView",
);
const scrollIntoView = vi.fn();

function renderShell(path = "/room/creator-academy") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/room/:slug" element={<RoomShell />}>
          <Route index element={<div data-testid="room-home" />} />
          <Route path="weeks/:n" element={<div data-testid="room-weeks" />} />
          <Route path="screenings" element={<div data-testid="room-screenings" />} />
          <Route path="feed" element={<div data-testid="room-feed" />} />
          <Route path="people" element={<div data-testid="room-people" />} />
          <Route path="resources" element={<div data-testid="room-resources" />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function setRailGeometry(
  rail: HTMLElement,
  { clientWidth, scrollWidth, scrollLeft }: {
    clientWidth: number;
    scrollWidth: number;
    scrollLeft: number;
  },
) {
  Object.defineProperties(rail, {
    clientWidth: { configurable: true, value: clientWidth },
    scrollWidth: { configurable: true, value: scrollWidth },
    scrollLeft: { configurable: true, value: scrollLeft, writable: true },
  });
}

beforeEach(() => {
  shellState.rooms = [shellState.room];
  shellState.refetch.mockReset();
  scrollIntoView.mockReset();
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
    writable: true,
  });
});

afterEach(cleanup);

afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
});

describe("RoomShell responsive room chrome", () => {
  it.each([
    ["false", "/room/creator-academy"],
    ["true", "/room/creator-academy/weeks/1"],
    ["true", "/room/creator-academy/resources"],
  ])("sets compact masthead=%s for %s", (compact, path) => {
    renderShell(path);
    expect(screen.getByTestId("room-masthead-stub")).toHaveAttribute(
      "data-compact",
      compact,
    );
  });

  it("lets the masthead own the single-room nameplate and mounts a switcher only for multiple rooms", () => {
    const first = renderShell();
    expect(screen.queryByTestId("room-switcher-stub")).toBeNull();

    first.unmount();
    shellState.rooms = [
      shellState.room,
      { ...shellState.room, offering_id: "offering-2", room_slug: "second-room" },
    ];
    renderShell();
    expect(screen.getByTestId("room-switcher-stub")).toBeInTheDocument();
  });

  it("reveals a deep active tab when the mobile rail overflows", async () => {
    renderShell();
    const rail = screen.getByRole("navigation", { name: "Room sections" });
    setRailGeometry(rail, { clientWidth: 320, scrollWidth: 620, scrollLeft: 0 });

    fireEvent.click(screen.getByRole("link", { name: "Resources" }));

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Resources" })).toHaveAttribute(
        "aria-current",
        "page",
      );
      expect(scrollIntoView).toHaveBeenCalledWith({
        block: "nearest",
        inline: "nearest",
      });
    });
  });

  it("shows a pointer-safe mobile edge cue only while more tabs remain to the right", () => {
    renderShell();
    const rail = screen.getByRole("navigation", { name: "Room sections" });
    setRailGeometry(rail, { clientWidth: 320, scrollWidth: 620, scrollLeft: 0 });

    fireEvent.scroll(rail);
    const cue = screen.getByTestId("room-tabs-scroll-cue");
    expect(cue).toHaveAttribute("aria-hidden", "true");
    expect(cue.className).toContain("pointer-events-none");
    expect(cue.className).toContain("absolute");
    expect(cue.className).toContain("right-0");
    expect(cue.className).toContain("md:hidden");
    expect(rail.className).toContain("scroll-pr-12");
    expect(rail.className).toContain("pr-12");

    rail.scrollLeft = 300;
    fireEvent.scroll(rail);
    expect(screen.queryByTestId("room-tabs-scroll-cue")).toBeNull();
  });
});
