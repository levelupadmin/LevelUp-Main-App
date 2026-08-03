/**
 * useCohortRooms.ts — the ONE data-access layer for cohort rooms (R1-T1).
 *
 * Every room surface in R1–R4 reads through this module. Nothing else in the
 * client may call `supabase.rpc("get_my_cohort_rooms" | "get_cohort_room" |
 * "get_room_roster" | "get_room_announcements")` directly: the four RPCs each
 * assert access FIRST and RAISE `42501` for a caller who does not hold it, so
 * "denied" and "empty" are genuinely different answers, and five hand-rolled
 * call sites would end up with five different opinions about which is which.
 *
 * The same rule now covers the two room TABLES a client writes —
 * `cohort_announcements` (the composer) and `cohort_room_seen` (the watermark).
 * Both are gated by RLS rather than by an RPC, and both are written from here
 * and nowhere else.
 *
 * THE ONE RULE THIS FILE ENFORCES
 * ------------------------------
 * `error.code === '42501'` is the ONLY signal of a denial, and every hook here
 * hands it back as a plain `denied` boolean so no consumer re-derives it. An
 * empty array, an empty session list or a zero roster count is a legitimate
 * EMPTY — a pre_start member whose batch is not assigned yet gets `sessions: []`
 * from a fully successful call (rpcs.sql:585-589). Code that reads empty as
 * denied strands exactly the students the room is for.
 *
 * SHAPES ARE THE WIRE SHAPES
 * --------------------------
 * Rows come back in the RPC's own snake_case, unrenamed. The room components
 * are written against the migration's `RETURNS TABLE` column list, and a
 * camelCase layer in between would be one more place for a column to be
 * silently dropped. What this module DOES add is coercion: counts that are
 * really numbers, phases narrowed to the four the CHECK allows, and jsonb left
 * `unknown` so it has to pass through `resolveTheme` / `moduleEnabled` before
 * anything renders it.
 *
 * WHAT IS NOT IN HERE
 * -------------------
 * No feature-flag read. `VITE_COHORT_ROOMS` gates the SURFACE (which routes
 * exist), never the DATA (NFR-CONFIG-2) — R0's RLS does that, and a hook that
 * consulted the flag would be pretending otherwise.
 *
 * PERSISTENCE
 * -----------
 * Every key here is rooted at `cohort-rooms`, which is deliberately NOT in
 * `PERSISTED_QUERY_ROOTS` (src/lib/queryClient.ts) — no room payload is ever
 * written to localStorage. Room payloads carry cohort-mate identities and
 * announcement bodies; they stay in memory.
 */

import { useEffect, useMemo, useRef } from "react";
import { useOutletContext } from "react-router-dom";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type UseInfiniteQueryResult,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RoomConfigInput, RoomTheme } from "@/lib/room";

/* ────────────────────────────────────────────────────────────────────────────
 * The untyped corner
 *
 * `cohort_announcements`, `cohort_room_seen` and `get_room_announcements`
 * (20260801120000_announcement_notify_trigger.sql) are newer than
 * `src/integrations/supabase/types.ts`, which is generated. Rather than reach
 * for `any` — this file lints clean and stays that way — the three shapes this
 * module actually uses are declared once, here, and nowhere else. The pattern
 * is `useNotifyRequests.ts`'s, narrowed: the shim exposes only `insert`,
 * `upsert` and `rpc`, so a typo in a table name is still a runtime error but a
 * misuse of the builder is a compile error.
 * ──────────────────────────────────────────────────────────────────────────── */

/** What PostgREST hands back. `code` is the only denial signal (see below). */
interface UntypedResult<T> {
  data: T | null;
  error: { code?: string; message?: string } | null;
}

interface UntypedTable {
  insert: (values: Record<string, unknown>) => PromiseLike<UntypedResult<unknown>>;
  upsert: (
    values: Record<string, unknown>,
    options?: { onConflict?: string },
  ) => PromiseLike<UntypedResult<unknown>>;
  /**
   * Retraction and pinning only (`ann_host_retract`). The row is addressed by
   * `id` alone and the POLICY is what decides whether the caller may touch it,
   * exactly as the composer's insert leans on `ann_host_insert`.
   */
  update: (values: Record<string, unknown>) => {
    eq: (column: string, value: string) => PromiseLike<UntypedResult<unknown>>;
  };
}

