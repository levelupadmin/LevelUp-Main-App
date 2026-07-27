import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/auth/PhoneInput";
import { OtpEntryStep } from "@/components/auth/OtpEntryStep";
import { EmailOtpPanel } from "@/components/auth/OtpTabs";
import { useClaimApplication } from "@/hooks/useClaimApplication";
import usePageTitle from "@/hooks/usePageTitle";
import { isNative } from "@/lib/platform";
import { instant, otpSuccess, springs, useMotionSafe } from "@/lib/motion";

/**
 * ClaimApplication — the interactive claim step of the identity spine
 * (PHASE SP / S-4), mounted at the pinned route `/claim/:applicationId` inside
 * the authenticated block (the claimant is signed in by definition).
 *
 * When provisioning could not tell whether an application belongs to the
 * person now holding the session, it parks the row instead of merging anything
 * (`user_id` NULL + `pending_claim`). This screen resolves that the only way it
 * honestly can: ONE more one-time code, on the SECOND channel, proved by the
 * human. Nothing here needs an admin, a support ticket or a link from an email.
 *
 * Failure modes are deliberately boring:
 *   • wrong code  → rejected, nothing attached, nothing merged;
 *   • abandoned   → nothing was written, the row stays parked and surfaces
 *                   again at the next sign-in;
 *   • no such parked row (already claimed, or never the caller's) → a neutral
 *     "nothing to confirm" card, never an error and never a hint about who
 *     the row belongs to.
 *
 * There is no password field on this screen, and no step that leaves the app.
 */
