import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowRight, Clock } from "lucide-react";

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
const UpcomingSessions = () => {
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionStripRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try {
        const { data: enrolments } = await supabase
          .from("enrolments")
          .select("offering_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (!enrolments?.length) { setLoading(false); return; }

        const offeringIds = enrolments.map((e) => e.offering_id);

        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("course_id")
          .in("offering_id", offeringIds);

        if (!ocs?.length) { setLoading(false); return; }

        const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

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

        if (!sessionsData?.length) { setLoading(false); return; }

        const sessionCourseIds = [
          ...new Set(sessionsData.map((s) => s.course_id).filter((id): id is string => id !== null)),
        ];
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", sessionCourseIds);

        const courseMap: Record<string, string> = {};
        (coursesData ?? []).forEach((c) => { courseMap[c.id] = c.title; });

        setSessions(
          sessionsData.map((s) => ({
            id: s.id,
            title: s.title,
            scheduled_at: s.scheduled_at,
            duration_minutes: s.duration_minutes,
            course_title: courseMap[s.course_id ?? ""] || "Course",
          }))
        );
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load upcoming sessions:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  if (loading) return null;
  if (!sessions.length) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold">Your next live session</h2>
        <Link to="/my-sessions" className="text-sm text-cream flex items-center gap-1">
          See all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {sessions.map((s) => {
          const dt = new Date(s.scheduled_at);
          return (
            <Link
              key={s.id}
              to="/my-sessions"
              className="pressable bg-surface border border-border rounded-2xl p-4 flex items-center gap-4 hover:border-border-hover transition-colors"
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
          );
        })}
      </div>
    </section>
  );
};

export default UpcomingSessions;
