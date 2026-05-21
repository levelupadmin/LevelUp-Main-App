import { useEffect, useState, useCallback } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ROLE_ROUTE_MAP, ADMIN_ROLES } from "@/lib/permissions";
import { Shield, Plus, Trash2, Loader2 } from "lucide-react";

interface RolePermission {
  id: string;
  role: string;
  permission_key: string;
  description: string | null;
  created_at: string;
}

const AdminRoles = () => {
  const { toast } = useToast();
  const [permissions, setPermissions] = useState<RolePermission[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [newPermKey, setNewPermKey] = useState<Record<string, string>>({});
  const [newPermDesc, setNewPermDesc] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("role_permissions")
      .select("id, role, permission_key, description, created_at")
      .order("role")
      .order("permission_key");
    setPermissions(data || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addPermission = async (role: string) => {
    const key = (newPermKey[role] || "").trim();
    if (!key) {
      toast({ title: "Permission key required", variant: "destructive" });
      return;
    }
    setSaving(role);
    const { error } = await (supabase as any)
      .from("role_permissions")
      .insert({
        role,
        permission_key: key,
        description: (newPermDesc[role] || "").trim() || null,
      });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Permission added" });
      setNewPermKey((p) => ({ ...p, [role]: "" }));
      setNewPermDesc((p) => ({ ...p, [role]: "" }));
      load();
    }
    setSaving(null);
  };

  const removePermission = async (id: string) => {
    setSaving(id);
    const { error } = await (supabase as any)
      .from("role_permissions")
      .delete()
      .eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Permission removed" });
      load();
    }
    setSaving(null);
  };

  const rolesExceptAdmin = ADMIN_ROLES.filter((r) => r !== "admin");

  if (loading) {
    return (
      <AdminLayout title="Roles & Permissions">
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Roles & Permissions">
      <p className="text-muted-foreground mb-8">
        Manage route access and custom permissions for each admin role. The admin role has full access and cannot be modified.
      </p>

      {/* Admin card */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-[hsl(var(--accent-amber))]" />
          <h3 className="text-lg font-semibold">admin</h3>
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-[hsl(var(--accent-amber)/0.15)] text-[hsl(var(--accent-amber))]">
            Full Access
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          Admins have unrestricted access to all routes and features.
        </p>
      </div>

      {/* Non-admin role cards */}
      <div className="space-y-6">
        {rolesExceptAdmin.map((role) => {
          const routeList = ROLE_ROUTE_MAP[role] || [];
          const rolePerms = permissions.filter((p) => p.role === role);

          return (
            <div key={role} className="bg-card border border-border rounded-xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-5 w-5 text-[hsl(var(--accent-indigo))]" />
                <h3 className="text-lg font-semibold capitalize">{role}</h3>
              </div>

              {/* Route access */}
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">Route Access</p>
                <div className="flex flex-wrap gap-2">
                  {routeList.map((route) => (
                    <span
                      key={route}
                      className="text-xs font-mono px-2 py-1 rounded bg-surface-2 text-muted-foreground"
                    >
                      {route}
                    </span>
                  ))}
                </div>
              </div>

              {/* Custom permissions from DB */}
              <div className="mb-4">
                <p className="text-sm font-medium text-muted-foreground mb-2">
                  Custom Permissions ({rolePerms.length})
                </p>
                {rolePerms.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60">No custom permissions configured.</p>
                ) : (
                  <div className="space-y-2">
                    {rolePerms.map((p) => (
                      <div key={p.id} className="flex items-center gap-3 bg-surface rounded-lg px-3 py-2">
                        <span className="text-sm font-mono flex-1">{p.permission_key}</span>
                        {p.description && (
                          <span className="text-xs text-muted-foreground">{p.description}</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removePermission(p.id)}
                          disabled={saving === p.id}
                          className="text-destructive hover:text-destructive"
                        >
                          {saving === p.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Add permission */}
              <div className="flex items-center gap-2">
                <Input
                  placeholder="permission_key (e.g. manage_courses)"
                  value={newPermKey[role] || ""}
                  onChange={(e) => setNewPermKey((p) => ({ ...p, [role]: e.target.value }))}
                  className="flex-1"
                />
                <Input
                  placeholder="Description (optional)"
                  value={newPermDesc[role] || ""}
                  onChange={(e) => setNewPermDesc((p) => ({ ...p, [role]: e.target.value }))}
                  className="flex-1"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => addPermission(role)}
                  disabled={saving === role}
                >
                  {saving === role ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4 mr-1" />
                  )}
                  Add
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </AdminLayout>
  );
};

export default AdminRoles;
