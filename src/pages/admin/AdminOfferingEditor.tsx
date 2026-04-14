import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import AdminLayout from "@/components/layout/AdminLayout";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Save, Loader2, X } from "lucide-react";
import AdminBreadcrumbs from "@/components/admin/AdminBreadcrumbs";
import { useAuth } from "@/contexts/AuthContext";

/* ────────────────────────────────────────────────── */
/*  Types                                             */
/* ────────────────────────────────────────────────── */
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

interface OfferingForUpsell {
  id: string;
  title: string;
  price_inr: number;
}

/* ────────────────────────────────────────────────── */
/*  Default form state                                */
/* ────────────────────────────────────────────────── */
const EMPTY_FORM = {
  // Basic Info
  title: "",
  slug: "",
  description: "",
  type: "live_cohort",
  status: "draft",
  price_inr: 0,
  mrp_inr: "",
  thumbnail_url: "",
  gst_mode: "none",
  gst_rate: 0,
  validity_days: "",
  is_public: false,
  // Public Page
  subtitle: "",
  banner_url: "",
  instructor_name: "",
  instructor_title: "",
  instructor_avatar_url: "",
  highlights: "[]",
  // Thank You Page
  thankyou_thumbnail_url: "",
  thankyou_headline: "Payment Successful!",
  thankyou_body: "",
  thankyou_cta_label: "Go to Dashboard",
  thankyou_cta_url: "",
  thankyou_auto_redirect: true,
  thankyou_redirect_seconds: 10,
  // Tracking & Pixels
  meta_pixel_id: "",
  google_ads_conversion: "",
  custom_tracking_script: "",
  // Staged Payments (Live Cohort)
  payment_mode: "single",
  app_fee_inr: 0,
  confirmation_amount_inr: 0,
  confirmation_deadline_days: 2,
  balance_deadline_days: 15,
  confirmation_grace_hours: "",
  attendance_threshold_pct: 85,
  tally_form_url: "",
  calendly_url: "",
  whatsapp_group_link: "",
  thankyou_show_calendly: false,
  // Checkout Social Proof
  checkout_testimonials: "[]",
  checkout_bullets: "[]",
  checkout_guarantee_text: "",
  // Coupon Display
  show_coupon_on_page: false,
  page_coupon_code: "",
};

