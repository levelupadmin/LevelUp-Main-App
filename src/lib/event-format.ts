import { format } from "date-fns";

export const eventDateTimeLabel = (startsAt: string | Date): string => {
  const d = typeof startsAt === "string" ? new Date(startsAt) : startsAt;
  return `${format(d, "EEE, MMM d")} · ${format(d, "h:mm a")} IST`;
};

export const eventDurationLabel = (durationMinutes: number | null | undefined): string | null => {
  if (!durationMinutes || durationMinutes <= 0) return null;
  if (durationMinutes < 60) return `${durationMinutes} min`;
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h ${mins}m`;
};
