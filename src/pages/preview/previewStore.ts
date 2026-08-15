/**
 * The playable state for the Creator Studio prototype.
 *
 * The whole learning loop is real, just local: watch the recording → it
 * completes the day and hands you to the unfinished assignment → submit the
 * block → Week 5 (and its recording) unlock → the mentor desk can approve it →
 * the approved work can be placed in the Album → the feed takes posts, likes
 * and comments. Progress persists in localStorage so it survives a refresh,
 * and a reset button puts everything back.
 *
 * 🔴 STILL ZERO DATABASE. This file is the entire backend: a reducer and
 * localStorage. When this graduates, the reducer's action names become the RPC
 * names (`complete_day`, `watch_recording`, `submit_block`, …) — that mapping
 * is the point.
 */
import { useEffect, useReducer } from "react";
import { SEED_POSTS, type PostType } from "./previewData";
import {
  LUCA, findCard, XP,
  moveWeek, addWeek, duplicateWeek, deleteWeek, setWeekField,
  addCard, duplicateCard, deleteCard, setCardField, renamePhase, withStart,
  addQuestion, setQuestion, deleteQuestion, moveQuestion,
  addResource, setResource, deleteResource,
  addPhase, setWeekPhase, setNoSession, pushFrom, removePause,
} from "./previewProgram";
import type {
  AnswerValue, CardKind, CardResource, ProgramTemplate, Question, QuestionType,
  ResourceKind, TemplateCard, TemplateWeek,
} from "./previewProgram";

export interface PlayDay {
  id: string;
  label: string;
  title: string;
  xp: number;
  state: "done" | "current" | "locked";
  isBlock?: boolean;
  note?: string;
}

export interface PlayPost {
  id: string;
  author: string;
  initials: string;
  type: PostType;
  body: string;
  url?: string;
  urlTitle?: string;
  when: string;
  likes: number;
  likedByMe: boolean;
  comments: Array<{ author: string; body: string }>;
  mine?: boolean;
}

/** A cohort launched from the admin demo — the architecture's layer 2, played. */
export interface PlayCohort {
  name: string;
  start: string; // YYYY-MM-DD
  blackouts: string[];
  shiftedCount: number;
}

/** Template card overrides — admin edits that project onto the student side. */
export interface CardOverride {
  blurb?: string;
  block?: string;
}

/* ── The from-scratch Program Builder — the founder's "plus plus plus" ──── */

export type BuiltCardKind = "live_class" | "community_call" | "task" | "assignment" | "resource";

export interface BuiltResource {
  id: string;
  label: string;
  url: string;
}

/**
 * A card is a TEMPLATE the admin fills, not just a title. Which fields render
 * depends on the kind — the student page draws itself from what's filled:
 *   live_class      mentor · brief · zoomUrl (pre-class) · recordingUrl (post) · resources
 *   community_call  mentor · brief · zoomUrl
 *   assignment      brief · resources · submitPrompt (the in-built "Tally") — submissions land in the Mentor Desk
 *   task            brief
 *   resource        brief · resources
 */
export interface BuiltCard {
  id: string;
  day: string; // Sun … Sat
  kind: BuiltCardKind;
  title: string;
  mentor?: string;
  brief?: string;
  zoomUrl?: string;
  recordingUrl?: string;
  resources?: BuiltResource[];
  /** Assignment only — the submission ask. Its presence turns on the in-built submit form. */
  submitPrompt?: string;
  link?: string; // legacy quick-add single link (still rendered as a resource)
}

/** A submission made against a built program's assignment card — the mentor sees these. */
export interface BuiltSubmission {
  id: string;
  programId: string;
  programName: string;
  cardId: string;
  cardTitle: string;
  body: string;
  when: string;
}

export interface BuiltWeek {
  id: string;
  title: string;
  cards: BuiltCard[];
}

export interface BuiltPhase {
  id: string;
  name: string;
  weeks: BuiltWeek[];
}

export interface BuiltProgram {
  id: string;
  name: string;
  phases: BuiltPhase[];
}

/* ── The real program's runtime — layer 3 of the architecture ───────────── */

