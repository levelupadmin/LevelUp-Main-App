import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { mockAdminUsers, UserRole, UserStatus } from "@/data/adminData";
import { Search, MoreHorizontal, Users, Shield, ChevronRight } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [userRoles, setUserRoles] = useState<Record<string, UserRole>>(
    Object.fromEntries(mockAdminUsers.map((u) => [u.id, u.role]))
  );
  const [userStatuses, setUserStatuses] = useState<Record<string, UserStatus>>(
    Object.fromEntries(mockAdminUsers.map((u) => [u.id, u.status]))
  );
  const [confirmDialog, setConfirmDialog] = useState<{ userId: string; action: string; newRole?: UserRole } | null>(null);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);

  const users = mockAdminUsers
    .filter((u) => search === "" || u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()))
    .filter((u) => roleFilter === "all" || userRoles[u.id] === roleFilter)
    .filter((u) => statusFilter === "all" || userStatuses[u.id] === statusFilter);

  const confirmAction = () => {
    if (!confirmDialog) return;
    const { userId, action, newRole } = confirmDialog;
    if (action === "changeRole" && newRole) {
      setUserRoles((s) => ({ ...s, [userId]: newRole }));
      toast({ title: "Role updated", description: `User role changed to ${roleLabel[newRole]}.` });
    } else if (action === "suspend") {
      setUserStatuses((s) => ({ ...s, [userId]: "suspended" }));
      toast({ title: "User suspended" });
    } else if (action === "ban") {
      setUserStatuses((s) => ({ ...s, [userId]: "banned" }));
      toast({ title: "User banned", variant: "destructive" });
    } else if (action === "activate") {
      setUserStatuses((s) => ({ ...s, [userId]: "active" }));
      toast({ title: "User activated" });
    }
    setConfirmDialog(null);
  };

  const detail = selectedUser ? mockAdminUsers.find((u) => u.id === selectedUser) : null;

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
            <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
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
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="banned">Banned</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">User</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">City</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Role</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Level</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Joined</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-border hover:bg-secondary/30 transition-colors cursor-pointer" onClick={() => setSelectedUser(u.id)}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-foreground">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{u.city}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={roleStyles[userRoles[u.id]]}>{roleLabel[userRoles[u.id]]}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className={statusStyles[userStatuses[u.id]]}>{userStatuses[u.id]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">Lvl {u.level}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">{u.joined}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="rounded-md p-1.5 hover:bg-secondary transition-colors">
                            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedUser(u.id)}>View Profile</DropdownMenuItem>
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>Change Role</DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {(["student", "mentor", "super_admin"] as UserRole[]).map((r) => (
                                <DropdownMenuItem
                                  key={r}
                                  onClick={() => setConfirmDialog({ userId: u.id, action: "changeRole", newRole: r })}
                                  className={userRoles[u.id] === r ? "bg-secondary" : ""}
                                >
                                  {roleLabel[r]}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                          <DropdownMenuSeparator />
                          {userStatuses[u.id] !== "active" && (
                            <DropdownMenuItem onClick={() => setConfirmDialog({ userId: u.id, action: "activate" })}>
                              Activate
                            </DropdownMenuItem>
                          )}
                          {userStatuses[u.id] === "active" && (
                            <DropdownMenuItem onClick={() => setConfirmDialog({ userId: u.id, action: "suspend" })}>
                              Suspend
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            onClick={() => setConfirmDialog({ userId: u.id, action: "ban" })}
                            className="text-destructive"
                          >
                            Ban User
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* User Detail Slide-out */}
        {detail && (
          <Dialog open={!!selectedUser} onOpenChange={() => setSelectedUser(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{detail.name}</DialogTitle>
                <DialogDescription>{detail.email}</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md bg-secondary p-3">
                    <p className="text-xs text-muted-foreground">City</p>
                    <p className="text-sm font-medium text-foreground">{detail.city}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-3">
                    <p className="text-xs text-muted-foreground">Level</p>
                    <p className="text-sm font-medium text-foreground">{detail.level}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-3">
                    <p className="text-xs text-muted-foreground">Courses Enrolled</p>
                    <p className="text-sm font-medium text-foreground">{detail.coursesEnrolled}</p>
                  </div>
                  <div className="rounded-md bg-secondary p-3">
                    <p className="text-xs text-muted-foreground">Last Active</p>
                    <p className="text-sm font-medium text-foreground">{detail.lastActive}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Role:</span>
                  <Badge variant="outline" className={roleStyles[userRoles[detail.id]]}>{roleLabel[userRoles[detail.id]]}</Badge>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Status:</span>
                  <Badge variant="outline" className={statusStyles[userStatuses[detail.id]]}>{userStatuses[detail.id]}</Badge>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedUser(null)}>Close</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Confirmation Dialog */}
        <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Confirm Action</DialogTitle>
              <DialogDescription>
                {confirmDialog?.action === "changeRole" && `Change user role to ${roleLabel[confirmDialog.newRole!]}?`}
                {confirmDialog?.action === "suspend" && "Suspend this user? They won't be able to access the platform."}
                {confirmDialog?.action === "ban" && "Ban this user permanently? This action can be reversed."}
                {confirmDialog?.action === "activate" && "Reactivate this user account?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>Cancel</Button>
              <Button
                onClick={confirmAction}
                variant={confirmDialog?.action === "ban" ? "destructive" : "default"}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminUsers;