const roomDb = supabase as unknown as {
  from: (table: string) => UntypedTable;
  rpc: <T>(
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<UntypedResult<T>>;
};

/* ────────────────────────────────────────────────────────────────────────────
 * Denial
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The SQLSTATE every room RPC raises for a caller without access
 * (`insufficient_privilege`). PostgREST surfaces it verbatim as
 * `PostgrestError.code`, so this is a contract, not a guess.
 */
export const ROOM_DENIED_PGCODE = "42501";

/**
 * True only for a genuine server-side denial. Never infer denial from an empty
 * payload — see the file header.
 */
export function isRoomAccessDenied(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === ROOM_DENIED_PGCODE;
}

/** Denials are terminal: retrying a 42501 just spends the user's battery. */
const retryUnlessDenied = (failureCount: number, error: Error) =>
  !isRoomAccessDenied(error) && failureCount < 2;

/**
 * A room query, plus the one derived fact every room surface needs.
 *
 * `denied` is true only for a `42501`. It is deliberately NOT `isError`: a
 * network flake is an error the user can retry, a denial is an answer.
 */
export type RoomQueryResult<T> = UseQueryResult<T, Error> & { denied: boolean };

function withDenied<T>(query: UseQueryResult<T, Error>): RoomQueryResult<T> {
  // Assign rather than spread: react-query tracks which result properties a
  // component actually read, and spreading would touch every one of them.
  return Object.assign(query, { denied: query.isError && isRoomAccessDenied(query.error) });
}

/* ────────────────────────────────────────────────────────────────────────────
 * Shapes — the RPC row lists, verbatim
 * ──────────────────────────────────────────────────────────────────────────── */

/** `cohort_room_configs.phase` — the CHECK constraint, verbatim (backbone.sql:453). */
export const ROOM_PHASES = ["pre_start", "live", "wrap", "alumni"] as const;
export type RoomPhase = (typeof ROOM_PHASES)[number];

/**
 * Coerce an untrusted phase string.
 *
 * A room with NO `cohort_room_configs` row comes back with a NULL phase (the
 * LEFT JOIN LATERAL in rpcs.sql:361-369), and an unconfigured room is by
 * definition one nobody has opened yet — so it reads as `pre_start`, the phase
 * that shows induction rather than curriculum. Phase is a PRESENTATION choice
 * and never an access one, so a wrong guess here cannot leak anything.
 */
export function asRoomPhase(value: unknown): RoomPhase {
  return (ROOM_PHASES as readonly string[]).includes(value as string)
    ? (value as RoomPhase)
    : "pre_start";
}

/** `get_cohort_room().access` — the tier the envelope was built for. */
export type RoomAccess = "member" | "pre_member";

/**
 * One row of `get_my_cohort_rooms()`.
 *
 * `theme` and `modules` stay `unknown`: they are jsonb an admin typed into a
 * form. The row is structurally a `RoomConfigInput`, so it can be handed
 * straight to `resolveTheme(room)` / `moduleEnabled(room, key)` from
 * `@/lib/room` without building an intermediate.
 */
export interface CohortRoomSummary extends RoomConfigInput {
  offering_id: string;
  offering_title: string;
  /**
   * `/room/:slug`. NULL when the offering has a membership but no config row —
   * such a room has no address, so link it as `/cohort/:offering_id` instead of
   * inventing one.
   */
  room_slug: string | null;
  batch_id: string | null;
  batch_name: string | null;
  /** `cohort_room_members.role` — member | alumni | mentor | host | pre_member. */
  role: string | null;
  phase: RoomPhase;
  /** jsonb — feed to `resolveTheme`. Untrusted. */
  theme: unknown;
  /** jsonb — feed to `moduleEnabled`. Untrusted. */
  modules: unknown;
  total_weeks: number;
  current_week: number | null;
  next_session_at: string | null;
  /** Always null for a `pre_member` — the RPC redacts it (rpcs.sql:320-327). */
  next_due_at: string | null;
  unseen_announcements: number;
}

/** A `cohort_room_configs` row as `to_jsonb(c)` hands it over. */
export interface RoomConfigRow extends RoomConfigInput {
  id?: string;
  offering_id?: string;
  batch_id?: string | null;
  slug?: string;
  phase?: string;
  alumni_since?: string | null;
  theme?: unknown;
  vocab?: unknown;
  modules?: unknown;
  [key: string]: unknown;
}

/** A `cohort_announcements` row, minus the soft-deleted ones the RPC filters. */
export interface RoomAnnouncement {
  id: string;
  offering_id: string;
  batch_id: string | null;
  author_id: string | null;
  title: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  [key: string]: unknown;
}

/**
 * One row of `get_room_announcements()` — the noticeboard's own read.
 *
 * TWO THINGS THE ENVELOPE CANNOT GIVE THE BOARD, which is why this row exists
 * alongside `RoomAnnouncement` rather than replacing it:
 *
 *  1. **An author.** `cohort_announcements` stores `author_id` and nothing
 *     else about the author, and `get_cohort_room`'s projection is a bare
 *     `to_jsonb(a)`. Resolving the name through `get_room_roster` does not work
 *     in the lobby — that RPC raises 42501 for a `pre_member`, the one tier
 *     whose whole whitelist IS the noticeboard. The RPC joins it server-side.
 *  2. **More than ten.** The envelope's list is `ORDER BY a.is_pinned DESC,
 *     a.created_at DESC LIMIT 10`, so a board rendered off it truncates
 *     silently at ten. This read pages.
 *
 * `author_role` is the author's standing IN THIS ROOM (`host` | `mentor`, or
 * NULL for an admin with no membership row), never their platform role.
 */
export interface RoomAnnouncementDetail {
  id: string;
  offering_id: string;
  batch_id: string | null;
  title: string | null;
  body: string;
  is_pinned: boolean;
  created_at: string;
  author_id: string | null;
  author_name: string | null;
  author_role: string | null;
}

/**
 * A session inside the envelope. The member branch carries `week_id`,
 * `recording_url`, `my_position` and a `zoom_link` that is NULL outside the
 * server-side T-60 window; the lobby branch carries titles and dates only
 * (rpcs.sql:512-527). Structurally a `RoomSessionInput`, so it feeds
 * `sessionTimeState` directly.
 */
export interface RoomSession {
  id: string;
  title: string | null;
  scheduled_at: string | null;
  duration_minutes: number | null;
  status: string | null;
  session_type: string | null;
  week_id?: string | null;
  /** Present only inside the join window. Never gate on this client-side. */
  zoom_link?: string | null;
  recording_url?: string | null;
  my_position?: number | null;
}

/**
 * The `get_cohort_room()` envelope.
 *
 * `access` carries the THIRD tier no other task accounts for: a `pre_member` is
 * a LOBBY visitor, neither a full member nor a denied one. The server already
 * stripped everything outside the whitelist (rpcs.sql:506-527), so a lobby
 * envelope is a real, successful room — smaller. Render the chrome on it and
 * omit the modules the redaction emptied; never show an error.
 */
export interface CohortRoomEnvelope {
  offering_id: string;
  batch_id: string | null;
  role: string | null;
  access: RoomAccess;
  config: RoomConfigRow | null;
  roster_count: number;
  announcements: RoomAnnouncement[];
  sessions: RoomSession[];
  /** Member-only. Null in the lobby — the field is absent there, not zero. */
  attendance_pct: number | null;
}

/** One row of `get_room_roster()`. The six permitted columns, and no others. */
export interface RoomRosterEntry {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  occupation: string | null;
  city: string | null;
  role: string;
}

export type RoomPostKind = "post" | "question" | "win";

export interface RoomFeedReply {
  id: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  body: string;
  is_mentor_answer: boolean;
  created_at: string;
}

export interface RoomFeedPost {
  id: string;
  offering_id: string;
  batch_id: string;
  batch_name: string;
  author_id: string;
  author_name: string;
  author_avatar_url: string | null;
  author_role: string | null;
  kind: RoomPostKind;
  body: string;
  media: unknown[];
  channel_key: string;
  cohort_week_id: string | null;
  week_number: number | null;
  reply_count: number;
  last_activity_at: string;
  created_at: string;
  replies: RoomFeedReply[];
  replies_truncated: boolean;
}

export interface RoomFeedWeek {
  id: string;
  week_number: number;
  theme: string | null;
  status: string | null;
}

export interface RoomFeedBatch {
  id: string;
  name: string;
  channels: string[];
  channel_labels: Record<string, string>;
  weeks: RoomFeedWeek[];
}

export interface RoomFeedCursor {
  activity: string;
  id: string;
}

export interface RoomFeedPage {
  posts: RoomFeedPost[];
  batches: RoomFeedBatch[];
  selected_batch_id: string | null;
  has_more: boolean;
  next_cursor: RoomFeedCursor | null;
}

export interface RoomResource {
  id: string;
  offering_id: string;
  batch_id: string | null;
  batch_name: string | null;
  cohort_week_id: string | null;
  week_number: number | null;
  week_theme: string | null;
  title: string;
  kind: "link" | "file" | "video";
  url: string;
  sort_order: number;
  created_at: string;
  added_by: string | null;
  added_by_name: string;
}

export interface RoomResourcesPayload {
  resources: RoomResource[];
  batches: Array<{ id: string; name: string }>;
  selected_batch_id: string | null;
  truncated: boolean;
}

/** The two `offerings` columns the room needs that no room RPC returns. */
export interface RoomOfferingMeta {
  /** `offerings.cohort_start_date` — the "doors open" date. */
  cohort_start_date: string | null;
  /** `offerings.whatsapp_group_link` — R-D5 coexistence. */
  whatsapp_group_link: string | null;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Weeks — `get_cohort_progress`, the ONLY source of week metadata
 * ──────────────────────────────────────────────────────────────────────────── */

/** `cohort_weeks.status` — the CHECK constraint, verbatim. */
export const ROOM_WEEK_STATUSES = ["upcoming", "active", "completed", "archived"] as const;
export type RoomWeekStatus = (typeof ROOM_WEEK_STATUSES)[number];

/**
 * Coerce an untrusted week status. An unrecognised value reads as `upcoming`,
 * the state that promises nothing: a week the client cannot classify must not
 * be drawn as finished (which would inflate the progress ring) or as active
 * (which would move "This week" onto it).
 */
export function asRoomWeekStatus(value: unknown): RoomWeekStatus {
  return (ROOM_WEEK_STATUSES as readonly string[]).includes(value as string)
    ? (value as RoomWeekStatus)
    : "upcoming";
}

/**
 * One row of `get_cohort_progress(p_user_id, p_offering_id)` — the week
 * metadata (theme, assignment, `feedback_session_at`, status) and the caller's
 * own submission and attendance for it.
 *
 * ⚠️ `live_session_*` IS ONE SESSION, BY DESIGN. The RPC's LEFT JOIN LATERAL
 * … LIMIT 1 elects exactly one session per week — the one that has not ended
 * yet — precisely so a three-session week stops emitting three week rows
 * (20260729100200_cohort_room_rpcs.sql:990-1003, join at :1107). A week's FULL
 * session list lives in the envelope's `sessions` array, which has no LIMIT and
 * carries `week_id` on every row: group `CohortRoomEnvelope.sessions` by
 * `week_id` to render them all, and read the week row for week METADATA only.
 *
 * ⚠️ `rows.length` IS NOT A WEEK COUNT. It was week×session pairs before the
 * collapse and it is one-row-per-week-with-a-session after it; a week the
 * lateral matched nothing for still emits its row, but nothing here promises a
 * 1:1 with `cohort_weeks`. The week COUNT is `CohortRoomSummary.total_weeks`,
 * which counts DISTINCT `week_number` server-side (rpcs.sql:311). The old
 * dashboard divided by `rows.length` for its percentage (CohortDashboard.tsx:144
 * and :157); a room surface must not repeat that.
 */
export interface RoomWeekRow {
  cohort_batch_id: string | null;
  batch_label: string | null;
  week_id: string;
  week_number: number;
  theme: string | null;
  description: string | null;
  starts_on: string | null;
  ends_on: string | null;
  assignment_prompt: string | null;
  assignment_due_at: string | null;
  /** `cohort_weeks.feedback_session_at` — real since 20260526180000:27. */
  feedback_session_at: string | null;
  week_status: RoomWeekStatus;
  live_session_id: string | null;
  live_session_title: string | null;
  live_session_at: string | null;
  live_session_zoom_link: string | null;
  submission_id: string | null;
  submission_status: string | null;
  submission_rating: number | null;
  submission_feedback: string | null;
  submission_submitted_at: string | null;
  attended: boolean;
  attendance_marked: boolean;
}

/** True when the envelope is a lobby (`pre_member`) one. */
export const isLobbyEnvelope = (envelope: CohortRoomEnvelope | null | undefined) =>
  envelope?.access === "pre_member";

/** The room's phase from its config row, narrowed and defaulted. */
export const envelopePhase = (envelope: CohortRoomEnvelope | null | undefined): RoomPhase =>
  asRoomPhase(envelope?.config?.phase);

/* ────────────────────────────────────────────────────────────────────────────
 * Query keys
 * ──────────────────────────────────────────────────────────────────────────── */

/** Root of every room key. Deliberately absent from `PERSISTED_QUERY_ROOTS`. */
export const COHORT_ROOMS_QUERY_ROOT = "cohort-rooms";

export const cohortRoomsKey = (userId: string | null | undefined) =>
  [COHORT_ROOMS_QUERY_ROOT, "mine", userId ?? "anon"] as const;

export const cohortRoomKey = (offeringId: string | null | undefined) =>
  [COHORT_ROOMS_QUERY_ROOT, "room", offeringId ?? "none"] as const;

export const roomRosterKey = (offeringId: string | null | undefined) =>
  [COHORT_ROOMS_QUERY_ROOT, "roster", offeringId ?? "none"] as const;

export const roomOfferingMetaKey = (offeringId: string | null | undefined) =>
  [COHORT_ROOMS_QUERY_ROOT, "offering", offeringId ?? "none"] as const;

/**
 * The noticeboard. Per-offering and NOT per-user: `get_room_announcements`
 * scopes its rows by the caller's own batch server-side, and the whole root is
 * dropped on sign-out (it is absent from `PERSISTED_QUERY_ROOTS`, so nothing
 * survives to a second account anyway).
 */
export const roomAnnouncementsKey = (
  offeringId: string | null | undefined,
  limit: number,
) => [COHORT_ROOMS_QUERY_ROOT, "announcements", offeringId ?? "none", limit] as const;

export const roomFeedKey = (
  offeringId: string | null | undefined,
  channel: string,
  batchId: string | null | undefined,
  limit: number,
) => [
  COHORT_ROOMS_QUERY_ROOT,
  "feed",
  offeringId ?? "none",
  channel,
  batchId ?? "all-batches",
  limit,
] as const;

export const roomResourcesKey = (
  offeringId: string | null | undefined,
  batchId: string | null | undefined,
) => [COHORT_ROOMS_QUERY_ROOT, "resources", offeringId ?? "none", batchId ?? "all-batches"] as const;

/**
 * The week list is per-USER as well as per-offering (it carries that user's own
 * submissions), so the caller's id is part of the key — two accounts on one
 * device must never read each other's rows out of the cache.
 */
export const roomWeeksKey = (
  offeringId: string | null | undefined,
  userId: string | null | undefined,
) => [COHORT_ROOMS_QUERY_ROOT, "weeks", offeringId ?? "none", userId ?? "anon"] as const;

/* ────────────────────────────────────────────────────────────────────────────
 * Coercion — untrusted jsonb in, render-safe values out
 * ──────────────────────────────────────────────────────────────────────────── */

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asNullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A JSON boolean, or false. `attended` is a COALESCEd column; this is belt. */
function asBool(value: unknown): boolean {
  return value === true;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Fetchers
 * ──────────────────────────────────────────────────────────────────────────── */

async function fetchMyCohortRooms(): Promise<CohortRoomSummary[]> {
  const { data, error } = await supabase.rpc("get_my_cohort_rooms");
  // Throw the PostgrestError itself so `error.code` survives to the consumer;
  // wrapping it in a new Error would erase the only denial signal there is.
  if (error) throw error;

  return (data ?? []).map((row) => ({
    offering_id: row.offering_id,
    offering_title: row.offering_title ?? "",
    room_slug: asString(row.room_slug),
    batch_id: row.batch_id ?? null,
    batch_name: asString(row.batch_name),
    role: asString(row.role),
    phase: asRoomPhase(row.phase),
    theme: row.theme ?? null,
    modules: row.modules ?? null,
    total_weeks: asCount(row.total_weeks),
    current_week: asNullableNumber(row.current_week),
    next_session_at: asString(row.next_session_at),
    next_due_at: asString(row.next_due_at),
    unseen_announcements: asCount(row.unseen_announcements),
  }));
}

async function fetchCohortRoom(offeringId: string): Promise<CohortRoomEnvelope> {
  const { data, error } = await supabase.rpc("get_cohort_room", {
    p_offering: offeringId,
  });
  if (error) throw error;

  const payload = asRecord(data);
  return {
    offering_id: asString(payload.offering_id) ?? offeringId,
    batch_id: asString(payload.batch_id),
    role: asString(payload.role),
    // Anything that is not the literal 'pre_member' is a full member envelope.
    // Erring the other way would redact a real member's own room.
    access: payload.access === "pre_member" ? "pre_member" : "member",
    config: payload.config ? (asRecord(payload.config) as RoomConfigRow) : null,
    roster_count: asCount(payload.roster_count),
    announcements: Array.isArray(payload.announcements)
      ? (payload.announcements as RoomAnnouncement[])
      : [],
    sessions: Array.isArray(payload.sessions) ? (payload.sessions as RoomSession[]) : [],
    attendance_pct: asNullableNumber(payload.attendance_pct),
  };
}

async function fetchRoomRoster(offeringId: string): Promise<RoomRosterEntry[]> {
  const { data, error } = await supabase.rpc("get_room_roster", {
    p_offering: offeringId,
  });
  if (error) throw error;
  return (data ?? []) as RoomRosterEntry[];
}

async function fetchRoomAnnouncements(
  offeringId: string,
  limit: number,
  offset: number,
): Promise<RoomAnnouncementDetail[]> {
  const { data, error } = await roomDb.rpc<Record<string, unknown>[]>("get_room_announcements", {
    p_offering: offeringId,
    p_limit: limit,
    p_offset: offset,
  });
  // Same posture as the three typed RPCs: throw the PostgrestError itself so
  // `error.code` survives to `isRoomAccessDenied`.
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: asString(row.id) ?? "",
    offering_id: asString(row.offering_id) ?? offeringId,
    batch_id: asString(row.batch_id),
    title: asString(row.title),
    body: typeof row.body === "string" ? row.body : "",
    is_pinned: asBool(row.is_pinned),
    created_at: asString(row.created_at) ?? "",
    author_id: asString(row.author_id),
    author_name: asString(row.author_name),
    author_role: asString(row.author_role),
  }));
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asPostKind(value: unknown): RoomPostKind {
  return value === "question" || value === "win" ? value : "post";
}

function asResourceKind(value: unknown): RoomResource["kind"] {
  return value === "file" || value === "video" ? value : "link";
}

function asRoomFeedReply(value: unknown): RoomFeedReply {
  const row = asRecord(value);
  return {
    id: asString(row.id) ?? "",
    author_id: asString(row.author_id) ?? "",
    author_name: asString(row.author_name) ?? "Member",
    author_avatar_url: asString(row.author_avatar_url),
    body: typeof row.body === "string" ? row.body : "",
    is_mentor_answer: asBool(row.is_mentor_answer),
    created_at: asString(row.created_at) ?? "",
  };
}

function asRoomFeedPost(value: unknown): RoomFeedPost {
  const row = asRecord(value);
  return {
    id: asString(row.id) ?? "",
    offering_id: asString(row.offering_id) ?? "",
    batch_id: asString(row.batch_id) ?? "",
    batch_name: asString(row.batch_name) ?? "Cohort",
    author_id: asString(row.author_id) ?? "",
    author_name: asString(row.author_name) ?? "Member",
    author_avatar_url: asString(row.author_avatar_url),
    author_role: asString(row.author_role),
    kind: asPostKind(row.kind),
    body: typeof row.body === "string" ? row.body : "",
    media: asArray(row.media),
    channel_key: asString(row.channel_key) ?? "general",
    cohort_week_id: asString(row.cohort_week_id),
    week_number: asNullableNumber(row.week_number),
    reply_count: asCount(row.reply_count),
    last_activity_at: asString(row.last_activity_at) ?? "",
    created_at: asString(row.created_at) ?? "",
    replies: asArray(row.replies).map(asRoomFeedReply).filter((reply) => reply.id),
    replies_truncated: asBool(row.replies_truncated),
  };
}

function asRoomFeedBatch(value: unknown): RoomFeedBatch {
  const row = asRecord(value);
  const rawLabels = asRecord(row.channel_labels);
  return {
    id: asString(row.id) ?? "",
    name: asString(row.name) ?? "Cohort",
    channels: asArray(row.channels).filter((item): item is string => typeof item === "string"),
    channel_labels: Object.fromEntries(
      Object.entries(rawLabels).filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" && entry[1].trim().length > 0,
      ),
    ),
    weeks: asArray(row.weeks).map((item) => {
      const week = asRecord(item);
      return {
        id: asString(week.id) ?? "",
        week_number: asCount(week.week_number),
        theme: asString(week.theme),
        status: asString(week.status),
      };
    }).filter((week) => week.id),
  };
}

