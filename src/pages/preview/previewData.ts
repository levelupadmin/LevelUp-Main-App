/**
 * Mock data for the Creator Studio PREVIEW prototype.
 *
 * 🔴 NOTHING HERE TOUCHES THE DATABASE. Every value below is a hard-coded
 * literal so the prototype can be explored on a real device without a single
 * read or write against production. When a surface graduates from prototype to
 * product, its data source moves to Supabase and its entry here is deleted.
 *
 * v2, after the founder's first full walkthrough. What changed and why:
 *  - The whole 13-week engine now exists as walkable weeks (not a text list) —
 *    "I want to know all 13 blocks… I can't revisit right now."
 *  - Recordings are REAL playable videos (public sample films) — "use one of
 *    the dummy video links so I can actually go through the experience."
 *  - The feed has people, likes, comments and post types — "think what normal
 *    people would want to put in a feed."
 *  - The Album is a creator PROFILE with actual scripts and sprint links —
 *    "if scripts are there, I don't want to see it as text."
 *  - The mentor desk ships with a full dummy queue.
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

export const CURRENT_WEEK = 4;

/** When each still-locked week opens (Cohort 01 rhythm: Sundays). */
export const OPENS_ON: Record<number, string> = {
  5: "Sun 10 Aug", 6: "Sun 17 Aug", 7: "Sun 24 Aug", 8: "Sun 31 Aug",
  9: "Sun 7 Sep", 10: "Sun 14 Sep", 11: "Sun 21 Sep", 12: "Sun 28 Sep",
};

/** One named drill per week so future weeks read as real, not placeholders. */
const DRILLS: Record<number, string> = {
  0: "Write your story's one true sentence",
  1: "Map 21 ideas onto the calendar",
  2: "Run one script through the AI engine",
  3: "Shot-divide your first script",
  4: "Build your reusable B-roll bank",
  5: "Take-1 vs take-10 — same script, ten takes",
  6: "Cut one reel inside the edit template",
  7: "Split your long-form into 7 pieces",
  8: "Set up the three platform profiles",
  9: "Wire the lead magnet to your bio",
  10: "Read your first scorecard cold",
  11: "Write the inbound DM script",
  12: "Assemble the 12-month engine map",
};

export interface PathDay {
  id: string;
  label: string;
  title: string;
  xp: number;
  kind: "class" | "drill" | "block" | "review";
}

/** The standard weekly rhythm, instantiated per week. */
export function daysForWeek(n: number): PathDay[] {
  const e = ENGINE[n];
  return [
    { id: `w${n}-class`, label: "Sun 3 PM", title: `Live class — ${e.title}`, xp: 20, kind: "class" },
    { id: `w${n}-drill`, label: "Tue", title: DRILLS[n] ?? "Guided drill", xp: 10, kind: "drill" },
    { id: `w${n}-block`, label: "Thu 9 PM", title: `The block — ${e.block}`, xp: 25, kind: "block" },
    { id: `w${n}-review`, label: "Sat 6 PM", title: "Ship / Fix / Hold", xp: 15, kind: "review" },
  ];
}

/* ── Recordings — real playable video, one per opened week ──────────────── */

const VID = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample";

export interface PreviewRecording {
  week: number;
  title: string;
  duration: string;
  videoUrl: string;
}

/** Public sample films (Blender open movies + Google sample clips) as stand-ins. */
export const RECORDINGS: Record<number, PreviewRecording> = {
  0: { week: 0, title: "The Psychology of Storytelling — full class", duration: "58:20", videoUrl: `${VID}/ForBiggerEscapes.mp4` },
  1: { week: 1, title: "Founder–Market Fit — full class", duration: "61:05", videoUrl: `${VID}/ForBiggerFun.mp4` },
  2: { week: 2, title: "Scriptwriting + Your AI Engine — full class", duration: "64:40", videoUrl: `${VID}/ElephantsDream.mp4` },
  3: { week: 3, title: "Shot Division + Production Fundamentals — full class", duration: "59:12", videoUrl: `${VID}/Sintel.mp4` },
  4: { week: 4, title: "Advanced Production — full class", duration: "62:14", videoUrl: `${VID}/TearsOfSteel.mp4` },
};