/* ────────────────────────────────────────────────── */
/*  Component                                         */
/* ────────────────────────────────────────────────── */
const AdminOfferingEditor = () => {
  const { offeringId } = useParams();
  const isNew = !offeringId || offeringId === "new";
  const navigate = useNavigate();
  const { toast } = useToast();
  const { profile } = useAuth();

  const [form, setForm] = useState(EMPTY_FORM);
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [allCourses, setAllCourses] = useState<CourseOption[]>([]);
  const [linkedCourseIds, setLinkedCourseIds] = useState<string[]>([]);
  const [upsells, setUpsells] = useState<UpsellRow[]>([]);
  const [bumps, setBumps] = useState<{id: string; bump_offering_id: string; headline: string; bump_price_override_inr: string; bump_title?: string}[]>([]);
  const [allOfferingsForUpsell, setAllOfferingsForUpsell] = useState<OfferingForUpsell[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  /* ── Helpers ── */
  const f = (key: keyof typeof EMPTY_FORM, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* ── Load data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [coursesRes, offsRes] = await Promise.all([
        supabase.from("courses").select("id, title").order("title"),
        supabase.from("offerings").select("id, title, price_inr").order("title"),
      ]);
      setAllCourses(coursesRes.data || []);
      setAllOfferingsForUpsell(offsRes.data || []);

      if (!isNew && offeringId) {
        const [offeringRes, ocsRes, upsellsRes, bumpsRes] = await Promise.all([
          supabase.from("offerings").select("*").eq("id", offeringId).single(),
          supabase.from("offering_courses").select("course_id").eq("offering_id", offeringId),
          supabase
            .from("offering_upsells")
            .select("id, upsell_offering_id, headline, sort_order")
            .eq("parent_offering_id", offeringId)
            .order("sort_order"),
          supabase.from("offering_bumps").select("id, bump_offering_id, headline, bump_price_override_inr, sort_order").eq("parent_offering_id", offeringId).order("sort_order"),
        ]);

        if (offeringRes.data) {
          const d = offeringRes.data as any;
          setForm({
            title: d.title || "",
            slug: d.slug || "",
            description: d.description || "",
            type: d.type || "live_cohort",
            status: d.status || "draft",
            price_inr: d.price_inr ?? 0,
            mrp_inr: d.mrp_inr?.toString() || "",
            thumbnail_url: d.thumbnail_url || "",
            gst_mode: d.gst_mode || "none",
            gst_rate: d.gst_rate ?? 0,
            validity_days: d.validity_days?.toString() || "",
            is_public: d.is_public ?? false,
            subtitle: d.subtitle || "",
            banner_url: d.banner_url || "",
            instructor_name: d.instructor_name || "",
            instructor_title: d.instructor_title || "",
            instructor_avatar_url: d.instructor_avatar_url || "",
            highlights: d.highlights ? JSON.stringify(d.highlights) : "[]",
            thankyou_thumbnail_url: d.thankyou_thumbnail_url || "",
            thankyou_headline: d.thankyou_headline || "Payment Successful!",
            thankyou_body: d.thankyou_body || "",
            thankyou_cta_label: d.thankyou_cta_label || "Go to Dashboard",
            thankyou_cta_url: d.thankyou_cta_url || "",
            thankyou_auto_redirect: d.thankyou_auto_redirect ?? true,
            thankyou_redirect_seconds: d.thankyou_redirect_seconds ?? 10,
            meta_pixel_id: d.meta_pixel_id || "",
            google_ads_conversion: d.google_ads_conversion || "",
            custom_tracking_script: d.custom_tracking_script || "",
            payment_mode: d.payment_mode || "single",
            app_fee_inr: d.app_fee_inr ?? 0,
            confirmation_amount_inr: d.confirmation_amount_inr ?? 0,
            confirmation_deadline_days: d.confirmation_deadline_days ?? 2,
            balance_deadline_days: d.balance_deadline_days ?? 15,
            confirmation_grace_hours: d.confirmation_grace_hours?.toString() || "",
            attendance_threshold_pct: d.attendance_threshold_pct ?? 85,
            tally_form_url: d.tally_form_url || "",
            calendly_url: d.calendly_url || "",
            whatsapp_group_link: d.whatsapp_group_link || "",
            thankyou_show_calendly: d.thankyou_show_calendly ?? false,
            checkout_testimonials: d.checkout_testimonials ? JSON.stringify(d.checkout_testimonials) : "[]",
            checkout_bullets: d.checkout_bullets ? JSON.stringify(d.checkout_bullets) : "[]",
            checkout_guarantee_text: d.checkout_guarantee_text || "",
            show_coupon_on_page: d.show_coupon_on_page ?? false,
            page_coupon_code: d.page_coupon_code || "",
          });
        }

        if (offeringRes.data && (offeringRes.data as any).slug) {
          setSlugManuallyEdited(true);
        }
        setLinkedCourseIds((ocsRes.data || []).map((oc) => oc.course_id));

        const upsellData = (upsellsRes.data || []).map((u) => {
          const off = (offsRes.data || []).find((o) => o.id === u.upsell_offering_id);
          return { ...u, upsell_title: off?.title || "Unknown" };
        });
        setUpsells(upsellData);

        const bumpData = (bumpsRes.data || []).map((b: any) => {
          const off = (offsRes.data || []).find((o: any) => o.id === b.bump_offering_id);
          return { ...b, bump_price_override_inr: b.bump_price_override_inr?.toString() || "", bump_title: off?.title || "Unknown" };
        });
        setBumps(bumpData);
      }
      setLoading(false);
    })();
  }, [offeringId, isNew]);

  /* ── Save ── */
  const handleSave = async () => {
    if (!form.title.trim()) {
      toast({ title: "Title is required", variant: "destructive" });
      return;
    }

    // Validate highlights JSON
    if (form.highlights) {
      try {
        JSON.parse(form.highlights);
      } catch {
        toast({ title: "Highlights must be valid JSON array", variant: "destructive" });
        return;
      }
    }

    // Validate redirect seconds
    const redirectSec = Number(form.thankyou_redirect_seconds);
    if (isNaN(redirectSec) || redirectSec < 0 || redirectSec > 120) {
      toast({ title: "Redirect seconds must be between 0 and 120", variant: "destructive" });
      return;
    }

    // Fix 23: Prevent publishing with no linked courses
    if (form.status === "active" && linkedCourseIds.length === 0) {
      toast({ title: "Cannot publish offering", description: "At least one course must be linked before setting status to Active.", variant: "destructive" });
      return;
    }

    // Fix 24: Field validations
    if (form.mrp_inr && Number(form.mrp_inr) < form.price_inr) {
      toast({ title: "MRP must be >= Price", description: "MRP (strikethrough price) cannot be less than the selling price.", variant: "destructive" });
      return;
    }

    if (form.gst_rate && (form.gst_rate < 0 || form.gst_rate > 100)) {
      toast({ title: "Invalid GST rate", description: "GST rate must be between 0 and 100.", variant: "destructive" });
      return;
    }

    const urlPattern = /^https?:\/\//;
    if (form.thumbnail_url && !urlPattern.test(form.thumbnail_url)) {
      toast({ title: "Invalid Thumbnail URL", description: "Thumbnail URL must start with http:// or https://.", variant: "destructive" });
      return;
    }

    if (form.banner_url && !urlPattern.test(form.banner_url)) {
      toast({ title: "Invalid Banner URL", description: "Banner URL must start with http:// or https://.", variant: "destructive" });
      return;
    }

    setSaving(true);

    const slug =
      form.slug.trim() ||
      form.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");

    // Fix 27: Check slug uniqueness
    let slugQuery = supabase.from("offerings").select("id").eq("slug", slug);
    if (!isNew && offeringId) {
      slugQuery = slugQuery.neq("id", offeringId);
    }
    const { data: slugConflicts } = await slugQuery;
    if (slugConflicts && slugConflicts.length > 0) {
      toast({ title: "Slug already exists", description: `Another offering is already using the slug "${slug}". Please choose a different slug.`, variant: "destructive" });
      setSaving(false);
      return;
    }

    let parsedHighlights: any = [];
    try {
      parsedHighlights = form.highlights ? JSON.parse(form.highlights) : [];
    } catch {
      parsedHighlights = [];
    }

    const payload: any = {
      title: form.title,
      slug,
      description: form.description || null,
      type: form.type,
      status: form.status,
      price_inr: form.price_inr,
      mrp_inr: form.mrp_inr ? Number(form.mrp_inr) : null,
      thumbnail_url: form.thumbnail_url || null,
      gst_mode: form.gst_mode,
      gst_rate: form.gst_rate || 0,
      validity_days: form.validity_days ? Number(form.validity_days) : null,
      is_public: form.is_public,
      // Public page
      subtitle: form.subtitle || null,
      banner_url: form.banner_url || null,
      instructor_name: form.instructor_name || null,
      instructor_title: form.instructor_title || null,
      instructor_avatar_url: form.instructor_avatar_url || null,
      highlights: parsedHighlights,
      // Thank you page
      thankyou_thumbnail_url: form.thankyou_thumbnail_url || null,
      thankyou_headline: form.thankyou_headline || "Payment Successful!",
      thankyou_body: form.thankyou_body || null,
      thankyou_cta_label: form.thankyou_cta_label || "Go to Dashboard",
      thankyou_cta_url: form.thankyou_cta_url || null,
      thankyou_auto_redirect: form.thankyou_auto_redirect,
      thankyou_redirect_seconds: redirectSec,
      // Tracking
      meta_pixel_id: form.meta_pixel_id || null,
      google_ads_conversion: form.google_ads_conversion || null,
      custom_tracking_script: form.custom_tracking_script || null,
      // Staged payments
      payment_mode: form.payment_mode || "single",
      app_fee_inr: form.payment_mode === "staged" ? Number(form.app_fee_inr) || 0 : 0,
      confirmation_amount_inr: form.payment_mode === "staged" ? Number(form.confirmation_amount_inr) || 0 : 0,
      confirmation_deadline_days: form.payment_mode === "staged" ? Number(form.confirmation_deadline_days) || 2 : 2,
      balance_deadline_days: form.payment_mode === "staged" ? Number(form.balance_deadline_days) || 15 : 15,
      confirmation_grace_hours: form.confirmation_grace_hours ? Number(form.confirmation_grace_hours) : null,
      attendance_threshold_pct: Number(form.attendance_threshold_pct) || 85,
      tally_form_url: form.tally_form_url || null,
      calendly_url: form.calendly_url || null,
      whatsapp_group_link: form.whatsapp_group_link || null,
      thankyou_show_calendly: form.thankyou_show_calendly,
      // Checkout social proof
      checkout_testimonials: (() => { try { return JSON.parse(form.checkout_testimonials); } catch { return []; } })(),
      checkout_bullets: (() => { try { return JSON.parse(form.checkout_bullets); } catch { return []; } })(),
      checkout_guarantee_text: form.checkout_guarantee_text || null,
      show_coupon_on_page: form.show_coupon_on_page,
      page_coupon_code: form.page_coupon_code || null,
    };

    let offId = isNew ? null : offeringId!;

    if (!isNew && offeringId) {
      const { error } = await supabase.from("offerings").update(payload).eq("id", offeringId);
      if (error) {
        toast({ title: "Error saving", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
    } else {
      const { data, error } = await supabase.from("offerings").insert(payload).select("id").single();
      if (error) {
        toast({ title: "Error creating", description: error.message, variant: "destructive" });
        setSaving(false);
        return;
      }
      offId = data.id;
    }

    // Sync offering_courses
    if (offId) {
      await supabase.from("offering_courses").delete().eq("offering_id", offId);
      if (linkedCourseIds.length > 0) {
        await supabase.from("offering_courses").insert(
          linkedCourseIds.map((cid) => ({ offering_id: offId!, course_id: cid }))
        );

        // Auto-set primary_offering_id on courses that don't have one
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

      // Sync bumps
      await supabase.from("offering_bumps").delete().eq("parent_offering_id", offId);
      if (bumps.length > 0) {
        await supabase.from("offering_bumps").insert(
          bumps.map((b, i) => ({
            parent_offering_id: offId!,
            bump_offering_id: b.bump_offering_id,
            headline: b.headline || "",
            bump_price_override_inr: b.bump_price_override_inr ? Number(b.bump_price_override_inr) : null,
            sort_order: i,
          }))
        );
      }
    }

    // Audit log
    if (profile?.id && offId) {
      await (supabase as any).from("admin_audit_logs").insert({
        admin_user_id: profile.id,
        action: isNew ? "create" : "update",
        entity_type: "offering",
        entity_id: offId,
        details: { title: form.title, status: form.status, price_inr: form.price_inr },
      });
    }

    toast({ title: "Offering saved" });
    setSaving(false);

    // If this was a new offering, redirect to edit mode so the URL is correct
    if (isNew && offId) {
      navigate(`/admin/offerings/${offId}/edit`, { replace: true });
    }
  };

  /* ── Upsell helpers ── */
  const addUpsell = (upsellOfferingId: string) => {
    const off = allOfferingsForUpsell.find((o) => o.id === upsellOfferingId);
    if (!off) return;
    setUpsells((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        upsell_offering_id: upsellOfferingId,
        headline: "Add this to your order",
        sort_order: prev.length,
        upsell_title: off.title,
      },
    ]);
  };

  const removeUpsell = (id: string) => {
    setUpsells((prev) => prev.filter((u) => u.id !== id));
  };

  const updateUpsellHeadline = (index: number, headline: string) => {
    setUpsells((prev) => prev.map((u, i) => (i === index ? { ...u, headline } : u)));
  };

  /* ── Bump helpers ── */
  const addBump = (bumpOfferingId: string) => {
    const off = allOfferingsForUpsell.find((o) => o.id === bumpOfferingId);
    if (!off) return;
    setBumps((prev) => [...prev, { id: crypto.randomUUID(), bump_offering_id: bumpOfferingId, headline: `Add ${off.title}`, bump_price_override_inr: "", bump_title: off.title }]);
  };
  const removeBump = (id: string) => setBumps((prev) => prev.filter((b) => b.id !== id));
  const updateBump = (index: number, field: string, value: string) => setBumps((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)));

  /* ── Loading state ── */
  if (loading) {
    return (
      <AdminLayout title="Offering Editor">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title={isNew ? "New Offering" : "Edit Offering"}>
      <AdminBreadcrumbs items={[
        { label: "Offerings", to: "/admin/offerings" },
        { label: isNew ? "New Offering" : (form.title || "Edit") },
      ]} />
      {/* Top bar */}
      <div className="flex items-center justify-end gap-4 mb-6">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Saving…" : "Save Offering"}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="w-full justify-start bg-secondary/50 mb-6">
          <TabsTrigger value="basic">Basic Info</TabsTrigger>
          <TabsTrigger value="public">Public Page</TabsTrigger>
          <TabsTrigger value="thankyou">Thank You Page</TabsTrigger>
          <TabsTrigger value="tracking">Tracking & Pixels</TabsTrigger>
          <TabsTrigger value="checkout">Checkout</TabsTrigger>
          <TabsTrigger value="cohort">Live Cohort</TabsTrigger>
          <TabsTrigger value="upsells">Upsells</TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 1: BASIC INFO                         */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="basic">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <div>
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => {
                const newTitle = e.target.value;
                f("title", newTitle);
                // Auto-generate slug from title when slug hasn't been manually edited
                if (!slugManuallyEdited) {
                  const autoSlug = newTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
                  f("slug", autoSlug);
                }
              }} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                value={form.slug}
                onChange={(e) => {
                  f("slug", e.target.value);
                  setSlugManuallyEdited(true);
                }}
                placeholder="auto-generated from title if empty"
              />
              {form.slug && (
                <p className="text-xs text-muted-foreground mt-1">
                  Public URL: /p/{form.slug}
                </p>
              )}
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={(e) => f("description", e.target.value)} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => f("type", v)}>
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
                <Select value={form.status} onValueChange={(v) => f("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Price (INR)</Label>
                <Input
                  type="number"
                  value={form.price_inr}
                  onChange={(e) => f("price_inr", Number(e.target.value))}
                />
              </div>
              <div>
                <Label>MRP (INR)</Label>
                <Input
                  type="number"
                  value={form.mrp_inr}
                  onChange={(e) => f("mrp_inr", e.target.value)}
                  placeholder="Optional (for strikethrough)"
                />
              </div>
            </div>
            <div>
              <Label>Thumbnail URL</Label>
              <Input value={form.thumbnail_url} onChange={(e) => f("thumbnail_url", e.target.value)} />
              {form.thumbnail_url && (
                <img
                  src={form.thumbnail_url}
                  alt="Thumbnail preview"
                  className="mt-2 h-24 w-auto rounded-lg object-cover border border-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>GST Mode</Label>
                <Select value={form.gst_mode} onValueChange={(v) => f("gst_mode", v)}>
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
                <Input
                  type="number"
                  value={form.gst_rate}
                  onChange={(e) => f("gst_rate", Number(e.target.value))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Validity (days)</Label>
                <Input
                  type="number"
                  value={form.validity_days}
                  onChange={(e) => f("validity_days", e.target.value)}
                  placeholder="Leave empty for lifetime"
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={form.is_public}
                  onCheckedChange={(checked) => f("is_public", checked)}
                />
                <Label>Public (visible at /p/{form.slug || "slug"})</Label>
              </div>
            </div>

            {/* Linked courses */}
            <div>
              <Label className="mb-2 block">Linked Courses</Label>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                {allCourses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No courses found. Create courses first.</p>
                ) : (
                  allCourses.map((c) => (
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
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 2: PUBLIC PAGE                        */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="public">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              These fields control the public offering page at{" "}
              <span className="text-[hsl(var(--cream))] font-medium">/p/{form.slug || "slug"}</span>
            </p>
            <div>
              <Label>Subtitle</Label>
              <Input
                value={form.subtitle}
                onChange={(e) => f("subtitle", e.target.value)}
                placeholder="e.g., 12-week intensive filmmaking program"
              />
            </div>
            <div>
              <Label>Banner Image URL</Label>
              <Input
                value={form.banner_url}
                onChange={(e) => f("banner_url", e.target.value)}
                placeholder="Hero image for the public page"
              />
              {form.banner_url && (
                <img
                  src={form.banner_url}
                  alt="Banner preview"
                  className="mt-2 h-32 w-full rounded-lg object-cover border border-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Instructor Name</Label>
                <Input value={form.instructor_name} onChange={(e) => f("instructor_name", e.target.value)} />
              </div>
              <div>
                <Label>Instructor Title</Label>
                <Input
                  value={form.instructor_title}
                  onChange={(e) => f("instructor_title", e.target.value)}
                  placeholder="e.g., Filmmaker"
                />
              </div>
              <div>
                <Label>Avatar URL</Label>
                <Input value={form.instructor_avatar_url} onChange={(e) => f("instructor_avatar_url", e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Highlights (JSON array)</Label>
              <Textarea
                value={form.highlights}
                onChange={(e) => f("highlights", e.target.value)}
                placeholder='["12 live sessions", "Certificate of completion", "Lifetime access"]'
                rows={4}
              />
              <p className="text-xs text-muted-foreground mt-1">
                JSON array of feature bullet points shown on the public page
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 3: THANK YOU PAGE                     */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="thankyou">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              Customize what buyers see after a successful payment. Leave fields empty to use defaults.
            </p>
            <div>
              <Label>Thank You Banner / Thumbnail URL</Label>
              <Input
                value={form.thankyou_thumbnail_url}
                onChange={(e) => f("thankyou_thumbnail_url", e.target.value)}
                placeholder="Hero image shown on the thank you page"
              />
              {form.thankyou_thumbnail_url && (
                <img
                  src={form.thankyou_thumbnail_url}
                  alt="Thank you banner preview"
                  className="mt-2 h-32 w-full rounded-lg object-cover border border-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>
            <div>
              <Label>Headline</Label>
              <Input
                value={form.thankyou_headline}
                onChange={(e) => f("thankyou_headline", e.target.value)}
                placeholder="Payment Successful!"
              />
            </div>
            <div>
              <Label>Body Text</Label>
              <Textarea
                value={form.thankyou_body}
                onChange={(e) => f("thankyou_body", e.target.value)}
                placeholder="Custom message shown below the headline (e.g., instructions, welcome note, WhatsApp group link info)"
                rows={4}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>CTA Button Label</Label>
                <Input
                  value={form.thankyou_cta_label}
                  onChange={(e) => f("thankyou_cta_label", e.target.value)}
                  placeholder="Go to Dashboard"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Text shown on the main button (e.g., "Join WhatsApp Group", "Go to Dashboard")
                </p>
              </div>
              <div>
                <Label>CTA Button URL</Label>
                <Input
                  value={form.thankyou_cta_url}
                  onChange={(e) => f("thankyou_cta_url", e.target.value)}
                  placeholder="Leave empty for dashboard"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Where the button goes. Leave empty to go to the student dashboard. Can be a full URL (e.g., WhatsApp group link).
                </p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.thankyou_auto_redirect}
                  onCheckedChange={(checked) => f("thankyou_auto_redirect", checked)}
                />
                <div>
                  <Label>Auto-redirect after countdown</Label>
                  <p className="text-xs text-muted-foreground">Automatically redirect logged-in users after the timer</p>
                </div>
              </div>
              <div>
                <Label>Countdown seconds</Label>
                <Input
                  type="number"
                  min={0}
                  max={120}
                  value={form.thankyou_redirect_seconds}
                  onChange={(e) => f("thankyou_redirect_seconds", Number(e.target.value))}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  How many seconds before auto-redirect (0–120). Set to 0 to disable.
                </p>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 4: TRACKING & PIXELS                  */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="tracking">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              Conversion tracking pixels that fire on the Thank You page after purchase.
            </p>
            <div>
              <Label>Meta Pixel ID</Label>
              <Input
                value={form.meta_pixel_id}
                onChange={(e) => f("meta_pixel_id", e.target.value)}
                placeholder="e.g., 1234567890"
              />
              <p className="text-xs text-muted-foreground mt-1">Facebook/Meta Pixel ID for tracking conversions</p>
            </div>
            <div>
              <Label>Google Ads Conversion</Label>
              <Input
                value={form.google_ads_conversion}
                onChange={(e) => f("google_ads_conversion", e.target.value)}
                placeholder="e.g., AW-123456789/AbCdEfGhIjKl"
              />
              <p className="text-xs text-muted-foreground mt-1">Format: AW-ID/LABEL</p>
            </div>
            <div>
              <Label>Custom Tracking Script</Label>
              <Textarea
                value={form.custom_tracking_script}
                onChange={(e) => f("custom_tracking_script", e.target.value)}
                placeholder="GTM or custom pixel code. Use {{value}}, {{currency}}, {{transaction_id}} as placeholders."
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Runs on Thank You page. Placeholders: {"{{value}}"}, {"{{currency}}"}, {"{{transaction_id}}"}, {"{{order_id}}"}
              </p>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 5: CHECKOUT                             */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="checkout">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              Customize the checkout experience — social proof, guarantees, coupons, and order bumps.
            </p>

            {/* Checkout Testimonials */}
            <div>
              <Label>Checkout Testimonials (JSON)</Label>
              <Textarea
                value={form.checkout_testimonials}
                onChange={(e) => f("checkout_testimonials", e.target.value)}
                placeholder='[{"name":"John","title":"Student","photo_url":"","quote":"Great course!"}]'
                rows={5}
              />
              <p className="text-xs text-muted-foreground mt-1">
                JSON array of {`{name, title, photo_url, quote}`} objects shown on checkout
              </p>
            </div>

            {/* Value Proposition Bullets */}
            <div>
              <Label>Value Proposition Bullets (JSON)</Label>
              <Textarea
                value={form.checkout_bullets}
                onChange={(e) => f("checkout_bullets", e.target.value)}
                placeholder='["Lifetime access","Certificate included","Money-back guarantee"]'
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                JSON array of strings displayed as bullet points on the checkout page
              </p>
            </div>

            {/* Guarantee Badge */}
            <div>
              <Label>Guarantee Badge Text</Label>
              <Input
                value={form.checkout_guarantee_text}
                onChange={(e) => f("checkout_guarantee_text", e.target.value)}
                placeholder="e.g., 7-day money-back guarantee"
              />
            </div>

            {/* Coupon Display */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.show_coupon_on_page}
                  onCheckedChange={(checked) => f("show_coupon_on_page", checked)}
                />
                <Label>Show coupon on public page</Label>
              </div>
              {form.show_coupon_on_page && (
                <div>
                  <Label>Page Coupon Code</Label>
                  <Input
                    value={form.page_coupon_code}
                    onChange={(e) => f("page_coupon_code", e.target.value)}
                    placeholder="e.g., EARLYBIRD"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    This coupon code will be displayed on the public offering page
                  </p>
                </div>
              )}
            </div>

            {/* Order Bumps */}
            <div>
              <Label className="mb-2 block">Order Bumps</Label>
              <p className="text-xs text-muted-foreground mb-3">
                Add-on offerings shown on the checkout page before payment. Different from upsells (which are post-purchase).
              </p>
              {isNew ? (
                <p className="text-sm text-muted-foreground py-4 text-center border border-dashed border-border rounded-lg">
                  Save the offering first, then you can add order bumps.
                </p>
              ) : (
                <>
                  {bumps.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                      No order bumps added yet
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {bumps.map((b, i) => (
                        <div key={b.id} className="flex items-center gap-3 bg-secondary/30 rounded-lg p-3">
                          <span className="text-sm font-medium flex-shrink-0 truncate max-w-[160px]">{b.bump_title}</span>
                          <Input
                            value={b.headline}
                            onChange={(e) => updateBump(i, "headline", e.target.value)}
                            placeholder="Headline"
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            value={b.bump_price_override_inr}
                            onChange={(e) => updateBump(i, "bump_price_override_inr", e.target.value)}
                            placeholder="Price override (INR)"
                            className="w-36"
                          />
                          <button
                            onClick={() => removeBump(b.id)}
                            className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                            title="Remove bump"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <SearchableSelect
                      options={allOfferingsForUpsell
                        .filter(
                          (o) =>
                            o.id !== offeringId &&
                            !bumps.find((b) => b.bump_offering_id === o.id)
                        )
                        .map((o) => ({ value: o.id, label: `${o.title} — ₹${o.price_inr}` }))}
                      value=""
                      onValueChange={addBump}
                      placeholder="Add an order bump offering…"
                      searchPlaceholder="Search offerings…"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 6: LIVE COHORT                        */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="cohort">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              Settings for live cohort offerings — staged payments, external integrations, and completion criteria.
            </p>

            {/* Payment Mode */}
            <div>
              <Label>Payment Mode</Label>
              <Select value={form.payment_mode} onValueChange={(v) => f("payment_mode", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">Single Payment</SelectItem>
                  <SelectItem value="staged">Staged Payments</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Staged payments split the total into application fee, confirmation amount, and balance.
              </p>
            </div>

            {/* Staged Payment Amounts */}
            {form.payment_mode === "staged" && (
              <div className="space-y-4 border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium">Staged Payment Amounts</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Application Fee (INR)</Label>
                    <Input
                      type="number"
                      value={form.app_fee_inr}
                      onChange={(e) => f("app_fee_inr", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Confirmation Amount (INR)</Label>
                    <Input
                      type="number"
                      value={form.confirmation_amount_inr}
                      onChange={(e) => f("confirmation_amount_inr", Number(e.target.value))}
                    />
                  </div>
                  <div>
                    <Label>Balance (calculated)</Label>
                    <Input
                      type="number"
                      value={Math.max(Number(form.price_inr) - Number(form.app_fee_inr) - Number(form.confirmation_amount_inr), 0)}
                      disabled
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Total price minus app fee and confirmation
                    </p>
                  </div>
                </div>

                {/* Deadlines */}
                <h4 className="text-sm font-medium mt-4">Deadlines</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Confirmation Deadline (days)</Label>
                    <Input
                      type="number"
                      value={form.confirmation_deadline_days}
                      onChange={(e) => f("confirmation_deadline_days", Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Days after application to pay confirmation</p>
                  </div>
                  <div>
                    <Label>Balance Deadline (days)</Label>
                    <Input
                      type="number"
                      value={form.balance_deadline_days}
                      onChange={(e) => f("balance_deadline_days", Number(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Days after confirmation to pay balance</p>
                  </div>
                  <div>
                    <Label>Confirmation Grace (hours)</Label>
                    <Input
                      type="number"
                      value={form.confirmation_grace_hours}
                      onChange={(e) => f("confirmation_grace_hours", e.target.value)}
                      placeholder="Optional"
                    />
                    <p className="text-xs text-muted-foreground mt-1">Extra hours before auto-cancellation</p>
                  </div>
                </div>
              </div>
            )}

            {/* External Integrations */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">External Integrations</h4>
              <div>
                <Label>Tally Form URL</Label>
                <Input
                  value={form.tally_form_url}
                  onChange={(e) => f("tally_form_url", e.target.value)}
                  placeholder="https://tally.so/r/..."
                />
              </div>
              <div>
                <Label>Calendly URL</Label>
                <Input
                  value={form.calendly_url}
                  onChange={(e) => f("calendly_url", e.target.value)}
                  placeholder="https://calendly.com/..."
                />
              </div>
              <div>
                <Label>WhatsApp Group Link</Label>
                <Input
                  value={form.whatsapp_group_link}
                  onChange={(e) => f("whatsapp_group_link", e.target.value)}
                  placeholder="https://chat.whatsapp.com/..."
                />
              </div>
            </div>

            {/* Completion Settings */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Completion Settings</h4>
              <div>
                <Label>Attendance Threshold (%)</Label>
                <Input
                  type="number"
                  value={form.attendance_threshold_pct}
                  onChange={(e) => f("attendance_threshold_pct", Number(e.target.value))}
                  min={0}
                  max={100}
                />
                <p className="text-xs text-muted-foreground mt-1">Minimum attendance percentage for completion certificate</p>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.thankyou_show_calendly}
                  onCheckedChange={(checked) => f("thankyou_show_calendly", checked)}
                />
                <div>
                  <Label>Show Calendly on Thank You page</Label>
                  <p className="text-xs text-muted-foreground">Embed Calendly scheduling widget on the thank-you page after purchase</p>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════ */}
        {/*  TAB 7: UPSELLS                            */}
        {/* ══════════════════════════════════════════ */}
        <TabsContent value="upsells">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            {isNew ? (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Save the offering first, then you can add post-purchase upsells.
              </p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  These offerings are shown on the Thank You page after someone purchases this offering.
                </p>

                {upsells.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-lg">
                    No upsells added yet
                  </p>
                ) : (
                  <div className="space-y-3">
                    {upsells.map((u, i) => (
                      <div key={u.id} className="flex items-center gap-3 bg-secondary/30 rounded-lg p-3">
                        <span className="text-sm font-medium flex-1 truncate">{u.upsell_title}</span>
                        <Input
                          value={u.headline}
                          onChange={(e) => updateUpsellHeadline(i, e.target.value)}
                          placeholder="Headline"
                          className="w-56"
                        />
                        <button
                          onClick={() => removeUpsell(u.id)}
                          className="p-1.5 rounded hover:bg-destructive/10 text-destructive"
                          title="Remove upsell"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <SearchableSelect
                  options={allOfferingsForUpsell
                    .filter(
                      (o) =>
                        o.id !== offeringId &&
                        !upsells.find((u) => u.upsell_offering_id === o.id)
                    )
                    .map((o) => ({ value: o.id, label: `${o.title} — ₹${o.price_inr}` }))}
                  value=""
                  onValueChange={addUpsell}
                  placeholder="Add an upsell offering…"
                  searchPlaceholder="Search offerings…"
                />
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </AdminLayout>
  );
};

export default AdminOfferingEditor;
