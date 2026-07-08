import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { useEnrolledProgress } from "@/hooks/useEnrolledProgress";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight, Clock } from "lucide-react";
import { MotionCard } from "@/components/motion/MotionCard";

interface SessionStripRow {
  id: string;
  title: string;
  scheduled_at: string;
  duration_minutes: number | null;
  course_title: string;
}

// ── "Your next live session" strip ──
// Next 1-2 upcoming sessions for the user's enrolled offerings. Renders
// nothing while loading or when there's nothing scheduled — no dead section.
//
// The enrolled course ids AND their titles come from the shared
// `useEnrolledProgress` query (P6-T1), so this strip no longer re-runs the
// enrolment→offering_courses→courses waterfall (three requests it used to
// duplicate). Only the live-sessions read remains its own query, keyed and
// cached so a revisit within staleTime fires zero refetches.
const UpcomingSessions = () => {
  const { user } = useAuth();
  const { data: tree } = useEnrolledProgress(user?.id);

  const courseIds = tree?.courseIds ?? [];
  // id → title from the shared tree; sessions are filtered to enrolled courses,
  // so every session's course_id resolves here (no separate courses fetch).
  const courseTitleMap = useMemo(() => {
    const m: Record<string, string> = {};
    (tree?.courses ?? []).forEach((c) => {
      m[c.id] = c.title;
    });
    return m;
  }, [tree]);

  const { data: sessions = [] } = useQuery({
    queryKey: ["upcoming-sessions", user?.id ?? "anon"],
    enabled: courseIds.length > 0,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<SessionStripRow[]> => {
      // zoom_link-free view; the actual link is gated behind an RPC on
      // /my-sessions and only unlocks near the session start.
      const { data: sessionsData } = await supabase
        .from("live_sessions_safe")
        .select("id, course_id, title, scheduled_at, duration_minutes, status")
        .in("course_id", courseIds)
        .eq("status", "scheduled")
        .gte("scheduled_at", new Date().toISOString())
        .order("scheduled_at", { ascending: true })
        .limit(2);

      return (sessionsData ?? [])
        .filter((s): s is typeof s & { id: string; scheduled_at: string } =>
          !!s.id && !!s.scheduled_at)
        .map((s) => ({
          id: s.id,
          title: s.title ?? "Live session",
          scheduled_at: s.scheduled_at,
          duration_minutes: s.duration_minutes,
          course_title: courseTitleMap[s.course_id ?? ""] || "Course",
        }));
    },
  });

  if (!sessions.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Your next live session</h2>
        <Link to="/learn?seg=live" className="text-sm text-cream flex items-center gap-1">
          See all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sessions.map((s) => {
          const dt = new Date(s.scheduled_at);
          return (
            <MotionCard
              key={s.id}
              asChild
              // tabIndex={0} preserves the anchor's native tab stop — MotionCard would
              // otherwise force -1 on a non-interactive card (no onClick), silently
              // removing the session card from the tab order.
              tabIndex={0}
            >
              <Link
                to="/learn?seg=live"
                className="focus-ring bg-surface border border-border rounded-2xl p-4 flex items-center gap-4 hover:border-border-hover transition-colors"
              >
                {/* Date chip */}
                <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-[hsl(var(--accent-amber)/0.12)] flex flex-col items-center justify-center">
                  <span className="text-[10px] font-mono uppercase text-[hsl(var(--accent-amber))]">
                    {format(dt, "EEE")}
                  </span>
                  <span className="text-sm font-semibold text-[hsl(var(--accent-amber))]">
                    {format(dt, "d")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold line-clamp-1">{s.title}</h3>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.course_title}</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {format(dt, "MMM d, h:mm a")}
                    {s.duration_minutes ? ` · ${s.duration_minutes} min` : ""}
                  </p>
                </div>
                <span className="flex-shrink-0 px-3 py-1.5 rounded-lg bg-[hsl(var(--accent-amber))] text-background text-xs font-medium">
                  Join
                </span>
              </Link>
            </MotionCard>
          );
        })}
      </div>
    </section>
  );
};

export default UpcomingSessions;
