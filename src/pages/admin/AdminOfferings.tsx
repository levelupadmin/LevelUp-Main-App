import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Search, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface OfferingRow {
  id: string;
  title: string;
  type: string;
  price_inr: number;
  mrp_inr: number | null;
  status: string;
  course_count: number;
  enrolment_count: number;
}

interface CourseOption {
  id: string;
  title: string;
}

const EMPTY_FORM = {
  title: "", description: "", type: "live_cohort", price_inr: 0, mrp_inr: "",
  thumbnail_url: "", status: "draft", gst_mode: "none", gst_rate: 0,
  slug: "", validity_days: "",
};

const AdminOfferings = () => {
  const [offerings, setOfferings] = useState<OfferingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [linkedCourseIds, setLinkedCourseIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data: offs } = await supabase.from("offerings").select("id, title, type, price_inr, mrp_inr, status").order("created_at", { ascending: false });
    if (!offs) { setLoading(false); return; }

    const offIds = offs.map((o) => o.id);
    const [ocRes, enRes] = await Promise.all([
      supabase.from("offering_courses").select("offering_id, course_id").in("offering_id", offIds),
      supabase.from("enrolments").select("offering_id").in("offering_id", offIds),
    ]);

    const courseCounts: Record<string, number> = {};
    (ocRes.data || []).forEach((oc) => { courseCounts[oc.offering_id] = (courseCounts[oc.offering_id] || 0) + 1; });
    const enrolCounts: Record<string, number> = {};
    (enRes.data || []).forEach((e) => { enrolCounts[e.offering_id] = (enrolCounts[e.offering_id] || 0) + 1; });

    setOfferings(offs.map((o) => ({
      ...o,
      course_count: courseCounts[o.id] || 0,
      enrolment_count: enrolCounts[o.id] || 0,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEditor = async (offId?: string) => {
    const { data: courses } = await supabase.from("courses").select("id, title").order("title");
    setAllCourses(courses || []);

    if (offId) {
      const { data } = await supabase.from("offerings").select("*").eq("id", offId).single();
      if (data) {
        setForm({
          title: data.title, description: data.description || "", type: data.type,
          price_inr: data.price_inr, mrp_inr: data.mrp_inr?.toString() || "",
          thumbnail_url: data.thumbnail_url || "", status: data.status,
          gst_mode: data.gst_mode, gst_rate: data.gst_rate || 0,
          slug: data.slug, validity_days: data.validity_days?.toString() || "",
        });
        const { data: ocs } = await supabase.from("offering_courses").select("course_id").eq("offering_id", offId);
        setLinkedCourseIds((ocs || []).map((oc) => oc.course_id));
      }
      setEditId(offId);
    } else {
      setForm(EMPTY_FORM);
      setLinkedCourseIds([]);
      setEditId(null);
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);

    const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload = {
      title: form.title, description: form.description || null, type: form.type,
      price_inr: form.price_inr, mrp_inr: form.mrp_inr ? Number(form.mrp_inr) : null,
      thumbnail_url: form.thumbnail_url || null, status: form.status,
      gst_mode: form.gst_mode, gst_rate: form.gst_rate || 0, slug,
      validity_days: form.validity_days ? Number(form.validity_days) : null,
    };

    let offId = editId;
    if (editId) {
      const { error } = await supabase.from("offerings").update(payload).eq("id", editId);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
    } else {
      const { data, error } = await supabase.from("offerings").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); setSaving(false); return; }
      offId = data.id;
    }

    // Sync offering_courses
    if (offId) {
      await supabase.from("offering_courses").delete().eq("offering_id", offId);
      if (linkedCourseIds.length > 0) {
        await supabase.from("offering_courses").insert(
          linkedCourseIds.map((cid) => ({ offering_id: offId!, course_id: cid }))
        );

        // Auto-set primary_offering_id for courses that don't have one yet
        const { data: coursesWithoutPrimary } = await supabase
          .from("courses")
          .select("id, primary_offering_id")
          .in("id", linkedCourseIds)
          .is("primary_offering_id", null) as any;

        if (coursesWithoutPrimary?.length) {
          await Promise.all(
            coursesWithoutPrimary.map((c: any) =>
              supabase.from("courses").update({ primary_offering_id: offId } as any).eq("id", c.id)
            )
          );
        }
      }
    }

    toast({ title: "Offering saved" });
    setEditOpen(false);
    setSaving(false);
    load();
  };

  const filtered = offerings.filter((o) => o.title.toLowerCase().includes(search.toLowerCase()));

  return (
    <AdminLayout title="Offerings">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search offerings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => openEditor()} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> New Offering
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="px-5 py-3 font-medium">Title</th>
              <th className="px-5 py-3 font-medium">Type</th>
              <th className="px-5 py-3 font-medium">Price</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Courses</th>
              <th className="px-5 py-3 font-medium">Enrolments</th>
              <th className="px-5 py-3 font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-muted-foreground">No offerings found</td></tr>
            ) : filtered.map((o) => (
              <tr key={o.id} className="border-b border-border last:border-0 hover:bg-secondary/30">
                <td className="px-5 py-3 font-medium">{o.title}</td>
                <td className="px-5 py-3 font-mono text-xs">{o.type}</td>
                <td className="px-5 py-3">
                  ₹{o.price_inr}
                  {o.mrp_inr && o.mrp_inr > o.price_inr && (
                    <span className="text-muted-foreground line-through ml-2 text-xs">₹{o.mrp_inr}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-mono px-2 py-0.5 rounded ${o.status === "active" ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]" : "bg-secondary text-muted-foreground"}`}>{o.status}</span>
                </td>
                <td className="px-5 py-3 font-mono text-xs">{o.course_count}</td>
                <td className="px-5 py-3 font-mono text-xs">{o.enrolment_count}</td>
                <td className="px-5 py-3">
                  <button onClick={() => openEditor(o.id)} className="p-1.5 rounded hover:bg-secondary">
                    <Pencil className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Offering" : "New Offering"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Title</label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="live_cohort">Live Cohort</SelectItem>
                    <SelectItem value="masterclass">Masterclass</SelectItem>
                    <SelectItem value="workshop">Workshop</SelectItem>
                    <SelectItem value="bundle">Bundle</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Status</label>
                <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Price (INR)</label>
                <Input type="number" value={form.price_inr} onChange={(e) => setForm((f) => ({ ...f, price_inr: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">MRP (INR)</label>
                <Input type="number" value={form.mrp_inr} onChange={(e) => setForm((f) => ({ ...f, mrp_inr: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Thumbnail URL</label>
              <Input value={form.thumbnail_url} onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">GST Mode</label>
                <Select value={form.gst_mode} onValueChange={(v) => setForm((f) => ({ ...f, gst_mode: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="inclusive">Inclusive</SelectItem>
                    <SelectItem value="exclusive">Exclusive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">GST Rate (%)</label>
                <Input type="number" value={form.gst_rate} onChange={(e) => setForm((f) => ({ ...f, gst_rate: Number(e.target.value) }))} />
              </div>
            </div>

            {/* Course linking */}
            <div>
              <label className="block text-sm font-medium mb-2">Linked Courses</label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                {allCourses.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={linkedCourseIds.includes(c.id)}
                      onCheckedChange={(checked) => {
                        setLinkedCourseIds((prev) =>
                          checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                        );
                      }}
                    />
                    {c.title}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving} className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
              {saving ? "Saving…" : "Save Offering"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminOfferings;
