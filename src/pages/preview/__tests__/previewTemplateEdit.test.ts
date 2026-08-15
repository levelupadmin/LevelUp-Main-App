/**
 * The structural moves, as rules. "I don't want to limit myself in terms of
 * creating something" — so these pin that anything can be added, duplicated,
 * moved or deleted, and that dates follow POSITION rather than identity.
 */
import { describe, it, expect } from "vitest";
import {
  LUCA, moveWeek, addWeek, duplicateWeek, deleteWeek, setWeekField,
  addCard, duplicateCard, deleteCard, setCardField, renamePhase, withStart,
  dateOf, blankCard, orderedCards,
  pushFrom, removePause, setNoSession, addPhase, setWeekPhase, phasesOf,
  addQuestion, moveQuestion, deleteQuestion, blankQuestion,
  addResource, setResource, deleteResource,
} from "../previewProgram";

describe("moving weeks", () => {
  it("swapping week 3 and 4 renumbers both — dates belong to the slot, content travels", () => {
    const before3 = LUCA.weeks[3].title;
    const before4 = LUCA.weeks[4].title;
    const t = moveWeek(LUCA, 4, 3);
    expect(t.weeks[3].title).toBe(before4);
    expect(t.weeks[4].title).toBe(before3);
    expect(t.weeks[3].no).toBe(3);
    expect(t.weeks[4].no).toBe(4);
  });

  it("the moved week's class now falls on the date of the slot it moved into", () => {
    const slotDate = dateOf(LUCA, 3, 0).getTime();
    const t = moveWeek(LUCA, 4, 3);
    expect(dateOf(t, 3, 0).getTime()).toBe(slotDate);
  });

  it("refuses to move off either end rather than throwing", () => {
    expect(moveWeek(LUCA, 0, -1)).toBe(LUCA);
    expect(moveWeek(LUCA, 12, 13)).toBe(LUCA);
  });
});

describe("adding, duplicating and deleting", () => {
  it("adds a week anywhere and renumbers the rest", () => {
    const t = addWeek(LUCA, 2, "Ideas and scripts");
    expect(t.weeks.length).toBe(LUCA.weeks.length + 1);
    expect(t.weeks[2].title).toBe("New week");
    expect(t.weeks.map((w) => w.no)).toEqual(t.weeks.map((_, i) => i));
  });

  it("duplicating a week copies its cards with FRESH ids — two cards must never share one", () => {
    const t = duplicateWeek(LUCA, 0);
    const a = t.weeks[0].cards.map((c) => c.id);
    const b = t.weeks[1].cards.map((c) => c.id);
    expect(b.length).toBe(a.length);
    expect(a.some((id) => b.includes(id))).toBe(false);
  });

  it("deletes a week, but never the last one — an empty program is not a program", () => {
    expect(deleteWeek(LUCA, 5).weeks.length).toBe(LUCA.weeks.length - 1);
    const one = { ...LUCA, weeks: [LUCA.weeks[0]] };
    expect(deleteWeek(one, 0)).toBe(one);
  });

  it("adds any card kind to any day, including the two edge days", () => {
    let t = addCard(LUCA, 0, "community_call", -1);
    t = addCard(t, 0, "block", 7);
    const days = t.weeks[0].cards.map((c) => c.dayOffset);
    expect(days).toContain(-1);
    expect(days).toContain(7);
  });

  it("duplicates and deletes a card", () => {
    const t = duplicateCard(LUCA, 0, "w0-mon");
    expect(t.weeks[0].cards.length).toBe(LUCA.weeks[0].cards.length + 1);
    expect(deleteCard(t, 0, "w0-mon").weeks[0].cards.some((c) => c.id === "w0-mon")).toBe(false);
  });

  it("a new card carries only its own kind's fields — a micro has no Zoom box to leave empty", () => {
    expect(blankCard("micro", 1).zoomUrl).toBeUndefined();
    expect(blankCard("live_session", 0).zoomUrl).toBe("");
    expect(blankCard("block", 4).submit?.questions.length).toBe(1);
  });
});

describe("editing", () => {
  it("editing a card clears its 'fill me' flag, because it has now been filled", () => {
    const t = setCardField(LUCA, "w2-class", { mentor: "Sai" });
    const card = t.weeks[2].cards.find((c) => c.id === "w2-class");
    expect(card?.mentor).toBe("Sai");
    expect(card?.needsAuthoring).toBe(false);
  });

  it("renaming a phase moves every week that carried it", () => {
    const t = renamePhase(LUCA, "Find your lane", "Positioning");
    expect(t.weeks.filter((w) => w.phase === "Positioning").length).toBe(2);
    expect(t.weeks.some((w) => w.phase === "Find your lane")).toBe(false);
  });

  it("a week's title is editable without touching its cards", () => {
    const t = setWeekField(LUCA, 0, { title: "Kickoff" });
    expect(t.weeks[0].title).toBe("Kickoff");
    expect(t.weeks[0].cards.length).toBe(LUCA.weeks[0].cards.length);
  });
});

