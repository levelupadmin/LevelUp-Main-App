import * as T from "./time";
import type { Assignment, Member, Room, Session, Submission, Week } from "./types";

/**
 * Everything the screens derive from one room envelope. Pure functions of the
 * envelope and the (server-aligned) clock; nothing here decides access.
 */
export type SState = "before" | "live" | "after";
export type AState =
  | { v: "soon" | "due" | "late"; sess?: Session }
  | { v: "pending" | "fixed"; sess?: Session; sub: Submission }
  | { v: "ship" | "fix" | "hold"; sess?: Session; sub: Submission };

export const KIND_LABEL: Record<string, string> = {
  orientation: "Orientation", review: "Review", class: "Class", double: "Double session",
  standup: "Sprint standup", demo: "Demo Day", plan: "Class",
};

export function sState(s: Session, now = T.now()): SState {
  const t = now.getTime();
  if (t < Date.parse(s.starts_at)) return "before";
  if (t <= Date.parse(s.ends_at)) return "live";
  return "after";
}

export class Derived {
  readonly r: Room;
  readonly now: Date;
  readonly weeks: Week[];
  readonly sessions: Session[];
  readonly assignments: Assignment[];
  private weekStarts: { n: number; at: number }[];

  constructor(room: Room, now = T.now()) {
    this.r = room;
    this.now = now;
    this.weeks = room.weeks;
    this.sessions = room.sessions;
    this.assignments = room.assignments ?? [];
    this.weekStarts = room.weeks
      .filter((w) => w.starts_on)
      .map((w) => ({ n: w.n, at: T.dateOnly(w.starts_on as string).getTime() }))
      .sort((a, b) => a.at - b.at);
  }

  get p() { return this.r.program; }
  get me() { return this.r.me; }
  get lastWeek(): number { return this.weeks.length ? Math.max(...this.weeks.map((w) => w.n)) : 13; }

  /** -1 before the first week; the last week index during Demo Day week. */
  weekOf(d: Date | string): number {
    const t = T.toDate(d).getTime();
    let w = -1;
    for (const ws of this.weekStarts) if (ws.at <= t) w = ws.n;
    return w;
  }
  week(): number { return this.weekOf(this.now); }
  weekRow(n: number): Week | undefined { return this.weeks.find((w) => w.n === n); }
  weekStart(n: number): Date | null { const w = this.weekStarts.find((x) => x.n === n); return w ? new Date(w.at) : null; }
  weekEnd(n: number): Date | null {
    const i = this.weekStarts.findIndex((x) => x.n === n);
    if (i < 0) return null;
    const next = this.weekStarts[i + 1];
    return new Date((next ? next.at : this.weekStarts[i].at + 7 * T.DAYMS) - 1);
  }
  phaseOf(n: number) {
    const ph = this.p.content.phases ?? [];
    return ph.find((x) => n >= x.from && n <= x.to) ?? ph[ph.length - 1];
  }

  get started() { return !!this.p.starts_at && this.now.getTime() >= Date.parse(this.p.starts_at); }
  get alumni() { return !!this.p.ends_at && this.now.getTime() > Date.parse(this.p.ends_at); }
  get demoWeek() { const w = this.week(); const row = this.weekRow(w); return !!row?.is_demo_week; }

  sess(id: string | undefined) { return this.sessions.find((s) => s.id === id); }
  asg(id: string | undefined) { return this.assignments.find((a) => a.id === id); }
  next() { return this.sessions.find((s) => Date.parse(s.ends_at) > this.now.getTime()); }
  live() { return this.sessions.find((s) => sState(s, this.now) === "live"); }
  sState(s: Session) { return sState(s, this.now); }
  firstOf(n: number) { return this.sessions.find((s) => s.week_n === n); }
  lastRec() { return [...this.sessions].reverse().find((s) => s.recording_url && Date.parse(s.ends_at) < this.now.getTime()); }
  recordings() { return this.sessions.filter((s) => (s.recording_url || this.p.is_demo) && Date.parse(s.ends_at) < this.now.getTime() && (s.recording_minutes ?? 0) > 0); }