async function fetchRoomFeed(
  offeringId: string,
  channel: string,
  batchId: string | null,
  cursor: RoomFeedCursor | null,
  limit: number,
): Promise<RoomFeedPage> {
  const { data, error } = await roomDb.rpc<Record<string, unknown>>("get_room_feed", {
    p_offering: offeringId,
    p_channel: channel,
    p_batch: batchId,
    p_before_activity: cursor?.activity ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
  });
  if (error) throw error;

  const payload = asRecord(data);
  const next = asRecord(payload.next_cursor);
  const nextActivity = asString(next.activity);
  const nextId = asString(next.id);

  return {
    posts: asArray(payload.posts).map(asRoomFeedPost).filter((post) => post.id),
    batches: asArray(payload.batches).map(asRoomFeedBatch).filter((batch) => batch.id),
    selected_batch_id: asString(payload.selected_batch_id),
    has_more: asBool(payload.has_more),
    next_cursor: nextActivity && nextId ? { activity: nextActivity, id: nextId } : null,
  };
}

async function fetchRoomResources(
  offeringId: string,
  batchId: string | null,
): Promise<RoomResourcesPayload> {
  const { data, error } = await roomDb.rpc<Record<string, unknown>>("get_room_resources", {
    p_offering: offeringId,
    p_batch: batchId,
  });
  if (error) throw error;

  const payload = asRecord(data);
  return {
    resources: asArray(payload.resources).map((value) => {
      const row = asRecord(value);
      return {
        id: asString(row.id) ?? "",
        offering_id: asString(row.offering_id) ?? offeringId,
        batch_id: asString(row.batch_id),
        batch_name: asString(row.batch_name),
        cohort_week_id: asString(row.cohort_week_id),
        week_number: asNullableNumber(row.week_number),
        week_theme: asString(row.week_theme),
        title: asString(row.title) ?? "Resource",
        kind: asResourceKind(row.kind),
        url: asString(row.url) ?? "",
        sort_order: asCount(row.sort_order),
        created_at: asString(row.created_at) ?? "",
        added_by: asString(row.added_by),
        added_by_name: asString(row.added_by_name) ?? "The team",
      };
    }).filter((resource) => resource.id),
    batches: asArray(payload.batches).map((value) => {
      const row = asRecord(value);
      return { id: asString(row.id) ?? "", name: asString(row.name) ?? "Cohort" };
    }).filter((batch) => batch.id),
    selected_batch_id: asString(payload.selected_batch_id),
    truncated: asBool(payload.truncated),
  };
}

