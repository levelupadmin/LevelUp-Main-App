import { useEffect, useState, useCallback, useRef } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/lib/toast";
import { Loader2, Tag, BookOpen, ArrowLeft, CheckCircle2, Lock } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import TrustPanel from "@/components/checkout/TrustPanel";
import StickyPayBar from "@/components/checkout/StickyPayBar";
import GuaranteeBadge from "@/components/offering/GuaranteeBadge";
import ContinueOnWebCTA from "@/components/ContinueOnWebCTA";
import { isAndroid, isNative } from "@/lib/platform";
import { hapticImpact } from "@/lib/haptics";
import { track } from "@/lib/analytics";

/* -- Razorpay global type -- */
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: () => void) => void;
    };
  }
}

type Offering = Tables<"offerings"> & { mrp_inr?: number | null };
type Bump = Tables<"offering_bumps">;
type CustomField = Tables<"custom_field_definitions">;

interface LinkedCourse {
  course_id: string;
  courses: { title: string; thumbnail_url: string | null } | null;
}

export default function CheckoutPage() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  // Staged payment params
  const paymentType = (searchParams.get("type") as "full" | "app_fee" | "confirmation" | "balance") || "full";
  const applicationId = searchParams.get("app") || null;
  usePageTitle(
    paymentType === "app_fee" ? "Application Fee" :
    paymentType === "confirmation" ? "Confirmation Payment" :
    paymentType === "balance" ? "Balance Payment" : "Checkout"
  );

  const [offering, setOffering] = useState<Offering | null>(null);
  const [linkedCourses, setLinkedCourses] = useState<LinkedCourse[]>([]);
  const [bumps, setBumps] = useState<(Bump & { offeringDetail?: Offering })[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  // User selections
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(new Set());
  const [couponCode, setCouponCode] = useState("");
  // Coupon preview returned by the validate-coupon edge function.
  // We deliberately do NOT reuse Tables<"coupons"> here. The coupons
  // table is locked down and we should only ever hold the discount
  // preview fields in client state. id/code are safe because
  // create-razorpay-order re-fetches and re-validates the full row.
  const [appliedCoupon, setAppliedCoupon] = useState<{
    id: string;
    code: string;
    discount_type: "percent" | "flat" | string;
    discount_value: number;
  } | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [fieldTouched, setFieldTouched] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState(false);
  const paymentInFlightRef = useRef(false);
  const [application, setApplication] = useState<any>(null);
  const [totalPreviouslyPaid, setTotalPreviouslyPaid] = useState(0);

  // Guest checkout fields. Only used when there's no user session.
  // On payment success the guest-create-order + verify-razorpay-payment
  // edge functions create a real auth.users row using these details, so
  // the buyer becomes a logged-in user without ever seeing an OTP.
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestTouched, setGuestTouched] = useState<{ name?: boolean; email?: boolean; phone?: boolean }>({});

  /* -- Load offering data -- */
  useEffect(() => {
    // Wait for auth to settle; load works for both signed-in users
    // and anon (guest) visitors. Staged-payment offerings still need
    // a logged-in user (application + balance flows) but that's
    // checked at the staged-payment branch later.
    if (authLoading || !offeringId) return;

    async function load() {
      setLoading(true);
      const [offRes, coursesRes, bumpsRes, fieldsRes] = await Promise.all([
        supabase.from("offerings").select("*").eq("id", offeringId!).single(),
        supabase
          .from("offering_courses")
          .select("course_id, courses(title, thumbnail_url)")
          .eq("offering_id", offeringId!) as any,
        supabase
          .from("offering_bumps")
          .select("*")
          .eq("parent_offering_id", offeringId!)
          .order("sort_order"),
        supabase
          .from("custom_field_definitions")
          .select("*")
          .eq("offering_id", offeringId!)
          .order("sort_order"),
      ]);

      if (offRes.error || !offRes.data) {
        toast.error("Offering not found");
        navigate("/home");
        return;
      }

      // Archived offerings are no longer for sale; they only exist
      // for past enrolees to access materials. Anyone landing on
      // /checkout/<id> for an archived offering gets redirected to
      // /p/<slug> where the archive notice + "Sign in" CTA lives.
      if ((offRes.data as any).status === "archived") {
        toast.error("This programme is no longer accepting enrolments.");
        navigate((offRes.data as any).slug ? `/p/${(offRes.data as any).slug}` : "/browse");
        return;
      }

      setOffering(offRes.data as Offering);
      setLinkedCourses(coursesRes.data ?? []);
      setCustomFields(fieldsRes.data ?? []);

      // Fire initiate_checkout once the checkout surface has data
      // to display. Subsequent re-renders don't re-fire because this
      // sits inside the offering-load flow.
      track({
        name: "initiate_checkout",
        content_id: (offRes.data as any).id,
        content_name: (offRes.data as any).title,
        value: Number((offRes.data as any).price_inr || 0),
        currency: (offRes.data as any).currency || "INR",
      });

      // Load application data for staged payments.
      // Staged payments require a logged-in user (the application was
      // created against their account). Anon visitors hitting a staged
      // URL get bounced to login first.
      if (applicationId && paymentType !== "full") {
        if (!user) {
          navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`);
          return;
        }
        const { data: appData } = await (supabase as any)
          .from("cohort_applications")
          .select("id, user_id, status, full_name, email, app_fee_payment_id, confirmation_payment_id, balance_payment_id")
          .eq("id", applicationId)
          .eq("user_id", user.id)
          .maybeSingle();
        if (!appData) {
          toast.error("This application isn't available on your account.");
          navigate("/learn?seg=courses");
          return;
        }
        setApplication(appData);
        let paid = 0;
        if (appData.app_fee_payment_id) paid += Number(offRes.data.app_fee_inr ?? 0);
        if (appData.confirmation_payment_id) paid += Number(offRes.data.confirmation_amount_inr ?? 0);
        setTotalPreviouslyPaid(paid);
      }

      // Load bump offering details
      const bumpData = bumpsRes.data ?? [];
      if (bumpData.length > 0) {
        const bumpOfferingIds = bumpData.map((b: Bump) => b.bump_offering_id);
        const { data: bumpOfferings } = await supabase
          .from("offerings")
          .select("*")
          .in("id", bumpOfferingIds);

        const enriched = bumpData.map((b: Bump) => ({
          ...b,
          offeringDetail: bumpOfferings?.find(
            (o) => o.id === b.bump_offering_id
          ),
        }));
        setBumps(enriched);
      }

      setLoading(false);
    }
    load();
  }, [authLoading, user, offeringId, applicationId, paymentType, navigate]);

  // Prefill guest fields from logged-in user when available - the guest
  // form is still rendered if needed (e.g. user has no full_name on
  // file yet) but seeded so they don't retype.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        if (data.full_name && !guestName) setGuestName(data.full_name);
        if (data.email && !guestEmail) setGuestEmail(data.email);
        if (data.phone && !guestPhone) setGuestPhone(data.phone);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const isStaged = paymentType !== "full" && (offering as any)?.payment_mode === "staged";
  const stagedLabel = paymentType === "app_fee" ? "Application Fee"
    : paymentType === "confirmation" ? "Confirmation Amount"
    : paymentType === "balance" ? "Balance Payment" : "";

  /* -- Pricing -- */
  const subtotal = (() => {
    if (!offering) return 0;
    // Staged payment: use the specific stage amount
    if (isStaged) {
      if (paymentType === "app_fee") return Number((offering as any).app_fee_inr ?? 0);
      if (paymentType === "confirmation") return Number((offering as any).confirmation_amount_inr ?? 0);
      if (paymentType === "balance") return Math.max(Number(offering.price_inr) - totalPreviouslyPaid, 0);
    }
    // Standard full payment
    let total = Number(offering.price_inr);
    for (const bId of selectedBumps) {
      const bump = bumps.find((b) => b.bump_offering_id === bId);
      if (bump) {
        total += bump.bump_price_override_inr
          ? Number(bump.bump_price_override_inr)
          : Number(bump.offeringDetail?.price_inr ?? 0);
      }
    }
    return total;
  })();

  const discount = (() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.discount_type === "percent") {
      return Math.round(
        (subtotal * Number(appliedCoupon.discount_value)) / 100
      );
    }
    return Math.min(Number(appliedCoupon.discount_value), subtotal);
  })();

  const afterDiscount = Math.max(subtotal - discount, 0);

  const gstRate = offering?.gst_mode !== "none" ? Number(offering?.gst_rate ?? 18) : 0;
  const gstAmount = (() => {
    if (!offering || offering.gst_mode === "none") return 0;
    if (offering.gst_mode === "inclusive")
      return Math.round(afterDiscount - afterDiscount / (1 + gstRate / 100));
    return Math.round((afterDiscount * gstRate) / 100);
  })();

  const total =
    offering?.gst_mode === "exclusive" ? afterDiscount + gstAmount : afterDiscount;

  // Combined "you saved" figure: MRP markdown (sticker to price) plus any
  // coupon discount. Shared by the in-card savings chip and the mobile
  // StickyPayBar so the two never disagree. Only meaningful on full
  // (non-staged) purchases where an MRP exists.
  const mrpInr = Number((offering as any)?.mrp_inr || 0);
  const mrpSavings = !isStaged && mrpInr > subtotal ? mrpInr - subtotal : 0;
  const totalSavings = mrpSavings + discount;

  /* -- Apply coupon --
   *
   * The coupons table is locked down to admin reads only (see the
   * coupons_read_lockdown migration), so this page can no longer
   * SELECT from it directly. All validation goes through the
   * validate-coupon edge function, which runs with service-role
   * privileges and returns only a discount preview (never used_count
   * / max_redemptions / other sensitive columns). create-razorpay-order
   * will re-validate the full coupon row at order creation time, so
   * nothing here is authoritative.
   */
  const applyCoupon = useCallback(async () => {
    if (!couponCode.trim() || !offeringId) return;
    setCouponLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-coupon", {
        body: {
          coupon_code: couponCode.trim().toUpperCase(),
          offering_id: offeringId,
        },
      });

      if (error || !data?.valid) {
        toast.error(data?.error || "Invalid coupon code");
        return;
      }

      setAppliedCoupon({
        id: data.id,
        code: data.code,
        discount_type: data.discount_type,
        discount_value: Number(data.discount_value),
      });
      toast.success("Coupon applied!");
    } catch {
      toast.error("Error applying coupon");
    } finally {
      setCouponLoading(false);
    }
  }, [couponCode, offeringId]);

  /* -- Load Razorpay script -- */
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]'))
      return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onerror = () => toast.error("Failed to load payment gateway. Please refresh the page.");
    document.body.appendChild(script);
  }, []);

  /* -- Pay -- */
  const handlePay = async () => {
    if (!offering) return;
    if (paymentInFlightRef.current) return;
    void hapticImpact("medium");

    // Validate guest fields when anon. Touch all so inline errors
    // surface immediately on the first paint of the form.
    const isAnon = !user;
    if (isAnon) {
      setGuestTouched({ name: true, email: true, phone: true });
      if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
        toast.error("Please fill in name, email and phone");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim())) {
        toast.error("Please enter a valid email");
        return;
      }
      // Accept either 10-digit or +91-prefixed 12-digit; the edge
      // function does the canonical normalisation.
      const digits = guestPhone.replace(/\D/g, "");
      if (!(digits.length === 10 || (digits.length === 12 && digits.startsWith("91")))) {
        toast.error("Please enter a valid 10-digit Indian phone number");
        return;
      }
    }

    paymentInFlightRef.current = true;

    // Validate custom fields: mark all as touched so inline errors appear
    const touchAll: Record<string, boolean> = {};
    let hasFieldError = false;
    for (const field of customFields) {
      touchAll[field.id] = true;
      if (field.is_required && !customFieldValues[field.id]?.trim()) {
        hasFieldError = true;
      }
    }
    setFieldTouched((prev) => ({ ...prev, ...touchAll }));
    if (hasFieldError) {
      toast.error("Please fill in all required fields");
      paymentInFlightRef.current = false;
      return;
    }

    setPaying(true);

    try {
      // Free total for a signed-in user: no Razorpay leg exists for a
      // zero-rupee order (create-razorpay-order rejects <= 0), so enrol
      // through the dedicated authenticated free path and go straight to
      // ThankYou. Server recomputes the total, so this can't be spoofed.
      if (!isAnon && !isStaged && total <= 0) {
        const { data: freeData, error: freeErr } = await supabase.functions.invoke(
          "create-free-enrolment",
          {
            body: {
              offering_id: offeringId,
              coupon_id: appliedCoupon?.id ?? null,
            },
          }
        );
        if (freeErr || !freeData?.success) {
          toast.error(freeData?.error ?? "Couldn't complete the enrolment. Please try again.");
          setPaying(false); paymentInFlightRef.current = false;
          return;
        }
        navigate(freeData.payment_order_id ? `/thank-you/${freeData.payment_order_id}` : "/my-courses");
        return;
      }

      // Anon: guest-create-order (creates the auth.users row on
      // payment verify, no OTP). Logged-in: create-razorpay-order
      // (existing path, ties to user.id).
      const { data, error } = isAnon
        ? await supabase.functions.invoke("guest-create-order", {
            body: {
              offering_id: offeringId,
              guest_name: guestName.trim(),
              guest_email: guestEmail.trim(),
              guest_phone: guestPhone.trim(),
              coupon_code: appliedCoupon?.code ?? null,
            },
          })
        : await supabase.functions.invoke("create-razorpay-order", {
            body: {
              offering_id: offeringId,
              coupon_id: isStaged ? null : (appliedCoupon?.id ?? null),
              bump_ids: isStaged ? [] : Array.from(selectedBumps),
              custom_field_values: customFieldValues,
              ...(isStaged
                ? {
                    payment_type: paymentType,
                    application_id: applicationId,
                  }
                : {}),
            },
          });

      if (error || (!data?.razorpay_order_id && !(isAnon && data?.success))) {
        toast.error(data?.error ?? "Failed to create order");
        setPaying(false); paymentInFlightRef.current = false;
        return;
      }

      // Free guest offering: edge function already enrolled the user
      // and granted access. Drop straight to ThankYou.
      if (isAnon && data?.success && !data?.razorpay_order_id) {
        navigate(`/thank-you/${data.payment_order_id}`);
        return;
      }

      // Prefill: for guest checkout use what they just typed; for
      // logged-in users pull from profile.
      let prefillName = guestName;
      let prefillEmail = guestEmail;
      let prefillContact = guestPhone;
      if (!isAnon && user) {
        const { data: profile } = await supabase
          .from("users")
          .select("full_name, email, phone")
          .eq("id", user.id)
          .single();
        prefillName = profile?.full_name ?? "";
        prefillEmail = profile?.email ?? user.email ?? "";
        prefillContact = profile?.phone ?? "";
      }

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "LevelUp",
        description: data.offering_title,
        order_id: data.razorpay_order_id,
        prefill: {
          name: prefillName,
          email: prefillEmail,
          contact: prefillContact,
        },
        theme: { color: "#F5F1E8", backdrop_color: "rgba(0,0,0,0.8)" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          // Verify payment
          const { data: verifyData, error: verifyErr } =
            await supabase.functions.invoke("verify-razorpay-payment", {
              body: {
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                payment_order_id: data.payment_order_id,
              },
            });

          if (verifyErr || !verifyData?.success) {
            toast.error("Payment verification failed, please contact support");
            setPaying(false); paymentInFlightRef.current = false;
            return;
          }

          toast.success(
            `Welcome to ${verifyData.offering_title ?? offering.title}!`
          );
          navigate(`/thank-you/${data.payment_order_id}`);
        },
        modal: {
          ondismiss: () => {
            setPaying(false); paymentInFlightRef.current = false;
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", () => {
        toast.error("Payment failed, please try again");
        setPaying(false); paymentInFlightRef.current = false;
      });
      rzp.open();
    } catch {
      toast.error("Something went wrong, please try again");
      setPaying(false); paymentInFlightRef.current = false;
    }
  };

  /* -- UI -- */
  if (loading || authLoading) {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center gap-3 bg-canvas"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading secure checkout…</p>
      </div>
    );
  }

  if (!offering) return null;

  // Path B / Google Play Reader Rule: the Android shell must NEVER expose a
  // Razorpay-driven checkout page. Replace the entire pay UI with a
  // Continue-on-web card that deep-links to the same offering on the public
  // web origin. Slug-aware so we land the user exactly where they tapped.
  if (isNative()) {
    const webPath = offering.slug ? `/p/${offering.slug}` : "/browse";
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[480px]">
          <ContinueOnWebCTA webPath={webPath} />
        </div>
      </div>
    );
  }

  const hasMrp =
    (offering as any).mrp_inr &&
    Number((offering as any).mrp_inr) > Number(offering.price_inr);

  // Pull display metadata for the trust panel. Uses the first linked course
  // as the "what you're buying" preview, with a safe fallback if none exists.
  const primaryCourseId = linkedCourses[0]?.course_id ?? null;
  const trustPanelCourseTitle = (linkedCourses[0]?.courses as any)?.title ?? offering.title;
  const trustPanelThumb = (linkedCourses[0]?.courses as any)?.thumbnail_url ?? null;

  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row lg:items-start lg:justify-center gap-8 px-4 py-12 md:py-20 pb-28 lg:pb-12">
      <Card className="w-full max-w-[560px] border-border bg-surface">
        <CardContent className="p-6 md:p-8 space-y-6">
          {/* -- Back link -- */}
          <button
            onClick={() => {
              if (offering?.slug) navigate(`/p/${offering.slug}`);
              else if (offeringId) navigate(`/browse`);
              else navigate(-1);
            }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors -mb-3"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          {/* -- Header: mini product summary, thumbnail + title +
              instructor for continuity from the sales page. -- */}
          <div>
            {isStaged && stagedLabel && (
              <Badge variant="secondary" className="mb-2">{stagedLabel}</Badge>
            )}
            <div className="flex items-start gap-4">
              {(offering.thumbnail_url || offering.banner_url) && (
                <img
                  src={offering.thumbnail_url || offering.banner_url || ""}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-16 w-16 rounded-xl object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-xl font-semibold text-foreground">
                  {offering.title}
                </h1>
                {offering.instructor_name && (
                  <p className="text-sm text-muted-foreground mt-0.5">
                    with {offering.instructor_name}
                  </p>
                )}
              </div>
            </div>
            {isStaged && (
              <p className="text-sm text-muted-foreground mt-2">
                {paymentType === "app_fee" ? "Submit your application fee to begin the review process." :
                 paymentType === "confirmation" ? "Confirm your seat with this payment." :
                 paymentType === "balance" ? "Complete your remaining balance payment." : ""}
              </p>
            )}
            {!isStaged && offering.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {offering.description}
              </p>
            )}
          </div>

          <Separator className="bg-border" />

          {/* -- What you get -- */}
          {linkedCourses.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                What you'll get
              </p>
              {linkedCourses.map((lc) => (
                <div
                  key={lc.course_id}
                  className="flex items-center gap-3 rounded-lg bg-surface-2 px-3 py-2"
                >
                  <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-foreground">
                    {(lc.courses as any)?.title ?? "Course"}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Testimonials */}
          {!isStaged && (() => {
            try {
              const testimonials = (offering as any).checkout_testimonials || [];
              if (!Array.isArray(testimonials) || testimonials.length === 0) return null;
              return (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What students say</p>
                  {testimonials.map((t: any, i: number) => (
                    <div key={i} className="flex gap-3 rounded-lg bg-surface-2 px-4 py-3">
                      {t.photo_url && <img src={t.photo_url} alt={t.name} className="h-10 w-10 rounded-full object-cover shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground italic">"{t.quote}"</p>
                        <p className="text-xs text-muted-foreground mt-1">{t.name}{t.title ? ` · ${t.title}` : ""}</p>
                      </div>
                    </div>
                  ))}
                </div>
              );
            } catch { return null; }
          })()}

          {/* Value bullets */}
          {!isStaged && (() => {
            try {
              const bullets = (offering as any).checkout_bullets || [];
              if (!Array.isArray(bullets) || bullets.length === 0) return null;
              return (
                <div className="space-y-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What you get</p>
                  <ul className="space-y-1.5">
                    {bullets.map((b: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <CheckCircle2 className="h-4 w-4 text-accent-emerald shrink-0 mt-0.5" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            } catch { return null; }
          })()}

          {/* -- Custom fields -- */}
          {customFields.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Your details
              </p>
              {customFields.map((field) => {
                const isTouched = fieldTouched[field.id];
                const isEmpty = !customFieldValues[field.id]?.trim();
                const showError = field.is_required && isTouched && isEmpty;
                return (
                  <div key={field.id}>
                    <label className="text-sm text-foreground mb-1 block">
                      {field.label}
                      {field.is_required && (
                        <span className="text-destructive ml-0.5">*</span>
                      )}
                    </label>
                    <Input
                      value={customFieldValues[field.id] ?? ""}
                      onChange={(e) =>
                        setCustomFieldValues((v) => ({
                          ...v,
                          [field.id]: e.target.value,
                        }))
                      }
                      onBlur={() =>
                        setFieldTouched((prev) => ({ ...prev, [field.id]: true }))
                      }
                      placeholder={field.label}
                      aria-invalid={showError}
                      aria-describedby={`error-${field.id}`}
                      className={`bg-surface-2 ${showError ? "border-destructive focus-visible:ring-destructive" : "border-border"}`}
                    />
                    {showError && (
                      <p id={`error-${field.id}`} className="text-xs text-destructive mt-1">
                        {field.label} is required
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* -- Bumps -- */}
          {!isStaged && bumps.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Add to your order
              </p>
              {bumps.map((bump) => {
                const price =
                  bump.bump_price_override_inr ??
                  bump.offeringDetail?.price_inr ??
                  0;
                const isSelected = selectedBumps.has(bump.bump_offering_id);
                return (
                  <label
                    key={bump.id}
                    className={`flex items-start gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                      isSelected
                        ? "border-foreground/30 bg-surface-2"
                        : "border-border hover:bg-surface-2/50"
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedBumps((prev) => {
                          const next = new Set(prev);
                          if (checked) next.add(bump.bump_offering_id);
                          else next.delete(bump.bump_offering_id);
                          return next;
                        });
                      }}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {bump.headline ??
                          bump.offeringDetail?.title ??
                          "Add-on"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                      +₹{Number(price).toLocaleString("en-IN")}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          {/* -- Guest fields (anon checkout) --
              Friction-free: just name + email + phone. No OTP. The
              edge function uses these to create the auth.users row
              on payment verify, so the buyer becomes a logged-in
              user the next time they sign in with this phone. */}
          {!user && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Your details
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)}
                  className="text-xs text-[hsl(var(--cream))] hover:underline"
                >
                  Already have an account? Sign in
                </button>
              </div>
              <Input
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                onBlur={() => setGuestTouched((s) => ({ ...s, name: true }))}
                placeholder="Full name"
                className={guestTouched.name && !guestName.trim() ? "border-destructive" : ""}
                autoComplete="name"
              />
              <Input
                value={guestEmail}
                onChange={(e) => setGuestEmail(e.target.value)}
                onBlur={() => setGuestTouched((s) => ({ ...s, email: true }))}
                placeholder="Email address"
                type="email"
                inputMode="email"
                className={guestTouched.email && !guestEmail.trim() ? "border-destructive" : ""}
                autoComplete="email"
              />
              <div className="flex">
                <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-border bg-surface-2 text-sm text-muted-foreground font-mono">
                  +91
                </span>
                <Input
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value.replace(/[^\d+]/g, ""))}
                  onBlur={() => setGuestTouched((s) => ({ ...s, phone: true }))}
                  placeholder="10-digit mobile number"
                  type="tel"
                  inputMode="tel"
                  className={`rounded-l-none ${guestTouched.phone && !guestPhone.trim() ? "border-destructive" : ""}`}
                  autoComplete="tel"
                />
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                We'll create your account on this phone number. No password, no OTP, just sign in with this phone later to access your masterclass.
              </p>
            </div>
          )}

          {/* -- Coupon -- */}
          {!isStaged && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Promo code
            </p>
            {appliedCoupon ? (
              <div className="space-y-2">
                {/* Applied-coupon chip with one-click remove. The
                    chip is the visible affordance; the savings line
                    below reinforces the win emotionally. */}
                <div className="inline-flex items-center gap-2 pl-3 pr-1 py-1 rounded-full bg-[hsl(var(--accent-emerald)/0.15)] border border-[hsl(var(--accent-emerald)/0.4)]">
                  <Tag className="h-3.5 w-3.5 text-[hsl(var(--accent-emerald))]" />
                  <span className="font-mono text-sm font-bold text-[hsl(var(--accent-emerald))]">
                    {appliedCoupon.code}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAppliedCoupon(null);
                      setCouponCode("");
                      toast.success("Promo code removed");
                    }}
                    aria-label="Remove promo code"
                    className="h-6 w-6 rounded-full bg-[hsl(var(--accent-emerald)/0.2)] hover:bg-[hsl(var(--accent-emerald)/0.4)] flex items-center justify-center transition-colors"
                  >
                    <span aria-hidden className="text-[hsl(var(--accent-emerald))] text-sm leading-none">×</span>
                  </button>
                </div>
                {discount > 0 && (
                  <p className="text-sm font-semibold text-[hsl(var(--accent-emerald))]">
                    Saved ₹{discount.toLocaleString("en-IN")} on this order
                  </p>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Have a promo code?"
                    className="bg-surface-2 border-border w-full font-mono uppercase"
                    onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                  />
                  {couponLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={applyCoupon}
                  disabled={couponLoading || !couponCode.trim()}
                  className="shrink-0 h-10"
                >
                  {couponLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Apply"
                  )}
                </Button>
              </div>
            )}
          </div>
          )}

          <Separator className="bg-border" />

          {/* -- Order summary --
              Dotted-leader rows (label … value, like a printed receipt) under
              an Instrument-Serif heading. The leader is a flex-1 dotted border
              between each label and its amount. */}
          <div className="space-y-2.5">
            <h2 className="font-['Instrument_Serif'] text-2xl italic text-foreground leading-none">
              Order summary
            </h2>
            <div className="space-y-2 text-sm pt-1">
              <div className="flex items-baseline gap-2">
                <span className="text-muted-foreground shrink-0">Subtotal</span>
                <span className="flex-1 border-b border-dotted border-border/60 translate-y-[-3px]" aria-hidden />
                <span className="text-foreground font-medium shrink-0 tabular-nums">
                  {hasMrp && (
                    <span className="text-muted-foreground line-through mr-2">
                      ₹{Number((offering as any).mrp_inr).toLocaleString("en-IN")}
                    </span>
                  )}
                  ₹{subtotal.toLocaleString("en-IN")}
                </span>
              </div>
              {discount > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground shrink-0">Discount</span>
                  <span className="flex-1 border-b border-dotted border-border/60 translate-y-[-3px]" aria-hidden />
                  <span className="text-accent-emerald font-medium shrink-0 tabular-nums">
                    −₹{discount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
              {gstAmount > 0 && (
                <div className="flex items-baseline gap-2">
                  <span className="text-muted-foreground shrink-0">
                    GST ({gstRate}%
                    {offering.gst_mode === "inclusive" ? " incl." : ""})
                  </span>
                  <span className="flex-1 border-b border-dotted border-border/60 translate-y-[-3px]" aria-hidden />
                  <span className="text-foreground font-medium shrink-0 tabular-nums">
                    ₹{gstAmount.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
              <Separator className="bg-border" />
              <div className="flex items-baseline gap-2 text-base font-semibold">
                <span className="text-foreground shrink-0">Total</span>
                <span className="flex-1 border-b border-dotted border-border/60 translate-y-[-3px]" aria-hidden />
                <span className="text-foreground shrink-0 tabular-nums">
                  ₹{total.toLocaleString("en-IN")}
                </span>
              </div>
              {gstAmount > 0 && (
                <p className="text-[11px] text-muted-foreground text-right -mt-1">
                  Includes GST
                </p>
              )}
              {/* Celebrate the savings - MRP markdown + coupon discount
                  combined. Shopify-style; the emotional reinforcement
                  lifts conversion at the exact decision moment. */}
              {totalSavings > 0 && (
                <div className="flex justify-between items-center px-3 py-2 rounded-lg bg-[hsl(var(--accent-emerald)/0.10)] border border-[hsl(var(--accent-emerald)/0.25)]">
                  <span className="text-xs font-mono uppercase tracking-wider text-[hsl(var(--accent-emerald))]">
                    Total savings
                  </span>
                  <span className="text-sm font-bold text-[hsl(var(--accent-emerald))]">
                    ₹{totalSavings.toLocaleString("en-IN")}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* -- Trust signals -- */}
          <div className="flex flex-col items-center gap-2">
            <GuaranteeBadge days={offering.refund_policy_days} />
          </div>

          {/* -- Pay button -- */}
          {/* total <= 0 is a valid, payable state for non-staged orders (free
              offering or 100%-off coupon): guests go through guest-create-order's
              free capture, signed-in users through create-free-enrolment. Only
              staged payments require a positive amount. */}
          <Button
            size="xl"
            className="w-full"
            onClick={handlePay}
            disabled={paying || (isStaged && total <= 0)}
          >
            {paying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : isStaged ? (
              `Pay ${stagedLabel}: ₹${total.toLocaleString("en-IN")}`
            ) : total <= 0 ? (
              "Enrol free"
            ) : (
              `Pay ₹${total.toLocaleString("en-IN")}`
            )}
          </Button>

          {/* Reassurance capsule directly under the pay button: lock icon +
              gateway + refund window in one quiet pill. */}
          <div className="flex justify-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1.5 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3 text-[hsl(var(--accent-emerald))]" />
              Secured by Razorpay
              <span className="text-muted-foreground/40">·</span>
              {offering.refund_policy_days
                ? `${offering.refund_policy_days}-day refund`
                : "7-day refund"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Desktop-only trust sidebar. Hidden on staged payments to keep
          the confirmation/balance flow focused. */}
      {!isStaged && (
        <TrustPanel
          courseId={primaryCourseId}
          courseTitle={trustPanelCourseTitle}
          courseThumbnailUrl={trustPanelThumb}
          instructorName={(offering as any).instructor_display_name ?? null}
          durationMinutes={(offering as any).duration_minutes ?? null}
          batchStartsAt={(offering as any).starts_at ?? null}
        />
      )}

      {/* Mobile sticky pay bar: always-visible total + Pay on phones. Only
          ever reached on web (native returns the Continue-on-web card above). */}
      <StickyPayBar
        total={total}
        savings={totalSavings}
        stagedLabel={isStaged ? stagedLabel : undefined}
        paying={paying}
        disabled={isStaged && total <= 0}
        onPay={handlePay}
      />
    </div>
  );
}