/* ── The upcoming live session ──────────────────────────────────────────── */

export const LIVE_SESSION = {
  week: 5,
  title: "On-Camera Confidence — live class",
  when: "Sun 10 Aug · 3:00 PM",
  host: "Rahul",
  agenda: [
    "Warm-up: the 10-second cold open, everyone on camera",
    "Take-1 vs take-10 — live demonstration",
    "Three students get a live re-direct",
    "The week's block briefed: re-shoot one old reel",
  ],
  zoomUrl: "https://zoom.us/j/98217643210?pwd=creatorstudio",
};

/* ── People — the room (Cohort 01 flavoured, invented names) ────────────── */

export interface PreviewPerson {
  id: string;
  name: string;
  initials: string;
  niche: string;
  city: string;
  week: number;
  streak: number;
  isMentor?: boolean;
  hasPhoto?: boolean;
}

export const PEOPLE: PreviewPerson[] = [
  { id: "rahul", name: "Rahul", initials: "R", niche: "Filmmaking · your mentor", city: "Bangalore", week: 13, streak: 0, isMentor: true },
  { id: "meghna", name: "Meghna Iyer", initials: "MI", niche: "Personal finance, told like stories", city: "Bangalore", week: 4, streak: 11, hasPhoto: true },
  { id: "pranav", name: "Pranav Kotecha", initials: "PK", niche: "Strength training for desk workers", city: "Mumbai", week: 4, streak: 9 },
  { id: "divya", name: "Divya Sharma", initials: "DS", niche: "Career switches after 30", city: "Pune", week: 4, streak: 7 },
  { id: "rohan", name: "Rohan Thakur", initials: "RT", niche: "Tech that's actually worth it", city: "Bangalore", week: 4, streak: 5 },
  { id: "ananya", name: "Ananya Rao", initials: "AR", niche: "Home cooking, restaurant technique", city: "Chennai", week: 4, streak: 12 },
  { id: "karthik", name: "Karthik Menon", initials: "KM", niche: "Money habits for first jobbers", city: "Hyderabad", week: 4, streak: 6 },
  { id: "sana", name: "Sana Shaikh", initials: "SS", niche: "Design portfolios that get calls", city: "Mumbai", week: 3, streak: 3 },
  { id: "ankit", name: "Ankit Verma", initials: "AV", niche: "Real estate without the drama", city: "Gurgaon", week: 4, streak: 8 },
  { id: "priya", name: "Priya Nair", initials: "PN", niche: "Wellness for shift workers", city: "Kochi", week: 4, streak: 10 },
  { id: "arjun", name: "Arjun Das", initials: "AD", niche: "Street photography stories", city: "Kolkata", week: 3, streak: 4 },
];

/* ── Feed seeds — types, likes, comments ────────────────────────────────── */

export type PostType = "work" | "feedback" | "request";

export interface SeedPost {
  id: string;
  author: string;
  initials: string;
  when: string;
  type: PostType;
  body: string;
  url?: string;
  urlTitle?: string;
  likes: number;
  comments: Array<{ author: string; body: string }>;
}

