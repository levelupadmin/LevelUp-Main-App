/**
 * THE TEMPLATE LAYER — a program written once, with no dates in it.
 *
 * This file is the schema, expressed in TypeScript so the prototype can run it
 * today and the migration to Postgres is mechanical rather than interpretive:
 *
 *   ProgramTemplate  →  programs + program_templates
 *   TemplateWeek     →  template_weeks
 *   TemplateCard     →  template_cards   (payload = the kind's own fields)
 *
 * 🔴 THE RULE THAT MAKES DUPLICATION FREE. A template contains OFFSETS, never
 * dates. `dayOffset` counts from the week's Sunday anchor. Dates exist only on
 * a cohort, computed at launch. "Next cohort starts Dec 5" is therefore one
 * form, not a rebuild — and a program with a different shape is a different
 * template, not different code.
 *
 * 🔴 WHY OFFSETS RUN -1 TO 7, NOT 0 TO 6. Two real weeks in this curriculum
 * refuse a Sun-to-Sat box. Week 0's orientation is the SATURDAY BEFORE its
 * Sunday class (offset -1). Week 12's Demo Day is Sat Nov 14 with the final
 * class the day after (offset 7). Modelling the week as "anchored on its
 * Sunday class, reaching back a day and forward past Saturday" makes both
 * ordinary instead of special-cased. The Saturday review at offset 6 reviews
 * THAT week's block, which is why the printed master grid shows it on the next
 * row — the grid is presentation, this is the truth.
 *
 * Content authority: `06_Curriculum_Lab/L3C_Cohort02_Master_Schedule.md`
 * (locked 2026-07-30) with detail from `L3C_Weeks_FINAL.md`. Where the two
 * disagree, the Cohort 02 master schedule wins: it moved the origin story out
 * of W0 into W1 and made W0's block the voice notes plus two reel breakdowns.
 */

export type CardKind = "live_session" | "community_call" | "micro" | "block";

/** A resource, and WHEN it is allowed to appear. */
export type ResourceKind = "deck" | "transcript" | "recording" | "resource";

export const RESOURCE_LABEL: Record<ResourceKind, string> = {
  deck: "Deck", transcript: "Transcript", recording: "Recording", resource: "Resource",
};

export interface CardResource {
  id: string;
  label: string;
  url: string;
  /** What it is, so the student page can group it instead of one flat list. */
  kind?: ResourceKind;
  /**
   * The program's standing rule: "resources arrive the morning of the task
   * that uses them. No kits, no dumps, nothing that constrains the thinking
   * before the thinking is done." So release time is per-resource data, not a
   * global setting someone has to remember.
   */
  releaseNote?: string;
}

/**
 * THE FORM BUILDER — "like a Tally form, but ours".
 *
 * 🔴 WHY A QUESTION LIST AND NOT THREE FIXED BOXES. The first cut hard-coded
 * link / notes / file, which meant every assignment asked the same three
 * things regardless of what it was actually collecting. An assignment that
 * wants "pick one of these three angles, then paste the doc, then rate your own
 * confidence" could not be expressed at all. So a submission is an ORDERED
 * LIST OF QUESTIONS the admin builds, exactly like Tally — with one deliberate
 * difference: it never asks for name, email or phone, because by the time a
 * student reaches this screen we already know who they are. That repetition is
 * the single biggest reason to bring this in-house.
 */
export type QuestionType =
  | "short_text" | "long_text" | "link" | "file"
  | "choice_one" | "choice_many" | "rating" | "yes_no";

export const QUESTION_LABEL: Record<QuestionType, string> = {
  short_text: "Short text",
  long_text: "Long text",
  link: "Link",
  file: "File upload",
  choice_one: "Pick one",
  choice_many: "Pick many",
  rating: "Rating out of five",
  yes_no: "Yes or no",
};

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  /** The line under the question saying what belongs there. */
  helper: string;
  required: boolean;
  /** choice_one / choice_many only. */
  options?: string[];
}

export interface SubmitBox {
  prompt: string;
  questions: Question[];
}

/** An answer is a string, or a list of them for pick-many. */
export type AnswerValue = string | string[];

