import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { TrendingUp, TrendingDown, Minus, Flame } from "lucide-react";
import { CountUp } from "@/components/motion/CountUp";

interface WeeklyStatsProps {
  userId: string;
}

interface DayBucket {
  label: string; // single-letter weekday
  minutes: number;
  isToday: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * "This week" card: minutes-watched bars for the last 7 days, with a
 * week-over-week delta vs the prior 7 days. Watch-time is derived from
 * chapter_progress: each row that advanced this period contributes its
 * last_position_seconds (a lower-bound proxy for time spent, since we don't
 * log per-session deltas). We attribute a row's whole position to the day it
 * was last touched (updated_at). It's an estimate, framed as one in the UI.
 */
export const WeeklyStats = ({ userId }: WeeklyStatsProps) => {
  const [rows, setRows] = useState<{ updated_at: string; last_position_seconds: number | null }[]>(
    []
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      // Look back 14 days so we can compare this week vs the prior week.
      const since = new Date(Date.now() - 14 * DAY_MS).toISOString();
      const { data } = await supabase
        .from("chapter_progress")
        .select("updated_at, last_position_seconds")
        .eq("user_id", userId)
        .gte("updated_at", since);
      if (cancelled) return;
      setRows(
        (data ?? []).map((r) => ({
          updated_at: r.updated_at,
          last_position_seconds: r.last_position_seconds,
        }))
      );
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const { days, thisWeekMin, lastWeekMin, deltaPct } = useMemo(() => {
    // Midnight at the start of today, local time.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayMs = startOfToday.getTime();

    const buckets: DayBucket[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayMs - i * DAY_MS;
      const d = new Date(dayStart);
      buckets.push({
        label: WEEKDAY[d.getDay()],
        minutes: 0,
        isToday: i === 0,
      });
    }

    let thisWeek = 0;
    let lastWeek = 0;
    const thisWeekStart = todayMs - 6 * DAY_MS;
    const lastWeekStart = todayMs - 13 * DAY_MS;

    for (const r of rows) {
      const min = Math.round((r.last_position_seconds ?? 0) / 60);
      if (min <= 0) continue;
      const t = new Date(r.updated_at).getTime();
      if (Number.isNaN(t)) continue;

      if (t >= thisWeekStart) {
        thisWeek += min;
        const dayIndex = Math.floor((t - thisWeekStart) / DAY_MS);
        if (dayIndex >= 0 && dayIndex < 7) buckets[dayIndex].minutes += min;
      } else if (t >= lastWeekStart) {
        lastWeek += min;
      }
    }

    const delta =
      lastWeek > 0
        ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100)
        : thisWeek > 0
          ? 100
          : 0;

    return { days: buckets, thisWeekMin: thisWeek, lastWeekMin: lastWeek, deltaPct: delta };
  }, [rows]);

  const maxMinutes = Math.max(1, ...days.map((d) => d.minutes));
  const hasData = thisWeekMin > 0 || lastWeekMin > 0;

  if (loading) {
    // Skeleton parity: this placeholder mirrors the RESOLVED card's dimensions
    // slot-for-slot — header (label + value), the h-24 bar row, and the footer
    // line — so the real card settles into the same footprint with no layout
    // shift (the P4-T5 CLS budget). Kept identical outer shell (rounded-2xl
    // border p-5) as the resolved return below.
    return (
      <div className="rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="space-y-1">
            <div className="skeleton-shimmer h-4 w-16 rounded" />
            <div className="skeleton-shimmer h-7 w-24 rounded" />
          </div>
          <div className="skeleton-shimmer h-6 w-28 rounded-full" />
        </div>
        <div className="flex items-end gap-2 h-24">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 skeleton-shimmer rounded-md" style={{ height: `${30 + (i % 4) * 18}%` }} />
          ))}
        </div>
        <div className="skeleton-shimmer h-4 w-44 rounded mt-3" />
      </div>
    );
  }

  // Nothing watched in the last two weeks, keep the dashboard clean.
  if (!hasData) return null;

  const trendUp = deltaPct > 0;
  const trendFlat = deltaPct === 0;

  return (
    <div className="rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
            This week
          </p>
          <p className="text-2xl font-semibold leading-tight mt-0.5">
            <CountUp value={thisWeekMin} /> <span className="text-base font-normal text-muted-foreground">min</span>
          </p>
        </div>
        <div
          className={`flex items-center gap-1 text-xs font-medium rounded-full px-2.5 py-1 ${
            trendFlat
              ? "text-muted-foreground bg-surface-2"
              : trendUp
                ? "text-[hsl(var(--accent-emerald))] bg-[hsl(var(--accent-emerald)/0.12)]"
                : "text-muted-foreground bg-surface-2"
          }`}
        >
          {trendFlat ? (
            <Minus className="h-3.5 w-3.5" />
          ) : trendUp ? (
            <TrendingUp className="h-3.5 w-3.5" />
          ) : (
            <TrendingDown className="h-3.5 w-3.5" />
          )}
          {trendFlat ? "Same as last week" : `${trendUp ? "+" : ""}${deltaPct}% vs last week`}
        </div>
      </div>

      <div className="flex items-end gap-2 h-24" aria-hidden="true">
        {days.map((d, i) => {
          const heightPct = d.minutes > 0 ? Math.max(8, (d.minutes / maxMinutes) * 100) : 4;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
              <div
                className={`w-full rounded-md transition-all duration-500 ${
                  d.minutes > 0
                    ? "bg-cream"
                    : "bg-surface-2"
                } ${d.isToday ? "ring-2 ring-cream/40 ring-offset-2 ring-offset-surface" : ""}`}
                style={{ height: `${heightPct}%` }}
                title={`${d.minutes} min`}
              />
              <span
                className={`text-[10px] font-mono ${
                  d.isToday ? "text-cream font-semibold" : "text-muted-foreground"
                }`}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground/70 mt-3 flex items-center gap-1.5">
        <Flame className="h-3 w-3" />
        Estimated watch time across your courses
      </p>
    </div>
  );
};

export default WeeklyStats;
