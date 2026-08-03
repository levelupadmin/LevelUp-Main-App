import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

import type { RoomFeedBatch, RoomFeedPost } from "@/hooks/useCohortRooms";

const outlet = {
  room: { offering_id: "off-1", offering_title: "The Season", phase: "live" },
  envelope: {
    access: "member",
    batch_id: "batch-a" as string | null,
    role: "member",
    config: { modules: { feed: true } },
  },
};

const BATCH: RoomFeedBatch = {
  id: "batch-a",
  name: "Batch A",
  channels: ["this_week", "assignments_help", "general", "cinematography"],
  channel_labels: { cinematography: "Camera Lab" },
  weeks: [
    { id: "week-4", week_number: 4, theme: "Movement", status: "active" },
  ],
};

const feedResult = {
  batches: [BATCH],
  posts: [] as RoomFeedPost[],
  denied: false,
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  refetch: vi.fn(),
  fetchNextPage: vi.fn(),
};

const mutatePost = vi.fn();
const mutateReply = vi.fn();
const feedCalls: Array<{ offeringId: unknown; options: unknown }> = [];

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({
    user: { id: "member-1" },
    profile: { full_name: "Arun Kumar", avatar_url: null },
  }),
}));

vi.mock("@/components/room/RoomClockProvider", () => ({
  useRoomClock: () => Date.parse("2026-08-03T12:00:00Z"),
}));

vi.mock("@/hooks/useCohortRooms", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/hooks/useCohortRooms")>();
  return {
    ...original,
    useRoomOutlet: () => outlet,
    isLobbyEnvelope: (envelope: { access?: string }) =>
      envelope.access === "pre_member",
    useRoomFeed: (offeringId: unknown, options: unknown) => {
      feedCalls.push({ offeringId, options });
      return feedResult;
    },
    usePostRoomPost: () => ({ mutateAsync: mutatePost, isPending: false }),
    useReplyToRoomPost: () => ({ mutateAsync: mutateReply, isPending: false }),
  };
});

import RoomFeed from "../RoomFeed";
import {
  composerChannel,
  feedChannels,
  roomChannelLabel,
} from "@/lib/roomFeed";

const post = (overrides: Partial<RoomFeedPost> = {}): RoomFeedPost => ({
  id: "post-1",
  offering_id: "off-1",
  batch_id: "batch-a",
  batch_name: "Batch A",
  author_id: "member-2",
  author_name: "Meera Nair",
  author_avatar_url: null,
  author_role: null,
  kind: "post",
  body: "A note from the room",
  media: [],
  channel_key: "general",
  cohort_week_id: null,
  week_number: null,
  reply_count: 0,
  last_activity_at: "2026-08-03T11:00:00Z",
  created_at: "2026-08-03T11:00:00Z",
  replies: [],
  replies_truncated: false,
  ...overrides,
});

const FeedTestRouter = () => (
  <MemoryRouter initialEntries={["/room/season/feed"]}>
    <Routes>
      <Route path="/room/:slug">
        <Route index element={<p>ROOM HOME</p>} />
        <Route path="feed" element={<RoomFeed />} />
      </Route>
    </Routes>
  </MemoryRouter>
);

const renderPage = () => render(<FeedTestRouter />);

beforeEach(() => {
  outlet.room.offering_id = "off-1";
  outlet.envelope.access = "member";
  outlet.envelope.batch_id = "batch-a";
  outlet.envelope.role = "member";
  outlet.envelope.config.modules.feed = true;
  feedCalls.length = 0;
  feedResult.posts = [];
  feedResult.denied = false;
  feedResult.isPending = false;
  feedResult.isError = false;
  feedResult.hasNextPage = false;
  feedResult.isFetchingNextPage = false;
  mutatePost.mockReset().mockResolvedValue("post-new");
  mutateReply.mockReset().mockResolvedValue("reply-new");
});

afterEach(cleanup);

