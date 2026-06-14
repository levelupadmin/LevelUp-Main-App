import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import usePageTitle from "@/hooks/usePageTitle";
import { format, isPast } from "date-fns";
import { Bell, Calendar, Clock, Video, PlayCircle, WifiOff, RefreshCw, CalendarPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { useSessionReminder } from "@/hooks/useSessionReminder";
import { TimeStateBadge } from "@/components/live/TimeStateBadge";
import { Countdown } from "@/components/live/Countdown";
import { addToCalendar } from "@/lib/calendar";
import { hapticSelection } from "@/lib/haptics";
import { isNative } from "@/lib/platform";

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
  usePageTitle("My sessions");
  const { user } = useAuth();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reminderToggle, setReminderToggle] = useState(false);
  const { requestPermission, scheduleReminder, cancelReminder, isReminderSet } =
    useSessionReminder();

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
        // Get enrolled course IDs
        const { data: enrolments } = await supabase
          .from("enrolments")
          .select("offering_id")
          .eq("user_id", user.id)
          .eq("status", "active");

        if (!enrolments?.length) { setSessions([]); setLoading(false); return; }

        const offeringIds = enrolments.map((e) => e.offering_id);

        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("course_id")
          .in("offering_id", offeringIds);

        if (!ocs?.length) { setSessions([]); setLoading(false); return; }

        const courseIds = [...new Set(ocs.map((oc) => oc.course_id))];

        // Get all sessions for enrolled courses. zoom_link is fetched on
        // click via get_live_session_zoom_link so the link is only handed
        // out in the narrow window around the actual session.
        const { data: sessionsData } = await supabase
          .from("live_sessions_safe")
          .select("id, course_id, title, description, scheduled_at, duration_minutes, recording_url, status")
          .in("course_id", courseIds)
          .order("scheduled_at", { ascending: true });

        if (!sessionsData?.length) { setSessions([]); setLoading(false); return; }

        // Get course titles
        const sessionCourseIds = [...new Set(sessionsData.map((s) => s.course_id).filter((id): id is string => id !== null))];
        const { data: coursesData } = await supabase
          .from("courses")
          .select("id, title")
          .in("id", sessionCourseIds);

        const courseMap: Record<string, string> = {};
        (coursesData ?? []).forEach((c: any) => { courseMap[c.id] = c.title; });

        setSessions(
          sessionsData.map((s): SessionRow => ({
            id: s.id ?? "",
            course_id: s.course_id ?? "",
            title: s.title ?? "",
            description: s.description,
            scheduled_at: s.scheduled_at ?? "",
            duration_minutes: s.duration_minutes ?? 0,
            recording_url: s.recording_url,
            status: s.status ?? "",
            course_title: courseMap[s.course_id ?? ""] || "Course",
          }))
        );
      } catch (err) {
        if (import.meta.env.DEV) console.error("Failed to load sessions:", err);
        setError("We couldn't load this. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  // Re-schedule browser notifications for any sessions the user previously opted into
  useEffect(() => {
    if (!sessions.length) return;
    const now = Date.now();
    sessions.forEach((s) => {
      if (
        isReminderSet(s.id) &&
        s.status === "scheduled" &&
        new Date(s.scheduled_at).getTime() > now
      ) {
        scheduleReminder(s.id, s.title, s.scheduled_at);
      }
    });
  }, [sessions, isReminderSet, scheduleReminder]);

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
    <>
      <div className="space-y-8 max-w-3xl">
        {/* Editorial hero: matches Home + Browse + PublicOffering's
            cinematic voice so My Sessions doesn't feel like an
            afterthought next to the other polished surfaces. */}
        <div className="space-y-3">
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/70">
            Calendar
          </p>
          <h1 className="text-[36px] sm:text-5xl font-bold tracking-[-0.02em] leading-[1.05]">
            Your <span className="font-serif-italic text-cream">live</span> sessions
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-[52ch]">
            Every scheduled class for the masterclasses and cohorts you're enrolled in.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-surface border border-border rounded-xl p-4 flex items-start gap-4 animate-pulse">
                <div className="flex-shrink-0 w-14 h-14 rounded-lg bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-surface-2 rounded w-1/2" />
                  <div className="h-3 bg-surface-2 rounded w-1/3" />
                  <div className="flex items-center gap-3 mt-2">
                    <div className="h-3 bg-surface-2 rounded w-20" />
                    <div className="h-3 bg-surface-2 rounded w-16" />
                    <div className="h-3 bg-surface-2 rounded w-12" />
                  </div>
                </div>
                <div className="h-8 bg-surface-2 rounded-lg w-16 flex-shrink-0 self-center" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-16">
            <WifiOff className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-lg font-medium text-foreground mb-1">Something went wrong</p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <Button onClick={() => load()} variant="outline" className="mt-4 gap-2">
              <RefreshCw className="h-4 w-4" /> Retry
            </Button>
          </div>
        ) : !sessions.length ? (
          <EmptyState
            icon={Video}
            title="No sessions scheduled"
            sub="Enrol in a program to join live sessions with instructors."
            cta={{ label: "Explore programs", to: "/" }}
          />
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
                    const msUntil = dt.getTime() - Date.now();
                    const hoursUntil = Math.ceil(msUntil / (1000 * 60 * 60));
                    // Join unlocks 1h before. Within that window the Countdown
                    // morphs into a real Join button backed by the gated RPC,
                    // which only mints the link in the narrow live window.
                    const joinUnlocked = msUntil <= 60 * 60 * 1000;
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
                            {/* (30) live relative-time badge replaces the static "Upcoming" pill */}
                            <TimeStateBadge date={s.scheduled_at} durationMin={s.duration_minutes} />
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
                            {s.duration_minutes ? <span>{s.duration_minutes} min</span> : null}
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex-shrink-0 self-center flex flex-col gap-2 items-end">
                          {/* (31) Countdown ticks until T-0, then morphs into a Join
                              button. The join link is fetched on click via the gated
                              RPC, only returns a value in the window around start. */}
                          {joinUnlocked ? (
                            <Countdown
                              target={s.scheduled_at}
                              joinUrl={async () => {
                                const { data: link, error } = await supabase.rpc(
                                  "get_live_session_zoom_link",
                                  { p_session_id: s.id }
                                );
                                if (error || !link) {
                                  toast.error(
                                    "The join link for this session isn't available yet. It unlocks an hour before the session starts."
                                  );
                                  return null;
                                }
                                return link as string;
                              }}
                            />
                          ) : (
                            <div className="flex flex-col items-end gap-1">
                              <Countdown target={s.scheduled_at} />
                              <span className="text-[11px] text-muted-foreground text-right max-w-[140px]">
                                Join unlocks {hoursUntil}h before
                              </span>
                            </div>
                          )}

                          {/* Remind Me toggle */}
                          <button
                            type="button"
                            aria-label={isReminderSet(s.id) ? "Reminder set" : "Set reminder"}
                            onClick={async () => {
                              if (isReminderSet(s.id)) {
                                cancelReminder(s.id);
                              } else {
                                const granted = await requestPermission();
                                if (granted) {
                                  scheduleReminder(s.id, s.title, s.scheduled_at);
                                  toast.success("Reminder set for 15 min before");
                                } else {
                                  // The web instructions reference browser chrome that
                                  // doesn't exist inside the Capacitor WebView, so point
                                  // native users at system Settings instead.
                                  toast.error(
                                    isNative()
                                      ? "Notifications are blocked. To re-enable, open your device's Settings, find LevelUp Learning, and allow Notifications."
                                      : "Notifications are blocked. To re-enable, click the lock icon next to the URL in your browser's address bar, set Notifications to \"Allow\", then reload this page."
                                  );
                                }
                              }
                              setReminderToggle((prev) => !prev);
                            }}
                            className={cn(
                              "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border transition-colors",
                              isReminderSet(s.id)
                                ? "border-cream/30 text-cream bg-cream/10"
                                : "border-border text-muted-foreground hover:text-foreground hover:border-border-hover"
                            )}
                          >
                            <Bell className="h-3.5 w-3.5" />
                            {isReminderSet(s.id) ? "Reminder set" : "Remind me"}
                          </button>

                          {/* (32) Add to calendar: .ics download (Apple/Outlook) with
                              Google Calendar fallback. Course title rides along as the
                              event description for context. */}
                          <button
                            type="button"
                            aria-label="Add to calendar"
                            onClick={() => {
                              void hapticSelection();
                              addToCalendar(
                                s.title,
                                s.scheduled_at,
                                s.duration_minutes,
                                null,
                                s.course_title
                              );
                              toast.success("Added to your calendar");
                            }}
                            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-border-hover transition-colors"
                          >
                            <CalendarPlus className="h-3.5 w-3.5" />
                            Add to calendar
                          </button>
                        </div>
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
                  Past & completed ({past.length})
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
                        {s.recording_url ? (
                          <a
                            href={s.recording_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0 self-center px-3 py-1.5 rounded-lg border border-border text-sm text-cream font-medium flex items-center gap-1.5 hover:bg-surface-2 transition-colors"
                          >
                            <PlayCircle className="h-3.5 w-3.5" /> Watch
                          </a>
                        ) : (
                          <span className="flex-shrink-0 self-center text-xs text-muted-foreground italic">
                            Recording not available
                          </span>
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
    </>
  );
};

export default MySessionsPage;
