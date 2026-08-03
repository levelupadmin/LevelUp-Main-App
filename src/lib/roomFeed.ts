import type { RoomFeedBatch } from "@/hooks/useCohortRooms";

const STANDING_CHANNELS = ["this_week", "assignments_help", "general"] as const;

export function roomChannelLabel(
  channel: string,
  configuredLabel?: string,
): string {
  if (channel === "all") return "All";
  if (channel === "this_week") return "This week";
  if (channel === "assignments_help") return "Assignments help";
  if (channel === "wins") return "Wins";
  if (configuredLabel?.trim()) return configuredLabel.trim();
  return channel
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function feedChannels(
  batches: readonly RoomFeedBatch[],
  selectedBatchId: string | null,
): string[] {
  const selected = selectedBatchId
    ? batches.find((batch) => batch.id === selectedBatchId)
    : null;
  const allowed =
    selected?.channels ?? batches.flatMap((batch) => batch.channels);
  return [
    "all",
    ...STANDING_CHANNELS.filter((channel) => allowed.includes(channel)),
    "wins",
    ...allowed.filter(
      (channel) =>
        !STANDING_CHANNELS.includes(
          channel as (typeof STANDING_CHANNELS)[number],
        ),
    ),
  ].filter((channel, index, all) => all.indexOf(channel) === index);
}

export function composerChannel(channel: string): string {
  return channel === "all" || channel === "wins" ? "general" : channel;
}
