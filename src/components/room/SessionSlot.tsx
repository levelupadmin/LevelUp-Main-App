import type { ReactNode } from "react";
import { CalendarPlus, ExternalLink, PlayCircle } from "lucide-react";
import { Link } from "react-router-dom";

import TimeStateBadge from "@/components/live/TimeStateBadge";
import { addToCalendar } from "@/lib/calendar";
import { track } from "@/lib/analytics";
import { tapTick } from "@/lib/haptics";
import { sessionTimeState } from "@/lib/room";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { RoomSession } from "@/hooks/useCohortRooms";
import DoorsOpenCountdown from "./DoorsOpenCountdown";
import { useRoomClock, useRoomClockFastTick } from "./RoomClockProvider";

/**
 * SessionSlot — one live session, in whichever of its six states it is in.
 *
 * The ladder is `sessionTimeState()`'s (src/lib/room.ts), imported rather than
 * re-derived so the room and the tests agree on where every boundary sits:
 *
 * ```
 * scheduled → tonight → soon (T-60) → live → ended → recorded
 * ```
 *
 * · `scheduled` — a date and a way to put it in your own calendar.
 * · `tonight`   — the existing `TimeStateBadge`, the app's shipped vocabulary
 *                 for "today at 8", reused rather than re-styled.
 * · `soon`      — the doors-open countdown and an enabled Join. THE SCREEN'S
 *                 ONE CHAMPAGNE MOMENT: every other state here is deliberately
 *                 quiet so this one lands. A caller rendering two slots that
 *                 are both `soon` passes `champagne={false}` to the second —
 *                 `ThisWeekCard` elects the first uncancelled `soon` session
 *                 THAT HAS A JOIN LINK (`sessionJoinUrl`) and opts every other
 *                 slot out. The link matters because champagne is a BUTTON: a
 *                 slot whose `zoom_link` the server has not released yet renders
 *                 a sentence, so electing it would leave the screen with no
 *                 champagne on it at all.
 * · `live`      — crimson LIVE with a ping that only plays under `motion-safe`,
 *                 and Join as the primary action.
 * · `ended`     — the quiet promise the notification email already made.
 * · `recorded`  — hands off to the Screening Shelf; playback is not this
 *                 component's job.
 *
 * ── The join link is the SERVER's decision ───────────────────────────────
 * `zoom_link` arrives null outside the window because `get_cohort_room` nulls
 * it in SQL (`20260729100200_cohort_room_rpcs.sql`, the `'zoom_link', CASE`
 * expression). There is deliberately NO client clock check here: a client check
 * is not a gate, and adding one would only produce a second, disagreeing
 * opinion about who may join. What this file owns is what to render when the
 * link is absent — a sentence, never a button that goes nowhere.
 *
 * ── Time ─────────────────────────────────────────────────────────────────
 * `now` comes from the room's single clock (`RoomClockProvider`, mounted by
 * `RoomShell`). The slot asks that clock for 1s cadence only while it is in
 * `soon`; the rest of the time a minute is plenty. No `setInterval` here.
 */

/** All wall-clock copy is IST, whatever the device is set to. */
const IST_TIME_ZONE = "Asia/Kolkata";

const IST_DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: IST_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * `en-IN` hands back a lowercase "pm" while the rest of the app formats
 * "8:00 PM" (date-fns "h:mm a"), and the two would otherwise disagree on one
 * screen. Same normalisation as `PreStartCard`.
 */
function istWhen(ms: number): string {
  const formatted = IST_DATE_TIME.format(ms).replace(/\b([ap])\.?m\.?\b/gi, (match) =>
    match.toUpperCase(),
  );
  return `${formatted} IST`;
}

/**
 * A link we are willing to put in an `href`. `live_sessions.zoom_link` is an
 * admin-typed field, so http(s) only: a `javascript:` URL in that box must
 * render as no button at all. Same posture as `resolveTheme`'s hero check.
 */
function externalHttpUrl(value: string | null | undefined): string | null {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://") ? trimmed : null;
}

