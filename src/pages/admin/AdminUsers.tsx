import { useEffect, useState, useMemo, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { MultiSelect, type OptionGroup } from "@/components/ui/multi-select";
import { useToast } from "@/hooks/use-toast";
import { Search, AlertTriangle, Download, Upload } from "lucide-react";
import { useDebounce } from "@/hooks/useDebounce";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  member_number: number;
  created_at: string;
  enrolment_count: number;
  // segmentation columns (from users_segmented view / users table)
  is_legacy?: boolean;
  city?: string | null;
  state?: string | null;
  program_vertical?: string | null;
  lifetime_revenue_inr?: number | null;
  first_purchase_at?: string | null;
  purchase_count?: number | null;
  legacy_enrolment_count?: number;
}

const AdminUsers = () => {
  const PAGE_SIZE = 50;
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", bio: "", role: "student" });
  const [saving, setSaving] = useState(false);
  const [confirmRoleChange, setConfirmRoleChange] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState<"all" | "active" | "legacy">("all");
  const [verticalFilter, setVerticalFilter] = useState<string>("all");
  const [offeringFilter, setOfferingFilter] = useState<string[]>([]);
  const [allOfferings, setAllOfferings] = useState<{ id: string; title: string; product_tier: string }[]>([]);
  const [enrolmentMap, setEnrolmentMap] = useState<Record<string, string[]>>({}); // user_id -> offering_ids
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { profile: currentUser } = useAuth();
  // We block admin self-demotion: the role selector below is replaced with a
  // notice when editing the currently logged-in admin's row. A DB trigger
  // (20260408160200_admin_role_guard.sql) enforces this too, but the UI
  // should never even try.

  // Load offerings for the filter
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("offerings").select("id, title, product_tier");
      setAllOfferings((data || []).map((o: any) => ({ id: o.id, title: o.title, product_tier: o.product_tier || "other" })));
    })();
  }, []);

  const TIER_LABELS: Record<string, string> = {
    live_cohort: "Live Cohort",
    masterclass: "Masterclass",
    advanced_program: "Advanced Program",
    workshop: "Workshop",
    other: "Other",
  };

  const offeringGroups: OptionGroup[] = useMemo(() => {
    const tierMap: Record<string, { value: string; label: string }[]> = {};
    allOfferings.forEach((o) => {
      if (!tierMap[o.product_tier]) tierMap[o.product_tier] = [];
      tierMap[o.product_tier].push({ value: o.id, label: o.title });
    });
    return Object.entries(tierMap).map(([tier, options]) => ({
      label: TIER_LABELS[tier] || tier,
      options,
    }));
  }, [allOfferings]);

  const load = async (p = page) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // Query the users_segmented view — adds legacy flag, city, vertical, LTV.
    let countQuery = supabase
      .from("users_segmented" as any)
      .select("id", { count: "exact", head: true });
    if (scopeFilter === "active") countQuery = countQuery.eq("is_legacy", false);
    if (scopeFilter === "legacy") countQuery = countQuery.eq("is_legacy", true);
    if (verticalFilter !== "all") countQuery = countQuery.eq("program_vertical", verticalFilter);
    const { count } = await countQuery;
    setTotalCount(count ?? 0);

    let q = supabase
      .from("users_segmented" as any)
      .select("id, full_name, email, phone, role, member_number, created_at, is_legacy, city, state, program_vertical, lifetime_revenue_inr, first_purchase_at, purchase_count, legacy_enrolment_count")
      .order("created_at", { ascending: false })
      .range(from, to);
    if (scopeFilter === "active") q = q.eq("is_legacy", false);
    if (scopeFilter === "legacy") q = q.eq("is_legacy", true);
    if (verticalFilter !== "all") q = q.eq("program_vertical", verticalFilter);
    const { data: usersData } = await q as any;

    if (!usersData) { setLoading(false); return; }

    const uids = (usersData as any[]).map((u) => u.id);
    const { data: enrols } = await supabase.from("enrolments").select("user_id, offering_id").in("user_id", uids);
    const eCounts: Record<string, number> = {};
    const eMap: Record<string, string[]> = {};
    (enrols || []).forEach((e: any) => {
      eCounts[e.user_id] = (eCounts[e.user_id] || 0) + 1;
      if (!eMap[e.user_id]) eMap[e.user_id] = [];
      if (!eMap[e.user_id].includes(e.offering_id)) eMap[e.user_id].push(e.offering_id);
    });
    setEnrolmentMap(eMap);

    setUsers((usersData as any[]).map((u: any) => ({ ...u, enrolment_count: eCounts[u.id] || 0 })));
    setLoading(false);
  };

  useEffect(() => { load(page); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, scopeFilter, verticalFilter]);

  const openEdit = async (user: UserRow) => {
    const { data } = await supabase.from("users").select("full_name, bio, role").eq("id", user.id).single();
    setEditForm({ full_name: data?.full_name || "", bio: data?.bio || "", role: data?.role || "student" });
    setEditUser(user);
  };

  const isSelf = editUser?.id === currentUser?.id;
  const roleChanged = editUser && editForm.role !== editUser.role;

  const doSave = async () => {
    if (!editUser) return;
    setSaving(true);
    // Defense in depth: even if the select was somehow enabled, never
    // submit a role change for the currently signed-in admin. A DB trigger
    // (20260408160200_admin_role_guard.sql) blocks it server-side too.
    const updates: Record<string, unknown> = {
      full_name: editForm.full_name || null,
      bio: editForm.bio || null,
    };
    if (!isSelf) updates.role = editForm.role;

    const { error } = await supabase.from("users").update(updates).eq("id", editUser.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Audit log
      if (currentUser?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          actor_user_id: currentUser.id,
          action: "update",
          target_table: "users",
          target_id: editUser.id,
          metadata: {
            full_name: editForm.full_name,
            role_changed: !isSelf && roleChanged ? { from: editUser.role, to: editForm.role } : undefined,
          },
        });
      }
      toast({ title: "User updated" });
      setEditUser(null);
      load();
    }
    setSaving(false);
    setConfirmRoleChange(false);
  };

  const handleSave = () => {
    if (roleChanged && !isSelf) {
      setConfirmRoleChange(true);
    } else {
      doSave();
    }
  };

  const exportCSV = async () => {
    setExporting(true);
    try {
      // Fetch all users matching current filters
      let query = supabase
        .from("users")
        .select("member_number, full_name, email, phone, role, city, occupation, bio, created_at")
        .order("created_at", { ascending: false });
      if (roleFilter !== "all") query = query.eq("role", roleFilter);
      if (debouncedSearch) {
        query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
      }
      const { data } = await query;
      if (!data || data.length === 0) {
        toast({ title: "No users to export" });
        setExporting(false);
        return;
      }
      const headers = ["Member #", "Full Name", "Email", "Phone", "Role", "City", "Occupation", "Bio", "Joined"];
      const rows = data.map((u: any) => [
        u.member_number ?? "",
        (u.full_name || "").replace(/"/g, '""'),
        u.email || "",
        u.phone || "",
        u.role || "",
        (u.city || "").replace(/"/g, '""'),
        (u.occupation || "").replace(/"/g, '""'),
        (u.bio || "").replace(/"/g, '""').replace(/\n/g, " "),
        u.created_at ? new Date(u.created_at).toLocaleDateString("en-IN") : "",
      ]);
      const csv = [headers.join(","), ...rows.map((r) => r.map((c: string) => `"${c}"`).join(","))].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `users-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: `Exported ${data.length} users` });
    } catch (err: any) {
      toast({ title: "Export failed", description: err.message, variant: "destructive" });
    }
    setExporting(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset file input early so the user can re-pick the same file after
    // cancelling the confirm dialog.
    const resetInput = () => {
      if (fileInputRef.current) fileInputRef.current.value = "";
    };

    setImporting(true);
    try {
      let text = await file.text();
      // Strip UTF-8 BOM if present
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
      // Normalise CRLF / CR-only endings so Excel exports don't leave stray \r
      // tokens inside cells.
      text = text.replace(/\r\n?/g, "\n");
      const lines = text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) throw new Error("CSV must have a header row and at least one data row");

      // Proper CSV field splitter: handles quoted fields and "" as an escaped
      // quote inside a quoted field. Returns trimmed cell values.
      const splitCsvLine = (line: string): string[] => {
        const out: string[] = [];
        let cur = "";
        let inQuote = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuote && line[i + 1] === '"') {
              // escaped quote
              cur += '"';
              i++;
            } else {
              inQuote = !inQuote;
            }
            continue;
          }
          if (ch === "," && !inQuote) {
            out.push(cur.trim());
            cur = "";
            continue;
          }
          cur += ch;
        }
        out.push(cur.trim());
        return out;
      };

      const headers = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
      const emailIdx = headers.indexOf("email");
      if (emailIdx === -1) throw new Error("CSV must contain an 'email' column");
      const nameIdx = headers.indexOf("full name") !== -1 ? headers.indexOf("full name") : headers.indexOf("full_name");
      const phoneIdx = headers.indexOf("phone");
      const cityIdx = headers.indexOf("city");
      const occIdx = headers.indexOf("occupation");
      const bioIdx = headers.indexOf("bio");
      // Security: role column is intentionally ignored to prevent escalation via CSV

      const dataRowCount = lines.length - 1;
      // Destructive-ish op: confirm before overwriting real user rows by email.
      // eslint-disable-next-line no-alert
      const confirmed = window.confirm(
        `This will UPDATE up to ${dataRowCount} user profile${dataRowCount === 1 ? "" : "s"} by matching the 'email' column. Continue?`,
      );
      if (!confirmed) {
        setImporting(false);
        resetInput();
        return;
      }

      let success = 0;
      const failedRows: number[] = [];

      for (let i = 1; i < lines.length; i++) {
        const cols = splitCsvLine(lines[i]);
        const email = cols[emailIdx]?.toLowerCase().trim();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          failedRows.push(i + 1); // human-friendly 1-based row number
          continue;
        }

        const updates: Record<string, any> = {};
        if (nameIdx >= 0 && cols[nameIdx]) updates.full_name = cols[nameIdx];
        if (phoneIdx >= 0 && cols[phoneIdx]) updates.phone = cols[phoneIdx];
        if (cityIdx >= 0 && cols[cityIdx]) updates.city = cols[cityIdx];
        if (occIdx >= 0 && cols[occIdx]) updates.occupation = cols[occIdx];
        if (bioIdx >= 0 && cols[bioIdx]) updates.bio = cols[bioIdx];

        const { error } = await supabase
          .from("users")
          .update(updates)
          .eq("email", email);

        if (error) failedRows.push(i + 1);
        else success++;
      }

      const failed = failedRows.length;
      if (failed > 0) {
        toast({
          title: `Import complete: ${success} updated, ${failed} failed`,
          description: `Failed rows: ${failedRows.slice(0, 10).join(", ")}${failed > 10 ? "…" : ""}`,
        });
      } else {
        toast({ title: `Import complete: ${success} updated` });
      }
      load();
    } catch (err: any) {
      toast({ title: "Import failed", description: err.message, variant: "destructive" });
    }
    setImporting(false);
    resetInput();
  };

  const filtered = users.filter((u) => {
    const matchSearch = !debouncedSearch ||
      (u.full_name || "").toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      (u.email || "").toLowerCase().includes(debouncedSearch.toLowerCase());
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const matchOffering = offeringFilter.length === 0 ||
      (enrolmentMap[u.id] || []).some((oid) => offeringFilter.includes(oid));
    return matchSearch && matchRole && matchOffering;
  });

  return (
    <>
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={roleFilter} onValueChange={setRoleFilter}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="instructor">Instructor</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scopeFilter} onValueChange={(v) => setScopeFilter(v as any)}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="legacy">Legacy only</SelectItem>
          </SelectContent>
        </Select>
        <Select value={verticalFilter} onValueChange={setVerticalFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Vertical" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verticals</SelectItem>
            <SelectItem value="Forge">Forge</SelectItem>
            <SelectItem value="Live">Live cohort</SelectItem>
            <SelectItem value="Masterclass">Masterclass</SelectItem>
            <SelectItem value="Workshop">Workshop</SelectItem>
            <SelectItem value="Multi">Multi-product</SelectItem>
          </SelectContent>
        </Select>
        <MultiSelect
          groups={offeringGroups}
          selected={offeringFilter}
          onChange={setOfferingFilter}
          placeholder="All Offerings"
          className="w-56"
        />
        <Button variant="outline" size="sm" onClick={exportCSV} disabled={exporting}>
          <Download className="h-4 w-4 mr-1" /> {exporting ? "Exporting..." : "Export CSV"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={importing}>
          <Upload className="h-4 w-4 mr-1" /> {importing ? "Importing..." : "Import CSV"}
        </Button>
        <input ref={fileInputRef} type="file" accept=".csv" onChange={handleImport} className="hidden" />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">City</th>
              <th className="px-5 py-3 font-medium">Vertical</th>
              <th className="px-5 py-3 font-medium text-right">LTV</th>
              <th className="px-5 py-3 font-medium">Enrolments</th>
              <th className="px-5 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-muted-foreground">No users found</td></tr>
            ) : filtered.map((u) => (
              <tr
                key={u.id}
                className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer"
                onClick={() => openEdit(u)}
              >
                <td className="px-5 py-3 font-medium">
                  <div>{u.full_name || "—"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">#{u.member_number}</div>
                </td>
                <td className="px-5 py-3 text-muted-foreground">{u.email || "—"}</td>
                <td className="px-5 py-3">
                  {u.is_legacy ? (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">legacy</span>
                  ) : (
                    <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">active</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                    u.role === "admin" || u.role === "owner"
                      ? "bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]"
                      : u.role === "instructor"
                      ? "bg-[hsl(var(--accent-indigo)/0.15)] text-[hsl(var(--accent-indigo))]"
                      : "bg-secondary text-muted-foreground"
                  }`}>{u.role}</span>
                </td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{u.city || "—"}</td>
                <td className="px-5 py-3 text-muted-foreground text-xs">{u.program_vertical || "—"}</td>
                <td className="px-5 py-3 font-mono text-xs text-right">
                  {u.lifetime_revenue_inr && u.lifetime_revenue_inr > 0
                    ? `₹${u.lifetime_revenue_inr.toLocaleString("en-IN")}`
                    : "—"}
                </td>
                <td className="px-5 py-3 font-mono text-xs">
                  {u.enrolment_count}
                  {(u.legacy_enrolment_count ?? 0) > 0 && (
                    <span className="text-amber-400 ml-1">+{u.legacy_enrolment_count}L</span>
                  )}
                </td>
                <td className="px-5 py-3 font-mono text-xs">{new Date(u.created_at).toLocaleDateString("en-IN")}</td>
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

      <Dialog open={!!editUser} onOpenChange={() => setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Edit User</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Full Name</label>
              <Input value={editForm.full_name} onChange={(e) => setEditForm((f) => ({ ...f, full_name: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Bio</label>
              <Textarea value={editForm.bio} onChange={(e) => setEditForm((f) => ({ ...f, bio: e.target.value }))} rows={3} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              {isSelf ? (
                <p className="text-sm text-muted-foreground py-2">You can't change your own role — ask another admin.</p>
              ) : (
                <Select value={editForm.role} onValueChange={(v) => setEditForm((f) => ({ ...f, role: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="instructor">Instructor</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmRoleChange} onOpenChange={setConfirmRoleChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" /> Confirm Role Change
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are changing <strong>{editUser?.full_name || editUser?.email}</strong>'s role
              from <strong>{editUser?.role}</strong> to <strong>{editForm.role}</strong>.
              {editForm.role === "admin" && " This will grant full admin access to the platform."}
              {editUser?.role === "admin" && editForm.role !== "admin" && " This will revoke their admin privileges."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={doSave} disabled={saving}>
              {saving ? "Saving…" : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default AdminUsers;