export interface TemplateCard {
  id: string;
  kind: CardKind;
  /** -1 (Sat before) · 0 Sun · 1 Mon · … · 6 Sat · 7 (Sun after). */
  dayOffset: number;
  /**
   * Assignments only. The day the work OPENS, when it is earlier than the day
   * it is due. An assignment is a span, not a moment: it can open on Wednesday
   * and be due Friday at 6. The trail keeps the node on the DUE day, because
   * that is where the pressure is, and the card says how long it has been open.
   */
  opensDayOffset?: number;
  time?: string;
  durationMin?: number;
  title: string;
  mentor?: string;
  blurb?: string;
  learn?: string[];
  /** Empty string = the admin has not put it up yet. NOT a broken card. */
  zoomUrl?: string;
  recordingUrl?: string;
  /** The founder's gate: no recording until the feedback form is submitted. */
  gateRecordingOnFeedback?: boolean;
  /** A review session states which week's block it reads. */
  reviewsWeek?: number;
  resources?: CardResource[];
  submit?: SubmitBox;
  xp: number;
  /** Week 2+ are titled from the master schedule but not yet authored. */
  needsAuthoring?: boolean;
}

export interface TemplateWeek {
  no: number;
  phase: string;
  title: string;
  blurb?: string;
  /**
   * "There is no class this Sunday." The week KEEPS its slot and its dates —
   * only the teaching is off. Marking it does not shift anything, because a
   * cancelled class is not the same event as a cancelled week, and conflating
   * the two is how a schedule quietly drifts by a fortnight.
   */
  noSession?: boolean;
  noSessionNote?: string;
  cards: TemplateCard[];
}

/**
 * A pause inserted into a LIVE batch. Everything after `afterWeek` moves
 * forward by `weeks`; everything up to and including it does not move at all.
 * That asymmetry is the whole point — history has already happened, and a
 * student who submitted week 3 on time must never find week 3 has moved.
 */
export interface BatchPause {
  id: string;
  afterWeek: number;
  weeks: number;
  reason: string;
}

export interface ProgramTemplate {
  key: string;
  name: string;
  roomName: string;
  /** The Sunday of week 0. Cohort 02: Sun 16 Aug 2026. */
  anchorISO: string;
  /** Draft = nobody is in it yet. Live = students are walking it right now. */
  status?: "draft" | "live";
  /** Pauses pushed into a running batch. Empty for a clean template. */
  pauses?: BatchPause[];
  weeks: TemplateWeek[];
}

/* ── XP: a config row, never a number buried in a component ─────────────── */
export const XP = { live_session: 50, community_call: 20, micro: 15, block: 100, ship: 50 } as const;

let qn = 0;
const q = (type: QuestionType, title: string, helper: string, required = true, options?: string[]): Question => {
  qn += 1;
  return { id: `q${qn}`, type, title, helper, required, options };
};

const box = (prompt: string, questions: Question[]): SubmitBox => ({ prompt, questions });

/* ── WEEK 0 — fully authored ────────────────────────────────────────────── */

