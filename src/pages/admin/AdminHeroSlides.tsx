import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Trash2 } from "lucide-react";

interface HeroSlide {
  id: string;
  title_prefix: string;
  title_accent: string;
  subtitle: string | null;
  category_label: string;
  image_url: string | null;
  cta_text: string;
  cta_link: string;
  placement: string;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  expires_at: string | null;
  duration_label: string | null;
  student_count_label: string | null;
  next_batch_label: string | null;
  gradient_class: string;
}

const EMPTY_FORM = {
  title_prefix: "",
  title_accent: "",
  subtitle: "",
  category_label: "LIVE COHORT",
  image_url: "",
  cta_text: "Explore program",
  cta_link: "/browse",
  placement: "both",
  sort_order: 0,
  is_active: true,
  starts_at: "",
  expires_at: "",
  duration_label: "",
  student_count_label: "",
  next_batch_label: "",
  gradient_class: "from-black/60 to-transparent",
};

const AdminHeroSlides = () => {
  const { toast } = useToast();
  const [slides, setSlides] = useState<HeroSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("hero_slides")
      .select("*")
      .order("sort_order", { ascending: true });
    setSlides((data as any[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (s: HeroSlide) => {
    setEditingId(s.id);
    setForm({
      title_prefix: s.title_prefix || "",
      title_accent: s.title_accent || "",
      subtitle: s.subtitle || "",
      category_label: s.category_label || "",
      image_url: s.image_url || "",
      cta_text: s.cta_text || "Explore program",
      cta_link: s.cta_link || "/browse",
      placement: s.placement || "both",
      sort_order: s.sort_order,
      is_active: s.is_active,
      starts_at: s.starts_at ? s.starts_at.slice(0, 16) : "",
      expires_at: s.expires_at ? s.expires_at.slice(0, 16) : "",
      duration_label: s.duration_label || "",
      student_count_label: s.student_count_label || "",
      next_batch_label: s.next_batch_label || "",
      gradient_class: s.gradient_class || "from-black/60 to-transparent",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.title_prefix.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    const payload: any = {
      title_prefix: form.title_prefix,
      title_accent: form.title_accent || "",
      subtitle: form.subtitle || null,
      category_label: form.category_label,
      image_url: form.image_url || null,
      cta_text: form.cta_text,
      cta_link: form.cta_link,
      placement: form.placement,
      sort_order: form.sort_order,
      is_active: form.is_active,
      starts_at: form.starts_at || null,
      expires_at: form.expires_at || null,
      duration_label: form.duration_label || null,
      student_count_label: form.student_count_label || null,
      next_batch_label: form.next_batch_label || null,
      gradient_class: form.gradient_class,
    };

    let error;
    if (editingId) {
      const res = await supabase.from("hero_slides").update(payload).eq("id", editingId);
      error = res.error;
    } else {
      const res = await supabase.from("hero_slides").insert(payload);
      error = res.error;
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: editingId ? "Slide updated" : "Slide created" });
      setDialogOpen(false);
      load();
    }
    setSaving(false);
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("hero_slides").update({ is_active: active }).eq("id", id);
    if (error) {
      toast({ title: "Failed to update slide", description: error.message, variant: "destructive" });
      return;
    }
    setSlides((prev) => prev.map((s) => (s.id === id ? { ...s, is_active: active } : s)));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this slide?")) return;
    const { error } = await supabase.from("hero_slides").delete().eq("id", id);
    if (error) {
      toast({ title: "Failed to delete slide", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Slide deleted" });
    load();
  };

  const field = (label: string, key: string, type: "text" | "number" | "datetime-local" = "text") => (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <Input
        type={type}
        value={(form as any)[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: type === "number" ? Number(e.target.value) : e.target.value }))}
      />
    </div>
  );

  return (
    <AdminLayout title="Hero Slides">
      <div className="flex justify-between items-center mb-6">
        <p className="text-sm text-muted-foreground">Manage the hero carousel on dashboard and login pages</p>
        <Button onClick={openNew} className="bg-cream text-cream-text hover:opacity-90">
          <Plus className="h-4 w-4 mr-2" /> Add Slide
        </Button>
      </div>

      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Preview</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Placement</TableHead>
              <TableHead>Order</TableHead>
              <TableHead>Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : slides.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No slides yet</TableCell></TableRow>
            ) : (
              slides.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    {s.image_url ? (
                      <img src={s.image_url} alt="" className="w-16 h-10 object-cover rounded" />
                    ) : (
                      <div className="w-16 h-10 bg-surface-2 rounded" />
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{s.title_prefix}</span>{" "}
                    <span className="font-serif-italic text-cream">{s.title_accent}</span>
                  </TableCell>
                  <TableCell className="capitalize font-mono text-xs">{s.placement}</TableCell>
                  <TableCell className="font-mono text-xs">{s.sort_order}</TableCell>
                  <TableCell>
                    <Switch checked={s.is_active} onCheckedChange={(v) => handleToggleActive(s.id, v)} />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(s)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Slide" : "New Slide"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {field("Title (before italic)", "title_prefix")}
            <div>
              <label className="block text-sm font-medium mb-1">Italic Text <span className="text-muted-foreground">(Instrument Serif italic)</span></label>
              <Input value={form.title_accent} onChange={(e) => setForm((f) => ({ ...f, title_accent: e.target.value }))} />
            </div>
            {field("Subtitle", "subtitle")}
            <div>
              <label className="block text-sm font-medium mb-1">Category Label <span className="text-muted-foreground">(e.g. LIVE COHORT)</span></label>
              <Input value={form.category_label} onChange={(e) => setForm((f) => ({ ...f, category_label: e.target.value }))} />
            </div>
            {field("Image URL", "image_url")}
            <div className="grid grid-cols-2 gap-3">
              {field("CTA Text", "cta_text")}
              {field("CTA Link", "cta_link")}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Placement</label>
              <Select value={form.placement} onValueChange={(v) => setForm((f) => ({ ...f, placement: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both (Dashboard + Login)</SelectItem>
                  <SelectItem value="dashboard">Dashboard only</SelectItem>
                  <SelectItem value="login">Login only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("Sort Order", "sort_order", "number")}
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />
                <label className="text-sm">Active</label>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("Starts At", "starts_at", "datetime-local")}
              {field("Expires At", "expires_at", "datetime-local")}
            </div>
            <p className="text-xs text-muted-foreground">Optional: leave blank for always-visible slides</p>
            <div className="grid grid-cols-3 gap-3">
              {field("Duration Label", "duration_label")}
              {field("Students Label", "student_count_label")}
              {field("Next Batch Label", "next_batch_label")}
            </div>
            <div className="pt-2">
              <Button onClick={handleSave} disabled={saving} className="w-full bg-cream text-cream-text hover:opacity-90">
                {saving ? "Saving…" : editingId ? "Update Slide" : "Create Slide"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminHeroSlides;
