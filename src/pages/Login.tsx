import { useState, useCallback, useEffect, useRef } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowRight, ShieldCheck, ChevronLeft } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import usePageTitle from "@/hooks/usePageTitle";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { InstructorProof } from "@/components/auth/InstructorProof";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";
import { isNative } from "@/lib/platform";
import { hapticImpact } from "@/lib/haptics";
import { MotionButton } from "@/components/motion/MotionButton";
import { springs, instant, otpSuccess, useMotionSafe } from "@/lib/motion";
import heroCinematic from "@/assets/login/hero-cinematic.jpg";

// After a session is minted, brand-new phone-first accounts haven't told us
// their crafts yet (and signups haven't given a name/email), so we route them
// through /onboarding. Returning users with craft_interests already set go
// straight to their intended destination. Defensive: any read failure falls
// back to /onboarding so we never strand a user who lacks crafts.
const resolvePostAuthDestination = async (
  userId: string,
  fallback: string
): Promise<string> => {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("craft_interests")
      .eq("id", userId)
      .single();
    if (error) return "/onboarding";
    const crafts = (data?.craft_interests ?? []).filter(Boolean);
    return crafts.length > 0 ? fallback : "/onboarding";
  } catch {
    return "/onboarding";
  }
};

type Step = "phone" | "otp" | "email_input" | "email_sent";

// While true, every user (Indian or not) auths via email magic link.
// While false, +91 phones go through the MSG91 OTP widget (browser-side
// send via window.sendOtp, then a verify-msg91-otp edge function call
// that mints a Supabase session). Non-+91 phones still fall through to
// email magic link.
const EMAIL_ONLY_AUTH = false;

const VERIFY_MSG91_OTP_URL =
  "https://ivkvluezuiojovpotlyb.supabase.co/functions/v1/verify-msg91-otp";

