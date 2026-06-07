import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { ArrowRight, Calendar, Clock, ExternalLink, Video } from "lucide-react";

// ── Upcoming Live Sessions ──
const UpcomingSessions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try {
        // Get user's active enrolments
        const { data: enrolments } = await supabase
          .from("enrolments")
          .select("offering_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (!enrolments?.length) { setLoading(false); return; }

        const offeringIds = enrolments.map((e) => e.offering_id);

        // Get course IDs for enrolled offerings
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("course_id")
          .in("offering_id", offeringIds);

        if (!ocs?.length) { setLoading(false); return; }

        const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

        // Get upcoming sessions for those courses. Read from the
        // zoom_link-free view; the link is fetched on demand through
        // get_live_session_zoom_link so it's only handed out in the
        // narrow window around the actual session.
        const { data: sessionsData } = await supabase
          .from("live_sessions_safe")
          .select("id, course_id, title, scheduled_at, duration_minutes, status")
          .in("course_id", courseIds)
          .eq("status", "scheduled")
          .gte("scheduled_at", new Date().toISOString())
          .order("scheduled_at", { ascending: true })
          .limit(2);

        if (!sessionsData?.length) { setLoading(false); return; }

        // Get course titles for display
        const sessionCourseIds = [...new Set(sessionsData.map((s) => s.course_id))];
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", sessionCourseIds);

        const courseMap: Record<string, string> = {};
        (coursesData ?? []).forEach((c: any) => { courseMap[c.id] = c.title; });

        setSessions(sessionsData.map((s) => ({ ...s, course_title: courseMap[s.course_id] || "Course" })));
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Video className="h-5 w-5 text-[hsl(var(--accent-amber))]" />
          <h2 className="text-lg font-semibold">Upcoming Live Sessions</h2>
        </div>
        <Link to="/my-sessions" className="text-sm text-cream flex items-center gap-1">
          See all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {sessions.map((s) => {
          const dt = new Date(s.scheduled_at);
          const dayStr = format(dt, "EEE");
          const dateStr = format(dt, "MMM d");
          const timeStr = format(dt, "h:mm a");

          return (
            <div
              key={s.id}
              className="bg-surface border border-border rounded-2xl p-4 flex items-start gap-4"
            >
              {/* Date block */}
              <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-[hsl(var(--accent-amber)/0.12)] flex flex-col items-center justify-center">
                <span className="text-[10px] font-mono uppercase text-[hsl(var(--accent-amber))]">{dayStr}</span>
                <span className="text-sm font-semibold text-[hsl(var(--accent-amber))]">{format(dt, "d")}</span>
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold line-clamp-1">{s.title}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{s.course_title}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> {dateStr}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {timeStr}
                  </span>
                  {s.duration_minutes && (
                    <span>{s.duration_minutes} min</span>
                  )}
                </div>
              </div>

              {/* Join CTA — link is fetched on click via the gated RPC,
                  which only returns a value in a narrow window around the
                  actual session start time. */}
              <button
                type="button"
                onClick={async () => {
                  const { data: link, error } = await supabase.rpc(
                    "get_live_session_zoom_link",
                    { p_session_id: s.id }
                  );
                  if (error || !link) {
                    toast({
                      title: "Join link not ready yet",
                      description: "It unlocks an hour before the session starts.",
                    });
                    return;
                  }
                  window.open(link as string, "_blank", "noopener,noreferrer");
                }}
                className="flex-shrink-0 self-center px-3 py-1.5 rounded-lg bg-[hsl(var(--accent-amber))] text-background text-xs font-medium flex items-center gap-1 hover:opacity-90 transition-opacity"
              >
                Join <ExternalLink className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default UpcomingSessions;
