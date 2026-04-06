import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";

interface Category {
  id: string;
  name: string;
}

interface OfferingOption {
  id: string;
  title: string;
  price_inr: number;
}

const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-IN").format(amount);

const AdminCourseEditor = () => {
  const { courseId } = useParams();
  const isNew = courseId === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableOfferings, setAvailableOfferings] = useState<OfferingOption[]>([]);

  const [form, setForm] = useState({
    title: "",
    subtitle: "",
    description: "",
    instructor_display_name: "",
    thumbnail_url: "",
    category_id: "",
    level: "",
    duration_minutes: 0,
    status: "draft",
    slug: "",
    product_tier: "masterclass",
    sort_order: 50,
    primary_offering_id: "" as string | null,
  });

  useEffect(() => {
    const load = async () => {
      const { data: cats } = await supabase.from("course_categories").select("id, name").order("sort_order");
      setCategories(cats || []);

      if (!isNew && courseId) {
        const { data } = await supabase.from("courses").select("*").eq("id", courseId).single();
        if (data) {
          setForm({
            title: data.title || "",
            subtitle: data.subtitle || "",
            description: data.description || "",
            instructor_display_name: data.instructor_display_name || "",
            thumbnail_url: data.thumbnail_url || "",
            category_id: data.category_id || "",
            level: data.level || "",
            duration_minutes: data.duration_minutes || 0,
            status: data.status || "draft",
            slug: data.slug || "",
            product_tier: data.product_tier || "masterclass",
            sort_order: data.sort_order || 50,
            primary_offering_id: (data as any).primary_offering_id || "",
          });
        }

        // Load offerings linked to this course
        const { data: ocs } = await supabase
          .from("offering_courses")
          .select("offering_id")
          .eq("course_id", courseId);

        if (ocs?.length) {
          const offIds = ocs.map((oc) => oc.offering_id);
          const { data: offs } = await supabase
            .from("offerings")
            .select("id, title, price_inr")
            .in("id", offIds)
            .eq("status", "active")
            .order("price_inr", { ascending: true });
          setAvailableOfferings(offs ?? []);
        }
      }
    };
    load();
  }, [courseId, isNew]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    setSaving(true);
    const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const payload: Record<string, any> = {
      title: form.title,
      subtitle: form.subtitle || null,
      description: form.description || null,
      instructor_display_name: form.instructor_display_name || null,
      thumbnail_url: form.thumbnail_url || null,
      category_id: form.category_id || null,
      level: form.level || null,
      duration_minutes: form.duration_minutes || 0,
      status: form.status,
      slug,
      product_tier: form.product_tier,
      sort_order: form.sort_order,
      primary_offering_id: form.primary_offering_id || null,
    };

    let error;
    if (isNew) {
      const res = await supabase.from("courses").insert(payload as any).select("id").single();
      error = res.error;
      if (!error && res.data) {
        toast({ title: "Course created" });
        navigate(`/admin/courses/${res.data.id}/edit`);
        setSaving(false);
        return;
      }
    } else {
      const res = await supabase.from("courses").update(payload as any).eq("id", courseId!);
      error = res.error;
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Course saved" });
    }
    setSaving(false);
  };

  const field = (label: string, key: keyof typeof form, type: "text" | "textarea" | "number" = "text") => (
    <div>
      <label className="block text-sm font-medium mb-1.5">{label}</label>
      {type === "textarea" ? (
        <Textarea
          value={form[key] as string}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          rows={4}
        />
      ) : (
        <Input
          type={type}
          value={form[key] as string | number}
          onChange={(e) =>
            setForm((f) => ({
              ...f,
              [key]: type === "number" ? Number(e.target.value) : e.target.value,
            }))
          }
        />
      )}
    </div>
  );

  return (
    <AdminLayout title={isNew ? "New Course" : "Edit Course"}>
      <button
        onClick={() => navigate("/admin/courses")}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ArrowLeft className="h-4 w-4" /> Back to courses
      </button>

      <div className="max-w-2xl space-y-5">
        {field("Title", "title")}
        {field("Slug", "slug")}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Product Tier</label>
            <Select value={form.product_tier} onValueChange={(v) => setForm((f) => ({ ...f, product_tier: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="live_cohort">Mentorship Cohort</SelectItem>
                <SelectItem value="masterclass">Masterclass</SelectItem>
                <SelectItem value="advanced_program">Program</SelectItem>
                <SelectItem value="workshop">Workshop</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {field("Sort Order", "sort_order", "number")}
        </div>

        {/* Primary Offering */}
        {!isNew && (
          <div>
            <label className="block text-sm font-medium mb-1">
              Primary Offering <span className="text-muted-foreground font-normal">(shown on Browse page)</span>
            </label>
            {availableOfferings.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No active offerings linked to this course yet. Create an offering first, then come back to set it.
              </p>
            ) : (
              <Select
                value={form.primary_offering_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, primary_offering_id: v === "none" ? null : v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select the offering to show on Browse page" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (hide price on Browse)</SelectItem>
                  {availableOfferings.map((off) => (
                    <SelectItem key={off.id} value={off.id}>
                      {off.title} — ₹{formatPrice(off.price_inr)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              This controls which price and checkout link students see when browsing. Changing this doesn't affect existing enrolments.
            </p>
          </div>
        )}

        {field("Subtitle", "subtitle")}
        {field("Description", "description", "textarea")}
        {field("Instructor Display Name", "instructor_display_name")}
        {field("Thumbnail URL", "thumbnail_url")}

        {form.thumbnail_url && (
          <img src={form.thumbnail_url} alt="" className="w-48 h-28 object-cover rounded-lg border border-border" />
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Category</label>
            <Select value={form.category_id} onValueChange={(v) => setForm((f) => ({ ...f, category_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Level</label>
            <Select value={form.level} onValueChange={(v) => setForm((f) => ({ ...f, level: v }))}>
              <SelectTrigger><SelectValue placeholder="Select level" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {field("Duration (minutes)", "duration_minutes", "number")}
          <div>
            <label className="block text-sm font-medium mb-1.5">Status</label>
            <Select value={form.status} onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
            {saving ? "Saving…" : "Save Course"}
          </Button>
          {!isNew && (
            <Button variant="outline" onClick={() => navigate(`/admin/courses/${courseId}/curriculum`)}>
              Manage Curriculum
            </Button>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminCourseEditor;