// STEAL-8 (P4-T9): the bounded window the OTP success choreography plays before
// the client route paints lives in the shared motion token `otpSuccess.windowMs`
// (src/lib/motion.ts), synced with the framer timings OtpEntryStep drives. The
// session is already minted when this delay runs, so auth is byte-identical —
// only the on-screen route transition waits, and never longer than this cap.
// Reduced motion collapses it to an instant route.
const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// 2026-05-26: Login refactor (Mobbin synthesis).
// - Killed the 5-slide carousel; replaced with one static cinematic still
//   (generated via gpt-image-2). Carousels split attention and tank the
//   only metric that matters here: did the user complete OTP.
// - Headline is now a singular question ("What's your number?") instead
//   of the returning-user "Welcome back" framing; ~half of /login
//   arrivals are first-touch from ads.
//
// 2026-05-30: Cinematic redesign. One unified responsive composition for
// web AND native (reverses the earlier native logo-only layout): a
// full-bleed hero with the "Make your best work." headline, then a glassy
// form card with a champagne "Send code →" CTA, a Secure & private line,
// star social proof, and a slim legal footer. Single column on mobile +
// native; two columns (form left / hero right) from `lg` up on web. The
// auth logic (phone/OTP/email) is unchanged.
const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const ms = useMotionSafe();

  // True while the OTP success choreography is playing, so the reactive
  // user → /home effect below defers its route paint by the same bounded window
  // as handleVerify (keeping the resulting destination unchanged, just delayed).
  // A ref, not state — read synchronously inside the effect, no extra render.
  const celebratingRef = useRef(false);

  // Holds the STEAL-8 post-success navigate timer so it can be cleared if the
  // component unmounts first (e.g. a route change beats the celebration window),
  // avoiding a navigate() call from an unmounted component.
  const navTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
    },
    [],
  );

  // Drives the mobile bottom-sheet rise (framer springs.glide). Desktop keeps
  // its static two-column layout — the rise is a mobile-only gesture.
  // Initialise synchronously from matchMedia so the FIRST paint already knows it
  // is desktop: a post-paint useState(false)→effect flip would make lg+ compute
  // sheetRise=true for one frame and framer would spring the (inline transform,
  // NOT breakpoint-gated) form column up on every desktop login — the exact
  // regression the old `lg:animate-none` guard prevented.
  const [isDesktop, setIsDesktop] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 1024px)").matches,
  );
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(min-width: 1024px)");
    const sync = () => setIsDesktop(mql.matches);
    sync();
    mql.addEventListener?.("change", sync);
    return () => mql.removeEventListener?.("change", sync);
  }, []);

  const [step, setStep] = useState<Step>(EMAIL_ONLY_AUTH ? "email_input" : "phone");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState<"sms" | "whatsapp">("sms");
  const [loading, setLoading] = useState(false);

  // Welcome V2: the first paint is a full-bleed brand hero with "Sign in" /
  // "Create account" pills. Tapping "Sign in" expands the phone form up from
  // the bottom (bottom-sheet feel); `formOpen` drives that reveal. On the
  // email-only fallback we skip straight into the form so the welcome layer
  // never traps a non-Indian user. Once the user is past the phone step
  // (OTP / email), the form is always open.
  const [formOpen, setFormOpen] = useState(EMAIL_ONLY_AUTH);

  // Animation key so the form column re-mounts the slide-in animation
  // on every step transition.
  const [stepKey, setStepKey] = useState(0);
  const goToStep = useCallback((next: Step) => {
    setStep(next);
    setStepKey((k) => k + 1);
    // Any step beyond the initial phone entry is a committed flow, so keep the
    // form sheet open so back-navigation lands on the form, not the welcome.
    if (next !== "phone") setFormOpen(true);
  }, []);

  usePageTitle("Sign In");

  useEffect(() => {
    if (authLoading || !user) return;
    // Normal (already-authed) visits route immediately. During the OTP success
    // celebration, handleVerify already owns the bounded, destination-aware
    // navigation (it scheduled its timer AFTER resolving the real destination),
    // so this reactive path must stand down. Running its own timer here raced
    // handleVerify's — starting earlier (at user-propagation, before the
    // destination resolves) and firing '/home' first, cutting the digits-merge
    // choreography short under latency. Standing down lets the choreography play
    // its full window and keeps the final destination handleVerify computed.
    if (celebratingRef.current) return;
    navigate("/home", { replace: true });
  }, [user, authLoading, navigate]);

  // Best-effort widget init on mount. If it fails (script blocked, env
  // vars missing) we'll retry inside handleSendOtp; the UI doesn't
  // surface this until the user actually clicks "Continue".
  useEffect(() => {
    if (EMAIL_ONLY_AUTH) return;
    initMsg91().catch(() => {});
  }, []);

  if (authLoading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  // Normally an authed `user` means "already signed in" → render nothing and let
  // the reactive effect above redirect. But during the OTP success choreography,
  // setSession flips `user` truthy MID-handleVerify (inside the awaited
  // resolvePostAuthDestination round-trip) — before OtpEntryStep can set
  // `verified`. Returning null there would unmount the child and kill the
  // digits-merge-to-check celebration, leaving a blank hold until the navTimer
  // fires. celebratingRef (set synchronously in onVerify, below) latches that
  // window so we stay mounted and let the choreography play to completion; the
  // navTimer owns the actual route paint.
  if (user && !celebratingRef.current) return null;

  const rawFrom =
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/home";
  const redirectTarget = rawFrom.startsWith("/") && !rawFrom.includes("//") ? rawFrom : "/home";
  const isIndianPhone = phone.startsWith("+91");
  // App Review demo login: reviewers cannot receive an Indian OTP, so for
  // exactly this reserved number we skip the MSG91 widget and let
  // verify-msg91-otp validate the typed 4-digit code against its
  // REVIEW_LOGIN_CODE secret (server-side kill switch). See the edge fn.
  const isReviewLogin = phone === "+918888777666";

  const sendSmsOtp = async (waMode = false): Promise<{ ok: boolean; error?: string }> => {
    try {
      await initMsg91();
      if (waMode) {
        await widgetRetryOtp("whatsapp");
      } else {
        await widgetSendOtp(phone);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Couldn't send OTP" };
    }
  };

  const handleSendOtp = async () => {
    if (!phone) {
      toast({ title: "Enter your phone number", variant: "destructive" });
      return;
    }
    if (!isIndianPhone) {
      goToStep("email_input");
      return;
    }
    if (isReviewLogin) {
      // No SMS exists for the reserved review number; go straight to the
      // code entry, which the server validates against its secret.
      setChannel("sms");
      goToStep("otp");
      return;
    }
    setLoading(true);
    const res = await sendSmsOtp(false);
    setLoading(false);
    if (!res.ok) {
      // Send failures here are widget/env errors, never "no account":
      // the MSG91 widget sends to any number, account existence is only
      // known after verification (handled in handleVerify).
      toast({ title: "Couldn't send OTP", description: res.error, variant: "destructive" });
      return;
    }
    setChannel("sms");
    goToStep("otp");
  };

  const handleVerify = async (otp: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      let token: string | null = null;
      if (!isReviewLogin) {
        try {
          const r = await widgetVerifyOtp(otp);
          token = r.accessToken;
        } catch (e) {
          return { ok: false, error: e instanceof Error ? e.message : "Wrong code. Try again." };
        }
      }

      const resp = await fetch(VERIFY_MSG91_OTP_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
        body: JSON.stringify(
          isReviewLogin ? { phone, reviewCode: otp } : { phone, accessToken: token }
        ),
      });
      const data = await resp.json();
      if (!resp.ok) {
        if (data?.error === "signup_requires_email_and_name") {
          return { ok: false, error: "No account with this number. Sign up first." };
        }
        if (data?.error === "invalid_otp") return { ok: false, error: "Wrong code. Try again." };
        if (data?.error === "user_missing_email") return { ok: false, error: "Account is missing an email, please contact support." };
        return { ok: false, error: data?.detail || data?.error || "Verification failed" };
      }
      const { data: sessionData, error: setErr } = await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });
      if (setErr) return { ok: false, error: setErr.message };
      const uid = sessionData.user?.id;
      const dest = uid
        ? await resolvePostAuthDestination(uid, redirectTarget)
        : redirectTarget;
      // STEAL-8: hold the route paint for the success choreography. Session is
      // already set above (auth unchanged); only this client transition waits.
      // Tracked in a ref so an early unmount can cancel it (see cleanup effect).
      navTimerRef.current = window.setTimeout(
        () => navigate(dest, { replace: true }),
        prefersReducedMotion() ? 0 : otpSuccess.windowMs,
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Invalid OTP" };
    }
  };

  const handleSwitchToWA = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await sendSmsOtp(true);
    if (res.ok) setChannel("whatsapp");
    return res;
  };

  const handleSwitchToEmail = () => goToStep("email_input");

  // Back affordance: step the user one level back toward the phone entry
  // screen. Critical on iOS where there's no system back button. The OTP
  // step owns its own in-card back control, so the top chevron is only
  // shown for the email steps (and never on the initial phone step).
  const canGoBack = step === "email_input" || step === "email_sent";
  const handleBack = () => {
    if (step === "email_input" || step === "email_sent") {
      setEmail("");
      goToStep("phone");
    }
  };

  const handleEmailSubmit = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast({ title: "Enter a valid email", variant: "destructive" });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}${redirectTarget}`,
      },
    });
    setLoading(false);
    if (error) {
      toast({ title: "Couldn't send email", description: "We couldn't send the login email. Please check the address and try again.", variant: "destructive" });
      return;
    }
    goToStep("email_sent");
  };

  const native = isNative();
  const stepNum = step === "phone" ? 1 : step === "otp" ? 2 : null;

  const stepContent = (
    <>
      {step === "phone" && (
        <>
          <h1 className="text-[28px] sm:text-[30px] font-semibold tracking-[-0.015em] leading-[1.1] mb-2">
            What's your <span className="font-serif-italic text-cream">number</span>?
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            We'll text a code. No password to remember.
          </p>

          <form
            onSubmit={(e) => { e.preventDefault(); handleSendOtp(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="phone" className="text-xs text-muted-foreground">Phone number</Label>
              <PhoneInput value={phone} onChange={setPhone} autoFocus={!native} />
            </div>

            <button
              type="submit"
              disabled={loading || !phone}
              className="btn-champagne pressable w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send code
              {!loading && <ArrowRight className="h-4 w-4" />}
            </button>
          </form>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Secure &amp; private
          </div>
        </>
      )}

      {step === "otp" && (
        <OtpEntryStep
          phone={phone}
          channel={channel}
          otpLength={4}
          // Login's stepDivider above the card already renders "Step 2 of 2";
          // suppress the component's own badge so it isn't shown twice.
          showStepBadge={false}
          onVerify={async (otp) => {
            // Open the success-celebration window BEFORE verifying: setSession
            // flips `user` and would otherwise fire the reactive /home nav before
            // the choreography can play. A failed verify restores instant nav.
            celebratingRef.current = true;
            const res = await handleVerify(otp);
            if (!res.ok) celebratingRef.current = false;
            return res;
          }}
          onResendSms={() => sendSmsOtp(false)}
          onSwitchToWhatsApp={handleSwitchToWA}
          onSwitchToEmail={handleSwitchToEmail}
          onBack={() => { goToStep("phone"); setChannel("sms"); }}
        />
      )}

      {step === "email_input" && (
        <>
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] mb-2">
            Sign in with <span className="font-serif-italic text-cream">email</span>
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            We'll email a one-click sign-in link.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleEmailSubmit(); }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email" className="text-xs text-muted-foreground">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus={!native}
                required
                className="bg-surface border-border focus:border-foreground h-12 rounded-xl text-base"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="btn-champagne pressable w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Send sign-in link
            </button>
            {!EMAIL_ONLY_AUTH && (
              <button
                type="button"
                onClick={() => goToStep("phone")}
                className="block w-full text-center text-xs text-muted-foreground hover:text-cream"
              >
                ← Use phone instead
              </button>
            )}
          </form>
        </>
      )}

      {step === "email_sent" && (
        <div className="text-center space-y-4 py-6">
          <div className="w-12 h-12 rounded-full bg-[hsl(var(--gold)/0.15)] flex items-center justify-center mx-auto">
            <Mail className="h-6 w-6 text-cream" />
          </div>
          <h2 className="text-lg font-semibold">Check your email</h2>
          <p className="text-sm text-muted-foreground">
            We sent a sign-in link to <span className="text-foreground font-medium">{email}</span>
          </p>
          <button
            onClick={() => { goToStep(EMAIL_ONLY_AUTH ? "email_input" : "phone"); setEmail(""); }}
            className="text-sm text-cream hover:underline"
          >
            Use a different email
          </button>
        </div>
      )}
    </>
  );

  // ── Reusable composition fragments ──────────────────────────────────
  const stepDivider = stepNum ? (
    <div className="flex items-center gap-3 mb-4">
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Sign in</span>
      <span className="h-px flex-1 bg-border/70" />
      <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Step {stepNum} of 2</span>
    </div>
  ) : null;

  const socialProof = <InstructorProof className="mt-6 pb-safe" />;

  const formBlock = (
    <div className="w-full max-w-[400px] mx-auto">
      <div key={stepKey} className="animate-slide-left-in">
        {stepDivider}
        <div className="glass-card rounded-3xl p-6 sm:p-7">
          {stepContent}
        </div>
        {step === "phone" && socialProof}
        {step === "phone" && (
          <p className="mt-6 text-sm text-center text-muted-foreground">
            New here?{" "}
            <Link to="/signup" className="font-semibold text-cream hover:underline">
              Create an account
            </Link>
          </p>
        )}
      </div>
    </div>
  );

  // ── Welcome V2 (mobile/native) + two-column web composition ─────────
  // Mobile: the hero is FULL-BLEED behind everything (absolute inset-0), never
  //   collapsing, even on the OTP step (item 7). On first paint the welcome
  //   pills sit over it; tapping "Sign in" slides the phone form up as a
  //   bottom-sheet over the (now heavily scrimmed) hero.
  // Desktop (lg+): unchanged two-column, form left, hero right pane.
  const showWelcome = step === "phone" && !formOpen && !EMAIL_ONLY_AUTH;
  // Heavier scrim once the form sheet is up so card text never fights the photo.
  const sheetUp = !showWelcome;
  // The bottom-sheet rise is a mobile-only gesture; desktop stays static, and
  // reduced motion drops the rise so the form just appears.
  const sheetRise = !isDesktop && ms.enabled;

  return (
    <div className="relative min-h-[100dvh] bg-canvas flex flex-col lg:flex-row lg:overflow-hidden">
      {/* HERO: full-bleed behind on mobile, right pane on desktop */}
      <div className="absolute inset-0 overflow-hidden lg:static lg:order-2 lg:h-auto lg:min-h-[100dvh] lg:flex-1 lg:inset-auto">
        <img
          src={heroCinematic}
          alt="A filmmaker on set, locked into the moment behind a cinema camera"
          className="absolute inset-0 w-full h-full object-cover kenburns"
          loading="eager"
        />
        {/* Mobile scrim: light on the welcome screen (let the photo breathe),
            heavy once the form sheet rises so card copy stays legible. */}
        <div
          className={`absolute inset-0 transition-opacity duration-500 bg-gradient-to-t lg:hidden ${
            sheetUp
              ? "from-canvas via-canvas/85 to-canvas/55"
              : "from-canvas via-canvas/55 to-canvas/15"
          }`}
        />
        {/* Desktop scrim */}
        <div className="absolute inset-0 hidden lg:block bg-gradient-to-t from-black/85 via-black/35 to-black/10" />

        {/* Desktop hero copy */}
        <div className="relative z-10 hidden lg:flex flex-col justify-end h-full p-12 pb-16">
          <div className="max-w-[520px]">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground mb-4">
              Make. Ship. Repeat.
            </p>
            <h2 className="text-[44px] xl:text-[56px] leading-[1.02] font-semibold text-foreground mb-4 max-w-[14ch]">
              Make your <span className="font-serif-italic text-cream">best work</span>.
            </h2>
            <p className="text-base text-muted-foreground max-w-[440px] leading-relaxed">
              Cohorts, masterclasses, and craft programs across film, writing,
              design, content, and AI, taught by India's best working creators.
            </p>
          </div>
        </div>
      </div>

      {/* MOBILE WELCOME LAYER: full-bleed brand hero + entry pills (item 9) */}
      {showWelcome && (
        <div className="relative z-10 flex flex-col flex-1 px-6 pb-8 pt-6 safe-top safe-bottom lg:hidden">
          <LevelUpWordmark className="h-7 w-auto text-foreground" />
          <div className="flex-1 flex flex-col justify-end">
            <h1 className="text-[44px] sm:text-[52px] leading-[1.02] font-semibold text-foreground max-w-[12ch]">
              Make your <span className="font-serif-italic text-cream">best work</span>.
            </h1>
            <p className="text-sm text-muted-foreground mt-4 max-w-[34ch]">
              Learn from India's best, across film, writing, design, content, and AI.
            </p>

            <div className="mt-7 space-y-3">
              <button
                type="button"
                onClick={() => { hapticImpact("light"); setFormOpen(true); }}
                className="btn-champagne pressable w-full h-[52px] flex items-center justify-center gap-2 text-base font-semibold"
              >
                Sign in
                <ArrowRight className="h-4 w-4" />
              </button>
              <Link
                to="/signup"
                className="pressable w-full h-[52px] rounded-full border border-border bg-canvas/40 backdrop-blur-sm flex items-center justify-center text-base font-semibold text-foreground [@media(hover:hover)]:hover:border-border-hover"
              >
                Create account
              </Link>
            </div>

            <InstructorProof className="mt-7 pb-safe" />
          </div>
        </div>
      )}

      {/* FORM COLUMN: a rounded bottom-sheet rising over the hero on mobile.
          On lg+ it is ALWAYS rendered: the welcome layer above is lg:hidden
          (a mobile-only concept), so gating this column on !showWelcome left
          desktop with a full-bleed hero and no sign-in control at all. */}
      <motion.div
        initial={false}
        animate={
          sheetRise
            ? sheetUp
              ? { y: 0, opacity: 1 }
              : { y: 24, opacity: 0 }
            : { y: 0, opacity: 1 }
        }
        transition={ms.reduced ? instant : springs.glide}
        className={`relative z-10 ${showWelcome ? "hidden lg:flex" : "flex"} flex-col flex-1 bg-canvas rounded-t-[28px] mt-auto px-5 pt-7 pb-6 safe-bottom lg:bg-transparent lg:rounded-none lg:mt-0 lg:w-[480px] lg:min-w-[480px] lg:flex-none lg:border-r lg:border-border lg:px-10 lg:py-8`}
      >
          {/* Grabber handle (mobile only) reinforces the bottom-sheet feel */}
          <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border lg:hidden" />

          {/* Top bar: back affordance (iOS has no system back button) + desktop
              wordmark. Reserves a stable 44px row so nothing shifts per step. */}
          <div className="flex items-center gap-2 min-h-[44px] mb-4 lg:mb-8">
            {(canGoBack || step === "phone") && (
              <MotionButton
                type="button"
                onClick={() => {
                  if (canGoBack) handleBack();
                  else setFormOpen(false);
                }}
                aria-label="Back"
                className={`-ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted-foreground [@media(hover:hover)]:hover:text-foreground lg:-ml-3 ${
                  // The phone-step back returns to the mobile welcome sheet,
                  // which doesn't exist on lg+ (this column always shows there).
                  !canGoBack ? "lg:hidden" : ""
                }`}
              >
                <ChevronLeft className="h-6 w-6" />
              </MotionButton>
            )}
            <LevelUpWordmark className="hidden lg:block text-xl" />
          </div>

          <div className="flex-1 flex flex-col justify-start pt-2 lg:justify-center lg:pt-0">
            {formBlock}
          </div>
        </motion.div>
    </div>
  );
};

export default Login;
