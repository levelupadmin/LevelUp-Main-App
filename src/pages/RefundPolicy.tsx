import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import Footer from "@/components/Footer";
import usePageTitle from "@/hooks/usePageTitle";

const tocSections = [
  { id: "masterclasses", label: "1. Masterclasses" },
  { id: "cohorts", label: "2. Live Cohort Programs" },
  { id: "workshops", label: "3. Workshops and Live Events" },
  { id: "subscriptions", label: "4. Subscriptions and All-Access Plans" },
  { id: "request", label: "5. How to Request a Refund" },
  { id: "not-refundable", label: "6. Things That Aren't Refundable" },
  { id: "disputes", label: "7. Disputes" },
  { id: "chargebacks", label: "8. Chargebacks" },
  { id: "changes", label: "9. Changes to This Policy" },
  { id: "contact", label: "10. Contact" },
];

const RefundPolicy = () => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  usePageTitle("Refund Policy");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    const handleScroll = () => setShowBackToTop(window.scrollY > 400);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visible = entries.find((e) => e.isIntersecting);
        if (visible) setActiveId(visible.target.id);
      },
      { rootMargin: "-20% 0px -75% 0px" }
    );
    tocSections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observerRef.current?.observe(el);
    });
    return () => observerRef.current?.disconnect();
  }, []);

  const scrollToTop = useCallback(
    () => window.scrollTo({ top: 0, behavior: "smooth" }),
    []
  );

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

      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 md:py-16 w-full">
        <h1 className="text-3xl md:text-4xl font-semibold text-foreground tracking-tight mb-2">
          Refund <span className="font-serif-italic text-cream">Policy</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-2">
          Last Updated: 21st May 2026
        </p>
        <p className="text-sm text-muted-foreground mb-10">
          This Refund Policy forms part of our{" "}
          <Link to="/terms" className="text-cream hover:underline">
            Terms of Service
          </Link>{" "}
          and applies to anyone who purchases a LevelUp product.
        </p>

        {/* Intro card */}
        <div className="bg-surface border border-border rounded-lg p-6 mb-12">
          <h2 className="text-lg font-semibold text-foreground mb-2">
            Our promise
          </h2>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">
            LevelUp wants you to feel confident enrolling. If a course isn't
            right for you, we'll work with you to fix it. This policy
            explains when and how refunds work.
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="bg-surface border border-border rounded-lg p-6 mb-12 print:hidden">
          <h2 className="text-lg font-semibold text-foreground mb-4">
            Table of Contents
          </h2>
          <ol className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
            {tocSections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  className={`transition-colors ${
                    activeId === s.id
                      ? "text-cream font-medium"
                      : "text-muted-foreground hover:text-cream"
                  }`}
                  onClick={(e) => {
                    e.preventDefault();
                    document
                      .getElementById(s.id)
                      ?.scrollIntoView({ behavior: "smooth" });
                  }}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="space-y-0 text-sm md:text-base text-muted-foreground leading-relaxed">
          <section id="masterclasses" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              1. Masterclasses (self-paced video courses)
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 border-b border-border">
                      Condition
                    </th>
                    <th className="text-left font-medium px-4 py-3 border-b border-border">
                      Refund
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-surface">
                    <td className="px-4 py-3 align-top border-b border-border">
                      Within{" "}
                      <strong className="text-foreground">7 days</strong> of
                      purchase AND you've watched{" "}
                      <strong className="text-foreground">less than 20%</strong>{" "}
                      of any single course in the offering
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">Full refund</strong>
                    </td>
                  </tr>
                  <tr className="bg-surface/60">
                    <td className="px-4 py-3 align-top border-b border-border">
                      Within 7 days but you've watched 20-50% of a course
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">50% refund</strong>
                    </td>
                  </tr>
                  <tr className="bg-surface">
                    <td className="px-4 py-3 align-top">
                      After 7 days, OR after watching 50%+ of any course
                    </td>
                    <td className="px-4 py-3 align-top">
                      No refund, but contact us. We may issue store credit if
                      there's a genuine reason (technical issue, billing
                      error, accidental purchase).
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              The 20% watched threshold is calculated from your VdoCipher
              playback progress across all chapters in the offering.
            </p>
          </section>

          <section id="cohorts" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              2. Live cohort programs (Forge, LevelUp Live, advanced programs)
            </h2>
            <p className="mb-4">
              Cohort programs are structured into stages. Refund availability
              depends on which stage you've paid through:
            </p>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 border-b border-border">
                      Stage
                    </th>
                    <th className="text-left font-medium px-4 py-3 border-b border-border">
                      Refund availability
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-surface">
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">
                        Application fee (typically Rs. 499)
                      </strong>
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">
                        Fully self-service refund
                      </strong>{" "}
                      from your application status page within{" "}
                      <strong className="text-foreground">48 hours</strong> of
                      payment. After 48 hours, application fees are
                      non-refundable as they cover the screening process.
                    </td>
                  </tr>
                  <tr className="bg-surface/60">
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">
                        Confirmation amount paid (after acceptance)
                      </strong>
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border">
                      Refundable up to{" "}
                      <strong className="text-foreground">
                        7 days before cohort start date
                      </strong>
                      , minus a{" "}
                      <strong className="text-foreground">
                        Rs. 2,000 admin fee
                      </strong>{" "}
                      to cover the slot we held for you. Within 7 days of
                      cohort start: non-refundable.
                    </td>
                  </tr>
                  <tr className="bg-surface">
                    <td className="px-4 py-3 align-top">
                      <strong className="text-foreground">
                        Balance paid (full enrolment)
                      </strong>
                    </td>
                    <td className="px-4 py-3 align-top">
                      Refundable up to{" "}
                      <strong className="text-foreground">
                        the day before cohort start
                      </strong>
                      , minus admin fee. After the cohort starts: pro-rated
                      refund based on weeks completed, up to{" "}
                      <strong className="text-foreground">end of Week 2</strong>
                      . From Week 3 onwards: non-refundable.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-4">
              If you withdraw mid-cohort with the program team's written
              approval (medical, family emergency, etc.) we'll consider an
              exceptional refund or transfer to the next cohort.
            </p>
          </section>

          <section id="workshops" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              3. Workshops and live events
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead className="bg-surface-2 text-foreground">
                  <tr>
                    <th className="text-left font-medium px-4 py-3 border-b border-border">
                      Condition
                    </th>
                    <th className="text-left font-medium px-4 py-3 border-b border-border">
                      Refund
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bg-surface">
                    <td className="px-4 py-3 align-top border-b border-border">
                      Cancel up to{" "}
                      <strong className="text-foreground">
                        48 hours before
                      </strong>{" "}
                      the event start time
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">Full refund</strong>
                    </td>
                  </tr>
                  <tr className="bg-surface/60">
                    <td className="px-4 py-3 align-top border-b border-border">
                      Cancel within 48 hours of the event start time
                    </td>
                    <td className="px-4 py-3 align-top border-b border-border">
                      <strong className="text-foreground">No refund</strong>,
                      but you can transfer your registration to another
                      LevelUp event of equal value within 6 months
                    </td>
                  </tr>
                  <tr className="bg-surface">
                    <td className="px-4 py-3 align-top">
                      Event cancelled by LevelUp
                    </td>
                    <td className="px-4 py-3 align-top">
                      <strong className="text-foreground">Full refund</strong>{" "}
                      automatically, or transfer to the next session of your
                      choice
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="subscriptions" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              4. Subscription and All-Access plans
            </h2>
            <p className="mb-3">If you're on a recurring plan:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Cancel any time before the next billing date and no further
                charges will be made.
              </li>
              <li>
                The current billing period is non-refundable, but you keep
                access until it ends.
              </li>
              <li>
                If you've used the plan for less than 7 days from initial
                sign-up, you can request a full refund.
              </li>
            </ul>
          </section>

          <section id="request" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              5. How to request a refund
            </h2>
            <ol className="list-decimal pl-6 space-y-2 mb-4">
              <li>
                <strong className="text-foreground">In-app:</strong> go to{" "}
                <Link to="/profile" className="text-cream hover:underline">
                  Profile
                </Link>{" "}
                and contact support to start a refund.
              </li>
              <li>
                <strong className="text-foreground">Email:</strong>{" "}
                <a
                  href="mailto:refunds@leveluplearning.in"
                  className="text-cream hover:underline"
                >
                  refunds@leveluplearning.in
                </a>{" "}
                from the email on your account.
              </li>
              <li>
                <strong className="text-foreground">
                  For live cohort application fees:
                </strong>{" "}
                use the self-service refund button on your application status
                page.
              </li>
            </ol>
            <p className="mb-3">Please include:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Your account email</li>
              <li>Razorpay payment ID (from your receipt email)</li>
              <li>The offering you bought</li>
              <li>Your reason (optional but helps us improve)</li>
            </ul>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded mt-6">
              <p className="text-sm text-foreground">
                We respond within{" "}
                <strong>3 business days</strong> and process approved refunds
                within <strong>7 to 10 business days</strong> through Razorpay
                back to your original payment method. Bank-side reflection can
                take an extra 3 to 5 days.
              </p>
            </div>
          </section>

          <section id="not-refundable" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              6. Things that aren't refundable
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Courses you've completed (100% watched and certificate issued)</li>
              <li>
                Programs bought with a{" "}
                <strong className="text-foreground">
                  non-refundable coupon
                </strong>{" "}
                (clearly marked at checkout)
              </li>
              <li>Application fees outside the 48-hour window</li>
              <li>Workshop tickets within 48 hours of event start</li>
              <li>
                Any product, after fraudulent use or violation of our{" "}
                <Link to="/terms" className="text-cream hover:underline">
                  Terms of Service
                </Link>{" "}
                (account suspended)
              </li>
            </ul>
          </section>

          <section id="disputes" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              7. Disputes
            </h2>
            <p className="mb-4">
              If a refund decision doesn't go your way and you want to
              appeal:
            </p>
            <ol className="list-decimal pl-6 space-y-2">
              <li>Reply to the refund decision email and we'll re-review.</li>
              <li>
                If still unresolved, escalate to{" "}
                <a
                  href="mailto:grievance@leveluplearning.in"
                  className="text-cream hover:underline"
                >
                  grievance@leveluplearning.in
                </a>
                . Our Grievance Officer responds within 15 days under the DPDP
                Act and IT Rules.
              </li>
              <li>
                Under the Consumer Protection Act 2019, you also have the
                right to approach a Consumer Disputes Redressal Commission.
              </li>
            </ol>
            <p className="mt-4">
              We prefer to find a fair resolution before things escalate. Most
              refund disagreements are resolved through email conversation.
            </p>
          </section>

          <section id="chargebacks" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              8. Chargebacks
            </h2>
            <p className="mb-3">
              If you initiate a chargeback through your bank or card network
              without first contacting us:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Your LevelUp account is automatically suspended pending review.
              </li>
              <li>
                We will share account, payment, and access-log evidence with
                the card network.
              </li>
              <li>
                A successful chargeback for fraud you committed (e.g.,
                disputing a course you completed) results in permanent account
                termination.
              </li>
            </ul>
            <p className="mt-4">
              If we've made an error and you initiated a chargeback in good
              faith, we'll cooperate with the resolution and won't penalize
              you.
            </p>
          </section>

          <section id="changes" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              9. Changes to this policy
            </h2>
            <p className="mb-4">
              We may update this Refund Policy. The version that applies to
              your purchase is the one that was live on the date you bought.
              We won't apply a less-favourable version retroactively.
            </p>
            <p className="mb-3">When we update materially, we'll:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Update the "Last Updated" date at the top of this page.</li>
              <li>Notify you by email if you're a current customer.</li>
            </ul>
          </section>

          <section id="contact">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              10. Contact
            </h2>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded space-y-2 text-sm">
              <p>
                <span className="text-foreground font-medium">
                  Refund requests:
                </span>{" "}
                <a
                  href="mailto:refunds@leveluplearning.in"
                  className="text-cream hover:underline"
                >
                  refunds@leveluplearning.in
                </a>
              </p>
              <p>
                <span className="text-foreground font-medium">Grievances:</span>{" "}
                <a
                  href="mailto:grievance@leveluplearning.in"
                  className="text-cream hover:underline"
                >
                  grievance@leveluplearning.in
                </a>
              </p>
              <p>
                <span className="text-foreground font-medium">
                  General support:
                </span>{" "}
                <a
                  href="mailto:support@leveluplearning.in"
                  className="text-cream hover:underline"
                >
                  support@leveluplearning.in
                </a>
              </p>
            </div>
          </section>
        </div>
      </main>

      <Footer />

      {showBackToTop && (
        <button
          onClick={scrollToTop}
          className="fixed bottom-24 right-4 md:bottom-24 md:right-8 z-40 bg-cream text-cream-text p-3 rounded-full shadow-lg hover:opacity-90 transition-all print:hidden"
          aria-label="Back to top"
        >
          <ArrowUp className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default RefundPolicy;
