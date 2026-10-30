import { useEffect, useMemo, useState, useRef } from "react";
import usePageTitle from "@/hooks/usePageTitle";
import { useCheckoutPricing } from "@/hooks/useCheckoutPricing";
import { useCheckoutCoupon } from "@/hooks/useCheckoutCoupon";
import { useGuestCheckout } from "@/hooks/useGuestCheckout";
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
import { buildVerifyBody, postPaymentNavState, postPaymentRoute, type RazorpaySuccess } from "@/lib/checkoutVerify";
import {
  cartKey,
  guestReuseToken,
  loadOpenOrder,
  paymentLocked,
  payStepFor,
  saveOpenOrder,
  type OpenOrder,
} from "@/lib/checkoutOpenOrder";
import type { OrderPaymentStatus } from "@shared/orderPaymentStatus";
import { Loader2, Tag, BookOpen, ArrowLeft, CheckCircle2, Lock, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Tables } from "@/integrations/supabase/types";
import TrustPanel from "@/components/checkout/TrustPanel";
import StickyPayBar from "@/components/checkout/StickyPayBar";
import PayButtonContent from "@/components/checkout/PayButtonContent";
import GuaranteeBadge from "@/components/offering/GuaranteeBadge";
import ContinueOnWebCTA from "@/components/ContinueOnWebCTA";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { SkeletonLine, SkeletonBlock, RevealOnMount } from "@/components/patterns/LoadingState";
import CountUp from "@/components/motion/CountUp";
import { useMotionSafe } from "@/lib/motion";
import { useInViewRef } from "@/hooks/useInViewRef";
import { isAndroid, isNative } from "@/lib/platform";
import { hapticImpact, hapticSelection, tapTick } from "@/lib/haptics";
import { track, whenAnalyticsReady } from "@/lib/analytics";
import { addPaymentInfoEventId, contentCategoryForTier } from "@shared/metaEvents";
import { attributionForOrder, captureCheckoutAttribution, checkoutVisitEventId, landingPageUrl } from "@/lib/attribution";
import CollapsibleDescription from "@/components/checkout/CollapsibleDescription";
import AfterYouPay from "@/components/checkout/AfterYouPay";
import PaymentNotice, { type PaymentIssue } from "@/components/checkout/PaymentNotice";
import { readFunctionError } from "@/lib/functionError";
import { RAZORPAY_THEME_COLOR } from "@/lib/brand";
import { checkoutWebPath, type CheckoutPaymentType } from "@/lib/checkoutWebPath";

/* -- Razorpay global type -- */
declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, cb: (response: { error?: { description?: string; reason?: string } }) => void) => void;
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

/**
 * Structured checkout skeleton — mirrors the real card layout (back link,
 * offering row with a 64px thumb block, "what you'll get" rows, the anon
 * guest-details block, coupon field, order-summary lines, full-width pay
 * button, reassurance pill) so the skeleton→content handoff introduces no
 * layout shift (zero CLS). Built from the shared SkeletonLine/SkeletonBlock
 * primitives so it breathes on the same shimmer cadence as every other loading
 * surface.
 *
 * `showGuestForm` models the DEFAULT anonymous cold-load shape: an anon buyer
 * renders the name/email/phone guest block (CheckoutPage `{!user && …}`), which
 * is materially taller than a logged-in card. The skeleton is shown while
 * `loading || authLoading`; during authLoading `user` is still null, so the
 * caller passes `!user` and the skeleton renders the fuller anon shape by
 * default — matching what a cold anonymous visitor actually gets.
 */
function CheckoutSkeleton({ showGuestForm = false }: { showGuestForm?: boolean }) {
  // Mirrors the loaded card's order: back, header + two description lines,
  // guest fields (anon), Total, Pay, reassurance pill, refund line. Everything
  // else on the card sits below Pay, off the first screen.
  return (
    <div className="space-y-5 md:space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading secure checkout…</span>

      {/* Back link */}
      <SkeletonLine width={56} height={14} className="-mb-3" />

      {/* Header: thumb + title/instructor + two clamped description lines */}
      <div className="space-y-3">
        <div className="flex items-start gap-3 sm:gap-4">
          <SkeletonBlock className="h-14 w-14 sm:h-16 sm:w-16 shrink-0 rounded-xl" height={56} />
          <div className="min-w-0 flex-1 space-y-2 pt-1">
            <SkeletonLine width="70%" height={20} />
            <SkeletonLine width="40%" height={14} />
          </div>
        </div>
        <div className="space-y-1.5">
          <SkeletonLine width="100%" height={12} />
          <SkeletonLine width="85%" height={12} />
        </div>
      </div>

      {/* Guest details (anon checkout): header row, three labelled inputs
          (18px label + 44px input), two-line helper note. */}
      {showGuestForm && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SkeletonLine width={72} height={12} />
            <SkeletonLine width={148} height={12} />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonLine width={[64, 92, 100][i]} height={18} />
              <SkeletonBlock className="rounded-[12px]" height={44} />
            </div>
          ))}
          <div className="space-y-1.5">
            <SkeletonLine width="100%" height={12} />
            <SkeletonLine width="75%" height={12} />
          </div>
        </div>
      )}

      {/* Total */}
      <div className="flex items-center justify-between">
        <SkeletonLine width={48} height={16} />
        <SkeletonLine width={72} height={16} />
      </div>

      {/* Pay button */}
      <SkeletonBlock className="rounded-2xl" height={56} />

      {/* Reassurance pill */}
      <div className="flex justify-center">
        <SkeletonLine width={200} height={28} className="rounded-full" />
      </div>
    </div>
  );
}

/**
 * Desktop trust-sidebar skeleton — the mirror of `<TrustPanel>` (same
 * `hidden lg:block w-[420px] flex-shrink-0 space-y-6` shell). The real page
 * renders TrustPanel as a SECOND flex column on `lg`, so a loading branch that
 * omits it lets the single centred Card sit in the middle of the row and then
 * jump left when the sidebar mounts — a horizontal layout shift. Reserving the
 * same 420px column here keeps the two-column centring identical across the
 * handoff. Reserved only when `paymentType === "full"` — the one state, knowable
 * before the offering loads, that guarantees the loaded page renders TrustPanel
 * (`!isStaged`). TrustPanel is hidden on staged payments, and every non-full
 * paymentType (app_fee / confirmation / balance) is a staged flow, so reserving
 * for those would drop the column on handoff and shift the Card.
 */
