import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { Search, AlertTriangle } from "lucide-react";

interface UserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  member_number: number;
  created_at: string;
  enrolment_count: number;
}

const AdminUsers = () => {
  const PAGE_SIZE = 50;
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [editForm, setEditForm] = useState({ full_name: "", bio: "", role: "student" });
  const [saving, setSaving] = useState(false);
  const [confirmRoleChange, setConfirmRoleChange] = useState(false);
  const { toast } = useToast();
  const { profile: currentUser } = useAuth();

  const load = async (p = page) => {
    setLoading(true);
    const from = p * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true });
    setTotalCount(count ?? 0);

    const { data: usersData } = await supabase
      .from("users")
      .select("id, full_name, email, role, member_number, created_at")
      .order("created_at", { ascending: false })
      .range(from, to);

    if (!usersData) { setLoading(false); return; }

    const uids = usersData.map((u) => u.id);
    const { data: enrols } = await supabase.from("enrolments").select("user_id").in("user_id", uids);
    const eCounts: Record<string, number> = {};
    (enrols || []).forEach((e) => { eCounts[e.user_id] = (eCounts[e.user_id] || 0) + 1; });

    setUsers(usersData.map((u) => ({ ...u, enrolment_count: eCounts[u.id] || 0 })));
    setLoading(false);
  };

  useEffect(() => { load(page); }, [page]);

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
    const updates: Record<string, unknown> = {
      full_name: editForm.full_name || null,
      bio: editForm.bio || null,
    };
    // Never allow self role change — backend trigger blocks it too
    if (!isSelf) updates.role = editForm.role;

    const { error } = await supabase.from("users").update(updates).eq("id", editUser.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      // Audit log
      if (currentUser?.id) {
        await (supabase as any).from("admin_audit_logs").insert({
          admin_user_id: currentUser.id,
          action: "update",
          entity_type: "user",
          entity_id: editUser.id,
          details: {
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

  const filtered = users.filter((u) =>
    (u.full_name || "").toLowerCase().includes(search.toLowerCase()) ||
    (u.email || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AdminLayout title="Users">
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search users..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">Email</th>
              <th className="px-5 py-3 font-medium">Role</th>
              <th className="px-5 py-3 font-medium">Member #</th>
              <th className="px-5 py-3 font-medium">Enrolments</th>
              <th className="px-5 py-3 font-medium">Joined</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-muted-foreground">No users found</td></tr>
            ) : filtered.map((u) => (
              <tr
                key={u.id}
                className="border-b border-border last:border-0 hover:bg-secondary/30 cursor-pointer"
                onClick={() => openEdit(u)}
              >
                <td className="px-5 py-3 font-medium">{u.full_name || "—"}</td>
                <td className="px-5 py-3 text-muted-foreground">{u.email || "—"}</td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${
                    u.role === "admin"
                      ? "bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]"
                      : u.role === "instructor"
                      ? "bg-[hsl(var(--accent-indigo)/0.15)] text-[hsl(var(--accent-indigo))]"
                      : "bg-secondary text-muted-foreground"
                  }`}>{u.role}</span>
                </td>
                <td className="px-5 py-3 font-mono text-xs">#{u.member_number}</td>
                <td className="px-5 py-3 font-mono text-xs">{u.enrolment_count}</td>
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
                <p className="text-sm text-muted-foreground py-2">You cannot change your own role.</p>
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
    </AdminLayout>
  );
};

export default AdminUsers;
