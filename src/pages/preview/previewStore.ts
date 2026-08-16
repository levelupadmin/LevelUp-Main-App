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
  LUCA, SEED_VERSION, findCard, XP,
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
  /** Which seed the stored program came from. See SEED_VERSION. */
  programVersion: number;

  /* ── Templates and cohorts are different objects ───────────────────────
   *
   * 🔴 THE DISTINCTION THE FOUNDER DREW, 2026-08-15: "I have a template and I
   * don't want you to touch it. When it shows Your Cohorts, I click on that
   * and change THAT — I might have the same Creator Academy running for three
   * batches at once."
   *
   * So a template is a shape that gets copied, and a cohort owns its copy.
   * Editing Cohort 02's week 5 can never reach Cohort 03, and improving the
   * template never reaches a batch already running. That is the only way three
   * simultaneous batches of one programme can each drift on their own.
   */
  templates: ProgramTemplate[];
  cohorts: Cohort[];
  activeCohortId: string;
}

export interface Cohort {
  id: string;
  name: string;
  /** Which template it was cut from. Kept for "clone this again". */
  templateKey: string;
  /** This cohort's OWN copy. Every admin edit lands here, never on the template. */
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
  programVersion: SEED_VERSION,
  templates: [LUCA],
  cohorts: [{ id: "ca02", name: "Creator Academy · Cohort 02", templateKey: LUCA.key, program: LUCA }],
  activeCohortId: "ca02",
};

/** The programme the student is actually walking. */
export function activeProgram(s: PlayState): ProgramTemplate {
  return s.cohorts.find((c) => c.id === s.activeCohortId)?.program ?? s.program;
}

export function activeCohort(s: PlayState): Cohort | undefined {
  return s.cohorts.find((c) => c.id === s.activeCohortId);
}

