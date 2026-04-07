import { useEffect, useState } from "react";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Search, X, ExternalLink, Copy } from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface OfferingRow {
  id: string;
  title: string;
  slug: string;
  type: string;
  price_inr: number;
  mrp_inr: number | null;
  status: string;
  is_public: boolean | null;
  course_count: number;
  enrolment_count: number;
}

interface CourseOption {
  id: string;
  title: string;
}

interface UpsellRow {
  id: string;
  upsell_offering_id: string;
  headline: string;
  sort_order: number;
  upsell_title?: string;
}

const EMPTY_FORM = {
  title: "", description: "", type: "live_cohort", price_inr: 0, mrp_inr: "",
  thumbnail_url: "", status: "draft", gst_mode: "none", gst_rate: 0,
  slug: "", validity_days: "",
  subtitle: "",
  banner_url: "",
  instructor_name: "",
  instructor_title: "",
  instructor_avatar_url: "",
  highlights: "[]",
  is_public: false,
  meta_pixel_id: "",
  google_ads_conversion: "",
  custom_tracking_script: "",
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
  const [upsells, setUpsells] = useState<UpsellRow[]>([]);
  const [allOfferingsForUpsell, setAllOfferingsForUpsell] = useState<{ id: string; title: string; price_inr: number }[]>([]);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data: offs } = await supabase.from("offerings").select("id, title, slug, type, price_inr, mrp_inr, status, is_public").order("created_at", { ascending: false });
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
      is_public: o.is_public ?? false,
      course_count: courseCounts[o.id] || 0,
      enrolment_count: enrolCounts[o.id] || 0,
    })));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEditor = async (offId?: string) => {
    const [coursesRes, offsRes] = await Promise.all([
      supabase.from("courses").select("id, title").order("title"),
      supabase.from("offerings").select("id, title, price_inr").order("title"),
    ]);
    setAllCourses(coursesRes.data || []);
    setAllOfferingsForUpsell(offsRes.data || []);

    if (offId) {
      const [offeringRes, ocsRes, upsellsRes] = await Promise.all([
        supabase.from("offerings").select("*").eq("id", offId).single(),
        supabase.from("offering_courses").select("course_id").eq("offering_id", offId),
        supabase.from("offering_upsells").select("id, upsell_offering_id, headline, sort_order").eq("parent_offering_id", offId).order("sort_order"),
      ]);

      if (offeringRes.data) {
        const data = offeringRes.data;
        setForm({
          title: data.title, description: data.description || "", type: data.type,
          price_inr: data.price_inr, mrp_inr: data.mrp_inr?.toString() || "",
          thumbnail_url: data.thumbnail_url || "", status: data.status,
          gst_mode: data.gst_mode, gst_rate: data.gst_rate || 0,
          slug: data.slug, validity_days: data.validity_days?.toString() || "",
          subtitle: data.subtitle || "",
          banner_url: data.banner_url || "",
          instructor_name: data.instructor_name || "",
          instructor_title: data.instructor_title || "",
          instructor_avatar_url: data.instructor_avatar_url || "",
          highlights: data.highlights ? JSON.stringify(data.highlights) : "[]",
          is_public: data.is_public ?? false,
          meta_pixel_id: data.meta_pixel_id || "",
          google_ads_conversion: data.google_ads_conversion || "",
          custom_tracking_script: data.custom_tracking_script || "",
        });
      }
      setLinkedCourseIds((ocsRes.data || []).map((oc) => oc.course_id));

      // Enrich upsells with titles
      const upsellData = (upsellsRes.data || []).map((u) => {
        const off = (offsRes.data || []).find((o) => o.id === u.upsell_offering_id);
        return { ...u, upsell_title: off?.title || "Unknown" };
      });
      setUpsells(upsellData);
      setEditId(offId);
    } else {
      setForm(EMPTY_FORM);
      setLinkedCourseIds([]);
      setUpsells([]);
      setEditId(null);
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast({ title: "Title is required", variant: "destructive" }); return; }
    setSaving(true);

    const slug = form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    let parsedHighlights: any = [];
    try { parsedHighlights = form.highlights ? JSON.parse(form.highlights) : []; } catch { parsedHighlights = []; }

    const payload: any = {
      title: form.title, description: form.description || null, type: form.type,
      price_inr: form.price_inr, mrp_inr: form.mrp_inr ? Number(form.mrp_inr) : null,
      thumbnail_url: form.thumbnail_url || null, status: form.status,
      gst_mode: form.gst_mode, gst_rate: form.gst_rate || 0, slug,
      validity_days: form.validity_days ? Number(form.validity_days) : null,
      subtitle: form.subtitle || null,
      banner_url: form.banner_url || null,
      instructor_name: form.instructor_name || null,
      instructor_title: form.instructor_title || null,
      instructor_avatar_url: form.instructor_avatar_url || null,
      highlights: parsedHighlights,
      is_public: form.is_public,
      meta_pixel_id: form.meta_pixel_id || null,
      google_ads_conversion: form.google_ads_conversion || null,
      custom_tracking_script: form.custom_tracking_script || null,
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

      // Sync upsells
      await supabase.from("offering_upsells").delete().eq("parent_offering_id", offId);
      if (upsells.length > 0) {
        await supabase.from("offering_upsells").insert(
          upsells.map((u, i) => ({
            parent_offering_id: offId!,
            upsell_offering_id: u.upsell_offering_id,
            headline: u.headline || "Add this to your order",
            sort_order: i,
            is_active: true,
          }))
        );
      }
    }

    toast({ title: "Offering saved" });
    setEditOpen(false);
    setSaving(false);
    load();
  };

  const addUpsell = (upsellOfferingId: string) => {
    const off = allOfferingsForUpsell.find((o) => o.id === upsellOfferingId);
    if (!off) return;
    setUpsells((prev) => [...prev, {
      id: crypto.randomUUID(),
      upsell_offering_id: upsellOfferingId,
      headline: "Add this to your order",
      sort_order: prev.length,
      upsell_title: off.title,
    }]);
  };

  const removeUpsell = (id: string) => {
    setUpsells((prev) => prev.filter((u) => u.id !== id));
  };

  const updateUpsellHeadline = (index: number, headline: string) => {
    setUpsells((prev) => prev.map((u, i) => i === index ? { ...u, headline } : u));
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
                <td className="px-5 py-3">
                  <span className="font-medium">{o.title}</span>
                  {o.slug && (
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <a
                        href={`/p/${o.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[hsl(var(--cream))] hover:underline flex items-center gap-1"
                      >
                        /p/{o.slug} <ExternalLink className="h-3 w-3" />
                      </a>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(`https://app.leveluplearning.in/p/${o.slug}`);
                          sonnerToast("Link copied!");
                        }}
                        className="p-0.5 rounded hover:bg-secondary"
                        title="Copy public link"
                      >
                        <Copy className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </div>
                  )}
                </td>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Offering" : "New Offering"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} placeholder="auto-generated from title if empty" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
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
                <Label>Status</Label>
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
                <Label>Price (INR)</Label>
                <Input type="number" value={form.price_inr} onChange={(e) => setForm((f) => ({ ...f, price_inr: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>MRP (INR)</Label>
                <Input type="number" value={form.mrp_inr} onChange={(e) => setForm((f) => ({ ...f, mrp_inr: e.target.value }))} placeholder="Optional" />
              </div>
            </div>
            <div>
              <Label>Thumbnail URL</Label>
              <Input value={form.thumbnail_url} onChange={(e) => setForm((f) => ({ ...f, thumbnail_url: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>GST Mode</Label>
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
                <Label>GST Rate (%)</Label>
                <Input type="number" value={form.gst_rate} onChange={(e) => setForm((f) => ({ ...f, gst_rate: Number(e.target.value) }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Validity (days)</Label>
                <Input type="number" value={form.validity_days} onChange={(e) => setForm((f) => ({ ...f, validity_days: e.target.value }))} placeholder="Leave empty for lifetime" />
              </div>
            </div>

            {/* Course linking */}
            <div>
              <Label className="mb-2 block">Linked Courses</Label>
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

            {/* Public Offering Settings */}
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3">Public Offering Page</h4>
              <div className="flex items-center gap-3 mb-3">
                <Checkbox
                  id="is_public"
                  checked={form.is_public}
                  onCheckedChange={(checked) => setForm((f) => ({ ...f, is_public: !!checked }))}
                />
                <Label htmlFor="is_public">Make publicly accessible at /p/{form.slug || "slug"}</Label>
              </div>

              {form.is_public && (
                <div className="space-y-3">
                  <div>
                    <Label>Subtitle</Label>
                    <Input value={form.subtitle} onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))} placeholder="e.g., 12-week intensive filmmaking program" />
                  </div>
                  <div>
                    <Label>Banner Image URL</Label>
                    <Input value={form.banner_url} onChange={(e) => setForm((f) => ({ ...f, banner_url: e.target.value }))} placeholder="Hero image for the public page" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label>Instructor Name</Label>
                      <Input value={form.instructor_name} onChange={(e) => setForm((f) => ({ ...f, instructor_name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Instructor Title</Label>
                      <Input value={form.instructor_title} onChange={(e) => setForm((f) => ({ ...f, instructor_title: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Avatar URL</Label>
                      <Input value={form.instructor_avatar_url} onChange={(e) => setForm((f) => ({ ...f, instructor_avatar_url: e.target.value }))} />
                    </div>
                  </div>
                  <div>
                    <Label>Highlights (JSON array)</Label>
                    <Textarea
                      value={form.highlights}
                      onChange={(e) => setForm((f) => ({ ...f, highlights: e.target.value }))}
                      placeholder='["12 live sessions", "Certificate of completion", "Lifetime access"]'
                      rows={3}
                    />
                    <p className="text-xs text-muted-foreground mt-1">JSON array of feature bullet points shown on the public page</p>
                  </div>
                </div>
              )}
            </div>

            {/* Conversion Tracking */}
            <div className="border-t border-border pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-3">Conversion Tracking</h4>
              <div className="space-y-3">
                <div>
                  <Label>Meta Pixel ID</Label>
                  <Input
                    value={form.meta_pixel_id}
                    onChange={(e) => setForm((f) => ({ ...f, meta_pixel_id: e.target.value }))}
                    placeholder="e.g., 1234567890"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Facebook/Meta Pixel ID for tracking conversions</p>
                </div>
                <div>
                  <Label>Google Ads Conversion</Label>
                  <Input
                    value={form.google_ads_conversion}
                    onChange={(e) => setForm((f) => ({ ...f, google_ads_conversion: e.target.value }))}
                    placeholder="e.g., AW-123456789/AbCdEfGhIjKl"
                  />
                  <p className="text-xs text-muted-foreground mt-1">Format: AW-ID/LABEL</p>
                </div>
                <div>
                  <Label>Custom Tracking Script</Label>
                  <Textarea
                    value={form.custom_tracking_script}
                    onChange={(e) => setForm((f) => ({ ...f, custom_tracking_script: e.target.value }))}
                    placeholder="GTM or custom pixel code. Use {{value}}, {{currency}}, {{transaction_id}} as placeholders."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Runs on Thank You page. Placeholders: {"{{value}}"}, {"{{currency}}"}, {"{{transaction_id}}"}, {"{{order_id}}"}
                  </p>
                </div>
              </div>
            </div>

            {/* Post-Purchase Upsells */}
            {editId && (
              <div className="border-t border-border pt-4 mt-4">
                <h4 className="text-sm font-semibold mb-1">Post-Purchase Upsells</h4>
                <p className="text-xs text-muted-foreground mb-3">Shown on the Thank You page after purchasing this offering.</p>

                {upsells.map((u, i) => (
                  <div key={u.id} className="flex items-center gap-2 mb-2">
                    <span className="text-sm flex-1 truncate">{u.upsell_title}</span>
                    <Input
                      value={u.headline}
                      onChange={(e) => updateUpsellHeadline(i, e.target.value)}
                      placeholder="Headline"
                      className="w-48"
                    />
                    <button onClick={() => removeUpsell(u.id)} className="text-destructive text-xs hover:underline">Remove</button>
                  </div>
                ))}

                <Select onValueChange={addUpsell}>
                  <SelectTrigger className="mt-2"><SelectValue placeholder="Add an upsell offering..." /></SelectTrigger>
                  <SelectContent>
                    {allOfferingsForUpsell
                      .filter((o) => o.id !== editId && !upsells.find((u) => u.upsell_offering_id === o.id))
                      .map((o) => (
                        <SelectItem key={o.id} value={o.id}>{o.title} — ₹{o.price_inr}</SelectItem>
                      ))
                    }
                  </SelectContent>
                </Select>
              </div>
            )}

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