function CheckoutTrustPanelSkeleton() {
  return (
    <aside
      className="hidden lg:block w-[420px] flex-shrink-0 space-y-6"
      aria-hidden
    >
      {/* Course summary card: media block + title/meta */}
      <div className="bg-surface border border-border rounded-xl overflow-hidden">
        <SkeletonBlock className="rounded-none" height={236} />
        <div className="p-4 space-y-2">
          <SkeletonLine width="80%" height={18} />
          <SkeletonLine width="45%" height={12} />
        </div>
      </div>

      {/* What's included: label + 4 bullet rows */}
      <div className="space-y-3">
        <SkeletonLine width={96} height={10} />
        <div className="space-y-2">
          {[68, 60, 72, 64].map((w, i) => (
            <SkeletonLine key={i} width={`${w}%`} height={16} />
          ))}
        </div>
      </div>

      {/* What happens next box */}
      <SkeletonBlock className="rounded-xl" height={72} />

      {/* Trust badge */}
      <div className="pt-2 border-t border-border">
        <SkeletonLine width={190} height={16} />
      </div>
    </aside>
  );
}

/**
 * Cold-load skeleton for the whole checkout screen: the card placeholder plus
 * (optionally) the desktop trust-sidebar placeholder, in the SAME outer layout
 * the loaded page uses. Shared by two call sites so the handoff is seamless:
 *   1. the `loading || authLoading` early-return (what a cold visitor sees), and
 *   2. `<RevealOnMount>`'s `skeleton` in the loaded branch, which repaints this
 *      exact markup for one frame before crossfading to the real content.
 * Rendering identical markup at both sites is what makes the crossfade start
 * from a pixel-matched `from` state instead of a jump-cut.
 */
function CheckoutColdSkeleton({
  showGuestForm,
  showTrustPanel,
}: { showGuestForm: boolean; showTrustPanel: boolean }) {
  return (
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row lg:items-start lg:justify-center gap-8 px-4 pt-4 md:pt-20 pb-28 lg:pb-12">
      <Card className="w-full max-w-[560px] border-border bg-surface">
        <CardContent className="p-5 md:p-8">
          <CheckoutSkeleton showGuestForm={showGuestForm} />
        </CardContent>
      </Card>
      {showTrustPanel && <CheckoutTrustPanelSkeleton />}
    </div>
  );
}

