import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Megaphone, Pin, PinOff, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonLine } from "@/components/patterns";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  canPostAnnouncement,
  useAmendRoomAnnouncement,
  useRoomAnnouncements,
  useRoomOutlet,
  useRoomSeenWatermark,
  usePostRoomAnnouncement,
  type RoomAnnouncementDetail,
} from "@/hooks/useCohortRooms";
import { useRoomClock } from "./RoomClockProvider";

/**
 * AnnouncementsModule — the noticeboard, under the room masthead.
 *
 * ── Where it mounts, and why it is not a tab ──────────────────────────────
 * There is no `announcements` entry in `ROOM_TABS` (RoomShell.tsx) and no
 * announcements ROUTE. The board hangs off `RoomHome`, replacing the one-line
 * summary card that slot used to carry, because a notice is the first thing a
 * student should see on opening the room rather than a place they have to
 * navigate to. `RoomHome` still owns the `moduleEnabled(config,
 * "announcements")` gate; this component renders whatever it is given.
 *
 * It mounts on BOTH of `RoomHome`'s branches, the lobby included. That is not
 * symmetry for its own sake: a `pre_member`'s entire whitelist is
 * announcements-READ (MEMBER-1), and a lobby that showed one notice while the
 * watermark claimed the whole board had been read would lose every other notice
 * silently. One surface owns the board, and it is this one.
 *
 * ── Two reads exist and this one is the board's ───────────────────────────
 * The envelope already carries an `announcements` array, and it is NOT what
 * this renders. That array is `to_jsonb(a)` with a hard `LIMIT 10` and no
 * author on it (`get_cohort_room`, 20260729100200). The board reads
 * `get_room_announcements` instead (20260801120000), which pages and joins the
 * author's name and their standing IN THIS ROOM. See `RoomAnnouncementDetail`
 * in useCohortRooms.ts for the full argument.
 *
 * ── Four answers, never three ─────────────────────────────────────────────
 * Loading, REFUSED, failed and empty are four different things and each gets
 * its own line. Folding "refused" into "Nothing on the board yet." would tell a
 * student whose membership was just revoked that their cohort has gone quiet,
 * which is the exact conflation useCohortRooms.ts's header forbids: "'denied'
 * and 'empty' are genuinely different answers".
 *
 * ── The composer and the two amend verbs are hidden, not gated ────────────
 * `canPostAnnouncement` decides whether the form and the per-notice controls are
 * DRAWN. The GATE is `ann_host_insert` and `ann_host_retract`
 * (20260729100100), whose predicates pin authorship, the mentor/host check and
 * the batch-belongs-to-offering relationship, and whose BEFORE trigger reverts
 * every column a mentor does not own. A member who reaches either write by hand
 * is refused by the database. Hiding controls that would always fail is a
 * courtesy; it is not security, and nothing here should ever be read as if it
 * were.
 *
 * ── Motion budget ─────────────────────────────────────────────────────────
 * No framer springs, no `backdrop-blur`, no layout animation. The only moving
 * parts are the composer's disclosure and the retract confirmation (both mounts,
 * not transitions) and the pressable states the shared primitives already own. A
 * list that grows to forty rows on an Android WebView is the wrong place to
 * spend compositor budget.
 */

/* ────────────────────────────────────────────────────────────────────────────
 * Pure helpers — exported because they are what the tests can pin
 * ──────────────────────────────────────────────────────────────────────────── */

/** Day and month in the calendar members actually live in (R-D: IST). */
const IST_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});
const IST_DAY_YEAR = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Asia/Kolkata",
});
const IST_YEAR = new Intl.DateTimeFormat("en-IN", {
  year: "numeric",
  timeZone: "Asia/Kolkata",
});

/**
 * "3 hours ago", "2 days ago", "12 Mar".
 *
 * A notice stamped in the FUTURE reads "Just now" rather than "in 3 hours":
 * `created_at` is `now()` on the server and the only way a client sees a future
 * one is clock skew on the device, which is not something to report to a
 * student. Past seven days it stops counting and gives the date, with the year
 * only when it is not the current one.
 */
