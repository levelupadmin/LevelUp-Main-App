import { OfferingPreview } from "@/components/admin/offering-editor/OfferingPreview";
import { refreshStorefront } from "@/lib/storefrontCache";
import { CheckoutPageTab, type Question } from "@/components/admin/offering-editor/CheckoutPageTab";
import { EMPTY_EXPLORE, ExploreFields, loadExplore, saveExplore, type ExploreState } from "@/components/admin/offering-editor/ExploreFields";
import { pageReadiness } from "@/lib/catalogue";
import { ACCESS, ACCESS_ORDER, FORMAT, OFFERING_STATUS } from "@/lib/catalogue";
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
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
import PublicPageFields from "@/components/admin/offering-editor/PublicPageFields";
import ThankYouFields from "@/components/admin/offering-editor/ThankYouFields";
import TrackingFields from "@/components/admin/offering-editor/TrackingFields";
import StudentsTab from "@/components/admin/offering-editor/StudentsTab";
import AccessTab from "@/components/admin/offering-editor/AccessTab";

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
  type: "onetime",
  status: "draft",
  price_inr: 0,
  mrp_inr: "",
  thumbnail_url: "",
  gst_mode: "none",
  gst_rate: 0,
  validity_days: "",
  is_public: false,
  // How people get it (offerings.access) and its format (product_tier)
  access: "buy",
  product_tier: "masterclass",
  // Public Page
  subtitle: "",
  banner_url: "",
  instructor_name: "",
  instructor_title: "",
  instructor_avatar_url: "",
  highlights: "[]",
  // Thank You Page
  thankyou_thumbnail_url: "",
  thankyou_headline: "",
  thankyou_body: "",
  thankyou_cta_label: "",
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
  checkout_cover_url: "",
  checkout_when: "",
  refund_policy_days: "",
  checkout_guarantee_text: "",
  // Coupon Display
  show_coupon_on_page: false,
  page_coupon_code: "",
};