describe("the batch layer", () => {
  it("one start date re-dates the entire program", () => {
    const t = withStart(LUCA, "2026-12-06");
    expect(dateOf(t, 0, 0).getDate()).toBe(6);
    expect(dateOf(t, 0, -1).getDate()).toBe(5);
    expect(dateOf(t, 1, 0).getDate()).toBe(13);
  });

  it("changing the start date never touches the shape", () => {
    const t = withStart(LUCA, "2027-01-03");
    expect(t.weeks.length).toBe(LUCA.weeks.length);
    expect(orderedCards(t.weeks[0]).length).toBe(orderedCards(LUCA.weeks[0]).length);
  });
});

describe("changing a batch that is already running", () => {
  it("a push moves everything AFTER the week, and nothing before it", () => {
    const t = pushFrom(LUCA, 4, 1, "mentor unavailable");
    // Week 4 and everything before it are exactly where they were.
    expect(dateOf(t, 4, 0).getTime()).toBe(dateOf(LUCA, 4, 0).getTime());
    expect(dateOf(t, 0, 0).getTime()).toBe(dateOf(LUCA, 0, 0).getTime());
    // Week 5 onwards moved by exactly seven days.
    expect(dateOf(t, 5, 0).getTime() - dateOf(LUCA, 5, 0).getTime()).toBe(7 * 86400000);
    expect(dateOf(t, 12, 0).getTime() - dateOf(LUCA, 12, 0).getTime()).toBe(7 * 86400000);
  });

  it("pushes stack, and undoing one leaves the other", () => {
    let t = pushFrom(LUCA, 2, 1, "one");
    t = pushFrom(t, 6, 1, "two");
    expect(dateOf(t, 7, 0).getTime() - dateOf(LUCA, 7, 0).getTime()).toBe(14 * 86400000);
    t = removePause(t, (t.pauses ?? [])[0].id);
    expect(dateOf(t, 7, 0).getTime() - dateOf(LUCA, 7, 0).getTime()).toBe(7 * 86400000);
  });

  it("'no session' marks the week WITHOUT moving any date — a cancelled class is not a cancelled week", () => {
    const t = setNoSession(LUCA, 5, true, "Mentor unavailable");
    expect(t.weeks[5].noSession).toBe(true);
    expect(dateOf(t, 6, 0).getTime()).toBe(dateOf(LUCA, 6, 0).getTime());
  });
});

describe("phases", () => {
  it("adds a phase, and a week can be moved into it", () => {
    let t = addPhase(LUCA, "Launch");
    expect(phasesOf(t)).toContain("Launch");
    t = setWeekPhase(t, 0, "Launch");
    expect(t.weeks[0].phase).toBe("Launch");
  });
});

describe("the form builder", () => {
  it("adds, reorders and deletes questions on a block", () => {
    let t = addQuestion(LUCA, "w0-block", "rating");
    const qs = t.weeks[0].cards.find((c) => c.id === "w0-block")!.submit!.questions;
    const last = qs[qs.length - 1];
    expect(last.type).toBe("rating");

    t = moveQuestion(t, "w0-block", last.id, -1);
    const after = t.weeks[0].cards.find((c) => c.id === "w0-block")!.submit!.questions;
    expect(after[after.length - 2].id).toBe(last.id);

    t = deleteQuestion(t, "w0-block", last.id);
    expect(t.weeks[0].cards.find((c) => c.id === "w0-block")!.submit!.questions.some((q) => q.id === last.id)).toBe(false);
  });

  it("a choice question is born with options, a text question is not", () => {
    expect(blankQuestion("choice_one").options?.length).toBe(2);
    expect(blankQuestion("long_text").options).toBeUndefined();
  });

  it("never asks for identity — no question is named after a name, email or phone", () => {
    for (const w of LUCA.weeks)
      for (const c of w.cards)
        for (const q of c.submit?.questions ?? [])
          expect(/name|email|phone|whatsapp/i.test(q.title)).toBe(false);
  });
});

describe("resources", () => {
  it("attaches a recording, a deck and a transcript to a session, then removes one", () => {
    let t = addResource(LUCA, "w0-class", "recording");
    t = addResource(t, "w0-class", "deck");
    t = addResource(t, "w0-class", "transcript");
    const card = () => t.weeks[0].cards.find((c) => c.id === "w0-class")!;
    expect(card().resources?.length).toBe(3);

    const rec = card().resources!.find((r) => r.kind === "recording")!;
    t = setResource(t, "w0-class", rec.id, { url: "https://zoom.us/rec/abc", label: "Session recording" });
    expect(card().resources!.find((r) => r.id === rec.id)!.url).toBe("https://zoom.us/rec/abc");

    t = deleteResource(t, "w0-class", rec.id);
    expect(card().resources?.length).toBe(2);
  });
});