export const SEED_POSTS: SeedPost[] = [
  {
    id: "s1", author: "Meghna Iyer", initials: "MI", when: "2h", type: "work",
    body: "Week 4 hook test. Third version is the one that finally felt like me.",
    url: "https://www.instagram.com/reel/meghna-w4-hooks", urlTitle: "Nobody teaches you what to do with your first salary",
    likes: 12,
    comments: [
      { author: "Ananya Rao", body: "The pause before 'nobody' is doing so much work. Stealing it." },
      { author: "Rahul", body: "This is the one. Post it, don't touch it again." },
      { author: "Karthik Menon", body: "Okay the third hook got me. 🔥" },
    ],
  },
  {
    id: "s2", author: "Pranav Kotecha", initials: "PK", when: "5h", type: "feedback",
    body: "Rough cut before I post it tomorrow. Is the open too slow? Be brutal.",
    url: "https://youtu.be/pranav-roughcut-v2", urlTitle: "I tracked every workout for 30 days — rough cut v2",
    likes: 8,
    comments: [
      { author: "Divya Sharma", body: "First 4 seconds are fine, it's seconds 5–9 that sag. Cut the gym pan." },
      { author: "Meghna Iyer", body: "Agree with Divya. Your talking head is stronger than the b-roll here." },
    ],
  },
  {
    id: "s3", author: "Rohan Thakur", initials: "RT", when: "8h", type: "request",
    body: "Anyone in Indiranagar with a DJI mic free this weekend? Shooting my Week 4 reels on Saturday and my lav died.",
    likes: 6,
    comments: [
      { author: "Meghna Iyer", body: "I've got one — DM me, I'm 10 min away." },
      { author: "Ankit Verma", body: "If Meghna's falls through, I can courier mine Friday." },
    ],
  },
  {
    id: "s4", author: "Divya Sharma", initials: "DS", when: "1d", type: "work",
    body: "My content calendar for the next four weeks, if anyone wants the template.",
    url: "https://drive.google.com/file/d/divya-calendar-aug", urlTitle: "Divya_Content_Calendar_Aug (template)",
    likes: 15,
    comments: [
      { author: "Priya Nair", body: "This is so clean. Copied for the sprint. Thank you!" },
    ],
  },
  {
    id: "s5", author: "Sana Shaikh", initials: "SS", when: "1d", type: "feedback",
    body: "Two thumbnail options for my portfolio teardown video. Which one would you tap?",
    url: "https://drive.google.com/file/d/sana-thumbs-ab", urlTitle: "Thumb A vs Thumb B",
    likes: 9,
    comments: [
      { author: "Arjun Das", body: "B. The face + one word beats the clever one every time." },
      { author: "Rohan Thakur", body: "B, and make the word bigger." },
    ],
  },
  {
    id: "s6", author: "Ananya Rao", initials: "AR", when: "2d", type: "work",
    body: "First reel where I cooked, talked AND held the frame. Week 3 me would not believe this.",
    url: "https://www.instagram.com/reel/ananya-onepan", urlTitle: "One pan, five mistakes you're making",
    likes: 21,
    comments: [
      { author: "Rahul", body: "Massive jump from Week 1. This is why we drill." },
      { author: "Pranav Kotecha", body: "The overhead shot!! 👏" },
    ],
  },
];

/* ── The Album — a creator profile filled with real dummy work ──────────── */

export const PROFILE = {
  name: "Meghna Iyer",
  handle: "@meghna.makes",
  bio: "Personal finance, told like stories. Building in public with Creator Academy · Cohort 01.",
  niche: "Personal finance",
  city: "Bangalore",
  followers: "12.4k",
  piecesPlaced: 9,
  piecesTotal: 19,
};

export interface PreviewDoc {
  id: string;
  title: string;
  kind: "script" | "doc";
  approvedWeek: number;
  hook?: string;
  sections: Array<{ label: string; body: string }>;
}

