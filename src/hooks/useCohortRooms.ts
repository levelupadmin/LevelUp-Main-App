/**
 * useCohortRooms.ts — the ONE data-access layer for cohort rooms (R1-T1).
 *
 * Every room surface in R1–R4 reads through this module. Nothing else in the
 * client may call `supabase.rpc("get_my_cohort_rooms" | "get_cohort_room" |
 * "get_room_roster")` directly: the three RPCs each assert access FIRST and
 * RAISE `42501` for a caller who does not hold it, so "denied" and "empty" are
 * genuinely different answers, and four hand-rolled call sites would end up
 * with four different opinions about which is which.
 *
 * THE ONE RULE THIS FILE ENFORCES
 * ------------------------------
 * `error.code === '42501'` is the ONLY signal of a denial. An empty array, a
 * null envelope or a zero-length roster is a legitimate EMPTY — a pre_start
 * member whose batch is not assigned yet gets `sessions: []` from a fully
 * successful call (rpcs.sql:585-589). Code that treats empty as denied strands
 * exactly the students the room is for.
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

import { useMemo } from "react";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

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
const retryUnlessDenied = (failureCount: number, error: unknown) =>
  !isRoomAccessDenied(error) && failureCount < 2;

/* ────────────────────────────────────────────────────────────────────────────
 * Shapes
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
 * One row of `get_my_cohort_rooms()`, camel-cased once so no consumer has to.
 *
 * `theme` and `modules` stay `unknown`: they are jsonb an admin typed into a
 * form. The shape is structurally a `RoomConfigInput`, so this object can be
 * handed straight to `resolveTheme(room)` / `moduleEnabled(room, key)` from
 * `@/lib/room` without building an intermediate.
 */
export interface CohortRoomSummary {
  offeringId: string;
  offeringTitle: string;
  /**
   * `/room/:slug`. NULL when the offering has a membership but no config row —
   * such a room has no address, so link it as `/cohort/:offeringId` instead of
   * inventing one.
   */
  roomSlug: string | null;
  batchId: string | null;
  batchName: string | null;
  /** `cohort_room_members.role` — member | alumni | mentor | host | pre_member. */
  role: string | null;
  phase: RoomPhase;
  /** True when a `cohort_room_configs` row resolved for this membership. */
  hasConfig: boolean;
  /** jsonb — feed to `resolveTheme`. Untrusted. */
  theme: unknown;
  /** jsonb — feed to `moduleEnabled`. Untrusted. */
  modules: unknown;
  totalWeeks: number;
  currentWeek: number | null;
  nextSessionAt: string | null;
  /** Always null for a `pre_member` — the RPC redacts it (rpcs.sql:320-327). */
  nextDueAt: string | null;
  unseenAnnouncements: number;
}

