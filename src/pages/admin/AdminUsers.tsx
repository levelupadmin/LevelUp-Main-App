import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Search, MoreHorizontal, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import UserDetailSheet from "@/components/admin/UserDetailSheet";
import type { UserRole, UserStatus, AdminUser } from "@/data/adminData";

const roleStyles: Record<UserRole, string> = {
  super_admin: "bg-destructive/10 text-destructive border-destructive/20",
  mentor: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  student: "bg-secondary text-muted-foreground border-border",
};

const statusStyles: Record<UserStatus, string> = {
  active: "bg-green-500/10 text-green-400 border-green-500/20",
  suspended: "bg-[hsl(var(--highlight))]/10 text-[hsl(var(--highlight))] border-[hsl(var(--highlight))]/20",
  banned: "bg-destructive/10 text-destructive border-destructive/20",
};

const roleLabel: Record<UserRole, string> = { super_admin: "Super Admin", mentor: "Mentor", student: "Student" };

const AdminUsers = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [confirmDialog, setConfirmDialog] = useState<{ userId: string; action: string; newRole?: UserRole } | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Fetch real users from profiles + user_roles
  const { data: users = [], isLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("id, name, avatar_url, city, created_at, updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      // Fetch roles for all users
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role");

      const roleMap: Record<string, UserRole> = {};
      (roles || []).forEach((r) => {
        const existing = roleMap[r.user_id];
        if (!existing || r.role === "super_admin" || (r.role === "mentor" && existing === "student")) {
          roleMap[r.user_id] = r.role as UserRole;
        }
      });

      return (profiles || []).map((p): AdminUser => ({
        id: p.id,
        name: p.name || "Unnamed",
        email: "", // email not in profiles table
        city: p.city || "",
        role: roleMap[p.id] || "student",
        level: 0,
        status: "active" as UserStatus,
        joined: new Date(p.created_at).toLocaleDateString(),
        coursesEnrolled: 0,
        lastActive: p.updated_at ? new Date(p.updated_at).toLocaleDateString() : "",
      }));
    },
  });

  // Role change mutation
  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: UserRole }) => {
      // Delete existing roles, then insert new one
      await supabase.from("user_roles").delete().eq("user_id", userId);
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
      if (error) throw error;
    },
    onSuccess: (_, { newRole }) => {
      queryClient.invalidateQueries({ queryKey: ["admin-users"] });
      toast({ title: "Role updated", description: `User role changed to ${roleLabel[newRole]}.` });
    },
    onError: (err: any) => {
      toast({ title: "Failed to update role", description: err.message, variant: "destructive" });
    },
  });

  const confirmAction = () => {
    if (!confirmDialog) return;
    const { userId, action, newRole } = confirmDialog;
    if (action === "changeRole" && newRole) {
      changeRoleMutation.mutate({ userId, newRole });
    }
    setConfirmDialog(null);
  };

  const filtered = users
    .filter((u) => search === "" || u.name.toLowerCase().includes(search.toLowerCase()))
    .filter((u) => roleFilter === "all" || u.role === roleFilter);

  const selectedUser = selectedUserId ? users.find((u) => u.id === selectedUserId) || null : null;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">User Management</h1>
          <p className="text-sm text-muted-foreground">View, manage roles, and handle account issues</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Role" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="student">Student</SelectItem>
              <SelectItem value="mentor">Mentor</SelectItem>
              <SelectItem value="super_admin">Super Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/50">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">City</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Joined</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr key={u.id} className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedUserId(u.id)}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{u.name}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{u.city || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className={roleStyles[u.role]}>{roleLabel[u.role]}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{u.joined}</td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="rounded-md p-1.5 hover:bg-secondary transition-colors">
                              <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedUserId(u.id)}>View Profile</DropdownMenuItem>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {(["student", "mentor", "super_admin"] as UserRole[]).map((r) => (
                                  <DropdownMenuItem
                                    key={r}
                                    onClick={() => setConfirmDialog({ userId: u.id, action: "changeRole", newRole: r })}
                                    className={u.role === r ? "bg-secondary" : ""}
                                  >
                                    {roleLabel[r]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No users found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* User Detail Sheet */}
        {selectedUser && (
          <UserDetailSheet
            user={selectedUser}
            open={!!selectedUserId}
            onOpenChange={() => setSelectedUserId(null)}
            userRole={selectedUser.role}
            userStatus={selectedUser.status}
            roleStyles={roleStyles}
            statusStyles={statusStyles}
            roleLabel={roleLabel}
          />
        )}

        {/* Confirmation Dialog */}
        <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm Action</DialogTitle>
              <DialogDescription>
                {confirmDialog?.action === "changeRole" && `Change user role to ${roleLabel[confirmDialog.newRole!]}?`}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button onClick={confirmAction}>Confirm</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
