import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Check,
  Loader2,
  Tag,
  AlertCircle,
  BookOpen,
  ArrowRight,
  Mail,
  Lock,
  X,
} from "lucide-react";

/* ────────────────────────────────────────────────── */
/*  Types                                             */
/* ────────────────────────────────────────────────── */
interface OfferingCourse {
  course_id: string;
  courses: {
    title: string;
    description: string | null;
    thumbnail_url: string | null;
    instructor_display_name: string | null;
  };
}

interface Offering {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  slug: string;
  price_inr: number;
  mrp_inr: number | null;
  gst_mode: string;
  gst_rate: number | null;
  status: string;
  is_public: boolean;
  banner_url: string | null;
  thumbnail_url: string | null;
  instructor_name: string | null;
  instructor_title: string | null;
  instructor_avatar_url: string | null;
  highlights: string[] | null;
  meta_pixel_id: string | null;
  google_ads_conversion: string | null;
  custom_tracking_script: string | null;
  thankyou_thumbnail_url: string | null;
  thankyou_headline: string | null;
  thankyou_body: string | null;
  thankyou_cta_label: string | null;
  thankyou_cta_url: string | null;
  thankyou_auto_redirect: boolean | null;
  thankyou_redirect_seconds: number | null;
  offering_courses: OfferingCourse[];
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/* ────────────────────────────────────────────────── */
/*  Subcomponents                                     */
/* ────────────────────────────────────────────────── */

function HeroBanner({ offering }: { offering: Offering }) {
  const img = offering.banner_url || offering.thumbnail_url;
  return (
    <div className="relative w-full aspect-[21/9] md:aspect-[3/1] rounded-2xl overflow-hidden border border-border bg-[hsl(var(--surface))]">
      {img ? (
        <img src={img} alt={offering.title} className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
          <BookOpen className="h-16 w-16 opacity-30" />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
    </div>
  );
}

function InstructorCard({ offering }: { offering: Offering }) {
  if (!offering.instructor_name) return null;
  return (
    <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-[hsl(var(--surface))]">
      {offering.instructor_avatar_url ? (
        <img
          src={offering.instructor_avatar_url}
          alt={offering.instructor_name}
          className="h-14 w-14 rounded-full object-cover border-2 border-[hsl(var(--cream))]"
        />
      ) : (
        <div className="h-14 w-14 rounded-full bg-[hsl(var(--surface-2))] flex items-center justify-center text-xl font-bold text-[hsl(var(--cream))]">
          {offering.instructor_name.charAt(0)}
        </div>
      )}
      <div>
        <p className="font-semibold text-foreground">{offering.instructor_name}</p>
        {offering.instructor_title && (
          <p className="text-sm text-muted-foreground">{offering.instructor_title}</p>
        )}
      </div>
    </div>
  );
}

function Highlights({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {items.map((h, i) => (
        <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-[hsl(var(--surface))]">
          <Check className="h-5 w-5 mt-0.5 text-[hsl(var(--accent-emerald))] flex-shrink-0" />
          <span className="text-sm text-foreground">{h}</span>
        </div>
      ))}
    </div>
  );
}

function IncludedCourses({ courses }: { courses: OfferingCourse[] }) {
  if (!courses.length) return null;
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-foreground">What's Included</h3>
      <div className="space-y-3">
        {courses.map((oc) => (
          <div key={oc.course_id} className="flex gap-4 p-4 rounded-xl border border-border bg-[hsl(var(--surface))]">
            {oc.courses.thumbnail_url ? (
              <img src={oc.courses.thumbnail_url} alt={oc.courses.title} className="h-16 w-24 rounded-lg object-cover flex-shrink-0" />
            ) : (
              <div className="h-16 w-24 rounded-lg bg-[hsl(var(--surface-2))] flex items-center justify-center flex-shrink-0">
                <BookOpen className="h-6 w-6 text-muted-foreground" />
              </div>
            )}
            <div className="min-w-0">
              <p className="font-medium text-foreground truncate">{oc.courses.title}</p>
              {oc.courses.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{oc.courses.description}</p>
              )}
              {oc.courses.instructor_display_name && (
                <p className="text-xs text-muted-foreground mt-1">by {oc.courses.instructor_display_name}</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  Checkout Card                                     */
/* ────────────────────────────────────────────────── */

function CheckoutCard({
  offering,
  session,
  profile,
  razorpayReady,
  razorpayError,
}: {
  offering: Offering;
  session: any;
  profile: any;
  razorpayReady: boolean;
  razorpayError: boolean;
}) {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [discountInr, setDiscountInr] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [couponLoading, setCouponLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Scenario state: null = not checked yet, A/B/C
  const [scenario, setScenario] = useState<"A" | "B" | "C" | null>(null);
  const [checkingIdentity, setCheckingIdentity] = useState(false);

  // Scenario C inline auth
  const [loginMode, setLoginMode] = useState<"otp" | "password" | null>(null);
  const [password, setPassword] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);

  const price = Number(offering.price_inr);
  const mrp = offering.mrp_inr ? Number(offering.mrp_inr) : null;
  const afterDiscount = Math.max(price - discountInr, 0);
  const isFree = afterDiscount === 0;

  /* ── Phone validation (returns boolean, only sets error when explicitly asked) ── */
  const validatePhone = (val: string, showError = true): boolean => {
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 10) {
      if (showError) setPhoneError("Please enter a valid 10-digit phone number");
      return false;
    }
    setPhoneError("");
    return true;
  };

  /* ── Debounced identity check ──
   *
   * Fires 600ms after the user stops typing, but ONLY when both email
   * and a valid 10-digit phone are present. The CTA button stays visible
   * the entire time — we just show a subtle "Checking..." indicator and
   * disable the button while the lookup is in-flight.
   */
  const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);

  const runIdentityCheck = useCallback(async (email: string, phone: string) => {
    if (!email.trim() || !phone.trim() || session) return;
    if (phone.replace(/\D/g, "").length !== 10) return;

    // Abort any previous in-flight request
    if (lookupAbort.current) lookupAbort.current.abort();
    const controller = new AbortController();
    lookupAbort.current = controller;

    setCheckingIdentity(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-user-exists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          phone: phone.trim(),
          offering_id: offering?.id,
        }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      if (!res.ok) { setCheckingIdentity(false); return; }
      const data = await res.json();
      if (controller.signal.aborted) return;
      setScenario(data.scenario || null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      /* silent — leave scenario as-is, don't block the user */
    } finally {
      if (!controller.signal.aborted) setCheckingIdentity(false);
    }
  }, [session, offering?.id]);

  const scheduleLookup = useCallback((email: string, phone: string) => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    // Only schedule if both fields look complete
    if (!email.trim() || phone.replace(/\D/g, "").length !== 10) return;
    lookupTimer.current = setTimeout(() => runIdentityCheck(email, phone), 600);
  }, [runIdentityCheck]);

  // Cleanup timer and abort controller on unmount
  useEffect(() => () => {
    if (lookupTimer.current) clearTimeout(lookupTimer.current);
    if (lookupAbort.current) lookupAbort.current.abort();
  }, []);

  // Restore coupon state after magic-link redirect (Scenario C)
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem("lu_checkout_coupon");
      if (saved) {
        const { code, discount } = JSON.parse(saved);
        if (code && discount) {
          setCouponCode(code);
          setDiscountInr(Number(discount));
          setCouponApplied(true);
        }
        sessionStorage.removeItem("lu_checkout_coupon");
      }
    } catch { /* ignore parse errors */ }
  }, []);

  // Change handlers — reset scenario and schedule a fresh lookup
  const handleEmailChange = (v: string) => {
    setGuestEmail(v);
    setScenario(null);
    setLoginMode(null);
    setOtpSent(false);
    scheduleLookup(v, guestPhone);
  };
  const handlePhoneChange = (v: string) => {
    // Normalize: strip country code if user pastes +91… or 91…
    let digits = v.replace(/\D/g, "");
    if (digits.length > 10 && digits.startsWith("91")) {
      digits = digits.slice(2);
    }
    digits = digits.slice(0, 10);
    setGuestPhone(digits);
    setPhoneError("");
    setScenario(null);
    setLoginMode(null);
    setOtpSent(false);
    scheduleLookup(guestEmail, digits);
  };

  /* ── Coupon apply ──
   *
   * Guests no longer have SELECT on the coupons table (see
   * coupons_read_lockdown migration). Validation now goes through the
   * validate-coupon edge function which runs with service-role privileges
   * and only returns the discount preview — never used_count /
   * max_redemptions or any other sensitive row data.
   */
  const handleApplyCoupon = async () => {
    if (!couponCode.trim() || !offering) return;
    setCouponLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("validate-coupon", {
        body: {
          coupon_code: couponCode.toUpperCase().trim(),
          offering_id: offering.id,
        },
      });

      if (error || !data?.valid) {
        toast({
          title: data?.error || "Invalid coupon",
          variant: "destructive",
        });
        setCouponLoading(false);
        return;
      }

      setDiscountInr(Number(data.discount_inr) || 0);
      setCouponApplied(true);
      toast({ title: "Coupon applied!" });
    } catch {
      toast({ title: "Error applying coupon", variant: "destructive" });
    } finally {
      setCouponLoading(false);
    }
  };

  /* ── Coupon remove ── */
  const handleRemoveCoupon = () => {
    setCouponApplied(false);
    setCouponCode("");
    setDiscountInr(0);
  };

  /* ── Scenario C: Send magic link ── */
  const handleSendMagicLink = async () => {
    setLoginLoading(true);
    // Preserve checkout state so it survives the magic-link redirect
    if (couponApplied && couponCode) {
      try {
        sessionStorage.setItem(
          "lu_checkout_coupon",
          JSON.stringify({ code: couponCode, discount: discountInr }),
        );
      } catch { /* storage full — non-critical */ }
    }
    const { error } = await supabase.auth.signInWithOtp({
      email: guestEmail.trim(),
      options: { emailRedirectTo: window.location.href },
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOtpSent(true);
      toast({ title: "Check your email!", description: "Click the link to sign in." });
    }
    setLoginLoading(false);
  };

  /* ── Scenario C: Password login ── */
  const handlePasswordLogin = async () => {
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: guestEmail.trim(),
      password,
    });
    if (error) {
      toast({ title: "Login failed", description: error.message, variant: "destructive" });
    }
    setLoginLoading(false);
  };