export const SCRIPTS: PreviewDoc[] = [
  {
    id: "scr1", title: "The first-salary trap", kind: "script", approvedWeek: 2,
    hook: "Your first salary is a trap — and everyone falls for the same version of it.",
    sections: [
      { label: "Hook", body: "Your first salary is a trap — and everyone falls for the same version of it." },
      { label: "Setup", body: "Day 1: ₹42,000 lands. Day 9: you've upgraded your phone, your commute and your coffee. Nobody planned it. That's the point — it plans itself." },
      { label: "Proof", body: "Lifestyle creep eats 60% of first-year raises. I tracked mine: ₹11,400/month gone to upgrades I couldn't name a month later." },
      { label: "Payoff", body: "The fix isn't a budget. It's one rule: raise your savings the same day they raise your salary. Before the money learns where else to go." },
      { label: "CTA", body: "I post one money story like this every week — follow along for the next one." },
    ],
  },
  {
    id: "scr2", title: "The ₹500 rule", kind: "script", approvedWeek: 2,
    hook: "I don't buy anything over ₹500 the day I see it. Ever.",
    sections: [
      { label: "Hook", body: "I don't buy anything over ₹500 the day I see it. Ever." },
      { label: "Setup", body: "Not because I'm disciplined. Because I'm not — and I finally admitted it." },
      { label: "Proof", body: "48-hour rule, 3 months: 31 things went in the cart. 9 survived the wait. That's ₹38,000 that still exists." },
      { label: "Payoff", body: "Willpower is a terrible system. A waiting period is a great one. You don't have to be strong if you're slow." },
      { label: "CTA", body: "Try it for one week and tell me what died in your cart." },
    ],
  },
  {
    id: "scr3", title: "Rent vs buy in 45 seconds", kind: "script", approvedWeek: 3,
    hook: "Renting is not throwing money away. Say it with me.",
    sections: [
      { label: "Hook", body: "Renting is not throwing money away. Say it with me." },
      { label: "Setup", body: "Your uncle's math: rent = ₹0 back, EMI = an asset. Here's the math your uncle skipped." },
      { label: "Proof", body: "₹80L flat: EMI ₹62k vs rent ₹28k. Invest the ₹34k difference at 12% for 20 years — ₹3.2 crore. The flat? Maybe ₹2.4." },
      { label: "Payoff", body: "Buy a house when you're buying a HOME. As an investment, the spreadsheet usually says rent." },
      { label: "CTA", body: "Send this to the uncle. Lovingly." },
    ],
  },
  {
    id: "scr4", title: "Why your SIP feels invisible", kind: "script", approvedWeek: 3,
    hook: "Year one of a SIP feels like nothing is happening. That's the design.",
    sections: [
      { label: "Hook", body: "Year one of a SIP feels like nothing is happening. That's the design." },
      { label: "Setup", body: "₹10k/month, 12 months in: ₹1.27L on ₹1.2L invested. ₹7,000 gain. Your friend's crypto did that in a Tuesday." },
      { label: "Proof", body: "Same SIP, year 15: the MONTHLY growth is bigger than your contribution. The line doesn't climb — it curves." },
      { label: "Payoff", body: "Compounding back-loads everything. The boring decade is the price of the absurd one." },
      { label: "CTA", body: "Comment 'curve' and I'll send you the year-by-year table." },
    ],
  },
];

export const POSITION_PACK: PreviewDoc[] = [
  {
    id: "pos1", title: "Founder story — 90 seconds", kind: "doc", approvedWeek: 0,
    sections: [
      { label: "The wound", body: "First job, first salary, zero idea. Lost ₹1.8L in two years to 'small' decisions no one taught me to see." },
      { label: "The turn", body: "One spreadsheet, one rule, one year. The money stopped leaking — and friends started asking how." },
      { label: "The mission", body: "Make first-jobbers money-fluent before their habits set. Stories first, jargon never." },
    ],
  },
  {
    id: "pos2", title: "Niche statement", kind: "doc", approvedWeek: 1,
    sections: [
      { label: "Statement", body: "I help 21–28 year-olds in their first jobs build money habits — through 60-second stories, not lectures." },
    ],
  },
  {
    id: "pos3", title: "Audience map", kind: "doc", approvedWeek: 1,
    sections: [
      { label: "Who", body: "Tier-1/2 city, first 3 years of work, ₹4–12L income. Instagram-first, finance-curious, advice-fatigued." },
      { label: "Pain", body: "Money disappears; investing feels like a casino run by uncles; every finance page screams." },
      { label: "Promise", body: "One honest story a week that changes one money habit." },
    ],
  },
  {
    id: "pos4", title: "The one-liner", kind: "doc", approvedWeek: 1,
    sections: [
      { label: "One-liner", body: "Money stories for your first job years — 60 seconds, no jargon, no shame." },
    ],
  },
  {
    id: "pos5", title: "Bio + link strategy", kind: "doc", approvedWeek: 1,
    sections: [
      { label: "Bio", body: "Your first salary deserves better · money stories in 60s · new reel every Fri" },
      { label: "Link", body: "One link → the free 'First Salary Checklist' → email list → (later) the paid sprint." },
    ],
  },
];

