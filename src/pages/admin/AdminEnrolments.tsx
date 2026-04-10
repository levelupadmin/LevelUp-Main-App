import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Upload } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

interface EnrolmentRow {
  id: string;
  status: string;
  created_at: string;
  user_name: string;
  user_email: string;
  offering_title: string;
  payment_order_id: string | null;
}

const AdminEnrolments = () => {
  const PAGE_SIZE = 50;
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [manualOpen, setManualOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [allOfferings, setAllOfferings] = useState<{ id: string; title: string }[]>([]);
  const [manualUserId, setManualUserId] = useState("");
  const [manualOfferingId, setManualOfferingId] = useState("");
  const [saving, setSaving] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkOfferingId, setBulkOfferingId] = useState("");
  const [bulkEmails, setBulkEmails] = useState("");
  const [bulkResult, setBulkResult] = useState<{ success: number; failed: string[]; skipped: string[] } | null>(null);
  const [bulkStatusConfirm, setBulkStatusConfirm] = useState<string | null>(null);
  const { toast } = useToast();
  const { profile } = useAuth();

  const load = async (p = page) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { count } = await supabase
      .from("enrolments")
      .select("id", { count: "exact", head: true });
    setTotalCount(count ?? 0);

    const { data: enrols } = await supabase
      .from("enrolments")
      .select("id, status, created_at, user_id, offering_id, payment_order_id")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!enrols) { setLoading(false); return; }

    const userIds = [...new Set(enrols.map((e) => e.user_id))];
    const offIds = [...new Set(enrols.map((e) => e.offering_id))];

    const [uRes, oRes] = await Promise.all([
      supabase.from("users").select("id, full_name, email").in("id", userIds),
      supabase.from("offerings").select("id, title").in("id", offIds),
    ]);

    const uMap = Object.fromEntries((uRes.data || []).map((u) => [u.id, u]));
    const oMap = Object.fromEntries((oRes.data || []).map((o) => [o.id, o]));

    setEnrolments(enrols.map((e) => ({
      id: e.id,
      status: e.status,
      created_at: e.created_at,
      user_name: uMap[e.user_id]?.full_name || "Unknown",
      user_email: uMap[e.user_id]?.email || "",
      offering_title: oMap[e.offering_id]?.title || "Unknown",
      payment_order_id: e.payment_order_id,
    })));
    setLoading(false);
  };

  useEffect(() => { load(page); }, [page]);

  const handleStatusChange = async (enrolId: string, newStatus: string) => {
    const { error } = await supabase.from("enrolments").update({ status: newStatus }).eq("id", enrolId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Audit log
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: profile.id,
          action: "update",
          entity_type: "enrolment",
          entity_id: enrolId,
          details: { new_status: newStatus },
        });
      }
      toast({ title: "Status updated" });
      load();
    }
  };

  const openManualEnrol = async () => {
    const [uRes, oRes] = await Promise.all([
      supabase.from("users").select("id, full_name, email").order("full_name").limit(500),
      supabase.from("offerings").select("id, title").order("title"),
    ]);
    setAllUsers(uRes.data || []);
    setAllOfferings(oRes.data || []);
    setManualUserId("");
    setManualOfferingId("");
    setManualOpen(true);
  };

  const handleManualEnrol = async () => {
    if (!manualUserId || !manualOfferingId) {
      toast({ title: "Select both user and offering", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("enrolments").insert({
      user_id: manualUserId,
      offering_id: manualOfferingId,
      source: "admin_manual",
      status: "active",
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Audit log
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: profile.id,
          action: "create",
          entity_type: "enrolment",
          entity_id: `${manualUserId}:${manualOfferingId}`,
          details: { user_id: manualUserId, offering_id: manualOfferingId, source: "admin_manual" },
        });
      }
      toast({ title: "User enrolled" });
      setManualOpen(false);
      load();
    }
    setSaving(false);
  };

  const openBulkEnrol = async () => {
    const { data } = await supabase.from("offerings").select("id, title").order("title");
    setAllOfferings(data || []);
    setBulkEmails("");
    setBulkOfferingId("");
    setBulkResult(null);
    setBulkOpen(true);
  };

  const handleBulkEnrol = async () => {
    if (!bulkOfferingId || !bulkEmails.trim()) {
      toast({ title: "Select an offering and enter emails", variant: "destructive" });
      return;
    }
    setSaving(true);
    setBulkResult(null);

    const emails = bulkEmails
      .split(/[\n,;]+/)
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));

    let success = 0;
    const failed: string[] = [];
    const skipped: string[] = [];

    for (const email of emails) {
      const { data: user } = await supabase
        .from("users")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!user) {
        failed.push(`${email} — user not found`);
        continue;
      }

      // Check for existing active enrolment to avoid duplicates
      const { data: existing } = await supabase
        .from("enrolments")
        .select("id")
        .eq("user_id", user.id)
        .eq("offering_id", bulkOfferingId)
        .eq("status", "active")
        .maybeSingle();

      if (existing) {
        skipped.push(`${email} — already has active enrolment`);
        continue;
      }

      const { error } = await supabase.from("enrolments").insert({
        user_id: user.id,
        offering_id: bulkOfferingId,
        source: "admin_manual",
        status: "active",
      });

      if (error) {
        failed.push(`${email} — ${error.message}`);
      } else {
        success++;
      }
    }

    setBulkResult({ success, failed, skipped });
    if (success > 0) {
      // Audit log
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: profile.id,
          action: "bulk_create",
          entity_type: "enrolment",
          entity_id: bulkOfferingId,
          details: { offering_id: bulkOfferingId, success, failed: failed.length, skipped: skipped.length },
        });
      }
      toast({ title: `${success} users enrolled` });
      load(page);
    }
    setSaving(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((e) => e.id)));
    }
  };

  const requestBulkStatusChange = (newStatus: string) => {
    if (selectedIds.size === 0) return;
    setBulkStatusConfirm(newStatus);
  };

  const confirmBulkStatusChange = async () => {
    if (!bulkStatusConfirm || selectedIds.size === 0) return;
    const ids = [...selectedIds];
    const newStatus = bulkStatusConfirm;
    setBulkStatusConfirm(null);
    const { error } = await supabase.from("enrolments").update({ status: newStatus }).in("id", ids);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Audit log
      if (profile?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: profile.id,
          action: "bulk_update",
          entity_type: "enrolment",
          entity_id: ids.join(","),
          details: { enrolment_ids: ids, new_status: newStatus, count: ids.length },
        });
      }
      toast({ title: `${ids.length} enrolment(s) updated to ${newStatus}` });
      setSelectedIds(new Set());
      load();
    }
  };

  const filtered = enrolments.filter((e) => {
    const matchesSearch = e.user_name.toLowerCase().includes(search.toLowerCase()) ||
      e.user_email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || e.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminLayout title="Enrolments">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openManualEnrol} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> Manual Enrol
        </Button>
        <Button variant="outline" onClick={openBulkEnrol}>
          <Upload className="h-4 w-4 mr-2" /> Bulk Enrol
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-surface border border-border rounded-lg">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <Select onValueChange={requestBulkStatusChange}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue placeholder="Bulk set status…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Set Active</SelectItem>
              <SelectItem value="expired">Set Expired</SelectItem>
              <SelectItem value="cancelled">Set Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground ml-auto">Clear</button>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-3 py-3 w-10">
                <Checkbox
                  checked={filtered.length > 0 && selectedIds.size === filtered.length}
                  onCheckedChange={toggleSelectAll}
                />
              </th>
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Offering</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Enrolled</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No enrolments found</td></tr>
            ) : filtered.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-3 py-3">
                  <Checkbox
                    checked={selectedIds.has(e.id)}
                    onCheckedChange={() => toggleSelect(e.id)}
                  />
                </td>
                <td className="px-5 py-3">
                  <p className="font-medium">{e.user_name}</p>
                  <p className="text-xs text-muted-foreground">{e.user_email}</p>
                </td>
                <td className="px-5 py-3">{e.offering_title}</td>
                <td className="px-5 py-3">
                  <Select value={e.status} onValueChange={(v) => handleStatusChange(e.id, v)}>
                    <SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-5 py-3 font-mono text-xs">{new Date(e.created_at).toLocaleDateString("en-IN")}</td>
                <td className="px-5 py-3 text-xs text-muted-foreground">
                  {e.payment_order_id ? "Paid" : "Manual"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalCount > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        </div>
      )}

      <Dialog open={manualOpen} onOpenChange={setManualOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Manual Enrolment</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">User</label>
              <SearchableSelect
                options={allUsers.map((u) => ({ value: u.id, label: u.full_name || u.email }))}
                value={manualUserId}
                onValueChange={setManualUserId}
                placeholder="Select user"
                searchPlaceholder="Search users…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Offering</label>
              <SearchableSelect
                options={allOfferings.map((o) => ({ value: o.id, label: o.title }))}
                value={manualOfferingId}
                onValueChange={setManualOfferingId}
                placeholder="Select offering"
                searchPlaceholder="Search offerings…"
              />
            </div>
            <Button onClick={handleManualEnrol} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Enrolling…" : "Enrol User"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk status change confirmation */}
      <AlertDialog open={!!bulkStatusConfirm} onOpenChange={() => setBulkStatusConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm bulk status change</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to set <span className="font-mono font-semibold">{selectedIds.size}</span> enrolment{selectedIds.size !== 1 ? "s" : ""} to <span className="font-semibold">{bulkStatusConfirm}</span>. This action will take effect immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmBulkStatusChange}>
              Update {selectedIds.size} Enrolment{selectedIds.size !== 1 ? "s" : ""}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Bulk Enrol Users</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Offering</label>
              <SearchableSelect
                options={allOfferings.map((o) => ({ value: o.id, label: o.title }))}
                value={bulkOfferingId}
                onValueChange={setBulkOfferingId}
                placeholder="Select offering"
                searchPlaceholder="Search offerings…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email addresses (one per line or comma-separated)</label>
              <Textarea
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.target.value)}
                rows={6}
                placeholder={"student1@example.com\nstudent2@example.com"}
              />
            </div>
            {bulkResult && (
              <div className="text-sm space-y-1">
                <p className="text-green-400">{bulkResult.success} enrolled successfully</p>
                {bulkResult.skipped.length > 0 && (
                  <div className="text-yellow-400">
                    <p>{bulkResult.skipped.length} skipped (duplicates):</p>
                    <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                      {bulkResult.skipped.map((s, i) => <li key={i}>{s}</li>)}
                    </ul>
                  </div>
                )}
                {bulkResult.failed.length > 0 && (
                  <div className="text-red-400">
                    <p>{bulkResult.failed.length} failed:</p>
                    <ul className="list-disc list-inside text-xs mt-1 max-h-32 overflow-y-auto">
                      {bulkResult.failed.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}
            <Button onClick={handleBulkEnrol} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Enrolling…" : "Enrol All"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminEnrolments;
