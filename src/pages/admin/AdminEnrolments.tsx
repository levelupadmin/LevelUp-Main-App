import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search } from "lucide-react";

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
  const [enrolments, setEnrolments] = useState<EnrolmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [manualOpen, setManualOpen] = useState(false);
  const [allUsers, setAllUsers] = useState<{ id: string; full_name: string; email: string }[]>([]);
  const [allOfferings, setAllOfferings] = useState<{ id: string; title: string }[]>([]);
  const [manualUserId, setManualUserId] = useState("");
  const [manualOfferingId, setManualOfferingId] = useState("");
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data: enrols } = await supabase
      .from("enrolments")
      .select("id, status, created_at, user_id, offering_id, payment_order_id")
      .order("created_at", { ascending: false })
      .limit(200);

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

  useEffect(() => { load(); }, []);

  const handleStatusChange = async (enrolId: string, newStatus: string) => {
    const { error } = await supabase.from("enrolments").update({ status: newStatus }).eq("id", enrolId);
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "Status updated" }); load(); }
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
    if (error) toast({ title: "Error", description: error.message, variant: "destructive" });
    else { toast({ title: "User enrolled" }); setManualOpen(false); load(); }
    setSaving(false);
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
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Student</th>
              <th className="px-5 py-3 font-medium">Offering</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Enrolled</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={5} className="px-5 py-12 text-center text-muted-foreground">No enrolments found</td></tr>
            ) : filtered.map((e) => (
              <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
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
    </AdminLayout>
  );
};

export default AdminEnrolments;