const W0: TemplateWeek = {
  no: 0,
  phase: "Find your lane",
  title: "Orientation + the psychology of storytelling",
  blurb: "The week the program explains itself, then teaches you why stories move people at all. AI is banned this week, on purpose.",
  cards: [
    {
      id: "w0-orientation", kind: "live_session", dayOffset: -1, time: "6:00 PM", durationMin: 150,
      title: "Orientation", mentor: "Rahul",
      blurb: "Why this exists, how the twelve weeks run, and what a verdict means. Breakout intros in rooms of five.",
      learn: [
        "Why this program exists",
        "The twelve-week map and the weekly rhythm",
        "Ship / Fix / Hold, and what a verdict actually means",
        "Creator OS walkthrough, with your cards on the wall",
      ],
      zoomUrl: "https://levelup.zoom.us/j/00000000000", recordingUrl: "",
      gateRecordingOnFeedback: true, xp: XP.live_session,
    },
    {
      id: "w0-class", kind: "live_session", dayOffset: 0, time: "3:00 PM", durationMin: 180,
      title: "The psychology of storytelling", mentor: "Rahul + Sai",
      blurb: "Taught through stories, not slides. Why a claim bounces off and a story lands.",
      learn: [
        "Two types of power, and why stories move the shared world",
        "Suspense against cliffhangers: loops you close, loops you leave open",
        "Dopamine against oxytocin",
        "The three oxytocin levers: one emphasised moment, sensory language, a relatable character",
      ],
      zoomUrl: "https://levelup.zoom.us/j/00000000000", recordingUrl: "",
      gateRecordingOnFeedback: true, xp: XP.live_session,
    },
    {
      id: "w0-community", kind: "community_call", dayOffset: 2, time: "9:00 PM", durationMin: 45,
      title: "Open room — bring your messiest memory", mentor: "Prakriti",
      blurb: "No teaching, no agenda. Read one of your voice notes out loud and let the room tell you where it got interesting.",
      zoomUrl: "https://levelup.zoom.us/j/00000000000", xp: XP.community_call,
    },
    {
      id: "w0-mon", kind: "micro", dayOffset: 1,
      title: "Record five voice-note memories",
      blurb: "Pick five prompts from your card. One to two minutes each, talked not written. These become your Language Bank, and they train your week 3 AI voice file.",
      learn: ["Pick five prompts from your card", "One to two minutes each, talked not written", "Upload into 01 - Voice and story"],
      resources: [
        { id: "r-mem-a", label: "Memory prompts — card A (you run a business)", url: "#", releaseNote: "Released Mon 8:00 AM" },
        { id: "r-mem-b", label: "Memory prompts — card B (building toward one)", url: "#", releaseNote: "Released Mon 8:00 AM" },
      ],
      xp: XP.micro,
    },
    {
      id: "w0-tue", kind: "micro", dayOffset: 2,
      title: "Break down two creator reels",
      blurb: "Two reels that actually held you. Label every lever you were taught on Sunday, and write what each one did to you.",
      learn: ["Pick two reels that held you", "Label the levers", "Write what the lever did to you, not what it was"],
      resources: [{ id: "r-lever", label: "Lever labelling sheet", url: "#", releaseNote: "Released Tue 8:00 AM" }],
      xp: XP.micro,
    },
    {
      id: "w0-wed", kind: "micro", dayOffset: 3,
      title: "Your intro recording",
      blurb: "A camera muscle, not a graded piece. Retakes are fine and nobody scores this.",
      learn: ["Window light, eye level, arm and a half away", "Say who you are and what you are here to build", "Retakes are fine"],
      xp: XP.micro,
    },
    {
      id: "w0-block", kind: "block", dayOffset: 4, opensDayOffset: 1, time: "9:00 PM",
      title: "Week 0 block — voice notes and breakdowns",
      blurb: "Five voice notes uploaded, and two reel breakdowns with the levers labelled.",
      learn: ["Tension holds", "Specific, not general", "Sounds like a person talking"],
      submit: box("Drop your week 0 work", [
        q("link", "Your Drive folder", "Paste the link to the folder holding your five voice notes. Make sure it is shared so your mentor can open it."),
        q("choice_one", "Which memory card did you use", "Pick the one that matched where you are.", true, ["Card A — I run a business", "Card B — building toward one"]),
        q("long_text", "The two reels you broke down", "Paste both links, and under each one write which levers you spotted and what they did to you."),
        q("short_text", "Anything your mentor should know first", "Optional. One line.", false),
      ]),
      xp: XP.block,
    },
    {
      id: "w0-fri", kind: "micro", dayOffset: 5,
      title: "Onboarding form and your Drive folder",
      blurb: "Three things and a folder. This is the setup that every later week assumes you have.",
      learn: [
        "A clear profile picture, saved not posted",
        "A photo of your filming spot",
        "Your commit post, drafted not posted",
        "Your Drive work folder, created from the template",
      ],
      resources: [{ id: "r-drive", label: "Drive work-folder template", url: "#", releaseNote: "Released Fri 8:00 AM" }],
      xp: XP.micro,
    },
    {
      id: "w0-review", kind: "live_session", dayOffset: 6, time: "6:00 PM", durationMin: 120,
      title: "Review 1 — Ship / Fix / Hold", mentor: "Rahul + Sai", reviewsWeek: 0,
      blurb: "Blocks read live in the room. One verdict each, and the reason behind it. Written verdicts for everyone by Sunday noon.",
      learn: ["Your block read in the room", "One verdict, and why", "Written verdicts for everyone by Sunday noon"],
      zoomUrl: "https://levelup.zoom.us/j/00000000000", recordingUrl: "",
      gateRecordingOnFeedback: true, xp: XP.live_session,
    },
  ],
};

