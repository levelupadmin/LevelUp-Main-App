import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Film } from "lucide-react";

import { EmptyState } from "@/components/patterns";
import RecordingPlayer, {
  parseEmbeddableRecording,
  type EmbeddableRecording,
} from "@/components/room/RecordingPlayer";
import RecordingRow from "@/components/room/RecordingRow";
import { useAuth } from "@/contexts/AuthContext";
import { useRoomOutlet, type RoomSession } from "@/hooks/useCohortRooms";
import { supabase } from "@/integrations/supabase/client";
import { moduleEnabled, SESSION_DEFAULT_DURATION_MINUTES } from "@/lib/room";

/**
 * RoomScreenings — the Screening Shelf (`/room/:slug/screenings`).
 *
 * Every session carrying a `recording_url` becomes a row: poster, week eyebrow,
 * serif title, duration, and a watched hairline in `--room-accent`. A "Continue
 * watching" rail sits on top whenever a saved position is between 5% and 95%.
 *
 * ── One data layer ────────────────────────────────────────────────────────
 * This page fires NO query of its own. The shell already opened the envelope
 * (`useRoomOutlet`), whose 60s `staleTime` is what picks up a recording added
 * while the page is open, and whose session rows already carry `my_position`
 * from `cohort_recording_progress` (rpcs.sql:571-574). The only server call
 * here is the position WRITE.
 *
 * ── Two kinds of recording, and only one of them resumes ──────────────────
 * The shipped behaviour for `recording_url` is a link-out (`MySessionsPage`),
 * and a link-out cannot report a position. So:
 *   · a YouTube/Vimeo URL plays INSIDE the room (`RecordingPlayer`) and its
 *     position is written back, throttled, on a real player tick;
 *   · every other URL stays a link-out and records `completed` on open.
 * A link-out therefore never shows a resume bar. Faking one — "you were 40%
 * through" from an open timestamp — is the one thing this shelf must not do.
 *
 * ── Phase ─────────────────────────────────────────────────────────────────
 * There is deliberately NO phase check in this file. R-D7: the shelf stays
 * fully available in `alumni`, which is the phase in which it matters most —
 * the season is over and the recordings are what remains.
 *
 * ── What this page does NOT fix ───────────────────────────────────────────
 * `notify-cohort`'s template promises "the recording will be on your cohort
 * dashboard within 24 hours" and carries no link to it
 * (20260526210000_cohort_notification_templates.sql:28). This page makes that
 * promise DELIVERABLE — it is the first surface in the app that shows a
 * recording — but not yet TRUE: `VITE_COHORT_ROOMS` is off, so
 * `/room/:slug/screenings` is unreachable in production, and the template is a
 * migration, which R2 (client-only) does not touch. Linking the mail here is a
 * rollout-phase item.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Shape
 * ──────────────────────────────────────────────────────────────────────────── */

interface ShelfRow {
  sessionId: string;
  title: string;
  /** Mono eyebrow — "WEEK 03", or the IST date when the week is not derivable. */
  eyebrow: string;
  /** Episode ordinal for the poster tile, oldest session first. */
  posterLabel: string;
  /** Non-null only for a URL we can genuinely play, and therefore resume. */
  embeddable: EmbeddableRecording | null;
  /** Set only for a link-out row. */
  href: string | null;
  /** Best known length of the RECORDING, in seconds. */
  durationSeconds: number;
  /** True only when `durationSeconds` came from the PLAYER, not the timetable. */
  lengthMeasured: boolean;
  positionSeconds: number;
  completed: boolean;
  /**
   * 0–100, watched. APPROXIMATE while `lengthMeasured` is false — good enough to
   * bucket a row, not good enough to draw. Always 0 for a link-out.
   */
  pct: number;
  /** `pct` when it is honest to DRAW it, else null. See the note below. */
  drawnPct: number | null;
}

/** The window in which a recording is worth resuming rather than restarting. */
export const RESUME_MIN_PCT = 5;
export const RESUME_MAX_PCT = 95;

/** At or past this, the recording counts as watched rather than in progress. */
const COMPLETE_PCT = RESUME_MAX_PCT;

/** At most one position write per this many ms, per the brief. */
const PROGRESS_FLUSH_MS = 10_000;

/** A session id shaped like the uuid it is — the only thing put in a selector. */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

const IST_DATE = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

/* ────────────────────────────────────────────────────────────────────────────
 * Pure helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * A URL we are willing to put in an `href`.
 *
 * `live_sessions.recording_url` is a free-text admin field, so http(s) only —
 * the same whitelist posture `PreStartCard` applies to the WhatsApp link. A
 * `javascript:` URL typed into that box renders as no row at all.
 */
function externalHttpUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://") ? trimmed : null;
}

/**
 * `week_id` → week number, or an EMPTY map when the mapping cannot be trusted.
 *
 * The envelope carries `week_id` but no week NUMBER (rpcs.sql:538), and this
 * page is not allowed a second query to go and fetch one. The distinct
 * `week_id`s in schedule order are the ordinal — but only if every week of the
 * season actually holds a session, because a break week with none would shift
 * every number after it. So the derivation is checked against `total_weeks`
 * from the membership row (a `count(DISTINCT week_number)`, rpcs.sql:311) and
 * ABANDONED on a mismatch: the eyebrow falls back to the session's date, which
 * is always true, rather than printing a week number that might be a lie.
 */
export function deriveWeekNumbers(
  sessions: RoomSession[],
  totalWeeks: number | null | undefined,
): Map<string, number> {
  const ordered = [...sessions].sort(
    (a, b) => Date.parse(a.scheduled_at ?? "") - Date.parse(b.scheduled_at ?? ""),
  );
  const numbers = new Map<string, number>();
  for (const session of ordered) {
    const weekId = session.week_id;
    if (!weekId || numbers.has(weekId)) continue;
    numbers.set(weekId, numbers.size + 1);
  }
  if (typeof totalWeeks === "number" && totalWeeks > 0 && numbers.size !== totalWeeks) {
    return new Map();
  }
  return numbers;
}

/** 0–100, clamped. A zero/unknown length reads as no progress, never as full. */
export function watchedPct(positionSeconds: number, durationSeconds: number): number {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return 0;
  return Math.min(100, Math.max(0, (positionSeconds / durationSeconds) * 100));
}

/** "48 min" / "1h 12m". */
function durationLabel(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** "12:30" / "1:02:30" — where the student stopped. */
export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (value: number) => String(value).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/* ────────────────────────────────────────────────────────────────────────────
 * Measured lengths
 *
 * `cohort_recording_progress` stores a position and nothing else — there is no
 * duration column, and R2 adds no migration. Without a length, the hairline can
 * only be drawn against the session's SCHEDULED `duration_minutes`, which is
 * what was planned, not what was recorded; a 90-minute slot that produced a
 * 62-minute file would draw every bar ~30% short.
 *
 * So the length the player reports is cached locally, keyed by session id. It
 * is media metadata — one integer — and carries no roster identity or
 * announcement body, which is what `COHORT_ROOMS_QUERY_ROOT` is kept out of
 * localStorage to protect. It is keyed by SESSION, not by user, which is why it
 * is safe to leave on a shared device: a recording's length is the same length
 * for everyone, and no position is ever cached here.
 *
 * 🔴 AND UNTIL THAT LENGTH IS KNOWN, NO BAR IS DRAWN AT ALL. A hairline is a
 * quantitative claim — "you are exactly this far in" — and the scheduled
 * `duration_minutes` cannot support one: the 90-minute slot that produced a
 * 62-minute file would draw every bar ~30% short, which is exactly the
 * misreporting the V9 ruling forbids. So an unmeasured row shows its resume
 * CLOCK, which is exact (a stored position in seconds needs no length to be
 * true), and no bar — until the player volunteers a duration, normally in its
 * first frame, after which the length is cached here and the bar persists.
 * Bucketing still uses the approximate length (the 5–95% Continue-watching
 * window, the "Watched" label): those are coarse decisions about which shelf a
 * row belongs on, not a drawn quantity a student reads a position off.
 * ──────────────────────────────────────────────────────────────────────────── */

const MEASURED_LENGTH_KEY = "lu_room_rec_len";

function readMeasuredLengths(): Record<string, number> {
  try {
    const raw = localStorage.getItem(MEASURED_LENGTH_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed !== "object" || parsed === null) return {};
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "number" && Number.isFinite(value) && value > 0) out[key] = value;
    }
    return out;
  } catch {
    // Private mode / locked-down WebView — the shelf still opens.
    return {};
  }
}

function persistMeasuredLengths(lengths: Record<string, number>): void {
  try {
    localStorage.setItem(MEASURED_LENGTH_KEY, JSON.stringify(lengths));
  } catch {
    // Nothing to do: the bar falls back to the scheduled duration.
  }
}