async function fetchRoomOfferingMeta(offeringId: string): Promise<RoomOfferingMeta> {
  const { data, error } = await supabase
    .from("offerings")
    .select("cohort_start_date, whatsapp_group_link")
    .eq("id", offeringId)
    .maybeSingle();
  if (error) throw error;
  return {
    cohort_start_date: asString(data?.cohort_start_date),
    whatsapp_group_link: asString(data?.whatsapp_group_link),
  };
}

async function fetchRoomWeeks(userId: string, offeringId: string): Promise<RoomWeekRow[]> {
  const { data, error } = await supabase.rpc("get_cohort_progress", {
    p_user_id: userId,
    p_offering_id: offeringId,
  });
  // Same posture as the room RPCs: throw the PostgrestError itself. This one
  // raises 42501 too — it asserts own-user-or-admin (rpcs.sql:1075-1078).
  if (error) throw error;

  return (data ?? []).map((row) => ({
    cohort_batch_id: asString(row.cohort_batch_id),
    batch_label: asString(row.batch_label),
    week_id: row.week_id,
    week_number: asCount(row.week_number),
    theme: asString(row.theme),
    description: asString(row.description),
    starts_on: asString(row.starts_on),
    ends_on: asString(row.ends_on),
    assignment_prompt: asString(row.assignment_prompt),
    assignment_due_at: asString(row.assignment_due_at),
    feedback_session_at: asString(row.feedback_session_at),
    week_status: asRoomWeekStatus(row.week_status),
    live_session_id: asString(row.live_session_id),
    live_session_title: asString(row.live_session_title),
    live_session_at: asString(row.live_session_at),
    live_session_zoom_link: asString(row.live_session_zoom_link),
    submission_id: asString(row.submission_id),
    submission_status: asString(row.submission_status),
    submission_rating: asNullableNumber(row.submission_rating),
    submission_feedback: asString(row.submission_feedback),
    submission_submitted_at: asString(row.submission_submitted_at),
    attended: asBool(row.attended),
    attendance_marked: asBool(row.attendance_marked),
  }));
}

