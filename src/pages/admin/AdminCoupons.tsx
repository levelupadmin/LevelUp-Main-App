import { useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Search, Copy, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const useCoupons = () =>
  useQuery({
    queryKey: ["admin-coupons"],
    queryFn: async () => {
      const { data, error } = await supabase.from("coupon_codes").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

const useCourseList = () =>
  useQuery({
    queryKey: ["admin-courses-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("id, title").order("title");
      if (error) throw error;
      return data;
    },
  });

const AdminCoupons = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: coupons = [], isLoading } = useCoupons();
  const { data: coursesList = [] } = useCourseList();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: "",
    discount_type: "percentage" as "percentage" | "fixed",
    discount_value: 10,
    max_uses: null as number | null,
    valid_from: "",
    valid_until: "",
    is_active: true,
  });

  const createCoupon = useMutation({
    mutationFn: async (coupon: any) => {
      const { error } = await supabase.from("coupon_codes").insert(coupon);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast({ title: "Coupon created" });
      setShowCreate(false);
      setForm({ code: "", discount_type: "percentage", discount_value: 10, max_uses: null, valid_from: "", valid_until: "", is_active: true });
    },
    onError: (err) => toast({ title: "Error", description: err.message, variant: "destructive" }),
  });

  const toggleCoupon = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from("coupon_codes").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-coupons"] }),
  });

  const deleteCoupon = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("coupon_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-coupons"] });
      toast({ title: "Coupon deleted" });
    },
  });

  const filtered = coupons.filter((c: any) => c.code.toLowerCase().includes(search.toLowerCase()));

  const copyCode = (id: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Coupon Codes</h1>
            <p className="text-sm text-muted-foreground">Create and manage discount coupons</p>
          </div>
          <Button size="sm" onClick={() => setShowCreate(true)} className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90">
            <Plus className="h-4 w-4 mr-1" /> Create Coupon
          </Button>
        </div>

        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search coupons..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="rounded-lg border border-border overflow-hidden">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">Loading...</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Code</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Discount</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Usage</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden lg:table-cell">Validity</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Active</th>
                  <th className="text-right px-4 py-3 font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((coupon: any) => (
                  <tr key={coupon.id} className="border-b border-border hover:bg-secondary/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono font-bold text-foreground bg-secondary px-2 py-0.5 rounded">{coupon.code}</code>
                        <button onClick={() => copyCode(coupon.id, coupon.code)} className="text-muted-foreground hover:text-foreground">
                          {copiedId === coupon.id ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <Badge variant="outline">
                        {coupon.discount_type === "percentage" ? `${coupon.discount_value}%` : `₹${coupon.discount_value}`}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground hidden lg:table-cell">
                      {coupon.current_uses}{coupon.max_uses ? ` / ${coupon.max_uses}` : " (unlimited)"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">
                      {coupon.valid_from ? new Date(coupon.valid_from).toLocaleDateString() : "–"} → {coupon.valid_until ? new Date(coupon.valid_until).toLocaleDateString() : "–"}
                    </td>
                    <td className="px-4 py-3">
                      <Switch checked={coupon.is_active} onCheckedChange={(v) => toggleCoupon.mutate({ id: coupon.id, is_active: v })} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteCoupon.mutate(coupon.id)} className="rounded-md p-1.5 hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!isLoading && filtered.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">No coupons found.</div>
          )}
        </div>
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Coupon Code</DialogTitle>
            <DialogDescription>Set up a new discount code</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Code *</label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="e.g. LAUNCH50" className="font-mono" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Discount Type</label>
                <Select value={form.discount_type} onValueChange={(v: any) => setForm({ ...form, discount_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Percentage (%)</SelectItem>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Value</label>
                <Input type="number" value={form.discount_value} onChange={(e) => setForm({ ...form, discount_value: parseFloat(e.target.value) || 0 })} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Max Uses (leave empty for unlimited)</label>
              <Input type="number" value={form.max_uses || ""} onChange={(e) => setForm({ ...form, max_uses: e.target.value ? parseInt(e.target.value) : null })} placeholder="Unlimited" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valid From</label>
                <Input type="date" value={form.valid_from} onChange={(e) => setForm({ ...form, valid_from: e.target.value })} />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Valid Until</label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button
              disabled={!form.code || createCoupon.isPending}
              onClick={() => createCoupon.mutate({
                code: form.code,
                discount_type: form.discount_type,
                discount_value: form.discount_value,
                max_uses: form.max_uses,
                valid_from: form.valid_from || null,
                valid_until: form.valid_until || null,
                is_active: form.is_active,
              })}
              className="bg-[hsl(var(--highlight))] text-[hsl(var(--highlight-foreground))] hover:bg-[hsl(var(--highlight))]/90"
            >
              {createCoupon.isPending ? "Creating..." : "Create Coupon"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCoupons;