/**
 * The join URL this slot would actually render, or null.
 *
 * Exported for the same reason `isCancelledSession` is: the CALLER elects which
 * slot gets the single champagne treatment, and champagne IS a Join button — the
 * `btn-champagne` class only ever lands on the `<a>`. A session inside T-60 whose
 * `zoom_link` the server has not handed over (or has handed over as something
 * that is not http) renders "Link drops here 1 hour before." instead, so
 * electing it spends the screen's one champagne moment on a sentence and the
 * page ends up with no champagne at all. The caller has to be able to ask this
 * question, and it must be answered by the same function that decides what gets
 * rendered rather than by a second opinion in `ThisWeekCard`.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function sessionJoinUrl(session: Pick<RoomSession, "zoom_link">): string | null {
  return externalHttpUrl(session.zoom_link);
}

/**
 * Is this session cancelled?
 *
 * Exported because the CALLER has to know: `ThisWeekCard` picks which slot gets
 * the single champagne treatment, and a cancelled session renders no countdown
 * and no Join, so it must not be the one that spends it. `live_sessions.status`
 * is free text in practice, hence the trim-and-lower rather than `=== `.
 */
// One exported predicate beside the component that owns the rule, rather than a
// second copy of it in `ThisWeekCard` (the two would drift) or a new file for a
// single line. Fast Refresh loses this module's state on edit as a result, and
// this module holds none — the clock it reads lives in `RoomClockProvider`.
// eslint-disable-next-line react-refresh/only-export-components
export function isCancelledSession(session: Pick<RoomSession, "status">): boolean {
  return (session.status ?? "").trim().toLowerCase() === "cancelled";
}

/** Shared action sizing: ≥44px targets, never a squeezed tap area at 360px. */
const ACTION_BASE =
  "focus-ring pressable inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm";

export interface SessionSlotProps {
  session: RoomSession;
  /** Mono eyebrow above the title, e.g. `E04 · Week 4`. */
  eyebrow?: string | null;
  /**
   * Where the recording lives once it lands (R2-T3's shelf). Absent renders the
   * `recorded` line without a link rather than guessing a route.
   */
  recordingHref?: string | null;
  /** Rides along as the calendar entry's description, e.g. the cohort title. */
  calendarNote?: string | null;
  /**
   * The champagne treatment in `soon`. Exactly one slot on a screen may carry
   * it; a caller rendering a second `soon` slot passes false so the moment
   * stays singular. Use `sessionJoinUrl()` to elect it — champagne is a Join
   * button, so a slot with no link cannot wear it.
   */
  champagne?: boolean;
  /**
   * Which heading level the session title takes.
   *
   * `3` is right for a STANDALONE mount, where the slot is a top-level thing on
   * the page. Mounted inside a labelled group it is wrong: `ThisWeekCard`'s
   * sessions column carries its own `<h3>Live sessions</h3>`, and an `<h3>` per
   * session under it tells a heading rotor that each class is a PEER of the list
   * it belongs to. That caller passes `4`. The level is the caller's to state
   * because only the caller knows what is above it.
   */
  headingLevel?: 2 | 3 | 4 | 5;
  className?: string;
}

