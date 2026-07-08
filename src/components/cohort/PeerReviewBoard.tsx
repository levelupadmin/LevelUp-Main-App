import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Users, MessageSquare, Star, X, FileText, ExternalLink,
  ChevronRight, CheckCircle2, Clock,
} from "lucide-react";

interface PeerReviewBoardProps {
  cohortBatchId: string;
  currentUserId: string;
}

interface OpenSubmission {
  id: string;
  user_id: string;
  user_name: string | null;
  cohort_week_id: string;
  week_number: number;
  week_theme: string;
  text_content: string | null;
  file_urls: string[];
  link_url: string | null;
  submitted_at: string;
  // peer review state (from peer_review_assignments + counts)
  total_reviews: number;
  my_review_status: "pending" | "in_progress" | "submitted" | "skipped" | null;
  my_review_id: string | null;
}

type Mode = "to_review" | "given";

export default function PeerReviewBoard({ cohortBatchId, currentUserId }: PeerReviewBoardProps) {
  const { toast } = useToast();
  const [submissions, setSubmissions] = useState<OpenSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("to_review");
  const [drawerSubmission, setDrawerSubmission] = useState<OpenSubmission | null>(null);

  const refresh = async () => {
    setLoading(true);
    // Pull all cohort-mate submissions opted-in to peer review (excluding mine).
    // The RLS policy cwsub_peer_review_read already enforces the same-batch +
    // open_to_peer_review constraint, but we filter in the query so we can
    // also exclude the user's own work and add metadata.
    const { data } = await supabase
      .from("cohort_week_submissions")
      .select(`
        id, user_id, cohort_week_id, text_content, file_urls, link_url, submitted_at,
        cohort_weeks:cohort_week_id (week_number, theme, cohort_batch_id),
        users:user_id (full_name)
      `)
      .eq("open_to_peer_review", true)
      .neq("user_id", currentUserId)
      .order("submitted_at", { ascending: false });

    if (!data) { setSubmissions([]); setLoading(false); return; }

    const sameBatch = (data as any[]).filter((s) => s.cohort_weeks?.cohort_batch_id === cohortBatchId);
    const ids = sameBatch.map((s: any) => s.id);

    // Reviewer counts + my own review (if any)
    const [{ data: allReviews }, { data: mine }] = await Promise.all([
      supabase.from("peer_review_assignments").select("submission_id, status").in("submission_id", ids),
      supabase.from("peer_review_assignments").select("id, submission_id, status").in("submission_id", ids).eq("reviewer_user_id", currentUserId),
    ]);
    const totalMap: Record<string, number> = {};
    (allReviews || []).forEach((r: any) => {
      if (r.status === "submitted") totalMap[r.submission_id] = (totalMap[r.submission_id] || 0) + 1;
    });
    const mineMap = new Map((mine || []).map((m: any) => [m.submission_id, m]));

    const flat: OpenSubmission[] = sameBatch.map((s: any) => ({
      id: s.id,
      user_id: s.user_id,
      user_name: s.users?.full_name ?? null,
      cohort_week_id: s.cohort_week_id,
      week_number: s.cohort_weeks?.week_number,
      week_theme: s.cohort_weeks?.theme,
      text_content: s.text_content,
      file_urls: s.file_urls || [],
      link_url: s.link_url,
      submitted_at: s.submitted_at,
      total_reviews: totalMap[s.id] || 0,
      my_review_status: mineMap.get(s.id)?.status ?? null,
      my_review_id: mineMap.get(s.id)?.id ?? null,
    }));
    setSubmissions(flat);
    setLoading(false);
  };

  useEffect(() => {
    if (!cohortBatchId || !currentUserId) return;
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortBatchId, currentUserId]);

  const visible = useMemo(() => {
    if (mode === "to_review") {
      // Submissions where I haven't submitted a review yet
      return submissions.filter((s) => s.my_review_status !== "submitted");
    }
    // mode = "given"
    return submissions.filter((s) => s.my_review_status === "submitted");
  }, [mode, submissions]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-1 bg-surface border border-border rounded-lg w-fit mb-4">
        <button
          onClick={() => setMode("to_review")}
          className={`px-3 h-8 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors ${
            mode === "to_review"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Users className="h-3 w-3" /> To review · {submissions.filter((s) => s.my_review_status !== "submitted").length}
        </button>
        <button
          onClick={() => setMode("given")}
          className={`px-3 h-8 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors ${
            mode === "given"
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <CheckCircle2 className="h-3 w-3" /> Reviews I've given · {submissions.filter((s) => s.my_review_status === "submitted").length}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="border border-border rounded-lg p-10 text-center bg-surface">
          <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">
            {mode === "to_review"
              ? "Nothing from your cohort-mates to review right now."
              : "You haven't reviewed any work yet. Critique sharpens your own eye, so start with the first card."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((s) => (
            <button
              key={s.id}
              onClick={() => setDrawerSubmission(s)}
              className="w-full text-left border border-border rounded-lg p-4 bg-surface hover:bg-surface/60 hover:border-cream/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground">{s.user_name || "Cohort-mate"}</span>
                    <span className="text-xs font-mono text-muted-foreground">W{String(s.week_number).padStart(2, "0")}</span>
                    <span className="text-xs font-mono text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{s.week_theme}</span>
                  </div>
                  {s.text_content && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{s.text_content}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/70">
                    {s.file_urls.length > 0 && (
                      <span><FileText className="inline h-3 w-3 mr-0.5" /> {s.file_urls.length} file{s.file_urls.length === 1 ? "" : "s"}</span>
                    )}
                    {s.link_url && <span><ExternalLink className="inline h-3 w-3 mr-0.5" /> link</span>}
                    <span><Users className="inline h-3 w-3 mr-0.5" /> {s.total_reviews} peer review{s.total_reviews === 1 ? "" : "s"}</span>
                  </div>
                </div>
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  {s.my_review_status === "submitted" ? (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--success)/0.2)] text-[hsl(var(--success))]">Done</span>
                  ) : s.my_review_status === "in_progress" ? (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.2)] text-[hsl(var(--accent-amber))]">Draft</span>
                  ) : (
                    <span className="text-xs text-cream font-medium inline-flex items-center gap-0.5">
                      Review <ChevronRight className="h-3 w-3" />
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {drawerSubmission && (
        <PeerReviewDrawer
          submission={drawerSubmission}
          reviewerUserId={currentUserId}
          onClose={() => setDrawerSubmission(null)}
          onSubmitted={async () => { await refresh(); setDrawerSubmission(null); }}
        />
      )}
    </div>
  );
}

/* ─────────── Drawer with full submission + review form ─────────── */

function PeerReviewDrawer({
  submission,
  reviewerUserId,
  onClose,
  onSubmitted,
}: {
  submission: OpenSubmission;
  reviewerUserId: string;
  onClose: () => void;
  onSubmitted: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [feedback, setFeedback] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  // Load existing draft (if any) + sign files
  useEffect(() => {
    (async () => {
      const { data: existing } = await supabase
        .from("peer_review_assignments")
        .select("id, feedback_text, rating, status")
        .eq("submission_id", submission.id)
        .eq("reviewer_user_id", reviewerUserId)
        .maybeSingle();
      if (existing) {
        setExistingId(existing.id);
        setFeedback(existing.feedback_text || "");
        setRating(existing.rating);
      }
      // Sign URLs for files
      if (submission.file_urls.length > 0) {
        const map: Record<string, string> = {};
        for (const path of submission.file_urls) {
          const { data } = await supabase.storage.from("cohort-submissions").createSignedUrl(path, 3600);
          if (data) map[path] = data.signedUrl;
        }
        setSignedUrls(map);
      }
    })();
  }, [submission.id, submission.file_urls, reviewerUserId]);

  const save = async (status: "in_progress" | "submitted") => {
    if (status === "submitted" && !feedback.trim()) {
      toast({ title: "Write something before submitting", variant: "destructive" });
      return;
    }
    setSaving(true);
    if (existingId) {
      const { error } = await supabase
        .from("peer_review_assignments")
        .update({
          feedback_text: feedback.trim() || null,
          rating,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .eq("id", existingId);
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { error, data } = await supabase
        .from("peer_review_assignments")
        .insert({
          submission_id: submission.id,
          reviewer_user_id: reviewerUserId,
          feedback_text: feedback.trim() || null,
          rating,
          status,
          submitted_at: status === "submitted" ? new Date().toISOString() : null,
        })
        .select("id")
        .single();
      if (error) {
        toast({ title: "Save failed", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      setExistingId(data.id);
    }
    setSaving(false);
    if (status === "submitted") {
      toast({ title: "Review submitted", description: "Thanks for sharing your take." });
      await onSubmitted();
    } else {
      toast({ title: "Draft saved" });
    }
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/70 animate-fade-in" onClick={onClose} />
      <div className="absolute right-0 top-0 bottom-0 w-full max-w-2xl bg-canvas border-l border-border overflow-y-auto animate-slide-left-in">
        <div className="sticky top-0 z-10 bg-canvas/95 backdrop-blur-sm border-b border-border px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Peer review · Week {submission.week_number}
            </p>
            <h2 className="text-lg font-semibold truncate">{submission.week_theme}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              by {submission.user_name || "Cohort-mate"} · {new Date(submission.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* The submission */}
          {submission.text_content && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Their submission</p>
              <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-surface p-3 rounded border border-border">
                {submission.text_content}
              </div>
            </div>
          )}
          {submission.link_url && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Linked</p>
              <a href={submission.link_url} target="_blank" rel="noopener noreferrer" className="text-sm text-cream hover:underline inline-flex items-center gap-1">
                {submission.link_url} <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          )}
          {submission.file_urls.length > 0 && (
            <div>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Files</p>
              <div className="space-y-2">
                {submission.file_urls.map((path) => (
                  <a
                    key={path}
                    href={signedUrls[path] || "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 border border-border rounded text-sm bg-surface hover:bg-surface/80 transition-colors"
                  >
                    <FileText className="h-4 w-4 text-cream flex-shrink-0" />
                    <span className="truncate flex-1">{path.split("/").pop()}</span>
                    {signedUrls[path] ? <ExternalLink className="h-3 w-3 text-muted-foreground" /> : <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Critique form */}
          <div className="border-t border-border pt-5">
            <p className="text-[10px] font-mono uppercase tracking-widest text-cream mb-3 inline-flex items-center gap-1.5">
              <MessageSquare className="h-3 w-3" /> Your critique
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              Be specific. Cite what's working, name what's pulling against the story, suggest one next move.
            </p>
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={7}
              placeholder="What works…&#10;What needs work…&#10;What I'd try next…"
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none resize-y placeholder:text-muted-foreground/50"
            />

            <div className="flex items-center gap-3 mt-3">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Rating</p>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setRating(rating === n ? null : n)} className="p-0.5" type="button">
                    <Star className={`h-5 w-5 ${rating !== null && n <= rating ? "fill-cream text-cream" : "text-muted-foreground/40 hover:text-cream/60"}`} />
                  </button>
                ))}
              </div>
              {rating !== null && (
                <button onClick={() => setRating(null)} className="text-xs text-muted-foreground hover:text-foreground ml-1" type="button">
                  clear
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
              <button
                onClick={() => save("submitted")}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-10 px-5 bg-cream text-cream-text text-sm font-medium rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Submit review
              </button>
              <button
                onClick={() => save("in_progress")}
                disabled={saving}
                className="inline-flex items-center gap-1.5 h-10 px-4 bg-surface border border-border text-muted-foreground hover:text-foreground text-sm font-medium rounded-md"
              >
                <Clock className="h-3.5 w-3.5" /> Save draft
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