/* ────────────────────────────────────────────────── */
/*  Component                                         */
/* ────────────────────────────────────────────────── */
type Section = "basics" | "checkout" | "after" | "explore" | "tracking" | "applications" | "students";

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
  /** "Show on Explore" (this offering's row in pages). */
  const [explore, setExplore] = useState<ExploreState>(EMPTY_EXPLORE);
  /** Parts that failed to load. Saving must never treat "couldn't read" as
   *  "empty": that would unlink every course (students lose access), wipe the
   *  add-ons or delete the checkout questions. */
  const [loadFailed, setLoadFailed] = useState<Set<"offering" | "courses" | "bumps" | "upsells" | "questions">>(new Set());
  /** Which editor section is open; the preview follows it. */
  const [section, setSection] = useState<Section>("basics");
  /** Questions asked on the checkout (custom_field_definitions). */
  const [questions, setQuestions] = useState<Question[]>([]);
  const [bumpChoices, setBumpChoices] = useState<{ id: string; title: string; price_inr: number | string | null; status: string; access: string }[]>([]);

  /* ── Helpers ── */
  const f = (key: keyof typeof EMPTY_FORM, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* ── Load data ── */
  useEffect(() => {
    (async () => {
      setLoading(true);
      const [coursesRes, offsRes] = await Promise.all([
        supabase.from("courses").select("id, title").order("title"),
        supabase.from("offerings").select("id, title, price_inr, status, access").order("title"),
      ]);
      setAllCourses(coursesRes.data || []);
      setAllOfferingsForUpsell(offsRes.data || []);
      setBumpChoices((offsRes.data || []) as typeof bumpChoices);
      if (!isNew && offeringId) {
        const [ex, qs] = await Promise.all([
          loadExplore(offeringId),
          supabase.from("custom_field_definitions").select("id, label, is_required, sort_order").eq("offering_id", offeringId).order("sort_order"),
        ]);
        setExplore(ex);
        if (qs.error) setLoadFailed((prev) => new Set(prev).add("questions"));
        setQuestions((qs.data ?? []).map((q) => ({ id: q.id, label: q.label, is_required: !!q.is_required })));
      }

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

        const failed = new Set<"offering" | "courses" | "bumps" | "upsells" | "questions">();
        if (offeringRes.error || !offeringRes.data) failed.add("offering");
        if (ocsRes.error) failed.add("courses");
        if (bumpsRes.error) failed.add("bumps");
        if (upsellsRes.error) failed.add("upsells");
        if (failed.size) setLoadFailed((prev) => new Set([...prev, ...failed]));

        if (offeringRes.data) {
          const d = offeringRes.data as any;
          setForm({
            title: d.title || "",
            slug: d.slug || "",
            description: d.description || "",
            type: d.type || "onetime",
            status: d.status || "draft",
            price_inr: d.price_inr ?? 0,
            mrp_inr: d.mrp_inr?.toString() || "",
            thumbnail_url: d.thumbnail_url || "",
            gst_mode: d.gst_mode || "none",
            gst_rate: d.gst_rate ?? 0,
            validity_days: d.validity_days?.toString() || "",
            is_public: d.is_public ?? false,
            access: d.access || "buy",
            product_tier: d.product_tier || "other",
            subtitle: d.subtitle || "",
            banner_url: d.banner_url || "",
            instructor_name: d.instructor_name || "",
            instructor_title: d.instructor_title || "",
            instructor_avatar_url: d.instructor_avatar_url || "",
            highlights: d.highlights ? JSON.stringify(d.highlights) : "[]",
            thankyou_thumbnail_url: d.thankyou_thumbnail_url || "",
            // The old editor saved its placeholder wording; treat it as empty.
            thankyou_headline: d.thankyou_headline && d.thankyou_headline !== "Payment Successful!" ? d.thankyou_headline : "",
            thankyou_body: d.thankyou_body || "",
            thankyou_cta_label: d.thankyou_cta_label && d.thankyou_cta_label !== "Go to Dashboard" ? d.thankyou_cta_label : "",
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
            checkout_cover_url: d.checkout_cover_url || "",
            checkout_when: d.checkout_when || "",
            refund_policy_days: d.refund_policy_days?.toString() || "",
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
          return { ...u, sort_order: u.sort_order ?? 0, upsell_title: off?.title || "Unknown" };
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
    if (loadFailed.has("offering")) {
      toast({ title: "Not saved", description: "This offering didn't load properly, so saving could overwrite it. Reload the page and try again.", variant: "destructive" });
      return;
    }
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

    // Prevent publishing with no linked courses
    if (form.status === "active" && linkedCourseIds.length === 0) {
      toast({ title: "Cannot publish offering", description: "At least one course must be linked before setting status to Active.", variant: "destructive" });
      return;
    }

    // "Show on Explore" only when the Ready checks pass.
    if (explore.show !== "off") {
      const checks = pageReadiness(
        { button_offering_id: "this", card_image_url: explore.cardImage || null },
        { status: form.status, access: form.access, price_inr: form.price_inr, product_tier: form.product_tier, tally_form_url: form.tally_form_url, payment_mode: form.payment_mode, thumbnail_url: form.thumbnail_url || form.checkout_cover_url, has_landing: false },
        linkedCourseIds.length,
      ).slice(1);
      const missing = checks.filter((c) => !c.ok).map((c) => c.label);
      if (missing.length) {
        toast({ title: "Not ready to show on Explore", description: `${missing.join(". ")}. Set "Show it" to No to save now.`, variant: "destructive" });
        return;
      }
    }

    // A "Buy" offering that is on sale needs a price: ₹0 is not "free" any more.
    if (form.status === "active" && form.access === "buy" && !(Number(form.price_inr) > 0)) {
      toast({ title: "Add a price", description: "A Buy offering needs a price above ₹0. To give it away choose Free; for batches and packs the team adds people to, choose Team adds.", variant: "destructive" });
      return;
    }

    // Field validations
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

    // Validate thank-you CTA URL - this value gets written into
    // window.location.href on the ThankYou page (see ThankYou.tsx). Accept
    // only http/https absolute URLs. Empty string = default dashboard.
    if (form.thankyou_cta_url && form.thankyou_cta_url.trim()) {
      try {
        const parsed = new URL(form.thankyou_cta_url.trim());
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          toast({
            title: "CTA URL must start with http:// or https://",
            variant: "destructive",
          });
          return;
        }
        if (form.thankyou_cta_url.length > 500) {
          toast({ title: "CTA URL is too long (max 500 chars)", variant: "destructive" });
          return;
        }
      } catch {
        toast({ title: "CTA URL is not a valid URL", variant: "destructive" });
        return;
      }
    }

    // Cap lengths on free-form admin fields that get rendered into the
    // sandboxed ThankYou iframe. The DB also CHECKs these, but failing
    // early in the UI is a better experience than a 400 from Postgres.
    if (form.thankyou_body && form.thankyou_body.length > 5000) {
      toast({ title: "Thank you body is too long (max 5000 chars)", variant: "destructive" });
      return;
    }
    if (form.custom_tracking_script && form.custom_tracking_script.length > 10000) {
      toast({ title: "Custom tracking script is too long (max 10,000 chars)", variant: "destructive" });
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
      // is_public is no longer set here: it follows the pages that sell this
      // offering (trigger pages_sync_is_public, migration 20261106120000).
      access: form.access,
      product_tier: form.product_tier,
      // Public page
      subtitle: form.subtitle || null,
      banner_url: form.banner_url || null,
      instructor_name: form.instructor_name || null,
      instructor_title: form.instructor_title || null,
      instructor_avatar_url: form.instructor_avatar_url || null,
      highlights: parsedHighlights,
      // Thank you page
      thankyou_thumbnail_url: form.thankyou_thumbnail_url || null,
      // Empty = the thank-you page's own wording ("You're in.", "Start lesson 1").
      thankyou_headline: form.thankyou_headline.trim() || null,
      thankyou_body: form.thankyou_body || null,
      thankyou_cta_label: form.thankyou_cta_label.trim() || null,
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
      checkout_bullets: (() => { try { return (JSON.parse(form.checkout_bullets) as unknown[]).filter((b) => typeof b === "string" && b.trim()); } catch { return []; } })(),
      checkout_cover_url: form.checkout_cover_url.trim() || null,
      checkout_when: form.checkout_when.trim() || null,
      refund_policy_days: form.refund_policy_days ? Number(form.refund_policy_days) : null,
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

    // What it unlocks (courses) and its checkout add-ons (bumps), in ONE
    // all-or-nothing database call (admin_set_offering_links). It used to
    // delete every link and re-add them with errors ignored, so a failure
    // halfway left the offering with no courses while it said "saved".
    if (offId) {
      const { error: linkErr } = await supabase.rpc("admin_set_offering_links", {
        p_offering_id: offId,
        // null = "leave as it is" when that part failed to load.
        p_course_ids: loadFailed.has("courses") ? null : linkedCourseIds,
        p_bumps: loadFailed.has("bumps") ? null : bumps
          .filter((b) => b.bump_offering_id && b.bump_offering_id !== offId)
          .map((b) => ({ bump_offering_id: b.bump_offering_id, headline: b.headline || "", price_override: b.bump_price_override_inr || "" })),
      });
      if (linkErr) {
        toast({ title: "Courses and add-ons not saved", description: `The offering's details were saved, but its courses and add-ons were left exactly as they were. ${linkErr.message}`, variant: "destructive" });
        setSaving(false);
        return;
      }
      if (linkedCourseIds.length > 0) {

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

      // Sync upsells (skipped if they didn't load)
      if (!loadFailed.has("upsells")) await supabase.from("offering_upsells").delete().eq("parent_offering_id", offId);
      if (!loadFailed.has("upsells") && upsells.length > 0) {
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

      // Show on Explore
      const exploreErr = await saveExplore(offId, slug, form.title, explore);
      if (exploreErr) toast({ title: "Explore setting not saved", description: exploreErr, variant: "destructive" });

      // Questions on the checkout: update kept ones, add new ones, remove the rest
      // (left alone if they didn't load).
      if (!loadFailed.has("questions")) {
      const keep = questions.filter((q) => q.label.trim());
      const keptIds = keep.filter((q) => q.id).map((q) => q.id as string);
      const { data: existingQs } = await supabase.from("custom_field_definitions").select("id").eq("offering_id", offId);
      const dropIds = (existingQs ?? []).map((q) => q.id).filter((id) => !keptIds.includes(id));
      if (dropIds.length) await supabase.from("custom_field_definitions").delete().in("id", dropIds);
      for (const [i, q] of keep.entries()) {
        const row = { offering_id: offId, label: q.label.trim(), is_required: q.is_required, field_type: "text", sort_order: i };
        const { error: qErr } = q.id
          ? await supabase.from("custom_field_definitions").update(row).eq("id", q.id)
          : await supabase.from("custom_field_definitions").insert(row);
        if (qErr) { toast({ title: "A checkout question wasn't saved", description: qErr.message, variant: "destructive" }); break; }
      }
      }
    }

    // Audit log
    if (profile?.id && offId) {
      await (supabase as any).from("admin_audit_logs").insert({
        actor_user_id: profile.id,
        action: isNew ? "create" : "update",
        target_table: "offerings",
        target_id: offId,
        metadata: { title: form.title, status: form.status, price_inr: form.price_inr },
      });
    }

    // Home and Explore in this same app re-read the shop window next time.
    refreshStorefront();
    toast({ title: "Offering saved" });
    setSaving(false);

    // If this was a new offering, redirect to edit mode so the URL is correct
    if (isNew && offId) {
      navigate(`/admin/offerings/${offId}/edit`, { replace: true });
    }
  };

  /* ── Loading state ── */
  if (loading) {
    return (
      <>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    );
  }

  const courseTitles = allCourses.filter((c) => linkedCourseIds.includes(c.id)).map((c) => c.title);
  // Applications, staged payments, Calendly and the WhatsApp group only mean
  // something for offerings people apply to (live cohorts).
  const showApplications = form.product_tier === "live_cohort" || form.access === "apply" || form.payment_mode === "staged" || !!form.tally_form_url;

  return (
    <>
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

      {loadFailed.size > 0 && (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          Part of this offering didn't load ({[...loadFailed].join(", ")}). {loadFailed.has("offering") ? "Saving is blocked; reload the page." : "Saving leaves those parts exactly as they are; reload to edit them."}
        </div>
      )}
      {/* Sections on the left, the live preview always beside them (founder,
          6 Nov 2026: "a visualiser we can keep on"). Every section here does
          something the buyer or the team sees; nothing is decorative. */}
      <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="w-full">
        <TabsList className="w-full justify-start bg-secondary/50 mb-6 flex-wrap h-auto">
          <TabsTrigger value="basics">Basics</TabsTrigger>
          <TabsTrigger value="checkout">Checkout page</TabsTrigger>
          <TabsTrigger value="after">After payment</TabsTrigger>
          <TabsTrigger value="explore">Explore and sales page</TabsTrigger>
          <TabsTrigger value="tracking">Tracking</TabsTrigger>
          {showApplications && <TabsTrigger value="applications">Applications and cohort</TabsTrigger>}
          {!isNew && <TabsTrigger value="students">Students</TabsTrigger>}
        </TabsList>

        <div className={section === "students" ? "" : "grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start"}>
          <div className="min-w-0">
            <TabsContent value="basics" className="mt-0">
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
              <Label>Address (short name in its links)</Label>
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
                  Checkout: /checkout/{form.slug} · Sales page: /p/{form.slug}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => f("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["active", "archived", "draft"] as const).map((k) => (
                      <SelectItem key={k} value={k}>{OFFERING_STATUS[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{OFFERING_STATUS[form.status]?.hint}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Format</Label>
                <Select value={form.product_tier} onValueChange={(v) => f("product_tier", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(FORMAT).map(([k, label]) => (
                      <SelectItem key={k} value={k}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Decides its row on Explore and Home (masterclass, live cohort, workshop).</p>
              </div>
              <div>
                <Label>How people get it</Label>
                <Select value={form.access} onValueChange={(v) => f("access", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACCESS_ORDER.map((k) => (
                      <SelectItem key={k} value={k}>{ACCESS[k].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">{ACCESS[form.access]?.hint}</p>
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
                <Label>Struck-through price (INR)</Label>
                <Input
                  type="number"
                  value={form.mrp_inr}
                  onChange={(e) => f("mrp_inr", e.target.value)}
                  placeholder="Optional (for strikethrough)"
                />
              </div>
            </div>
            <div>
              <Label>Picture</Label>
              <p className="text-xs text-muted-foreground mb-1">Used on its cards, in My learning and on the thank-you page when that has none.</p>
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
                <Label>GST</Label>
                <Select value={form.gst_mode} onValueChange={(v) => f("gst_mode", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No GST</SelectItem>
                    <SelectItem value="inclusive">Included in the price</SelectItem>
                    <SelectItem value="exclusive">Added on top of the price</SelectItem>
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
            {/* Linked courses */}
            <div>
              <Label className="mb-1 block">Courses inside (what the buyer gets)</Label>
              <p className="text-xs text-muted-foreground mb-2">Buying this offering opens every course ticked here. One course can be inside many offerings.</p>
              <div className="space-y-2 max-h-48 overflow-y-auto border border-border rounded-lg p-3">
                {allCourses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No courses found. Create courses first.</p>
                ) : (
                  // Ticked courses first, so what's inside is visible without scrolling.
                  [...allCourses].sort((a, b) => Number(linkedCourseIds.includes(b.id)) - Number(linkedCourseIds.includes(a.id))).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={linkedCourseIds.includes(c.id)}
                        onCheckedChange={(checked) => {
                          setLinkedCourseIds((prev) =>
                            checked ? [...prev, c.id] : prev.filter((id) => id !== c.id)
                          );
                        }}
                      />
                      <span className="flex-1">{c.title}</span>
                      {linkedCourseIds.includes(c.id) && (
                        <Link to={`/admin/courses/${c.id}/curriculum`} className="text-xs underline text-muted-foreground" onClick={(e) => e.stopPropagation()}>Edit lessons</Link>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

          </div>
            </TabsContent>

            <TabsContent value="checkout" className="mt-0">
              <CheckoutPageTab
                form={form}
                f={(k, v) => f(k as keyof typeof EMPTY_FORM, v)}
                offeringId={isNew ? undefined : offeringId}
                bumps={bumps}
                setBumps={setBumps}
                bumpChoices={bumpChoices}
                questions={questions}
                setQuestions={setQuestions}
                courseTitles={courseTitles}
              />
            </TabsContent>

            <TabsContent value="after" className="mt-0 space-y-3">
              <p className="text-sm text-muted-foreground">What the buyer sees right after paying. Leave a box empty to use the app's own wording (shown in the preview).</p>
              <ThankYouFields form={form} f={f} />
            </TabsContent>

            <TabsContent value="explore" className="mt-0 space-y-6">
            <ExploreFields
              value={explore}
              onChange={setExplore}
              courseCount={linkedCourseIds.length}
              offering={{ status: form.status, access: form.access, price_inr: form.price_inr, product_tier: form.product_tier, tally_form_url: form.tally_form_url, payment_mode: form.payment_mode, thumbnail_url: form.thumbnail_url || form.checkout_cover_url, has_landing: false }}
            />
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium">Sales page (/p/{form.slug || "…"})</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    The longer page people can read before buying. Masterclasses and cohorts with a designed page use that design; these fields fill the card's second line and any page without a design.
                  </p>
                </div>
                <PublicPageFields form={form} f={f} />
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <Switch checked={form.show_coupon_on_page} onCheckedChange={(v) => f("show_coupon_on_page", v)} />
                    <Label>Show a coupon code on the sales page</Label>
                  </div>
                  {form.show_coupon_on_page && (
                    <Input value={form.page_coupon_code} onChange={(e) => f("page_coupon_code", e.target.value.toUpperCase())} placeholder="EARLYBIRD" className="max-w-[240px]" />
                  )}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="tracking" className="mt-0 space-y-3">
              <p className="text-sm text-muted-foreground">Extra tracking for this offering only, on its sales, checkout and thank-you pages. LevelUp's own Meta pixel always runs.</p>
              <TrackingFields form={form} f={f} />
            </TabsContent>

            {showApplications && (
              <TabsContent value="applications" className="mt-0">
          <div className="bg-card border border-border rounded-xl p-6 space-y-5">
            <p className="text-sm text-muted-foreground">
              Settings for live cohort offerings: staged payments, external integrations, and completion criteria.
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
            )}

            {!isNew && offeringId && (
              <TabsContent value="students" className="mt-0 space-y-6">
                <StudentsTab offeringId={offeringId} />
                <section className="space-y-3" aria-labelledby="accessCheckH">
                  <div>
                    <h3 id="accessCheckH" className="text-sm font-semibold">Access check</h3>
                    <p className="text-xs text-muted-foreground">Everyone owed this product, including people who bought it and haven't signed in yet.</p>
                  </div>
                  <AccessTab offeringId={offeringId} />
                </section>
              </TabsContent>
            )}
          </div>

          {section !== "students" && (
            <aside className="hidden xl:block xl:sticky xl:top-4">
              <OfferingPreview
                follow={section === "after" ? "thankyou" : section === "explore" ? "card" : "checkout"}
                form={form}
                explore={explore}
                courseTitles={courseTitles}
                bumps={bumps}
                bumpChoices={bumpChoices}
                questions={questions}
              />
            </aside>
          )}
        </div>
      </Tabs>
    </>
  );
};

export default AdminOfferingEditor;