/**
 * Per-card student state. One row per (student, cohort_card) when this
 * graduates — `card_progress`. Status only ever moves forward, which is a
 * CHECK constraint in Postgres and an invariant here: nothing that unlocked
 * ever re-locks.
 */
export interface CardProgress {
  done: boolean;
  doneOn?: string;
  /**
   * "I'm starting this." A commitment, not a checkbox — it costs nothing, it
   * puts you in the room, and it is what makes the board worth opening on the
   * days between opening and the deadline.
   */
  startedOn?: string;
  draftedOn?: string;
}

/**
 * The founder's recording gate, 2026-08-15: you cannot watch the recording of
 * a session until you have told us how it went. Two ratings and one open box —
 * deliberately small, because a long form does not get filled and an unfilled
 * form means an unwatchable recording.
 */
export interface SessionFeedback {
  mentor: number;   // 1-5
  content: number;  // 1-5
  note: string;
}

/** A block submission — this is what the mentor opens. */
export interface BlockSubmission {
  cardId: string;
  weekNo: number;
  cardTitle: string;
  /** One entry per question id — the sheet's columns come from the card. */
  answers: Record<string, AnswerValue>;
  when: string;
  verdict?: "ship" | "fix" | "hold";
  mentorNote?: string;
}

export interface PlayState {
  xp: number;
  streak: number;
  days: PlayDay[];
  /** Recording ids (`rec-w4`) the student marked watched. */
  watched: string[];
  /** Week 4's block submission. */
  blockText: string;
  blockStatus: "none" | "submitted" | "accepted";
  week5Unlocked: boolean;
  albumFilled: string[]; // slot codes
  posts: PlayPost[];
  /** Admin demo state. */
  cohort?: PlayCohort;
  overrides: Record<number, CardOverride>;
  /** Programs built from scratch in the app. */
  programs: BuiltProgram[];
  /** Submissions against built assignment cards — routed to the Mentor Desk. */
  builtSubmissions: BuiltSubmission[];
  /* ── the real LUCA program ── */
  progress: Record<string, CardProgress>;
  feedback: Record<string, SessionFeedback>;
  submissions: BlockSubmission[];
  /** Saved-but-not-sent answers, per card. */
  drafts: Record<string, Record<string, AnswerValue>>;
  /**
   * THE PROGRAM ITSELF, in state — editable, not a constant.
   *
   * 🔴 THE CHANGE THAT MAKES ADMIN REAL. Until now the curriculum was a frozen
   * import and admin "edits" were a patch layer laid over it. That could never
   * satisfy the founder's rule — anything on the path must be add-able and
   * delete-able from the back end — because you cannot patch a week into
   * existence. So the template lives here, and every admin action rewrites it.
   * One source, one thing to change, and the student side simply reads it.
   */
  program: ProgramTemplate;
}

const SEEDED: PlayPost[] = SEED_POSTS.map((p) => ({
  id: p.id,
  author: p.author,
  initials: p.initials,
  type: p.type,
  body: p.body,
  url: p.url,
  urlTitle: p.urlTitle,
  when: p.when,
  likes: p.likes,
  likedByMe: false,
  comments: p.comments,
}));

export const INITIAL: PlayState = {
  xp: 840,
  streak: 6,
  days: [
    { id: "d1", label: "Sun 3 PM", title: "Live class — lighting depth + the B-roll Bank", xp: 20, state: "done" },
    { id: "d2", label: "Mon", title: "Build your reusable B-roll bank", xp: 10, state: "done" },
    { id: "d3", label: "Wed", title: "Watch the class recording", xp: 10, state: "current", note: "Hands you straight to the block" },
    { id: "d4", label: "Thu 9 PM", title: "The block — 3 reels from one sitting", xp: 25, state: "locked", isBlock: true },
    { id: "d5", label: "Sat 6 PM", title: "Ship / Fix / Hold", xp: 15, state: "locked" },
  ],
  watched: [],
  blockText: "",
  blockStatus: "none",
  week5Unlocked: false,
  albumFilled: [],
  posts: SEEDED,
  cohort: undefined,
  overrides: {},
  programs: [],
  builtSubmissions: [],
  progress: {},
  feedback: {},
  submissions: [],
  drafts: {},
  program: LUCA,
};