/* ────────────────────────────────────────────────────────────────────────────
 * Hooks
 * ──────────────────────────────────────────────────────────────────────────── */

/** Memberships move on enrolment, not on scroll — the app default is right. */
const MEMBERSHIPS_STALE_MS = 5 * 60_000;
/**
 * The envelope carries the schedule and the noticeboard, and a room open is the
 * moment a student checks whether anything changed. One minute keeps a
 * doors-open transition (`pre_start` → `live`) honest without polling.
 */
const ENVELOPE_STALE_MS = 60_000;

/**
 * Every room the signed-in user belongs to, live rooms before alumni ones
 * (the RPC's own ORDER BY). An authenticated user with no rooms returns `[]`;
 * an anonymous one never fires the query at all.
 */
export function useMyCohortRooms(): RoomQueryResult<CohortRoomSummary[]> {
  const { user } = useAuth();
  return withDenied(
    useQuery({
      queryKey: cohortRoomsKey(user?.id),
      queryFn: fetchMyCohortRooms,
      enabled: !!user?.id,
      staleTime: MEMBERSHIPS_STALE_MS,
      retry: retryUnlessDenied,
    }),
  );
}

/**
 * The room-open envelope for one offering. Pass `null` to keep it idle.
 *
 * A `pre_member` gets a successful, REDACTED envelope — check `access`, not
 * `denied`, to decide what to render.
 */
export function useCohortRoom(
  offeringId: string | null | undefined,
): RoomQueryResult<CohortRoomEnvelope> {
  return withDenied(
    useQuery({
      queryKey: cohortRoomKey(offeringId),
      queryFn: () => fetchCohortRoom(offeringId as string),
      enabled: !!offeringId,
      staleTime: ENVELOPE_STALE_MS,
      retry: retryUnlessDenied,
    }),
  );
}

/**
 * The roster. `pre_member` is DENIED here by design (the lobby gets a COUNT via
 * the envelope's `roster_count`, not identities), so pass `enabled: false` when
 * the envelope is a lobby one — that is a NETWORK decision, not a security one.
 * Callers that ask anyway get `denied: true` and no rows, never a crash.
 */