export interface PreviewWork {
  id: string;
  title: string;
  url: string;
  platform: "instagram" | "youtube";
  duration: string;
  views: string;
  week: number;
}

export const PUBLISHED_WORK: PreviewWork[] = [
  { id: "wk1", title: "Nobody teaches you what to do with your first salary", url: "https://www.instagram.com/reel/meghna-first-salary", platform: "instagram", duration: "0:47", views: "12.4k", week: 3 },
  { id: "wk2", title: "I tracked every rupee for 30 days", url: "https://youtu.be/meghna-30days", platform: "youtube", duration: "8:12", views: "3.1k", week: 3 },
  { id: "wk3", title: "3 money rules I stole from my mother", url: "https://www.instagram.com/reel/meghna-mother-rules", platform: "instagram", duration: "0:58", views: "8.9k", week: 4 },
];

export interface SprintDay {
  day: number;
  state: "posted" | "today" | "upcoming";
  url?: string;
  platform?: "instagram" | "youtube";
}

/** The 21-Day Creator Sprint — days 1–9 shipped, day 10 is today. */
export const SPRINT: SprintDay[] = Array.from({ length: 21 }, (_, i) => {
  const day = i + 1;
  if (day <= 9)
    return {
      day, state: "posted" as const,
      platform: day % 3 === 0 ? ("youtube" as const) : ("instagram" as const),
      url: day % 3 === 0 ? `https://youtu.be/meghna-sprint-d${day}` : `https://www.instagram.com/reel/meghna-sprint-d${day}`,
    };
  if (day === 10) return { day, state: "today" as const };
  return { day, state: "upcoming" as const };
});

/* ── Mentor desk seeds ──────────────────────────────────────────────────── */

export interface MentorItem {
  id: string;
  student: string;
  initials: string;
  week: number;
  type: "Reel" | "Text";
  when: string;
  body: string;
  url?: string;
  status: "open" | "closed";
  closedNote?: string;
}

export const MENTOR_SEED: MentorItem[] = [
  {
    id: "m1", student: "Ananya Rao", initials: "AR", week: 4, type: "Reel", when: "Thu 8:40 PM",
    body: "3 reels from one sitting — batch-shot Sunday, all three cut. The second one is my favourite.",
    url: "https://www.instagram.com/reel/ananya-batch2", status: "open",
  },
  {
    id: "m2", student: "Karthik Menon", initials: "KM", week: 4, type: "Text", when: "Thu 6:02 PM",
    body: "B-roll bank done — 42 clips, tagged by scene. Reels 1 and 2 attached; third renders tonight, will update before 9.",
    status: "open",
  },
  {
    id: "m3", student: "Sana Shaikh", initials: "SS", week: 3, type: "Reel", when: "Thu 5:15 PM",
    body: "Late Week 3 block (was travelling, admin unlocked). First public post is live — shot division sheet in the drive link.",
    url: "https://drive.google.com/file/d/sana-shotdiv", status: "open",
  },
  {
    id: "m4", student: "Divya Sharma", initials: "DS", week: 4, type: "Reel", when: "Wed 9:15 PM",
    body: "Batch day worked. 3 reels, one sitting, teleprompter earned its money.",
    url: "https://www.instagram.com/reel/divya-batch", status: "closed", closedNote: "Ship — reviewed on Sat call",
  },
  {
    id: "m5", student: "Rohan Thakur", initials: "RT", week: 4, type: "Text", when: "Wed 7:48 PM",
    body: "B-roll bank + 2 of 3 reels. Third one's hook isn't landing — flagged it in the notes.",
    status: "closed", closedNote: "Fix — re-cut the third hook, resubmit informally",
  },
];

export const STATS = { xp: 840, streak: 6, week: CURRENT_WEEK, totalWeeks: 13 };
