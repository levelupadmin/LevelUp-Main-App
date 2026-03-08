import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Copy, Users, Gift, TrendingUp, Trash2 } from "lucide-react";

const useReferralCodes = () =>
  useQuery({
    queryKey: ["admin-referrals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_codes")
        .select("*, profiles!referral_codes_user_id_fkey(name, email:avatar_url)")
        .order("created_at", { ascending: false });
      if (error) {
        // Fallback without join if FK doesn't exist
        const { data: fallback, error: err2 } = await supabase
          .from("referral_codes")
          .select("*")
          .order("created_at", { ascending: false });
        if (err2) throw err2;
        return fallback;
      }
      return data;
    },
  });

const useRedemptions = () =>
  useQuery({
    queryKey: ["admin-redemptions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("referral_redemptions")
        .select("*")
        .order("redeemed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

const AdminReferrals = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const { data: referrals = [], isLoading } = useReferralCodes();
  const { data: redemptions = [] } = useRedemptions();

  const filtered = referrals.filter(
    (r: any) => search === "" || r.code.toLowerCase().includes(search.toLowerCase())
  );

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("referral_codes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-referrals"] }),
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const deleteCode = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("referral_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
      toast({ title: "Referral code deleted" });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const createCode = useMutation({
    mutationFn: async (code: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase.from("referral_codes").insert({
        code: code.toUpperCase(),
        user_id: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-referrals"] });
      toast({ title: "Referral code created" });
      setShowCreate(false);
      setNewCode("");
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const copyCode = (code: string, id: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const totalReferrals = referrals.reduce((sum: number, r: any) => sum + (r.total_referrals || 0), 0);
  const successfulReferrals = referrals.reduce((sum: number, r: any) => sum + (r.successful_referrals || 0), 0);

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Referral Program</h1>
            <p className="text-sm text-muted-foreground">Manage referral codes and track performance</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
            <Plus className="h-4 w-4 mr-1" /> Create Code
          </Button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 flex-wrap">
          {[
            { label: "Total Codes", value: referrals.length, icon: Gift },
            { label: "Total Referrals", value: totalReferrals, icon: Users },
            { label: "Successful", value: successfulReferrals, icon: TrendingUp },
            { label: "Redemptions", value: redemptions.length, icon: Gift },
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
          <Input placeholder="Search codes..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Table */}
        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Code</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Referrals</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Successful</th>
                  <th className="text-center px-4 py-3 font-medium text-muted-foreground">Active</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r: any) => (
                  <tr key={r.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono text-xs">{r.code}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-foreground">{r.total_referrals}</td>
                    <td className="px-4 py-3 text-right hidden sm:table-cell text-foreground">{r.successful_referrals}</td>
                    <td className="px-4 py-3 text-center">
                      <Switch checked={r.is_active} onCheckedChange={(checked) => toggleActive.mutate({ id: r.id, is_active: checked })} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyCode(r.code, r.id)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        {copiedId === r.id && <span className="text-xs text-muted-foreground">Copied!</span>}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteCode.mutate(r.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-muted-foreground">No referral codes found</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Referral Code</DialogTitle>
            <DialogDescription>Create a new referral code for students to share.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Code</label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value.toUpperCase())} placeholder="e.g. FRIEND20" className="mt-1 font-mono" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={() => createCode.mutate(newCode)} disabled={!newCode.trim() || createCode.isPending}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminReferrals;