export function relativeNoticeDate(
  iso: string | null | undefined,
  nowMs: number,
): string {
  const ms = Date.parse(iso ?? "");
  if (!Number.isFinite(ms)) return "";

  const diffMinutes = Math.floor((nowMs - ms) / 60_000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const hours = Math.floor(diffMinutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? "day" : "days"} ago`;

  const then = new Date(ms);
  return IST_YEAR.format(then) === IST_YEAR.format(new Date(nowMs))
    ? IST_DAY.format(then)
    : IST_DAY_YEAR.format(then);
}

/**
 * The role wordmark beside a byline.
 *
 * `author_role` is `cohort_room_members.role` for the author IN THIS ROOM, so
 * the only values `ann_host_insert` can produce are `host` and `mentor`. NULL
 * is the admin case (an admin passes `is_admin()` and holds no membership row),
 * and it reads TEAM rather than ADMIN: the student's relationship is with the
 * cohort's team, not with the platform's permission model.
 */
export function authorWordmark(role: string | null | undefined): string {
  if (role === "host") return "HOST";
  if (role === "mentor") return "MENTOR";
  return "TEAM";
}

/**
 * Pinned first, newest first inside each group.
 *
 * The RPC already returns this order, PER PAGE. Re-applying it client-side costs
 * one stable sort and is what keeps the board coherent once a second page is
 * concatenated onto the first, since page two's rows are older than page one's
 * but a pin on page two still belongs at the top.
 */
export function pinnedFirst(
  announcements: readonly RoomAnnouncementDetail[],
): RoomAnnouncementDetail[] {
  return [...announcements].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    return Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? "");
  });
}

/** What the amend controls call a notice when it has no title. */
function noticeLabel(notice: RoomAnnouncementDetail): string {
  const title = notice.title?.trim();
  if (title) return title;
  const body = notice.body.trim();
  return body.length > 40 ? `${body.slice(0, 40)}...` : body || "this notice";
}

/* ────────────────────────────────────────────────────────────────────────────
 * The card
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * The two verbs R0 left open to a mentor: unpin, and retract.
 *
 * Retraction asks first, and it asks INLINE rather than through `window.confirm`
 * — a native dialog blocks the WebView's main thread and looks like the browser
 * talking rather than the room. The confirm state is local to one card, so a
 * second card's controls are untouched by it.
 */
const NoticeControls = ({
  notice,
  disabled,
  onPin,
  onRetract,
}: {
  notice: RoomAnnouncementDetail;
  disabled: boolean;
  onPin: (next: boolean) => void;
  onRetract: () => void;
}) => {
  const [confirming, setConfirming] = useState(false);
  const label = noticeLabel(notice);

  if (confirming) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <p className="body-muted text-sm">
          Retract this notice? It leaves the board for everyone.
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={disabled}
            onClick={() => {
              setConfirming(false);
              onRetract();
            }}
          >
            Retract
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirming(false)}
          >
            Keep it
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-label={`${notice.is_pinned ? "Unpin" : "Pin"} ${label}`}
        onClick={() => onPin(!notice.is_pinned)}
      >
        {notice.is_pinned ? (
          <PinOff size={13} strokeWidth={1.5} className="mr-2" aria-hidden />
        ) : (
          <Pin size={13} strokeWidth={1.5} className="mr-2" aria-hidden />
        )}
        {notice.is_pinned ? "Unpin" : "Pin to top"}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        aria-label={`Retract ${label}`}
        onClick={() => setConfirming(true)}
      >
        <Undo2 size={13} strokeWidth={1.5} className="mr-2" aria-hidden />
        Retract
      </Button>
    </div>
  );
};

const NoticeCard = ({
  notice,
  nowMs,
  controls,
}: {
  notice: RoomAnnouncementDetail;
  nowMs: number;
  controls?: ReactNode;
}) => {
  const stamp = relativeNoticeDate(notice.created_at, nowMs);

  return (
    <article
      className={cn(
        "rounded-xl border border-border border-l-2 border-l-room-accent bg-surface p-4",
        notice.is_pinned && "bg-surface-2",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.24em] text-room-accent">
          {authorWordmark(notice.author_role)}
        </span>
        <span className="text-sm text-foreground">
          {notice.author_name ?? "The team"}
        </span>
        {notice.is_pinned && (
          <span className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground">
            <Pin size={11} strokeWidth={1.5} aria-hidden />
            Pinned
          </span>
        )}
        {stamp && (
          <time
            dateTime={notice.created_at}
            className="ml-auto font-mono text-[11px] text-muted-foreground"
          >
            {stamp}
          </time>
        )}
      </div>

      {/* `break-words` on BOTH free-text lines, matching every other room
          surface that renders text a human typed (RoomMasthead's h1,
          RosterGrid's name/city/occupation, MentorCard's two serif lines). A
          noticeboard is the likeliest place in the whole room to receive a
          pasted Zoom or Drive link, and a 60-character unbroken token would
          otherwise push the card sideways at 360px. */}
      {notice.title && (
        <h3 className="mt-2 break-words font-serif text-lg leading-snug text-foreground">
          {notice.title}
        </h3>
      )}
      {/* `whitespace-pre-line` preserves the author's line breaks: the body is a
          mentor's plain text, never markup, and it is rendered as text by React. */}
      <p className="body-muted mt-1 whitespace-pre-line break-words text-sm">{notice.body}</p>

      {controls}
    </article>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * The composer
 * ──────────────────────────────────────────────────────────────────────────── */

/** Matches the admin composer's ceilings so the two surfaces agree. */
const TITLE_MAX = 200;
const BODY_MAX = 2000;

const Composer = ({
  offeringId,
  batchId,
}: {
  offeringId: string;
  batchId: string | null;
}) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [isPinned, setIsPinned] = useState(false);

  const post = usePostRoomAnnouncement(offeringId, batchId);

  const reset = () => {
    setTitle("");
    setBody("");
    setIsPinned(false);
    setOpen(false);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!body.trim() || post.isPending) return;
    post.mutate({ title, body, isPinned }, { onSuccess: reset });
  };

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start"
        onClick={() => setOpen(true)}
      >
        <Megaphone size={14} strokeWidth={1.5} className="mr-2" aria-hidden />
        Post to the board
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label="Post an announcement"
      className="space-y-3 rounded-xl border border-border bg-surface p-4"
    >
      <div className="space-y-1">
        <label
          htmlFor="notice-title"
          className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
        >
          Title (optional)
        </label>
        <Input
          id="notice-title"
          value={title}
          maxLength={TITLE_MAX}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Session moved to Thursday"
        />
      </div>

      <div className="space-y-1">
        <label
          htmlFor="notice-body"
          className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
        >
          Notice
        </label>
        <Textarea
          id="notice-body"
          value={body}
          rows={4}
          maxLength={BODY_MAX}
          onChange={(event) => setBody(event.target.value)}
          placeholder="What does the cohort need to know?"
        />
      </div>

      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox
          checked={isPinned}
          onCheckedChange={(next) => setIsPinned(next === true)}
        />
        Pin this to the top of the board
      </label>

      {post.isError && (
        <p role="alert" className="text-sm text-destructive">
          That did not post. Please try again.
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={!body.trim() || post.isPending}>
          {post.isPending ? "Posting..." : "Post"}
        </Button>
        <Button type="button" variant="ghost" onClick={reset} disabled={post.isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
};

/* ────────────────────────────────────────────────────────────────────────────
 * The module
 * ──────────────────────────────────────────────────────────────────────────── */

const AnnouncementsModule = () => {
  const { room, envelope } = useRoomOutlet();
  const { profile } = useAuth();
  const nowMs = useRoomClock();

  const query = useRoomAnnouncements(room.offering_id);
  const notices = useMemo(() => pinnedFirst(query.notices), [query.notices]);
  const canPost = canPostAnnouncement(envelope.role, profile?.role === "admin");
  const amend = useAmendRoomAnnouncement(room.offering_id);

  // THE WATERMARK, and the reason it lives here rather than on `RoomHome`: it
  // claims the caller has seen the whole board, so it may only be written once
  // the board's rows are actually in hand. A failed or refused read writes
  // nothing and the unseen dot survives to the next open. `RoomHome` covers the
  // one case this component cannot: a cohort that runs no announcements module,
  // where nothing renders and there is nothing to be behind on.
  useRoomSeenWatermark(room.offering_id, { enabled: query.isSuccess });

  return (
    <section aria-labelledby="room-noticeboard" className="space-y-3">
      <h2
        id="room-noticeboard"
        className="font-mono text-[11px] uppercase tracking-[0.24em] text-muted-foreground"
      >
        <Megaphone size={12} strokeWidth={1.5} className="mr-2 inline align-[-1px]" aria-hidden />
        From the team
      </h2>

      {canPost && <Composer offeringId={room.offering_id} batchId={envelope.batch_id} />}

      {query.isPending ? (
        <div
          className="space-y-3 rounded-xl border border-border bg-surface p-4"
          role="status"
          aria-busy="true"
        >
          <span className="sr-only">Loading the noticeboard</span>
          <SkeletonLine width="40%" height="12px" />
          <SkeletonLine width="70%" height="18px" />
          <SkeletonLine width="90%" height="12px" />
        </div>
      ) : query.denied ? (
        // REFUSED is not EMPTY. The server said 42501, which for a room this
        // student reached means their membership moved under them. Telling them
        // the board is quiet would be a lie about the cohort.
        <p className="body-muted text-sm">This board is not open to you.</p>
      ) : notices.length > 0 ? (
        <div className="space-y-3">
          {notices.map((notice) => (
            <NoticeCard
              key={notice.id}
              notice={notice}
              nowMs={nowMs}
              controls={
                canPost ? (
                  <NoticeControls
                    notice={notice}
                    disabled={amend.isPending}
                    onPin={(next) =>
                      amend.mutate({ id: notice.id, action: "pin", isPinned: next })
                    }
                    onRetract={() => amend.mutate({ id: notice.id, action: "retract" })}
                  />
                ) : undefined
              }
            />
          ))}

          {amend.isError && (
            <p role="alert" className="text-sm text-destructive">
              That change did not save. Please try again.
            </p>
          )}

          {/* The board pages. Without this control the read's `p_offset` would
              be dead and the fortieth notice would be the last one a cohort
              ever saw. */}
          {query.hasNextPage && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              disabled={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {query.isFetchingNextPage ? "Loading..." : "Show older notices"}
            </Button>
          )}
        </div>
      ) : query.isError ? (
        // A dropped request is not an empty board. Saying "nothing here" when
        // the network failed is a lie about the room, so the two are separated
        // exactly as `RoomView` separates `error` from `unavailable`.
        <p className="body-muted text-sm">
          The board did not load.{" "}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="text-room-accent underline-offset-4 hover:underline"
          >
            Try again
          </button>
        </p>
      ) : (
        <p className="font-serif text-lg text-muted-foreground">Nothing on the board yet.</p>
      )}
    </section>
  );
};

export default AnnouncementsModule;
