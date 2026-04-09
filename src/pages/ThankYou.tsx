import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  CheckCircle2,
  Loader2,
  ArrowRight,
  Mail,
  AlertCircle,
  ShoppingBag,
} from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

/** Only allow relative paths or same-origin URLs to prevent open-redirect phishing */
function isSafeRedirectUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/* ────────────────────────────────────────────────── */
/*  Types                                             */
/* ────────────────────────────────────────────────── */
interface OrderOffering {
  title: string;
  subtitle: string | null;
  thumbnail_url: string | null;
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
}

interface PaymentOrder {
  id: string;
  offering_id: string;
  total_inr: number;
  status: string;
  razorpay_payment_id: string | null;
  guest_email: string | null;
  guest_name: string | null;
  guest_phone: string | null;
  offerings: OrderOffering;
}

interface UpsellOffering {
  id: string;
  title: string;
  subtitle: string | null;
  price_inr: number;
  mrp_inr: number | null;
  thumbnail_url: string | null;
  slug: string;
}

interface Upsell {
  id: string;
  headline: string;
  description: string | null;
  sort_order: number;
  upsell_offering: UpsellOffering;
}

/* ────────────────────────────────────────────────── */
/*  Pixel Firing                                      */
/* ────────────────────────────────────────────────── */
function firePixels(order: PaymentOrder) {
  const revenue = Number(order.total_inr);
  const currency = "INR";
  const offering = order.offerings;

  // 1. Meta Pixel — sanitize pixelId to numeric only
  if (offering?.meta_pixel_id) {
    const pixelId = offering.meta_pixel_id.replace(/[^0-9]/g, "");
    if (pixelId.length > 0) {
      const script = document.createElement("script");
      script.innerHTML = `
        !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
        n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}
        (window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'Purchase', { value: ${revenue}, currency: '${currency}' });
      `;
      document.head.appendChild(script);
    }
  }

  // 2. Google Ads Conversion — sanitize conversion string
  if (offering?.google_ads_conversion) {
    const conversionStr = offering.google_ads_conversion.replace(/[^a-zA-Z0-9_\-\/]/g, "");
    if (conversionStr.length > 0) {
      const [conversionId] = conversionStr.split("/");
      const gtagScript = document.createElement("script");
      gtagScript.src = `https://www.googletagmanager.com/gtag/js?id=${conversionId}`;
      gtagScript.async = true;
      document.head.appendChild(gtagScript);

      const inlineScript = document.createElement("script");
      inlineScript.innerHTML = `
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', '${conversionId}');
        gtag('event', 'conversion', {
          'send_to': '${conversionStr}',
          'value': ${revenue},
          'currency': '${currency}',
          'transaction_id': '${(order.razorpay_payment_id || "").replace(/[^a-zA-Z0-9_\-]/g, "")}'
        });
      `;
      document.head.appendChild(inlineScript);
    }
  }

  // 3. Custom tracking script — render inside a sandboxed iframe so any
  // remaining XSS in the admin-supplied snippet cannot read cookies, the
  // current session, localStorage, or DOM of the parent ThankYou page.
  //
  // Previously this used innerHTML on a div in the parent document with a
  // regex sanitiser that stripped <script>, on*= and javascript:. Regex
  // sanitisers for HTML are notoriously bypassable (e.g. <img src=x
  // onerror​=...> with zero-width chars, <svg/onload>, mutation XSS), and
  // anything that did slip through ran in the same origin as the user's
  // logged-in session and could exfiltrate the auth token.
  //
  // The sandbox attribute with no allow-* tokens gives the iframe a
  // unique origin with no script execution, no top navigation, no form
  // submission, and no same-origin DOM access. We *do* re-add
  // allow-scripts because the whole point is to fire pixel/tracking
  // scripts — but without allow-same-origin those scripts cannot reach
  // back into the parent or read its cookies.
  if (offering?.custom_tracking_script) {
    const safeTxId = (order.razorpay_payment_id || "").replace(/[^a-zA-Z0-9_\-]/g, "");
    const safeOrderId = order.id.replace(/[^a-zA-Z0-9\-]/g, "");
    const interpolated = offering.custom_tracking_script
      .replace(/\{\{value\}\}/g, String(revenue))
      .replace(/\{\{currency\}\}/g, currency)
      .replace(/\{\{transaction_id\}\}/g, safeTxId)
      .replace(/\{\{order_id\}\}/g, safeOrderId);

    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("title", "tracking");
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.position = "absolute";
    iframe.style.left = "-9999px";
    iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"></head><body>${interpolated}</body></html>`;
    document.body.appendChild(iframe);
  }
}