/* ────────────────────────────────────────────────────────────────────────────
 * The position write
 *
 * 🔴 NO MIGRATION AND NO RPC. `cohort_recording_progress` already carries
 * direct grants to `authenticated` (content.sql:975) under `recprog_own_all`
 * (:828), which scopes every verb to `user_id = auth.uid()` AND to a recording
 * whose room is still reachable. So the write is a plain upsert and the server
 * is the only thing deciding whether it lands.
 *
 * ⚠️ INTEGRATION NOTE: this writer lives here because R2-T1's hook had not
 * landed in `useCohortRooms.ts` when this task was built, and adding a second
 * mutation surface there blind would have been the competing data layer the
 * brief forbids. Fold it into `useCohortRooms.ts` at integration.
 * ──────────────────────────────────────────────────────────────────────────── */

interface RecordingProgressRow {
  user_id: string;
  live_session_id: string;
  position_seconds: number;
  completed: boolean;
  updated_at: string;
}

/**
 * `cohort_recording_progress` is not in the generated `Database` type yet (the
 * R0 migrations post-date the last codegen), so the client is narrowed to the
 * one call this file makes rather than widened to `any` — same escape as
 * `useNotifyRequests.ts`, minus the `any`.
 */
interface ProgressTable {
  upsert: (
    rows: RecordingProgressRow[],
    options: { onConflict: string },
  ) => PromiseLike<{ error: { message: string } | null }>;
}

function progressTable(): ProgressTable {
  return (supabase as unknown as { from: (table: string) => ProgressTable }).from(
    "cohort_recording_progress",
  );
}

type PendingProgress = { position_seconds: number; completed: boolean };

/**
 * Buffers positions and flushes them at most once every 10s, plus on
 * visibility-change and on unmount.
 *
 * `pagehide` is listened for alongside `visibilitychange` because the iOS
 * WKWebView does not reliably fire the latter when the app is swiped away, and
 * a position that never leaves the buffer is the same as no position at all.
 */
function useProgressWriter(userId: string | null | undefined) {
  const pending = useRef(new Map<string, PendingProgress>());
  const timer = useRef<number | null>(null);
  const userIdRef = useRef(userId);
  /** False from the moment the page starts tearing down — see `record`. */
  const alive = useRef(true);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const flush = useCallback(() => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const uid = userIdRef.current;
    if (!uid || pending.current.size === 0) return;

    const now = new Date().toISOString();
    const rows: RecordingProgressRow[] = [...pending.current.entries()].map(
      ([live_session_id, value]) => ({
        user_id: uid,
        live_session_id,
        position_seconds: value.position_seconds,
        completed: value.completed,
        updated_at: now,
      }),
    );
    pending.current.clear();

    // Deliberately silent. A dropped position is a small loss the next tick
    // repairs; a toast over it would interrupt playback to report on itself.
    void Promise.resolve(
      progressTable().upsert(rows, { onConflict: "user_id,live_session_id" }),
    ).catch(() => undefined);
  }, []);

  const record = useCallback(
    (sessionId: string, value: PendingProgress) => {
      // A tick that arrives after teardown has nothing left to flush it — the
      // final flush has already run — so buffering it would only arm a timeout
      // on an unmounted page. There is exactly one window in which that can
      // happen (a provider frame posting between this hook's cleanup and the
      // player's), and dropping the tick is the correct end to it.
      if (!alive.current) return;
      pending.current.set(sessionId, value);
      if (timer.current === null) {
        timer.current = window.setTimeout(flush, PROGRESS_FLUSH_MS);
      }
    },
    [flush],
  );

  useEffect(() => {
    alive.current = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      // The last write of the mount, and the only place the 10s timer can be
      // outlived: `flush` clears it, so nothing is left running.
      flush();
      alive.current = false;
    };
  }, [flush]);

  return { record, flush };
}

/* ────────────────────────────────────────────────────────────────────────────
 * Component
 * ──────────────────────────────────────────────────────────────────────────── */

