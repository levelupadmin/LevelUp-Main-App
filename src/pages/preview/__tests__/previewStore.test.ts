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

  it("watching the current week's recording completes the Wed day and hands over to the block", () => {
    const s = reduce(INITIAL, { type: "watch_recording", week: 4 });
    expect(s.watched).toContain("rec-w4");
    expect(s.days[2].state).toBe("done"); // d3 = watch the recording
    expect(s.days[3].state).toBe("current"); // the block is next
    expect(s.xp).toBe(850);
    // watching twice is a no-op — no double XP
    expect(reduce(s, { type: "watch_recording", week: 4 })).toBe(s);
  });

  it("rewatching a PAST week's recording logs it without touching this week's days", () => {
    const s = reduce(INITIAL, { type: "watch_recording", week: 2 });
    expect(s.watched).toContain("rec-w2");
    expect(s.days[2].state).toBe("current"); // untouched
    expect(s.xp).toBe(INITIAL.xp);
  });

  it("submitting the block is exactly what opens Week 5 — the gate rule, played", () => {
    expect(INITIAL.week5Unlocked).toBe(false);
    const s = reduce(INITIAL, { type: "submit_block", text: "3 reels from one sitting: A, B, C" });
    expect(s.week5Unlocked).toBe(true);
    expect(s.blockStatus).toBe("submitted");
  });

  it("the Album accepts a piece only after the mentor accepts the work", () => {
    let s = reduce(INITIAL, { type: "submit_block", text: "work" });
    expect(reduce(s, { type: "add_to_album", slot: "scr.batch" }).albumFilled).toEqual([]);
    s = reduce(s, { type: "mentor_accept" });
    s = reduce(s, { type: "add_to_album", slot: "scr.batch" });
    expect(s.albumFilled).toEqual(["scr.batch"]);
    // and never twice
    expect(reduce(s, { type: "add_to_album", slot: "scr.batch" }).albumFilled).toEqual(["scr.batch"]);
  });

  it("a typed feed post lands at the top with its type; an empty one is refused", () => {
    const s = reduce(INITIAL, { type: "post_feed", postType: "request", body: "anyone got a gimbal?", url: undefined });
    expect(s.posts[0].body).toBe("anyone got a gimbal?");
    expect(s.posts[0].type).toBe("request");
    expect(s.posts[0].mine).toBe(true);
    expect(reduce(INITIAL, { type: "post_feed", postType: "work", body: "   " }).posts).toBe(INITIAL.posts);
  });

  it("likes toggle — on adds one, off takes it back", () => {
    const id = INITIAL.posts[0].id;
    const base = INITIAL.posts[0].likes;
    const on = reduce(INITIAL, { type: "toggle_like", id });
    expect(on.posts[0].likes).toBe(base + 1);
    expect(on.posts[0].likedByMe).toBe(true);
    const off = reduce(on, { type: "toggle_like", id });
    expect(off.posts[0].likes).toBe(base);
    expect(off.posts[0].likedByMe).toBe(false);
  });

  it("comments append to the right post; blank comments are refused", () => {
    const id = INITIAL.posts[1].id;
    const before = INITIAL.posts[1].comments.length;
    const s = reduce(INITIAL, { type: "add_comment", id, body: "cut the gym pan" });
    expect(s.posts[1].comments.length).toBe(before + 1);
    expect(s.posts[1].comments.at(-1)).toEqual({ author: "You", body: "cut the gym pan" });
    expect(reduce(INITIAL, { type: "add_comment", id, body: "  " })).toBe(INITIAL);
  });

  it("classifies pasted links for the preview card", () => {
    expect(linkKind("https://youtu.be/abc")).toBe("youtube");
    expect(linkKind("https://www.instagram.com/reel/x")).toBe("instagram");
    expect(linkKind("https://drive.google.com/file/d/1")).toBe("drive");
    expect(linkKind("https://example.com")).toBe("generic");
  });
});