export type PlayAction =
  | { type: "complete_day"; id: string }
  | { type: "watch_recording"; week: number }
  | { type: "submit_block"; text: string }
  | { type: "mentor_accept" }
  | { type: "add_to_album"; slot: string }
  | { type: "post_feed"; postType: PostType; body: string; url?: string }
  | { type: "toggle_like"; id: string }
  | { type: "add_comment"; id: string; body: string }
  | { type: "launch_cohort"; cohort: PlayCohort }
  | { type: "admin_edit_card"; week: number; blurb?: string; block?: string }
  | { type: "save_program"; program: BuiltProgram }
  | { type: "delete_program"; id: string }
  | { type: "submit_built"; programId: string; cardId: string; body: string }
  | { type: "card_done"; cardId: string }
  | { type: "start_work"; cardId: string }
  | { type: "save_draft"; cardId: string; answers: Record<string, AnswerValue> }
  | { type: "submit_feedback"; cardId: string; mentor: number; content: number; note: string }
  | { type: "submit_work"; cardId: string; answers: Record<string, AnswerValue> }
  | { type: "mentor_verdict"; cardId: string; verdict: "ship" | "fix" | "hold"; note: string }
  | { type: "admin_save_card"; cardId: string; patch: Partial<TemplateCard> }
  | { type: "week_move"; from: number; to: number }
  | { type: "week_add"; at: number; phase: string }
  | { type: "week_duplicate"; index: number }
  | { type: "week_delete"; index: number }
  | { type: "week_edit"; index: number; patch: Partial<TemplateWeek> }
  | { type: "card_add"; weekIndex: number; kind: CardKind; dayOffset: number }
  | { type: "card_duplicate"; weekIndex: number; cardId: string }
  | { type: "card_delete"; weekIndex: number; cardId: string }
  | { type: "phase_rename"; from: string; to: string }
  | { type: "batch_start"; startISO: string }
  | { type: "question_add"; cardId: string; qType: QuestionType }
  | { type: "question_edit"; cardId: string; qid: string; patch: Partial<Question> }
  | { type: "question_delete"; cardId: string; qid: string }
  | { type: "question_move"; cardId: string; qid: string; dir: -1 | 1 }
  | { type: "resource_add"; cardId: string; kind: ResourceKind }
  | { type: "resource_edit"; cardId: string; rid: string; patch: Partial<CardResource> }
  | { type: "resource_delete"; cardId: string; rid: string }
  | { type: "phase_add"; name: string }
  | { type: "week_phase"; index: number; phase: string }
  | { type: "week_no_session"; index: number; off: boolean; note?: string }
  | { type: "batch_push"; afterWeek: number; weeks: number; reason: string }
  | { type: "batch_unpush"; id: string }
  | { type: "reset" };

function completeDay(s: PlayState, id: string): PlayState {
  const i = s.days.findIndex((d) => d.id === id);
  if (i < 0 || s.days[i].state !== "current") return s;
  const days = s.days.map((d, j) =>
    j === i ? { ...d, state: "done" as const } : j === i + 1 && d.state === "locked" ? { ...d, state: "current" as const } : d,
  );
  return { ...s, days, xp: s.xp + s.days[i].xp, streak: s.streak + 1 };
}

