import { useEffect, useState, useCallback, useRef } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Tag, ShieldCheck, BookOpen, ArrowLeft } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";

/* ── Razorpay global type ── */
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
  usePageTitle("Checkout");

  const [offering, setOffering] = useState<Offering | null>(null);
  const [linkedCourses, setLinkedCourses] = useState<LinkedCourse[]>([]);
  const [bumps, setBumps] = useState<(Bump & { offeringDetail?: Offering })[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [loading, setLoading] = useState(true);

  // User selections
  const [selectedBumps, setSelectedBumps] = useState<Set<string>>(new Set());
  const [couponCode, setCouponCode] = useState("");
  // Coupon preview returned by the validate-coupon edge function.
  // We deliberately do NOT reuse Tables<"coupons"> here — the coupons
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

  /* ── Load offering data ── */
  useEffect(() => {
    if (authLoading || !user || !offeringId) return;

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

      setOffering(offRes.data as Offering);
      setLinkedCourses(coursesRes.data ?? []);
      setCustomFields(fieldsRes.data ?? []);

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
  }, [authLoading, user, offeringId, navigate]);

  /* ── Pricing ── */
  const subtotal = (() => {
    if (!offering) return 0;
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

  /* ── Apply coupon ──
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

  /* ── Load Razorpay script ── */
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]'))
      return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onerror = () => toast.error("Failed to load payment gateway. Please refresh the page.");
    document.body.appendChild(script);
  }, []);

  /* ── Pay ── */
  const handlePay = async () => {
    if (!offering || !user) return;
    if (paymentInFlightRef.current) return;
    paymentInFlightRef.current = true;

    // Validate custom fields — mark all as touched so inline errors appear
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
      return;
    }

    setPaying(true);

    try {
      const { data, error } = await supabase.functions.invoke(
        "create-razorpay-order",
        {
          body: {
            offering_id: offeringId,
            coupon_id: appliedCoupon?.id ?? null,
            bump_ids: Array.from(selectedBumps),
            custom_field_values: customFieldValues,
          },
        }
      );

      if (error || !data?.razorpay_order_id) {
        toast.error(data?.error ?? "Failed to create order");
        setPaying(false); paymentInFlightRef.current = false;
        return;
      }

      // Fetch user details for prefill
      const { data: profile } = await supabase
        .from("users")
        .select("full_name, email, phone")
        .eq("id", user.id)
        .single();

      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "LevelUp",
        description: data.offering_title,
        order_id: data.razorpay_order_id,
        prefill: {
          name: profile?.full_name ?? "",
          email: profile?.email ?? user.email ?? "",
          contact: profile?.phone ?? "",
        },
        theme: { color: "#ffffff", backdrop_color: "rgba(0,0,0,0.8)" },
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
          navigate("/home");
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

  /* ── UI ── */
  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!offering) return null;

  const hasMrp =
    (offering as any).mrp_inr &&
    Number((offering as any).mrp_inr) > Number(offering.price_inr);

  return (
    <div className="min-h-screen bg-canvas flex items-start justify-center px-4 py-12 md:py-20">
      <Card className="w-full max-w-[560px] border-border bg-surface">
        <CardContent className="p-6 md:p-8 space-y-6">
          {/* ── Back link ── */}
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

          {/* ── Header ── */}
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              {offering.title}
            </h1>
            {offering.description && (
              <p className="text-sm text-muted-foreground mt-1">
                {offering.description}
              </p>
            )}
          </div>

          <Separator className="bg-border" />

          {/* ── What you get ── */}
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

          {/* ── Custom fields ── */}
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

          {/* ── Bumps ── */}
          {bumps.length > 0 && (
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

          {/* ── Coupon ── */}
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Coupon code
            </p>
            {appliedCoupon ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="gap-1">
                  <Tag className="h-3 w-3" />
                  {appliedCoupon.code}
                </Badge>
                {discount > 0 && (
                  <span className="text-sm font-semibold text-emerald-500">
                    You save ₹{discount.toLocaleString("en-IN")}
                  </span>
                )}
                <button
                  onClick={() => {
                    const extra = discount;
                    if (
                      !window.confirm(
                        `Remove coupon? You'll pay ₹${extra.toLocaleString("en-IN")} more.`
                      )
                    )
                      return;
                    setAppliedCoupon(null);
                    setCouponCode("");
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Remove
                </button>
                <span className="ml-auto text-sm text-accent-emerald font-medium">
                  −₹{discount.toLocaleString("en-IN")}
                </span>
              </div>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    value={couponCode}
                    onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                    placeholder="Have a promo code?"
                    className="bg-surface-2 border-border w-full"
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
                  className="shrink-0"
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

          <Separator className="bg-border" />

          {/* ── Order summary ── */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-foreground font-medium">
                {hasMrp && (
                  <span className="text-muted-foreground line-through mr-2">
                    ₹{Number((offering as any).mrp_inr).toLocaleString("en-IN")}
                  </span>
                )}
                ₹{subtotal.toLocaleString("en-IN")}
              </span>
            </div>
            {discount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span className="text-accent-emerald font-medium">
                  −₹{discount.toLocaleString("en-IN")}
                </span>
              </div>
            )}
            {gstAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  GST ({gstRate}%
                  {offering.gst_mode === "inclusive" ? " incl." : ""})
                </span>
                <span className="text-foreground font-medium">
                  ₹{gstAmount.toLocaleString("en-IN")}
                </span>
              </div>
            )}
            <Separator className="bg-border" />
            <div className="flex justify-between text-base font-semibold">
              <span className="text-foreground">Total</span>
              <span className="text-foreground">
                ₹{total.toLocaleString("en-IN")}
              </span>
            </div>
          </div>

          {/* ── Trust signals ── */}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" />
            7-day refund policy · Secure payment
          </div>

          {/* ── Pay button ── */}
          <Button
            size="xl"
            className="w-full"
            onClick={handlePay}
            disabled={paying || total <= 0}
          >
            {paying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Processing…
              </>
            ) : (
              `Pay ₹${total.toLocaleString("en-IN")}`
            )}
          </Button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            Powered by Razorpay
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