  /** Pre-watch closes an hour before the week's first session. */
  pwDue(n: number): Date | null {
    const f = this.firstOf(n);
    return f ? new Date(Date.parse(f.starts_at) - T.HOUR) : null;
  }
  hasPrewatch(n: number) { const w = this.weekRow(n); return !!w && !!w.prewatch && Object.keys(w.prewatch).length > 0; }
  pwDone(n: number) { return (this.r.prewatch ?? []).some((p) => p.week_n === n); }

  attended(id: string) { return (this.r.attended ?? []).includes(id); }
  submission(aid: string) { return (this.r.submissions ?? []).find((s) => s.assignment_id === aid); }

  /** Where an assignment is reviewed: its own session, else the next review after the deadline. */
  reviewFor(a: Pick<Assignment, "review_session_id" | "due_at">): Session | undefined {
    if (a.review_session_id) return this.sess(a.review_session_id);
    const due = Date.parse(a.due_at);
    return this.sessions.find((s) => Date.parse(s.starts_at) > due && ["review", "standup", "demo"].includes(s.kind))
      ?? this.sessions.find((s) => Date.parse(s.starts_at) > due);
  }

  aState(a: Assignment): AState {
    const sess = this.reviewFor(a);
    const sub = this.submission(a.id);
    if (sub) {
      if (sub.verdict === "pending") return { v: sub.was_fix ? "fixed" : "pending", sess, sub };
      return { v: sub.verdict, sess, sub };
    }
    const due = Date.parse(a.due_at), t = this.now.getTime();
    if (due < t) return { v: "late", sess };
    return { v: (due - t) / T.DAYMS <= 8 ? "due" : "soon", sess };
  }
  /** The one assignment the learner should be working on now. */
  current(): Assignment | undefined {
    const t = this.now.getTime();
    return this.assignments.find((a) => !this.submission(a.id) && Date.parse(a.due_at) > t && (Date.parse(a.due_at) - t) / T.DAYMS <= 8);
  }
  /** An assignment waiting on a fix from the learner. */
  fixAsked(): Assignment | undefined {
    return this.assignments.find((a) => this.submission(a.id)?.verdict === "fix");
  }

  /* ---- Sprint ---- */
  get sprintStart(): Date | null { return this.p.sprint?.starts_on ? T.dateOnly(this.p.sprint.starts_on) : null; }
  get sprintDays(): number { return this.p.sprint?.days || 21; }
  sprintDay(): number { const s = this.sprintStart; return s ? T.diffDays(this.now, s) + 1 : 0; }
  sprintOn(): boolean { const d = this.sprintDay(); return !!this.p.features?.sprint && d >= 1 && d <= this.sprintDays; }
  sprintOver(): boolean { return this.sprintDay() > this.sprintDays; }
  sprintPost(day: number) { return (this.r.sprint_posts ?? []).find((p) => p.day_n === day); }
  postedToday(): boolean { return this.sprintOn() && !!this.sprintPost(this.sprintDay()); }

  /* ---- The game ---- */
  members(): Member[] { return [...(this.r.members ?? [])].sort((a, b) => b.coins - a.coins || (a.id === this.me?.id ? -1 : b.id === this.me?.id ? 1 : 0)); }
  boardOpen(): boolean { return !!this.p.features?.leaderboard && this.started; }
  rank(): number | null {
    if (!this.me || !this.boardOpen()) return null;
    const b = this.members();
    const i = b.findIndex((m) => m.id === this.me?.id);
    return i >= 0 ? i + 1 : null;
  }
  nextUp(): { p: Member; gap: number } | null {
    const b = this.members();
    const i = b.findIndex((m) => m.id === this.me?.id);
    return i > 0 ? { p: b[i - 1], gap: b[i - 1].coins - b[i].coins + 10 } : null;
  }
  /** Rank at the start of this week (coins minus this week's), for the movement arrows. */
  startRankOf(id: string): number {
    const b = [...(this.r.members ?? [])].sort((x, y) => (y.coins - y.week) - (x.coins - x.week));
    return b.findIndex((m) => m.id === id) + 1;
  }
  move(id: string): number {
    const now = this.members().findIndex((m) => m.id === id) + 1;
    return this.startRankOf(id) - now;
  }
  clans() { return [...(this.r.clans ?? [])].sort((a, b) => b.score - a.score); }
  myClan() { return (this.r.clans ?? []).find((c) => c.id === this.me?.clan_id); }
  clanRank(): number | null { const c = this.myClan(); return c ? this.clans().findIndex((x) => x.id === c.id) + 1 : null; }
  clanMembers(): Member[] {
    const cid = this.me?.clan_id;
    if (!cid) return [];
    const ms = (this.r.members ?? []).filter((m) => m.clan_id === cid);
    return [...ms.filter((m) => m.id === this.me?.id), ...ms.filter((m) => m.id !== this.me?.id)];
  }
  member(id: string) { return (this.r.members ?? []).find((m) => m.id === id); }
  mentor(id: string) { return this.r.mentors.find((m) => m.id === id); }
  mentorNames(ids: string[]): string {
    const n = ids.map((id) => this.mentor(id)?.name.split(" ")[0]).filter(Boolean) as string[];
    return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
  }
  mentorFull(ids: string[]): string {
    const n = ids.map((id) => this.mentor(id)?.name).filter(Boolean) as string[];
    return n.length <= 1 ? n.join("") : `${n.slice(0, -1).join(", ")} and ${n[n.length - 1]}`;
  }

