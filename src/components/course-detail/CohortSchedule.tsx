import { Calendar, Clock } from "lucide-react";
import { format, differenceInCalendarDays } from "date-fns";

interface CohortSession {
  title: string;
  starts_at: string;
  duration_min?: number | null;
}

interface Props {
  sessions?: CohortSession[] | null;
}

const inDaysLabel = (startsAt: string): string => {
  const days = differenceInCalendarDays(new Date(startsAt), new Date());
  if (days < 0) return "past";
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
};

const CohortSchedule = ({ sessions }: Props) => {
  if (!sessions || sessions.length === 0) return null;

  return (
    <section>
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-4">
        Cohort schedule
      </p>
      <div className="space-y-2">
        {sessions.map((s, i) => {
          const d = new Date(s.starts_at);
          return (
            <div
              key={i}
              className="bg-surface border border-border rounded-lg p-4 flex items-center gap-4"
            >
              <div className="flex-shrink-0 text-center bg-surface-2 rounded-md px-3 py-2 min-w-[56px]">
                <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                  {format(d, "MMM")}
                </p>
                <p className="text-lg font-semibold leading-tight">{format(d, "d")}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{s.title}</p>
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <Calendar className="h-3 w-3" />
                  {format(d, "EEE, h:mm a")} IST
                  {s.duration_min ? (
                    <>
                      <span className="text-border">·</span>
                      <Clock className="h-3 w-3" />
                      {s.duration_min} min
                    </>
                  ) : null}
                </p>
              </div>
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground flex-shrink-0">
                {inDaysLabel(s.starts_at)}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default CohortSchedule;
