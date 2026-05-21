import { Users, Calendar } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

interface Props {
  seatsLeft?: number | null;
  batchStartsAt?: string | null;
}

const UrgencyStrip = ({ seatsLeft, batchStartsAt }: Props) => {
  const hasSeats = seatsLeft !== null && seatsLeft !== undefined && seatsLeft > 0;
  const hasDate = !!batchStartsAt;
  if (!hasSeats && !hasDate) return null;

  let dateLabel: string | null = null;
  if (hasDate) {
    const d = new Date(batchStartsAt!);
    const days = differenceInCalendarDays(d, new Date());
    if (days < 0) {
      dateLabel = null; // Batch already started — don't show stale urgency
    } else if (days === 0) {
      dateLabel = "Batch starts today";
    } else if (days === 1) {
      dateLabel = "Batch starts tomorrow";
    } else {
      dateLabel = `Batch starts ${format(d, "MMM d")}`;
    }
  }

  const pieces: { icon: typeof Users; label: string; urgent: boolean }[] = [];
  if (hasSeats) {
    pieces.push({
      icon: Users,
      label: `${seatsLeft} seat${seatsLeft === 1 ? "" : "s"} left`,
      urgent: (seatsLeft ?? 0) <= 5,
    });
  }
  if (dateLabel) {
    pieces.push({ icon: Calendar, label: dateLabel, urgent: false });
  }

  if (pieces.length === 0) return null;

  return (
    <div className="bg-[hsl(var(--accent-amber)/0.1)] border border-[hsl(var(--accent-amber)/0.3)] rounded-xl p-4 flex flex-wrap items-center gap-x-5 gap-y-2">
      {pieces.map((p, i) => (
        <span
          key={i}
          className={`inline-flex items-center gap-2 text-sm font-medium ${
            p.urgent ? "text-[hsl(var(--accent-amber))]" : "text-foreground"
          }`}
        >
          <p.icon className="h-4 w-4" />
          {p.label}
        </span>
      ))}
    </div>
  );
};

export default UrgencyStrip;
