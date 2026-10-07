import { afterEach, describe, expect, it, vi } from "vitest";
import * as T from "../lib/time";
import { balanceOf, fill, inr } from "../lib/format";
import { detect, extractUrl, youTubeId } from "../lib/links";
import { Derived } from "../lib/derive";
import { fromForm, fromZoned, toForm, toZoned } from "../admin/db";
import type { Program, Room } from "../lib/types";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

const program = (over: Partial<Program> = {}): Program => ({
  id: "p", slug: "luca-c3", offering_id: "o", is_demo: false, enabled: true,
  name: "The LevelUp Creator Academy", short_name: "LUCA", cohort_label: "Cohort 03",
  starts_at: "2026-10-24T12:30:00Z", demo_day_at: "2027-01-30T12:30:00Z", ends_at: "2027-01-31T18:00:00Z",
  seats: 40, hours_per_week: 11, hero_url: null, timezone: "Asia/Kolkata",
  features: { sprint: true, leaderboard: true, clans: true },
  coin_rules: {}, content: {}, sprint: { starts_on: "2027-01-09", days: 21 },
  clan_reveal_at: null, clan_size: 6, support_whatsapp: null, whatsapp_url: null, drive_url: null,
  pricing: { price: 45000, deposit: 8000, app_fee: 400, hold_days: 2, balance_days: 15, emi: true },
  ...over,
});

const room = (over: Partial<Room> = {}, p = program()): Room => ({
  server_now: new Date().toISOString(), access: "learner", is_staff: false, signed_in: true, application: null,
  program: p, mentors: [], weeks: [
    { n: 0, module: "Orientation", phase: 1, starts_on: "2026-10-24", image_url: null, post_note: null, is_sprint: false, is_demo_week: false, prewatch: { title: "PW" }, quiz: [] },
    { n: 1, module: "Voice", phase: 1, starts_on: "2026-10-31", image_url: null, post_note: null, is_sprint: false, is_demo_week: false, prewatch: {}, quiz: [] },
  ],
  sessions: [
    { id: "s0", week_n: 0, kind: "orientation", title: "Orientation", starts_at: "2026-10-24T12:30:00Z", ends_at: "2026-10-24T15:00:00Z", mentor_ids: [], prep: [], image_url: null, has_zoom: true, recording_url: null, recording_minutes: 150, chapters: [], files: [] },
    { id: "s1", week_n: 1, kind: "review", title: "Review 1", starts_at: "2026-10-31T12:30:00Z", ends_at: "2026-10-31T14:30:00Z", mentor_ids: [], prep: [], image_url: null, has_zoom: true, recording_url: null, recording_minutes: null, chapters: [], files: [] },
  ],
  assignments: [
    { id: "a1", week_n: 1, title: "Voice doc", brief: null, due_at: "2026-10-30T18:29:00Z", parts: [{ k: "doc", label: "Doc" }], coins: null, is_group: false, review_session_id: null },
  ],
  submissions: [], members: [], clans: [], ...over,
});

afterEach(() => vi.useRealTimers());

describe("cohort time is the program's zone, not the device's", () => {
  it("formats an instant in IST", () => {
    T.setZone("Asia/Kolkata");
    expect(T.time("2026-10-24T12:30:00Z")).toBe("6 PM");
    expect(T.day("2026-10-24T12:30:00Z")).toBe("Sat 24 Oct");
    expect(T.range("2026-10-24T12:30:00Z", "2026-10-24T15:00:00Z")).toBe("6 to 8:30 PM");
  });
  it("start of day and day differences use IST midnights", () => {
    T.setZone("Asia/Kolkata");
    // 23:00 UTC on the 23rd is 04:30 IST on the 24th.
    expect(T.sod("2026-10-23T23:00:00Z").toISOString()).toBe("2026-10-23T18:30:00.000Z");
    expect(T.diffDays("2026-10-24T20:00:00Z", "2026-10-24T17:00:00Z")).toBe(1);
    expect(T.dateOnly("2026-11-06").toISOString()).toBe("2026-11-05T18:30:00.000Z");
  });
  it("media timestamps round-trip", () => {
    expect(T.fmtT(3725)).toBe("1:02:05");
    expect(T.parseT("1:02:05")).toBe(3725);
    expect(T.fmtT(65)).toBe("1:05");
  });
});

describe("money and copy", () => {
  it("the balance matches create-razorpay-order (price − deposit − app fee)", () => {
    expect(balanceOf(program())).toBe(36600);
    expect(inr(36600)).toBe("₹36,600");
  });
  it("fills placeholders from the program and leaves unknown ones visible", () => {
    T.setZone("Asia/Kolkata");
    const p = program();
    expect(fill("Join {cohort}: {deposit} today, {balance} later. {nope}", p)).toBe("Join Cohort 03: ₹8,000 today, ₹36,600 later. {nope}");
    expect(fill("{sprint_start} to {sprint_end}", p)).toBe("Sat 9 Jan to Fri 29 Jan");
    expect(fill("Hi {name}", p, { name: "Diya" })).toBe("Hi Diya");
  });
});

