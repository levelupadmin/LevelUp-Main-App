/** Shapes returned by the LUCA RPCs (supabase/migrations/20261007100100_luca_rpcs.sql). */

export type Access = "none" | "applicant" | "learner" | "locked";
export type SessionKind = "orientation" | "review" | "class" | "double" | "standup" | "demo" | "plan";
export type Verdict = "pending" | "ship" | "fix" | "hold";
export type AppStatus =
  | "submitted" | "app_fee_paid" | "interview_scheduled" | "interview_done" | "accepted"
  | "rejected" | "waitlisted" | "confirmation_paid" | "balance_paid" | "enrolled" | "withdrawn";

export interface Pricing {
  price: number; deposit: number; app_fee: number;
  hold_days: number; balance_days: number | null; emi: boolean;
  offering_status?: string; calendly_url?: string | null;
}

export interface Content {
  sales?: SalesCopy;
  phases?: { name: string; from: number; to: number; out: string }[];
  breaks?: { start: string; end: string; label: string }[];
  arc_labels?: [number, string][];
  trailer?: { label?: string; beats: [string, string, string][]; video_url?: string | null; end_kicker?: string; end_title?: string; review_cta?: string };
  sample_review?: SampleReview;
  apply?: { fee_fine?: string; steps: ApplyStep[] };
  interview?: { sub?: string; how?: string };
  status?: {
    eyebrow?: string; iv_label?: string; iv_meta?: string;
    prep?: { title: string; sub?: string; items: [string, string][] };
    decision_eyebrow?: string; decision_title?: string;
  };
  offer?: { title?: string; intro?: string; opens?: [string, string][]; seat_sub?: string };
  setup?: { key: string; title: string; sub: string }[];
  drive_folders?: string[];
  contract?: { eyebrow?: string; title?: string; items: string[]; items_b?: string[] };
  feedback_chips?: string[];
  reveal?: { k?: string; s?: string; cta?: string };
  default_chapters?: Record<string, [number, string][]>;
  certificate?: { line?: string };
  [k: string]: unknown;
}

export interface SalesCopy {
  nav_title?: string; kicker?: string; title?: string; lede?: string; when?: string[];
  trailer?: { img?: string; title?: string; sub?: string };
  nums?: [string, string][];
  outcomes?: { title: string; sub?: string; items: [string, string][] };
  sample?: { eyebrow?: string; title?: string; sub?: string };
  phases?: { title: string; sub?: string };
  week?: { title: string; sub?: string; rows: { day: string; time: string; title: string; sub: string }[] };
  mech?: { title: string; sub?: string; cards: { v: string; n?: string | number; on?: number; d?: string; m?: string; b: string; s: string }[] };
  mentors?: { title: string; sub?: string };
  proof?: { title: string; sub?: string; items: [string, string][] };
  vs?: { title: string; head: [string, string]; rows: [string, string][] };
  price?: { title: string; top?: string; bill: [string, string, string][] };
  steps?: { title: string; items: [string, string][] };
  faq?: { title: string; items: [string, string][] };
  final?: { eyebrow?: string; title?: string };
  apply_cta?: string;
  sticky?: { b?: string; s?: string };
}

export interface SampleReview {
  nav?: string; tag?: string; title?: string; sub?: string; doc?: string;
  script: { t: string; cut?: boolean; hook?: boolean; end?: boolean; fix?: string }[];
  notes: { at: string; lines: number[]; text: string }[];
  by?: { ini: string; name: string; when: string };
  ship_note?: string; after?: string;
}

export type ApplyStep =
  | { kind: "text"; eyebrow?: string; title: string; sub?: string; field: { key: string; label: string; ph?: string }; chips?: string[]; field2?: { key: string; label: string; ph?: string } }
  | { kind: "choice"; key: string; eyebrow?: string; title: string; sub?: string; options: { v: string; t: string; d: string }[] }
  | { kind: "why"; key: string; eyebrow?: string; title: string; sub?: string; options: string[]; hours?: { b: string; em?: string } };

export interface Program {
  id: string; slug: string; offering_id: string | null; is_demo: boolean; enabled: boolean;
  name: string; short_name: string; cohort_label: string;
  starts_at: string | null; demo_day_at: string | null; ends_at: string | null;
  seats: number | null; hours_per_week: number | null; hero_url: string | null; timezone: string;
  features: Record<string, boolean>;
  coin_rules: Record<string, { label: string; value: number }>;
  content: Content;
  sprint: { starts_on: string | null; days: number; track_b_posts_per_week?: number };
  clan_reveal_at: string | null; clan_size: number | null;
  support_whatsapp: string | null; whatsapp_url: string | null; drive_url: string | null;
  pricing: Pricing;
}