export function reduce(s: PlayState, a: PlayAction): PlayState {
  switch (a.type) {
    case "complete_day":
      return completeDay(s, a.id);
    case "watch_recording": {
      const id = `rec-w${a.week}`;
      if (s.watched.includes(id)) return s;
      // Watching the CURRENT week's recording is the Wed day — completing it
      // is what hands the student to the block. Past weeks are pure revisit.
      const afterDay = a.week === 4 ? completeDay(s, "d3") : s;
      return { ...afterDay, watched: [...s.watched, id] };
    }
    case "submit_block": {
      if (!a.text.trim()) return s;
      const days = s.days.map((d) => (d.isBlock ? { ...d, state: "done" as const } : d));
      // Submitting the block is what opens Week 5 — the gate rule, played out.
      return { ...s, days, blockText: a.text.trim(), blockStatus: "submitted", week5Unlocked: true, xp: s.xp + 25 };
    }
    case "mentor_accept":
      return s.blockStatus === "submitted" ? { ...s, blockStatus: "accepted" } : s;
    case "add_to_album":
      return s.blockStatus === "accepted" && !s.albumFilled.includes(a.slot)
        ? { ...s, albumFilled: [...s.albumFilled, a.slot] }
        : s;
    case "post_feed": {
      if (!a.body.trim() && !a.url) return s;
      const post: PlayPost = {
        id: `p${Date.now()}`,
        author: "You",
        initials: "YO",
        type: a.postType,
        body: a.body.trim(),
        url: a.url,
        when: "just now",
        likes: 0,
        likedByMe: false,
        comments: [],
        mine: true,
      };
      return { ...s, posts: [post, ...s.posts] };
    }
    case "toggle_like":
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === a.id ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) } : p,
        ),
      };
    case "add_comment":
      if (!a.body.trim()) return s;
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === a.id ? { ...p, comments: [...p.comments, { author: "You", body: a.body.trim() }] } : p,
        ),
      };
    case "launch_cohort":
      return { ...s, cohort: a.cohort };
    case "admin_edit_card": {
      const prev = s.overrides[a.week] ?? {};
      const next: CardOverride = { ...prev };
      if (a.blurb !== undefined) next.blurb = a.blurb;
      if (a.block !== undefined) next.block = a.block;
      return { ...s, overrides: { ...s.overrides, [a.week]: next } };
    }
    case "save_program": {
      const exists = s.programs.some((p) => p.id === a.program.id);
      return {
        ...s,
        programs: exists ? s.programs.map((p) => (p.id === a.program.id ? a.program : p)) : [...s.programs, a.program],
      };
    }
    case "delete_program":
      return { ...s, programs: s.programs.filter((p) => p.id !== a.id) };
    case "submit_built": {
      if (!a.body.trim()) return s;
      const prog = s.programs.find((p) => p.id === a.programId);
      const card = prog?.phases.flatMap((ph) => ph.weeks).flatMap((w) => w.cards).find((c) => c.id === a.cardId);
      if (!prog || !card) return s;
      return {
        ...s,
        builtSubmissions: [
          { id: `bs${Date.now()}`, programId: prog.id, programName: prog.name, cardId: card.id, cardTitle: card.title, body: a.body.trim(), when: "just now" },
          ...s.builtSubmissions,
        ],
      };
    }
    case "card_done": {
      if (s.progress[a.cardId]?.done) return s;
      const found = findCard(s.program, a.cardId);
      if (!found) return s;
      return {
        ...s,
        progress: { ...s.progress, [a.cardId]: { done: true, doneOn: "just now" } },
        xp: s.xp + found.card.xp,
        streak: s.streak + 1,
      };
    }
    case "start_work": {
      if (s.progress[a.cardId]?.startedOn) return s;
      return { ...s, progress: { ...s.progress, [a.cardId]: { ...(s.progress[a.cardId] ?? { done: false }), startedOn: "just now" } } };
    }
    case "save_draft": {
      const prev = s.progress[a.cardId] ?? { done: false };
      return {
        ...s,
        drafts: { ...s.drafts, [a.cardId]: a.answers },
        progress: { ...s.progress, [a.cardId]: { ...prev, startedOn: prev.startedOn ?? "just now", draftedOn: "just now" } },
      };
    }
    case "submit_feedback": {
      if (!a.mentor || !a.content) return s;
      return { ...s, feedback: { ...s.feedback, [a.cardId]: { mentor: a.mentor, content: a.content, note: a.note.trim() } } };
    }
    case "submit_work": {
      // At least one answer has to carry something. An empty submission is not
      // a submission, and letting one through means a mentor opening nothing —
      // the exact thing the box exists to prevent.
      const filled = Object.values(a.answers).some((v) => (Array.isArray(v) ? v.length > 0 : String(v ?? "").trim() !== ""));
      if (!filled) return s;
      const found = findCard(s.program, a.cardId);
      if (!found) return s;
      const already = s.submissions.some((x) => x.cardId === a.cardId);
      const row: BlockSubmission = {
        cardId: a.cardId,
        weekNo: found.week.no,
        cardTitle: found.card.title,
        answers: a.answers,
        when: "just now",
      };
      return {
        ...s,
        submissions: already ? s.submissions.map((x) => (x.cardId === a.cardId ? row : x)) : [row, ...s.submissions],
        progress: { ...s.progress, [a.cardId]: { done: true, doneOn: "just now" } },
        xp: already ? s.xp : s.xp + found.card.xp,
      };
    }
    case "mentor_verdict": {
      return {
        ...s,
        submissions: s.submissions.map((x) =>
          x.cardId === a.cardId ? { ...x, verdict: a.verdict, mentorNote: a.note.trim() } : x,
        ),
        xp: a.verdict === "ship" ? s.xp + XP.ship : s.xp,
      };
    }
    case "admin_save_card":
      return { ...s, program: setCardField(s.program, a.cardId, a.patch) };
    case "week_move":
      return { ...s, program: moveWeek(s.program, a.from, a.to) };
    case "week_add":
      return { ...s, program: addWeek(s.program, a.at, a.phase) };
    case "week_duplicate":
      return { ...s, program: duplicateWeek(s.program, a.index) };
    case "week_delete":
      return { ...s, program: deleteWeek(s.program, a.index) };
    case "week_edit":
      return { ...s, program: setWeekField(s.program, a.index, a.patch) };
    case "card_add":
      return { ...s, program: addCard(s.program, a.weekIndex, a.kind, a.dayOffset) };
    case "card_duplicate":
      return { ...s, program: duplicateCard(s.program, a.weekIndex, a.cardId) };
    case "card_delete":
      return { ...s, program: deleteCard(s.program, a.weekIndex, a.cardId) };
    case "phase_rename":
      return { ...s, program: renamePhase(s.program, a.from, a.to) };
    case "batch_start":
      return { ...s, program: withStart(s.program, a.startISO) };
    case "question_add":
      return { ...s, program: addQuestion(s.program, a.cardId, a.qType) };
    case "question_edit":
      return { ...s, program: setQuestion(s.program, a.cardId, a.qid, a.patch) };
    case "question_delete":
      return { ...s, program: deleteQuestion(s.program, a.cardId, a.qid) };
    case "question_move":
      return { ...s, program: moveQuestion(s.program, a.cardId, a.qid, a.dir) };
    case "resource_add":
      return { ...s, program: addResource(s.program, a.cardId, a.kind) };
    case "resource_edit":
      return { ...s, program: setResource(s.program, a.cardId, a.rid, a.patch) };
    case "resource_delete":
      return { ...s, program: deleteResource(s.program, a.cardId, a.rid) };
    case "phase_add":
      return { ...s, program: addPhase(s.program, a.name) };
    case "week_phase":
      return { ...s, program: setWeekPhase(s.program, a.index, a.phase) };
    case "week_no_session":
      return { ...s, program: setNoSession(s.program, a.index, a.off, a.note) };
    case "batch_push":
      return { ...s, program: pushFrom(s.program, a.afterWeek, a.weeks, a.reason) };
    case "batch_unpush":
      return { ...s, program: removePause(s.program, a.id) };
    case "reset":
      return INITIAL;
    default:
      return s;
  }
}

const KEY = "creator-studio-preview-v9";

export function usePlayState(): [PlayState, React.Dispatch<PlayAction>] {
  const [state, dispatch] = useReducer(reduce, INITIAL, (init) => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return init;
      const saved = JSON.parse(raw) as PlayState;
      // A shape mismatch after a prototype update must reset, not crash.
      return Array.isArray(saved.days) && Array.isArray(saved.posts) && Array.isArray(saved.watched) && typeof saved.overrides === "object" && Array.isArray(saved.programs) && Array.isArray(saved.builtSubmissions) && typeof saved.progress === "object" && typeof saved.feedback === "object" && Array.isArray(saved.submissions) && saved.program && Array.isArray(saved.program.weeks) ? saved : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked — fine */ }
  }, [state]);
  return [state, dispatch];
}

/** Detect what a pasted link is, for the feed's preview card. */
export function linkKind(url: string): "youtube" | "instagram" | "drive" | "generic" {
  if (/youtu\.?be/i.test(url)) return "youtube";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/drive\.google/i.test(url)) return "drive";
  return "generic";
}