  /**
   * What the Clan has done "today", the way the mockup's Clan pulse reads:
   * the Sprint post, a live session, this week's work, or the pre-watch.
   */
  clanStatus(): { label: string; done: (id: string) => boolean } | null {
    const prog = this.r.clan_progress;
    if (!prog || !this.me?.clan_id) return null;
    const by = (id: string) => prog.find((p) => p.member_id === id);
    if (this.sprintOn()) {
      const d = this.sprintDay();
      return { label: "Posted today", done: (id) => (by(id)?.sprint_days ?? []).includes(d) };
    }
    if (this.sprintOver() && this.alumni) {
      return { label: "Shipped all 12 weeks", done: () => true };
    }
    const live = this.live();
    if (live) return { label: "In the room", done: (id) => (by(id)?.attended ?? []).includes(live.id) };
    const cur = this.current();
    if (cur) return { label: `Week ${cur.week_n} in`, done: (id) => (by(id)?.submitted ?? []).includes(cur.id) };
    const w = this.week();
    if (w >= 0 && this.hasPrewatch(w)) return { label: "Pre-watch done", done: (id) => (by(id)?.prewatch ?? []).includes(w) };
    return null;
  }

  feedbackGiven(to: string, ref: string) { return (this.r.feedback_given ?? []).some((f) => f.to === to && f.ref === ref); }
  clanFeed() { return (this.r.clan_feed ?? []).filter((f) => !this.feedbackGiven(f.member_id, f.ref)); }
  nudged(id: string) { return (this.r.nudged_today ?? []).includes(id); }

  hotseatFor(sessionId: string) {
    return (this.r.hotseat ?? []).filter((h) => h.session_id === sessionId).sort((a, b) => a.position - b.position);
  }
  myHot(sessionId: string) { return (this.r.hotseat ?? []).find((h) => h.session_id === sessionId && h.member_id === this.me?.id); }
  watched(sessionId: string) { return (this.r.rec_progress ?? []).find((p) => p.session_id === sessionId)?.seconds ?? 0; }
  mySlot(sessionId: string) { return (this.r.demo_slots ?? []).find((d) => d.session_id === sessionId && d.member_id === this.me?.id); }

  kindLine(s: Session): string {
    if (s.kind === "demo") return "Demo Day";
    if (s.kind === "orientation") return `Week ${s.week_n} · Orientation`;
    const wd = T.wdLong(s.starts_at);
    return `Week ${s.week_n} · ${wd} ${(KIND_LABEL[s.kind] ?? "Class").toLowerCase()}`;
  }

  breaks() { return (this.p.content.breaks ?? []).map((b) => ({ start: new Date(b.start), end: new Date(b.end), label: b.label })); }
  breakOn(d: Date) { return this.breaks().find((b) => d.getTime() >= T.sod(b.start).getTime() && d.getTime() <= b.end.getTime()); }

  /** Arc position: the node per week; past the last week once the cohort is over. */
  arcCur(): number { return this.alumni ? this.weeks.length : this.week(); }
}
