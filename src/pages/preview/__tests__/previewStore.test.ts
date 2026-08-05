import { describe, it, expect } from "vitest";
import { reduce, INITIAL, linkKind } from "../previewStore";

describe("the playable loop", () => {
  it("completing the current day awards its XP, bumps the streak and unlocks the next", () => {
    const s = reduce(INITIAL, { type: "complete_day", id: "d3" });
    expect(s.xp).toBe(850);
    expect(s.streak).toBe(7);
    expect(s.days[2].state).toBe("done");
    expect(s.days[3].state).toBe("current");
  });

  it("completing a locked or already-done day does nothing — no double XP on a re-tap", () => {
    expect(reduce(INITIAL, { type: "complete_day", id: "d4" })).toBe(INITIAL);
    expect(reduce(INITIAL, { type: "complete_day", id: "d1" })).toBe(INITIAL);
  });

  it("submitting the block is exactly what opens Week 5 — the gate rule, played", () => {
    expect(INITIAL.week5Unlocked).toBe(false);
    const s = reduce(INITIAL, { type: "submit_block", text: "3 reels from one sitting: A, B, C" });
    expect(s.week5Unlocked).toBe(true);
    expect(s.blockStatus).toBe("submitted");
  });

  it("the Album accepts a piece only after the mentor accepts the work", () => {
    let s = reduce(INITIAL, { type: "submit_block", text: "work" });
    expect(reduce(s, { type: "add_to_album", slot: "scripts.hooks" }).albumFilled).toEqual([]);
    s = reduce(s, { type: "mentor_accept" });
    s = reduce(s, { type: "add_to_album", slot: "scripts.hooks" });
    expect(s.albumFilled).toEqual(["scripts.hooks"]);
    // and never twice
    expect(reduce(s, { type: "add_to_album", slot: "scripts.hooks" }).albumFilled).toEqual(["scripts.hooks"]);
  });

  it("a feed post lands at the top; an empty one is refused", () => {
    const s = reduce(INITIAL, { type: "post_feed", body: "shipped it", url: "https://youtu.be/x" });
    expect(s.feedPosts[0].body).toBe("shipped it");
    expect(reduce(INITIAL, { type: "post_feed", body: "   " }).feedPosts).toEqual([]);
  });

  it("classifies pasted links for the preview card", () => {
    expect(linkKind("https://youtu.be/abc")).toBe("youtube");
    expect(linkKind("https://www.instagram.com/reel/x")).toBe("instagram");
    expect(linkKind("https://drive.google.com/file/d/1")).toBe("drive");
    expect(linkKind("https://example.com")).toBe("generic");
  });
});