/* ── WEEK 1 — fully authored ────────────────────────────────────────────── */

const W1: TemplateWeek = {
  no: 1,
  phase: "Find your lane",
  title: "Creator market fit and positioning",
  blurb: "The word niche gets retired. You leave with a corner you can own and a line that says who you help.",
  cards: [
    {
      id: "w1-class", kind: "live_session", dayOffset: 0, time: "3:00 PM", durationMin: 180,
      title: "Creator market fit and positioning", mentor: "Sai + Prakriti",
      blurb: "The reframe first: on social you are a dopamine truck dealer before you are a storyteller.",
      learn: [
        "Category and market, because niche makes people think too small",
        "The 100-day test on three candidate topics",
        "Positioning by skill-stacking, and the line 'I help [who] [do what]'",
        "The five seats, and why objections become hooks",
      ],
      zoomUrl: "https://levelup.zoom.us/j/00000000000", recordingUrl: "",
      gateRecordingOnFeedback: true, xp: XP.live_session,
    },
    {
      id: "w1-mon", kind: "micro", dayOffset: 1,
      title: "Mining prompt — twenty verbatim phrases",
      blurb: "Their words, not yours. Twenty phrases word for word, each with the source you found it in.",
      learn: ["Run the mining prompt", "Twenty phrases word for word, with sources", "Into the Language Bank"],
      resources: [{ id: "r-mine", label: "Merged mining prompt", url: "#", releaseNote: "Released Mon 8:00 AM" }],
      xp: XP.micro,
    },
    {
      id: "w1-tue", kind: "micro", dayOffset: 2,
      title: "Two-lens competitor scan",
      blurb: "Three accounts in your industry, three that hold the same attention from somewhere else. Then the gap line.",
      learn: ["Lens one: three industry accounts", "Lens two: three attention accounts", "Close with what none of the six give"],
      resources: [{ id: "r-lens", label: "Two-lens sheet", url: "#", releaseNote: "Released Tue 8:00 AM" }],
      xp: XP.micro,
    },
    {
      id: "w1-wed", kind: "micro", dayOffset: 3,
      title: "One-pager, bio, fifteen-minute profile cleanup",
      blurb: "Five lines, then compress them into a bio. A bio cannot come before a locked corner, which is why it lands here and not in week 0.",
      learn: ["The one-pager, five lines", "Bio rewritten from it", "Fifteen-minute cleanup"],
      resources: [
        { id: "r-onepager", label: "One-pager template", url: "#", releaseNote: "Released Wed 8:00 AM" },
        { id: "r-clean", label: "Profile cleanup checklist", url: "#", releaseNote: "Released Wed 8:00 AM" },
      ],
      xp: XP.micro,
    },
    {
      id: "w1-block", kind: "block", dayOffset: 4, opensDayOffset: 1, time: "9:00 PM",
      title: "Week 1 block — positioning one-pager",
      blurb: "The one-pager plus your origin story as a voice note, twenty seconds maximum.",
      learn: ["The who is hyper-specific", "The value line survives the 100-day test", "Twenty exact audience phrases banked"],
      submit: box("Drop your week 1 work", [
        q("link", "Your one-pager", "Link to your creator-story doc in 02 - Scripts and ideas. Shared, so your mentor can open it."),
        q("short_text", "Your positioning line", "The exact line: I help [who] [do what]. One sentence, so the room can read it at a glance."),
        q("choice_many", "Which seats are you taking", "Pick one to three. Never all five.", true, ["Teacher", "Underdog", "Insider", "Contrarian", "Entertainer"]),
        q("file", "Your origin story voice note", "Twenty seconds maximum. Talked, not read."),
        q("rating", "How settled does this feel", "One means still guessing, five means you would defend it.", false),
      ]),
      xp: XP.block,
    },
    {
      id: "w1-fri", kind: "micro", dayOffset: 5,
      title: "Commit post live — post 1",
      blurb: "The post you drafted in week 0 goes up. It lands on a profile that now says who you are.",
      learn: ["Post the commit post", "Paste the live link back here"],
      xp: XP.micro,
    },
    {
      id: "w1-review", kind: "live_session", dayOffset: 6, time: "6:00 PM", durationMin: 120,
      title: "Review 2 — one-pagers", mentor: "Sai + Prakriti", reviewsWeek: 1,
      blurb: "One-pagers through Ship / Fix / Hold. The honest question is whether the who is specific enough to own.",
      learn: ["One-pagers read in the room", "Is the who ownable", "Written verdicts by Sunday noon"],
      zoomUrl: "https://levelup.zoom.us/j/00000000000", recordingUrl: "",
      gateRecordingOnFeedback: true, xp: XP.live_session,
    },
  ],
};

