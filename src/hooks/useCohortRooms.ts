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

import { useMemo } from "react";
import { useOutletContext } from "react-router-dom";
import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RoomConfigInput, RoomTheme } from "@/lib/room";

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

/** The two `offerings` columns the room needs that no room RPC returns. */
export interface RoomOfferingMeta {
  /** `offerings.cohort_start_date` — the "doors open" date. */
  cohort_start_date: string | null;
  /** `offerings.whatsapp_group_link` — R-D5 coexistence. */
  whatsapp_group_link: string | null;
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
