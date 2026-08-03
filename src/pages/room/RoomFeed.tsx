import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Hash, Megaphone, MessagesSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, SkeletonLine } from "@/components/patterns";
import RoomComposer from "@/components/room/RoomComposer";
import RoomPostCard from "@/components/room/RoomPostCard";
import { useAuth } from "@/contexts/AuthContext";
import {
  isLobbyEnvelope,
  usePostRoomPost,
  useRoomFeed,
  useRoomOutlet,
  type RoomFeedBatch,
  type RoomFeedPost,
  type RoomPostDraft,
} from "@/hooks/useCohortRooms";
import { moduleEnabled } from "@/lib/room";
import {
  composerChannel,
  feedChannels,
  roomChannelLabel,
} from "@/lib/roomFeed";
import { cn } from "@/lib/utils";

function defaultWeekId(batch: RoomFeedBatch | undefined): string | null {
  if (!batch) return null;
  // "This week" is a server-authored status, not a client guess based on the
  // nearest numbered week. If no week is active, keep the composer closed.
  return batch.weeks.find((week) => week.status === "active")?.id ?? null;
}

const ModuleOff = () => (
  <p className="body-muted py-10 text-center text-sm">
    This cohort doesn&apos;t use the feed.{" "}
    <Link
      to=".."
      className="text-room-accent underline-offset-4 hover:underline"
    >
      Back to the room
    </Link>
  </p>
);

const FeedSkeleton = () => (
  <div className="space-y-3" role="status" aria-busy="true">
    <span className="sr-only">Loading room feed</span>
    {[0, 1, 2].map((key) => (
      <div
        key={key}
        className="space-y-3 rounded-xl border border-border bg-surface p-5"
      >
        <SkeletonLine width="32%" height="12px" />
        <SkeletonLine width="90%" height="16px" />
        <SkeletonLine width="65%" height="16px" />
      </div>
    ))}
  </div>
);

