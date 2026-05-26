import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, ChevronLeft, FileText, Star, MessageSquare, ExternalLink, Filter, ChevronRight, User,
} from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";

interface Submission {
  id: string;
  cohort_week_id: string;
  user_id: string;
  text_content: string | null;
  file_urls: string[];
  link_url: string | null;
  status: string;
  late: boolean;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  feedback_text: string | null;
  rating: number | null;
  open_to_peer_review: boolean;
  // joined
  user_name?: string | null;
  user_email?: string | null;
  week_number?: number;
  week_theme?: string;
  batch_name?: string;
  offering_title?: string;
}

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "submitted", label: "Pending review" },
  { value: "under_review", label: "Under review" },
  { value: "reviewed", label: "Reviewed" },
  { value: "needs_revision", label: "Needs revision" },
  { value: "cleared", label: "Cleared" },
];

export default function AdminCohortSubmissions() {
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  usePageTitle("Cohort Submissions");

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selected, setSelected] = useState<Submission | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(params.get("status") || "submitted");
  const [batchFilter, setBatchFilter] = useState<string>(params.get("batch") || "all");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Pull all submissions with embedded week + batch + offering + user
      const { data, error } = await supabase
        .from("cohort_week_submissions")
        .select(`
          *,
          cohort_weeks:cohort_week_id (week_number, theme, cohort_batches:cohort_batch_id (name, offerings:offering_id (title))),
          users:user_id (full_name, email)
        `)
        .order("submitted_at", { ascending: false })
        .limit(500);
      if (error) {
        toast({ title: "Load failed", description: error.message, variant: "destructive" });
        setLoading(false);
        return;
      }
      const flat: Submission[] = (data as any[]).map((r) => ({
        ...r,
        user_name: r.users?.full_name,
        user_email: r.users?.email,
        week_number: r.cohort_weeks?.week_number,
        week_theme: r.cohort_weeks?.theme,
        batch_name: r.cohort_weeks?.cohort_batches?.name,
        offering_title: r.cohort_weeks?.cohort_batches?.offerings?.title,
      }));
      setSubmissions(flat);
      setLoading(false);
    })();
  }, [toast]);

  const filtered = useMemo(() => {
    return submissions.filter((s) => {
      if (filter !== "all" && s.status !== filter) return false;
      if (batchFilter !== "all" && s.batch_name !== batchFilter) return false;
      return true;
    });
  }, [submissions, filter, batchFilter]);

  const batches = useMemo(() => {
    const set = new Set(submissions.map((s) => s.batch_name).filter(Boolean));
    return Array.from(set) as string[];
  }, [submissions]);

  const updateSubmission = async (id: string, patch: Partial<Submission>) => {
    const fullPatch: any = {
      ...patch,
      reviewed_at: new Date().toISOString(),
      reviewed_by: currentUser?.id,
    };
    const { error } = await supabase.from("cohort_week_submissions").update(fullPatch).eq("id", id);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setSubmissions((prev) => prev.map((s) => (s.id === id ? { ...s, ...fullPatch } : s)));
    setSelected((sel) => (sel?.id === id ? { ...sel, ...fullPatch } : sel));
    toast({ title: "Saved" });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-7xl py-6 px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/admin" className="hover:text-foreground">Admin</Link>
        <span>/</span>
        <span className="text-foreground">Cohort submissions</span>
      </div>

      <div className="flex items-end justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Cohort submissions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} of {submissions.length} submissions
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Filter className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => { setFilter(f.value); setParams((p) => { const n = new URLSearchParams(p); n.set("status", f.value); return n; }); }}
              className={`px-2.5 h-7 text-xs font-mono uppercase tracking-wider rounded-md border whitespace-nowrap transition-colors ${
                filter === f.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-surface border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        {batches.length > 0 && (
          <select
            value={batchFilter}
            onChange={(e) => { setBatchFilter(e.target.value); setParams((p) => { const n = new URLSearchParams(p); n.set("batch", e.target.value); return n; }); }}
            className="h-7 px-2.5 bg-surface border border-border rounded-md text-xs font-mono uppercase tracking-wider text-foreground"
          >
            <option value="all">All batches</option>
            {batches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        )}
      </div>

      {/* Split layout: list + detail */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-4">
        <div className="border border-border rounded-lg bg-surface overflow-hidden max-h-[80vh] overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No submissions match this filter.
            </div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                onClick={() => setSelected(s)}
                className={`w-full text-left p-3 border-b border-border last:border-0 hover:bg-canvas/50 transition-colors ${
                  selected?.id === s.id ? "bg-canvas" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{s.user_name || s.user_email || "Unknown"}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      W{s.week_number} · {s.week_theme}
                    </p>
                    <p className="text-[10px] font-mono text-muted-foreground/70 mt-0.5">
                      {s.batch_name} · {formatRelative(s.submitted_at)}
                    </p>
                  </div>
                  <SubmissionStatusPill status={s.status} late={s.late} />
                </div>
              </button>
            ))
          )}
        </div>

        {/* Detail pane */}
        <div className="border border-border rounded-lg bg-surface min-h-[60vh] p-6">
          {selected ? (
            <ReviewPane key={selected.id} sub={selected} onSave={updateSubmission} />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <MessageSquare className="h-10 w-10 mb-3 opacity-30" />
              <p className="text-sm">Pick a submission to review</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewPane({ sub, onSave }: { sub: Submission; onSave: (id: string, patch: Partial<Submission>) => Promise<void> }) {
  const [feedback, setFeedback] = useState(sub.feedback_text || "");
  const [rating, setRating] = useState<number | null>(sub.rating);
  const [saving, setSaving] = useState(false);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Sign file URLs for download
  useEffect(() => {
    if (sub.file_urls.length === 0) return;
    (async () => {
      const map: Record<string, string> = {};
      for (const p of sub.file_urls) {
        const { data } = await supabase.storage.from("cohort-submissions").createSignedUrl(p, 3600);
        if (data) map[p] = data.signedUrl;
      }
      setSignedUrls(map);
    })();
  }, [sub.file_urls]);

  const doSave = async (newStatus: string) => {
    setSaving(true);
    await onSave(sub.id, { status: newStatus, feedback_text: feedback || null, rating });
    setSaving(false);
  };

  return (
    <div>
      <div className="pb-4 border-b border-border mb-4">
        <div className="flex items-center gap-2 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-1">
          <span>{sub.batch_name}</span>
          <span>·</span>
          <span>Week {sub.week_number}</span>
        </div>
        <h2 className="text-xl font-semibold">{sub.week_theme}</h2>
        <p className="text-sm text-muted-foreground mt-1 flex items-center gap-1.5">
          <User className="h-3.5 w-3.5" /> {sub.user_name || sub.user_email}
          <span className="opacity-50">· submitted {formatRelative(sub.submitted_at)}</span>
        </p>
      </div>

      {sub.text_content && (
        <div className="mb-5">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Submission text</p>
          <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-canvas/50 p-3 rounded border border-border">
            {sub.text_content}
          </div>
        </div>
      )}

      {sub.link_url && (
        <div className="mb-5">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Linked</p>
          <a href={sub.link_url} target="_blank" rel="noopener noreferrer" className="text-sm text-cream hover:underline inline-flex items-center gap-1">
            {sub.link_url} <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}

      {sub.file_urls.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">Files</p>
          <div className="space-y-2">
            {sub.file_urls.map((path) => (
              <a
                key={path}
                href={signedUrls[path] || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 p-2 border border-border rounded text-sm bg-canvas/50 hover:bg-canvas transition-colors"
              >
                <FileText className="h-4 w-4 text-cream flex-shrink-0" />
                <span className="truncate flex-1">{path.split("/").pop()}</span>
                {signedUrls[path] ? <ExternalLink className="h-3 w-3 text-muted-foreground" /> : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Mentor review form */}
      <div className="border-t border-border pt-5">
        <p className="text-xs font-mono uppercase tracking-wider text-cream mb-2">Your feedback</p>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={5}
          placeholder="What worked, what to push on next, references to look at…"
          className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none resize-y placeholder:text-muted-foreground/60"
        />

        <div className="flex items-center gap-3 mt-3">
          <p className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Rating</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                onClick={() => setRating(rating === n ? null : n)}
                className="p-0.5"
              >
                <Star className={`h-5 w-5 ${rating !== null && n <= rating ? "fill-cream text-cream" : "text-muted-foreground/40 hover:text-cream/60"}`} />
              </button>
            ))}
          </div>
          {rating !== null && (
            <button onClick={() => setRating(null)} className="text-xs text-muted-foreground hover:text-foreground ml-1">
              clear
            </button>
          )}
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          <button
            onClick={() => doSave("reviewed")}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 bg-cream text-cream-text text-sm font-medium rounded-md disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Send feedback (Reviewed)
          </button>
          <button
            onClick={() => doSave("cleared")}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 bg-green-500/20 text-green-300 text-sm font-medium rounded-md hover:bg-green-500/30"
          >
            Mark cleared
          </button>
          <button
            onClick={() => doSave("needs_revision")}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-4 bg-amber-500/20 text-amber-300 text-sm font-medium rounded-md hover:bg-amber-500/30"
          >
            Needs revision
          </button>
          <button
            onClick={() => doSave("under_review")}
            disabled={saving}
            className="inline-flex items-center gap-1.5 h-9 px-3 bg-surface border border-border text-muted-foreground hover:text-foreground text-xs font-medium rounded-md"
          >
            Mark as reviewing
          </button>
        </div>
      </div>
    </div>
  );
}

function SubmissionStatusPill({ status, late }: { status: string; late: boolean }) {
  const map: Record<string, { label: string; cls: string }> = {
    submitted: { label: "Pending", cls: "bg-blue-500/20 text-blue-300" },
    under_review: { label: "Reviewing", cls: "bg-cream/20 text-cream" },
    reviewed: { label: "Reviewed", cls: "bg-green-500/20 text-green-300" },
    cleared: { label: "Cleared", cls: "bg-green-500/20 text-green-300" },
    needs_revision: { label: "Revise", cls: "bg-amber-500/20 text-amber-300" },
    late: { label: "Late", cls: "bg-orange-500/20 text-orange-300" },
  };
  const c = map[status] || map.submitted;
  return (
    <div className="flex flex-col items-end gap-1 flex-shrink-0">
      <span className={`text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded ${c.cls}`}>
        {c.label}
      </span>
      {late && <span className="text-[9px] font-mono text-orange-300/80">late</span>}
    </div>
  );
}

function formatRelative(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}