/** A `cohort_room_configs` row as `to_jsonb(c)` hands it over. */
export interface RoomConfigRow {
  id?: string;
  offering_id?: string;
  batch_id?: string | null;
  slug?: string;
  phase?: string;
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

/** The `get_cohort_room()` envelope, normalised. */
export interface CohortRoomEnvelope {
  offeringId: string;
  batchId: string | null;
  role: string | null;
  access: RoomAccess;
  /**
   * `access === 'pre_member'`. A LOBBY visitor is neither a full member nor a
   * denied one: the server already stripped everything outside the whitelist
   * (rpcs.sql:506-527), so the shell renders the room chrome on the redacted
   * payload and shows NO error state. Modules the redaction emptied simply do
   * not render.
   */
  isLobby: boolean;
  config: RoomConfigRow | null;
  phase: RoomPhase;
  slug: string | null;
  rosterCount: number;
  announcements: RoomAnnouncement[];
  sessions: RoomSession[];
  /** Member-only. Null in the lobby — the field is absent there, not zero. */
  attendancePct: number | null;
}

/** One row of `get_room_roster()`. The six permitted columns, and no others. */
export interface RoomRosterEntry {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  occupation: string | null;
  city: string | null;
  role: string;
}

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

/* ────────────────────────────────────────────────────────────────────────────
 * Normalisers — untrusted jsonb in, render-safe values out
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

/* ────────────────────────────────────────────────────────────────────────────
 * Fetchers
 * ──────────────────────────────────────────────────────────────────────────── */

async function fetchMyCohortRooms(): Promise<CohortRoomSummary[]> {
  const { data, error } = await supabase.rpc("get_my_cohort_rooms");
  // Throw the PostgrestError itself so `error.code` survives to the consumer;
  // wrapping it in a new Error would erase the only denial signal there is.
  if (error) throw error;

  return (data ?? []).map((row) => ({
    offeringId: row.offering_id,
    offeringTitle: row.offering_title ?? "",
    roomSlug: asString(row.room_slug),
    batchId: row.batch_id ?? null,
    batchName: asString(row.batch_name),
    role: asString(row.role),
    phase: asRoomPhase(row.phase),
    hasConfig: asString(row.room_slug) !== null,
    theme: row.theme ?? null,
    modules: row.modules ?? null,
    totalWeeks: asCount(row.total_weeks),
    currentWeek: asNullableNumber(row.current_week),
    nextSessionAt: asString(row.next_session_at),
    nextDueAt: asString(row.next_due_at),
    unseenAnnouncements: asCount(row.unseen_announcements),
  }));
}

async function fetchCohortRoom(offeringId: string): Promise<CohortRoomEnvelope> {
  const { data, error } = await supabase.rpc("get_cohort_room", {
    p_offering: offeringId,
  });
  if (error) throw error;

  const payload = asRecord(data);
  const config = payload.config ? (asRecord(payload.config) as RoomConfigRow) : null;
  const access: RoomAccess = payload.access === "pre_member" ? "pre_member" : "member";

  return {
    offeringId: asString(payload.offering_id) ?? offeringId,
    batchId: asString(payload.batch_id),
    role: asString(payload.role),
    access,
    isLobby: access === "pre_member",
    config,
    phase: asRoomPhase(config?.phase),
    slug: asString(config?.slug),
    rosterCount: asCount(payload.roster_count),
    announcements: Array.isArray(payload.announcements)
      ? (payload.announcements as RoomAnnouncement[])
      : [],
    sessions: Array.isArray(payload.sessions) ? (payload.sessions as RoomSession[]) : [],
    attendancePct: asNullableNumber(payload.attendance_pct),
  };
}

async function fetchRoomRoster(offeringId: string): Promise<RoomRosterEntry[]> {
  const { data, error } = await supabase.rpc("get_room_roster", {
    p_offering: offeringId,
  });
  if (error) throw error;

  return (data ?? []).map((row) => ({
    userId: row.user_id,
    fullName: asString(row.full_name),
    avatarUrl: asString(row.avatar_url),
    occupation: asString(row.occupation),
    city: asString(row.city),
    role: row.role,
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
export function useMyCohortRooms(): UseQueryResult<CohortRoomSummary[], Error> {
  const { user } = useAuth();
  return useQuery({
    queryKey: cohortRoomsKey(user?.id),
    queryFn: fetchMyCohortRooms,
    enabled: !!user?.id,
    staleTime: MEMBERSHIPS_STALE_MS,
    retry: retryUnlessDenied,
  });
}

/**
 * The room-open envelope for one offering. Pass `null` to keep it idle.
 *
 * A denial arrives as an error with `code === '42501'` — check it with
 * `isRoomAccessDenied`, never by looking at the data.
 */
export function useCohortRoom(
  offeringId: string | null | undefined,
): UseQueryResult<CohortRoomEnvelope, Error> {
  return useQuery({
    queryKey: cohortRoomKey(offeringId),
    queryFn: () => fetchCohortRoom(offeringId as string),
    enabled: !!offeringId,
    staleTime: ENVELOPE_STALE_MS,
    retry: retryUnlessDenied,
  });
}

/**
 * The roster. `pre_member` is DENIED here by design (the lobby gets a COUNT via
 * the envelope's `rosterCount`, not identities), so pass `enabled: false` — or
 * simply do not mount the module — when `envelope.isLobby`.
 */
export function useRoomRoster(
  offeringId: string | null | undefined,
  options?: { enabled?: boolean },
): UseQueryResult<RoomRosterEntry[], Error> {
  return useQuery({
    queryKey: roomRosterKey(offeringId),
    queryFn: () => fetchRoomRoster(offeringId as string),
    enabled: !!offeringId && options?.enabled !== false,
    staleTime: MEMBERSHIPS_STALE_MS,
    retry: retryUnlessDenied,
  });
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
  return (rooms ?? []).find((room) => room.roomSlug === slug) ?? null;
}

/** Find a membership by offering id. Pure — this is what `/cohort/:id` uses. */
export function resolveRoomOffering(
  rooms: CohortRoomSummary[] | undefined,
  offeringId: string | null | undefined,
): CohortRoomSummary | null {
  if (!offeringId) return null;
  return (rooms ?? []).find((room) => room.offeringId === offeringId) ?? null;
}

/**
 * The four states a room surface can be in. There is no fifth, and none of them
 * is a spinner over content the visitor cannot have.
 *
 * - `loading`      — a query is still in flight.
 * - `unavailable`  — the slug resolves to nothing we can see: private OR absent,
 *                    deliberately one state (anti-enumeration).
 * - `denied`       — the server said `42501` for a room we DID resolve.
 * - `ready`        — `room` and `envelope` are both populated. Includes the
 *                    LOBBY (`envelope.isLobby`), which is a real room, redacted.
 */
export type RoomViewStatus = "loading" | "unavailable" | "denied" | "ready";

export interface RoomView {
  status: RoomViewStatus;
  room: CohortRoomSummary | null;
  envelope: CohortRoomEnvelope | null;
  /** Every membership — the room switcher and the nav slot read this. */
  rooms: CohortRoomSummary[];
  error: Error | null;
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
  const envelope = useCohortRoom(room?.offeringId ?? null);

  let status: RoomViewStatus;
  if (memberships.isPending && memberships.isFetching) {
    status = "loading";
  } else if (memberships.isError) {
    // A denial on the MEMBERSHIP list means "not signed in" (the only 42501 that
    // RPC raises), and any other failure leaves us unable to resolve the slug.
    // Either way there is nothing to show, and nothing to reveal.
    status = "unavailable";
  } else if (!room) {
    status = "unavailable";
  } else if (envelope.isError) {
    status = isRoomAccessDenied(envelope.error) ? "denied" : "unavailable";
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
  };
}
