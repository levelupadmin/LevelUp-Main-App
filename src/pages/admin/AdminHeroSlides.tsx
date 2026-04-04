import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import AdminLayout from "@/components/layout/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, GripVertical, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface HeroSlide {
  id: string;
  title: string;
  rotating_words: string[];
  subtitle: string;
  cta_label: string;
  cta_link: string;
  image_url: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

const emptyForm = {
  title: "Where India's next great",
  rotating_words: "filmmakers, editors, storytellers, cinematographers, creators",
  subtitle: "",
  cta_label: "See all Programs",
  cta_link: "/explore",
  image_url: "",
  sort_order: 0,
  is_active: true,
};

const AdminHeroSlides = () => {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editingSlide, setEditingSlide] = useState<HeroSlide | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [uploading, setUploading] = useState(false);

  const { data: slides = [], isLoading } = useQuery({
    queryKey: ["hero-slides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hero_slides")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data as HeroSlide[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: Omit<HeroSlide, "id" | "created_at">) => {
      if (editingSlide) {
        const { error } = await supabase
          .from("hero_slides")
          .update(payload)
          .eq("id", editingSlide.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("hero_slides").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero-slides"] });
      toast.success(editingSlide ? "Slide updated" : "Slide created");
      closeDialog();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hero_slides").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hero-slides"] });
      toast.success("Slide deleted");
      setDeleteId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("hero_slides")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hero-slides"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const openCreate = () => {
    setEditingSlide(null);
    setForm({ ...emptyForm, sort_order: slides.length });
    setDialogOpen(true);
  };

  const openEdit = (s: HeroSlide) => {
    setEditingSlide(s);
    setForm({
      title: s.title,
      rotating_words: s.rotating_words.join(", "),
      subtitle: s.subtitle,
      cta_label: s.cta_label,
      cta_link: s.cta_link,
      image_url: s.image_url || "",
      sort_order: s.sort_order,
      is_active: s.is_active,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingSlide(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `hero/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("course-content").upload(path, file);
    if (error) {
      toast.error("Upload failed: " + error.message);
      setUploading(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("course-content").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: urlData.publicUrl }));
    setUploading(false);
    toast.success("Image uploaded");
  };

  const handleSave = () => {
    const words = form.rotating_words
      .split(",")
      .map((w) => w.trim())
      .filter(Boolean);
    saveMutation.mutate({
      title: form.title,
      rotating_words: words,
      subtitle: form.subtitle,
      cta_label: form.cta_label,
      cta_link: form.cta_link,
      image_url: form.image_url || null,
      sort_order: form.sort_order,
      is_active: form.is_active,
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Hero Slides</h1>
            <p className="text-sm text-muted-foreground">Manage the homepage hero carousel</p>
          </div>
          <Button onClick={openCreate} size="sm">
            <Plus className="mr-1.5 h-4 w-4" /> Add Slide
          </Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : slides.length === 0 ? (
          <Card className="flex flex-col items-center justify-center py-16 text-center">
            <ImageIcon className="h-12 w-12 text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground text-sm">No hero slides yet. The carousel will use default content.</p>
            <Button onClick={openCreate} variant="outline" size="sm" className="mt-4">
              <Plus className="mr-1.5 h-4 w-4" /> Create First Slide
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {slides.map((s) => (
              <Card key={s.id} className="flex items-center gap-4 p-4">
                <GripVertical className="h-4 w-4 text-muted-foreground/40 shrink-0" />
                <div className="h-16 w-28 rounded-md bg-muted overflow-hidden shrink-0">
                  {s.image_url ? (
                    <img src={s.image_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center">
                      <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {s.rotating_words.join(", ")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Order: {s.sort_order}</p>
                </div>
                <Switch
                  checked={s.is_active}
                  onCheckedChange={(v) => toggleActive.mutate({ id: s.id, is_active: v })}
                />
                <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleteId(s.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingSlide ? "Edit Slide" : "New Slide"}</DialogTitle>
            <DialogDescription>
              Configure the hero slide content and appearance.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>Headline</Label>
              <Input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Where India's next great"
              />
            </div>
            <div>
              <Label>Rotating Words (comma-separated)</Label>
              <Input
                value={form.rotating_words}
                onChange={(e) => setForm((f) => ({ ...f, rotating_words: e.target.value }))}
                placeholder="filmmakers, editors, storytellers"
              />
            </div>
            <div>
              <Label>Subtitle</Label>
              <Textarea
                value={form.subtitle}
                onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
                rows={2}
                placeholder="On-demand masterclasses…"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>CTA Label</Label>
                <Input
                  value={form.cta_label}
                  onChange={(e) => setForm((f) => ({ ...f, cta_label: e.target.value }))}
                />
              </div>
              <div>
                <Label>CTA Link</Label>
                <Input
                  value={form.cta_link}
                  onChange={(e) => setForm((f) => ({ ...f, cta_link: e.target.value }))}
                />
              </div>
            </div>
            <div>
              <Label>Background Image</Label>
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="preview"
                  className="h-28 w-full rounded-md object-cover mb-2"
                />
              )}
              <Input
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                disabled={uploading}
              />
              {uploading && <p className="text-xs text-muted-foreground mt-1">Uploading…</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sort Order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))
                  }
                />
              </div>
              <div className="flex items-end gap-2 pb-1">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
                />
                <Label>Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete slide?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminLayout>
  );
};

export default AdminHeroSlides;
