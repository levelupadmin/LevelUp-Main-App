import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Eye, ArrowRight, Award, Star } from "lucide-react";
import AdminBreadcrumbs from "@/components/admin/AdminBreadcrumbs";
import { TierBadge } from "@/components/TierBadge";
import { useAuth } from "@/contexts/AuthContext";

interface Category {
  id: string;
  name: string;
}

interface OfferingOption {
  id: string;
  title: string;
  price_inr: number;
}

interface AllOffering {
  id: string;
  title: string;
  price_inr: number;
  status: string;
}

const formatPrice = (amount: number) =>
  new Intl.NumberFormat("en-IN").format(amount);

const AdminCourseEditor = () => {
  const { courseId } = useParams();
  const isNew = courseId === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();
  const [saving, setSaving] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableOfferings, setAvailableOfferings] = useState<OfferingOption[]>([]);
  const [allOfferings, setAllOfferings] = useState<AllOffering[]>([]);
  const [linkedOfferingIds, setLinkedOfferingIds] = useState<string[]>([]);

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
    default_video_type: "standard",
    show_on_browse: true,
  });

  useEffect(() => {
    const load = async () => {
      const [catsRes, allOffsRes] = await Promise.all([
        supabase.from("course_categories").select("id, name").order("sort_order"),
        supabase.from("offerings").select("id, title, price_inr, status").order("title"),
      ]);
      setCategories(catsRes.data || []);
      setAllOfferings(allOffsRes.data || []);

      if (!isNew && courseId) {
        const [courseRes, ocsRes] = await Promise.all([
          supabase.from("courses").select("*").eq("id", courseId).single(),
          supabase.from("offering_courses").select("offering_id").eq("course_id", courseId),
        ]);

        if (courseRes.data) {
          const data = courseRes.data as any;
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
            primary_offering_id: data.primary_offering_id || "",
            default_video_type: data.default_video_type || "standard",
            show_on_browse: data.show_on_browse ?? true,
          });
        }

        const linkedIds = (ocsRes.data || []).map((oc) => oc.offering_id);
        setLinkedOfferingIds(linkedIds);

        // For primary offering dropdown, show only active linked offerings
        if (linkedIds.length) {
          const activeLinked = (allOffsRes.data || []).filter(
            (o) => linkedIds.includes(o.id) && o.status === "active"
          );
          setAvailableOfferings(activeLinked.map((o) => ({ id: o.id, title: o.title, price_inr: o.price_inr })));
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

    // Check slug uniqueness
    let slugQuery = supabase.from("courses").select("id").eq("slug", slug);
    if (!isNew && courseId) {
      slugQuery = slugQuery.neq("id", courseId);
    }
    const { data: slugConflicts } = await slugQuery;
    if (slugConflicts && slugConflicts.length > 0) {
      toast({ title: "Slug already exists", description: `Another course is already using the slug "${slug}". Please choose a different slug.`, variant: "destructive" });
      setSaving(false);
      return;
    }

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
      default_video_type: form.default_video_type,
      show_on_browse: form.show_on_browse,
    };

    let savedCourseId = courseId;
    let error;

    if (isNew) {
      const res = await supabase.from("courses").insert(payload as any).select("id").single();
      error = res.error;
      if (!error && res.data) {
        savedCourseId = res.data.id;
      }
    } else {
      const res = await supabase.from("courses").update(payload as any).eq("id", courseId!);
      error = res.error;
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setSaving(false);
      return;
    }

    // Sync offering_courses (bidirectional linking)
    if (savedCourseId) {
      await supabase.from("offering_courses").delete().eq("course_id", savedCourseId);
      if (linkedOfferingIds.length > 0) {
        await supabase.from("offering_courses").insert(
          linkedOfferingIds.map((oid) => ({ offering_id: oid, course_id: savedCourseId! }))
        );
      }
    }

    // Audit log
    if (profile?.id && savedCourseId) {
      await (supabase as any).from("admin_audit_logs").insert({
        admin_user_id: profile.id,
        action: isNew ? "create" : "update",
        entity_type: "course",
        entity_id: savedCourseId,
        details: { title: form.title, status: form.status },
      });
    }

    toast({ title: "Course saved" });

    if (isNew && savedCourseId) {
      navigate(`/admin/courses/${savedCourseId}/edit`);
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
      <AdminBreadcrumbs items={[
        { label: "Courses", to: "/admin/courses" },
        { label: isNew ? "New Course" : (form.title || "Edit") },
      ]} />

      <div className="flex gap-8">
      {/* ── Left: Form ── */}
      <div className="max-w-2xl flex-1 min-w-0 space-y-5">
        {field("Title", "title")}
        {field("Slug", "slug")}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <SearchableSelect
                options={[
                  { value: "none", label: "None (hide price on Browse)" },
                  ...availableOfferings.map((off) => ({
                    value: off.id,
                    label: `${off.title} — ₹${formatPrice(off.price_inr)}`,
                  })),
                ]}
                value={form.primary_offering_id || "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, primary_offering_id: v === "none" ? null : v }))}
                placeholder="Select the offering to show on Browse page"
                searchPlaceholder="Search offerings…"
              />
            )}
            <p className="text-xs text-muted-foreground mt-1">
              This controls which price and checkout link students see when browsing. Changing this doesn't affect existing enrolments.
            </p>
          </div>
        )}

        {/* Browse Visibility */}
        <div className="border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Browse Visibility</h3>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.show_on_browse}
              onCheckedChange={(v) => setForm((f) => ({ ...f, show_on_browse: v }))}
            />
            <label className="text-sm">Show on Browse Programs page</label>
          </div>
          <p className="text-xs text-muted-foreground">
            When off, this course won't appear on the student Browse page but enrolled students still have full access. Useful for old batches or internal courses.
          </p>
        </div>

        {/* Video Defaults */}
        <div className="border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Video Defaults</h3>
          <div className="flex items-center gap-3">
            <Switch
              checked={form.default_video_type === "vdocipher"}
              onCheckedChange={(v) => setForm((f) => ({ ...f, default_video_type: v ? "vdocipher" : "standard" }))}
            />
            <label className="text-sm">DRM video by default for this course (VdoCipher)</label>
          </div>
          <p className="text-xs text-muted-foreground">
            When enabled, new chapters will default to VdoCipher DRM-protected video instead of standard upload.
          </p>
        </div>

        {/* Linked Offerings (bidirectional) */}
        <div className="border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-semibold">Linked Offerings</h3>
          <p className="text-xs text-muted-foreground">
            Select which offerings grant access to this course. This is the same link you see from the Offerings editor — managed from both sides.
          </p>
          <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
            {allOfferings.length === 0 ? (
              <p className="text-sm text-muted-foreground">No offerings found. Create offerings first.</p>
            ) : (
              allOfferings.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={linkedOfferingIds.includes(o.id)}
                    onCheckedChange={(checked) => {
                      setLinkedOfferingIds((prev) =>
                        checked ? [...prev, o.id] : prev.filter((id) => id !== o.id)
                      );
                      // Also update availableOfferings for primary offering dropdown
                      if (checked && o.status === "active") {
                        setAvailableOfferings((prev) =>
                          prev.find((p) => p.id === o.id) ? prev : [...prev, { id: o.id, title: o.title, price_inr: o.price_inr }]
                        );
                      } else if (!checked) {
                        setAvailableOfferings((prev) => prev.filter((p) => p.id !== o.id));
                        // Clear primary if unlinked
                        if (form.primary_offering_id === o.id) {
                          setForm((f) => ({ ...f, primary_offering_id: null }));
                        }
                      }
                    }}
                  />
                  <span className="flex-1">{o.title}</span>
                  <span className="text-xs text-muted-foreground font-mono">₹{o.price_inr}</span>
                  <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                    o.status === "active"
                      ? "bg-[hsl(var(--accent-emerald)/0.15)] text-[hsl(var(--accent-emerald))]"
                      : "bg-secondary text-muted-foreground"
                  }`}>{o.status}</span>
                </label>
              ))
            )}
          </div>
        </div>

        {field("Subtitle", "subtitle")}
        {field("Description", "description", "textarea")}
        {field("Instructor Display Name", "instructor_display_name")}
        {field("Thumbnail URL", "thumbnail_url")}

        {form.thumbnail_url && (
          <img src={form.thumbnail_url} alt="" className="w-48 h-28 object-cover rounded-lg border border-border" />
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {field("Duration (minutes)", "duration_minutes", "number")}
          <div>
            <label className="block text-sm font-medium mb-1.5">Status</label>
            <Select value={form.status} onValueChange={(v) => {
              if (form.status === "published" && v === "draft") {
                const confirmed = window.confirm(
                  "Changing status from Published to Draft will hide this course from students immediately. Are you sure?"
                );
                if (!confirmed) return;
              }
              setForm((f) => ({ ...f, status: v }));
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="archived">Archived</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4">
          <Button onClick={handleSave} disabled={saving} className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90">
            {saving ? "Saving…" : "Save Course"}
          </Button>
          {!isNew && (
            <>
              <Button variant="outline" onClick={() => navigate(`/admin/courses/${courseId}/curriculum`)}>
                Manage Curriculum
              </Button>
              <Button variant="outline" onClick={() => navigate(`/admin/courses/${courseId}/preview`)}>
                <Eye className="h-4 w-4 mr-2" />
                Student Preview
              </Button>
              <Button variant="outline" onClick={() => navigate(`/admin/courses/${courseId}/certificate`)}>
                <Award className="h-4 w-4 mr-2" />
                Certificate Template
              </Button>
              <Button variant="outline" onClick={() => navigate(`/admin/courses/${courseId}/reviews`)}>
                <Star className="h-4 w-4 mr-2" />
                Reviews
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ── Right: Live Preview ── */}
      <div className="hidden lg:block w-80 shrink-0">
        <div className="sticky top-6">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Browse Page Preview
          </p>
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="aspect-video bg-surface-2 relative">
              {form.thumbnail_url ? (
                <img src={form.thumbnail_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                  No thumbnail
                </div>
              )}
              <div className="absolute top-2 left-2">
                <TierBadge tier={form.product_tier} />
              </div>
            </div>
            <div className="p-4 space-y-1.5">
              <h3 className="text-lg font-semibold line-clamp-1">
                {form.title || "Course Title"}
              </h3>
              {form.instructor_display_name && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {form.instructor_display_name}
                </p>
              )}
              {form.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {form.description}
                </p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-border mt-2">
                {form.primary_offering_id && availableOfferings.find((o) => o.id === form.primary_offering_id) ? (
                  <span className="text-base font-semibold">
                    ₹{formatPrice(availableOfferings.find((o) => o.id === form.primary_offering_id)!.price_inr)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Price TBA</span>
                )}
                <span className="text-sm font-medium text-cream flex items-center gap-1">
                  Enroll <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 text-center">
            Live preview — updates as you type
          </p>
        </div>
      </div>
      </div>
    </AdminLayout>
  );
};

export default AdminCourseEditor;