describe("links", () => {
  it("names what was pasted and knows which need a sharing check", () => {
    expect(detect("https://docs.google.com/document/d/x/edit")).toMatchObject({ word: "DOC", share: true });
    expect(detect("https://youtu.be/dQw4w9WgXcQ")).toMatchObject({ yt: true });
    expect(detect("https://www.instagram.com/reel/abc/")).toMatchObject({ ig: true });
    expect(detect("not a link")).toBeNull();
  });
  it("pulls the URL out of a pasted caption", () => {
    expect(extractUrl("my post!! https://www.instagram.com/p/abc123/). thanks")).toBe("https://www.instagram.com/p/abc123/");
    expect(youTubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });
});

describe("derived cohort state", () => {
  it("knows the week, the live session and what to work on", () => {
    T.setZone("Asia/Kolkata");
    const d = new Derived(room(), new Date("2026-10-24T13:00:00Z"));
    expect(d.week()).toBe(0);
    expect(d.live()?.id).toBe("s0");
    expect(d.current()?.id).toBe("a1");
    expect(d.reviewFor(d.assignments[0])?.id).toBe("s1");
    expect(d.pwDue(0)?.toISOString()).toBe("2026-10-24T11:30:00.000Z");
  });
  it("walks an assignment through due, pending and the mentor's call", () => {
    const before = new Date("2026-10-28T10:00:00Z");
    expect(new Derived(room(), before).aState(room().assignments![0]).v).toBe("due");
    expect(new Derived(room(), new Date("2026-11-02T00:00:00Z")).aState(room().assignments![0]).v).toBe("late");
    const sub = { id: "x", assignment_id: "a1", links: [], submitted_at: "2026-10-29T10:00:00Z", on_time: true, verdict: "pending" as const, notes: [], reviewed_by: null, reviewed_at: null, fix_due_at: null, fix_url: null, fix_submitted_at: null, was_fix: false };
    expect(new Derived(room({ submissions: [sub] }), before).aState(room().assignments![0]).v).toBe("pending");
    expect(new Derived(room({ submissions: [{ ...sub, verdict: "fix" }] }), before).fixAsked()?.id).toBe("a1");
    expect(new Derived(room({ submissions: [{ ...sub, verdict: "pending", was_fix: true }] }), before).aState(room().assignments![0]).v).toBe("fixed");
  });
  it("counts Sprint days from the cohort-local start date", () => {
    T.setZone("Asia/Kolkata");
    const d = new Derived(room(), new Date("2027-01-17T15:00:00Z")); // 8:30 PM IST, 17 Jan
    expect(d.sprintDay()).toBe(9);
    expect(d.sprintOn()).toBe(true);
    expect(new Derived(room({}, program({ features: { sprint: false } })), new Date("2027-01-17T15:00:00Z")).sprintOn()).toBe(false);
  });
  it("ranks the board by coins and works out the gap to the next person", () => {
    const m = (id: string, coins: number, week = 0) => ({ id, name: id.toUpperCase(), initials: id, photo_url: null, niche: null, handle: null, track: "A" as const, clan_id: null, coins, week });
    const me = { id: "me", name: "Me", initials: "M", photo_url: null, niche: null, handle: null, track: "A" as const, clan_id: null, coins: 900, streak: 1, streak_today: false, setup: {}, contract_signed_at: null, contract_name: null, cal_token: "t", prefs: {}, revealed_at: null, joined_at: "" };
    const d = new Derived(room({ me, members: [m("a", 1000, 100), m("me", 900, 450), m("b", 500)] }), new Date("2026-11-02T00:00:00Z"));
    expect(d.rank()).toBe(2);
    expect(d.nextUp()).toMatchObject({ gap: 110 });
    expect(d.move("me")).toBe(1); // 450 at the start of the week put me behind b: up one
  });
});

describe("admin times are entered in the program's zone", () => {
  it("round-trips a datetime-local value through IST", () => {
    expect(toZoned("2026-10-24T12:30:00Z", "Asia/Kolkata")).toBe("2026-10-24T18:00");
    expect(fromZoned("2026-10-24T18:00", "Asia/Kolkata")).toBe("2026-10-24T12:30:00.000Z");
    expect(fromZoned("", "Asia/Kolkata")).toBeNull();
  });
  it("parses form fields and rejects bad JSON with a readable message", () => {
    expect(fromForm({ key: "prep", label: "Prep", type: "lines" }, "a\n\n b ", "Asia/Kolkata")).toEqual(["a", "b"]);
    expect(fromForm({ key: "n", label: "Week", type: "number" }, "", "Asia/Kolkata")).toBeNull();
    expect(() => fromForm({ key: "quiz", label: "Quiz", type: "json" }, "[{", "Asia/Kolkata")).toThrow("Quiz isn't valid JSON");
    expect(() => fromForm({ key: "title", label: "Title", type: "text", required: true }, " ", "Asia/Kolkata")).toThrow("Title is required");
    expect(toForm({ key: "m", label: "M", type: "mentors" }, ["x", "y"], "Asia/Kolkata")).toBe("x,y");
  });
});
