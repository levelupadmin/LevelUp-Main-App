import { useEffect, useState } from "react";
import { CalendarDays, Clock, Hourglass, Users } from "lucide-react";

interface CohortInfoBlockProps {
  /** ISO date string for when the live cohort kicks off. */
  cohortStartDate?: string | null;
  /** ISO date string for the application cutoff. */
  applicationDeadline?: string | null;
  /** Total seats in the cohort. */
  seatsTotal?: number | null;
}

/** Format an ISO date into a short, India-locale, day-month-year chip label. */
function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/**
 * Live "closes in" label for the application deadline, at days/hours
 * granularity only. Deliberately no second-ticking timer: a once-a-minute
 * refresh is all the precision a days-out deadline needs, and it avoids
 * the bargain-bin urgency aesthetic. Returns null when the deadline is
 * absent, unparseable, or already past (the "Apply by" chip still shows
 * the date in that case).
 */
function useDeadlineCountdown(deadline: string | null | undefined): string | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [deadline]);
  if (!deadline) return null;
  const target = new Date(deadline).getTime();
  if (Number.isNaN(target)) return null;
  const diff = target - now;
  if (diff <= 0) return null;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h`;
  return "under 1h";
}

interface Chip {
  icon: typeof CalendarDays;
  label: string;
  value: string;
  /** Highlighted styling for the time-sensitive countdown chip. */
  accent?: boolean;
}

/**
 * Cohort fact chips for application-only (tally_form_url) offerings,
 * rendered above the Apply CTA so a prospect sees the live deadline
 * countdown, start date, application cutoff, and seat count before the
 * ask. Seats reflect the real seats_total field only, never an invented
 * "N left" number.
 *
 * Every field is optional: each chip is omitted when its source value is
 * null/blank, and the whole block renders nothing if no chip survives, so
 * a partially-filled offering never shows an empty or "null" chip.
 */
export default function CohortInfoBlock({
  cohortStartDate,
  applicationDeadline,
  seatsTotal,
}: CohortInfoBlockProps) {
  const start = formatDate(cohortStartDate);
  const deadline = formatDate(applicationDeadline);
  const countdown = useDeadlineCountdown(applicationDeadline);
  const seats =
    typeof seatsTotal === "number" && seatsTotal > 0 ? seatsTotal : null;

  const chips: Chip[] = [];
  if (countdown)
    chips.push({
      icon: Hourglass,
      label: "Closes in",
      value: countdown,
      accent: true,
    });
  if (start) chips.push({ icon: CalendarDays, label: "Starts", value: start });
  if (deadline) chips.push({ icon: Clock, label: "Apply by", value: deadline });
  if (seats)
    chips.push({
      icon: Users,
      label: "Seats",
      value: `${seats} per cohort`,
    });

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => {
        const Icon = chip.icon;
        return (
          <span
            key={chip.label}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs text-foreground ${
              chip.accent
                ? "border-[hsl(var(--cream))]/40 bg-[hsl(var(--cream))]/10"
                : "border-border bg-[hsl(var(--surface))]"
            }`}
          >
            <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[hsl(var(--cream))]" />
            <span className="font-mono uppercase tracking-[0.12em] text-muted-foreground">
              {chip.label}
            </span>
            <span className="font-medium text-foreground">{chip.value}</span>
          </span>
        );
      })}
    </div>
  );
}