const RoomFeed = () => {
  const { room, envelope } = useRoomOutlet();
  const { user, profile } = useAuth();
  const moduleOn = moduleEnabled(envelope.config, "feed");
  const lobby = isLobbyEnvelope(envelope);
  const offeringWide = envelope.batch_id === null;
  const [channel, setChannel] = useState("all");
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    envelope.batch_id,
  );
  const [optimisticPosts, setOptimisticPosts] = useState<RoomFeedPost[]>([]);
  const [stateOfferingId, setStateOfferingId] = useState(room.offering_id);

  // Effects run after render. Derive a safe view for the first render after a
  // slug-only navigation too, so the previous room's batch/channel never even
  // reaches the next offering's RPC and its pending cards cannot flash there.
  const stateIsForThisRoom = stateOfferingId === room.offering_id;
  const activeBatchId = stateIsForThisRoom
    ? selectedBatchId
    : envelope.batch_id;
  const activeChannel = stateIsForThisRoom ? channel : "all";
  const visibleOptimisticPosts = stateIsForThisRoom ? optimisticPosts : [];

  // React Router may preserve this route component while only `:slug` changes.
  // Never carry an all-batch staff view, a niche channel, or a pending visual
  // post from one cohort room into the next one.
  useEffect(() => {
    setSelectedBatchId(envelope.batch_id);
    setChannel("all");
    setOptimisticPosts([]);
    setStateOfferingId(room.offering_id);
  }, [envelope.batch_id, room.offering_id]);

  const feed = useRoomFeed(room.offering_id, {
    channel: activeChannel,
    batchId: activeBatchId,
    enabled: moduleOn && !lobby,
  });
  const postMutation = usePostRoomPost(room.offering_id);

  const channels = useMemo(
    () => feedChannels(feed.batches, activeBatchId),
    [activeBatchId, feed.batches],
  );
  const selectedBatch = feed.batches.find(
    (batch) => batch.id === activeBatchId,
  );
  const channelLabels = selectedBatch?.channel_labels ?? {};
  const weekId = activeChannel === "this_week" ? defaultWeekId(selectedBatch) : null;

  useEffect(() => {
    if (!channels.includes(activeChannel)) setChannel("all");
  }, [activeChannel, channels]);

  const submitPost = async (draft: RoomPostDraft) => {
    const tempId = `pending-${Date.now()}`;
    const temp: RoomFeedPost = {
      id: tempId,
      offering_id: room.offering_id,
      batch_id: draft.batchId ?? "",
      batch_name: selectedBatch?.name ?? "Cohort",
      author_id: user?.id ?? "pending",
      author_name: profile?.full_name ?? "You",
      author_avatar_url: profile?.avatar_url ?? null,
      author_role: envelope.role,
      kind: draft.kind,
      body: draft.body,
      media: [],
      channel_key: draft.channelKey,
      cohort_week_id: draft.cohortWeekId,
      week_number:
        selectedBatch?.weeks.find((week) => week.id === draft.cohortWeekId)
          ?.week_number ?? null,
      reply_count: 0,
      last_activity_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      replies: [],
      replies_truncated: false,
    };
    setOptimisticPosts((current) => [temp, ...current]);
    try {
      await postMutation.mutateAsync(draft);
    } finally {
      setOptimisticPosts((current) =>
        current.filter((post) => post.id !== tempId),
      );
    }
  };

  if (!moduleOn) return <ModuleOff />;

  if (lobby) {
    return (
      <p className="body-muted py-10 text-center text-sm">
        The room feed opens when your enrolment is complete.
      </p>
    );
  }

  const disabledReason =
    offeringWide && !activeBatchId
      ? "Choose a batch before posting."
      : activeChannel === "this_week" && !weekId
        ? "This batch does not have a current week yet."
        : null;

  return (
    <section aria-labelledby="room-module-feed" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-room-accent">
            Working register
          </p>
          <h2
            id="room-module-feed"
            className="mt-1 font-serif text-3xl text-cream"
          >
            The room feed
          </h2>
          <p className="body-muted mt-1 text-sm">
            Questions, progress and useful discoveries, in your own time.
          </p>
        </div>

        {offeringWide && feed.batches.length > 0 && (
          <div className="w-full sm:w-60">
            <label
              htmlFor="room-feed-batch"
              className="mb-1 block font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground"
            >
              Batch view
            </label>
            <Select
              value={activeBatchId ?? "all"}
              onValueChange={(value) =>
                setSelectedBatchId(value === "all" ? null : value)
              }
            >
              <SelectTrigger id="room-feed-batch" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All batches</SelectItem>
                {feed.batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <nav
        aria-label="Feed channels"
        className="-mx-4 flex scroll-px-4 gap-2 overflow-x-auto overscroll-x-contain px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0"
      >
        {channels.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setChannel(item)}
            aria-pressed={activeChannel === item}
            className={cn(
              "focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors",
              activeChannel === item
                ? "border-room-accent/40 bg-room-accent/10 text-room-accent"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <Hash size={12} aria-hidden />
            {roomChannelLabel(item, channelLabels[item])}
          </button>
        ))}
        <Link
          to="../#room-noticeboard"
          className="focus-ring inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border px-4 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <Megaphone size={12} aria-hidden /> Announcements
        </Link>
      </nav>

      <RoomComposer
        channelKey={composerChannel(activeChannel)}
        batchId={activeBatchId}
        cohortWeekId={weekId}
        forcedKind={activeChannel === "wins" ? "win" : null}
        disabledReason={disabledReason}
        onSubmit={submitPost}
      />

      {feed.denied ? (
        <p className="body-muted py-10 text-center text-sm">
          Your access to this room&apos;s feed has ended.
        </p>
      ) : feed.isPending ? (
        <FeedSkeleton />
      ) : feed.isError ? (
        <ErrorState
          title="The feed didn't load"
          description="Check your connection and try again."
          onRetry={() => void feed.refetch()}
        />
      ) : visibleOptimisticPosts.length + feed.posts.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare size={22} strokeWidth={1.5} />}
          title={
            activeChannel === "wins"
              ? "The first win is waiting to be named."
              : "The room is quiet for now."
          }
          description="Start the thread when you have something to ask, share or celebrate."
        />
      ) : (
        <div className="space-y-3">
          {visibleOptimisticPosts.map((post) => (
            <RoomPostCard
              key={post.id}
              post={post}
              offeringId={room.offering_id}
              optimistic
            />
          ))}
          {feed.posts.map((post) => (
            <RoomPostCard
              key={post.id}
              post={post}
              offeringId={room.offering_id}
            />
          ))}

          {feed.hasNextPage ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-full"
                disabled={feed.isFetchingNextPage}
                onClick={() => void feed.fetchNextPage()}
              >
                {feed.isFetchingNextPage ? "Loading..." : "Earlier"}
              </Button>
            </div>
          ) : (
            <p className="py-4 text-center font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              You&apos;re all caught up.
            </p>
          )}
        </div>
      )}
    </section>
  );
};

export default RoomFeed;
