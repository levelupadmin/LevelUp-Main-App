import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Search,
  MoreHorizontal,
  Eye,
  StickyNote,
  CheckCircle2,
  XCircle,
  Bell,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

/* ── Status definitions ── */
const ALL_STATUSES = [
  "submitted",
  "app_fee_paid",
  "interview_scheduled",
  "interview_done",
  "accepted",
  "rejected",
  "confirmation_paid",
  "balance_paid",
  "enrolled",
  "withdrawn",
  "waitlisted",
] as const;

type AppStatus = (typeof ALL_STATUSES)[number];

const STATUS_COLORS: Record<AppStatus, string> = {
  submitted: "bg-gray-600/20 text-gray-300 border-gray-600/40",
  app_fee_paid: "bg-blue-600/20 text-blue-300 border-blue-600/40",
  interview_scheduled: "bg-amber-600/20 text-amber-300 border-amber-600/40",
  interview_done: "bg-cyan-600/20 text-cyan-300 border-cyan-600/40",
  accepted: "bg-green-600/20 text-green-300 border-green-600/40",
  rejected: "bg-red-600/20 text-red-300 border-red-600/40",
  confirmation_paid: "bg-violet-600/20 text-violet-300 border-violet-600/40",
  balance_paid: "bg-indigo-600/20 text-indigo-300 border-indigo-600/40",
  enrolled: "bg-emerald-600/20 text-emerald-300 border-emerald-600/40",
  withdrawn: "bg-orange-600/20 text-orange-300 border-orange-600/40",
  waitlisted: "bg-yellow-600/20 text-yellow-300 border-yellow-600/40",
};