export default function CheckoutPage() {
  const { offeringId } = useParams<{ offeringId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [searchParams] = useSearchParams();
  // Staged payment params
  const paymentType = (searchParams.get("type") as CheckoutPaymentType) || "full";
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
  // Coupon entry + apply/remove. Validation runs through the validate-coupon
  // edge function (the coupons table is admin-read-only). See useCheckoutCoupon.
  // Staged cohort payments take no coupon, so they never probe for one.
  const {
    couponCode, setCouponCode,
    appliedCoupon, couponLoading, couponAvailable,
    applyCoupon, removeCoupon,
  } = useCheckoutCoupon(offeringId, { probe: paymentType === "full" });
  // A campaign link can carry ?coupon=CODE: it opens the promo box and is
  // applied once the offering has loaded.
  const urlCoupon = (searchParams.get("coupon") ?? "").trim().toUpperCase().slice(0, 40);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [fieldTouched, setFieldTouched] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState(false);
  const paymentInFlightRef = useRef(false);
  // The last Pay attempt's problem, shown inline under Pay until the next tap.
  const [payIssue, setPayIssue] = useState<PaymentIssue | null>(null);
  const [application, setApplication] = useState<any>(null);
  const [totalPreviouslyPaid, setTotalPreviouslyPaid] = useState(0);

  // Sticky-bar handoff (mirrors the offering page's sticky→inline pattern): the
  // mobile StickyPayBar and the in-card Pay button are the same champagne CTA, so
  // showing both at once — as happens once the buyer scrolls the in-card button
  // into view — lights two identical pay actions in one viewport. We observe the
  // in-card button and suppress the sticky bar the moment it's on screen, so
  // exactly one pay action is lit at any scroll offset. The negative bottom
  // margin must equal the sticky bar's OWN rendered footprint so the in-card
  // button counts as "in view" (and the bar cedes) exactly as it reaches the
  // bar's top edge — no frame where the lit in-card button peeks ABOVE the still-
  // mounted bar. The bar's height is content + env(safe-area-inset-bottom), which
  // varies per device; the old hardcoded -96px was a GUESS at that sum and
  // overshot by the safe-area amount on every 0-safe-area surface (375/360,
  // desktop, most WebViews), flipping the gate ~24px late and leaving a ~24px
  // band where both CTAs lit at steady state. So we drive the margin off the
  // bar's MEASURED height (`stickyBarHeight`, reported via StickyPayBar#onMeasure)
  // — exact on every device. Seeded with the bar's content-only footprint (73px)
  // so the very first observer never overshoots before the measure lands; the
  // measure only ever GROWS it by the real safe-area inset. No IntersectionObserver
  // (SSR / older WebView) → stays false → bar shown, preserving historical behaviour.
  //
  // MUST use a callback ref (useInViewRef), NOT framer's useInView: this button
  // renders inside <RevealOnMount> below, whose skeleton branch owns the first
  // commit under normal motion, so the button is absent when a mount-only
  // observer would bind. framer's useInView binds once and early-returns on a
  // null node, so it never re-observed the button once it appeared on the next
  // frame — the gate stayed false forever and BOTH champagne CTAs lit. A callback
  // ref re-subscribes on the actual attach, so the gate flips correctly.
  const [stickyBarHeight, setStickyBarHeight] = useState(73);
  const [inCardPayRef, inCardPayInView] = useInViewRef<HTMLButtonElement>({
    rootMargin: `0px 0px -${stickyBarHeight}px 0px`,
  });

  // Motion presets (collapse to instant under reduced motion) for the coupon
  // chip enter/exit — see the applied-coupon block below. `pressTap` is the
  // canonical snap-spring whileTap (drops the scale under reduced motion),
  // reused on the chip's remove control so it presses like every Button.
  const { springs, pressTap } = useMotionSafe();

  // Selection haptic on a *successful* coupon apply. appliedCoupon only flips
  // from null → set inside the validate-coupon success path, so a transition to
  // a truthy coupon id is exactly "apply succeeded" (remove goes set → null and
  // is intentionally silent). Native-only; no-ops on web.
  const appliedCouponIdRef = useRef<string | null>(null);
  useEffect(() => {
    const id = appliedCoupon?.id ?? null;
    if (id && id !== appliedCouponIdRef.current) void hapticSelection();
    appliedCouponIdRef.current = id;
  }, [appliedCoupon]);

  // Guest checkout fields + validation (also prefilled for logged-in users who
  // have no profile details on file yet). See useGuestCheckout.
  const {
    guestName, setGuestName, guestEmail, setGuestEmail,
    guestPhone, setGuestPhone, guestTouched, setGuestTouched, validateGuest,
  } = useGuestCheckout(user);

  /* -- Ad attribution: keep the landing page's utm_* / fbclid / gclid /
        ic_eid for this visit, so the order row can be tied to the ad. Read
        once per offering; the query string is gone after a /login round trip. -- */
  useEffect(() => {
    if (!offeringId) return;
    captureCheckoutAttribution(window.location.search, offeringId);
  }, [offeringId]);

  /* -- InitiateCheckout: once per checkout visit --
        Fired once per offering per mount (this load effect re-runs when the
        session object changes, which used to fire it again). The event id is
        the landing page's ic_eid when the link carried one, so the site's copy
        of the tap and this one merge in Meta; otherwise an id kept for the tab,
        so a reload or a /login round trip does not count a second checkout.
        Waits for the pixel stubs, which load from a DB read at app start. -- */
  const initiateCheckoutFiredFor = useRef<string | null>(null);
  useEffect(() => {
    if (!offering) return;
    if (initiateCheckoutFiredFor.current === offering.id) return;
    initiateCheckoutFiredFor.current = offering.id;
    const event = {
      name: "initiate_checkout" as const,
      content_id: offering.id,
      content_name: offering.title,
      value: Number(offering.price_inr || 0),
      currency: offering.currency || "INR",
      content_category: contentCategoryForTier(offering.product_tier),
      event_id: checkoutVisitEventId(offering.id),
    };
    void whenAnalyticsReady().then(() => track(event));
  }, [offering]);

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

      // Phase-3 conversion funnel: the checkout surface is now populated. Guest
      // flag reflects whether an anon buyer is on the guest path at load time.
      track({
        name: "checkout_loaded",
        offeringId: offeringId!,
        guest: !user,
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

      // Load bump offering details.
      //
      // A bump is a SALE, so it must obey the same rule as the main offering
      // above: archived is not for sale. The offering row alone is no longer
      // the gate — offerings_read_entitled (20260728010000) lets a caller read
      // an offering they already own whatever its status, so for a returning
      // student a bump pointing at an archived product would now come back
      // fully populated and be purchasable, which is exactly the "closed
      // product back on sale" case the archived rule exists to prevent.
      //
      // Filtering only the OFFERINGS query would be worse than the hole: the
      // render falls back to `headline ?? "Add-on"` and
      // `bump_price_override_inr ?? 0`, so a bump with no detail still draws a
      // checkbox reading "Add-on +₹0". The bump itself has to go.
      const bumpData = bumpsRes.data ?? [];
      if (bumpData.length > 0) {
        const bumpOfferingIds = bumpData.map((b: Bump) => b.bump_offering_id);
        const { data: bumpOfferings } = await supabase
          .from("offerings")
          .select("*")
          .in("id", bumpOfferingIds)
          .eq("status", "active");

        const enriched = bumpData
          .map((b: Bump) => ({
            ...b,
            offeringDetail: bumpOfferings?.find(
              (o) => o.id === b.bump_offering_id
            ),
          }))
          .filter((b) => b.offeringDetail);
        setBumps(enriched);
      }

      setLoading(false);
    }
    load();
  }, [authLoading, user, offeringId, applicationId, paymentType, navigate]);

  const isStaged = paymentType !== "full" && (offering as any)?.payment_mode === "staged";
  const stagedLabel = paymentType === "app_fee" ? "Application Fee"
    : paymentType === "confirmation" ? "Confirmation Amount"
    : paymentType === "balance" ? "Balance Payment" : "";

  /* -- ?coupon=CODE: apply once, after the offering loads (non-staged only). -- */
  const urlCouponTried = useRef(false);
  useEffect(() => {
    if (!offering || !urlCoupon || urlCouponTried.current) return;
    if (paymentType !== "full" && (offering as any).payment_mode === "staged") return;
    urlCouponTried.current = true;
    setCouponCode(urlCoupon);
    void applyCoupon(urlCoupon);
  }, [offering, urlCoupon, paymentType, applyCoupon, setCouponCode]);

  /* -- No MRP anchor on masterclasses --
        The struck-through "was" price, "Total savings" and the sticky bar's
        "Save" read offerings.mrp_inr, a price no masterclass buyer was ever
        charged. The founder's 17 Oct 2026 decision removes those anchors, so
        a masterclass checkout ignores mrp_inr. Display only: the charged
        amount never used it. -- */
  const isMasterclass = (offering?.product_tier ?? "").trim().toLowerCase() === "masterclass";
  const pricingOffering = useMemo(
    () => (offering && isMasterclass ? { ...offering, mrp_inr: null } : offering),
    [offering, isMasterclass],
  );

  /* -- Pricing (one shared home: @shared/pricing, used by the order edge
        functions too, so the preview can't drift from what's charged) -- */
  const { subtotal, discount, gstRate, gstAmount, total, totalSavings } = useCheckoutPricing({
    offering: pricingOffering,
    bumps,
    selectedBumps,
    appliedCoupon,
    isStaged,
    paymentType,
    totalPreviouslyPaid,
  });

  /* -- Load Razorpay script -- */
  useEffect(() => {
    // The native shells take no payments, so they never load Razorpay.
    if (isNative()) return;
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]'))
      return;
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onerror = () => toast.error("The payment screen didn't load. Give it a moment, then try again.");
    document.body.appendChild(script);
  }, []);

  /* -- The last order a payment sheet was opened for --
        Kept until it is paid and verified, so no state in which money may
        have moved can become a second charge (lib/checkoutOpenOrder). The ref
        serves the async Razorpay callbacks; the state lets the notice offer
        "Check payment status". Restored per offering from sessionStorage, so
        a reload does not bring back a live Pay button after Razorpay reported
        a payment that was never confirmed here. -- */
  const openOrderRef = useRef<OpenOrder | null>(null);
  const [hasOpenOrder, setHasOpenOrder] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const rememberOpenOrder = (order: OpenOrder | null) => {
    openOrderRef.current = order;
    setHasOpenOrder(!!order);
    if (offeringId) saveOpenOrder(offeringId, order);
  };
  useEffect(() => {
    if (!offeringId) return;
    const saved = loadOpenOrder(offeringId);
    openOrderRef.current = saved;
    setHasOpenOrder(!!saved);
    if (saved?.paid) setPayIssue({ kind: "verify_pending" });
  }, [offeringId]);

  // Money moved or may have: Pay and the sticky bar stay off until a status
  // check settles it.
  const payLocked = paymentLocked(payIssue);

  /** What an order is priced from. A different key needs a different order. */
  const currentCartKey = () =>
    cartKey({
      user: user?.id ?? null,
      paymentType,
      applicationId,
      total,
      coupon: appliedCoupon?.id ?? null,
      bumps: isStaged ? [] : Array.from(selectedBumps).sort(),
      fields: customFieldValues,
      name: user ? null : guestName.trim(),
      email: user ? null : guestEmail.trim().toLowerCase(),
      phone: user ? null : guestPhone.replace(/\D/g, "").slice(-10),
    });

  const releasePay = () => {
    setPaying(false);
    paymentInFlightRef.current = false;
  };

  const reviewMessage = (verifyData: { needs_review?: boolean } | null | undefined, message: string | null) =>
    verifyData?.needs_review || /review/i.test(message ?? "")
      ? "We're setting up your access by hand and will email you within a few hours. Please don't pay again."
      : null;

  /** Ask the server whether a payment landed on this order. Read-only. */
  const fetchOrderStatus = async (
    order: OpenOrder,
  ): Promise<{ status: OrderPaymentStatus; razorpay_payment_id: string | null }> => {
    const known: OrderPaymentStatus[] = ["captured", "needs_review", "paid", "pending", "none", "unknown"];
    try {
      const { data, error } = await supabase.functions.invoke("verify-razorpay-payment", {
        body: {
          payment_order_id: order.paymentOrderId,
          is_guest: order.isGuest,
          status_check: true,
          // A guest proves the order is theirs with the token it was made with.
          ...(order.isGuest ? { reuse_token: order.reuseToken ?? null } : {}),
        },
      });
      const status = data?.status as OrderPaymentStatus | undefined;
      if (error || !status || !known.includes(status)) return { status: "unknown", razorpay_payment_id: null };
      return {
        status,
        razorpay_payment_id: typeof data?.razorpay_payment_id === "string" ? data.razorpay_payment_id : null,
      };
    } catch {
      return { status: "unknown", razorpay_payment_id: null };
    }
  };

  /** The notice for a status that does not finish the purchase. */
  const issueForStatus = (status: OrderPaymentStatus, locked: boolean): PaymentIssue => {
    switch (status) {
      case "paid":
        return { kind: "verify_pending" };
      case "needs_review":
        return { kind: "verify_pending", message: reviewMessage({ needs_review: true }, null) };
      case "pending":
        return { kind: "check_needed", reason: "pending", locked };
      case "unknown":
        return { kind: "check_needed", reason: "unknown", locked };
      default:
        return { kind: "no_payment_found" };
    }
  };

  /** The order is paid and verified: count the sale once and move on. */
  const finishPaid = (order: OpenOrder, razorpayPaymentId: string | null, offeringTitle?: string | null) => {
    // Purchase fires HERE, right after verify and before any redirect: a guest
    // only reaches Thank-you after a phone OTP, and 3 in 35 never sign in, so a
    // Thank-you-only Purchase never reached Meta for them. track() sends it
    // once per payment (lib/purchaseOnce), so Thank-you does not send it again;
    // the eventID purchase_<razorpay_payment_id> matches the server (CAPI) copy.
    // Value is the amount the server priced into the Razorpay order.
    if (razorpayPaymentId && offering) {
      track({
        name: "purchase",
        transaction_id: razorpayPaymentId,
        content_id: offering.id,
        content_name: offering.title,
        value: order.amountPaise / 100,
        currency: order.currency || "INR",
        content_category: contentCategoryForTier(offering.product_tier),
      });
    }
    rememberOpenOrder(null);
    // Guest: the purchase now sits on the account that owns the phone they
    // paid with. One OTP on /login (phone prefilled) proves it and lands them
    // on Thank-you; payment_orders is not anonymously readable.
    toast.success(
      order.isGuest
        ? "Payment received. Confirm your phone number with a one-time code to open your course."
        : `Welcome to ${offeringTitle ?? order.offeringTitle ?? offering?.title ?? "your course"}!`,
    );
    navigate(postPaymentRoute(order.isGuest, order.paymentOrderId), {
      state: order.isGuest ? postPaymentNavState(guestPhone) : undefined,
    });
  };

  /** Open the Razorpay sheet for an order (a new one, or the last one again). */
  const openSheet = async (order: OpenOrder) => {
    if (!offering) return;
    // Prefill: for guest checkout use what they just typed; for logged-in
    // users pull from profile.
    let prefillName = guestName;
    let prefillEmail = guestEmail;
    let prefillContact = guestPhone;
    if (user) {
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
      key: order.keyId,
      amount: order.amountPaise,
      currency: order.currency,
      name: "LevelUp",
      description: order.offeringTitle ?? offering.title,
      order_id: order.razorpayOrderId,
      prefill: {
        name: prefillName,
        email: prefillEmail,
        contact: prefillContact,
      },
      theme: { color: RAZORPAY_THEME_COLOR, backdrop_color: "rgba(0,0,0,0.8)" },
      handler: async (response: RazorpaySuccess) => {
        // Razorpay has taken the money. Until verification confirms it, Pay
        // stays locked, here and after a reload.
        const paidOrder: OpenOrder = { ...order, paid: response, savedAt: Date.now() };
        rememberOpenOrder(paidOrder);
        // Verify payment. `is_guest` is REQUIRED for an anonymous buyer:
        // without it the function demands a login token and 401s, and the
        // buyer is told to "contact support" seconds after paying.
        const { data: verifyData, error: verifyErr } =
          await supabase.functions.invoke("verify-razorpay-payment", {
            body: buildVerifyBody(response, order.paymentOrderId, order.isGuest),
          });

        if (verifyErr || !verifyData?.success) {
          // The webhook captures and enrols on its own. Say so, keep Pay
          // locked, and offer a status check that runs this verification again.
          const info = await readFunctionError(verifyErr, verifyData);
          setPayIssue({ kind: "verify_pending", message: reviewMessage(verifyData, info.message) });
          releasePay();
          return;
        }
        finishPaid(paidOrder, response.razorpay_payment_id, verifyData.offering_title);
      },
      modal: {
        ondismiss: () => {
          // A failure already set its own notice; keep that one. The order is
          // kept: the next Pay checks it before anything new is charged.
          setPayIssue((prev) => prev ?? { kind: "dismissed" });
          releasePay();
        },
      },
    };

    if (typeof window.Razorpay !== "function") {
      setPayIssue({ kind: "script_missing" });
      releasePay();
      return;
    }

    // Phase-3 conversion funnel: a real Razorpay order exists and the modal is
    // about to open. Keyed on our internal payment_order_id so it joins the
    // ThankYou purchase_completed event on the same id.
    track({ name: "payment_initiated", orderId: order.paymentOrderId });
    // AddPaymentInfo: the buyer tapped Pay and the payment sheet is opening.
    // One per payment order (a reused order or a retry counts once).
    track({
      name: "add_payment_info",
      content_id: offering.id,
      content_name: offering.title,
      value: order.amountPaise / 100,
      currency: order.currency || "INR",
      content_category: contentCategoryForTier(offering.product_tier),
      event_id: addPaymentInfoEventId(order.paymentOrderId),
    });

    rememberOpenOrder(order);
    const rzp = new window.Razorpay(options);
    rzp.on("payment.failed", (response) => {
      setPayIssue({ kind: "failed", detail: response?.error?.description ?? null });
      releasePay();
    });
    rzp.open();
  };

  /* -- Check payment status --
        Razorpay reported success on the last order: run the same verification
        again. Otherwise ask whether any payment landed on it. -- */
  const handleCheckStatus = async () => {
    const order = openOrderRef.current;
    if (!order || checkingStatus || paymentInFlightRef.current) return;
    setCheckingStatus(true);
    try {
      if (order.paid) {
        const { data: v, error: e } = await supabase.functions.invoke("verify-razorpay-payment", {
          body: buildVerifyBody(order.paid, order.paymentOrderId, order.isGuest),
        });
        if (!e && v?.success) {
          finishPaid(order, order.paid.razorpay_payment_id, v.offering_title);
          return;
        }
        const info = await readFunctionError(e, v);
        setPayIssue({ kind: "verify_pending", message: reviewMessage(v, info.message) });
        toast("Still confirming your payment. We'll email you when your course is open.");
        return;
      }
      const result = await fetchOrderStatus(order);
      const step = payStepFor(result.status, order.cartKey === currentCartKey());
      if (step === "done") {
        finishPaid(order, result.razorpay_payment_id);
        return;
      }
      setPayIssue(issueForStatus(result.status, step === "locked"));
    } finally {
      setCheckingStatus(false);
    }
  };

  /* -- Pay -- */
  const handlePay = async () => {
    if (!offering) return;
    if (paymentInFlightRef.current || payLocked) return;
    void hapticImpact("medium");
    setPayIssue(null);

    // Validate guest fields when anon (marks fields touched + toasts on the
    // first failure). The edge function does the canonical phone normalisation.
    const isAnon = !user;
    if (isAnon && !validateGuest()) return;

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
      toast.error("A couple of fields still need you.");
      paymentInFlightRef.current = false;
      return;
    }

    setPaying(true);

    try {
      // A sheet opened before was closed without a result. A UPI payment can
      // still finish in the UPI app after that, so ask whether one landed
      // before anything new is charged. The same cart reopens the same
      // Razorpay order, which takes one successful payment only. Staged
      // cohort payments keep their own order path unchanged.
      const lastOrder = openOrderRef.current;
      if (lastOrder && !isStaged) {
        const result = await fetchOrderStatus(lastOrder);
        const step = payStepFor(result.status, lastOrder.cartKey === currentCartKey());
        if (step === "done") {
          finishPaid(lastOrder, result.razorpay_payment_id);
          return;
        }
        if (step === "locked") {
          setPayIssue(issueForStatus(result.status, true));
          releasePay();
          return;
        }
        if (step === "reopen") {
          await openSheet(lastOrder);
          return;
        }
        // Nothing was paid on that order and the cart has changed.
        rememberOpenOrder(null);
      }

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
          const info = await readFunctionError(freeErr, freeData);
          setPayIssue(
            info.code === "already_enrolled"
              ? { kind: "already_enrolled", guest: false }
              : { kind: "order_error", message: info.message ?? "Couldn't complete the enrolment. Please try again." },
          );
          releasePay();
          return;
        }
        navigate(freeData.payment_order_id ? `/thank-you/${freeData.payment_order_id}` : "/my-courses");
        return;
      }

      // Ad attribution for the order row (utm_*, fbclid, gclid, ic_eid, and
      // the _fbp/_fbc cookies read now). Staged cohort payments carry none:
      // that pipeline is left exactly as it was.
      const attribution = isStaged ? null : attributionForOrder(offeringId!);
      const key = currentCartKey();
      // A guest order is tied to this browser: the server reuses an open order,
      // and answers a status check, only for this token (lib/checkoutOpenOrder).
      const reuseToken = isAnon ? guestReuseToken(offeringId!) : null;

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
              reuse_token: reuseToken,
              // Top-level utm_* are what the deployed function has always
              // read; `attribution` carries the full set for the new one.
              utm_source: attribution?.utm_source ?? null,
              utm_medium: attribution?.utm_medium ?? null,
              utm_campaign: attribution?.utm_campaign ?? null,
              utm_content: attribution?.utm_content ?? null,
              utm_term: attribution?.utm_term ?? null,
              attribution,
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
                : { attribution }),
            },
          });

      if (error || (!data?.razorpay_order_id && !(isAnon && data?.success))) {
        // invoke() drops the body of a non-2xx answer; read it from the
        // response so the buyer sees what actually happened.
        const info = await readFunctionError(error, data);
        if (info.code === "already_enrolled" || info.status === 409 && /already/i.test(info.message ?? "")) {
          setPayIssue({ kind: "already_enrolled", guest: isAnon });
        } else if (info.status === 429) {
          setPayIssue({ kind: "rate_limited" });
        } else if (info.status === 403 && isAnon) {
          setPayIssue({
            kind: "identity_mismatch",
            message: info.message ?? "These details match another account",
          });
        } else {
          setPayIssue({
            kind: "order_error",
            message: info.status === null
              ? "Check your connection, then tap Pay again."
              : info.message ?? "Couldn't create your order. Please try again.",
          });
        }
        releasePay();
        return;
      }

      // Free guest offering: edge function already enrolled the user
      // and granted access. Drop straight to ThankYou.
      if (isAnon && data?.success && !data?.razorpay_order_id) {
        toast.success("You're enrolled. Confirm your phone number with a one-time code to open your course.");
        navigate(postPaymentRoute(true, data.payment_order_id), { state: postPaymentNavState(guestPhone) });
        return;
      }

      await openSheet({
        paymentOrderId: data.payment_order_id,
        razorpayOrderId: data.razorpay_order_id,
        amountPaise: Number(data.amount),
        currency: data.currency || "INR",
        keyId: data.key_id,
        offeringTitle: data.offering_title ?? null,
        isGuest: isAnon,
        reuseToken,
        cartKey: key,
        paid: null,
        savedAt: Date.now(),
      });
    } catch {
      setPayIssue({ kind: "order_error", message: "That didn't go through. Check your connection and tap Pay again." });
      releasePay();
    }
  };

  /* -- UI -- */
  // Cold load: a structured skeleton that mirrors the final card (not a spinner)
  // so there is zero layout shift when content arrives. The loaded content is
  // reached only past the byte-identical `isNative()` / not-found early-returns
  // below (revenue guard — those gates must NOT move or dereference a null
  // offering), so no single mounted LoadingSwap can straddle the handoff. The
  // crossfade instead lives in the loaded branch via `<RevealOnMount>`, which
  // repaints THIS exact skeleton for one frame and then crossfades to the real
  // content — a produced moment, not a jump-cut.
  if (loading || authLoading) {
    // Model the DEFAULT anonymous cold-load shape. While authLoading, `user` is
    // still null, so `!user` renders the fuller anon skeleton (guest fields +
    // trust sidebar) — matching what a cold anonymous visitor actually gets and
    // keeping the skeleton→content handoff flush.
    //
    // Reserve the TrustPanel column ONLY when we can prove the loaded content
    // WILL render it, using a signal known synchronously (before the offering
    // fetch resolves). The loaded page shows TrustPanel iff `!isStaged`, i.e.
    // `paymentType === "full" || payment_mode !== "staged"`. `payment_mode`
    // needs the offering (still null here), but `paymentType` is derived from
    // searchParams up-front. `paymentType === "full"` guarantees `!isStaged`
    // regardless of payment_mode, so the panel is certain to mount → reserve it.
    // For a non-full paymentType we CANNOT be certain (a staged offering drops
    // the panel), so we reserve nothing: staged flows — the real, cold-loadable
    // use of every non-full type (app_fee / confirmation / balance links) — then
    // hand off with no column to remove, avoiding a horizontal re-centre shift.
    // (Gating on `!isStaged` here was WRONG: `isStaged` is false while offering
    // is null, so it always reserved the column, then a staged load dropped it
    // → ~226px Card shift on desktop-lg.)
    const anonShape = !user;
    const willShowTrustPanel = paymentType === "full";
    return (
      <CheckoutColdSkeleton showGuestForm={anonShape} showTrustPanel={willShowTrustPanel} />
    );
  }

  if (!offering) return null;

  // Path B / Google Play Reader Rule: the Android shell must NEVER expose a
  // Razorpay-driven checkout page. Replace the entire pay UI with a
  // Continue-on-web card on the public web origin. A staged payment keeps its
  // application-scoped checkout query; dropping it to the offering page makes
  // an application-fee reminder impossible to complete from the Android shell.
  // Full purchases still use the normal public offering journey.
  if (isNative()) {
    const webPath = checkoutWebPath({
      offeringId,
      offeringSlug: offering.slug,
      paymentType,
      applicationId,
    });
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[480px]">
          <ContinueOnWebCTA webPath={webPath} />
        </div>
      </div>
    );
  }

  const hasMrp =
    !isMasterclass &&
    (offering as any).mrp_inr &&
    Number((offering as any).mrp_inr) > Number(offering.price_inr);
  // The itemised receipt is shown only when it says more than the total does.
  const showBreakdown =
    isStaged || !!hasMrp || discount > 0 || selectedBumps.size > 0 ||
    (gstAmount > 0 && offering.gst_mode !== "inclusive");

  // Pull display metadata for the trust panel. Uses the first linked course
  // as the "what you're buying" preview, with a safe fallback if none exists.
  const primaryCourseId = linkedCourses[0]?.course_id ?? null;
  const trustPanelCourseTitle = (linkedCourses[0]?.courses as any)?.title ?? offering.title;
  const trustPanelThumb = (linkedCourses[0]?.courses as any)?.thumbnail_url ?? null;

  // Inline guest-field validity (mirrors useGuestCheckout.validateGuest, surfaced
  // per-field with role="alert" instead of only as toasts). Only meaningful on
  // the anon path and after a field is touched. PhoneInput emits E.164 (+91…),
  // so the phone check counts a 10-digit national or 12-digit 91-prefixed form —
  // identical to the edge function's normalisation.
  const guestPhoneDigits = guestPhone.replace(/\D/g, "");
  const guestNameError = !user && !!guestTouched.name && !guestName.trim();
  const guestEmailError =
    !user && !!guestTouched.email &&
    (!guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()));
  const guestPhoneError =
    !user && !!guestTouched.phone &&
    !(guestPhoneDigits.length === 10 ||
      (guestPhoneDigits.length === 12 && guestPhoneDigits.startsWith("91")));

  // Loaded, past the revenue guards: crossfade in from the SAME cold-load
  // skeleton the loading branch was painting. `showTrustPanel={!isStaged}` and
  // `showGuestForm={!user}` now use the resolved values, so the fading-out
  // skeleton is a pixel match for the content fading in. Reduced motion ⇒ instant.
  return (
    <RevealOnMount
      skeleton={<CheckoutColdSkeleton showGuestForm={!user} showTrustPanel={!isStaged} />}
    >
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row lg:items-start lg:justify-center gap-8 px-4 pt-4 md:pt-20 pb-28 lg:pb-12">
      <Card className="w-full max-w-[560px] border-border bg-surface">
        <CardContent className="p-5 md:p-8 space-y-5 md:space-y-6">
          {/* -- Back link --
              A buyer from a www masterclass page (the link names it in
              mc_course) goes back there: that page opened this tab, so the
              browser has no history, and the app's own /p/ sales page is one
              they have never seen. -- */}
          <button
            onClick={() => {
              const landing = landingPageUrl();
              if (landing) {
                window.location.href = landing;
                return;
              }
              if (offering?.slug) navigate(`/p/${offering.slug}`);
              else if (offeringId) navigate(`/browse`);
              else navigate(-1);
            }}
            className="inline-flex items-center gap-1.5 min-h-[44px] -my-3 text-sm text-muted-foreground hover:text-foreground transition-colors"
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
            <div className="flex items-start gap-3 sm:gap-4">
              {(offering.thumbnail_url || offering.banner_url) && (
                <img
                  src={offering.thumbnail_url || offering.banner_url || ""}
                  alt=""
                  decoding="async"
                  className="h-14 w-14 sm:h-16 sm:w-16 rounded-xl object-cover shrink-0"
                />
              )}
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-semibold leading-snug text-foreground">
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
            {/* Two lines behind "Read more": the full paragraph pushed the
                form and Pay two to three screens down on a 390px phone. */}
            {!isStaged && offering.description && (
              <CollapsibleDescription text={offering.description} />
            )}
          </div>

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
                      <p id={`error-${field.id}`} className="text-xs text-[hsl(var(--destructive-text))] mt-1">
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
              Just name + email + phone, no OTP before paying. The order is
              tied to the phone; after payment the buyer confirms it with one
              code on /login (phone prefilled), which opens the course. The
              helper line says exactly that, so the code is not a surprise. */}
          {!user && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Your details
                </p>
                <button
                  type="button"
                  onClick={() => navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)}
                  className="inline-flex items-center min-h-[44px] -my-3 text-xs text-[hsl(var(--cream))] hover:underline"
                >
                  Already have an account? Sign in
                </button>
              </div>
              <div>
                <label htmlFor="guest-name" className="caption mb-1 block">
                  Full name
                </label>
                <Input
                  id="guest-name"
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  onBlur={() => setGuestTouched((s) => ({ ...s, name: true }))}
                  placeholder="Full name"
                  aria-invalid={guestNameError}
                  aria-describedby={guestNameError ? "guest-name-error" : undefined}
                  className={`h-11 ${guestNameError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  autoComplete="name"
                />
                {guestNameError && (
                  <p id="guest-name-error" role="alert" className="text-xs text-[hsl(var(--destructive-text))] mt-1">
                    Please enter your name
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="guest-email" className="caption mb-1 block">
                  Email address
                </label>
                <Input
                  id="guest-email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  onBlur={() => setGuestTouched((s) => ({ ...s, email: true }))}
                  placeholder="Email address"
                  type="email"
                  inputMode="email"
                  aria-invalid={guestEmailError}
                  aria-describedby={guestEmailError ? "guest-email-error" : undefined}
                  className={`h-11 ${guestEmailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                  autoComplete="email"
                />
                {guestEmailError && (
                  <p id="guest-email-error" role="alert" className="text-xs text-[hsl(var(--destructive-text))] mt-1">
                    Please enter a valid email
                  </p>
                )}
              </div>
              <div>
                <label htmlFor="guest-phone" className="caption mb-1 block">
                  Phone number
                </label>
                {/* countries locked to IN: the guest flow is +91-only at every
                    validation layer (client, useGuestCheckout, server
                    normalizePhone) — offering other flags here is a dead-end.
                    onBlur rides the number input itself, NOT a wrapper div:
                    focusout bubbles from the country select and marked the
                    field touched mid-entry. */}
                <PhoneInput
                  id="guest-phone"
                  value={guestPhone}
                  onChange={setGuestPhone}
                  placeholder="Phone number"
                  aria-invalid={guestPhoneError}
                  aria-describedby={guestPhoneError ? "guest-phone-error" : undefined}
                  countries={["IN"]}
                  onBlur={() => setGuestTouched((s) => ({ ...s, phone: true }))}
                />
                {guestPhoneError && (
                  <p id="guest-phone-error" role="alert" className="text-xs text-[hsl(var(--destructive-text))] mt-1">
                    Please enter a valid phone number
                  </p>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground/80 leading-relaxed">
                Your course is tied to this phone number. After you pay, confirm it with a one-time code and you're in. No password.
              </p>
            </div>
          )}

          {/* -- Coupon --
              Only when a code can work: an active coupon applies to this
              offering, the link carried ?coupon=, or one is applied. -- */}
          {!isStaged && (couponAvailable || !!urlCoupon || !!appliedCoupon) && (
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Promo code
            </p>
            <AnimatePresence mode="wait" initial={false}>
              {appliedCoupon ? (
                <motion.div
                  key="applied"
                  className="space-y-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={springs.glide}
                >
                  {/* Applied-coupon chip with one-click remove. The
                      chip is the visible affordance; the savings line
                      below reinforces the win emotionally. */}
                  <div className="inline-flex items-center gap-1 pl-3 pr-1 rounded-full bg-[hsl(var(--accent-emerald)/0.15)] border border-[hsl(var(--accent-emerald)/0.4)]">
                    <Tag className="h-3.5 w-3.5 text-[hsl(var(--accent-emerald))]" />
                    <span className="font-mono text-sm font-bold text-[hsl(var(--accent-emerald))]">
                      {appliedCoupon.code}
                    </span>
                    {/* Remove control presses like every Button: framer's
                        snap-spring `whileTap` (collapses to instant under
                        reduced motion via pressTap) + a `tapTick()` selection
                        haptic fired from the activation path — mirrors
                        ui/button.tsx so a tap on the chip isn't dead. Keeps the
                        44px hit area; `transition-colors` (not -all) stays so
                        framer's inline transform isn't smeared (button.tsx
                        clobber-class doctrine). */}
                    <motion.button
                      type="button"
                      onClick={() => {
                        tapTick();
                        removeCoupon();
                      }}
                      whileTap={pressTap}
                      aria-label="Remove promo code"
                      className="min-h-[44px] min-w-[44px] rounded-full hover:bg-[hsl(var(--accent-emerald)/0.2)] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      <X className="h-6 w-6 text-[hsl(var(--accent-emerald))]" aria-hidden />
                    </motion.button>
                  </div>
                  {discount > 0 && (
                    <p className="text-sm font-semibold text-[hsl(var(--success))] tabular-nums">
                      Saved ₹{discount.toLocaleString("en-IN")} on this order
                    </p>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="entry"
                  className="flex gap-2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={springs.glide}
                >
                  <div className="relative flex-1">
                    <Input
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Have a promo code?"
                      className="h-11 bg-surface-2 border-border w-full font-mono uppercase"
                      onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                      aria-label="Promo code"
                      autoCapitalize="characters"
                    />
                    {couponLoading && (
                      <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                    )}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => applyCoupon()}
                    disabled={couponLoading || !couponCode.trim()}
                    className="shrink-0 h-11"
                  >
                    {couponLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      "Apply"
                    )}
                  </Button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          )}

          <Separator className="bg-border hidden sm:block" />

          {/* -- Order summary --
              One price, GST inside it, nothing else on the order: a single
              Total line keeps Pay on the first screen of a phone. Coupons,
              add-ons, an MRP or exclusive GST bring back the itemised receipt. -- */}
          {!showBreakdown ? (
            <div className="space-y-0.5">
              <div className="flex items-baseline gap-2 text-base font-semibold">
                <span className="text-foreground shrink-0">Total</span>
                <span className="flex-1 border-b border-dotted border-border/60 translate-y-[-3px]" aria-hidden />
                <CountUp
                  immediate
                  value={total}
                  prefix="₹"
                  className="text-foreground shrink-0 tabular-nums"
                />
              </div>
              {gstAmount > 0 && (
                <p className="text-[11px] text-muted-foreground text-right">
                  Includes ₹{gstAmount.toLocaleString("en-IN")} GST
                </p>
              )}
            </div>
          ) : (
          // Itemised receipt: dotted-leader rows (label … value, like a
          // printed receipt) under an Instrument-Serif heading.
          <div className="space-y-2.5">
            <h2 className="font-['Instrument_Serif'] text-2xl italic text-foreground leading-none">
              Order summary
            </h2>
            {/* anim-stagger staggers the receipt rows in on first content mount
                (CSS keyframe, runs once per row — a later-inserted discount row
                rises in on its own; the list never re-staggers on coupon apply).
                Disabled entirely under prefers-reduced-motion (see index.css). */}
            <div className="anim-stagger space-y-2 text-sm pt-1">
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
                {/* immediate: seed to the real total at rest (no ₹0 flash below
                    the fold, no observer gating) and roll from the previous total
                    on coupon apply/remove. No key remount, so the number
                    transitions PREV → new instead of re-rolling from 0. Collapses
                    to the final value instantly under reduced motion. */}
                <CountUp
                  immediate
                  value={total}
                  prefix="₹"
                  className="text-foreground shrink-0 tabular-nums"
                />
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
          )}

          {/* -- Pay button -- */}
          {/* total <= 0 is a valid, payable state for non-staged orders (free
              offering or 100%-off coupon): guests go through guest-create-order's
              free capture, signed-in users through create-free-enrolment. Only
              staged payments require a positive amount. */}
          <Button
            ref={inCardPayRef}
            variant="champagne"
            size="xl"
            className="w-full"
            onClick={handlePay}
            // handlePay fires a deliberate heavier hapticImpact("medium") for the
            // money moment; suppress the Button's default tapTick so the pay tap
            // doesn't double-buzz.
            haptic={false}
            disabled={paying || payLocked || (isStaged && total <= 0)}
            // STEAL #2 processing arc: mirror `paying` to aria-busy so assistive
            // tech hears the in-flight state (the label crossfades to a quiet dot
            // visually). Purely additive to the existing disabled semantics.
            aria-busy={paying}
          >
            {/* CRED-style content layer: label ⇄ processing dot inside the same
                champagne container (never resizes / gray-swaps). Driven off the
                existing `paying` flag — no change to handlePay. */}
            <PayButtonContent
              status={paying ? "processing" : "idle"}
              label={
                payLocked
                  ? payIssue?.kind === "check_needed"
                    ? "Waiting on your last payment"
                    : "Confirming your payment"
                  : isStaged
                    ? `Pay ${stagedLabel}: ₹${total.toLocaleString("en-IN")}`
                    : total <= 0
                      ? "Enrol free"
                      : `Pay ₹${total.toLocaleString("en-IN")}`
              }
            />
          </Button>

          <PaymentNotice
            issue={payIssue}
            courseTitle={offering.title}
            onCheckStatus={hasOpenOrder ? handleCheckStatus : undefined}
            checking={checkingStatus}
            onOpenCourse={() => navigate("/learn?seg=courses")}
            onSignIn={() =>
              navigate(
                `/login?${new URLSearchParams({
                  next: payIssue?.kind === "already_enrolled" ? "/learn?seg=courses" : location.pathname + location.search,
                }).toString()}`,
                { state: postPaymentNavState(guestPhone) },
              )
            }
          />

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
          {/* -- Trust signals -- */}
          <div className="flex flex-col items-center gap-2">
            <GuaranteeBadge days={offering.refund_policy_days} productTier={offering.product_tier} />
          </div>


          {/* -- Below the decision: what happens next, what's included, and
              what students said. On a phone all of this sits under Pay. -- */}
          {!isStaged && (
            <>
              <Separator className="bg-border" />
              <AfterYouPay isGuest={!user} />
            </>
          )}

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

          {/* -- What you get -- */}
          {linkedCourses.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Included courses
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

          {/* Testimonials: quote, name and programme label only. No photos:
              reviews show as recorded, never with a stock or reused face. */}
          {!isStaged && (() => {
            try {
              const testimonials = (offering as any).checkout_testimonials || [];
              if (!Array.isArray(testimonials) || testimonials.length === 0) return null;
              return (
                <div className="space-y-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">What students say</p>
                  {testimonials.map((t: any, i: number) => (
                    <div key={i} className="flex gap-3 rounded-lg bg-surface-2 px-4 py-3">
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

      {/* Mobile sticky pay bar: total + Pay pinned to the bottom on phones so the
          decision is one thumb-reach away while the buyer is scrolled up. Only
          ever reached on web (native returns the Continue-on-web card above).
          Suppressed (slides out) once the in-card Pay button scrolls into view so
          the two identical champagne CTAs are never lit in the same viewport —
          exactly one pay action at any scroll offset. */}
      <AnimatePresence>
        {!inCardPayInView && (
          <StickyPayBar
            key="checkout-sticky-pay-bar"
            total={total}
            savings={totalSavings}
            stagedLabel={isStaged ? stagedLabel : undefined}
            paying={paying}
            disabled={payLocked || (isStaged && total <= 0)}
            onPay={handlePay}
            onMeasure={setStickyBarHeight}
          />
        )}
      </AnimatePresence>
    </div>
    </RevealOnMount>
  );
}
