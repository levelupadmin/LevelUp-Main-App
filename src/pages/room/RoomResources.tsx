import { useEffect, useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  BookOpen,
  ExternalLink,
  FileText,
  Link,
  PlayCircle,
} from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ErrorState, SkeletonLine } from "@/components/patterns";
import {
  isLobbyEnvelope,
  useRoomOutlet,
  useRoomResources,
  type RoomResource,
} from "@/hooks/useCohortRooms";
import { moduleEnabled } from "@/lib/room";
import {
  groupRoomResources,
  roomResourceDomain,
  safeRoomResourceUrl,
} from "@/lib/roomResources";

const kindIcon = (kind: RoomResource["kind"]) => {
  if (kind === "video") return PlayCircle;
  if (kind === "file") return FileText;
  return Link;
};

const ModuleOff = () => (
  <p className="body-muted py-10 text-center text-sm">
    This cohort doesn&apos;t use resources.{" "}
    <RouterLink
      to=".."
      className="text-room-accent underline-offset-4 hover:underline"
    >
      Back to the room
    </RouterLink>
  </p>
);

const ResourceRow = ({ resource }: { resource: RoomResource }) => {
  const Icon = kindIcon(resource.kind);
  const href = safeRoomResourceUrl(resource.url);
  const body = (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-room-accent/20 bg-room-accent/[0.06] text-room-accent">
        <Icon size={17} strokeWidth={1.5} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block break-words text-sm font-medium text-foreground">
          {resource.title}
        </span>
        <span className="mt-0.5 block break-words font-mono text-xs leading-relaxed tracking-normal text-muted-foreground">
          {roomResourceDomain(resource.url)} ·{" "}
          {resource.batch_name ?? "All batches"} · {resource.kind} · added by{" "}
          {resource.added_by_name}
        </span>
      </span>
      {href && (
        <ExternalLink
          size={15}
          strokeWidth={1.5}
          className="shrink-0 text-muted-foreground"
          aria-hidden
        />
      )}
    </>
  );

  return href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="focus-ring flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 transition-colors hover:border-room-accent/35"
    >
      {body}
    </a>
  ) : (
    <div className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3 opacity-70">
      {body}
    </div>
  );
};

const RoomResources = () => {
  const { room, envelope } = useRoomOutlet();
  const moduleOn = moduleEnabled(envelope.config, "resources");
  const lobby = isLobbyEnvelope(envelope);
  const offeringWide = envelope.batch_id === null;
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    envelope.batch_id,
  );
  const [stateOfferingId, setStateOfferingId] = useState(room.offering_id);
  const activeBatchId =
    stateOfferingId === room.offering_id
      ? selectedBatchId
      : envelope.batch_id;

  // A slug-only navigation can reuse this component. Reset a staff batch
  // filter, while `activeBatchId` also protects the render before this effect.
  useEffect(() => {
    setSelectedBatchId(envelope.batch_id);
    setStateOfferingId(room.offering_id);
  }, [envelope.batch_id, room.offering_id]);

  const query = useRoomResources(room.offering_id, {
    batchId: activeBatchId,
    enabled: moduleOn && !lobby,
  });
  const groups = useMemo(
    () => groupRoomResources(query.data?.resources ?? []),
    [query.data],
  );

  if (!moduleOn) return <ModuleOff />;
  if (lobby) {
    return (
      <p className="body-muted py-10 text-center text-sm">
        The resource binder opens when your enrolment is complete.
      </p>
    );
  }

  return (
    <section aria-labelledby="room-module-resources" className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-room-accent">
            Reference binder
          </p>
          <h2
            id="room-module-resources"
            className="mt-1 font-serif text-3xl text-cream"
          >
            Resources
          </h2>
          <p className="body-muted mt-1 text-sm">
            The files, links and recordings worth keeping close.
          </p>
        </div>

        {offeringWide && (query.data?.batches.length ?? 0) > 0 && (
          <div className="w-full sm:w-60">
            <label
              htmlFor="room-resources-batch"
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
              <SelectTrigger id="room-resources-batch" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All batches</SelectItem>
                {query.data?.batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {query.denied ? (
        <p className="body-muted py-10 text-center text-sm">
          Your access to this room&apos;s resources has ended.
        </p>
      ) : query.isPending ? (
        <div className="space-y-3" role="status" aria-busy="true">
          <span className="sr-only">Loading resources</span>
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="space-y-2 rounded-xl border border-border bg-surface p-4"
            >
              <SkeletonLine width="35%" height="12px" />
              <SkeletonLine width="75%" height="16px" />
            </div>
          ))}
        </div>
      ) : query.isError ? (
        <ErrorState
          title="The binder didn't load"
          description="Check your connection and try again."
          onRetry={() => void query.refetch()}
        />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<BookOpen size={22} strokeWidth={1.5} />}
          title="The binder is ready for its first entry."
          description="Your cohort team will collect the useful material here."
        />
      ) : (
        <div className="space-y-5">
          {query.data?.truncated && (
            <p className="rounded-lg border border-room-accent/20 bg-room-accent/[0.06] p-3 text-sm text-foreground">
              This binder has more than 500 entries. Choose a batch to narrow
              the view.
            </p>
          )}
          {groups.map((group) => (
            <section
              key={group.key}
              aria-labelledby={`resource-group-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
            >
              <h3
                id={`resource-group-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`}
                className="mb-2 font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground"
              >
                {group.label}
              </h3>
              <div className="space-y-2">
                {group.resources.map((resource) => (
                  <ResourceRow key={resource.id} resource={resource} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
};

export default RoomResources;
