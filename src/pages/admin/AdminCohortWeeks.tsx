import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, ChevronLeft, ChevronUp, ChevronDown, Trash2, Save, Calendar, FileText, ClipboardCheck } from "lucide-react";
import usePageTitle from "@/hooks/usePageTitle";

interface CohortWeek {
  id: string;
  cohort_batch_id: string;
  week_number: number;
  theme: string;
  description: string | null;
  starts_on: string;
  ends_on: string;
  assignment_prompt: string | null;
  assignment_due_at: string | null;
  feedback_session_at: string | null;
  status: "upcoming" | "active" | "completed" | "archived";
  sort_order: number;
}

interface Batch {
  id: string;
  name: string;
  offering_id: string;
}

interface Offering {
  id: string;
  title: string;
  slug: string;
}

const STATUS_OPTIONS = [
  { value: "upcoming", label: "Upcoming", className: "bg-blue-500/20 text-blue-300" },
  { value: "active", label: "Active", className: "bg-green-500/20 text-green-300" },
  { value: "completed", label: "Completed", className: "bg-gray-500/20 text-gray-300" },
  { value: "archived", label: "Archived", className: "bg-zinc-500/20 text-zinc-400" },
] as const;

export default function AdminCohortWeeks() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  usePageTitle("Cohort Weeks");

  const [offering, setOffering] = useState<Offering | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<CohortWeek[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Load offering + batches
  useEffect(() => {
    if (!offeringId) return;
    (async () => {
      setLoading(true);
      const { data: off } = await supabase
        .from("offerings")
        .select("id, title, slug")
        .eq("id", offeringId)
        .single();
      setOffering(off);
      const { data: b } = await supabase
        .from("cohort_batches")
        .select("id, name, offering_id")
        .eq("offering_id", offeringId)
        .order("created_at", { ascending: false });
      setBatches(b || []);
      if (b && b.length > 0 && !selectedBatch) {
        setSelectedBatch(b[0].id);
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offeringId]);

  // Load weeks for selected batch
  useEffect(() => {
    if (!selectedBatch) {
      setWeeks([]);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("cohort_weeks")
        .select("*")
        .eq("cohort_batch_id", selectedBatch)
        .order("week_number", { ascending: true });
      setWeeks((data as CohortWeek[]) || []);
    })();
  }, [selectedBatch]);

  const handleAddWeek = async () => {
    if (!selectedBatch) {
      toast({ title: "Pick a batch first", variant: "destructive" });
      return;
    }
    const nextNum = (weeks[weeks.length - 1]?.week_number ?? 0) + 1;
    const today = new Date();
    const startDate = new Date(today);
    const endDate = new Date(today);
    endDate.setDate(today.getDate() + 6);
    const { data, error } = await supabase
      .from("cohort_weeks")
      .insert({
        cohort_batch_id: selectedBatch,
        week_number: nextNum,
        theme: `Week ${nextNum}`,
        description: null,
        starts_on: startDate.toISOString().slice(0, 10),
        ends_on: endDate.toISOString().slice(0, 10),
        status: "upcoming",
      })
      .select()
      .single();
    if (error) {
      toast({ title: "Couldn't create week", description: error.message, variant: "destructive" });
      return;
    }
    setWeeks((prev) => [...prev, data as CohortWeek]);
    toast({ title: `Week ${nextNum} added` });
  };

  const handleUpdate = async (weekId: string, patch: Partial<CohortWeek>) => {
    setSavingId(weekId);
    const { error } = await supabase.from("cohort_weeks").update(patch).eq("id", weekId);
    setSavingId(null);
    if (error) {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
      return;
    }
    setWeeks((prev) => prev.map((w) => (w.id === weekId ? { ...w, ...patch } : w)));
  };

  const handleDelete = async (weekId: string) => {
    if (!confirm("Delete this week? Submissions and attendance for it will also be deleted.")) return;
    const { error } = await supabase.from("cohort_weeks").delete().eq("id", weekId);
    if (error) {
      toast({ title: "Delete failed", description: error.message, variant: "destructive" });
      return;
    }
    setWeeks((prev) => prev.filter((w) => w.id !== weekId));
    toast({ title: "Week deleted" });
  };

  const handleReorder = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= weeks.length) return;
    const a = weeks[idx], b = weeks[target];
    const tmpNum = a.week_number;
    // Two-step swap to avoid unique constraint clash
    await supabase.from("cohort_weeks").update({ week_number: -tmpNum }).eq("id", a.id);
    await supabase.from("cohort_weeks").update({ week_number: tmpNum }).eq("id", b.id);
    await supabase.from("cohort_weeks").update({ week_number: b.week_number }).eq("id", a.id);
    const { data } = await supabase
      .from("cohort_weeks")
      .select("*")
      .eq("cohort_batch_id", selectedBatch!)
      .order("week_number", { ascending: true });
    setWeeks((data as CohortWeek[]) || []);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl py-8 px-4">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
        <Link to="/admin/offerings" className="hover:text-foreground">Offerings</Link>
        <span>/</span>
        <Link to={`/admin/offerings/${offeringId}/edit`} className="hover:text-foreground">
          {offering?.title || "…"}
        </Link>
        <span>/</span>
        <span className="text-foreground">Cohort Weeks</span>
      </div>

      <div className="flex items-start justify-between mb-8 gap-4">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Back
          </button>
          <h1 className="text-3xl font-semibold tracking-tight">
            Cohort weeks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {offering?.title} · {batches.length} {batches.length === 1 ? "batch" : "batches"}
          </p>
        </div>

        <button
          onClick={handleAddWeek}
          disabled={!selectedBatch}
          className="inline-flex items-center gap-1.5 h-10 px-4 bg-cream text-cream-text font-medium rounded-md hover:-translate-y-0.5 transition-transform disabled:opacity-50 disabled:hover:translate-y-0"
        >
          <Plus className="h-4 w-4" /> Add week
        </button>
      </div>

      {/* Batch selector */}
      {batches.length === 0 ? (
        <div className="border border-border rounded-lg p-8 text-center bg-surface">
          <p className="text-sm text-muted-foreground mb-3">
            No cohort batches exist for this offering yet.
          </p>
          <Link
            to="/admin/cohorts"
            className="text-sm text-cream hover:underline"
          >
            Create a batch first →
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
            {batches.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBatch(b.id)}
                className={`px-4 h-9 text-sm font-medium rounded-md border transition-colors whitespace-nowrap ${
                  selectedBatch === b.id
                    ? "bg-foreground text-background border-foreground"
                    : "bg-surface border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                }`}
              >
                {b.name}
              </button>
            ))}
          </div>

          {weeks.length === 0 ? (
            <div className="border border-border rounded-lg p-12 text-center bg-surface">
              <Calendar className="h-10 w-10 text-muted-foreground/40 mx-auto mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                No weeks yet for this batch.
              </p>
              <button
                onClick={handleAddWeek}
                className="inline-flex items-center gap-1.5 h-9 px-3 bg-cream text-cream-text text-sm font-medium rounded-md"
              >
                <Plus className="h-3.5 w-3.5" /> Add the first week
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {weeks.map((w, idx) => (
                <WeekRow
                  key={w.id}
                  week={w}
                  saving={savingId === w.id}
                  onUpdate={(patch) => handleUpdate(w.id, patch)}
                  onDelete={() => handleDelete(w.id)}
                  onMoveUp={idx > 0 ? () => handleReorder(idx, -1) : undefined}
                  onMoveDown={idx < weeks.length - 1 ? () => handleReorder(idx, 1) : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function WeekRow({
  week,
  saving,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  week: CohortWeek;
  saving: boolean;
  onUpdate: (patch: Partial<CohortWeek>) => Promise<void>;
  onDelete: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState({
    theme: week.theme,
    description: week.description ?? "",
    starts_on: week.starts_on,
    ends_on: week.ends_on,
    assignment_prompt: week.assignment_prompt ?? "",
    assignment_due_at: week.assignment_due_at ? week.assignment_due_at.slice(0, 16) : "",
    feedback_session_at: week.feedback_session_at ? week.feedback_session_at.slice(0, 16) : "",
    status: week.status,
  });

  const dirty =
    local.theme !== week.theme ||
    local.description !== (week.description ?? "") ||
    local.starts_on !== week.starts_on ||
    local.ends_on !== week.ends_on ||
    local.assignment_prompt !== (week.assignment_prompt ?? "") ||
    local.assignment_due_at !== (week.assignment_due_at ? week.assignment_due_at.slice(0, 16) : "") ||
    local.feedback_session_at !== (week.feedback_session_at ? week.feedback_session_at.slice(0, 16) : "") ||
    local.status !== week.status;

  const handleSave = () => {
    onUpdate({
      theme: local.theme,
      description: local.description || null,
      starts_on: local.starts_on,
      ends_on: local.ends_on,
      assignment_prompt: local.assignment_prompt || null,
      assignment_due_at: local.assignment_due_at ? new Date(local.assignment_due_at).toISOString() : null,
      feedback_session_at: local.feedback_session_at ? new Date(local.feedback_session_at).toISOString() : null,
      status: local.status,
    });
  };

  const statusPill = STATUS_OPTIONS.find((s) => s.value === week.status);

  return (
    <div className="border border-border rounded-lg bg-surface overflow-hidden">
      {/* Collapsed header */}
      <div className="flex items-center gap-3 p-4">
        <div className="flex flex-col">
          <button onClick={onMoveUp} disabled={!onMoveUp} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronUp className="h-3 w-3" />
          </button>
          <button onClick={onMoveDown} disabled={!onMoveDown} className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30">
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
        <div className="font-mono text-xs text-muted-foreground w-12">
          W{String(week.week_number).padStart(2, "0")}
        </div>
        <button
          onClick={() => setExpanded((x) => !x)}
          className="flex-1 text-left flex items-center justify-between"
        >
          <div>
            <p className="font-medium text-foreground">{local.theme || `Week ${week.week_number}`}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {local.starts_on} → {local.ends_on}
              {week.assignment_prompt && <span> · <FileText className="inline h-3 w-3" /> assignment set</span>}
            </p>
          </div>
        </button>
        <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded ${statusPill?.className || ""}`}>
          {statusPill?.label}
        </span>
        {dirty && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-1 h-8 px-3 bg-cream text-cream-text text-xs font-semibold rounded-md disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Save
          </button>
        )}
        <button onClick={onDelete} className="p-2 text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4 bg-canvas/50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Theme</label>
              <input
                value={local.theme}
                onChange={(e) => setLocal({ ...local, theme: e.target.value })}
                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none"
                placeholder="e.g. Logline & Treatment"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Status</label>
              <select
                value={local.status}
                onChange={(e) => setLocal({ ...local, status: e.target.value as CohortWeek["status"] })}
                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Starts on</label>
              <input
                type="date"
                value={local.starts_on}
                onChange={(e) => setLocal({ ...local, starts_on: e.target.value })}
                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Ends on</label>
              <input
                type="date"
                value={local.ends_on}
                onChange={(e) => setLocal({ ...local, ends_on: e.target.value })}
                className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Description (optional)</label>
            <textarea
              value={local.description}
              onChange={(e) => setLocal({ ...local, description: e.target.value })}
              rows={2}
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none resize-y"
              placeholder="What's the focus this week? Optional context students see."
            />
          </div>

          <div className="border-t border-border pt-4">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-cream" />
              <span className="text-sm font-medium">Assignment</span>
            </div>
            <textarea
              value={local.assignment_prompt}
              onChange={(e) => setLocal({ ...local, assignment_prompt: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none resize-y"
              placeholder="The week's deliverable. e.g. 'Submit a 2-paragraph treatment for your short film…'"
            />
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted-foreground block mb-1">Assignment due</label>
                <input
                  type="datetime-local"
                  value={local.assignment_due_at}
                  onChange={(e) => setLocal({ ...local, assignment_due_at: e.target.value })}
                  className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  <ClipboardCheck className="inline h-3 w-3 mr-1" /> Feedback session
                </label>
                <input
                  type="datetime-local"
                  value={local.feedback_session_at}
                  onChange={(e) => setLocal({ ...local, feedback_session_at: e.target.value })}
                  className="w-full h-9 px-3 bg-background border border-input rounded-md text-sm focus:border-foreground outline-none"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