export function useRoomRoster(
  offeringId: string | null | undefined,
  options?: { enabled?: boolean },
): RoomQueryResult<RoomRosterEntry[]> {
  return withDenied(
    useQuery({
      queryKey: roomRosterKey(offeringId),
      queryFn: () => fetchRoomRoster(offeringId as string),
      enabled: !!offeringId && options?.enabled !== false,
      staleTime: MEMBERSHIPS_STALE_MS,
      retry: retryUnlessDenied,
    }),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * The noticeboard — read, write, and the seen watermark (R3-T1)
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * How many notices ONE PAGE of the board asks for. The server clamps `p_limit`
 * to 100, so this is a request, not a promise, and it is deliberately larger
 * than the envelope's hard `LIMIT 10` — the truncation this read exists to lift.
 */
export const ROOM_ANNOUNCEMENTS_PAGE_SIZE = 40;

/**
 * The board's result: an infinite query, plus the two derived facts every
 * consumer needs — `denied` and the flattened list.
 */
export type RoomBoardResult = UseInfiniteQueryResult<
  // `TPageParam` is left at its default: the pages are what consumers read, and
  // pinning it to `number` here only makes this alias disagree with what
  // `useInfiniteQuery` infers from the options object below.
  InfiniteData<RoomAnnouncementDetail[]>,
  Error
> & {
  denied: boolean;
  /** Every page so far, concatenated in server order. */
  notices: RoomAnnouncementDetail[];
};

/**
 * The noticeboard, pinned first, with an author on every row.
 *
 * ⚠️ IT PAGES, AND THAT IS THE POINT OF IT. A single fixed-limit fetch would
 * only move the envelope's silent `LIMIT 10` out to a silent limit of forty:
 * the RPC's `p_offset` would be dead, a twelve-week cohort past its fortieth
 * notice would lose the oldest ones with no indication, and the truncation this
 * read was written to remove would be back one order of magnitude further out.
 * `getNextPageParam` returns `undefined` on a SHORT page — that is how the board
 * knows it has reached the end and stops offering "Show older notices" — and the
 * offset it hands the server is the number of rows already held, so a page is
 * never asked for twice.
 *
 * A `pre_member` is NOT denied here — announcements are the lobby whitelist —
 * but they receive the offering-level rows only, which is what R0's
 * `ann_member_read` grants them at the table. The scope is the server's; this
 * hook never narrows it.
 */
export function useRoomAnnouncements(
  offeringId: string | null | undefined,
  options?: { enabled?: boolean; pageSize?: number },
): RoomBoardResult {
  const pageSize = options?.pageSize ?? ROOM_ANNOUNCEMENTS_PAGE_SIZE;

  const query = useInfiniteQuery({
    queryKey: roomAnnouncementsKey(offeringId, pageSize),
    queryFn: ({ pageParam }: { pageParam: number }) =>
      fetchRoomAnnouncements(offeringId as string, pageSize, pageParam),
    initialPageParam: 0,
    getNextPageParam: (
      lastPage: RoomAnnouncementDetail[],
      allPages: RoomAnnouncementDetail[][],
    ): number | undefined =>
      lastPage.length < pageSize
        ? undefined
        : allPages.reduce((held, page) => held + page.length, 0),
    enabled: !!offeringId && options?.enabled !== false,
    staleTime: ENVELOPE_STALE_MS,
    retry: retryUnlessDenied,
  });

  const notices = useMemo(
    () => (query.data?.pages ?? []).flat(),
    [query.data],
  );

  // Assign rather than spread, for the reason `withDenied` gives.
  return Object.assign(query, {
    denied: query.isError && isRoomAccessDenied(query.error),
    notices,
  });
}

/* ────────────────────────────────────────────────────────────────────────────
 * The room feed + resource binder (R3 round 2)
 * ──────────────────────────────────────────────────────────────────────────── */

export const ROOM_FEED_PAGE_SIZE = 12;

export type RoomFeedResult = UseInfiniteQueryResult<
  InfiniteData<RoomFeedPage>,
  Error
> & {
  denied: boolean;
  posts: RoomFeedPost[];
  batches: RoomFeedBatch[];
};

export function useRoomFeed(
  offeringId: string | null | undefined,
  options?: {
    channel?: string;
    batchId?: string | null;
    enabled?: boolean;
    pageSize?: number;
  },
): RoomFeedResult {
  const channel = options?.channel ?? "all";
  const batchId = options?.batchId ?? null;
  const pageSize = options?.pageSize ?? ROOM_FEED_PAGE_SIZE;

  const query = useInfiniteQuery({
    queryKey: roomFeedKey(offeringId, channel, batchId, pageSize),
    queryFn: ({ pageParam }: { pageParam: RoomFeedCursor | null }) =>
      fetchRoomFeed(offeringId as string, channel, batchId, pageParam, pageSize),
    initialPageParam: null as RoomFeedCursor | null,
    getNextPageParam: (lastPage: RoomFeedPage) => lastPage.next_cursor ?? undefined,
    enabled: !!offeringId && options?.enabled !== false,
    staleTime: ENVELOPE_STALE_MS,
    retry: retryUnlessDenied,
  });

  const pages = useMemo(() => query.data?.pages ?? [], [query.data]);
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return pages.flatMap((page) => page.posts).filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return true;
    });
  }, [pages]);

  return Object.assign(query, {
    denied: query.isError && isRoomAccessDenied(query.error),
    posts,
    batches: pages[0]?.batches ?? [],
  });
}

export interface RoomPostDraft {
  body: string;
  kind: RoomPostKind;
  channelKey: string;
  batchId: string | null;
  cohortWeekId: string | null;
}

export function usePostRoomPost(
  offeringId: string | null | undefined,
): UseMutationResult<string, Error, RoomPostDraft> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RoomPostDraft) => {
      const { data, error } = await roomDb.rpc<string>("cohort_room_post_write", {
        p_offering: offeringId,
        p_body: draft.body,
        p_kind: draft.kind,
        p_channel_key: draft.channelKey,
        p_cohort_week_id: draft.cohortWeekId,
        p_media: [],
        p_batch: draft.batchId,
      });
      if (error) throw error;
      return typeof data === "string" ? data : "";
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [COHORT_ROOMS_QUERY_ROOT, "feed", offeringId ?? "none"],
      });
    },
  });
}

export interface RoomReplyDraft {
  postId: string;
  body: string;
}

export function useReplyToRoomPost(
  offeringId: string | null | undefined,
): UseMutationResult<string, Error, RoomReplyDraft> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (draft: RoomReplyDraft) => {
      const { data, error } = await roomDb.rpc<string>("cohort_room_reply_write", {
        p_post: draft.postId,
        p_body: draft.body,
        p_is_mentor_answer: false,
      });
      if (error) throw error;
      return typeof data === "string" ? data : "";
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: [COHORT_ROOMS_QUERY_ROOT, "feed", offeringId ?? "none"],
      });
    },
  });
}

export function useRoomResources(
  offeringId: string | null | undefined,
  options?: { batchId?: string | null; enabled?: boolean },
): RoomQueryResult<RoomResourcesPayload> {
  const batchId = options?.batchId ?? null;
  return withDenied(useQuery({
    queryKey: roomResourcesKey(offeringId, batchId),
    queryFn: () => fetchRoomResources(offeringId as string, batchId),
    enabled: !!offeringId && options?.enabled !== false,
    staleTime: MEMBERSHIPS_STALE_MS,
    retry: retryUnlessDenied,
  }));
}

/**
 * May this caller post to the board?
 *
 * ⚠️ THIS IS NOT THE GATE. `ann_host_insert` (20260729100100) is: it requires
 * `author_id = auth.uid()` AND `cohort_room_can_post_announcement(offering_id)`,
 * so a member who calls the insert by hand is refused by the database whatever
 * this function says. All this decides is whether the COMPOSER is rendered,
 * because a form that always fails on submit is worse than no form.
 *
 * `role` is the caller's own `cohort_room_members.role` off the envelope, which
 * the server resolved. Admins hold every room by `is_admin()` and carry no room
 * role, so they are passed in separately.
 */
export function canPostAnnouncement(
  role: string | null | undefined,
  isAdmin = false,
): boolean {
  return isAdmin || role === "mentor" || role === "host";
}

/** What the composer submits. `body` is the only required field. */
export interface RoomAnnouncementDraft {
  title?: string | null;
  body: string;
  isPinned?: boolean;
}

/**
 * Post a notice to the board.
 *
 * Writes `cohort_announcements` DIRECTLY, with RLS as the gate: unlike
 * `cohort_room_posts`, whose client INSERT is revoked outright in favour of a
 * write RPC (SEC-WRITE-1), the announcements table has a real INSERT policy
 * whose WITH CHECK already pins authorship, the mentor/host predicate and the
 * batch-belongs-to-offering relationship. An RPC in front of that would restate
 * three checks the policy makes anyway.
 *
 * `batch_id` is the caller's OWN batch off the envelope, so an offering-wide
 * mentor (batch NULL) posts to the whole offering and a batch-scoped one posts
 * to their batch. Nothing here lets a client choose another batch: the policy
 * would reject it, and the composer never offers it.
 */
