import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, User, Mail, ArrowRight, Check } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import usePageTitle from "@/hooks/usePageTitle";
import { CraftPicker } from "@/components/auth/CraftPicker";
import { Reveal } from "@/components/motion/Reveal";
import { toast } from "@/lib/toast";
import { hapticImpact } from "@/lib/haptics";

// Post-OTP onboarding. Phone-first auth means a brand-new account lands here
// with only a phone number on file, so this page is where we collect the
// name + email (step 1, only when missing) and the craft interests (step 2)
// before dropping the student on /home.
//
// Routing contract (wired in Login.tsx / Signup.tsx):
//   verify success → /onboarding   when users.craft_interests is empty
//                  → /home         otherwise
// This page itself is the safety net: if it's reached by an already-complete
// account it bounces straight to /home, and it re-derives which steps are
// actually needed from the live profile so a half-finished onboarding resumes
// at the right spot.

type OnboardStep = "profile" | "crafts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const Onboarding = () => {
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  usePageTitle("Welcome");

  // Does the profile still need name/email? Phone-first signup provisions a
  // synthetic "<digits>@phone.leveluplearning.in" placeholder email and a
  // generic "LevelUp Student" name so the account can be created before we ask
  // both are treated as missing here so onboarding collects the real values.
  const needsProfile = useMemo(() => {
    if (!profile) return true;
    const name = (profile.full_name ?? "").trim();
    const mail = (profile.email ?? user?.email ?? "").trim();
    const hasName = name.length >= 2 && name.toLowerCase() !== "levelup student";
    const hasEmail = !!mail && !mail.endsWith("@phone.leveluplearning.in");
    return !hasName || !hasEmail;
  }, [profile, user]);

  const [step, setStep] = useState<OnboardStep>("profile");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [crafts, setCrafts] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [guardChecked, setGuardChecked] = useState(false);

  // Seed the inputs from whatever the profile already has, but never with the
  // synthetic placeholders the signup path writes, or the user would have to
  // delete "LevelUp Student" / a junk email before typing their own.
  useEffect(() => {
    const name = (profile?.full_name ?? "").trim();
    if (name && name.toLowerCase() !== "levelup student") setFullName(name);
    const mail = (profile?.email ?? user?.email ?? "").trim();
    if (mail && !mail.endsWith("@phone.leveluplearning.in")) setEmail(mail);
  }, [profile, user]);

  // Guard + step selection. If the account already has craft_interests AND a
  // complete profile, there's nothing to do here → /home. Otherwise pick the
  // first incomplete step.
  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("users")
        .select("craft_interests")
        .eq("id", user.id)
        .single();
      if (cancelled) return;
      const existing = (data?.craft_interests ?? []).filter(Boolean);
      const alreadyHasCrafts = existing.length > 0;
      if (alreadyHasCrafts && !needsProfile) {
        navigate("/home", { replace: true });
        return;
      }
      if (alreadyHasCrafts) setCrafts(existing);
      setStep(needsProfile ? "profile" : "crafts");
      setGuardChecked(true);
    })();
    return () => {
      cancelled = true;
    };
    // hasCrafts intentionally omitted; derived inside the effect from a fresh fetch.
  }, [authLoading, user, needsProfile, navigate]);

  if (authLoading || !user || !guardChecked) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-canvas">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const nameValid = fullName.trim().length >= 2;
  const emailValid = EMAIL_RE.test(email.trim());
  const profileValid = nameValid && emailValid;

  const handleProfileNext = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileValid) {
      toast.error("Add your name and a valid email to continue.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ full_name: fullName.trim(), email: email.trim() })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your details. Please try again.");
      return;
    }
    hapticImpact("light");
    setStep("crafts");
  };

  const toggleCraft = (slug: string) => {
    setCrafts((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  };

  const finishOnboarding = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("users")
      .update({ craft_interests: crafts })
      .eq("id", user.id);
    setSaving(false);
    if (error) {
      toast.error("Couldn't save your picks. Please try again.");
      return;
    }
    hapticImpact("medium");
    navigate("/home", { replace: true });
  };

  const stepNum = step === "profile" ? 1 : 2;
  const totalSteps = needsProfile ? 2 : 1;
  const displayStepNum = needsProfile ? stepNum : 1;

  return (
    <div className="min-h-[100dvh] bg-canvas flex flex-col safe-top safe-bottom">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-5 sm:px-8">
        <LevelUpWordmark className="h-7 w-auto text-foreground" />
        {step === "crafts" && (
          // Let returning-ish users skip craft selection without blocking them
          // on /home access. Their craft_interests just stay empty.
          <button
            type="button"
            onClick={finishOnboarding}
            disabled={saving}
            className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Skip
          </button>
        )}
      </div>

      <div className="flex-1 flex flex-col justify-center px-5 py-8 sm:px-8">
        <div className="w-full max-w-[560px] mx-auto" key={step}>
          <div className="animate-slide-left-in">
            <div className="flex items-center gap-3 mb-5">
              <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                Step {displayStepNum} of {totalSteps}
              </span>
              <span className="h-px flex-1 bg-border/70" />
            </div>

            {step === "profile" && (
              <>
                <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.1] mb-2">
                  Almost in, what's your <span className="font-serif-italic text-cream">name</span>?
                </h1>
                <p className="text-sm text-muted-foreground mb-7">
                  We use this on your certificates and to keep your account secure.
                </p>

                <form onSubmit={handleProfileNext} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="ob-name" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Full name
                    </Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="ob-name"
                        type="text"
                        placeholder="Your full name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        autoComplete="name"
                        autoFocus
                        required
                        className="h-12 pl-10 text-base bg-surface border-border focus:border-foreground rounded-xl"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="ob-email" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                      Email
                    </Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                      <Input
                        id="ob-email"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoComplete="email"
                        required
                        className="h-12 pl-10 text-base bg-surface border-border focus:border-foreground rounded-xl"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={saving || !profileValid}
                    className="btn-champagne w-full h-12 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                    Continue
                    {!saving && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              </>
            )}

            {step === "crafts" && (
              <>
                <h1 className="text-[28px] sm:text-[32px] font-semibold tracking-[-0.015em] leading-[1.1] mb-2">
                  What do you want to <span className="font-serif-italic text-cream">make</span>?
                </h1>
                <p className="text-sm text-muted-foreground mb-7">
                  Pick a few and we'll tune your home feed to the crafts you care about. Change it anytime.
                </p>

                <Reveal>
                  <CraftPicker selected={crafts} onToggle={toggleCraft} />
                </Reveal>

                <button
                  type="button"
                  onClick={finishOnboarding}
                  disabled={saving || crafts.length === 0}
                  className="btn-champagne w-full h-12 mt-7 flex items-center justify-center gap-2 text-base disabled:opacity-50 disabled:pointer-events-none"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  {crafts.length > 0
                    ? `Continue with ${crafts.length} ${crafts.length === 1 ? "craft" : "crafts"}`
                    : "Pick at least one"}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