  /* ── Scenario C: Forgot password ── */
  const handleForgotPassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(guestEmail.trim(), {
      redirectTo: window.location.href,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Password reset email sent", description: "Check your email." });
    }
  };

  /* ── Pay: authenticated ── */
  const handleAuthPay = async () => {
    if (!session || isProcessing) return;
    setIsProcessing(true);
    setLoading(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ offering_id: offering.id }),
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const data = await res.json();
      openRazorpay(data, false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
      setIsProcessing(false);
    }
  };

  /* ── Pay: guest (scenarios A & B) ── */
  const handleGuestPay = async () => {
    if (isProcessing) return;
    if (!guestName.trim()) {
      toast({ title: "Please enter your name", variant: "destructive" });
      return;
    }
    if (!guestEmail.trim() || !guestPhone.trim()) {
      toast({ title: "Please fill all fields", variant: "destructive" });
      return;
    }
    if (!validatePhone(guestPhone)) return;
    setIsProcessing(true);
    setLoading(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const res = await fetch(`${SUPABASE_URL}/functions/v1/guest-create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offering_id: offering.id,
          guest_name: guestName.trim(),
          guest_email: guestEmail.trim(),
          guest_phone: guestPhone.trim(),
          coupon_code: couponApplied ? couponCode.toUpperCase().trim() : undefined,
          utm_source: params.get("utm_source") || undefined,
          utm_medium: params.get("utm_medium") || undefined,
          utm_campaign: params.get("utm_campaign") || undefined,
          utm_content: params.get("utm_content") || undefined,
          utm_term: params.get("utm_term") || undefined,
        }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(errBody || `HTTP ${res.status}`);
      }
      const data = await res.json();

      // Free offering: backend returns success directly
      if (data.success && data.payment_order_id) {
        navigate(`/thank-you/${data.payment_order_id}`, {
          state: {
            fromPayment: true,
            orderData: {
              id: data.payment_order_id,
              offering_id: offering.id,
              total_inr: 0,
              status: "captured",
              razorpay_payment_id: null,
              guest_email: guestEmail || null,
              guest_name: guestName || null,
              guest_phone: guestPhone || null,
              user_id: session?.user?.id || null,
              offerings: {
                title: offering.title,
                subtitle: offering.subtitle || null,
                thumbnail_url: offering.thumbnail_url || null,
                meta_pixel_id: offering.meta_pixel_id || null,
                google_ads_conversion: offering.google_ads_conversion || null,
                custom_tracking_script: offering.custom_tracking_script || null,
                thankyou_thumbnail_url: offering.thankyou_thumbnail_url || null,
                thankyou_headline: offering.thankyou_headline || null,
                thankyou_body: offering.thankyou_body || null,
                thankyou_cta_label: offering.thankyou_cta_label || null,
                thankyou_cta_url: offering.thankyou_cta_url || null,
                thankyou_auto_redirect: offering.thankyou_auto_redirect ?? true,
                thankyou_redirect_seconds: offering.thankyou_redirect_seconds ?? 10,
              },
            },
            magicLinkToken: data.magic_link_token || null,
            guestEmail: guestEmail || null,
          },
        });
        return;
      }

      openRazorpay(data, true);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setLoading(false);
      setIsProcessing(false);
    }
  };

  /* ── Razorpay modal ── */
  const openRazorpay = (data: any, isGuest: boolean) => {
    if (!(window as any).Razorpay) {
      toast({ title: "Payment unavailable", description: "Please try again in a moment.", variant: "destructive" });
      setLoading(false);
      setIsProcessing(false);
      return;
    }

    const options = {
      key: data.key_id,
      amount: data.amount,
      currency: data.currency,
      name: "LevelUp Learning",
      description: offering.title,
      order_id: data.razorpay_order_id,
      handler: async (response: any) => {
        try {
          const headers: Record<string, string> = { "Content-Type": "application/json" };
          if (!isGuest && session) {
            headers.Authorization = `Bearer ${session.access_token}`;
          }
          const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
            method: "POST",
            headers,
            body: JSON.stringify({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
              payment_order_id: data.payment_order_id,
              is_guest: isGuest,
            }),
          });

          if (!verifyRes.ok) {
            let errMsg = `HTTP ${verifyRes.status}`;
            try {
              const errBody = await verifyRes.json();
              errMsg = errBody.error || errMsg;
            } catch {
              try {
                errMsg = (await verifyRes.text()) || errMsg;
              } catch {}
            }
            if (import.meta.env.DEV) console.error("[PublicOffering] Verification failed:", verifyRes.status, errMsg);
            throw new Error(errMsg);
          }

          const verifyData = await verifyRes.json();
          if (verifyData.success) {
            navigate(`/thank-you/${data.payment_order_id}`, {
              state: {
                fromPayment: true,
                orderData: {
                  id: data.payment_order_id,
                  offering_id: offering.id,
                  total_inr: afterDiscount,
                  status: "captured",
                  razorpay_payment_id: response.razorpay_payment_id,
                  guest_email: isGuest ? guestEmail : null,
                  guest_name: isGuest ? guestName : null,
                  guest_phone: isGuest ? guestPhone : null,
                  user_id: session?.user?.id || null,
                  offerings: {
                    title: offering.title,
                    subtitle: offering.subtitle || null,
                    thumbnail_url: offering.thumbnail_url || null,
                    meta_pixel_id: offering.meta_pixel_id || null,
                    google_ads_conversion: offering.google_ads_conversion || null,
                    custom_tracking_script: offering.custom_tracking_script || null,
                    thankyou_thumbnail_url: offering.thankyou_thumbnail_url || null,
                    thankyou_headline: offering.thankyou_headline || null,
                    thankyou_body: offering.thankyou_body || null,
                    thankyou_cta_label: offering.thankyou_cta_label || null,
                    thankyou_cta_url: offering.thankyou_cta_url || null,
                    thankyou_auto_redirect: offering.thankyou_auto_redirect ?? true,
                    thankyou_redirect_seconds: offering.thankyou_redirect_seconds ?? 10,
                  },
                },
                magicLinkToken: verifyData.magic_link_token || null,
                guestEmail: isGuest ? guestEmail : null,
              },
            });
          } else {
            if (import.meta.env.DEV) console.error("[PublicOffering] Verification returned success=false:", verifyData);
            toast({ title: "Verification failed", description: verifyData.error || "Please contact support.", variant: "destructive" });
          }
        } catch (err: any) {
          if (import.meta.env.DEV) console.error("[PublicOffering] Verification error:", err);
          toast({
            title: "Verification error",
            description: err.message && err.message !== "Payment verification failed" ? err.message : "Please contact support.",
            variant: "destructive"
          });
        }
        setLoading(false);
        setIsProcessing(false);
      },
      prefill: {
        name: session ? profile?.full_name : guestName,
        email: session ? profile?.email : guestEmail,
        contact: session ? "" : guestPhone,
      },
      theme: { color: "#F5F1E8" },
    };

    const rzp = new (window as any).Razorpay(options);
    rzp.on("payment.failed", () => {
      toast({ title: "Payment failed", description: "Please try again.", variant: "destructive" });
      setLoading(false);
      setIsProcessing(false);
    });
    rzp.open();
  };

  /* ── Determine if pay button should show ──
   *
   * The button is ALWAYS visible once the guest has filled name+email+phone.
   * It is disabled (not hidden) while we check identity or if scenario is C.
   * This prevents the jarring "disappearing CTA" that confused users.
   */
  const guestFormFilled = !!(guestName.trim() && guestEmail.trim() && guestPhone.trim());
  const phoneIsValid = guestPhone.replace(/\D/g, "").length === 10;
  const canPay = session || guestFormFilled;
  const payDisabled = loading || isProcessing || razorpayError || (!isFree && !razorpayReady) || checkingIdentity || (guestFormFilled && !phoneIsValid);
  const isAuthenticated = !!session;

  /* ── Button label ── */
  const payButtonLabel = isFree
    ? "Start Learning \u2014 Free"
    : `Enrol Now \u2014 Full Access \u00b7 \u20b9${afterDiscount.toLocaleString("en-IN")}`;

  /* ── Render ── */
  return (
    <div id="checkout-card" className="rounded-2xl border border-border bg-[hsl(var(--surface))] p-6 space-y-5">
      {/* Price */}
      <div>
        <div className="flex items-baseline gap-3">
          <span className="text-3xl font-bold text-[hsl(var(--cream))]">
            {isFree ? "Free" : `₹${afterDiscount.toLocaleString("en-IN")}`}
          </span>
          {mrp && mrp > price && !isFree && (
            <span className="text-lg text-muted-foreground line-through">
              ₹{mrp.toLocaleString("en-IN")}
            </span>
          )}
        </div>
        {discountInr > 0 && (
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-[hsl(var(--accent-emerald))]">
              You save ₹{discountInr.toLocaleString("en-IN")}!
            </p>
            <button
              onClick={handleRemoveCoupon}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-0.5"
            >
              <X className="h-3 w-3" /> Remove
            </button>
          </div>
        )}
      </div>

      <Separator className="bg-border" />

      {/* Coupon */}
      {!isFree && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Coupon code"
              value={couponCode}
              onChange={(e) => setCouponCode(e.target.value)}
              className="pl-9 bg-[hsl(var(--surface-2))] border-border"
              disabled={couponApplied}
            />
          </div>
          <Button
            variant="outline"
            onClick={handleApplyCoupon}
            disabled={couponLoading || couponApplied}
            className="border-border"
          >
            {couponLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : couponApplied ? "Applied" : "Apply"}
          </Button>
        </div>
      )}

      <Separator className="bg-border" />

      {/* If user is already authenticated (e.g. after Scenario C login) */}
      {isAuthenticated ? (
        <div className="space-y-4">
          <p className="text-sm text-[hsl(var(--accent-emerald))] flex items-center gap-1.5">
            <Check className="h-4 w-4" />
            Welcome back, {profile?.full_name || profile?.email}!
          </p>
          <Button
            onClick={handleAuthPay}
            disabled={loading || isProcessing || razorpayError || (!isFree && !razorpayReady)}
            className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 h-12 text-base font-semibold"
          >
            {isProcessing ? (
              <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
            ) : (
              <>{payButtonLabel} <ArrowRight className="h-4 w-4 ml-2" /></>
            )}
          </Button>
          {!isFree && (
            <p className="text-xs text-muted-foreground/70 text-center">
              7-day refund policy. No questions asked.
            </p>
          )}
        </div>
      ) : (
        /* Guest form — always show name/email/phone */
        <div className="space-y-3">
          <Input
            placeholder="Full name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            className="bg-[hsl(var(--surface-2))] border-border"
            required
          />
          <Input
            type="email"
            placeholder="Email address"
            value={guestEmail}
            onChange={(e) => handleEmailChange(e.target.value)}
            className="bg-[hsl(var(--surface-2))] border-border"
          />
          <div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">+91</span>
              <Input
                type="tel"
                inputMode="numeric"
                pattern="[0-9]*"
                placeholder="Phone number"
                value={guestPhone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="pl-12 bg-[hsl(var(--surface-2))] border-border"
              />
            </div>
            {phoneError && (
              <p className="text-xs text-destructive mt-1">{phoneError}</p>
            )}
          </div>

          {/* Identity check loading */}
          {checkingIdentity && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" /> Checking...
            </p>
          )}

          {/* Scenario A/C: Existing account detected — soft info banner, does NOT block checkout */}
          {(scenario === "A" || scenario === "C") && !checkingIdentity && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--accent-amber)/0.1)] border border-[hsl(var(--accent-amber)/0.2)]">
              <AlertCircle className="h-4 w-4 text-[hsl(var(--accent-amber))] mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">
                This email is linked to an existing account.{" "}
                <a href="/login" className="font-semibold text-[hsl(var(--cream))] hover:underline">Sign in</a>{" "}
                for the best experience, or continue as guest.
              </p>
            </div>
          )}

          {/* Pay button — always visible once form is filled */}
          {canPay && (
            <>
              <Button
                onClick={handleGuestPay}
                disabled={payDisabled}
                className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 h-12 text-base font-semibold disabled:opacity-50"
              >
                {isProcessing ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
                ) : checkingIdentity ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Verifying...</>
                ) : (
                  <>{payButtonLabel} <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {isFree
                  ? "No payment required. We'll create your account automatically."
                  : "Secure payment via Razorpay. We'll create your account automatically."}
              </p>
              {!isFree && (
                <p className="text-xs text-muted-foreground/70 text-center">
                  7-day refund policy. No questions asked.
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
/* ────────────────────────────────────────────────── */
/*  Main Page                                         */
/* ────────────────────────────────────────────────── */

export default function PublicOffering() {
  const { slug } = useParams<{ slug: string }>();
  const { session, profile } = useAuth();
  const [offering, setOffering] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [razorpayReady, setRazorpayReady] = useState(false);
  const [razorpayError, setRazorpayError] = useState(false);

  usePageTitle(offering?.title || "LevelUp Learning");

  /* ── Load Razorpay script with error/timeout ── */
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) {
      setRazorpayReady(true);
      return;
    }
    let scriptLoaded = false;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      setRazorpayReady(true);
    };
    script.onerror = () => setRazorpayError(true);
    document.body.appendChild(script);

    const timeout = setTimeout(() => {
      if (!scriptLoaded) setRazorpayError(true);
    }, 10000);

    return () => clearTimeout(timeout);
  }, []);

  /* ── Fetch offering ── */
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const { data, error } = await supabase
          .from("offerings")
          .select("*, offering_courses(course_id, courses(title, description, thumbnail_url, instructor_display_name))")
          .eq("slug", slug)
          .eq("status", "active")
          .single();

        if (error || !data) {
          setNotFound(true);
        } else {
          setOffering(data as any);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [slug]);

  /* ── Loading / 404 ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--cream))]" />
      </div>
    );
  }

  if (notFound || !offering) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Offering not found</h1>
        <p className="text-muted-foreground text-sm">This page doesn't exist or is no longer available.</p>
        <Link to="/" className="inline-flex items-center gap-2 mt-4 text-sm text-cream hover:underline">
          ← Browse programs
        </Link>
      </div>
    );
  }

  const highlights: string[] = Array.isArray(offering.highlights) ? offering.highlights : [];
  const isFree = Number(offering.price_inr) === 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Razorpay load error banner */}
      {razorpayError && !isFree && (
        <div className="bg-[hsl(var(--accent-amber)/0.15)] border-b border-[hsl(var(--accent-amber)/0.3)] px-4 py-3 text-center">
          <p className="text-sm text-foreground">
            <AlertCircle className="h-4 w-4 inline mr-1.5 text-[hsl(var(--accent-amber))]" />
            Payment system is temporarily unavailable. Please refresh the page or try again later.
          </p>
        </div>
      )}

      {/* Top bar */}
      <header className="border-b border-border bg-[hsl(var(--surface))]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-bold text-[hsl(var(--cream))] font-['Instrument_Serif'] italic">
            LevelUp
          </span>
          {!session && (
            <a href="/login" className="text-sm text-muted-foreground hover:text-foreground">
              Sign in
            </a>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Desktop: two-col, Mobile: stacked */}
        <div className="lg:flex lg:gap-8">
          {/* Left: product details */}
          <div className="lg:w-[60%] space-y-8">
            <HeroBanner offering={offering} />

            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-foreground leading-tight">
                {offering.title}
              </h1>
              {offering.subtitle && (
                <p className="mt-2 text-lg text-muted-foreground font-['Instrument_Serif'] italic">
                  {offering.subtitle}
                </p>
              )}
            </div>

            <InstructorCard offering={offering} />

            {highlights.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">Program Highlights</h3>
                <Highlights items={highlights} />
              </div>
            )}

            {offering.description && (
              <div className="space-y-3">
                <h3 className="text-lg font-semibold text-foreground">About This Program</h3>
                <p className="text-muted-foreground whitespace-pre-line leading-relaxed">
                  {offering.description}
                </p>
              </div>
            )}

            <IncludedCourses courses={offering.offering_courses || []} />
          </div>

          {/* Right: sticky checkout — desktop */}
          <div className="hidden lg:block lg:w-[40%]">
            <div className="sticky top-8">
              <CheckoutCard offering={offering} session={session} profile={profile} razorpayReady={razorpayReady} razorpayError={razorpayError} />
            </div>
          </div>

          {/* Mobile: checkout below */}
          <div id="checkout-section" className="lg:hidden mt-8">
            <CheckoutCard offering={offering} session={session} profile={profile} razorpayReady={razorpayReady} razorpayError={razorpayError} />
          </div>
        </div>
      </main>

      {/* Mobile sticky CTA */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-50 border-t border-border bg-[hsl(var(--surface))] p-4">
        <div className="flex items-center justify-between">
          <div>
            {isFree ? (
              <span className="text-xl font-bold text-[hsl(var(--accent-emerald))]">Free</span>
            ) : (
              <>
                <span className="text-xl font-bold text-[hsl(var(--cream))]">
                  ₹{Number(offering.price_inr).toLocaleString("en-IN")}
                </span>
                {offering.mrp_inr && Number(offering.mrp_inr) > Number(offering.price_inr) && (
                  <span className="text-sm text-muted-foreground line-through ml-2">
                    ₹{Number(offering.mrp_inr).toLocaleString("en-IN")}
                  </span>
                )}
              </>
            )}
          </div>
          <Button
            onClick={() => document.getElementById("checkout-section")?.scrollIntoView({ behavior: "smooth" })}
            className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 font-semibold"
          >
            {isFree ? "Start Learning \u2014 Free" : "Enrol Now \u2014 Full Access"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
