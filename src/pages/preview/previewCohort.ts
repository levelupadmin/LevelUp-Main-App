/**
 * THE COHORT — dummy classmates, and the activity that makes a room worth
 * opening.
 *
 * 🔴 WHY THIS IS SEEDED AND DETERMINISTIC. A leaderboard with one name in it is
 * not a leaderboard, so the room needs a cohort before it can be judged. These
 * are the same eleven people as the Feed's People tab (`previewData.PEOPLE`) —
 * one invented cohort across the whole prototype, because two different fake
 * rosters in one product reads as a bug even when it is only a demo.
 *
 * Activity is derived from the card id by a small hash rather than randomised,
 * so the room looks identical on every reload and in every test. A leaderboard
 * that reshuffles when you refresh teaches nobody anything.
 *
 * 🔴 WHAT REPLACES THIS AT MERGE. Nothing here invents an access rule. In the
 * live app, membership already exists: `offerings` → `cohort_batches` →
 * `cohort_batch_members`, with `cohort_room_members(user_id, offering_id,
 * batch_id, role, source)` carrying `source = 'derived' | 'manual'`. So a
 * student gets the room because they bought the offering (derived), or because
 * an admin put them there (manual). This file becomes a query against those
 * tables and every screen above it stays exactly as it is.
 */
import { PEOPLE } from "./previewData";
import type { AnswerValue, Question } from "./previewProgram";

export interface Classmate {
  id: string;
  name: string;
  initials: string;
}

/** Everyone in the batch except the mentor. You are added separately. */
export const CLASSMATES: Classmate[] = PEOPLE.filter((p) => !p.isMentor).map((p) => ({
  id: p.id,
  name: p.name,
  initials: p.initials,
}));

export const ME: Classmate = { id: "you", name: "You", initials: "YO" };

export type ActivityStage = "started" | "drafted" | "submitted";

export interface Activity {
  student: Classmate;
  startedMin: number;              // minutes after the card opened
  stage: ActivityStage;
}

/** Stable small hash — same card id, same room, every single time. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

/**
 * Who has moved on this card, in the order they moved.
 *
 * Deliberately partial: roughly two thirds of the room appears, because a
 * cohort where everyone has already started is not a real cohort and would
 * make the board meaningless by week two.
 */
export function roomFor(cardId: string): Activity[] {
  const h = hash(cardId);
  const take = 4 + (h % 5); // 4 to 8 classmates
  const out: Activity[] = [];
  for (let i = 0; i < take; i += 1) {
    const student = CLASSMATES[(h + i * 7) % CLASSMATES.length];
    if (out.some((a) => a.student.id === student.id)) continue;
    const startedMin = 20 + ((h >> (i % 8)) % 2600); // within ~2 days of opening
    const roll = (h >> (i + 3)) % 10;
    const stage: ActivityStage = roll < 3 ? "submitted" : roll < 5 ? "drafted" : "started";
    out.push({ student, startedMin, stage });
  }
  return out.sort((a, b) => a.startedMin - b.startedMin);
}

/** "2h 40m in" — time since the card opened, not a wall clock. */
export function sinceOpen(min: number): string {
  if (min < 60) return `${min}m in`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h ${min % 60}m in`;
  return `day ${Math.floor(h / 24) + 1}`;
}

/* ── Plausible answers, so the sheet is worth opening ───────────────────── */


const NICHE: Record<string, string> = Object.fromEntries(PEOPLE.map((p) => [p.id, p.niche]));

/** A word the student's own niche supplies, so answers never read generic. */
function subjectOf(id: string): string {
  return (NICHE[id] ?? "their craft").replace(/,.*$/, "").toLowerCase();
}

const REEL_NOTES = [
  "Both opened on a number. The first one closed its loop at eight seconds and I stayed; the second left it open and I left too.",
  "One used a real receipt on screen. That was the proof lever, and it made me trust a stranger inside four seconds.",
  "Sensory language did it — she named the smell of the room. I could see it, so I stayed for the turn.",
  "The relatable character was an unrelatable action plus an ordinary feeling. That is the whole trick and I had not noticed it before.",
];

const STUCK = [
  "",
  "Not sure my second breakdown is deep enough.",
  "",
  "Ran out of time on the last voice note, will redo it.",
];

const SEATS = ["Teacher", "Underdog", "Insider", "Contrarian", "Entertainer"];

/**
 * Deterministic answers for an invented classmate.
 *
 * 🔴 SCOPE, DELIBERATELY. These fill the SHAPE of a sheet so the end-to-end is
 * visible — a sheet of blank rows teaches nothing about whether the sheet
 * works. They are written to read as plausible, never as insight: nobody
 * should mistake an invented one-pager for a real student's positioning.
 */
export function answersFor(cardId: string, studentId: string, questions: Question[]): Record<string, AnswerValue> {
  const h = hash(`${cardId}:${studentId}`);
  const out: Record<string, AnswerValue> = {};
  const subject = subjectOf(studentId);

  questions.forEach((q, i) => {
    const n = (h >> (i % 10)) % 97;
    switch (q.type) {
      case "link":
        out[q.id] = `https://drive.google.com/drive/folders/${studentId}-${cardId.replace(/[^a-z0-9]/gi, "")}`;
        break;
      case "file":
        out[q.id] = `${studentId}-origin-story.m4a`;
        break;
      case "long_text":
        out[q.id] = REEL_NOTES[n % REEL_NOTES.length];
        break;
      case "short_text":
        out[q.id] = /positioning/i.test(q.title)
          ? `I help people who are serious about ${subject} get their first ten posts out without guessing.`
          : STUCK[n % STUCK.length];
        break;
      case "choice_one":
        out[q.id] = (q.options ?? [])[n % Math.max(1, (q.options ?? []).length)] ?? "";
        break;
      case "choice_many": {
        const pool = q.options ?? SEATS;
        const take = 1 + (n % 3);
        out[q.id] = Array.from({ length: take }, (_, k) => pool[(n + k * 3) % pool.length]).filter((v, k, arr) => arr.indexOf(v) === k);
        break;
      }
      case "rating":
        out[q.id] = String(3 + (n % 3));
        break;
      case "yes_no":
        out[q.id] = n % 3 === 0 ? "No" : "Yes";
        break;
      default:
        out[q.id] = "";
    }
  });
  return out;
}