export function SessionSlot({
  session,
  eyebrow,
  recordingHref,
  calendarNote,
  champagne = true,
  headingLevel = 3,
  className,
}: SessionSlotProps) {
  const nowMs = useRoomClock();
  const state = sessionTimeState(session, nowMs);

  // 1s cadence is bought for the countdown window only, and given straight back
  // the moment the session goes live.
  useRoomClockFastTick(state === "soon");

  const startMs = session.scheduled_at ? Date.parse(session.scheduled_at) : NaN;
  const hasDate = Number.isFinite(startMs);
  const cancelled = isCancelledSession(session);
  const title = session.title?.trim() || "Live session";
  const joinUrl = sessionJoinUrl(session);
  const Heading = `h${headingLevel}` as const;

  const handleAddToCalendar = () => {
    if (!session.scheduled_at) return;
    void tapTick();
    addToCalendar(
      title,
      session.scheduled_at,
      session.duration_minutes,
      null,
      calendarNote ?? null,
    );
    toast.success("Added to your calendar");
  };

  const addToCalendarButton = hasDate ? (
    <button
      type="button"
      onClick={handleAddToCalendar}
      className={cn(ACTION_BASE, "border border-border text-muted-foreground hover:text-foreground")}
    >
      <CalendarPlus size={16} strokeWidth={1.5} aria-hidden="true" />
      Add to calendar
    </button>
  ) : null;

  const joinLink = (variant: "champagne" | "primary") =>
    joinUrl ? (
      <a
        href={joinUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          void tapTick();
          track({ name: "room_session_join_tapped", sessionId: session.id, state });
        }}
        className={cn(
          ACTION_BASE,
          "px-5 font-medium",
          variant === "champagne" ? "btn-champagne" : "bg-room-accent text-canvas",
        )}
      >
        Join
        <ExternalLink size={16} strokeWidth={1.5} aria-hidden="true" />
      </a>
    ) : null;

  /* ── The body of the slot, per state ──
     Built as a node so a state that has nothing to add contributes nothing,
     rather than an empty row of chrome. */
  let body: ReactNode = null;

  if (cancelled) {
    // No countdown, no join, no calendar entry for something that is not
    // happening. The struck title carries the fact; this carries the tone.
    body = <p className="body-muted text-sm">This session was cancelled.</p>;
  } else if (state === "soon") {
    body = (
      <div className="flex flex-wrap items-end justify-between gap-4">
        <DoorsOpenCountdown startsAt={startMs} />
        {joinUrl ? (
          joinLink(champagne ? "champagne" : "primary")
        ) : (
          <p className="body-muted text-sm">Link drops here 1 hour before.</p>
        )}
      </div>
    );
  } else if (state === "live") {
    body = (
      <div className="flex flex-wrap items-center justify-between gap-4">
        <LivePill />
        {joinUrl ? (
          joinLink("primary")
        ) : (
          <p className="body-muted text-sm">The join link is not up yet.</p>
        )}
      </div>
    );
  } else if (state === "ended") {
    body = <p className="body-muted text-sm">Recording lands within 24 hours.</p>;
  } else if (state === "recorded") {
    body = recordingHref ? (
      <Link
        to={recordingHref}
        onClick={() => void tapTick()}
        className={cn(ACTION_BASE, "border border-border text-foreground hover:border-border-hover")}
      >
        <PlayCircle size={16} strokeWidth={1.5} aria-hidden="true" />
        Watch the recording
      </Link>
    ) : (
      <p className="body-muted text-sm">The recording is on the shelf.</p>
    );
  } else if (addToCalendarButton) {
    // `scheduled` and `tonight` share one action: put it in your own calendar.
    body = <div className="flex flex-wrap gap-2">{addToCalendarButton}</div>;
  } else {
    // A session an admin created before its date. `sessionTimeState` reads a
    // null `scheduled_at` as `scheduled`, so state alone would leave a slot
    // holding nothing but a title — the thinner row this component replaced
    // said "Scheduled" here, and the student is owed the fact either way.
    body = <p className="body-muted text-sm">The date is not set yet.</p>;
  }

  return (
    <article
      // Read by the room's tests (and useful in a device audit) so the state
      // ladder can be asserted without depending on locale-formatted copy.
      data-session-state={cancelled ? "cancelled" : state}
      className={cn("surface-card p-4 sm:p-5", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && (
            <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <Heading
            className={cn(
              "mt-1 font-serif text-lg leading-snug text-foreground sm:text-xl",
              cancelled && "text-muted-foreground line-through",
            )}
          >
            {title}
          </Heading>
        </div>

        {/* The badge slot. `tonight` reuses the app's shipped relative-time
            vocabulary; `cancelled` states the fact rather than a time. */}
        {cancelled ? (
          <span className="shrink-0 whitespace-nowrap rounded bg-muted px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            Cancelled
          </span>
        ) : state === "tonight" && session.scheduled_at ? (
          <TimeStateBadge
            date={session.scheduled_at}
            durationMin={session.duration_minutes}
            className="shrink-0"
          />
        ) : null}
      </div>

      {hasDate && (
        <p
          className={cn(
            "mt-2 font-mono text-[11px] uppercase tracking-[0.16em] text-muted-foreground",
            cancelled && "line-through",
          )}
        >
          {istWhen(startMs)}
        </p>
      )}

      {body && <div className="mt-4">{body}</div>}
    </article>
  );
}

/**
 * The LIVE marker. Crimson, and the ping is `motion-safe:` gated in CSS — the
 * one place a pulsing dot is allowed, and never for someone who asked the
 * system for less motion. Mirrors `TimeStateBadge`'s live pill so the two
 * surfaces speak with one voice.
 */
function LivePill() {
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded bg-[hsl(var(--accent-crimson)/0.15)] px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-[hsl(var(--accent-crimson-text))]"
      aria-label="Live now"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--accent-crimson))] opacity-75 motion-safe:animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-[hsl(var(--accent-crimson))]" />
      </span>
      Live
    </span>
  );
}

export default SessionSlot;
