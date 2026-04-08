import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
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

  /* ── Phone validation ── */
  const validatePhone = (val: string): boolean => {
    const digits = val.replace(/\D/g, "");
    if (digits.length !== 10) {
      setPhoneError("Please enter a valid 10-digit phone number");
      return false;
    }
    setPhoneError("");
    return true;
  };

  /* ── Phone blur: check identity (only when both email + phone filled) ── */
  const handlePhoneBlur = useCallback(async () => {
    if (!guestEmail.trim() || !guestPhone.trim() || session) return;
    if (!validatePhone(guestPhone)) return;
    setCheckingIdentity(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/check-user-exists`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: guestEmail.trim(), phone: guestPhone.trim() }),
      });
      if (!res.ok) { setCheckingIdentity(false); return; }
      const data = await res.json();
      setScenario(data.scenario || null);
    } catch {
      /* silent */
    } finally {
      setCheckingIdentity(false);
    }
  }, [guestEmail, guestPhone, session]);

  // Reset scenario when email/phone change
  const handleEmailChange = (v: string) => {
    setGuestEmail(v);
    setScenario(null);
    setLoginMode(null);
    setOtpSent(false);
  };
  const handlePhoneChange = (v: string) => {
    setGuestPhone(v);
    setPhoneError("");
    setScenario(null);
    setLoginMode(null);
    setOtpSent(false);
  };

  /* ── Coupon apply ── */
  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setCouponLoading(true);
    try {
      const { data: coupon } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", couponCode.toUpperCase().trim())
        .eq("is_active", true)
        .maybeSingle();

      if (!coupon) {
        toast({ title: "Invalid coupon", variant: "destructive" });
        setCouponLoading(false);
        return;
      }

      const now = new Date();
      const validFrom = coupon.valid_from ? new Date(coupon.valid_from) : null;
      const validUntil = coupon.valid_until ? new Date(coupon.valid_until) : null;
      const withinDates = (!validFrom || now >= validFrom) && (!validUntil || now <= validUntil);
      const underMax = !coupon.max_redemptions || coupon.used_count < coupon.max_redemptions;
      const appliesToThis = !coupon.applies_to_offering_id || coupon.applies_to_offering_id === offering.id;

      if (!withinDates || !underMax || !appliesToThis) {
        toast({ title: "Coupon not valid for this offering", variant: "destructive" });
        setCouponLoading(false);
        return;
      }

      let disc = 0;
      if (coupon.discount_type === "percent") {
        disc = Math.round((price * Number(coupon.discount_value)) / 100);
      } else {
        disc = Math.min(Number(coupon.discount_value), price);
      }
      setDiscountInr(disc);
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
    const { error } = await supabase.auth.signInWithOtp({ email: guestEmail.trim() });
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
    const { error } = await supabase.auth.resetPasswordForEmail(guestEmail.trim());
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
                meta_pixel_id: null,
                google_ads_conversion: null,
                custom_tracking_script: null,
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
            console.error("[PublicOffering] Verification failed:", verifyRes.status, errMsg);
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
                  },
                },
                magicLinkToken: verifyData.magic_link_token || null,
                guestEmail: isGuest ? guestEmail : null,
              },
            });
          } else {
            console.error("[PublicOffering] Verification returned success=false:", verifyData);
            toast({ title: "Verification failed", description: verifyData.error || "Please contact support.", variant: "destructive" });
          }
        } catch (err: any) {
          console.error("[PublicOffering] Verification error:", err);
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

  /* ── Determine if pay button should show ── */
  const canPay = session || (scenario !== "C" && !(guestEmail.trim() && guestPhone.trim() && scenario === null && !checkingIdentity));
  const isAuthenticated = !!session;

  /* ── Button label ── */
  const payButtonLabel = isFree
    ? "Enrol for Free"
    : `Pay ₹${afterDiscount.toLocaleString("en-IN")}`;

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
                onBlur={handlePhoneBlur}
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

          {/* Scenario A: Welcome back */}
          {scenario === "A" && !checkingIdentity && (
            <p className="text-sm text-[hsl(var(--accent-emerald))] flex items-center gap-1.5">
              <Check className="h-4 w-4" /> Welcome back!
            </p>
          )}

          {/* Scenario C: Mismatch — block payment */}
          {scenario === "C" && !checkingIdentity && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-[hsl(var(--accent-amber)/0.1)] border border-[hsl(var(--accent-amber)/0.2)]">
                <AlertCircle className="h-4 w-4 text-[hsl(var(--accent-amber))] mt-0.5 flex-shrink-0" />
                <p className="text-sm text-foreground">
                  This email or phone number is already linked to an existing account. Please verify your identity to continue.
                </p>
              </div>

              {otpSent ? (
                <p className="text-sm text-center text-muted-foreground">
                  Check your email! Click the link to sign in, then this page will update automatically.
                </p>
              ) : loginMode === "password" ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="password"
                      placeholder="Your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="pl-9 bg-[hsl(var(--surface-2))] border-border"
                    />
                  </div>
                  <Button
                    onClick={handlePasswordLogin}
                    disabled={loginLoading}
                    className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
                  >
                    {loginLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in & continue"}
                  </Button>
                  <div className="flex items-center justify-between">
                    <button
                      onClick={handleForgotPassword}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Forgot password?
                    </button>
                    <button
                      onClick={() => { setLoginMode(null); }}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Back
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button
                    onClick={() => { setLoginMode("otp"); handleSendMagicLink(); }}
                    disabled={loginLoading}
                    variant="outline"
                    className="w-full border-border"
                  >
                    <Mail className="h-4 w-4 mr-2" /> Send me a login link
                  </Button>
                  <Button
                    onClick={() => setLoginMode("password")}
                    variant="ghost"
                    className="w-full text-muted-foreground hover:text-foreground"
                  >
                    <Lock className="h-4 w-4 mr-2" /> Sign in with password
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Pay button — hidden in Scenario C */}
          {canPay && (
            <>
              <Button
                onClick={handleGuestPay}
                disabled={loading || isProcessing || razorpayError || (!isFree && !razorpayReady)}
                className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 h-12 text-base font-semibold"
              >
                {isProcessing ? (
                  <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Processing...</>
                ) : (
                  <>{payButtonLabel} <ArrowRight className="h-4 w-4 ml-2" /></>
                )}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                {isFree
                  ? "No payment required. We'll create your account automatically."
                  : "Secure payment via Razorpay. We'll create your account automatically."}
              </p>
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
          <div className="lg:hidden mt-8">
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
            onClick={() => document.getElementById("checkout-card")?.scrollIntoView({ behavior: "smooth" })}
            className="bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 font-semibold"
          >
            {isFree ? "Enrol Free" : "Buy Now"} <ArrowRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}
