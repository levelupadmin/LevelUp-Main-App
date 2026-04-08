import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import StudentLayout from "@/components/layout/StudentLayout";
import usePageTitle from "@/hooks/usePageTitle";
import { format, isPast } from "date-fns";
import { Calendar, Clock, Video, ExternalLink, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SessionRow {
  id: string;
  course_id: string;
  title: string;
  description: string | null;
  scheduled_at: string;
  duration_minutes: number;
  recording_url: string | null;
  status: string;
  course_title: string;
}

const MySessionsPage = () => {
  usePageTitle("My Sessions");
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!user) { setLoading(false); return; }
      try {
        // Get enrolled course IDs
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

        // Get all sessions for enrolled courses. zoom_link is fetched on
        // click via get_live_session_zoom_link so the link is only handed
        // out in the narrow window around the actual session.
        const { data: sessionsData } = await supabase
          .from("live_sessions_safe")
          .select("id, course_id, title, description, scheduled_at, duration_minutes, recording_url, status")
          .in("course_id", courseIds)
          .order("scheduled_at", { ascending: true });

        if (!sessionsData?.length) { setLoading(false); return; }

        // Get course titles
        const sessionCourseIds = [...new Set(sessionsData.map((s) => s.course_id))];
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", sessionCourseIds);

        const courseMap: Record<string, string> = {};
        (coursesData ?? []).forEach((c: any) => { courseMap[c.id] = c.title; });

        setSessions(
          sessionsData.map((s) => ({
            ...s,
            course_title: courseMap[s.course_id] || "Course",
          }))
        );
      } catch (err) {
        console.error("Failed to load sessions:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const now = new Date();
  const upcoming = sessions.filter(
    (s) => s.status === "scheduled" && !isPast(new Date(s.scheduled_at))
  );
  const past = sessions.filter(
    (s) => s.status !== "scheduled" || isPast(new Date(s.scheduled_at))
  );

  const statusBadge = (s: SessionRow) => {
    if (s.status === "cancelled") return { label: "Cancelled", cls: "bg-destructive/15 text-destructive" };
    if (s.status === "completed") return { label: "Completed", cls: "bg-emerald-500/15 text-emerald-400" };
    if (isPast(new Date(s.scheduled_at))) return { label: "Past", cls: "bg-muted text-muted-foreground" };
    return { label: "Upcoming", cls: "bg-blue-500/15 text-blue-400" };
  };

  return (
    <StudentLayout title="My Sessions">
      <div className="space-y-8 max-w-3xl">
        <div>
          <h1 className="text-[28px] sm:text-[32px] font-semibold leading-tight">My Live Sessions</h1>
          <p className="text-base text-muted-foreground mt-1">All scheduled and past live classes for your courses</p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 bg-surface border border-border rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !sessions.length ? (
          <div className="text-center py-16">
            <Video className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-lg font-medium">No sessions yet</p>
            <p className="text-sm text-muted-foreground mt-1">Live sessions for your enrolled courses will appear here.</p>
          </div>
        ) : (
          <>
            {/* Upcoming */}
            {upcoming.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400" />
                  Upcoming ({upcoming.length})
                </h2>
                <div className="space-y-3">
                  {upcoming.map((s) => {
                    const dt = new Date(s.scheduled_at);
                    const badge = statusBadge(s);
                    return (
                      <div key={s.id} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-4">
                        {/* Date block */}
                        <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-[hsl(var(--accent-amber)/0.12)] flex flex-col items-center justify-center">
                          <span className="text-[10px] font-mono uppercase text-[hsl(var(--accent-amber))]">{format(dt, "EEE")}</span>
                          <span className="text-sm font-semibold text-[hsl(var(--accent-amber))]">{format(dt, "d")}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold">{s.title}</h3>
                            <span className={cn("text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded", badge.cls)}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.course_title}</p>
                          {s.description && (
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{s.description}</p>
                          )}
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {format(dt, "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {format(dt, "h:mm a")}
                            </span>
                            {s.duration_minutes && <span>{s.duration_minutes} min</span>}
                          </div>
                        </div>

                        {/* Join button — link is fetched on click via the
                            gated RPC, which only returns a value in a narrow
                            window around the session start. */}
                        <button
                          type="button"
                          onClick={async () => {
                            const { data: link, error } = await supabase.rpc(
                              "get_live_session_zoom_link",
                              { p_session_id: s.id }
                            );
                            if (error || !link) {
                              alert(
                                "The join link for this session isn't available yet. It unlocks an hour before the session starts."
                              );
                              return;
                            }
                            window.open(link as string, "_blank", "noopener,noreferrer");
                          }}
                          className="flex-shrink-0 self-center px-4 py-2 rounded-lg bg-[hsl(var(--accent-amber))] text-background text-sm font-medium flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                        >
                          Join <ExternalLink className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Past / Completed */}
            {past.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground" />
                  Past & Completed ({past.length})
                </h2>
                <div className="space-y-3">
                  {past.map((s) => {
                    const dt = new Date(s.scheduled_at);
                    const badge = statusBadge(s);
                    return (
                      <div key={s.id} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-4 opacity-75">
                        {/* Date block */}
                        <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-surface-2 flex flex-col items-center justify-center">
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">{format(dt, "EEE")}</span>
                          <span className="text-sm font-semibold text-muted-foreground">{format(dt, "d")}</span>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold">{s.title}</h3>
                            <span className={cn("text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded", badge.cls)}>
                              {badge.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.course_title}</p>
                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" /> {format(dt, "MMM d, yyyy")}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {format(dt, "h:mm a")}
                            </span>
                          </div>
                        </div>

                        {/* Recording link */}
                        {s.recording_url && (
                          <a
                            href={s.recording_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 self-center px-3 py-1.5 rounded-lg border border-border text-sm text-cream font-medium flex items-center gap-1.5 hover:bg-surface-2 transition-colors"
                          >
                            <PlayCircle className="h-3.5 w-3.5" /> Watch
                          </a>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </StudentLayout>
  );
};

export default MySessionsPage;
