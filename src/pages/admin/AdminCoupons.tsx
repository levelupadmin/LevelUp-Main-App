import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Search } from "lucide-react";

interface CouponRow {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  used_count: number;
  max_redemptions: number | null;
  valid_until: string | null;
  is_active: boolean;
  total_discount_given: number;
}

const EMPTY_FORM = {
  code: "", discount_type: "percent", discount_value: 0,
  max_redemptions: "", valid_from: "", valid_until: "",
  applies_to_offering_id: "", is_active: true,
};

const AdminCoupons = () => {
  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [offerings, setOfferings] = useState<{ id: string; title: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("coupons").select("id, code, discount_type, discount_value, used_count, max_redemptions, valid_until, is_active").order("created_at", { ascending: false });

    // Calculate total discount given per coupon from payment_orders
    const couponCodes = (data || []).map((c) => c.code);
    let discountMap: Record<string, number> = {};
    if (couponCodes.length > 0) {
      const { data: orders } = await supabase
        .from("payment_orders")
        .select("coupon_code, discount_inr")
        .eq("status", "captured")
        .in("coupon_code", couponCodes);
      (orders || []).forEach((o: any) => {
        if (o.coupon_code) {
          discountMap[o.coupon_code] = (discountMap[o.coupon_code] || 0) + Number(o.discount_inr || 0);
        }
      });
    }

    setCoupons((data || []).map((c) => ({
      ...c,
      total_discount_given: discountMap[c.code] || 0,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEditor = async (coupon?: CouponRow) => {
    const { data: offs } = await supabase.from("offerings").select("id, title").order("title");
    setOfferings(offs || []);

    if (coupon) {
      const { data } = await supabase.from("coupons").select("*").eq("id", coupon.id).single();
      if (data) {
        setForm({
          code: data.code, discount_type: data.discount_type,
          discount_value: data.discount_value,
          max_redemptions: data.max_redemptions?.toString() || "",
          valid_from: data.valid_from ? data.valid_from.split("T")[0] : "",
          valid_until: data.valid_until ? data.valid_until.split("T")[0] : "",
          applies_to_offering_id: data.applies_to_offering_id || "",
          is_active: data.is_active,
        });
      }
      setEditId(coupon.id);
    } else {
      setForm(EMPTY_FORM);
      setEditId(null);
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.code.trim()) { toast({ title: "Code is required", variant: "destructive" }); return; }
    setSaving(true);

    const payload = {
      code: form.code.toUpperCase(),
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      max_redemptions: form.max_redemptions ? Number(form.max_redemptions) : null,
      valid_from: form.valid_from || null,
      valid_until: form.valid_until || null,
      applies_to_offering_id: form.applies_to_offering_id || null,
      is_active: form.is_active,
    };

    if (editId) {
      const { error } = await supabase.from("coupons").update(payload).eq("id", editId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("coupons").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    }

    toast({ title: "Coupon saved" });
    setEditOpen(false);
    setSaving(false);
    load();
  };

  const filtered = coupons.filter((c) => {
    const matchesSearch = c.code.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all"
      ? true
      : statusFilter === "active" ? c.is_active : !c.is_active;
    return matchesSearch && matchesStatus;
  });

  return (
    <AdminLayout title="Coupons">
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search coupons..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => openEditor()} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Coupon
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Code</th>
              <th className="px-5 py-3 font-medium">Discount</th>
              <th className="px-5 py-3 font-medium">Used / Max</th>
              <th className="px-5 py-3 font-medium">Valid Until</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium text-right">Discount Given</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No coupons found</td></tr>
            ) : filtered.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-3 font-mono font-medium">{c.code}</td>
                <td className="px-5 py-3">
                  {c.discount_type === "percent" ? `${c.discount_value}%` : `₹${c.discount_value}`}
                </td>
                <td className="px-5 py-3 font-mono text-xs">
                  {c.used_count} / {c.max_redemptions ?? "∞"}
                </td>
                <td className="px-5 py-3 font-mono text-xs">
                  {c.valid_until ? new Date(c.valid_until).toLocaleDateString("en-IN") : "—"}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${c.is_active ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]" : "bg-secondary text-muted-foreground"}`}>
                    {c.is_active ? "active" : "inactive"}
                  </span>
                </td>
                <td className="px-5 py-3 text-right font-mono text-xs">
                  {c.total_discount_given > 0 ? `₹${c.total_discount_given.toLocaleString("en-IN")}` : "—"}
                </td>
                <td className="px-5 py-3">
                  <button onClick={() => openEditor(c)} className="p-1.5 rounded hover:bg-secondary">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? "Edit Coupon" : "New Coupon"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="E.g. WELCOME20" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Discount Type</label>
                <Select value={form.discount_type} onValueChange={(v) => setForm((f) => ({ ...f, discount_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Value</label>
                <Input type="number" value={form.discount_value} onChange={(e) => setForm((f) => ({ ...f, discount_value: Number(e.target.value) }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Max Redemptions</label>
              <Input type="number" value={form.max_redemptions} onChange={(e) => setForm((f) => ({ ...f, max_redemptions: e.target.value }))} placeholder="Leave empty for unlimited" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Valid From</label>
                <Input type="date" value={form.valid_from} onChange={(e) => setForm((f) => ({ ...f, valid_from: e.target.value }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Valid Until</label>
                <Input type="date" value={form.valid_until} onChange={(e) => setForm((f) => ({ ...f, valid_until: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Applies To Offering (optional)</label>
              <SearchableSelect
                options={[
                  { value: "__all__", label: "All offerings" },
                  ...offerings.map((o) => ({ value: o.id, label: o.title })),
                ]}
                value={form.applies_to_offering_id || "__all__"}
                onValueChange={(v) => setForm((f) => ({ ...f, applies_to_offering_id: v === "__all__" ? "" : v }))}
                placeholder="All offerings"
                searchPlaceholder="Search offerings…"
              />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
              <label className="text-sm">Active</label>
            </div>
            <Button onClick={handleSave} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Saving…" : "Save Coupon"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminCoupons;
