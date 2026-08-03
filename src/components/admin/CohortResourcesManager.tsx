import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  FileText,
  Link,
  Pencil,
  PlayCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface BatchOption {
  id: string;
  name: string;
}

interface WeekOption {
  id: string;
  cohort_batch_id: string;
  week_number: number;
  theme: string | null;
}

interface AdminResource {
  id: string;
  offering_id: string;
  batch_id: string | null;
  cohort_week_id: string | null;
  title: string;
  kind: "link" | "file" | "video";
  url: string;
  sort_order: number;
  created_at: string;
}

interface CohortResourcesManagerProps {
  offeringId: string;
  batches: BatchOption[];
}

interface ResourceDbResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface ResourceDbQuery extends PromiseLike<ResourceDbResult> {
  select: (columns: string) => ResourceDbQuery;
  eq: (column: string, value: string) => ResourceDbQuery;
  in: (column: string, values: string[]) => ResourceDbQuery;
  order: (column: string, options?: { ascending?: boolean }) => ResourceDbQuery;
  insert: (values: Record<string, unknown>) => ResourceDbQuery;
  update: (values: Record<string, unknown>) => ResourceDbQuery;
  delete: () => ResourceDbQuery;
}

const resourceDb = supabase as unknown as {
  from: (table: string) => ResourceDbQuery;
};

const EMPTY_FORM = {
  title: "",
  url: "",
  kind: "link" as AdminResource["kind"],
  batchId: "all",
  weekId: "none",
  sortOrder: "0",
};