const ClaimApplication = () => {
  const { applicationId } = useParams<{ applicationId: string }>();
  const navigate = useNavigate();
  const ms = useMotionSafe();
  const { loading, claim, sendEmailCode, claimWithEmail, sendPhoneCode, claimWithPhone } =
    useClaimApplication(applicationId);

  usePageTitle("Confirm your application");

  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [phoneStage, setPhoneStage] = useState<"number" | "code">("number");
  const [sendError, setSendError] = useState<string | null>(null);

  // Holds the post-success navigate timer so an early unmount can cancel it
  // (same guard as the login flow's success choreography).
  const navTimerRef = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
    },
    [],
  );

  // The claim succeeded: hold the success beat the code entry is already
  // playing, then land on the application it just attached. Bounded by the
  // shared motion token, and instant under reduced motion.
  const goToApplication = () => {
    navTimerRef.current = window.setTimeout(
      () => navigate(`/my-application/${applicationId}`, { replace: true }),
      ms.reduced ? 0 : otpSuccess.windowMs,
    );
  };

  const handleSendPhoneCode = async () => {
    if (!phone) {
      setSendError("Enter your phone number.");
      return;
    }
    // The MSG91 widget only handles Indian numbers, which is why Login gates on
    // this exact prefix (Login.tsx:206) and routes everything else to email.
    // There is no email fallback HERE — the channel is fixed by which one the
    // caller has already proved — so the gate has to say so plainly instead of
    // letting the user walk into a widget error with nowhere to go.
    if (!phone.startsWith("+91")) {
      setSendError("We can only text a code to an Indian (+91) number on this step.");
      return;
    }
    setSending(true);
    setSendError(null);
    const res = await sendPhoneCode(phone);
    setSending(false);
    if (!res.ok) {
      setSendError(res.error);
      return;
    }
    setPhoneStage("code");
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="mx-auto w-full max-w-[460px] px-5 py-10 sm:py-14">
        <div className="glass-card rounded-3xl p-6 text-center sm:p-7">
          <h1 className="mb-2 text-2xl font-semibold tracking-[-0.015em]">
            Nothing to confirm
          </h1>
          <p className="mb-6 text-sm text-muted-foreground">
            There's no application waiting on you right now. If you were part way
            through confirming one, it's still safe and will show up again next
            time you sign in.
          </p>
          <button
            type="button"
            onClick={() => navigate("/home", { replace: true })}
            className="btn-champagne pressable flex h-12 w-full items-center justify-center gap-2 text-base"
          >
            Go to home
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  const secondChannelLabel = claim.channel === "email" ? "email address" : "phone number";

  return (
    <div className="mx-auto w-full max-w-[460px] px-5 py-10 sm:py-14">
      <motion.div
        initial={ms.enabled ? { opacity: 0, y: 12 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={ms.reduced ? instant : springs.glide}
      >
        <div className="mb-4 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            Your application
          </span>
          <span className="h-px flex-1 bg-border/70" />
          <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
            One last check
          </span>
        </div>

        <div className="glass-card rounded-3xl p-6 sm:p-7">
          {claim.channel === "email" ? (
            <EmailOtpPanel
              autoFocus={!isNative()}
              heading={
                <>
                  Confirm your <span className="font-serif-italic text-cream">email</span>
                </>
              }
              description={
                claim.maskedTarget
                  ? `We'll send a code to the email on your application (${claim.maskedTarget}). Enter that address to link it to this account.`
                  : "We'll send a code to the email on your application. Enter that address to link it to this account."
              }
              successCaption="Linked"
              onSend={sendEmailCode}
              onVerify={async (email, code) => {
                const res = await claimWithEmail(email, code);
                if (res.ok) goToApplication();
                return res;
              }}
            />
          ) : phoneStage === "code" ? (
            <OtpEntryStep
              phone={phone}
              channel="sms"
              otpLength={4}
              showStepBadge={false}
              successCaption="Linked"
              onVerify={async (code) => {
                const res = await claimWithPhone(code);
                if (res.ok) goToApplication();
                return res;
              }}
              onResendSms={() => sendPhoneCode(phone)}
              onBack={() => {
                setPhoneStage("number");
                setSendError(null);
              }}
            />
          ) : (
            <>
              <h1 className="mb-2 text-[28px] font-semibold leading-[1.1] tracking-[-0.015em]">
                Confirm your <span className="font-serif-italic text-cream">number</span>
              </h1>
              <p className="mb-6 text-sm text-muted-foreground">
                {claim.maskedTarget
                  ? `We'll text a code to the number on your application (${claim.maskedTarget}). Enter that number to link it to this account.`
                  : "We'll text a code to the number on your application. Enter that number to link it to this account."}
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendPhoneCode();
                }}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="claim-phone" className="text-xs text-muted-foreground">
                    Phone number
                  </Label>
                  <PhoneInput
                    id="claim-phone"
                    // +91 only, per PhoneInput's own doc: a surface whose
                    // downstream validation honours one region must not offer a
                    // flag switcher the flow cannot accept. The MSG91 widget is
                    // that validation here.
                    countries={["IN"]}
                    value={phone}
                    onChange={(v) => {
                      setPhone(v);
                      if (sendError) setSendError(null);
                    }}
                    autoFocus={!isNative()}
                    aria-invalid={!!sendError}
                    aria-describedby={sendError ? "claim-phone-error" : undefined}
                  />
                </div>

                {sendError && (
                  <p id="claim-phone-error" role="alert" className="text-sm text-destructive">
                    {sendError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={sending || !phone}
                  className="btn-champagne pressable flex h-12 w-full items-center justify-center gap-2 text-base disabled:pointer-events-none disabled:opacity-50"
                >
                  {sending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Send code
                  {!sending && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
            </>
          )}
        </div>

        <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          One code on your {secondChannelLabel}. No password to remember.
        </div>

        {/* `replace` so a back gesture returns to wherever the user came from
            rather than bouncing them into the step they just declined. Nothing
            is written by leaving: the row stays parked and the applicant card
            on Home offers it again whenever they want it. */}
        <button
          type="button"
          onClick={() => navigate("/home", { replace: true })}
          className="mt-2 inline-flex min-h-[44px] w-full items-center justify-center text-xs text-muted-foreground [@media(hover:hover)]:hover:text-foreground"
        >
          I'll do this later
        </button>
      </motion.div>
    </div>
  );
};

export default ClaimApplication;