const RoomScreenings = () => {
  const { room, envelope } = useRoomOutlet();
  const { user } = useAuth();
  const { record } = useProgressWriter(user?.id ?? null);

  /** Which row's player is mounted. One at a time — two would fight for audio. */
  const [activeId, setActiveId] = useState<string | null>(null);
  /** Positions written this session, laid over the envelope's `my_position`. */
  const [livePositions, setLivePositions] = useState<Record<string, number>>({});
  /** Link-outs opened this mount — see `openedIds` below for what it does NOT claim. */
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [measuredLengths, setMeasuredLengths] = useState<Record<string, number>>(
    readMeasuredLengths,
  );

  const shelfRef = useRef<HTMLUListElement | null>(null);

  // The cache write. The ref starts as the state's own first value, so the mount
  // pass is skipped and nothing is written until a player actually measures
  // something — a locked-down WebView that cannot read storage never writes to
  // it either.
  const persistedLengths = useRef(measuredLengths);
  useEffect(() => {
    if (persistedLengths.current === measuredLengths) return;
    persistedLengths.current = measuredLengths;
    persistMeasuredLengths(measuredLengths);
  }, [measuredLengths]);

  const moduleOn = moduleEnabled(envelope.config, "recordings");

  const rows: ShelfRow[] = useMemo(() => {
    const weekNumbers = deriveWeekNumbers(envelope.sessions, room.total_weeks);

    // Ordinals are counted oldest-first so "01" is the first session of the
    // season; the shelf itself then reads newest-first, which is the order a
    // student opens it in.
    const chronological = [...envelope.sessions].sort(
      (a, b) => Date.parse(a.scheduled_at ?? "") - Date.parse(b.scheduled_at ?? ""),
    );

    const built: ShelfRow[] = [];
    chronological.forEach((session, index) => {
      const url = externalHttpUrl(session.recording_url);
      if (!url) return;

      const embeddable = parseEmbeddableRecording(url);
      const weekNumber = session.week_id ? weekNumbers.get(session.week_id) : undefined;
      const scheduledMs = Date.parse(session.scheduled_at ?? "");
      const eyebrow = weekNumber
        ? `Week ${String(weekNumber).padStart(2, "0")}`
        : Number.isFinite(scheduledMs)
          ? IST_DATE.format(scheduledMs)
          : "Recording";

      const scheduledSeconds =
        (typeof session.duration_minutes === "number" && session.duration_minutes > 0
          ? session.duration_minutes
          : SESSION_DEFAULT_DURATION_MINUTES) * 60;
      const measured = measuredLengths[session.id];
      const lengthMeasured = typeof measured === "number" && measured > 0;
      const durationSeconds = lengthMeasured ? measured : scheduledSeconds;

      // The envelope's `my_position` is the saved position; anything written
      // this mount is newer, so it wins. A link-out has no position at all.
      const positionSeconds = embeddable
        ? (livePositions[session.id] ?? session.my_position ?? 0)
        : 0;
      const pct = embeddable ? watchedPct(positionSeconds, durationSeconds) : 0;

      built.push({
        sessionId: session.id,
        title: session.title ?? "Session recording",
        eyebrow,
        posterLabel: String(index + 1).padStart(2, "0"),
        embeddable,
        href: embeddable ? null : url,
        durationSeconds,
        lengthMeasured,
        positionSeconds,
        completed: pct >= COMPLETE_PCT,
        pct,
        // A link-out keeps its empty groove — it reports nothing, and an empty
        // rail says exactly that. An embed with an unmeasured length draws no
        // bar at all rather than one derived from the timetable.
        drawnPct: embeddable ? (lengthMeasured ? pct : null) : 0,
      });
    });

    return built.reverse();
  }, [envelope.sessions, room.total_weeks, measuredLengths, livePositions]);

  const resumable = useMemo(
    () => rows.filter((row) => row.pct > RESUME_MIN_PCT && row.pct < RESUME_MAX_PCT),
    [rows],
  );

  const onProgress = useCallback(
    (row: ShelfRow, position: number, reportedDuration: number | null) => {
      const seconds = Math.floor(position);

      if (reportedDuration && reportedDuration > 0) {
        const length = Math.round(reportedDuration);
        // Pure updater: the localStorage write is an effect (below), because an
        // updater runs twice under StrictMode and must not touch the world.
        setMeasuredLengths((prev) =>
          prev[row.sessionId] === length ? prev : { ...prev, [row.sessionId]: length },
        );
      }

      // 🔴 A player that is READY but has not started reports `currentTime: 0`,
      // and both providers emit at least one such frame. Writing it back would
      // overwrite a real saved position with zero the moment a student opened a
      // recording and changed their mind — the one way this feature can destroy
      // the thing it exists to protect. A position of exactly zero carries no
      // information, so it contributes its DURATION (above) and nothing else. A
      // genuine rewind lands at some position > 0 and is honoured.
      if (seconds <= 0) return;

      setLivePositions((prev) =>
        prev[row.sessionId] === seconds ? prev : { ...prev, [row.sessionId]: seconds },
      );

      // `completed` is a claim stored on the server, so it is made only against
      // a length the player actually reported (this frame's, or a cached one
      // from an earlier play). A scheduled duration can be minutes out in
      // either direction, and "watched" is not a thing to get wrong by guessing.
      const duration =
        reportedDuration && reportedDuration > 0
          ? reportedDuration
          : row.lengthMeasured
            ? row.durationSeconds
            : null;
      record(row.sessionId, {
        position_seconds: seconds,
        completed: duration !== null && watchedPct(seconds, duration) >= COMPLETE_PCT,
      });
    },
    [record],
  );

  /**
   * A link-out opens in a new tab and never reports back, so the only honest
   * thing to write is `completed` — the position it already holds is left
   * exactly as it was rather than reset to zero.
   */
  const onOpenLinkOut = useCallback(
    (row: ShelfRow) => {
      setOpenedIds((prev) => (prev.includes(row.sessionId) ? prev : [...prev, row.sessionId]));
      record(row.sessionId, { position_seconds: row.positionSeconds, completed: true });
    },
    [record],
  );

  const openRow = useCallback((sessionId: string) => {
    setActiveId((current) => (current === sessionId ? null : sessionId));
    // jsdom and older WebViews do not implement scrollIntoView; the rail still
    // opens the row, it just does not travel.
    // Ids are uuids; anything that is not selector-safe is simply not looked up
    // rather than interpolated into a query.
    const node = SAFE_ID.test(sessionId)
      ? shelfRef.current?.querySelector<HTMLElement>(`[data-session-id="${sessionId}"]`)
      : null;
    node?.scrollIntoView?.({ block: "center" });
  }, []);

  if (!moduleOn) {
    return (
      <p className="body-muted py-10 text-center text-sm">
        This cohort doesn&apos;t use screenings.{" "}
        <Link to="." className="text-room-accent underline-offset-4 hover:underline">
          Back to the room
        </Link>
      </p>
    );
  }

  return (
    <section aria-labelledby="room-module-recordings" className="space-y-4">
      <h2
        id="room-module-recordings"
        className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
      >
        Screenings
      </h2>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Film size={22} strokeWidth={1.5} />}
          title="Recordings land here after each session."
          description="Nothing has been posted yet. The room will hold them all."
        />
      ) : (
        <>
          {resumable.length > 0 && (
            <div className="space-y-2">
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                Continue watching
              </p>
              {/* `scroll-px-4` matches the gutter the `-mx-4/px-4` bleed
                  restores: without it, mandatory snapping aligns the first
                  card to the container edge and eats the 16px gutter, so the
                  rail opens flush against the screen. */}
              <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
                {resumable.map((row) => (
                  <li key={row.sessionId} className="w-56 shrink-0 snap-start">
                    <button
                      type="button"
                      onClick={() => openRow(row.sessionId)}
                      className="focus-ring pressable flex h-full w-full flex-col rounded-xl border border-border bg-surface p-3 text-left"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
                        {row.eyebrow}
                      </span>
                      <span className="mt-1 line-clamp-2 font-serif text-base leading-tight text-foreground">
                        {row.title}
                      </span>
                      <span className="mt-2 text-xs text-room-accent">
                        Resume at {clockLabel(row.positionSeconds)}
                      </span>
                      {/* Same rule as the shelf hairline: the groove always
                          holds the card's height, the fill appears only once
                          the length is measured. The clock above it is exact
                          either way. */}
                      <span className="mt-2 h-px w-full overflow-hidden bg-border">
                        {row.drawnPct !== null && (
                          <span
                            className="block h-full w-full origin-left bg-room-accent transition-transform"
                            style={{
                              transform: `scaleX(${row.drawnPct / 100})`,
                              transitionDuration: "var(--motion-base)",
                              transitionTimingFunction: "var(--ease-out)",
                            }}
                          />
                        )}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ul ref={shelfRef} className="space-y-3">
            {rows.map((row) => {
              const opened = openedIds.includes(row.sessionId);
              const statusLabel = row.href
                ? opened
                  ? "Opened"
                  : null
                : row.completed
                  ? "Watched"
                  : row.pct > RESUME_MIN_PCT
                    ? `Resume at ${clockLabel(row.positionSeconds)}`
                    : null;

              return (
                <RecordingRow
                  key={row.sessionId}
                  sessionId={row.sessionId}
                  eyebrow={row.eyebrow}
                  posterLabel={row.posterLabel}
                  title={row.title}
                  durationLabel={durationLabel(row.durationSeconds)}
                  progressPct={row.drawnPct}
                  statusLabel={statusLabel}
                  href={row.href}
                  open={activeId === row.sessionId}
                  onOpen={() =>
                    row.href ? onOpenLinkOut(row) : openRow(row.sessionId)
                  }
                >
                  {row.embeddable && activeId === row.sessionId && (
                    <RecordingPlayer
                      key={row.sessionId}
                      recording={row.embeddable}
                      title={row.title}
                      startSeconds={row.positionSeconds}
                      onProgress={(position, duration) => onProgress(row, position, duration)}
                    />
                  )}
                </RecordingRow>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

export default RoomScreenings;
