import type { RoomResource } from "@/hooks/useCohortRooms";

export interface RoomResourceGroup {
  key: string;
  label: string;
  resources: RoomResource[];
  pinned: boolean;
}

export function safeRoomResourceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

export function roomResourceDomain(value: string): string {
  const safe = safeRoomResourceUrl(value);
  if (!safe) return "Link unavailable";
  return new URL(safe).hostname.replace(/^www\./, "");
}

export function groupRoomResources(
  resources: readonly RoomResource[],
): RoomResourceGroup[] {
  const map = new Map<string, RoomResourceGroup>();
  for (const resource of resources) {
    const pinned = resource.cohort_week_id === null;
    const key = pinned
      ? "pinned"
      : `${resource.batch_id ?? "all"}:${resource.cohort_week_id}`;
    const fallbackWeek =
      resource.week_number === null
        ? "Week resources"
        : `Week ${resource.week_number}`;
    const weekLabel = resource.week_theme
      ? `${fallbackWeek}: ${resource.week_theme}`
      : fallbackWeek;
    const batchPrefix = resource.batch_name ? `${resource.batch_name} · ` : "";
    const current = map.get(key) ?? {
      key,
      label: pinned ? "Pinned for the cohort" : `${batchPrefix}${weekLabel}`,
      resources: [],
      pinned,
    };
    current.resources.push(resource);
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    const aWeek = a.resources[0]?.week_number ?? Number.MAX_SAFE_INTEGER;
    const bWeek = b.resources[0]?.week_number ?? Number.MAX_SAFE_INTEGER;
    if (aWeek !== bWeek) return aWeek - bWeek;
    return a.label.localeCompare(b.label);
  });
}
