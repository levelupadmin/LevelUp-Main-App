import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ChevronLeft, Calendar, Video, FileText, ClipboardCheck,
  CheckCircle2, Clock, Lock, ExternalLink, ChevronRight, AlertTriangle, Trophy, Users, MessageSquare,
} from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";
import AssignmentSubmissionForm from "@/components/cohort/AssignmentSubmissionForm";
import AssignmentFeedbackView from "@/components/cohort/AssignmentFeedbackView";
import PeerReviewBoard from "@/components/cohort/PeerReviewBoard";
import { differenceInCalendarDays } from "date-fns";
import { TimeStateBadge } from "@/components/live/TimeStateBadge";

interface ProgressRow {
  cohort_batch_id: string;
  batch_label: string;
  week_id: string;
  week_number: number;
  theme: string;
  description: string | null;
  starts_on: string;
  ends_on: string;
  assignment_prompt: string | null;
  assignment_due_at: string | null;
  feedback_session_at: string | null;
  week_status: "upcoming" | "active" | "completed" | "archived";
  live_session_id: string | null;
  live_session_title: string | null;
  live_session_at: string | null;
  live_session_zoom_link: string | null;
  submission_id: string | null;
  submission_status: string | null;
  submission_rating: number | null;
  submission_feedback: string | null;
  submission_submitted_at: string | null;
  attended: boolean;
  attendance_marked: boolean;
}

interface OfferingMini {
  id: string;
  title: string;
  slug: string;
  attendance_threshold_pct: number | null;
}