export function usePostRoomAnnouncement(
  offeringId: string | null | undefined,
  batchId: string | null | undefined,
  options?: { pageSize?: number },
): UseMutationResult<void, Error, RoomAnnouncementDraft> {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const pageSize = options?.pageSize ?? ROOM_ANNOUNCEMENTS_PAGE_SIZE;

  return useMutation<void, Error, RoomAnnouncementDraft>({
    mutationFn: async (draft) => {
      const body = draft.body.trim();
      if (!body) throw new Error("An announcement needs something to say.");
      if (!offeringId || !user?.id) throw new Error("This room is not open yet.");

      const title = draft.title?.trim();
      const { error } = await roomDb.from("cohort_announcements").insert({
        offering_id: offeringId,
        batch_id: batchId ?? null,
        author_id: user.id,
        title: title ? title : null,
        body,
        is_pinned: draft.isPinned === true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // The board, and the envelope's own ten-row copy of it.
      void queryClient.invalidateQueries({
        queryKey: roomAnnouncementsKey(offeringId, pageSize),
      });
      void queryClient.invalidateQueries({ queryKey: cohortRoomKey(offeringId) });
    },
  });
}

/**
 * What a mentor or host may do to a notice that is already on the board.
 *
 * Two verbs and no third: R0 pins `title`, `body`, `offering_id`, `batch_id` and
 * `created_at` for every non-admin UPDATE (`_room_announcement_pin_columns`,
 * 20260729100100), so the board stays append-only for its TEXT. Nobody rewrites
 * history; they withdraw a notice, or they stop it shouting from the top.
 */
export type RoomAnnouncementAmendment =
  | { id: string; action: "retract" }
  | { id: string; action: "pin"; isPinned: boolean };

/**
 * Retract a notice, or pin and unpin one.
 *
 * WHY THIS EXISTS. R0 built `ann_host_retract` and left `is_pinned` writable for
 * a stated reason: "a mentor/host who posted a wrong announcement must be able
 * to pull it without waiting on an admin", and a host who pins a
 * session-reschedule notice must be able to demote it afterwards. R3-T1 makes
 * the in-room composer the ONLY authoring path to a room's board —
 * `AdminAnnouncements.tsx` writes `admin_announcements` and never touches
 * `cohort_announcements` — so without these two verbs in the room, a wrong or
 * permanently-pinned notice on a live cohort's board could only be fixed with
 * raw SQL against production.
 *
 * ⚠️ THIS IS NOT THE GATE, for the same reason the composer is not. The row is
 * addressed by `id` and the policy decides: `ann_host_retract` requires
 * `cohort_room_can_post_announcement(offering_id)` on BOTH sides, and the BEFORE
 * trigger reverts every column these verbs do not own — including `deleted_at`
 * ONE WAY, so a retraction can only be undone by an admin. A member who reaches
 * this PATCH by hand changes nothing.
 *
 * Retraction is a soft delete (`deleted_at`), never a DELETE: there is no member
 * DELETE policy on the table at all, and the server trigger keys its inbox
 * cleanup off the same transition.
 */
export function useAmendRoomAnnouncement(
  offeringId: string | null | undefined,
  options?: { pageSize?: number },
): UseMutationResult<void, Error, RoomAnnouncementAmendment> {
  const queryClient = useQueryClient();
  const pageSize = options?.pageSize ?? ROOM_ANNOUNCEMENTS_PAGE_SIZE;

  return useMutation<void, Error, RoomAnnouncementAmendment>({
    mutationFn: async (amendment) => {
      const patch =
        amendment.action === "retract"
          ? { deleted_at: new Date().toISOString() }
          : { is_pinned: amendment.isPinned };

      const { error } = await roomDb
        .from("cohort_announcements")
        .update(patch)
        .eq("id", amendment.id);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: roomAnnouncementsKey(offeringId, pageSize),
      });
      void queryClient.invalidateQueries({ queryKey: cohortRoomKey(offeringId) });
    },
  });
}

/**
 * Write the `cohort_room_seen` watermark for a room, once per open.
 *
 * THIS IS THE ONLY WRITER OF THAT TABLE IN THE CLIENT. Before R3-T1 nothing
 * wrote it at all, which meant `get_my_cohort_rooms().unseen_announcements` —
 * computed against `max(seen_at)` COALESCEd to the epoch — counted every notice
 * a room had ever carried, forever. The dot on `/rooms` could go up and never
 * down.
 *
 * ⚠️ `enabled` IS A TRUTHFULNESS GATE, NOT A PERFORMANCE ONE, and it is the
 * reason this hook takes an option at all. The write is a single timestamp, and
 * the RPC counts every notice stamped after it — so writing `now()` claims the
 * caller has seen the WHOLE board, and a surface that showed them less than the
 * whole board must not make that claim. An earlier revision wrote it
 * unconditionally on `RoomHome` mount, which meant a lobby visitor who was shown
 * exactly ONE notice (PreStartCard's teaser) silently marked every other unseen
 * notice read, with no surface anywhere that listed them and no dot left to
 * bring them back. The call sites now pass:
 *   · `AnnouncementsModule` — `enabled: the board's query SUCCEEDED`, so the
 *     claim is made once the rows are actually in hand, on the member branch and
 *     in the lobby alike (both mount the full board);
 *   · `RoomHome` — `enabled: the cohort runs no announcements module at all`,
 *     where there is no board to be behind on and the dot must still be able to
 *     clear, because `get_my_cohort_rooms` counts announcements whatever the
 *     module config says.
 * A board that FAILED to load therefore writes nothing, and the dot survives to
 * the next open. That is the intended answer: an unseen dot is cheap, and a
 * notice nobody was shown being marked read is not recoverable.
 *
 * Fires once per (user, room) per mount, and the latch is only taken once the
 * gate opens, so a board that loads late still writes. A failed write clears the
 * latch so a remount retries; it is never surfaced to the user, because "we
 * could not remember that you read this" is not something to interrupt anyone
 * with.
 *
 * ⚠️ THE INVALIDATION IS NOT GUARDED BY AN UNMOUNT LATCH, and that is the whole
 * point of it. An earlier revision short-circuited on a `cancelled` flag set by
 * the effect's cleanup, which meant a student who opened the room and navigated
 * away before the round trip landed WROTE THE WATERMARK AND KEPT THE DOT: the
 * server had recorded the read and only the client's copy of the count was
 * stale, until the next mount. There is no state to set here and no component to
 * update — `invalidateQueries` talks to the query cache, which outlives this
 * component — so there is nothing an unmount makes unsafe. The latch reset on
 * the failure path is compared against `latch` so a write for a room the user
 * has already left cannot clear a newer room's latch.
 */
export function useRoomSeenWatermark(
  offeringId: string | null | undefined,
  options?: { enabled?: boolean },
): void {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const written = useRef<string | null>(null);
  const userId = user?.id ?? null;
  const enabled = options?.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    if (!offeringId || !userId) return;
    const latch = `${userId}:${offeringId}`;
    if (written.current === latch) return;
    written.current = latch;

    void (async () => {
      const { error } = await roomDb.from("cohort_room_seen").upsert(
        { user_id: userId, offering_id: offeringId, seen_at: new Date().toISOString() },
        { onConflict: "user_id,offering_id" },
      );
      if (error) {
        // Only if this is still the room in view: a stale failure must not
        // re-arm a latch that has since moved on to another room.
        if (written.current === latch) written.current = null;
        return;
      }
      // The unseen count rides `get_my_cohort_rooms`, so this is what clears the
      // dot on `/rooms` and in the switcher without a reload.
      void queryClient.invalidateQueries({ queryKey: cohortRoomsKey(userId) });
    })();
  }, [enabled, offeringId, userId, queryClient]);
}