describe("feed taxonomy", () => {
  it("keeps standing, wins and niche channels in a stable deduped order", () => {
    expect(feedChannels([BATCH], BATCH.id)).toEqual([
      "all",
      "this_week",
      "assignments_help",
      "general",
      "wins",
      "cinematography",
    ]);
    expect(roomChannelLabel("assignments_help")).toBe("Assignments help");
    expect(roomChannelLabel("cinematography", "Camera Lab")).toBe("Camera Lab");
    expect(composerChannel("wins")).toBe("general");
  });
});

describe("RoomFeed", () => {
  it("keeps a lobby visitor off the feed RPC", () => {
    outlet.envelope.access = "pre_member";
    renderPage();
    expect(
      screen.getByText(/opens when your enrolment is complete/i),
    ).toBeInTheDocument();
    expect(feedCalls.at(-1)?.options).toMatchObject({ enabled: false });
  });

  it("renders a true empty state separately from a refusal", () => {
    renderPage();
    expect(screen.getByText(/room is quiet for now/i)).toBeInTheDocument();
    cleanup();

    feedResult.denied = true;
    renderPage();
    expect(
      screen.getByText(/access to this room's feed has ended/i),
    ).toBeInTheDocument();
  });

  it("shows a post immediately, disables repeat submit, and sends through the write mutation", async () => {
    let resolveWrite: (value: string) => void = () => undefined;
    mutatePost.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          resolveWrite = resolve;
        }),
    );
    renderPage();

    fireEvent.change(screen.getByPlaceholderText(/Share an update/i), {
      target: { value: "A fresh observation" },
    });
    const submit = screen
      .getAllByRole("button", { name: "Post" })
      .at(-1) as HTMLButtonElement;
    fireEvent.click(submit);

    expect(
      within(await screen.findByTestId("room-post")).getByText(
        "A fresh observation",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Posting...")).toHaveLength(2);
    expect(submit).toBeDisabled();
    expect(mutatePost).toHaveBeenCalledWith(
      expect.objectContaining({
        body: "A fresh observation",
        batchId: "batch-a",
        channelKey: "general",
        kind: "post",
      }),
    );

    resolveWrite("post-new");
    await waitFor(() =>
      expect(screen.queryAllByText("Posting...")).toHaveLength(0),
    );
  });

  it("uses the active week for This week posts and makes the end explicit", async () => {
    feedResult.posts = [post()];
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /This week/i }));
    fireEvent.change(screen.getByPlaceholderText(/Share an update/i), {
      target: { value: "Week four thought" },
    });
    fireEvent.click(
      screen.getAllByRole("button", { name: "Post" }).at(-1) as HTMLElement,
    );

    await waitFor(() =>
      expect(mutatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          channelKey: "this_week",
          cohortWeekId: "week-4",
        }),
      ),
    );
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument();
  });

  it("offers an explicit Earlier page control", () => {
    feedResult.posts = [post()];
    feedResult.hasNextPage = true;
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Earlier" }));
    expect(feedResult.fetchNextPage).toHaveBeenCalledOnce();
    expect(screen.queryByText(/all caught up/i)).not.toBeInTheDocument();
  });

  it("resets the batch filter when the router reuses the page for another room", async () => {
    const page = renderPage();
    expect(feedCalls.at(-1)?.options).toMatchObject({ batchId: "batch-a" });

    outlet.room.offering_id = "off-2";
    outlet.envelope.batch_id = "batch-b";
    page.rerender(<FeedTestRouter />);

    await waitFor(() =>
      expect(feedCalls.at(-1)).toMatchObject({
        offeringId: "off-2",
        options: expect.objectContaining({ batchId: "batch-b", channel: "all" }),
      }),
    );
    expect(
      feedCalls
        .filter((call) => call.offeringId === "off-2")
        .every(
          (call) =>
            (call.options as { batchId?: unknown; channel?: unknown }).batchId ===
              "batch-b" &&
            (call.options as { batchId?: unknown; channel?: unknown }).channel ===
              "all",
        ),
    ).toBe(true);
  });
});
