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
