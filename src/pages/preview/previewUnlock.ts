/**
 * THE GATES, as pure functions — the founder's locked decision #1, as data.
 *
 * Every rule here is one the program already had in words. Putting them in one
 * pure module means the student page, the admin preview and the tests all read
 * the SAME rule, and when this graduates the file becomes the body of the
 * `card_state()` SQL function rather than being re-derived in three places.
 *
 * The rules, in the founder's own terms:
 *   1. A week opens by DATE and because the previous week's block landed.
 *   2. Inside a week, the drills are sequential.
 *   3. Reading never locks — only DOING locks. A future session page shows its
 *      mentor, its agenda and its date; you simply cannot do its work yet.
 *   4. Live classes and community calls are joinable by everyone, always,
 *      regardless of anything above. Missing a week never locks you out of the
 *      room.
 *   5. NEW (2026-08-15): a recording stays shut until that session's feedback
 *      form is submitted.
 *   6. Nothing that has unlocked ever re-locks.
 */
import type { ProgramTemplate, TemplateCard, TemplateWeek } from "./previewProgram";
import { orderedCards } from "./previewProgram";

export type CardState = "done" | "open" | "locked";

export interface CardVerdict {
  state: CardState;
  /** Plain words, shown to the student. Never "locked" with no reason. */
  why?: string;
}

export interface UnlockInput {
  progress: Record<string, { done: boolean }>;
  submittedCardIds: string[];
  /** Today, so a week that has not arrived yet reads as not-yet rather than done. */
  todayISO: string;
}

/** Has this week's block been submitted? That is what opens the next week. */
export function weekBlockSubmitted(week: TemplateWeek, submitted: string[]): boolean {
  const block = week.cards.find((c) => c.kind === "block");
  return !!block && submitted.includes(block.id);
}

/**
 * A week is open when its date has arrived AND the previous week's block
 * landed. Week 0 has no previous week, so date alone opens it.
 */
export function weekOpen(
  t: ProgramTemplate,
  weekNo: number,
  input: UnlockInput,
  dateOf: (w: number, d: number) => Date,
): CardVerdict {
  const opensOn = dateOf(weekNo, -1);
  const today = new Date(`${input.todayISO}T00:00:00`);
  const tooEarly = today < opensOn;
  const prev = weekNo > 0 ? t.weeks.find((w) => w.no === weekNo - 1) : undefined;
  const blockMissing = !!prev && !weekBlockSubmitted(prev, input.submittedCardIds);

  // BOTH reasons, not just the first one that happens to fire. A student told
  // only "opens 22 Aug" submits nothing and is then surprised on the 22nd; a
  // student told only "submit week 0's block" thinks the week is available
  // now. Saying both is the difference between a lock and an instruction.
  if (tooEarly || blockMissing) {
    const on = opensOn.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    const why = tooEarly && blockMissing
      ? `Opens ${on}, once week ${weekNo - 1}'s block is in.`
      : tooEarly
        ? `Opens ${on}.`
        : `Submit week ${weekNo - 1}'s block and this opens.`;
    return { state: "locked", why };
  }
  return { state: "open" };
}

/** The state of one card, with the reason a student can actually act on. */
export function cardState(
  t: ProgramTemplate,
  week: TemplateWeek,
  card: TemplateCard,
  input: UnlockInput,
  dateOf: (w: number, d: number) => Date,
): CardVerdict {
  if (input.progress[card.id]?.done) return { state: "done" };

  // Rule 4 — the room is never locked. This comes FIRST, before the week gate,
  // because the whole point is that falling behind must not cut you off from
  // the live session where you would catch up.
  if (card.kind === "live_session" || card.kind === "community_call") return { state: "open" };

  const w = weekOpen(t, week.no, input, dateOf);
  if (w.state === "locked") return w;

  // Rule 2 — drills run in order inside the week. The block is not part of the
  // chain: it is the week's deliverable and stays reachable, because a student
  // who skipped Tuesday must still be able to submit on Thursday.
  if (card.kind === "micro") {
    const prior = orderedCards(week).filter((c) => c.kind === "micro" && c.dayOffset < card.dayOffset);
    const blocking = prior.find((c) => !input.progress[c.id]?.done);
    if (blocking) return { state: "locked", why: `Finish "${blocking.title}" first.` };
  }

  return { state: "open" };
}

/**
 * Rule 5 — the recording door. Separate from cardState because a session card
 * is open (you may read it, you may join it) while its recording is not.
 */
export function recordingVerdict(
  card: TemplateCard,
  hasFeedback: boolean,
): { state: "none" | "locked" | "open"; why?: string } {
  if (!card.recordingUrl) {
    return { state: "none", why: "The recording is not up yet. It lands within a day of the session." };
  }
  if (card.gateRecordingOnFeedback && !hasFeedback) {
    return { state: "locked", why: "Tell us how the session went and the recording opens." };
  }
  return { state: "open" };
}

/** Blocks completed, for the header chip — "2 of 13". */
export function blocksDone(t: ProgramTemplate, submitted: string[]): { done: number; total: number } {
  const blocks = t.weeks.flatMap((w) => w.cards.filter((c) => c.kind === "block"));
  return { done: blocks.filter((b) => submitted.includes(b.id)).length, total: blocks.length };
}