function statusLabel(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ── Valid forward transitions (prevents backward moves) ── */
const VALID_TRANSITIONS: Record<string, AppStatus[]> = {
  submitted: ["app_fee_paid", "rejected", "waitlisted"],
  app_fee_paid: ["interview_scheduled", "accepted", "rejected", "waitlisted"],
  interview_scheduled: ["interview_done", "rejected", "waitlisted"],
  interview_done: ["accepted", "rejected", "waitlisted"],
  accepted: ["confirmation_paid", "rejected", "withdrawn"],
  confirmation_paid: ["balance_paid", "withdrawn"],
  balance_paid: ["enrolled", "withdrawn"],
  enrolled: ["withdrawn"],
  rejected: ["submitted"], // allow re-open
  withdrawn: ["submitted"],
  waitlisted: ["accepted", "rejected"],
};

/* ── Interfaces ── */
interface ApplicationRow {
  id: string;
  user_id: string;
  offering_id: string;
  status: AppStatus;
  created_at: string;
  full_name: string;
  email: string;
  phone: string | null;
  tally_data: Record<string, unknown> | null;
  interview_notes: string | null;
  rejection_reason: string | null;
  app_fee_paid_at: string | null;
  offerings: { title: string } | null;
}

interface OfferingOption {
  id: string;
  title: string;
}

const PAGE_SIZE = 20;

const AdminApplications = () => {
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    app_fee_paid: 0,
    accepted: 0,
    confirmation_paid: 0,
    enrolled: 0,
  });

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [offeringFilter, setOfferingFilter] = useState<string>("all");
  const [offerings, setOfferings] = useState<OfferingOption[]>([]);

  // Dialogs
  const [tallyDialog, setTallyDialog] = useState<ApplicationRow | null>(null);
  const [notesDialog, setNotesDialog] = useState<ApplicationRow | null>(null);
  const [notesText, setNotesText] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [rejectDialog, setRejectDialog] = useState<ApplicationRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSaving, setRejectSaving] = useState(false);

  /* ── Fetch offerings for filter ── */
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("offerings")
        .select("id, title")
        .order("title");
      if (data) setOfferings(data);
    })();
  }, []);

  /* ── Fetch stats ── */
  const fetchStats = useCallback(async () => {
    // Use count queries instead of fetching all rows
    const [totalRes, submittedRes, appFeeRes, acceptedRes, confirmRes, enrolledRes] = await Promise.all([
      (supabase as any).from("cohort_applications").select("id", { count: "exact", head: true }),
      (supabase as any).from("cohort_applications").select("id", { count: "exact", head: true }).eq("status", "submitted"),
      (supabase as any).from("cohort_applications").select("id", { count: "exact", head: true }).eq("status", "app_fee_paid"),
      (supabase as any).from("cohort_applications").select("id", { count: "exact", head: true }).eq("status", "accepted"),
      (supabase as any).from("cohort_applications").select("id", { count: "exact", head: true }).eq("status", "confirmation_paid"),
      (supabase as any).from("cohort_applications").select("id", { count: "exact", head: true }).eq("status", "enrolled"),
    ]);
    setStats({
      total: totalRes.count ?? 0,
      submitted: submittedRes.count ?? 0,
      app_fee_paid: appFeeRes.count ?? 0,
      accepted: acceptedRes.count ?? 0,
      confirmation_paid: confirmRes.count ?? 0,
      enrolled: enrolledRes.count ?? 0,
    });
  }, []);

  /* ── Fetch applications ── */
  const fetchApplications = useCallback(async () => {
    setLoading(true);
    let query = (supabase as any)
      .from("cohort_applications")
      .select("*, offerings(title)", { count: "exact" });

    if (search.trim()) {
      const escaped = search.trim().replace(/%/g, "\\%").replace(/_/g, "\\_");
      const pattern = `%${escaped}%`;
      query = query.or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    if (statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }
    if (offeringFilter !== "all") {
      query = query.eq("offering_id", offeringFilter);
    }

    query = query
      .order("created_at", { ascending: false })
      .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

    const { data, count, error } = await query;
    if (error) {
      toast.error("Failed to load applications");
      if (import.meta.env.DEV) console.error(error);
    }
    setApplications(data || []);
    setTotal(count || 0);
    setLoading(false);
  }, [search, statusFilter, offeringFilter, page]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  /* ── Actions ── */
  const updateStatus = async (app: ApplicationRow, newStatus: AppStatus) => {
    const allowed = VALID_TRANSITIONS[app.status] || [];
    if (!allowed.includes(newStatus)) {
      toast.error(`Cannot transition from "${statusLabel(app.status)}" to "${statusLabel(newStatus)}"`);
      return;
    }
    const { error } = await (supabase as any)
      .from("cohort_applications")
      .update({ status: newStatus })
      .eq("id", app.id);
    if (error) {
      toast.error("Failed to update status");
      return;
    }
    toast.success(`Application ${statusLabel(newStatus)}`);
    fetchApplications();
    fetchStats();
  };

  const saveInterviewNotes = async () => {
    if (!notesDialog) return;
    setNotesSaving(true);
    const { error } = await (supabase as any)
      .from("cohort_applications")
      .update({ interview_notes: notesText })
      .eq("id", notesDialog.id);
    setNotesSaving(false);
    if (error) {
      toast.error("Failed to save notes");
      return;
    }
    toast.success("Interview notes saved");
    setNotesDialog(null);
    fetchApplications();
  };

  const handleReject = async () => {
    if (!rejectDialog) return;
    setRejectSaving(true);
    const { error } = await (supabase as any)
      .from("cohort_applications")
      .update({ status: "rejected", rejection_reason: rejectReason })
      .eq("id", rejectDialog.id);
    setRejectSaving(false);
    if (error) {
      toast.error("Failed to reject application");
      return;
    }
    toast.success("Application rejected");
    setRejectDialog(null);
    setRejectReason("");
    fetchApplications();
    fetchStats();
  };

  const sendPaymentReminder = async (_app: ApplicationRow) => {
    // No edge function / email integration is wired up yet. Rather than
    // falsely toast success, surface the real state so admins don't assume
    // reminders are going out.
    toast.info("Payment reminders aren't wired up yet — email the student directly.");
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ── Stat cards ── */
  const statCards = [
    { label: "Total", value: stats.total, color: "text-foreground" },
    { label: "Submitted", value: stats.submitted, color: "text-gray-400" },
    { label: "App Fee Paid", value: stats.app_fee_paid, color: "text-blue-400" },
    { label: "Accepted", value: stats.accepted, color: "text-green-400" },
    { label: "Confirmed", value: stats.confirmation_paid, color: "text-violet-400" },
    { label: "Enrolled", value: stats.enrolled, color: "text-emerald-400" },
  ];

  return (
    <AdminLayout title="Applications">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {statCards.map((s) => (
          <Card key={s.label} className="bg-surface border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground font-mono uppercase tracking-wider mb-1">
                {s.label}
              </p>
              <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name or email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            className="pl-9 bg-surface border-border"
          />
        </div>

        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[180px] bg-surface border-border">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ALL_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {statusLabel(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={offeringFilter}
          onValueChange={(v) => {
            setOfferingFilter(v);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[220px] bg-surface border-border">
            <SelectValue placeholder="All offerings" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All offerings</SelectItem>
            {offerings.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          No applications found.
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">
                    Student Name
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                    Program
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">
                    Applied Date
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">
                    App Fee
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden xl:table-cell">
                    Interview
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr
                    key={app.id}
                    className="border-b border-border hover:bg-surface/60 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={`text-xs ${STATUS_COLORS[app.status] || "bg-gray-600/20 text-gray-300"}`}
                      >
                        {statusLabel(app.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {app.full_name || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                      {app.email}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {app.offerings?.title || "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {new Date(app.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {app.app_fee_paid_at ? (
                        <Badge
                          variant="outline"
                          className="bg-green-600/20 text-green-300 border-green-600/40 text-xs"
                        >
                          Paid
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      {app.interview_notes ? (
                        <Badge
                          variant="outline"
                          className="bg-cyan-600/20 text-cyan-300 border-cyan-600/40 text-xs"
                        >
                          Done
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem
                            onClick={() => setTallyDialog(app)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Tally Data
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              setNotesText(app.interview_notes || "");
                              setNotesDialog(app);
                            }}
                          >
                            <StickyNote className="h-4 w-4 mr-2" />
                            Interview Notes
                          </DropdownMenuItem>
                          {(VALID_TRANSITIONS[app.status] || []).includes("accepted") && (
                              <DropdownMenuItem
                                onClick={() => updateStatus(app, "accepted")}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-2 text-green-400" />
                                Accept
                              </DropdownMenuItem>
                            )}
                          {(VALID_TRANSITIONS[app.status] || []).includes("rejected") && (
                              <DropdownMenuItem
                                onClick={() => {
                                  setRejectReason("");
                                  setRejectDialog(app);
                                }}
                              >
                                <XCircle className="h-4 w-4 mr-2 text-red-400" />
                                Reject
                              </DropdownMenuItem>
                            )}
                          <DropdownMenuItem
                            onClick={() => sendPaymentReminder(app)}
                          >
                            <Bell className="h-4 w-4 mr-2" />
                            Send Payment Reminder
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {page * PAGE_SIZE + 1}–
              {Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Prev
              </Button>
              <span className="text-sm text-muted-foreground">
                Page {page + 1} of {totalPages || 1}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        </>
      )}

      {/* Tally Data Dialog */}
      <Dialog
        open={!!tallyDialog}
        onOpenChange={(open) => !open && setTallyDialog(null)}
      >
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Tally Form Data</DialogTitle>
          </DialogHeader>
          {tallyDialog?.tally_data ? (
            <div className="space-y-3">
              {Object.entries(tallyDialog.tally_data).map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs font-mono text-muted-foreground uppercase tracking-wider mb-0.5">
                    {key}
                  </p>
                  <p className="text-sm">
                    {typeof value === "object"
                      ? JSON.stringify(value, null, 2)
                      : String(value)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No tally data available for this application.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {/* Interview Notes Dialog */}
      <Dialog
        open={!!notesDialog}
        onOpenChange={(open) => !open && setNotesDialog(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Interview Notes — {notesDialog?.full_name}
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={notesText}
            onChange={(e) => setNotesText(e.target.value)}
            placeholder="Enter interview notes..."
            rows={6}
            className="bg-surface border-border"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotesDialog(null)}>
              Cancel
            </Button>
            <Button onClick={saveInterviewNotes} disabled={notesSaving}>
              {notesSaving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Save Notes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog
        open={!!rejectDialog}
        onOpenChange={(open) => !open && setRejectDialog(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              Reject Application — {rejectDialog?.full_name}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">
            Please provide a reason for rejection. This will be visible to the
            applicant.
          </p>
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="Reason for rejection..."
            rows={4}
            className="bg-surface border-border"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={rejectSaving || !rejectReason.trim()}
            >
              {rejectSaving && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminApplications;
