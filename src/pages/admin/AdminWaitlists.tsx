import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Search, Users, Bell, Trash2, Mail } from "lucide-react";

const useWaitlists = () =>
  useQuery({
    queryKey: ["admin-waitlists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("waitlists")
        .select("*, courses(title)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

const AdminWaitlists = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");

  const { data: entries = [], isLoading } = useWaitlists();

  const filtered = entries.filter(
    (e: any) =>
      search === "" ||
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase())
  );

  const markNotified = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waitlists").update({ notified: true }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-waitlists"] });
      toast({ title: "Marked as notified" });
    },
  });

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("waitlists").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-waitlists"] });
      toast({ title: "Entry removed" });
    },
  });

  const pendingCount = entries.filter((e: any) => !e.notified).length;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Waitlists</h1>
          <p className="text-sm text-muted-foreground">Manage waitlist signups for courses at capacity</p>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Total Signups", value: entries.length, icon: Users },
            { label: "Pending Notification", value: pendingCount, icon: Bell },
            { label: "Notified", value: entries.length - pendingCount, icon: Mail },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3">
                <Icon className="h-4 w-4 text-muted-foreground" />
                <div>
                  <span className="text-lg font-bold text-foreground">{s.value}</span>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Name</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Course</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e: any) => (
                  <tr key={e.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3 text-foreground font-medium">{e.name}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{e.email}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">{e.courses?.title || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={e.notified ? "secondary" : "default"} className="text-[10px]">
                        {e.notified ? "Notified" : "Pending"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!e.notified && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => markNotified.mutate(e.id)} title="Mark as notified">
                            <Bell className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteEntry.mutate(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">No waitlist entries found</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminWaitlists;
