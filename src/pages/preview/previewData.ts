/**
 * Mock data for the Creator Studio PREVIEW prototype.
 *
 * 🔴 NOTHING HERE TOUCHES THE DATABASE. Every value below is a hard-coded
 * literal so the prototype can be explored on a real device without a single
 * read or write against production. When a surface graduates from prototype to
 * product, its data source moves to Supabase and its entry here is deleted.
 */

export type DayState = "done" | "current" | "locked";

export interface PreviewDay {
  label: string;
  title: string;
  xp: number;
  state: DayState;
  note?: string;
}

export interface PreviewWeek {
  n: number;
  theme: string;
  /** Which of the four arcs this week sits in. */
  phase: string;
  /** The ONE deliverable for the week — the doc calls it "the block". */
  block: string;
  state: "done" | "current" | "locked";
  opensOn?: string;
  lockReason?: string;
  days: PreviewDay[];
}

/**
 * The real Creator Academy engine — 13 weeks, four phases, taken from
 * `L3C_Cohort_Structure_v2` / `LUCA_Program_System_v2`. One deliverable
 * ("the block") per week, not thirteen scattered assignments.
 *
 * Weekly rhythm from the source doc: Sunday 3 PM live class → deliverable due
 * Thursday 9 PM → Saturday 6 PM Ship / Fix / Hold review.
 *
 * ⚠️ Structure only — the dates in the source belong to Cohort 01 (Jun 13–Sep 12).
 * Cohort 02 runs Aug 15 → Demo Day Nov 14, so real dates come from
 * `cohort_weeks.starts_on`, never from here.
 */
export const PHASES = [
  { name: "Position", weeks: "W0–1" },
  { name: "Produce", weeks: "W2–6" },
  { name: "Multiply", weeks: "W7–8" },
  { name: "Convert & Systemize", weeks: "W9–12" },
] as const;

export const ENGINE: Array<{ n: number; phase: string; title: string; block: string }> = [
  { n: 0, phase: "Position", title: "The Psychology of Storytelling", block: "Founder story: written + on camera + reviewed" },
  { n: 1, phase: "Position", title: "Founder–Market Fit", block: "One-pager + 21-idea calendar + post #1" },
  { n: 2, phase: "Produce", title: "Scriptwriting + Your AI Engine", block: "5 scripts + the engine running" },
  { n: 3, phase: "Produce", title: "Shot Division + Production Fundamentals", block: "Set approved + FIRST PUBLIC POST" },
  { n: 4, phase: "Produce", title: "Advanced Production", block: "B-roll bank + 3 reels from one sitting" },
  { n: 5, phase: "Produce", title: "On-Camera Confidence", block: "Take-1 vs take-10 + re-shoot posted" },
  { n: 6, phase: "Produce", title: "Editing Systems + Your 21-Day Plan", block: "Edit template + Calendar v2 draft" },
  { n: 7, phase: "Multiply", title: "Repurposing + Writing for Every Format", block: "The 1→7 pipeline, run on their own long-form" },
  { n: 8, phase: "Multiply", title: "Platform Strategy + The Commitment", block: "Profiles live + Sprint contract + bank checked" },
  { n: 9, phase: "Convert & Systemize", title: "Community + Lead Capture · Sprint Begins", block: "Capture machine firing + week 1 held" },
  { n: 10, phase: "Convert & Systemize", title: "Analytics That Matter · Sprint Week 2", block: "Scorecard live + a data-driven double-down" },
  { n: 11, phase: "Convert & Systemize", title: "Monetization + Paid Marketing · Sprint Week 3", block: "Funnel + inbound script + paper-boost plan" },
  { n: 12, phase: "Convert & Systemize", title: "The Creator OS + Your 12-Month Plan + Demo Day", block: "The 12-month engine + Creator OS fully lit" },
];

