import { CalendarDays, Clock, Users } from "lucide-react";

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

interface Chip {
  icon: typeof CalendarDays;
  label: string;
  value: string;
}

/**
 * Cohort fact chips for application-only (tally_form_url) offerings,
 * sits beside the "Application-only" pill so a prospect sees the start
 * date, application deadline, and seat count at a glance.
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
  const seats =
    typeof seatsTotal === "number" && seatsTotal > 0 ? seatsTotal : null;

  const chips: Chip[] = [];
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
            className="inline-flex items-center gap-2 rounded-full border border-border bg-[hsl(var(--surface))] px-3 py-1.5 text-xs text-foreground"
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