export default function CohortDashboard() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  usePageTitle("My Cohort");

  const [offering, setOffering] = useState<OfferingMini | null>(null);
  const [rows, setRows] = useState<ProgressRow[]>([]);
  const [attendancePct, setAttendancePct] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [activeWeekId, setActiveWeekId] = useState<string | null>(null);
  const [tab, setTab] = useState<"weeks" | "peer_reviews">("weeks");

  useEffect(() => {
    if (!offeringId || !user?.id) return;
    (async () => {
      setLoading(true);
      const { data: off } = await supabase
        .from("offerings")
        .select("id, title, slug, attendance_threshold_pct")
        .eq("id", offeringId)
        .single();
      setOffering(off);

      const { data: progress, error: progErr } = await supabase.rpc("get_cohort_progress", {
        p_user_id: user.id,
        p_offering_id: offeringId,
      });
      if (progErr) {
        toast({ title: "Couldn't load cohort", description: "We couldn't load your cohort progress. Please refresh and try again.", variant: "destructive" });
      }
      setRows((progress as ProgressRow[]) || []);

      const { data: pct } = await supabase.rpc("get_attendance_pct", {
        p_user_id: user.id,
        p_offering_id: offeringId,
      });
      setAttendancePct(Number(pct) || 0);

      // Pick the "current" week: first non-completed, or the latest
      const current = (progress as ProgressRow[] | null)?.find((r) =>
        ["active", "upcoming"].includes(r.week_status)
      );
      setActiveWeekId(current?.week_id ?? (progress as ProgressRow[] | null)?.[0]?.week_id ?? null);

      setLoading(false);
    })();
  }, [offeringId, user?.id, toast]);

  const currentWeek = useMemo(
    () => rows.find((r) => r.week_id === activeWeekId) || rows[0],
    [rows, activeWeekId]
  );

  const totalWeeks = rows.length;
  const completedCount = rows.filter((r) =>
    ["completed", "archived"].includes(r.week_status)
  ).length;
  const activeIdx = rows.findIndex((r) => r.week_status === "active");
  const progressIdx = activeIdx >= 0 ? activeIdx : completedCount - 1;

  const certThreshold = offering?.attendance_threshold_pct || 0;
  const certEligible = certThreshold === 0 || attendancePct >= certThreshold;

  // (34) Footer summary: current week index, weeks completed, and the soonest
  // open (un-submitted) assignment deadline still in the future.
  const weekOfM = Math.max(1, progressIdx + 1);
  const progressPct = totalWeeks > 0 ? Math.round((completedCount / totalWeeks) * 100) : 0;
  const nextDue = (() => {
    const now = Date.now();
    const open = rows
      .filter((r) => r.assignment_due_at && !r.submission_id && new Date(r.assignment_due_at).getTime() > now)
      .sort((a, b) => new Date(a.assignment_due_at!).getTime() - new Date(b.assignment_due_at!).getTime());
    if (!open.length) return null;
    const due = new Date(open[0].assignment_due_at!);
    return { date: due, days: Math.max(0, differenceInCalendarDays(due, new Date())) };
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!offering) {
    return (
      <div className="container max-w-3xl py-16 text-center">
        <p className="text-muted-foreground">Cohort not found.</p>
        <Link to="/learn?seg=courses" className="text-sm text-cream hover:underline">Back to My Courses</Link>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="container max-w-3xl py-16 text-center">
        <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">No weeks scheduled yet</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Your cohort starts soon. We'll fill out the weekly schedule here as it locks in.
        </p>
        <Link to="/learn?seg=courses" className="text-sm text-cream hover:underline">← Back to My Courses</Link>
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-6 px-4 pb-28">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-4"
      >
        <ChevronLeft className="h-3.5 w-3.5" /> Back to My Courses
      </button>

      {/* Sticky header strip */}
      <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-sm -mx-4 px-4 pt-2 pb-4 mb-6 border-b border-border">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">
              {rows[0]?.batch_label || "Cohort"}
            </p>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
              {offering.title}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Week {Math.max(1, progressIdx + 1)} of {totalWeeks} ·
              {" "}
              <span className="text-foreground font-medium">{completedCount} completed</span>
            </p>
          </div>

          {/* Attendance + cert eligibility */}
          <div className="flex items-center gap-4">
            <AttendanceBar pct={attendancePct} threshold={certThreshold} />
            {certThreshold > 0 && (
              <div className={`flex items-center gap-1.5 text-xs font-mono px-2.5 py-1 rounded ${
                certEligible
                  ? "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]"
                  : "bg-[hsl(var(--accent-amber)/0.2)] text-[hsl(var(--accent-amber))]"
              }`}>
                <Trophy className="h-3 w-3" />
                {certEligible ? "Certificate eligible" : `Need ${certThreshold}% attendance`}
              </div>
            )}
          </div>
        </div>

        {/* Progress strip */}
        <div className="flex gap-1 mt-4">
          {rows.map((r, i) => (
            <button
              key={r.week_id}
              onClick={() => setActiveWeekId(r.week_id)}
              title={`Week ${r.week_number}: ${r.theme}`}
              className={`flex-1 h-1.5 rounded-full transition-all ${
                r.week_id === activeWeekId ? "ring-2 ring-cream/40 ring-offset-2 ring-offset-canvas " : ""
              }${
                r.week_status === "completed" || r.week_status === "archived"
                  ? "bg-cream"
                  : r.week_status === "active"
                  ? "bg-cream/60"
                  : "bg-muted"
              }`}
            />
          ))}
        </div>
      </div>

      {/* This Week card */}
      {currentWeek && tab === "weeks" && (
        <ThisWeekCard week={currentWeek} userId={user!.id} onChange={async () => {
          const { data } = await supabase.rpc("get_cohort_progress", { p_user_id: user!.id, p_offering_id: offeringId! });
          setRows((data as ProgressRow[]) || []);
        }} />
      )}

      {/* Tab switcher */}
      <div className="flex items-center gap-1 p-1 bg-surface border border-border rounded-lg w-fit mt-10 mb-4">
        <button
          onClick={() => setTab("weeks")}
          className={`px-3 h-8 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors ${
            tab === "weeks"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Calendar className="h-3 w-3" /> All weeks · {rows.length}
        </button>
        <button
          onClick={() => setTab("peer_reviews")}
          className={`px-3 h-8 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors ${
            tab === "peer_reviews"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <MessageSquare className="h-3 w-3" /> Peer reviews
        </button>
      </div>

      {tab === "weeks" && (
        <div className="space-y-2">
          {rows.map((r) => (
            <WeekListItem
              key={r.week_id}
              row={r}
              active={r.week_id === activeWeekId}
              onClick={() => setActiveWeekId(r.week_id)}
            />
          ))}
        </div>
      )}

      {tab === "peer_reviews" && rows[0]?.cohort_batch_id && (
        <PeerReviewBoard
          cohortBatchId={rows[0].cohort_batch_id}
          currentUserId={user!.id}
        />
      )}

      {/* (34) Sticky bottom progress footer: always-visible glance at where the
          learner is in the cohort + the next thing due, anchored by a ring. */}
      <CohortFooter
        weekOf={weekOfM}
        totalWeeks={totalWeeks}
        completedCount={completedCount}
        progressPct={progressPct}
        nextDue={nextDue}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

/**
 * Minimal SVG progress ring. The progress agent owns the canonical
 * `@/components/progress/ProgressRing`; until that lands this inline version
 * keeps the footer self-contained. Swap the import when it's available.
 */
function ProgressRing({
  pct,
  size = 40,
  stroke = 4,
  label,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, pct));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--cream))"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 600ms ease-out" }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-mono font-medium text-cream">
        {label ?? `${clamped}%`}
      </span>
    </div>
  );
}