export const WEEKS: PreviewWeek[] = [
  {
    n: 3,
    theme: "Shot Division + Production Fundamentals",
    phase: "Produce",
    block: "Set approved + FIRST PUBLIC POST",
    state: "done",
    days: [
      { label: "Sun 3 PM", title: "Live class — the frame, the set", xp: 20, state: "done" },
      { label: "Wed", title: "Editing masterclass", xp: 10, state: "done" },
      { label: "Thu 9 PM", title: "The block — set approved, page public", xp: 25, state: "done" },
      { label: "Sat 6 PM", title: "Ship / Fix / Hold", xp: 15, state: "done" },
    ],
  },
  {
    n: 4,
    theme: "Advanced Production",
    phase: "Produce",
    block: "B-roll bank + 3 reels from one sitting",
    state: "current",
    days: [
      { label: "Sun 3 PM", title: "Live class — lighting depth + the B-roll Bank", xp: 20, state: "done" },
      { label: "Mon", title: "Build your reusable B-roll bank", xp: 10, state: "done" },
      { label: "Wed", title: "Teleprompter + Batch Day setup", xp: 10, state: "current", note: "Unlocks Second Brain" },
      { label: "Thu 9 PM", title: "The block — 3 reels from one sitting", xp: 25, state: "locked" },
      { label: "Sat 6 PM", title: "Ship / Fix / Hold", xp: 15, state: "locked" },
    ],
  },
  {
    n: 5,
    theme: "On-Camera Confidence",
    phase: "Produce",
    block: "Take-1 vs take-10 + re-shoot posted",
    state: "locked",
    opensOn: "Sun 10 Aug",
    lockReason: "Submit Week 4's block to open this week and its recording.",
    days: [],
  },
];

export const STATS = { xp: 840, streak: 6, week: 4, totalWeeks: 13 };

export interface PreviewFeedPost {
  id: string;
  author: string;
  initials: string;
  when: string;
  body: string;
  link?: {
    kind: "youtube" | "instagram" | "drive" | "generic";
    title: string;
    site: string;
    duration?: string;
  };
  pdf?: { name: string; pages: number; size: string };
  replies: number;
}

export const FEED: PreviewFeedPost[] = [
  {
    id: "f1",
    author: "Ananya R.",
    initials: "AR",
    when: "2h",
    body: "Week 4 hook test. Third version is the one that finally felt like me.",
    link: {
      kind: "instagram",
      title: "Nobody teaches you what to do with your first salary",
      site: "Instagram",
      duration: "0:47",
    },
    replies: 4,
  },
  {
    id: "f2",
    author: "Karthik M.",
    initials: "KM",
    when: "5h",
    body: "Rough cut before I post it tomorrow. Is the open too slow?",
    link: {
      kind: "youtube",
      title: "I tracked every rupee for 30 days — rough cut v2",
      site: "YouTube · Unlisted",
      duration: "3:12",
    },
    replies: 7,
  },
  {
    id: "f3",
    author: "Divya S.",
    initials: "DS",
    when: "1d",
    body: "My content calendar for the next four weeks, if anyone wants a template.",
    pdf: { name: "Divya_Content_Calendar_Aug.pdf", pages: 3, size: "412 KB" },
    replies: 2,
  },
];

export interface PreviewAlbumBlock {
  name: string;
  filled: number;
  total: number;
  slots: Array<"filled" | "review" | "empty" | "locked">;
  unlockNote?: string;
}

export const ALBUM: PreviewAlbumBlock[] = [
  { name: "Position", filled: 5, total: 5, slots: ["filled", "filled", "filled", "filled", "filled"] },
  {
    name: "Scripts",
    filled: 4,
    total: 8,
    slots: ["filled", "filled", "review", "filled", "empty", "empty", "locked", "locked"],
  },
  {
    name: "Body of work",
    filled: 2,
    total: 6,
    slots: ["filled", "filled", "empty", "empty", "locked", "locked"],
    unlockNote: "Week 6+",
  },
];

export const MENTOR_QUEUE = [
  { name: "Ananya R.", initials: "AR", type: "Reel", status: "open" as const, when: "Thu 8:40 PM" },
  { name: "Karthik M.", initials: "KM", type: "Text", status: "open" as const, when: "Thu 6:02 PM" },
  { name: "Divya S.", initials: "DS", type: "Reel", status: "closed" as const, when: "Wed 9:15 PM" },
  { name: "Rohan T.", initials: "RT", type: "Text", status: "closed" as const, when: "Wed 7:48 PM" },
];
