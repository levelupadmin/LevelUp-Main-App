/**
 * The gates, tested as rules rather than as screens. When these graduate into
 * `card_state()` in SQL, this file is the acceptance suite that comes with it.
 */
import { describe, it, expect } from "vitest";
import { LUCA, dateOf, findCard } from "../previewProgram";
import { cardState, weekOpen, recordingVerdict, blocksDone, type UnlockInput } from "../previewUnlock";

const dOf = (w: number, d: number) => dateOf(LUCA, w, d);
const input = (over: Partial<UnlockInput> = {}): UnlockInput => ({
  progress: {}, submittedCardIds: [], todayISO: "2026-08-18", ...over,
});

const card = (id: string) => {
  const f = findCard(LUCA, id);
  if (!f) throw new Error(`no card ${id}`);
  return f;
};

describe("the week gate", () => {
  it("week 0 is open on its own date, with no previous block to wait for", () => {
    expect(weekOpen(LUCA, 0, input(), dOf).state).toBe("open");
  });

  it("a later week names BOTH reasons — the date and the block", () => {
    const v = weekOpen(LUCA, 2, input(), dOf);
    expect(v.state).toBe("locked");
    expect(v.why).toMatch(/Opens 29 Aug, once week 1's block is in/);
  });

  it("once the date has passed, only the missing block is named", () => {
    const v = weekOpen(LUCA, 1, input({ todayISO: "2026-09-01" }), dOf);
    expect(v.why).toBe("Submit week 0's block and this opens.");
  });

  it("submitting week 0's block opens week 1", () => {
    const v = weekOpen(LUCA, 1, input({ todayISO: "2026-09-01", submittedCardIds: ["w0-block"] }), dOf);
    expect(v.state).toBe("open");
  });
});

describe("what never locks", () => {
  it("a live session in a far future week is still open — the room is never shut", () => {
    const { week, card: c } = card("w7-class");
    expect(cardState(LUCA, week, c, input(), dOf).state).toBe("open");
  });

  it("a community call is open on the same principle", () => {
    const { week, card: c } = card("w0-community");
    expect(cardState(LUCA, week, c, input(), dOf).state).toBe("open");
  });
});

describe("drills run in order inside a week", () => {
  it("Tuesday waits for Monday, and says which one", () => {
    const { week, card: c } = card("w0-tue");
    const v = cardState(LUCA, week, c, input(), dOf);
    expect(v.state).toBe("locked");
    expect(v.why).toMatch(/Record five voice-note memories/);
  });

  it("finishing Monday opens Tuesday", () => {
    const { week, card: c } = card("w0-tue");
    expect(cardState(LUCA, week, c, input({ progress: { "w0-mon": { done: true } } }), dOf).state).toBe("open");
  });

  it("the block is NOT in the chain — a student who skipped Tuesday can still submit Thursday", () => {
    const { week, card: c } = card("w0-block");
    expect(cardState(LUCA, week, c, input(), dOf).state).toBe("open");
  });
});

describe("the recording door", () => {
  const { card: c } = card("w0-class");

  it("no recording uploaded reads as not-up-yet, not as locked", () => {
    expect(recordingVerdict(c, false).state).toBe("none");
  });

  it("uploaded but no feedback = locked, with the ask stated", () => {
    const v = recordingVerdict({ ...c, recordingUrl: "https://x" }, false);
    expect(v.state).toBe("locked");
    expect(v.why).toMatch(/Tell us how the session went/);
  });

  it("feedback given = open", () => {
    expect(recordingVerdict({ ...c, recordingUrl: "https://x" }, true).state).toBe("open");
  });

  it("a session with the gate off opens without feedback", () => {
    expect(recordingVerdict({ ...c, recordingUrl: "https://x", gateRecordingOnFeedback: false }, false).state).toBe("open");
  });
});

describe("the blocks chip", () => {
  it("counts one block per week across the whole program", () => {
    expect(blocksDone(LUCA, []).total).toBe(13);
  });

  it("counts what has actually been submitted", () => {
    expect(blocksDone(LUCA, ["w0-block", "w1-block"]).done).toBe(2);
  });
});

describe("the template itself", () => {
  it("week 0's orientation sits the day BEFORE its Sunday class", () => {
    const { card: c } = card("w0-orientation");
    expect(c.dayOffset).toBe(-1);
    expect(dOf(0, c.dayOffset).getDate()).toBe(15);
  });

  it("every week has exactly one block, so 'one deliverable a week' is structural", () => {
    for (const w of LUCA.weeks) {
      expect(w.cards.filter((c) => c.kind === "block").length).toBe(1);
    }
  });

  it("every card carries XP, so the header chips can never disagree with the Path", () => {
    for (const w of LUCA.weeks) for (const c of w.cards) expect(c.xp).toBeGreaterThan(0);
  });

  it("weeks 0 and 1 are fully authored — nothing left to fill", () => {
    for (const no of [0, 1]) {
      const w = LUCA.weeks.find((x) => x.no === no)!;
      expect(w.cards.some((c) => c.needsAuthoring)).toBe(false);
    }
  });
});
