import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import Footer from "@/components/Footer";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/lib/toast";
import usePageTitle from "@/hooks/usePageTitle";

// Public self-serve account-deletion page required by Google Play.
// Anyone can submit (no auth) — this is the path for users who cannot
// sign in to use the in-app flow. Submissions go into
// `account_deletion_requests` for the support team to verify and process.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const DeleteAccount = () => {
  usePageTitle("Delete your account");

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setSubmitting(true);

    // Cast as any because the `account_deletion_requests` table is
    // added by the 20260522180000 migration and won't be reflected in
    // the auto-generated `types.ts` until the next `supabase gen types`
    // run after deploy. Mirrors the same pattern used elsewhere in this
    // repo for tables that exist server-side but lag client typings.
    const { error } = await (supabase as any)
      .from("account_deletion_requests")
      .insert({
        email: trimmedEmail,
        phone: phone.trim() || null,
        reason: reason.trim() || null,
        user_agent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      });

    setSubmitting(false);

    if (error) {
      console.error("[delete-account] insert failed:", error);
      toast.error(
        "We couldn't submit your request. Please email ceo@leveluplearning.in directly.",
      );
      return;
    }

    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-canvas flex flex-col">
      <header className="border-b border-border bg-canvas/90 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" aria-label="LevelUp home" className="text-foreground">
            <LevelUpWordmark className="h-8 w-auto" />
          </Link>
          <Link
            to="/login"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-2xl mx-auto px-6 py-12 md:py-16 w-full">
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-2">
          Delete your{" "}
          <span className="font-serif-italic text-cream">LevelUp account</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-8">
          If you can sign in to LevelUp, the fastest way to delete your account
          is from{" "}
          <Link to="/profile" className="text-cream hover:underline">
            Profile → Danger zone
          </Link>
          . Use the form below only if you cannot access the app.
        </p>

        {submitted ? (
          <div className="bg-surface border border-border rounded-xl p-8 text-center">
            <CheckCircle2 className="h-12 w-12 text-cream mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-foreground mb-2">
              Request received
            </h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              We've received your account-deletion request. Our team will
              verify your identity over email and complete the deletion within
              7 business days. You'll receive a confirmation at the address you
              provided.
            </p>
            <div className="mt-6">
              <Link
                to="/"
                className="text-sm text-cream hover:underline"
              >
                Back to home
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="bg-surface-2 border-l-2 border-destructive p-4 rounded mb-6 flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="text-sm text-muted-foreground">
                <p className="text-foreground font-medium mb-1">
                  What will be deleted
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Your account profile (name, email, phone, avatar, bio)</li>
                  <li>Course enrolments, progress, reviews, and certificates</li>
                  <li>
                    Community posts, comments, Q&amp;A entries, and notifications
                  </li>
                  <li>
                    Cohort applications and any saved/wishlisted programs
                  </li>
                </ul>
                <p className="mt-3 text-xs">
                  Payment records are retained for ~8 years per Indian tax and
                  refund-compliance regulations, with your personal details
                  detached from them.
                </p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="email"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Email address (required)
                </label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setEmailError(null);
                  }}
                  placeholder="you@example.com"
                  required
                  disabled={submitting}
                />
                {emailError && (
                  <p className="text-xs text-destructive mt-1">{emailError}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Must match the email on your LevelUp account.
                </p>
              </div>

              <div>
                <label
                  htmlFor="phone"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Phone number (optional)
                </label>
                <Input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit Indian mobile"
                  disabled={submitting}
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Helps us locate your account if your email has changed.
                </p>
              </div>

              <div>
                <label
                  htmlFor="reason"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Reason (optional)
                </label>
                <Textarea
                  id="reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Tell us why you're leaving — helps us improve."
                  rows={4}
                  disabled={submitting}
                />
              </div>

              <Button
                type="submit"
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10 w-full sm:w-auto"
                disabled={submitting}
              >
                {submitting ? "Submitting…" : "Submit deletion request"}
              </Button>

              <p className="text-xs text-muted-foreground pt-2">
                Prefer to email us directly? Write to{" "}
                <a
                  href="mailto:ceo@leveluplearning.in?subject=Account%20deletion%20request"
                  className="text-cream hover:underline"
                >
                  ceo@leveluplearning.in
                </a>
                .
              </p>
            </form>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default DeleteAccount;