/* ── WEEKS 2 to 12 — titled from the master schedule, not yet authored ──── */

function stub(no: number, phase: string, title: string, className: string, blockTitle: string, blurb: string): TemplateWeek {
  return {
    no, phase, title, blurb,
    cards: [
      {
        id: `w${no}-class`, kind: "live_session", dayOffset: 0, time: "3:00 PM", durationMin: 180,
        title: className, blurb, zoomUrl: "", recordingUrl: "",
        gateRecordingOnFeedback: true, xp: XP.live_session, needsAuthoring: true,
      },
      {
        id: `w${no}-block`, kind: "block", dayOffset: 4, time: "9:00 PM",
        title: blockTitle, blurb: "The week's one deliverable.",
        submit: box("Drop your work", [
          q("link", "Your work", "Link to your Drive folder or Doc, shared so your mentor can open it."),
          q("long_text", "Anything your mentor should know first", "Optional.", false),
        ]),
        xp: XP.block, needsAuthoring: true,
      },
      {
        id: `w${no}-review`, kind: "live_session", dayOffset: 6, time: "6:00 PM", durationMin: 120,
        title: `Review ${no + 1} — Ship / Fix / Hold`, reviewsWeek: no,
        blurb: "The week's blocks read live.", zoomUrl: "", recordingUrl: "",
        gateRecordingOnFeedback: true, xp: XP.live_session, needsAuthoring: true,
      },
    ],
  };
}

export const LUCA: ProgramTemplate = {
  key: "creator_academy",
  name: "LevelUp Creator Academy",
  roomName: "Creator Studio",
  anchorISO: "2026-08-16",
  weeks: [
    W0, W1,
    stub(2, "Ideas and scripts", "Scripts part 1", "Scripts part 1 — structure and hooks", "Week 2 block — three complete scripts", "What a script is, the structure, then hooks. Two weeks for scripts, by design."),
    stub(3, "Ideas and scripts", "Scripts part 2", "Scripts part 2 — the writing process", "Week 3 block — scripts 4 and 5, plus the blind test", "The whole writing process on screen, then the AI engine on Wednesday."),
    stub(4, "Make the content", "Shot division and production", "Shot division + production fundamentals (double)", "Week 4 block — set test and two shot lists", "A-roll is you talking. B-roll is what the viewer sees while you talk. Your first public post lands Friday."),
    stub(5, "Make the content", "Advanced production and on-camera", "Advanced production + the on-camera difference (double)", "Week 5 block — B-roll bank and batch day", "Lighting in depth, the B-roll bank, and the five mechanics. No new scripts this week."),
    stub(6, "Edit like a system", "Editing part 1", "Editing part 1 — the ONE template", "Week 6 block — template plus two edits", "Cut the breath, not the word. One boring template, saved once, reused forever."),
    stub(7, "Edit like a system", "Editing part 2", "Editing part 2 — speed and the sprint draft", "Week 7 block — the sprint draft", "Capacity arithmetic from your own measured numbers, not ours."),
    stub(8, "Multiply and lock", "Distribution weekend", "Platforms + lock and load", "Week 8 block — the sprint contract", "The last teaching weekend. Everything after this is sprint."),
    stub(9, "The Creator Sprint", "Sprint week 1", "Sprint standup", "Sprint week 1 — per your contract", "Teaching is done. Numbers on the board, one blocker each, one commitment each."),
    stub(10, "The Creator Sprint", "Sprint week 2", "Sprint standup", "Sprint week 2 — per your contract", "The founder scorecard, read properly."),
    stub(11, "The Creator Sprint", "Sprint week 3", "Sprint standup", "Sprint week 3 — per your contract", "Funnels and monetisation land on Wednesday."),
    stub(12, "The Creator Sprint", "Demo Day and the 12-month plan", "Demo Day", "Demo Day — present the engine", "You present the engine, not the highlights."),
  ],
};

