import { useEffect, useState, useRef } from "react";
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
import { Loader2, Tag, BookOpen, ArrowLeft, CheckCircle2, Lock, X } from "lucide-react";
import { AnimatePresence, motion, useInView } from "framer-motion";
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
import { isAndroid, isNative } from "@/lib/platform";
import { hapticImpact, hapticSelection, tapTick } from "@/lib/haptics";
import { track } from "@/lib/analytics";
import { RAZORPAY_THEME_COLOR } from "@/lib/brand";

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
  return (
    <div className="space-y-6" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading secure checkout…</span>

      {/* Back link */}
      <SkeletonLine width={56} height={14} className="-mb-3" />

      {/* Header: 64px thumb + title/instructor */}
      <div className="flex items-start gap-4">
        <SkeletonBlock className="h-16 w-16 shrink-0 rounded-xl" height={64} />
        <div className="min-w-0 flex-1 space-y-2 pt-1">
          <SkeletonLine width="70%" height={20} />
          <SkeletonLine width="40%" height={14} />
        </div>
      </div>

      <div className="h-px w-full bg-border" aria-hidden />

      {/* What you'll get */}
      <div className="space-y-2">
        <SkeletonLine width={96} height={12} />
        <SkeletonBlock className="rounded-lg" height={40} />
        <SkeletonBlock className="rounded-lg" height={40} />
      </div>

      {/* Guest details (anon checkout) — mirrors the {!user} block:
          a "Your details" / "Sign in" header row, three labelled inputs
          (label is `.caption` = 18px, Input is h-10 = 40px, rounded-[12px]),
          and the two-line reassurance note. Dimensions are shared with the
          real fields so the anon handoff stays flush. */}
      {showGuestForm && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <SkeletonLine width={72} height={12} />
            <SkeletonLine width={148} height={12} />
          </div>
          {/* name / email / phone: 18px label + 40px input */}
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <SkeletonLine width={[64, 92, 100][i]} height={18} />
              <SkeletonBlock className="rounded-[12px]" height={40} />
            </div>
          ))}
          {/* Two-line helper note */}
          <div className="space-y-1.5">
            <SkeletonLine width="100%" height={12} />
            <SkeletonLine width="75%" height={12} />
          </div>
        </div>
      )}

      {/* Coupon field */}
      <div className="space-y-2">
        <SkeletonLine width={88} height={12} />
        <SkeletonBlock className="rounded-md" height={40} />
      </div>

      <div className="h-px w-full bg-border" aria-hidden />

      {/* Order summary */}
      <div className="space-y-2.5">
        <SkeletonLine width={160} height={24} />
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <SkeletonLine width={72} height={14} />
            <SkeletonLine width={64} height={14} />
          </div>
          <div className="flex items-center justify-between">
            <SkeletonLine width={56} height={14} />
            <SkeletonLine width={48} height={14} />
          </div>
          <div className="h-px w-full bg-border" aria-hidden />
          <div className="flex items-center justify-between">
            <SkeletonLine width={48} height={16} />
            <SkeletonLine width={72} height={16} />
          </div>
        </div>
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
    <div className="min-h-screen bg-canvas flex flex-col lg:flex-row lg:items-start lg:justify-center gap-8 px-4 py-12 md:py-20 pb-28 lg:pb-12">
      <Card className="w-full max-w-[560px] border-border bg-surface">
        <CardContent className="p-6 md:p-8">
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
  // Coupon entry + apply/remove. Validation runs through the validate-coupon
  // edge function (the coupons table is admin-read-only). See useCheckoutCoupon.
  const {
    couponCode, setCouponCode,
    appliedCoupon, couponLoading,
    applyCoupon, removeCoupon,
  } = useCheckoutCoupon(offeringId);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [fieldTouched, setFieldTouched] = useState<Record<string, boolean>>({});
  const [paying, setPaying] = useState(false);
  const paymentInFlightRef = useRef(false);
  const [application, setApplication] = useState<any>(null);
  const [totalPreviouslyPaid, setTotalPreviouslyPaid] = useState(0);

  // Sticky-bar handoff (mirrors the offering page's sticky→inline pattern): the
  // mobile StickyPayBar and the in-card Pay button are the same champagne CTA, so
  // showing both at once — as happens once the buyer scrolls the in-card button
  // into view — lights two identical pay actions in one viewport. We observe the
  // in-card button and suppress the sticky bar the moment it's on screen, so
  // exactly one pay action is lit at any scroll offset. The negative bottom
  // margin (~ the bar's own height incl. safe area) means the button only counts
  // as "in view" once it clears the sticky bar's footprint — no frame where the
  // lit bar overlaps the lit button. No IntersectionObserver (SSR / older
  // WebView) → stays false → bar shown, preserving the historical behaviour.
  const inCardPayRef = useRef<HTMLButtonElement>(null);
  const inCardPayInView = useInView(inCardPayRef, { margin: "0px 0px -96px 0px" });

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

  const isStaged = paymentType !== "full" && (offering as any)?.payment_mode === "staged";
  const stagedLabel = paymentType === "app_fee" ? "Application Fee"
    : paymentType === "confirmation" ? "Confirmation Amount"
    : paymentType === "balance" ? "Balance Payment" : "";

  /* -- Pricing (one shared home: @shared/pricing, used by the order edge
        functions too, so the preview can't drift from what's charged) -- */
  const { subtotal, discount, gstRate, gstAmount, total, totalSavings } = useCheckoutPricing({
    offering,
    bumps,
    selectedBumps,
    appliedCoupon,
    isStaged,
    paymentType,
    totalPreviouslyPaid,
  });

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

      // Phase-3 conversion funnel: a real Razorpay order exists and the modal is
      // about to open. Keyed on our internal payment_order_id so it joins the
      // ThankYou purchase_completed event on the same id.
      track({ name: "payment_initiated", orderId: data.payment_order_id });

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
        theme: { color: RAZORPAY_THEME_COLOR, backdrop_color: "rgba(0,0,0,0.8)" },
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
                  <p id="guest-name-error" role="alert" className="text-xs text-destructive mt-1">
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
                  <p id="guest-email-error" role="alert" className="text-xs text-destructive mt-1">
                    Please enter a valid email
                  </p>
                )}
              </div>
              <div onBlur={() => setGuestTouched((s) => ({ ...s, phone: true }))}>
                <label htmlFor="guest-phone" className="caption mb-1 block">
                  Phone number
                </label>
                <PhoneInput
                  id="guest-phone"
                  value={guestPhone}
                  onChange={setGuestPhone}
                  placeholder="Phone number"
                  aria-invalid={guestPhoneError}
                  aria-describedby={guestPhoneError ? "guest-phone-error" : undefined}
                />
                {guestPhoneError && (
                  <p id="guest-phone-error" role="alert" className="text-xs text-destructive mt-1">
                    Please enter a valid phone number
                  </p>
                )}
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
                      className="min-h-[44px] min-w-[44px] rounded-full hover:bg-[hsl(var(--accent-emerald)/0.2)] flex items-center justify-center transition-colors"
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

          <Separator className="bg-border" />

          {/* -- Order summary --
              Dotted-leader rows (label … value, like a printed receipt) under
              an Instrument-Serif heading. The leader is a flex-1 dotted border
              between each label and its amount. */}
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
            ref={inCardPayRef}
            variant="champagne"
            size="xl"
            className="w-full"
            onClick={handlePay}
            // handlePay fires a deliberate heavier hapticImpact("medium") for the
            // money moment; suppress the Button's default tapTick so the pay tap
            // doesn't double-buzz.
            haptic={false}
            disabled={paying || (isStaged && total <= 0)}
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
                isStaged
                  ? `Pay ${stagedLabel}: ₹${total.toLocaleString("en-IN")}`
                  : total <= 0
                    ? "Enrol free"
                    : `Pay ₹${total.toLocaleString("en-IN")}`
              }
            />
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
            disabled={isStaged && total <= 0}
            onPay={handlePay}
          />
        )}
      </AnimatePresence>
    </div>
    </RevealOnMount>
  );
}
