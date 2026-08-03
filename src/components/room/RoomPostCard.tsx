import { useMemo, useState, type FormEvent } from "react";
import { CircleHelp, MessageCircle, Send, Sparkles } from "lucide-react";

import InitialsAvatar from "@/components/InitialsAvatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  useReplyToRoomPost,
  type RoomFeedPost,
  type RoomFeedReply,
} from "@/hooks/useCohortRooms";
import { cn } from "@/lib/utils";
import { useRoomClock } from "./RoomClockProvider";

const IST_DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  timeZone: "Asia/Kolkata",
});

function relativeRoomDate(
  iso: string | null | undefined,
  nowMs: number,
): string {
  const then = Date.parse(iso ?? "");
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor((nowMs - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} ago`;
  const days = Math.floor(hours / 24);
  return days < 7
    ? `${days} ${days === 1 ? "day" : "days"} ago`
    : IST_DAY.format(new Date(then));
}

function roomRoleWordmark(role: string | null | undefined): string | null {
  if (role === "host") return "HOST";
  if (role === "mentor") return "MENTOR";
  return null;
}

const ReplyRow = ({
  reply,
  pending = false,
}: {
  reply: RoomFeedReply;
  pending?: boolean;
}) => (
  <li
    className={cn(
      "flex gap-3 rounded-lg border p-3",
      reply.is_mentor_answer
        ? "border-room-accent/30 bg-room-accent/[0.06]"
        : "border-border bg-canvas/30",
      pending && "opacity-60",
    )}
  >
    <InitialsAvatar
      name={reply.author_name}
      photoUrl={reply.author_avatar_url}
      size={28}
    />
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-medium text-foreground">
          {reply.author_name}
        </span>
        {reply.is_mentor_answer && (
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-room-accent">
            Mentor answer
          </span>
        )}
        {pending && <span className="body-muted text-xs">Sending...</span>}
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/90">
        {reply.body}
      </p>
    </div>
  </li>
);

interface RoomPostCardProps {
  post: RoomFeedPost;
  offeringId: string;
  optimistic?: boolean;
}

const RoomPostCard = ({
  post,
  offeringId,
  optimistic = false,
}: RoomPostCardProps) => {
  const { user, profile } = useAuth();
  const nowMs = useRoomClock();
  const replyMutation = useReplyToRoomPost(offeringId);
  const [replyBody, setReplyBody] = useState("");
  const [replying, setReplying] = useState(false);
  const [pendingReplies, setPendingReplies] = useState<RoomFeedReply[]>([]);
  const [replyError, setReplyError] = useState<string | null>(null);

  const wordmark = roomRoleWordmark(post.author_role);
  const stamp = relativeRoomDate(post.created_at, nowMs);
  const replies = useMemo(
    () => [...post.replies, ...pendingReplies],
    [post.replies, pendingReplies],
  );

  const submitReply = async (event: FormEvent) => {
    event.preventDefault();
    const body = replyBody.trim();
    if (!body || replyMutation.isPending || optimistic) return;

    const tempId = `pending-${Date.now()}`;
    const temp: RoomFeedReply = {
      id: tempId,
      author_id: user?.id ?? "pending",
      author_name: profile?.full_name ?? "You",
      author_avatar_url: profile?.avatar_url ?? null,
      body,
      // The server stamps mentor authority from the caller's room role. Keep a
      // pending reply neutral until the authoritative row comes back.
      is_mentor_answer: false,
      created_at: new Date().toISOString(),
    };

    setPendingReplies((current) => [...current, temp]);
    setReplyBody("");
    setReplyError(null);
    try {
      await replyMutation.mutateAsync({ postId: post.id, body });
      setPendingReplies((current) =>
        current.filter((reply) => reply.id !== tempId),
      );
      setReplying(false);
    } catch {
      setPendingReplies((current) =>
        current.filter((reply) => reply.id !== tempId),
      );
      setReplyBody(body);
      setReplyError("That reply did not send. Your words are back in the box.");
    }
  };

  return (
    <article
      className={cn(
        "rounded-xl border bg-surface p-4 sm:p-5",
        post.kind === "win" ? "border-room-accent/35" : "border-border",
        optimistic && "opacity-70",
      )}
      data-testid="room-post"
    >
      <header className="flex gap-3">
        <InitialsAvatar
          name={post.author_name}
          photoUrl={post.author_avatar_url}
          size={36}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-medium text-foreground">
              {post.author_name}
            </span>
            {wordmark && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-room-accent">
                {wordmark}
              </span>
            )}
            {post.kind === "question" && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <CircleHelp size={11} aria-hidden /> Question
              </span>
            )}
            {post.kind === "win" && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.18em] text-room-accent">
                <Sparkles size={11} aria-hidden /> Win
              </span>
            )}
            {optimistic && (
              <span className="body-muted text-xs">Posting...</span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            {post.week_number && <span>Week {post.week_number}</span>}
            <span>{post.batch_name}</span>
            {stamp && <time dateTime={post.created_at}>{stamp}</time>}
          </div>
        </div>
      </header>

      <p className="mt-4 whitespace-pre-wrap break-words text-[15px] leading-7 text-foreground">
        {post.body}
      </p>

      {!optimistic && (
        <div className="mt-4 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setReplying((value) => !value)}
            className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-muted-foreground hover:text-foreground"
            aria-expanded={replying}
          >
            <MessageCircle size={14} strokeWidth={1.5} aria-hidden />
            {post.reply_count + pendingReplies.length === 0
              ? "Reply"
              : `${post.reply_count + pendingReplies.length} ${post.reply_count + pendingReplies.length === 1 ? "reply" : "replies"}`}
          </button>

          {replies.length > 0 && (
            <ul className="mt-2 space-y-2">
              {replies.map((reply) => (
                <ReplyRow
                  key={reply.id}
                  reply={reply}
                  pending={reply.id.startsWith("pending-")}
                />
              ))}
            </ul>
          )}
          {post.replies_truncated && (
            <p className="body-muted mt-2 text-xs">
              Earlier replies are not shown in this view.
            </p>
          )}

          {replying && (
            <form
              onSubmit={submitReply}
              className="mt-3 rounded-lg border border-border bg-canvas/30 p-3"
            >
              <Textarea
                value={replyBody}
                onChange={(event) => setReplyBody(event.target.value)}
                rows={2}
                maxLength={10_000}
                disabled={replyMutation.isPending}
                placeholder="Add a reply"
                aria-label={`Reply to ${post.author_name}`}
                className="min-h-[72px] resize-y"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={!replyBody.trim() || replyMutation.isPending}
                  className="min-h-11 bg-cream text-cream-text hover:bg-cream/90"
                >
                  <Send size={13} className="mr-2" aria-hidden />
                  {replyMutation.isPending ? "Sending..." : "Reply"}
                </Button>
              </div>
              {replyError && (
                <p className="mt-2 text-sm text-destructive" role="alert">
                  {replyError}
                </p>
              )}
            </form>
          )}
        </div>
      )}
    </article>
  );
};

export default RoomPostCard;
