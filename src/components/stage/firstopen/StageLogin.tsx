import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { AlertCircle, Check, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { supabase, supabaseUrl, supabasePublishableKey } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import usePageTitle from "@/hooks/usePageTitle";
import { initMsg91, sendOtp as widgetSendOtp, verifyOtp as widgetVerifyOtp, retryOtp as widgetRetryOtp } from "@/lib/msg91-widget";
import { resolveLoginRedirect, prefillPhoneParam } from "@/lib/loginParams";
import { isStagingTestLogin } from "@/lib/stagingLogin";
import { confirm, hapticImpact } from "@/lib/haptics";
import { playSound } from "@/lib/sound";
import { pickIntroMode } from "@/lib/intro";
import { BrandIntro } from "@/components/brand/BrandIntro";
import { SignInMoment } from "@/components/brand/SignInMoment";
import { LevelUpMark } from "@/components/brand/LevelUpMark";
import { LevelUpLoader } from "@/components/brand/LevelUpLoader";
import { PhotoWall } from "./PhotoWall";
import { INTRO_PHOTOS } from "./photos";
import "@/styles/stage-ui.css";
import "./firstopen.css";

/*
 * The first open, round 4 (design/stage/HANDOVER_first_open.md, mockup
 * 15_LMS_Experience_Lab/first-open.html). Rendered for /login and /signup
 * under VITE_BRAND_STAGE; `?classic=1` keeps the old page (email sign-in and
 * numbers outside India live there).
 *
 *   first visit on this device -> BrandIntro over 12 of LevelUp's photos
 *   -> the wall -> Continue -> your number -> the code -> SignInMoment
 *   -> /onboarding for new people, otherwise where they were going.
 *
 * New or returning is the same step. The code is checked by the same
 * verify-msg91-otp call /login makes; only if the number has no account do we
 * ask it to create one, with the placeholders /signup sends. That order keeps
 * the old TagMango buyers' purchases claiming on their first sign-in.
 */

const VERIFY_URL = `${supabaseUrl}/functions/v1/verify-msg91-otp`;
const REVIEW_PHONE = "+918888777666";
const CODE_LENGTH = 4;
const RESEND_SECONDS = 30;
// Placeholders for a brand-new phone-first account, as /signup sends them;
// Onboarding collects the real name and email straight after.
const syntheticEmail = (phone: string) => `${phone.replace(/\D/g, "")}@phone.leveluplearning.in`;
const PLACEHOLDER_NAME = "LevelUp Student";

type Step = "wall" | "phone" | "code";
type VerifyBody = Record<string, string>;
type VerifyReply = { ok: boolean; data: { error?: string; detail?: string; access_token?: string; refresh_token?: string; is_new_user?: boolean } };

// Same rule as Login.tsx: brand-new accounts and anyone never asked their
// crafts (craft_interests still NULL) go through onboarding, once; a skip
// saves an empty list, which counts as asked. A buyer coming back from
// checkout sees their order first.
// Duplicated rather than imported so the flag-off /login stays byte-identical.
const resolvePostAuthDestination = async (userId: string, fallback: string): Promise<string> => {
  if (fallback.startsWith("/thank-you/")) return fallback;
  try {
    const { data, error } = await supabase.from("users").select("craft_interests").eq("id", userId).single();
    if (error) return "/onboarding";
    return data?.craft_interests != null ? fallback : "/onboarding";
  } catch {
    return "/onboarding";
  }
};

const postVerify = async (body: VerifyBody): Promise<VerifyReply> => {
  const resp = await fetch(VERIFY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: supabasePublishableKey },
    body: JSON.stringify(body),
  });
  const data = await resp.json().catch(() => ({}));
  return { ok: resp.ok, data };
};

const formatNational = (digits: string) => (digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits);