/* ── Dates: the cohort layer, computed — never authored ─────────────────── */

const DAY = 86400000;

/** Local calendar date. Never toISOString — see previewAdmin.iso for the bug. */
export function isoOf(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** How many weeks of pause sit before this week. History is never affected. */
export function pauseWeeksBefore(t: ProgramTemplate, weekNo: number): number {
  return (t.pauses ?? []).filter((p) => p.afterWeek < weekNo).reduce((n, p) => n + p.weeks, 0);
}

export function dateOf(t: ProgramTemplate, weekNo: number, dayOffset: number): Date {
  const anchor = new Date(`${t.anchorISO}T00:00:00`);
  const shifted = weekNo + pauseWeeksBefore(t, weekNo);
  return new Date(anchor.getTime() + (shifted * 7 + dayOffset) * DAY);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function dayName(d: Date): string {
  return d.toLocaleDateString("en-IN", { weekday: "short" });
}

export function findCard(t: ProgramTemplate, cardId: string): { week: TemplateWeek; card: TemplateCard } | null {
  for (const week of t.weeks) {
    const card = week.cards.find((c) => c.id === cardId);
    if (card) return { week, card };
  }
  return null;
}

/** Cards of a week in the order they happen, not the order they were written. */
export function orderedCards(week: TemplateWeek): TemplateCard[] {
  return [...week.cards].sort((a, b) => a.dayOffset - b.dayOffset || a.kind.localeCompare(b.kind));
}

export const KIND_LABEL: Record<CardKind, string> = {
  live_session: "Live session",
  community_call: "Community call",
  micro: "Micro assignment",
  block: "Assignment deadline",
};

/* ─────────────────────────────────────────────────────────────────────────
   EDITING THE TEMPLATE — pure functions, so admin actions are testable
   ─────────────────────────────────────────────────────────────────────────

   The founder's rule, 2026-08-15: "I don't want to limit myself in terms of
   creating something." So every structural move is here — add, delete,
   duplicate, reorder — for phases, weeks and cards alike, and each one returns
   a NEW template rather than mutating. Two consequences worth the discipline:
   undo is free, and each of these becomes one RPC with the same name later.

   Week numbers are POSITIONS, not identity. Moving week 4 above week 3
   renumbers both, which is exactly what "swap week 3 and 4" has to mean — the
   dates belong to the slot, the content travels.
   ───────────────────────────────────────────────────────────────────────── */

let seq = 0;
export function newId(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

/** Renumber weeks 0..n after any structural change. Dates follow position. */
function renumber(weeks: TemplateWeek[]): TemplateWeek[] {
  return weeks.map((w, i) => ({ ...w, no: i }));
}

export function moveWeek(t: ProgramTemplate, from: number, to: number): ProgramTemplate {
  if (to < 0 || to >= t.weeks.length || from === to) return t;
  const weeks = [...t.weeks];
  const [row] = weeks.splice(from, 1);
  weeks.splice(to, 0, row);
  return { ...t, weeks: renumber(weeks) };
}

export function addWeek(t: ProgramTemplate, at: number, phase: string): ProgramTemplate {
  const weeks = [...t.weeks];
  weeks.splice(at, 0, { no: 0, phase, title: "New week", blurb: "", cards: [] });
  return { ...t, weeks: renumber(weeks) };
}

export function duplicateWeek(t: ProgramTemplate, index: number): ProgramTemplate {
  const src = t.weeks[index];
  if (!src) return t;
  const copy: TemplateWeek = {
    ...src,
    no: 0,
    title: `${src.title} (copy)`,
    cards: src.cards.map((c) => ({ ...c, id: newId(c.kind) })),
  };
  const weeks = [...t.weeks];
  weeks.splice(index + 1, 0, copy);
  return { ...t, weeks: renumber(weeks) };
}

export function deleteWeek(t: ProgramTemplate, index: number): ProgramTemplate {
  if (t.weeks.length <= 1) return t;
  const weeks = t.weeks.filter((_, i) => i !== index);
  return { ...t, weeks: renumber(weeks) };
}

export function setWeekField(t: ProgramTemplate, index: number, patch: Partial<TemplateWeek>): ProgramTemplate {
  return { ...t, weeks: t.weeks.map((w, i) => (i === index ? { ...w, ...patch } : w)) };
}

/** A blank card of a kind, with only that kind's fields present. */
export function blankCard(kind: CardKind, dayOffset: number): TemplateCard {
  const base = { id: newId(kind), kind, dayOffset, title: "Untitled", xp: XP[kind], needsAuthoring: true };
  if (kind === "live_session") return { ...base, time: "3:00 PM", durationMin: 180, mentor: "", blurb: "", learn: [], zoomUrl: "", recordingUrl: "", gateRecordingOnFeedback: true };
  if (kind === "community_call") return { ...base, time: "9:00 PM", durationMin: 45, mentor: "", blurb: "", zoomUrl: "" };
  if (kind === "block")
    return {
      ...base, time: "9:00 PM", blurb: "",
      submit: {
        prompt: "Drop your work",
        questions: [
          { id: newId("q"), type: "link", title: "Your work", helper: "Paste the link to your Doc or Drive folder.", required: true },
        ],
      },
    };
  return { ...base, blurb: "" };
}

export function addCard(t: ProgramTemplate, weekIndex: number, kind: CardKind, dayOffset: number): ProgramTemplate {
  return setWeekField(t, weekIndex, { cards: [...(t.weeks[weekIndex]?.cards ?? []), blankCard(kind, dayOffset)] });
}

export function duplicateCard(t: ProgramTemplate, weekIndex: number, cardId: string): ProgramTemplate {
  const week = t.weeks[weekIndex];
  const src = week?.cards.find((c) => c.id === cardId);
  if (!src) return t;
  return setWeekField(t, weekIndex, { cards: [...week.cards, { ...src, id: newId(src.kind), title: `${src.title} (copy)` }] });
}

export function deleteCard(t: ProgramTemplate, weekIndex: number, cardId: string): ProgramTemplate {
  const week = t.weeks[weekIndex];
  if (!week) return t;
  return setWeekField(t, weekIndex, { cards: week.cards.filter((c) => c.id !== cardId) });
}

export function setCardField(t: ProgramTemplate, cardId: string, patch: Partial<TemplateCard>): ProgramTemplate {
  return {
    ...t,
    weeks: t.weeks.map((w) => ({ ...w, cards: w.cards.map((c) => (c.id === cardId ? { ...c, ...patch, needsAuthoring: false } : c)) })),
  };
}

/** Rename a phase everywhere it appears — phases are a label on a week range. */
export function renamePhase(t: ProgramTemplate, from: string, to: string): ProgramTemplate {
  return { ...t, weeks: t.weeks.map((w) => (w.phase === from ? { ...w, phase: to } : w)) };
}

/** The batch layer: one function, a start date in, every date out. */
export function withStart(t: ProgramTemplate, startISO: string): ProgramTemplate {
  return { ...t, anchorISO: startISO };
}

/* ── Editing questions, resources, phases, and a live batch ─────────────── */

export function blankQuestion(type: QuestionType): Question {
  return {
    id: newId("q"),
    type,
    title: "New question",
    helper: "",
    required: true,
    options: type === "choice_one" || type === "choice_many" ? ["Option one", "Option two"] : undefined,
  };
}

function mapCard(t: ProgramTemplate, cardId: string, fn: (c: TemplateCard) => TemplateCard): ProgramTemplate {
  return { ...t, weeks: t.weeks.map((w) => ({ ...w, cards: w.cards.map((c) => (c.id === cardId ? fn(c) : c)) })) };
}

export function addQuestion(t: ProgramTemplate, cardId: string, type: QuestionType): ProgramTemplate {
  return mapCard(t, cardId, (c) => ({
    ...c,
    needsAuthoring: false,
    submit: { prompt: c.submit?.prompt ?? "Drop your work", questions: [...(c.submit?.questions ?? []), blankQuestion(type)] },
  }));
}

export function setQuestion(t: ProgramTemplate, cardId: string, qid: string, patch: Partial<Question>): ProgramTemplate {
  return mapCard(t, cardId, (c) =>
    c.submit ? { ...c, submit: { ...c.submit, questions: c.submit.questions.map((x) => (x.id === qid ? { ...x, ...patch } : x)) } } : c,
  );
}

export function deleteQuestion(t: ProgramTemplate, cardId: string, qid: string): ProgramTemplate {
  return mapCard(t, cardId, (c) =>
    c.submit ? { ...c, submit: { ...c.submit, questions: c.submit.questions.filter((x) => x.id !== qid) } } : c,
  );
}

export function moveQuestion(t: ProgramTemplate, cardId: string, qid: string, dir: -1 | 1): ProgramTemplate {
  return mapCard(t, cardId, (c) => {
    if (!c.submit) return c;
    const qs = [...c.submit.questions];
    const i = qs.findIndex((x) => x.id === qid);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= qs.length) return c;
    [qs[i], qs[j]] = [qs[j], qs[i]];
    return { ...c, submit: { ...c.submit, questions: qs } };
  });
}

export function addResource(t: ProgramTemplate, cardId: string, kind: ResourceKind): ProgramTemplate {
  return mapCard(t, cardId, (c) => ({
    ...c,
    needsAuthoring: false,
    resources: [...(c.resources ?? []), { id: newId("r"), kind, label: RESOURCE_LABEL[kind], url: "" }],
  }));
}

export function setResource(t: ProgramTemplate, cardId: string, rid: string, patch: Partial<CardResource>): ProgramTemplate {
  return mapCard(t, cardId, (c) => ({ ...c, resources: (c.resources ?? []).map((r) => (r.id === rid ? { ...r, ...patch } : r)) }));
}

export function deleteResource(t: ProgramTemplate, cardId: string, rid: string): ProgramTemplate {
  return mapCard(t, cardId, (c) => ({ ...c, resources: (c.resources ?? []).filter((r) => r.id !== rid) }));
}

/** Add a phase by putting a new week under a new name — phases are a label. */
export function addPhase(t: ProgramTemplate, name: string): ProgramTemplate {
  const weeks = [...t.weeks, { no: 0, phase: name, title: "New week", blurb: "", cards: [] }];
  return { ...t, weeks: weeks.map((w, i) => ({ ...w, no: i })) };
}

/** Move one week into a different phase. The list re-groups by itself. */
export function setWeekPhase(t: ProgramTemplate, index: number, phase: string): ProgramTemplate {
  return setWeekField(t, index, { phase });
}

export function phasesOf(t: ProgramTemplate): string[] {
  const out: string[] = [];
  for (const w of t.weeks) if (!out.includes(w.phase)) out.push(w.phase);
  return out;
}

/* ── Running-batch operations ───────────────────────────────────────────── */

export function setNoSession(t: ProgramTemplate, index: number, off: boolean, note = ""): ProgramTemplate {
  return setWeekField(t, index, { noSession: off, noSessionNote: note });
}

export function pushFrom(t: ProgramTemplate, afterWeek: number, weeks: number, reason: string): ProgramTemplate {
  return { ...t, pauses: [...(t.pauses ?? []), { id: newId("pause"), afterWeek, weeks, reason }] };
}

export function removePause(t: ProgramTemplate, id: string): ProgramTemplate {
  return { ...t, pauses: (t.pauses ?? []).filter((p) => p.id !== id) };
}