function CohortFooter({
  weekOf,
  totalWeeks,
  completedCount,
  progressPct,
  nextDue,
}: {
  weekOf: number;
  totalWeeks: number;
  completedCount: number;
  progressPct: number;
  nextDue: { date: Date; days: number } | null;
}) {
  const dueLabel = nextDue
    ? nextDue.days === 0
      ? "assignment due today"
      : nextDue.days === 1
      ? "assignment due in 1d"
      : `assignment due in ${nextDue.days}d`
    : null;

  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-border bg-canvas/95 backdrop-blur-md pb-safe">
      <div className="container max-w-6xl px-4 py-3 flex items-center gap-3">
        <ProgressRing pct={progressPct} label={`${weekOf}`} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground truncate">
            Week {weekOf} of {totalWeeks}
            <span className="text-muted-foreground"> · {completedCount} done</span>
          </p>
          {dueLabel ? (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
              <Clock className="h-3 w-3 flex-shrink-0" />
              {dueLabel}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              No assignments due, you're all caught up.
            </p>
          )}
        </div>
        {nextDue && (
          <TimeStateBadge date={nextDue.date} className="flex-shrink-0" />
        )}
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────── */

function AttendanceBar({ pct, threshold }: { pct: number; threshold: number }) {
  return (
    <div className="flex flex-col items-end">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Attendance</span>
        <span className="text-sm font-mono text-foreground">{pct.toFixed(0)}%</span>
      </div>
      <div className="relative w-32 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-cream rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
        {threshold > 0 && (
          <div className="absolute inset-y-0 w-px bg-[hsl(var(--accent-amber))]" style={{ left: `${Math.min(100, threshold)}%` }} title={`${threshold}% threshold`} />
        )}
      </div>
    </div>
  );
}

function ThisWeekCard({
  week,
  userId,
  onChange,
}: {
  week: ProgressRow;
  userId: string;
  onChange: () => Promise<void>;
}) {
  const dueDate = week.assignment_due_at ? new Date(week.assignment_due_at) : null;
  const dueSoon = dueDate && dueDate.getTime() - Date.now() < 1000 * 60 * 60 * 48 && dueDate.getTime() > Date.now();
  const overdue = dueDate && dueDate.getTime() < Date.now() && !week.submission_id;

  return (
    <div className="border border-border rounded-xl bg-gradient-to-br from-surface to-canvas overflow-hidden">
      <div className="px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono uppercase tracking-widest text-cream">
            {week.week_status === "active" ? "This week" : week.week_status === "upcoming" ? "Upcoming" : "Week"}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">·</span>
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Week {week.week_number}
          </span>
        </div>
        <h2 className="text-2xl font-semibold tracking-tight">{week.theme}</h2>
        {week.description && (
          <p className="text-sm text-muted-foreground mt-2 max-w-prose">{week.description}</p>
        )}
        <p className="text-xs font-mono text-muted-foreground mt-3">
          <Calendar className="inline h-3 w-3 mr-1" />
          {formatDateShort(week.starts_on)} → {formatDateShort(week.ends_on)}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 divide-x divide-border">
        {/* Live session card */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Video className="h-4 w-4 text-cream" />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Live session</span>
          </div>
          {week.live_session_title ? (
            <>
              <div className="flex items-start justify-between gap-2">
                <p className="text-base font-medium text-foreground leading-tight">{week.live_session_title}</p>
                {/* (30) relative-time badge replaces the static "Upcoming" label */}
                {week.live_session_at && (
                  <TimeStateBadge date={week.live_session_at} className="flex-shrink-0 mt-0.5" />
                )}
              </div>
              {week.live_session_at && (
                <p className="text-xs text-muted-foreground mt-1.5 font-mono">
                  {formatDateTime(week.live_session_at)}
                </p>
              )}
              {week.live_session_zoom_link && new Date(week.live_session_at!).getTime() - Date.now() < 1000 * 60 * 60 && (
                <a
                  href={week.live_session_zoom_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 h-9 px-3 bg-cream text-cream-text text-sm font-medium rounded-md hover:-translate-y-0.5 transition-transform"
                >
                  Join session <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Not scheduled yet</p>
          )}
        </div>

        {/* Assignment card */}
        <div className="p-5">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-cream" />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Assignment</span>
            {dueSoon && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.2)] text-[hsl(var(--accent-amber))]">
                Due soon
              </span>
            )}
            {overdue && (
              <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-destructive/20 text-destructive">
                Overdue
              </span>
            )}
          </div>
          {week.assignment_prompt ? (
            <>
              <p className="text-sm text-foreground line-clamp-3">{week.assignment_prompt}</p>
              {dueDate && (
                <p className="text-xs text-muted-foreground mt-2 font-mono">
                  <Clock className="inline h-3 w-3 mr-1" />
                  Due {formatDateTime(week.assignment_due_at!)}
                </p>
              )}
              <div className="mt-3">
                {week.submission_id ? (
                  <SubmissionStatusBadge status={week.submission_status!} rating={week.submission_rating} />
                ) : (
                  <AssignmentSubmissionForm weekId={week.week_id} userId={userId} compact onSubmitted={onChange} />
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">No assignment this week</p>
          )}
        </div>
      </div>

      {/* Feedback panel (full-width below split) */}
      {week.submission_id && (week.submission_feedback || week.submission_status === "reviewed" || week.submission_status === "cleared") && (
        <div className="border-t border-border p-5">
          <AssignmentFeedbackView
            status={week.submission_status!}
            feedback={week.submission_feedback}
            rating={week.submission_rating}
          />
        </div>
      )}

      {/* Resubmission allowed for needs_revision or no submission */}
      {week.submission_status === "needs_revision" && week.submission_id && (
        <div className="border-t border-border p-5">
          <p className="text-sm text-[hsl(var(--accent-amber))] mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" /> Mentor asked for a revision. Resubmit below.
          </p>
          <AssignmentSubmissionForm
            weekId={week.week_id}
            userId={userId}
            existingSubmissionId={week.submission_id}
            onSubmitted={onChange}
          />
        </div>
      )}
    </div>
  );
}

function SubmissionStatusBadge({ status, rating }: { status: string; rating: number | null }) {
  const config: Record<string, { label: string; className: string; icon: JSX.Element }> = {
    submitted: { label: "Submitted", className: "bg-[hsl(var(--accent-indigo)/0.2)] text-[hsl(var(--accent-indigo-text))]", icon: <CheckCircle2 className="h-3 w-3" /> },
    under_review: { label: "Under review", className: "bg-cream/20 text-cream", icon: <Clock className="h-3 w-3" /> },
    reviewed: { label: "Reviewed", className: "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]", icon: <CheckCircle2 className="h-3 w-3" /> },
    cleared: { label: "Cleared", className: "bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]", icon: <CheckCircle2 className="h-3 w-3" /> },
    needs_revision: { label: "Needs revision", className: "bg-[hsl(var(--accent-amber)/0.2)] text-[hsl(var(--accent-amber))]", icon: <AlertTriangle className="h-3 w-3" /> },
    late: { label: "Submitted late", className: "bg-[hsl(var(--accent-amber)/0.2)] text-[hsl(var(--accent-amber))]", icon: <Clock className="h-3 w-3" /> },
  };
  const c = config[status] || config.submitted;
  return (
    <div className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider px-2.5 py-1 rounded">
      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded ${c.className}`}>
        {c.icon} {c.label}
      </span>
      {rating !== null && (
        <span className="text-foreground">{rating}/5</span>
      )}
    </div>
  );
}

function WeekListItem({
  row,
  active,
  onClick,
}: {
  row: ProgressRow;
  active: boolean;
  onClick: () => void;
}) {
  const completed = ["completed", "archived"].includes(row.week_status);
  const upcoming = row.week_status === "upcoming";
  const future = upcoming && new Date(row.starts_on).getTime() > Date.now();

  return (
    <button
      onClick={onClick}
      className={`w-full text-left border rounded-lg p-3 flex items-center gap-3 transition-colors ${
        active
          ? "border-cream/40 bg-surface"
          : "border-border bg-surface/50 hover:bg-surface hover:border-cream/20"
      }`}
    >
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-mono text-xs ${
        completed
          ? "bg-cream/20 text-cream"
          : row.week_status === "active"
          ? "bg-cream text-cream-text"
          : "bg-muted text-muted-foreground"
      }`}>
        {completed ? <CheckCircle2 className="h-4 w-4" /> : future ? <Lock className="h-3 w-3" /> : row.week_number}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-foreground truncate">{row.theme}</p>
          {row.submission_id && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-cream/10 text-cream">
              ✓ submitted
            </span>
          )}
          {row.attended && (
            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]">
              ✓ attended
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          W{String(row.week_number).padStart(2, "0")} · {formatDateShort(row.starts_on)} → {formatDateShort(row.ends_on)}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </button>
  );
}

function formatDateShort(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
function formatDateTime(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: true,
  });
}
