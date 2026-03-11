import { useState, useEffect } from "react";
import { Save, Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  useAdminCourse, useUpdateCourse,
  CATEGORIES, difficultyLabel,
} from "@/hooks/useCourseAdmin";

interface Props {
  courseId: string;
}

const InformationTab = ({ courseId }: Props) => {
  const { data: course } = useAdminCourse(courseId);
  const updateCourse = useUpdateCourse();

  const [form, setForm] = useState({
    title: "",
    slug: "",
    description: "",
    short_description: "",
    category: "General",
    difficulty: "beginner",
    instructor_name: "",
    estimated_duration: "",
    thumbnail_url: "",
    banner_url: "",
    trailer_url: "",
    validity_days: null as number | null,
    show_as_locked: false,
    is_free: false,
    price: 0,
  });

  useEffect(() => {
    if (course) {
      setForm({
        title: course.title || "",
        slug: course.slug || "",
        description: course.description || "",
        short_description: course.short_description || "",
        category: course.category || "General",
        difficulty: course.difficulty || "beginner",
        instructor_name: course.instructor_name || "",
        estimated_duration: course.estimated_duration || "",
        thumbnail_url: course.thumbnail_url || "",
        banner_url: course.banner_url || "",
        trailer_url: course.trailer_url || "",
        validity_days: course.validity_days,
        show_as_locked: course.show_as_locked || false,
        is_free: course.is_free || false,
        price: course.price || 0,
      });
    }
  }, [course]);

  const handleSave = () => {
    updateCourse.mutate({
      id: courseId,
      ...form,
      validity_days: form.validity_days || null,
    });
  };

  const update = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Course Information</h2>
          <p className="text-sm text-muted-foreground">General settings and metadata</p>
        </div>
        <Button onClick={handleSave} disabled={updateCourse.isPending} className="gap-2">
          <Save className="h-4 w-4" />
          Save Changes
        </Button>
      </div>

      {/* Thumbnail & Banner */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Media</h3>

        <div className="grid gap-5 sm:grid-cols-2">
          {/* Thumbnail */}
          <div className="space-y-2">
            <Label>Thumbnail</Label>
            {form.thumbnail_url ? (
              <div className="relative rounded-lg overflow-hidden border border-border aspect-video bg-secondary">
                <img src={form.thumbnail_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border aspect-video bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-xs text-muted-foreground">Upload thumbnail</span>
              </div>
            )}
            <Input
              placeholder="Or paste image URL"
              value={form.thumbnail_url}
              onChange={(e) => update("thumbnail_url", e.target.value)}
            />
          </div>

          {/* Banner */}
          <div className="space-y-2">
            <Label>Default Video Thumbnail</Label>
            {form.banner_url ? (
              <div className="relative rounded-lg overflow-hidden border border-border aspect-video bg-secondary">
                <img src={form.banner_url} alt="" className="w-full h-full object-cover" />
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border aspect-video bg-secondary/30 hover:bg-secondary/50 cursor-pointer transition-colors">
                <ImageIcon className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-xs text-muted-foreground">Upload video thumbnail</span>
              </div>
            )}
            <Input
              placeholder="Or paste image URL"
              value={form.banner_url}
              onChange={(e) => update("banner_url", e.target.value)}
            />
          </div>
        </div>

        {/* Trailer */}
        <div className="space-y-2">
          <Label>Trailer / Preview Video URL</Label>
          <Input
            placeholder="https://youtube.com/watch?v=..."
            value={form.trailer_url}
            onChange={(e) => update("trailer_url", e.target.value)}
          />
        </div>
      </div>

      {/* Basic Info */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Details</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => update("title", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Slug</Label>
            <Input value={form.slug} onChange={(e) => update("slug", e.target.value)} />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Short Description</Label>
          <Input
            value={form.short_description}
            onChange={(e) => update("short_description", e.target.value)}
            placeholder="One-line summary"
          />
        </div>

        <div className="space-y-2">
          <Label>Full Description</Label>
          <Textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={4}
            placeholder="Detailed course description..."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => update("category", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Difficulty</Label>
            <Select value={form.difficulty} onValueChange={(v) => update("difficulty", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(difficultyLabel).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Instructor</Label>
            <Input value={form.instructor_name} onChange={(e) => update("instructor_name", e.target.value)} />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Duration</Label>
            <Input
              value={form.estimated_duration}
              onChange={(e) => update("estimated_duration", e.target.value)}
              placeholder="e.g. 8 hours"
            />
          </div>
          <div className="space-y-2">
            <Label>Price (₹)</Label>
            <Input
              type="number"
              value={form.price}
              onChange={(e) => update("price", Number(e.target.value))}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={form.is_free}
                onCheckedChange={(v) => update("is_free", v)}
              />
              Free course
            </label>
          </div>
        </div>
      </div>

      {/* Settings */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h3 className="text-sm font-semibold text-foreground">Access & Visibility</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Validity (days)</Label>
            <Input
              type="number"
              value={form.validity_days ?? ""}
              onChange={(e) => update("validity_days", e.target.value ? Number(e.target.value) : null)}
              placeholder="Leave empty for lifetime"
            />
            <p className="text-xs text-muted-foreground">
              How long students can access the course after enrollment
            </p>
          </div>
          <div className="space-y-4 pt-6">
            <label className="flex items-center gap-3 text-sm">
              <Switch
                checked={form.show_as_locked}
                onCheckedChange={(v) => update("show_as_locked", v)}
              />
              <div>
                <span className="font-medium">Show as locked</span>
                <p className="text-xs text-muted-foreground">Display a lock icon for non-enrolled students</p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InformationTab;