/** Every structural edit goes through here, so it can only ever hit one cohort. */
function mapActive(s: PlayState, fn: (t: ProgramTemplate) => ProgramTemplate): PlayState {
  return {
    ...s,
    cohorts: s.cohorts.map((c) => (c.id === s.activeCohortId ? { ...c, program: fn(c.program) } : c)),
  };
}

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
  | { type: "restore_curriculum" }
  | { type: "cohort_create"; templateKey: string; name: string; startISO: string }
  | { type: "cohort_select"; id: string }
  | { type: "cohort_delete"; id: string }
  | { type: "template_clone"; fromKey: string; name: string }
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
      return mapActive(s, (t) => setCardField(t, a.cardId, a.patch));
    case "week_move":
      return mapActive(s, (t) => moveWeek(t, a.from, a.to));
    case "week_add":
      return mapActive(s, (t) => addWeek(t, a.at, a.phase));
    case "week_duplicate":
      return mapActive(s, (t) => duplicateWeek(t, a.index));
    case "week_delete":
      return mapActive(s, (t) => deleteWeek(t, a.index));
    case "week_edit":
      return mapActive(s, (t) => setWeekField(t, a.index, a.patch));
    case "card_add":
      return mapActive(s, (t) => addCard(t, a.weekIndex, a.kind, a.dayOffset));
    case "card_duplicate":
      return mapActive(s, (t) => duplicateCard(t, a.weekIndex, a.cardId));
    case "card_delete":
      return mapActive(s, (t) => deleteCard(t, a.weekIndex, a.cardId));
    case "phase_rename":
      return mapActive(s, (t) => renamePhase(t, a.from, a.to));
    case "batch_start":
      return mapActive(s, (t) => withStart(t, a.startISO));
    case "question_add":
      return mapActive(s, (t) => addQuestion(t, a.cardId, a.qType));
    case "question_edit":
      return mapActive(s, (t) => setQuestion(t, a.cardId, a.qid, a.patch));
    case "question_delete":
      return mapActive(s, (t) => deleteQuestion(t, a.cardId, a.qid));
    case "question_move":
      return mapActive(s, (t) => moveQuestion(t, a.cardId, a.qid, a.dir));
    case "resource_add":
      return mapActive(s, (t) => addResource(t, a.cardId, a.kind));
    case "resource_edit":
      return mapActive(s, (t) => setResource(t, a.cardId, a.rid, a.patch));
    case "resource_delete":
      return mapActive(s, (t) => deleteResource(t, a.cardId, a.rid));
    case "phase_add":
      return mapActive(s, (t) => addPhase(t, a.name));
    case "week_phase":
      return mapActive(s, (t) => setWeekPhase(t, a.index, a.phase));
    case "week_no_session":
      return mapActive(s, (t) => setNoSession(t, a.index, a.off, a.note));
    case "batch_push":
      return mapActive(s, (t) => pushFrom(t, a.afterWeek, a.weeks, a.reason));
    case "batch_unpush":
      return mapActive(s, (t) => removePause(t, a.id));
    case "restore_curriculum":
      // Content back to the shipped seed. Progress is deliberately untouched —
      // a reviewer restoring the curriculum has not asked to lose their walk.
      return { ...mapActive(s, () => LUCA), program: LUCA, programVersion: SEED_VERSION };
    case "cohort_create": {
      const tpl = s.templates.find((t) => t.key === a.templateKey);
      if (!tpl || !a.name.trim()) return s;
      const id = `co-${Date.now().toString(36)}`;
      // A COPY, taken at launch. The template can move on afterwards and this
      // batch will not, which is the whole point of the split.
      const program: ProgramTemplate = JSON.parse(JSON.stringify({ ...tpl, anchorISO: a.startISO, pauses: [] }));
      return { ...s, cohorts: [...s.cohorts, { id, name: a.name.trim(), templateKey: tpl.key, program }], activeCohortId: id };
    }
    case "cohort_select":
      return s.cohorts.some((c) => c.id === a.id) ? { ...s, activeCohortId: a.id } : s;
    case "cohort_delete": {
      if (s.cohorts.length <= 1) return s;
      const cohorts = s.cohorts.filter((c) => c.id !== a.id);
      return { ...s, cohorts, activeCohortId: s.activeCohortId === a.id ? cohorts[0].id : s.activeCohortId };
    }
    case "template_clone": {
      const src = s.templates.find((t) => t.key === a.fromKey);
      if (!src || !a.name.trim()) return s;
      const key = a.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      if (s.templates.some((t) => t.key === key)) return s;
      const copy: ProgramTemplate = JSON.parse(JSON.stringify({ ...src, key, name: a.name.trim() }));
      return { ...s, templates: [...s.templates, copy] };
    }
    case "reset":
      return INITIAL;
    default:
      return s;
  }
}

const KEY = "creator-studio-preview-v10";

export function usePlayState(): [PlayState, React.Dispatch<PlayAction>] {
  const [state, dispatch] = useReducer(reduce, INITIAL, (init) => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return init;
      const saved = JSON.parse(raw) as PlayState;
      // A newer seed wins over the stored copy of the curriculum, but only over
      // the curriculum — the walk survives.
      if (saved && saved.programVersion !== SEED_VERSION) {
        saved.program = LUCA;
        saved.programVersion = SEED_VERSION;
        saved.templates = [LUCA];
        saved.cohorts = [{ id: "ca02", name: "Creator Academy · Cohort 02", templateKey: LUCA.key, program: LUCA }];
        saved.activeCohortId = "ca02";
      }
      // A shape mismatch after a prototype update must reset, not crash.
      return Array.isArray(saved.days) && Array.isArray(saved.posts) && Array.isArray(saved.watched) && typeof saved.overrides === "object" && Array.isArray(saved.programs) && Array.isArray(saved.builtSubmissions) && typeof saved.progress === "object" && typeof saved.feedback === "object" && Array.isArray(saved.submissions) && saved.program && Array.isArray(saved.program.weeks) && Array.isArray(saved.cohorts) && Array.isArray(saved.templates) ? saved : init;
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
