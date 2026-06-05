import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import usePageTitle from "@/hooks/usePageTitle";
import { Bell, Download, Check, Loader2, RefreshCw, Inbox } from "lucide-react";

// course_notify_requests isn't in the generated Supabase types yet; go through
// an any-typed client (same pattern as other freshly-added tables).
const db = supabase as unknown as { from: (t: string) => any };

interface NotifyRow {
  id: string;
  course_id: string;
  email: string | null;
  created_at: string;
  notified_at: string | null;
}

interface CourseGroup {
  courseId: string;
  title: string;
  status: string;
  rows: NotifyRow[];
  pending: number;
}

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso));

const AdminNotifyRequests = () => {
  usePageTitle("Launch Interest");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<CourseGroup[]>([]);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: reqs, error: reqErr }, { data: courses }] = await Promise.all([
        db
          .from("course_notify_requests")
          .select("id, course_id, email, created_at, notified_at")
          .order("created_at", { ascending: false }),
        supabase.from("courses").select("id, title, status"),
      ]);
      if (reqErr) throw reqErr;

      const titleMap = new Map<string, { title: string; status: string }>();
      (courses || []).forEach((c: { id: string; title: string; status: string }) =>
        titleMap.set(c.id, { title: c.title, status: c.status })
      );

      const byCourse = new Map<string, NotifyRow[]>();
      (reqs || []).forEach((r: NotifyRow) => {
        const arr = byCourse.get(r.course_id) || [];
        arr.push(r);
        byCourse.set(r.course_id, arr);
      });

      const g: CourseGroup[] = [...byCourse.entries()]
        .map(([courseId, rows]) => ({
          courseId,
          title: titleMap.get(courseId)?.title || "Unknown course",
          status: titleMap.get(courseId)?.status || "",
          rows,
          pending: rows.filter((r) => !r.notified_at).length,
        }))
        .sort((a, b) => b.pending - a.pending || b.rows.length - a.rows.length);

      setGroups(g);
    } catch {
      setError("Couldn't load notify requests. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const totalPending = useMemo(() => groups.reduce((n, g) => n + g.pending, 0), [groups]);
  const totalRequests = useMemo(() => groups.reduce((n, g) => n + g.rows.length, 0), [groups]);

  const exportCsv = (g: CourseGroup) => {
    const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv =
      "email,requested_at,notified_at\n" +
      g.rows.map((r) => [r.email, r.created_at, r.notified_at].map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `notify-${g.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const markNotified = async (g: CourseGroup) => {
    if (g.pending === 0) return;
    setWorking(g.courseId);
    const { error: e } = await db
      .from("course_notify_requests")
      .update({ notified_at: new Date().toISOString() })
      .eq("course_id", g.courseId)
      .is("notified_at", null);
    setWorking(null);
    if (e) {
      toast.error("Couldn't update. Please retry.");
      return;
    }
    toast.success(`Marked ${g.pending} request${g.pending === 1 ? "" : "s"} as notified.`);
    load();
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Communications</p>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6 text-cream" /> Launch Interest
          </h1>
          <p className="text-muted-foreground max-w-[60ch]">
            Students who tapped “Notify me” on an upcoming course. Export the list (or build an
            Email Campaign to it), then mark them notified so a later launch blast won't double-send.
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" onClick={() => load()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {!loading && !error && groups.length > 0 && (
        <div className="flex gap-6 text-sm">
          <span className="text-muted-foreground">Total requests: <strong className="text-foreground">{totalRequests}</strong></span>
          <span className="text-muted-foreground">Awaiting notification: <strong className="text-foreground">{totalPending}</strong></span>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-surface animate-pulse ring-1 ring-white/5" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="text-lg font-medium text-foreground mb-1">Something went wrong</p>
          <p className="text-muted-foreground text-sm mb-4">{error}</p>
          <Button onClick={() => load()} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <div className="text-center py-16">
          <Inbox className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-lg font-medium text-foreground mb-1">No notify requests yet</p>
          <p className="text-muted-foreground text-sm">
            When students tap “Notify me” on an upcoming course, they'll show up here.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((g) => (
            <div key={g.courseId} className="rounded-xl bg-surface ring-1 ring-white/5 p-5">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    {g.title}
                    {g.status === "upcoming" && (
                      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-foreground/10 text-muted-foreground">
                        Upcoming
                      </span>
                    )}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    {g.rows.length} interested
                    {g.pending > 0 && <> · <span className="text-cream">{g.pending} not yet notified</span></>}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-2" onClick={() => exportCsv(g)}>
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2"
                    disabled={g.pending === 0 || working === g.courseId}
                    onClick={() => markNotified(g)}
                  >
                    {working === g.courseId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Mark notified
                  </Button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {g.rows.slice(0, 24).map((r) => (
                  <span
                    key={r.id}
                    className={`text-xs px-2 py-1 rounded-md ring-1 ${
                      r.notified_at ? "bg-surface-2 text-muted-foreground ring-white/5" : "bg-cream/10 text-foreground ring-cream/20"
                    }`}
                    title={`${r.notified_at ? "Notified" : "Pending"} · requested ${fmtDate(r.created_at)}`}
                  >
                    {r.email || "—"}
                  </span>
                ))}
                {g.rows.length > 24 && (
                  <span className="text-xs px-2 py-1 text-muted-foreground">+{g.rows.length - 24} more (export for full list)</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminNotifyRequests;
