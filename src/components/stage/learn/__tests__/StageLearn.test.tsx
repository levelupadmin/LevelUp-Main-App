import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const state = vi.hoisted(() => ({
  buyer: { isLoading: false, isError: false, data: undefined as unknown, refetch: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/hooks/usePageTitle", () => ({ default: () => {} }));
vi.mock("@/hooks/useWishlist", () => ({ useWishlist: () => ({ wishlistedIds: new Set(), loading: false }) }));
vi.mock("@/lib/haptics", () => ({ tapTick: () => Promise.resolve(), hapticSelection: () => Promise.resolve() }));
vi.mock("@/components/stage/home/buyer", async (orig) => ({
  ...(await orig<typeof import("@/components/stage/home/buyer")>()),
  useBuyerHome: () => state.buyer,
}));
vi.mock("@/components/stage/home/catalog", async (orig) => ({
  ...(await orig<typeof import("@/components/stage/home/catalog")>()),
  useStageCatalog: () => ({ data: null, isLoading: false, isError: false, refetch: vi.fn(), owned: [] }),
}));

import StageLearn from "../StageLearn";
import { buildBuyerHome } from "@/components/stage/home/buyer";

const NOW = Date.now();
const D = 864e5;

const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><StageLearn /></MemoryRouter>);

describe("StageLearn (Stage My learning)", () => {
  beforeEach(() => {
    state.buyer = { isLoading: false, isError: false, data: undefined, refetch: vi.fn() };
  });

  it("shows an error with Retry, not the empty state, when the read of what they own fails", () => {
    state.buyer.isError = true;
    renderAt("/learn");
    expect(screen.getByText("We couldn't load your learning. Check your connection and try again.")).toBeInTheDocument();
    expect(screen.queryByText("Your learning shows up here")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(state.buyer.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good answer on screen when only a refetch failed", () => {
    state.buyer.isError = true;
    state.buyer.data = buildBuyerHome({
      enrolments: [{ id: "en1", offering_id: "mc", offerings: { id: "mc", slug: "mc", title: "Masterclass", thumbnail_url: null, product_tier: "masterclass" } }],
      links: [{ offering_id: "mc", course_id: "a" }],
      workshops: [], progress: [], submissions: [], batches: [], weeks: [], sessions: [],
      courses: [{ id: "a", title: "The Course", total_lessons: null, thumbnail_url: null }],
      sections: [{ id: "s1", course_id: "a", sort_order: 1 }],
      chapters: [{ id: "c1", section_id: "s1", title: "One", content_type: "video", sort_order: 1 }],
    }, NOW);
    renderAt("/learn");
    expect(screen.getByText("The Course")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
  });

  it("lists every past recording on Schedule, each opening the recording itself", () => {
    state.buyer.data = buildBuyerHome({
      enrolments: [{ id: "en1", offering_id: "co", offerings: { id: "co", slug: "co", title: "Cohort", thumbnail_url: null, product_tier: "live_cohort" } }],
      links: [{ offering_id: "co", course_id: "room" }],
      workshops: [], progress: [], submissions: [], courses: [], sections: [], chapters: [], weeks: [],
      batches: [{ id: "b1", name: "Batch 25", offering_id: "co" }],
      sessions: [
        { id: "old", course_id: "room", week_id: null, title: "Week 1 class", scheduled_at: new Date(NOW - 60 * D).toISOString(), duration_minutes: 60, status: "completed", recording_url: "https://rec.example/week1.mp4" },
        { id: "new", course_id: "room", week_id: null, title: "Week 6 class", scheduled_at: new Date(NOW - 2 * D).toISOString(), duration_minutes: 60, status: "completed", recording_url: "https://rec.example/week6.mp4" },
      ],
    }, NOW);
    renderAt("/learn?seg=live");
    const links = screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("https://rec.example/"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["https://rec.example/week6.mp4", "https://rec.example/week1.mp4"]);
    expect(links[0]).toHaveAttribute("target", "_blank");
    expect(links[0]).toHaveAttribute("rel", "noopener noreferrer");
    expect(links[1]).toHaveTextContent("Batch 25");
  });
});