const CohortResourcesManager = ({
  offeringId,
  batches,
}: CohortResourcesManagerProps) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [weeks, setWeeks] = useState<WeekOption[]>([]);
  const [resources, setResources] = useState<AdminResource[]>([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const loadRequest = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++loadRequest.current;
    setLoading(true);
    const batchIds = batches.map((batch) => batch.id);
    const resourcesPromise = resourceDb
      .from("cohort_resources")
      .select(
        "id, offering_id, batch_id, cohort_week_id, title, kind, url, sort_order, created_at",
      )
      .eq("offering_id", offeringId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    const weeksPromise =
      batchIds.length > 0
        ? resourceDb
            .from("cohort_weeks")
            .select("id, cohort_batch_id, week_number, theme")
            .in("cohort_batch_id", batchIds)
            .order("week_number", { ascending: true })
        : Promise.resolve({ data: [], error: null });

    const [resourceResult, weekResult] = await Promise.all([
      resourcesPromise,
      weeksPromise,
    ]);
    // Selecting another offering starts a newer request. Do not let this older
    // response overwrite its binder or surface a stale error toast.
    if (requestId !== loadRequest.current) return;
    if (resourceResult.error || weekResult.error) {
      toast({
        title: "Resources did not load",
        description: resourceResult.error?.message ?? weekResult.error?.message,
        variant: "destructive",
      });
    }
    setResources((resourceResult.data ?? []) as AdminResource[]);
    setWeeks((weekResult.data ?? []) as WeekOption[]);
    setLoading(false);
  }, [batches, offeringId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setDeleteId(null);
  }, [offeringId]);

  const selectedWeeks = useMemo(
    () =>
      form.batchId === "all"
        ? []
        : weeks.filter((week) => week.cohort_batch_id === form.batchId),
    [form.batchId, weeks],
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.url.trim()) {
      toast({ title: "Title and URL are required", variant: "destructive" });
      return;
    }
    if (!user?.id) {
      toast({ title: "Your session has expired", variant: "destructive" });
      return;
    }

    const payload = {
      offering_id: offeringId,
      batch_id: form.batchId === "all" ? null : form.batchId,
      cohort_week_id: form.weekId === "none" ? null : form.weekId,
      title: form.title.trim(),
      kind: form.kind,
      url: form.url.trim(),
      sort_order: Number.parseInt(form.sortOrder, 10) || 0,
    };
    setSaving(true);
    const result = editingId
      ? await resourceDb
          .from("cohort_resources")
          .update(payload)
          .eq("id", editingId)
      : await resourceDb
          .from("cohort_resources")
          .insert({ ...payload, added_by: user.id });
    setSaving(false);

    if (result.error) {
      toast({
        title: "Resource did not save",
        description: result.error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: editingId ? "Resource updated" : "Resource added" });
    resetForm();
    await load();
  };

  const edit = (resource: AdminResource) => {
    setEditingId(resource.id);
    setForm({
      title: resource.title,
      url: resource.url,
      kind: resource.kind,
      batchId: resource.batch_id ?? "all",
      weekId: resource.cohort_week_id ?? "none",
      sortOrder: String(resource.sort_order),
    });
  };

  const remove = async (id: string) => {
    const { error } = await resourceDb
      .from("cohort_resources")
      .delete()
      .eq("id", id);
    setDeleteId(null);
    if (error) {
      toast({
        title: "Resource was not removed",
        description: error.message,
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Resource removed" });
    if (editingId === id) resetForm();
    await load();
  };

  const batchName = (id: string | null) =>
    batches.find((batch) => batch.id === id)?.name ?? "All batches";
  const weekLabel = (id: string | null) => {
    const week = weeks.find((item) => item.id === id);
    return week
      ? `Week ${week.week_number}${week.theme ? `: ${week.theme}` : ""}`
      : "Pinned";
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
      <section
        className="rounded-xl border border-border bg-card p-5"
        aria-labelledby="admin-resource-list"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 id="admin-resource-list" className="text-base font-semibold">
              Resource binder
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Pinned material appears first, followed by each batch week.
            </p>
          </div>
          <span className="font-mono text-xs text-muted-foreground">
            {resources.length} total
          </span>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Loading resources...
          </p>
        ) : resources.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            No resources yet.
          </p>
        ) : (
          <div className="space-y-2">
            {resources.map((resource) => {
              const Icon =
                resource.kind === "video"
                  ? PlayCircle
                  : resource.kind === "file"
                    ? FileText
                    : Link;
              return (
                <div
                  key={resource.id}
                  className="flex min-h-11 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-3"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-sm font-medium">
                      {resource.title}
                    </p>
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                      {batchName(resource.batch_id)} ·{" "}
                      {weekLabel(resource.cohort_week_id)} · order{" "}
                      {resource.sort_order}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="h-11 w-11"
                    aria-label={`Edit ${resource.title}`}
                    onClick={() => edit(resource)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  {deleteId === resource.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        className="min-h-11"
                        onClick={() => void remove(resource.id)}
                      >
                        Remove
                      </Button>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-11 w-11"
                        aria-label="Cancel removal"
                        onClick={() => setDeleteId(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-11 w-11 text-destructive"
                      aria-label={`Remove ${resource.title}`}
                      onClick={() => setDeleteId(resource.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section
        className="h-fit rounded-xl border border-border bg-card p-5"
        aria-labelledby="admin-resource-form"
      >
        <div className="mb-4 flex items-center justify-between gap-2">
          <h2 id="admin-resource-form" className="text-base font-semibold">
            {editingId ? "Edit resource" : "Add resource"}
          </h2>
          {editingId && (
            <Button type="button" size="sm" variant="ghost" onClick={resetForm}>
              Cancel edit
            </Button>
          )}
        </div>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label
              htmlFor="resource-title"
              className="mb-1 block text-sm font-medium"
            >
              Title
            </label>
            <Input
              id="resource-title"
              value={form.title}
              maxLength={240}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  title: event.target.value,
                }))
              }
              placeholder="Week 3 lighting reference"
            />
          </div>
          <div>
            <label
              htmlFor="resource-url"
              className="mb-1 block text-sm font-medium"
            >
              URL
            </label>
            <Input
              id="resource-url"
              type="url"
              value={form.url}
              onChange={(event) =>
                setForm((current) => ({ ...current, url: event.target.value }))
              }
              placeholder="https://..."
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium">Kind</label>
              <Select
                value={form.kind}
                onValueChange={(value: AdminResource["kind"]) =>
                  setForm((current) => ({ ...current, kind: value }))
                }
              >
                <SelectTrigger className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label
                htmlFor="resource-order"
                className="mb-1 block text-sm font-medium"
              >
                Sort order
              </label>
              <Input
                id="resource-order"
                type="number"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    sortOrder: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Batch</label>
            <Select
              value={form.batchId}
              onValueChange={(value) =>
                setForm((current) => ({
                  ...current,
                  batchId: value,
                  weekId: "none",
                }))
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All batches</SelectItem>
                {batches.map((batch) => (
                  <SelectItem key={batch.id} value={batch.id}>
                    {batch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Week</label>
            <Select
              value={form.weekId}
              disabled={form.batchId === "all"}
              onValueChange={(value) =>
                setForm((current) => ({ ...current, weekId: value }))
              }
            >
              <SelectTrigger className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Pinned, no week</SelectItem>
                {selectedWeeks.map((week) => (
                  <SelectItem key={week.id} value={week.id}>
                    Week {week.week_number}
                    {week.theme ? `: ${week.theme}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            type="submit"
            disabled={saving}
            className="min-h-11 w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
          >
            <Plus className="mr-2 h-4 w-4" />{" "}
            {saving ? "Saving..." : editingId ? "Save changes" : "Add resource"}
          </Button>
        </form>
      </section>
    </div>
  );
};

export default CohortResourcesManager;