export default function StageLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  usePageTitle("Sign In");

  const fromState = (location.state as { from?: { pathname?: string }; phone?: string } | null) ?? null;
  const redirectTarget = resolveLoginRedirect(fromState?.from?.pathname, searchParams.get("next"));
  const prefilled = prefillPhoneParam(fromState?.phone ?? searchParams.get("phone"));
  // A link straight to /login (a sales page, checkout, a guarded route) goes
  // straight to the number, with no intro and no wall (handover section 1).
  const deepLinked = Boolean(fromState?.from || searchParams.get("next") || prefilled);

  const [step, setStep] = useState<Step>(deepLinked ? "phone" : "wall");
  const [nonce, setNonce] = useState(0);
  const [intro, setIntro] = useState(
    () => !deepLinked && pickIntroMode({ signedIn: false, homeCached: false, openedFromLink: false }) === "first",
  );
  const [digits, setDigits] = useState(() => (prefilled.startsWith("+91") ? prefilled.slice(3, 13) : ""));
  const [phoneError, setPhoneError] = useState(false);
  const [sending, setSending] = useState(false);
  const [code, setCode] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const [codeError, setCodeError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState(false);
  const [left, setLeft] = useState(RESEND_SECONDS);
  const [moment, setMoment] = useState<{ eyebrow: string; title: string; dest: string } | null>(null);
  const [paused, setPaused] = useState(false);

  const celebratingRef = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  const wallStepRef = useRef<HTMLDivElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const boxRefs = useRef<(HTMLInputElement | null)[]>([]);

  const phone = `+91${digits}`;
  const reviewLike = phone === REVIEW_PHONE || isStagingTestLogin(phone);
  const testHint = isStagingTestLogin(phone);

  const go = useCallback((next: Step) => {
    setStep(next);
    setNonce((n) => n + 1);
  }, []);

  // Already signed in (and not mid sign-in moment): leave, as /login does.
  useEffect(() => {
    if (authLoading || !user || celebratingRef.current) return;
    navigate(redirectTarget, { replace: true });
  }, [user, authLoading, navigate, redirectTarget]);

  useEffect(() => {
    initMsg91().catch(() => {});
  }, []);

  // Pause the drift while the page is hidden.
  useEffect(() => {
    const sync = () => setPaused(document.hidden);
    document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, []);

  // The gradient's solid end always sits under the words, however they wrap.
  useLayoutEffect(() => {
    const place = () => {
      const root = rootRef.current, w = wallStepRef.current;
      if (!root || !w) return;
      const top = w.getBoundingClientRect().top - root.getBoundingClientRect().top;
      if (top > 0) root.style.setProperty("--ft", `${Math.round(top)}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [intro, step]);

  // Focus the field once the step has arrived (not on touch: no surprise keyboard).
  useEffect(() => {
    const fine = typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;
    const t = window.setTimeout(() => {
      if (step === "phone" && fine) phoneRef.current?.focus({ preventScroll: true });
      if (step === "code") boxRefs.current[0]?.focus({ preventScroll: true });
    }, 450);
    return () => window.clearTimeout(t);
  }, [step, nonce]);

  // Resend countdown on the code step.
  useEffect(() => {
    if (step !== "code") return;
    setLeft(RESEND_SECONDS);
    const iv = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => window.clearInterval(iv);
  }, [step, nonce]);

  const sendCode = async () => {
    if (digits.length !== 10) {
      setPhoneError(true);
      playSound("error");
      return;
    }
    setSending(true);
    try {
      if (!reviewLike) {
        await initMsg91();
        await widgetSendOtp(phone);
      }
      setCode(Array(CODE_LENGTH).fill(""));
      setCodeError(false);
      go("code");
    } catch (e) {
      toast.error("We couldn't send the code", { description: e instanceof Error ? e.message : "Check your connection and try again." });
    } finally {
      setSending(false);
    }
  };

  const resend = async (channel: "sms" | "whatsapp") => {
    if (reviewLike) return;
    try {
      await widgetRetryOtp(channel);
      setLeft(RESEND_SECONDS);
      toast(channel === "whatsapp" ? "Code sent on WhatsApp" : "New code sent");
    } catch (e) {
      toast.error("We couldn't resend the code", { description: e instanceof Error ? e.message : undefined });
    }
  };

  const wrongCode = () => {
    setChecking(false);
    setCodeError(true);
    setCode(Array(CODE_LENGTH).fill(""));
    playSound("error");
    void confirm(false);
    window.setTimeout(() => boxRefs.current[0]?.focus({ preventScroll: true }), 50);
  };

  const verify = async (value: string) => {
    if (checking || verified || value.length !== CODE_LENGTH) return;
    setChecking(true);
    setCodeError(false);
    try {
      let token: string | null = null;
      if (!reviewLike) {
        try {
          token = (await widgetVerifyOtp(value)).accessToken;
        } catch {
          wrongCode();
          return;
        }
      }
      const base: VerifyBody = reviewLike ? { phone, reviewCode: value } : { phone, accessToken: token as string };
      // Sign in first; only a number with no account (and no old purchase to
      // claim) is asked to create one.
      let reply = await postVerify(base);
      if (!reply.ok && reply.data?.error === "signup_requires_email_and_name") {
        reply = await postVerify({ ...base, email: syntheticEmail(phone), full_name: PLACEHOLDER_NAME });
      }
      if (!reply.ok) {
        if (reply.data?.error === "invalid_otp") {
          wrongCode();
          return;
        }
        setChecking(false);
        toast.error("We couldn't sign you in", { description: reply.data?.detail || reply.data?.error || "Try again in a moment." });
        return;
      }
      celebratingRef.current = true;
      const { data: sessionData, error: setErr } = await supabase.auth.setSession({
        access_token: reply.data.access_token as string,
        refresh_token: reply.data.refresh_token as string,
      });
      if (setErr) {
        celebratingRef.current = false;
        setChecking(false);
        toast.error("We couldn't sign you in", { description: setErr.message });
        return;
      }
      const isNew = !!reply.data.is_new_user;
      const uid = sessionData.user?.id;
      const dest = isNew ? "/onboarding" : uid ? await resolvePostAuthDestination(uid, redirectTarget) : redirectTarget;
      setChecking(false);
      setVerified(true);
      setMoment({ eyebrow: isNew ? "Welcome to LevelUp" : "Welcome back", title: "You're in.", dest });
    } catch (e) {
      celebratingRef.current = false;
      setChecking(false);
      toast.error("We couldn't sign you in", { description: e instanceof Error ? e.message : "Check your connection and try again." });
    }
  };

  const setBox = (i: number, raw: string) => {
    const d = raw.replace(/\D/g, "");
    const next = [...code];
    if (d.length > 1) {
      d.slice(0, CODE_LENGTH).split("").forEach((ch, k) => { next[k] = ch; });
      setCode(next);
      boxRefs.current[Math.min(CODE_LENGTH - 1, d.length - 1)]?.focus();
    } else {
      next[i] = d;
      setCode(next);
      if (d && i < CODE_LENGTH - 1) boxRefs.current[i + 1]?.focus();
    }
    setCodeError(false);
    const joined = next.join("");
    if (joined.length === CODE_LENGTH) window.setTimeout(() => void verify(joined), 180);
  };

  const onBoxKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      const next = [...code];
      next[i - 1] = "";
      setCode(next);
      boxRefs.current[i - 1]?.focus();
    }
  };

  const back = () => {
    playSound("close");
    if (step === "code") go("phone");
    else if (deepLinked) navigate(-1);
    else go("wall");
  };

  if (authLoading) return <div className="stage-ui stage-login" aria-hidden="true" />;

  const plain = deepLinked;
  const codeValue = code.join("");

  return (
    <div className="stage-ui stage-login">
      <section
        ref={rootRef}
        className={`fo${plain ? " fo--plain" : ""}${paused ? " is-paused" : ""}`}
        data-step={step}
        aria-label="LevelUp, signed out"
      >
        {!plain && (
          <>
            <PhotoWall cols={3} className="fo-wall fo-wall--phone" onCaption={(c) => toast(c)} />
            <PhotoWall cols={5} className="fo-wall fo-wall--desk" onCaption={(c) => toast(c)} />
            <div className="fo-fade" />
          </>
        )}

        <header className="fo-top">
          <span className="fo-logo"><LevelUpMark showSub={false} className="lu-logo" lineClassName="text-brand-text" /></span>
          <button className="fo-back" type="button" onClick={back} aria-label="Back"><ChevronLeft className="ic" /></button>
        </header>

        {/* 1. The wall */}
        <div
          ref={wallStepRef}
          className={`fo-step${step === "wall" && !intro ? " is-on is-arrive" : ""}`}
          data-s="wall"
          key={`wall-${step === "wall" && !intro ? nonce : "off"}`}
        >
          <h1 className="fo-h rv" style={{ "--k": 0 } as React.CSSProperties}><span>Don't just watch.</span><span>Make the work.</span></h1>
          <p className="fo-sub rv" style={{ "--k": 1 } as React.CSSProperties}>
            Learn from the people behind India's films and music. Make your own work with mentors who review it. Then do it for real, on set.
          </p>
          <button className="btn btn--block fo-cta rv" style={{ "--k": 2 } as React.CSSProperties} type="button" onClick={() => { playSound("tap"); go("phone"); }}>
            Continue
          </button>
          <div className="fo-alt rv" style={{ "--k": 3 } as React.CSSProperties}>
            <Link to="/login?classic=1" className="fo-alt-link">Use email</Link>
          </div>
          <p className="fo-legal rv" style={{ "--k": 4 } as React.CSSProperties}>
            New or returning, it is the same step. By continuing you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.
          </p>
        </div>

        {/* 2. Your number */}
        <div className={`fo-step${step === "phone" ? " is-on is-arrive" : ""}`} data-s="phone" key={`phone-${step === "phone" ? nonce : "off"}`}>
          <button className="fo-dback rv" style={{ "--k": 0 } as React.CSSProperties} type="button" onClick={back}><ChevronLeft className="ic" />Back</button>
          <div className="fo-k rv" style={{ "--k": 0 } as React.CSSProperties}>Sign in or join</div>
          <h1 className="fo-t rv" style={{ "--k": 1 } as React.CSSProperties}>What's your number?</h1>
          <p className="fo-s rv" style={{ "--k": 2 } as React.CSSProperties}>We'll send a {CODE_LENGTH}-digit code by SMS. No password.</p>
          <label className={`field rv${phoneError ? " is-error" : ""}`} style={{ "--k": 3 } as React.CSSProperties}>
            <span className="input-wrap">
              <span className="cc">+91</span>
              <input
                ref={phoneRef}
                className="input"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                placeholder="98765 43210"
                maxLength={11}
                aria-label="Mobile number"
                value={formatNational(digits)}
                onChange={(e) => { setDigits(e.target.value.replace(/\D/g, "").slice(0, 10)); setPhoneError(false); }}
                onKeyDown={(e) => { if (e.key === "Enter") void sendCode(); }}
              />
            </span>
            {phoneError && <span className="err"><AlertCircle className="ic" />Enter a 10-digit mobile number.</span>}
          </label>
          <button className={`btn btn--block rv${sending ? " is-busy" : ""}`} style={{ "--k": 4 } as React.CSSProperties} type="button" disabled={digits.length !== 10 || sending} onClick={() => void sendCode()}>
            {sending ? (<><LevelUpLoader size={28} label="Sending" />Sending</>) : "Send code"}
          </button>
          <Link className="fo-swap rv" style={{ "--k": 5 } as React.CSSProperties} to="/login?classic=1">Not in India? Use email</Link>
        </div>

        {/* 3. The code */}
        <div className={`fo-step${step === "code" ? " is-on is-arrive" : ""}`} data-s="code" key={`code-${step === "code" ? nonce : "off"}`}>
          <button className="fo-dback rv" style={{ "--k": 0 } as React.CSSProperties} type="button" onClick={back}><ChevronLeft className="ic" />Back</button>
          <div className="fo-k rv" style={{ "--k": 0 } as React.CSSProperties}>Check your messages</div>
          <h1 className="fo-t rv" style={{ "--k": 1 } as React.CSSProperties}>Enter the code</h1>
          <p className="fo-s rv" style={{ "--k": 2 } as React.CSSProperties}>
            Sent to <b>+91 {formatNational(digits)}</b> by SMS. <button className="linkish" type="button" onClick={() => go("phone")}>Change</button>
          </p>
          {testHint && <p className="fo-test rv" style={{ "--k": 2 } as React.CSSProperties}>Staging: no SMS is sent. Enter the staging test code.</p>}
          <div className={`otp rv${codeError ? " is-error" : ""}`} style={{ "--k": 3 } as React.CSSProperties} role="group" aria-label={`${CODE_LENGTH}-digit code`}>
            {code.map((v, i) => (
              <input
                key={i}
                ref={(el) => { boxRefs.current[i] = el; }}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                maxLength={i === 0 ? CODE_LENGTH : 1}
                aria-label={`Digit ${i + 1}`}
                className={v ? "is-filled" : undefined}
                value={v}
                onChange={(e) => setBox(i, e.target.value)}
                onKeyDown={(e) => onBoxKey(i, e)}
                onFocus={(e) => e.currentTarget.select()}
              />
            ))}
          </div>
          {codeError && <p className="err otp-err"><AlertCircle className="ic" />That code didn't match. Try again, or get a new one.</p>}
          {!reviewLike && (
            <div className="otp-foot rv" style={{ "--k": 4 } as React.CSSProperties}>
              {left > 0 ? (
                <>Resend in <b className="mono">0:{String(left).padStart(2, "0")}</b></>
              ) : (
                <>
                  <button className="linkish" type="button" onClick={() => void resend("sms")}>Resend code</button>
                  <span className="otp-sep">·</span>
                  <button className="linkish" type="button" onClick={() => void resend("whatsapp")}>Get it on WhatsApp</button>
                </>
              )}
            </div>
          )}
          <button
            className={`btn btn--block rv${checking ? " is-busy" : ""}`}
            style={{ "--k": 5 } as React.CSSProperties}
            type="button"
            disabled={codeValue.length !== CODE_LENGTH || checking || verified}
            onClick={() => void verify(codeValue)}
          >
            {verified ? (<><Check className="ic" />Verified</>) : checking ? (<><LevelUpLoader size={28} label="Checking" />Checking</>) : "Verify"}
          </button>
        </div>
      </section>

      {intro && <BrandIntro mode="first" posters={INTRO_PHOTOS} onDone={() => { setIntro(false); setNonce((n) => n + 1); }} />}

      {moment && (
        <SignInMoment
          eyebrow={moment.eyebrow}
          title={moment.title}
          onReveal={() => { void hapticImpact("light"); navigate(moment.dest, { replace: true }); }}
          onDone={() => setMoment(null)}
        />
      )}
    </div>
  );
}