/* ────────────────────────────────────────────────── */
/*  Upsell Card                                       */
/* ────────────────────────────────────────────────── */
function UpsellCard({
  upsell,
  onBuy,
  purchased,
  buying,
}: {
  upsell: Upsell;
  onBuy: () => void;
  purchased: boolean;
  buying: boolean;
}) {
  const off = upsell.upsell_offering;
  const price = Number(off.price_inr);
  const mrp = off.mrp_inr ? Number(off.mrp_inr) : null;

  return (
    <div className="rounded-xl border border-border bg-[hsl(var(--surface))] overflow-hidden flex flex-col">
      {off.thumbnail_url ? (
        <img src={off.thumbnail_url} alt={off.title} className="w-full h-36 object-cover" />
      ) : (
        <div className="w-full h-36 bg-[hsl(var(--surface-2))] flex items-center justify-center">
          <ShoppingBag className="h-8 w-8 text-muted-foreground opacity-40" />
        </div>
      )}
      <div className="p-4 flex flex-col flex-1">
        <h4 className="font-semibold text-foreground text-sm">{off.title}</h4>
        {off.subtitle && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{off.subtitle}</p>}
        {upsell.description && <p className="text-xs text-muted-foreground mt-1">{upsell.description}</p>}
        <div className="mt-auto pt-3">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-lg font-bold text-[hsl(var(--cream))]">₹{price.toLocaleString("en-IN")}</span>
            {mrp && mrp > price && (
              <span className="text-xs text-muted-foreground line-through">₹{mrp.toLocaleString("en-IN")}</span>
            )}
          </div>
          {purchased ? (
            <div className="flex items-center gap-2 text-[hsl(var(--accent-emerald))] text-sm font-medium">
              <CheckCircle2 className="h-4 w-4" /> Added
            </div>
          ) : (
            <Button
              onClick={onBuy}
              disabled={buying}
              size="sm"
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90 text-sm"
            >
              {buying ? <Loader2 className="h-4 w-4 animate-spin" /> : (
                <>Add for ₹{price.toLocaleString("en-IN")} <ArrowRight className="h-3 w-3 ml-1" /></>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────── */
/*  Main Page                                         */
/* ────────────────────────────────────────────────── */
export default function ThankYou() {
  const { paymentOrderId } = useParams<{ paymentOrderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { session } = useAuth();
  const { toast } = useToast();

  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [originalGuestEmail, setOriginalGuestEmail] = useState<string | null>(null);
  const [upsells, setUpsells] = useState<Upsell[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [countdown, setCountdown] = useState(10);
  const [purchasedUpsells, setPurchasedUpsells] = useState<Set<string>>(new Set());
  const [buyingUpsell, setBuyingUpsell] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);

  const pixelsFired = useRef(false);

  usePageTitle("Payment Successful — LevelUp Learning");

  const isGuest = !session && order?.guest_email !== null && order?.guest_email !== undefined;

  /* ── Load Razorpay script (for upsells) ── */
  useEffect(() => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]')) return;
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    document.body.appendChild(s);
  }, []);

  /* ── Fetch order + upsells ── */
  useEffect(() => {
    if (!paymentOrderId) return;
    (async () => {
      try {
        // Priority 1: Use data passed from PublicOffering via navigate state
        const navState = location.state as any;
        if (navState?.fromPayment && navState?.orderData) {
          const stateOrder = navState.orderData;
          setOriginalGuestEmail(stateOrder.guest_email);
          setOrder(stateOrder as any);

          // Fetch upsells
          const { data: upsellData } = await supabase
            .from("offering_upsells")
            .select("id, headline, description, sort_order, upsell_offering:offerings!upsell_offering_id(id, title, subtitle, price_inr, mrp_inr, thumbnail_url, slug)")
            .eq("parent_offering_id", stateOrder.offering_id)
            .eq("is_active", true)
            .order("sort_order", { ascending: true });

          if (upsellData) setUpsells(upsellData as any);
          setLoading(false);
          return;
        }

        // Priority 2: Query database (works for logged-in users only)
        const { data: orderData, error } = await supabase
          .from("payment_orders")
          .select("id, offering_id, total_inr, status, razorpay_payment_id, guest_email, guest_name, guest_phone, user_id, offerings(title, subtitle, thumbnail_url, meta_pixel_id, google_ads_conversion, custom_tracking_script, thankyou_thumbnail_url, thankyou_headline, thankyou_body, thankyou_cta_label, thankyou_cta_url, thankyou_auto_redirect, thankyou_redirect_seconds)")
          .eq("id", paymentOrderId)
          .eq("status", "captured")
          .single();

        if (error || !orderData) {
          setNotFound(true);
          return;
        }

        if (session) {
          if (orderData.user_id && orderData.user_id !== session.user.id) {
            setNotFound(true);
            return;
          }
        } else {
          setOriginalGuestEmail(orderData.guest_email);
        }

        setOrder(orderData as any);

        const { data: upsellData } = await supabase
          .from("offering_upsells")
          .select("id, headline, description, sort_order, upsell_offering:offerings!upsell_offering_id(id, title, subtitle, price_inr, mrp_inr, thumbnail_url, slug)")
          .eq("parent_offering_id", orderData.offering_id)
          .eq("is_active", true)
          .order("sort_order", { ascending: true });

        if (upsellData) setUpsells(upsellData as any);
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [paymentOrderId, session, location.state]);

  /* ── Fire pixels once ── */
  useEffect(() => {
    if (!order || pixelsFired.current) return;
    pixelsFired.current = true;
    firePixels(order);
  }, [order]);

  /* ── Countdown — respects custom thank you page settings ── */
  const autoRedirect = order?.offerings?.thankyou_auto_redirect ?? true;
  const redirectSeconds = order?.offerings?.thankyou_redirect_seconds ?? 10;
  const customCtaUrl = order?.offerings?.thankyou_cta_url || null;

  useEffect(() => {
    if (!order) return;
    if (!autoRedirect || redirectSeconds <= 0) return;

    setCountdown(redirectSeconds);
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          if (session) {
            if (isSafeRedirectUrl(customCtaUrl)) {
              window.location.href = customCtaUrl!;
            } else {
              navigate("/home");
            }
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [order, session, navigate, autoRedirect, redirectSeconds, customCtaUrl]);

  /* ── Resend magic link ── */
  const handleResendLink = async () => {
    const emailToUse = originalGuestEmail || order?.guest_email;
    if (!emailToUse) return;
    setResending(true);
    const { error } = await supabase.auth.signInWithOtp({ email: emailToUse });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Login link sent!", description: `Check your email` });
    }
    setResending(false);
  };

  /* ── Go to Dashboard / Custom CTA (auto-login for guests) ── */
  const handleGoToDashboard = async () => {
    const ctaUrl = order?.offerings?.thankyou_cta_url;

    if (session) {
      if (isSafeRedirectUrl(ctaUrl)) {
        window.location.href = ctaUrl!;
      } else {
        navigate("/home");
      }
      return;
    }

    const navState = location.state as any;
    const token = navState?.magicLinkToken;
    const email = originalGuestEmail || navState?.guestEmail;

    if (token && email) {
      setLoggingIn(true);
      try {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: token,
          type: "magiclink",
        });
        if (!error) {
          navigate("/home");
          return;
        }
        if (import.meta.env.DEV) console.error("[ThankYou] Auto-login failed:", error.message);
        toast({
          title: "Login link sent!",
          description: "Check your email to sign in and access your dashboard.",
        });
      } catch (err) {
        if (import.meta.env.DEV) console.error("[ThankYou] Auto-login error:", err);
      }
      setLoggingIn(false);
    } else if (email) {
      setLoggingIn(true);
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (!error) {
        toast({
          title: "Login link sent!",
          description: "Check your email to sign in.",
        });
      } else {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      }
      setLoggingIn(false);
    }
  };

  const handleBuyUpsell = useCallback(async (upsell: Upsell) => {
    setBuyingUpsell(upsell.id);
    try {
      let data: any;

      if (session) {
        // Authenticated flow
        const res = await fetch(`${SUPABASE_URL}/functions/v1/create-razorpay-order`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ offering_id: upsell.upsell_offering.id }),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        data = await res.json();
      } else if (order?.guest_email) {
        // Guest flow — reuse parent order guest info
        const res = await fetch(`${SUPABASE_URL}/functions/v1/guest-create-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            offering_id: upsell.upsell_offering.id,
            guest_name: order.guest_name || "",
            guest_email: order.guest_email,
            guest_phone: order.guest_phone || "",
          }),
        });
        if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
        data = await res.json();
      } else {
        toast({ title: "Cannot purchase", description: "Please log in first.", variant: "destructive" });
        setBuyingUpsell(null);
        return;
      }

      if (!(window as any).Razorpay) {
        toast({ title: "Payment unavailable", description: "Please try again in a moment.", variant: "destructive" });
        setBuyingUpsell(null);
        return;
      }

      const isGuestPurchase = !session;
      const options = {
        key: data.key_id,
        amount: data.amount,
        currency: data.currency,
        name: "LevelUp Learning",
        description: upsell.upsell_offering.title,
        order_id: data.razorpay_order_id,
        handler: async (response: any) => {
          try {
            const headers: Record<string, string> = { "Content-Type": "application/json" };
            if (session) headers.Authorization = `Bearer ${session.access_token}`;
            const verifyRes = await fetch(`${SUPABASE_URL}/functions/v1/verify-razorpay-payment`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                payment_order_id: data.payment_order_id,
                is_guest: isGuestPurchase,
              }),
            });
            if (!verifyRes.ok) throw new Error("Verification failed");
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setPurchasedUpsells((prev) => new Set(prev).add(upsell.id));
              toast({ title: "Added!", description: `${upsell.upsell_offering.title} has been added to your account.` });
            }
          } catch {
            toast({ title: "Verification error", variant: "destructive" });
          }
          setBuyingUpsell(null);
        },
        prefill: {
          name: session ? "" : order?.guest_name || "",
          email: session ? "" : order?.guest_email || "",
          contact: session ? "" : order?.guest_phone || "",
        },
        theme: { color: "#F5F1E8" },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on("payment.failed", () => {
        toast({ title: "Payment failed", variant: "destructive" });
        setBuyingUpsell(null);
      });
      rzp.open();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setBuyingUpsell(null);
    }
  }, [session, order, toast]);

  /* ── Loading / Error states ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[hsl(var(--cream))]" />
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-semibold text-foreground">Order not found</h1>
        <p className="text-muted-foreground text-sm text-center max-w-md">
          This order doesn't exist or hasn't been confirmed yet. If you just completed a payment, please wait a moment and refresh.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-[hsl(var(--surface))]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-4">
          <span className="text-lg font-bold text-[hsl(var(--cream))] font-['Instrument_Serif'] italic">
            LevelUp
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
        {/* Success confirmation */}
        <div className="text-center space-y-6 mb-12">
          {order.offerings?.thankyou_thumbnail_url ? (
            <img
              src={order.offerings.thankyou_thumbnail_url}
              alt="Thank you"
              className="w-full max-h-64 object-cover rounded-xl mx-auto"
            />
          ) : (
            <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-[hsl(var(--accent-emerald)/0.15)] mx-auto">
              <CheckCircle2 className="h-10 w-10 text-[hsl(var(--accent-emerald))]" />
            </div>
          )}

          <div>
            <h1 className="text-3xl font-bold text-foreground">
              {order.offerings?.thankyou_headline || "Payment Successful!"}
            </h1>
            {order.offerings?.thankyou_body ? (
              <p className="mt-2 text-lg text-muted-foreground whitespace-pre-line">
                {order.offerings.thankyou_body}
              </p>
            ) : (
              <p className="mt-2 text-lg text-muted-foreground">
                You're enrolled in{" "}
                <span className="text-[hsl(var(--cream))] font-medium font-['Instrument_Serif'] italic">
                  {order.offerings?.title || "your program"}
                </span>
              </p>
            )}
          </div>

          {/* Order reference */}
          <p className="text-xs text-muted-foreground font-mono">
            Order ID: {order.id.slice(0, 8).toUpperCase()}
            {order.razorpay_payment_id && (
              <> &middot; Payment: {order.razorpay_payment_id}</>
            )}
          </p>

          {/* Action card — same for guest and logged-in */}
          <div className="max-w-md mx-auto rounded-xl border border-border bg-[hsl(var(--surface))] p-6 space-y-4">
            {isGuest && (
              <>
                <div className="flex items-center gap-3">
                  <Mail className="h-5 w-5 text-[hsl(var(--cream))]" />
                  <p className="text-sm text-foreground">
                    We've also sent a login link to <strong className="text-[hsl(var(--cream))]">{order.guest_email}</strong>
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  You can also access your course anytime via the link in your email.
                </p>
              </>
            )}
            {!isGuest && session && autoRedirect && countdown > 0 && (
              <p className="text-sm text-muted-foreground text-center">
                Redirecting in <span className="text-foreground font-bold">{countdown}</span> seconds…
              </p>
            )}
            <Button
              onClick={handleGoToDashboard}
              disabled={loggingIn}
              className="w-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] hover:opacity-90"
            >
              {loggingIn ? (
                <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Signing you in…</>
              ) : (
                <>{order.offerings?.thankyou_cta_label || "Go to Dashboard"} <ArrowRight className="h-4 w-4 ml-2" /></>
              )}
            </Button>
            {isGuest && (
              <Button
                variant="ghost"
                onClick={handleResendLink}
                disabled={resending}
                className="w-full text-sm text-muted-foreground"
              >
                {resending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                Resend login link to email
              </Button>
            )}
          </div>
        </div>

        {/* Post-purchase upsells */}
        {upsells.length > 0 && (
          <>
            <Separator className="bg-border mb-8" />
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-xl font-semibold text-foreground">Enhance Your Learning</h2>
                <p className="text-sm text-muted-foreground mt-1">Special offers just for you</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {upsells.map((u) => (
                  <UpsellCard
                    key={u.id}
                    upsell={u}
                    onBuy={() => handleBuyUpsell(u)}
                    purchased={purchasedUpsells.has(u.id)}
                    buying={buyingUpsell === u.id}
                  />
                ))}
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
