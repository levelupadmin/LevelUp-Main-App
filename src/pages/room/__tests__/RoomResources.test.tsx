import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { RoomResource } from "@/hooks/useCohortRooms";

const outlet = {
  room: { offering_id: "off-1", phase: "live" },
  envelope: {
    access: "member",
    batch_id: "batch-a",
    config: { modules: { resources: true } },
  },
};

const resourceResult = {
  data: {
    resources: [] as RoomResource[],
    batches: [{ id: "batch-a", name: "Batch A" }],
    selected_batch_id: "batch-a",
    truncated: false,
  },
  denied: false,
  isPending: false,
  isError: false,
  refetch: vi.fn(),
};

const resourceCalls: Array<{ offeringId: unknown; options: unknown }> = [];

vi.mock("@/hooks/useCohortRooms", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/hooks/useCohortRooms")>();
  return {
    ...original,
    useRoomOutlet: () => outlet,
    isLobbyEnvelope: (envelope: { access?: string }) =>
      envelope.access === "pre_member",
    useRoomResources: (offeringId: unknown, options: unknown) => {
      resourceCalls.push({ offeringId, options });
      return resourceResult;
    },
  };
});

import RoomResources from "../RoomResources";
import {
  groupRoomResources,
  roomResourceDomain,
  safeRoomResourceUrl,
} from "@/lib/roomResources";

const resource = (
  overrides: Partial<RoomResource> & { id: string },
): RoomResource => ({
  offering_id: "off-1",
  batch_id: "batch-a",
  batch_name: "Batch A",
  cohort_week_id: "week-1",
  week_number: 1,
  week_theme: "Seeing light",
  title: "A useful link",
  kind: "link",
  url: "https://www.example.com/reference?q=1",
  sort_order: 0,
  created_at: "2026-08-03T10:00:00Z",
  added_by: "mentor-1",
  added_by_name: "Meera",
  ...overrides,
});

const ResourcesTestRouter = () => (
  <MemoryRouter initialEntries={["/room/season/resources"]}>
    <Routes>
      <Route path="/room/:slug">
        <Route index element={<p>ROOM HOME</p>} />
        <Route path="resources" element={<RoomResources />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const renderPage = () => render(<ResourcesTestRouter />);

beforeEach(() => {
  outlet.room.offering_id = "off-1";
  outlet.room.phase = "live";
  outlet.envelope.access = "member";
  outlet.envelope.batch_id = "batch-a";
  outlet.envelope.config.modules.resources = true;
  resourceCalls.length = 0;
  resourceResult.data.resources = [];
  resourceResult.data.truncated = false;
  resourceResult.denied = false;
  resourceResult.isPending = false;
  resourceResult.isError = false;
});

afterEach(cleanup);

describe("resource binder grouping and links", () => {
  it("puts pinned resources first and keeps equal-numbered weeks from different batches separate", () => {
    const groups = groupRoomResources([
      resource({ id: "a1" }),
      resource({
        id: "b1",
        batch_id: "batch-b",
        batch_name: "Batch B",
        cohort_week_id: "week-b1",
      }),
      resource({
        id: "pin",
        cohort_week_id: null,
        week_number: null,
        week_theme: null,
        batch_id: null,
        batch_name: null,
      }),
    ]);

    expect(groups.map((group) => group.key)).toEqual([
      "pinned",
      "batch-a:week-1",
      "batch-b:week-b1",
    ]);
    expect(groups[0]?.label).toBe("Pinned for the cohort");
    expect(groups[1]?.label).toContain("Batch A");
    expect(groups[2]?.label).toContain("Batch B");
  });

  it("allows only external http(s) URLs and extracts a clean source domain", () => {
    expect(safeRoomResourceUrl("javascript:alert(1)")).toBeNull();
    expect(safeRoomResourceUrl("not a url")).toBeNull();
    expect(safeRoomResourceUrl("https://www.example.com/guide")).toBe(
      "https://www.example.com/guide",
    );
    expect(roomResourceDomain("https://www.example.com/guide")).toBe(
      "example.com",
    );
  });
});

describe("RoomResources", () => {
  it("renders pinned then weekly groups, source domains, and a non-clickable dead link", () => {
    resourceResult.data.resources = [
      resource({ id: "week" }),
      resource({
        id: "pin",
        title: "Start here",
        cohort_week_id: null,
        week_number: null,
        week_theme: null,
      }),
      resource({
        id: "dead",
        title: "Old handout",
        url: "javascript:alert(1)",
      }),
    ];
    const { container } = renderPage();

    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Pinned for the cohort",
      "Batch A · Week 1: Seeing light",
    ]);
    expect(
      screen.getAllByText(
        /example\.com · (Batch A|All batches) · link · added by Meera/i,
      ),
    ).toHaveLength(2);
    const deadRow = screen.getByText("Old handout").closest("div.flex");
    expect(deadRow).not.toBeNull();
    expect(deadRow?.querySelector("span.font-mono")).toHaveTextContent(
      "Link unavailable · Batch A · link",
    );
    expect(container.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("does not issue the binder read for a lobby visitor", () => {
    outlet.envelope.access = "pre_member";
    renderPage();

    expect(
      screen.getByText(/opens when your enrolment is complete/i),
    ).toBeInTheDocument();
    expect(resourceCalls.at(-1)?.options).toEqual({
      batchId: "batch-a",
      enabled: false,
    });
  });

  it("keeps denied and empty as different answers", () => {
    resourceResult.denied = true;
    renderPage();
    expect(
      screen.getByText(/access to this room's resources has ended/i),
    ).toBeInTheDocument();
    cleanup();

    resourceResult.denied = false;
    renderPage();
    expect(screen.getByText(/ready for its first entry/i)).toBeInTheDocument();
  });

  it("drops the previous batch filter when a slug-only navigation reuses the page", async () => {
    const page = renderPage();
    expect(resourceCalls.at(-1)?.options).toMatchObject({ batchId: "batch-a" });

    outlet.room.offering_id = "off-2";
    outlet.envelope.batch_id = "batch-b";
    page.rerender(<ResourcesTestRouter />);

    await waitFor(() =>
      expect(resourceCalls.at(-1)).toMatchObject({
        offeringId: "off-2",
        options: expect.objectContaining({ batchId: "batch-b" }),
      }),
    );
    expect(
      resourceCalls
        .filter((call) => call.offeringId === "off-2")
        .every(
          (call) =>
            (call.options as { batchId?: unknown }).batchId === "batch-b",
        ),
    ).toBe(true);
  });
});