export interface Mentor { id: string; name: string; angle: string; photo_url: string | null; handle: string | null }
export interface Week {
  n: number; module: string; phase: number; starts_on: string | null; image_url: string | null;
  post_note: string | null; is_sprint: boolean; is_demo_week: boolean;
  prewatch: { title?: string; video_url?: string | null; minutes?: number };
  quiz: { q: string; options: string[] }[];
}
export interface Session {
  id: string; week_n: number; kind: SessionKind; title: string; starts_at: string; ends_at: string;
  mentor_ids: string[]; prep: string[]; image_url: string | null; has_zoom: boolean;
  recording_url: string | null; recording_minutes: number | null;
  chapters: { at_sec: number; title: string }[];
  files: { badge: string; title: string; sub: string; url: string | null }[];
}
export interface AssignmentPart { k: string; label: string; where?: string; check?: string }
export interface Assignment {
  id: string; week_n: number; title: string; brief: string | null; due_at: string;
  parts: AssignmentPart[]; coins: number | null; is_group: boolean; review_session_id: string | null;
}
export interface Application {
  source: "demo" | "cohort_applications"; id: string; status: AppStatus; app_fee_paid: boolean;
  interview_at: string | null; accepted_at: string | null; confirmed_at: string | null;
  deposit_hold_until: string | null; balance_due_at: string | null;
  answers: Record<string, string | boolean>; applied_at: string;
}
export interface Me {
  id: string; name: string; initials: string; photo_url: string | null; niche: string | null; handle: string | null;
  track: "A" | "B"; clan_id: string | null; coins: number; streak: number; streak_today: boolean;
  setup: Record<string, boolean>; contract_signed_at: string | null; contract_name: string | null;
  cal_token: string; prefs: Record<string, boolean>; revealed_at: string | null; joined_at: string;
}
export interface Member {
  id: string; name: string; initials: string; photo_url: string | null; niche: string | null; handle: string | null;
  track: "A" | "B"; clan_id: string | null; coins: number; week: number;
}
export interface Clan { id: string; name: string; score: number }
export interface Submission {
  id: string; assignment_id: string; links: { kind: string; url: string | null; label?: string; title?: string | null }[];
  submitted_at: string; on_time: boolean; verdict: Verdict; notes: string[];
  reviewed_by: string | null; reviewed_at: string | null; fix_due_at: string | null;
  fix_url: string | null; fix_submitted_at: string | null; was_fix: boolean;
}
export interface SprintPost {
  id: string; day_n: number; kind: "post" | "log"; url: string | null; log: string | null; title: string | null;
  posted_at: string; verdict: "pending" | "ship" | "fix"; verdict_note: string | null;
}
export interface HotseatEntry { session_id: string; member_id: string; position: number; rec_at_sec: number | null }

export interface Room {
  server_now: string;
  access: Access;
  is_staff: boolean;
  signed_in: boolean;
  application: Application | null;
  program: Program;
  mentors: Mentor[];
  weeks: Week[];
  sessions: Session[];
  // learner-only
  week_start?: string;
  clans_open?: boolean;
  me?: Me;
  assignments?: Assignment[];
  members?: Member[];
  clans?: Clan[];
  submissions?: Submission[];
  prewatch?: { week_n: number; quiz_score: number; summary_url: string | null; completed_at: string }[];
  attended?: string[];
  sprint_posts?: SprintPost[];
  ledger?: { amount: number; reason: string; rule: string; at: string }[];
  feedback_given?: { to: string; ref: string }[];
  feedback_received?: { from: string; ref: string; chips: string[]; body: string | null; at: string }[];
  nudged_today?: string[];
  rec_progress?: { session_id: string; seconds: number }[];
  hotseat?: HotseatEntry[];
  demo_slots?: { session_id: string; member_id: string; slot_n: number; at: string | null }[];
  announcements?: { id: string; title: string; body: string | null; link_url: string | null; pinned: boolean; at: string }[];
  resources?: { id: string; week_n: number | null; title: string; url: string; kind: string }[];
  clan_progress?: { member_id: string; submitted: string[]; prewatch: number[]; sprint_days: number[]; attended: string[] }[];
  clan_feed?: { member_id: string; ref: string; title: string; url: string | null; at: string }[];
}

export interface MyProgram {
  slug: string; name: string; short_name: string; cohort_label: string; hero_url: string | null;
  is_demo: boolean; starts_at: string | null; access: Access; is_staff: boolean;
}

export interface Desk {
  my_mentor_id: string | null;
  /** Present once 20261007100300_luca_desk_v2.sql is applied. */
  is_admin?: boolean;
  assignments?: Pick<Assignment, "id" | "week_n" | "title" | "due_at" | "parts" | "is_group" | "review_session_id">[];
  members: (Member & { streak: number; streak_day: string | null; ghost: boolean; email: string | null; phone: string | null; joined_at: string })[];
  clans: { id: string; name: string }[];
  submissions: (Submission & { member_id: string })[];
  sprint_posts: (SprintPost & { member_id: string })[];
  attendance: { session_id: string; member_id: string; at: string }[];
  prewatch: { member_id: string; week_n: number; quiz_score: number; summary_url: string | null; completed_at: string }[];
  hotseat: HotseatEntry[];
}