/**
 * `offerings.cohort_start_date` + `offerings.whatsapp_group_link` — the two
 * fields the pre-start induction needs that no room RPC returns. A plain table
 * read (offerings is world-readable for active rows), so it carries no denial
 * semantics of its own.
 */
export function useRoomOfferingMeta(
  offeringId: string | null | undefined,
): UseQueryResult<RoomOfferingMeta, Error> {
  return useQuery({
    queryKey: roomOfferingMetaKey(offeringId),
    queryFn: () => fetchRoomOfferingMeta(offeringId as string),
    enabled: !!offeringId,
    staleTime: MEMBERSHIPS_STALE_MS,
  });
}

/**
 * The room's weeks: theme, assignment, `feedback_session_at`, week status, and
 * the caller's own submission and attendance per week.
 *
 * THIS IS THE ONLY WEEK READ IN THE CLIENT. `get_cohort_progress` is the only
 * place week metadata exists — the room envelope carries none of it — and the
 * weeks module (R2-T1) and the assignment module (R2-T4) both need it, so it is
 * ONE hook on ONE key rather than two call sites that would fetch the same rows
 * twice and disagree about the answer the second time a submission lands.
 * (The legacy `/cohort` page calls the RPC inline at CohortDashboard.tsx:78;
 * that page is not retired in this phase and is deliberately left alone.)
 *
 * The stale window matches the envelope's: a room open is the moment a student
 * checks whether anything moved, and a submission mutation invalidates this key
 * directly rather than waiting it out.
 */
export function useRoomWeeks(
  offeringId: string | null | undefined,
  options?: { enabled?: boolean },
): RoomQueryResult<RoomWeekRow[]> {
  const { user } = useAuth();
  return withDenied(
    useQuery({
      queryKey: roomWeeksKey(offeringId, user?.id),
      queryFn: () => fetchRoomWeeks(user!.id, offeringId as string),
      enabled: !!offeringId && !!user?.id && options?.enabled !== false,
      staleTime: ENVELOPE_STALE_MS,
      retry: retryUnlessDenied,
    }),
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * Slug resolution
 *
 * `/room/:slug` is slug-keyed; `get_cohort_room(p_offering uuid)` is UUID-keyed.
 * The ONLY slug→uuid map a client can hold is the `room_slug` column of
 * `get_my_cohort_rooms()`, which returns the caller's OWN memberships and
 * nothing else (rpcs.sql:369) — and `cohort_room_configs` is REVOKEd from anon
 * with a member-read-only policy, so a non-member cannot resolve a foreign slug
 * at all.
 *
 * That makes "no such slug" and "not your room" INDISTINGUISHABLE on the slug
 * route, and that is the right answer anyway: a true 404-vs-private split would
 * turn `/room/:slug` into a slug oracle. Both collapse into `"unavailable"`.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Find a membership by slug. Pure — exported for tests and for the shim. */
export function resolveRoomSlug(
  rooms: CohortRoomSummary[] | undefined,
  slug: string | null | undefined,
): CohortRoomSummary | null {
  if (!slug) return null;
  return (rooms ?? []).find((room) => room.room_slug === slug) ?? null;
}

/** Find a membership by offering id. Pure — this is what `/cohort/:id` uses. */
export function resolveRoomOffering(
  rooms: CohortRoomSummary[] | undefined,
  offeringId: string | null | undefined,
): CohortRoomSummary | null {
  if (!offeringId) return null;
  return (rooms ?? []).find((room) => room.offering_id === offeringId) ?? null;
}

/**
 * The four states a room surface can be in. There is no fifth, and none of them
 * is a spinner over content the visitor cannot have.
 *
 * - `loading`      — a query is still in flight.
 * - `unavailable`  — the slug resolves to nothing we can see: private OR absent,
 *                    deliberately one state (anti-enumeration).
 * - `denied`       — the server said `42501` for a room we DID resolve.
 * - `error`        — a TRANSPORT failure, not an answer about access. Kept apart
 *                    from `unavailable` because telling someone their room is
 *                    private when the network dropped is a lie about their
 *                    access, and the only honest response is "try again".
 * - `ready`        — `room` and `envelope` are both populated. Includes the
 *                    LOBBY (`access === 'pre_member'`), a real room, redacted.
 */
export type RoomViewStatus = "loading" | "unavailable" | "denied" | "error" | "ready";

export interface RoomView {
  status: RoomViewStatus;
  room: CohortRoomSummary | null;
  envelope: CohortRoomEnvelope | null;
  /** Every membership — the room switcher and the nav slot read this. */
  rooms: CohortRoomSummary[];
  error: Error | null;
  /** Re-open the room from the server (used when the doors-open day arrives). */
  refetch: () => void;
}

/**
 * Resolve `/room/:slug` end to end: memberships → offering id → envelope.
 *
 * The shell renders straight off `status`. `ready` covers the lobby, so a
 * `pre_member` never sees an error — they see the room, redacted.
 */
export function useRoomView(slug: string | null | undefined): RoomView {
  const memberships = useMyCohortRooms();
  const rooms = useMemo(() => memberships.data ?? [], [memberships.data]);
  const room = useMemo(() => resolveRoomSlug(rooms, slug), [rooms, slug]);
  const envelope = useCohortRoom(room?.offering_id ?? null);

  let status: RoomViewStatus;
  if (memberships.isPending && memberships.isFetching) {
    status = "loading";
  } else if (memberships.isError) {
    // The ONLY 42501 `get_my_cohort_rooms` raises is "authentication required"
    // (rpcs.sql:289-292) — there is no room to name and nothing to reveal, so
    // it lands on the same non-revealing state as an unknown slug. Anything
    // else is transport: retryable, and not a statement about access.
    status = memberships.denied ? "unavailable" : "error";
  } else if (!room) {
    status = "unavailable";
  } else if (envelope.isError) {
    status = envelope.denied ? "denied" : "error";
  } else if (!envelope.data) {
    status = "loading";
  } else {
    status = "ready";
  }

  return {
    status,
    room,
    envelope: envelope.data ?? null,
    rooms,
    error: (memberships.error ?? envelope.error) as Error | null,
    refetch: () => {
      void envelope.refetch();
      void memberships.refetch();
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────────
 * The shell → module contract
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * What `RoomShell` hands every nested module route through `<Outlet context>`.
 *
 * A module NEVER refetches the room: the shell has already resolved the slug,
 * opened the envelope and applied the contrast floor, and a second
 * `get_cohort_room` per tab would be three round trips for one room.
 */
export interface RoomOutletContext {
  room: CohortRoomSummary;
  envelope: CohortRoomEnvelope;
  /** Already contrast-floored by `resolveTheme` — render it, don't re-check it. */
  theme: RoomTheme;
  /** Every membership, for the switcher and cross-room links. */
  rooms: CohortRoomSummary[];
  /** Re-open the room from the server. */
  refetch: () => void;
}

/** Read the shell's context from any route nested under `/room/:slug`. */
export function useRoomOutlet(): RoomOutletContext {
  return useOutletContext<RoomOutletContext>();
}
