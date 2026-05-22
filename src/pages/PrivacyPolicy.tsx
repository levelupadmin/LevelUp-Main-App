import { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { ArrowUp } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import Footer from "@/components/Footer";
import usePageTitle from "@/hooks/usePageTitle";

const tocSections = [
  { id: "info-collect", label: "1. Information We Collect" },
  { id: "how-use", label: "2. How We Use Your Information" },
  { id: "data-sharing", label: "3. Data Sharing and Disclosure" },
  { id: "data-retention", label: "4. Data Retention" },
  { id: "your-rights", label: "5. Your Rights" },
  { id: "data-security", label: "6. Data Security" },
  { id: "children-privacy", label: "7. Children's Privacy" },
  { id: "updates-policy", label: "8. Updates to This Policy" },
  { id: "contact-us", label: "9. Contact Us" },
];

const PrivacyPolicy = () => {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [activeId, setActiveId] = useState<string>("");
  const observerRef = useRef<IntersectionObserver | null>(null);

  usePageTitle("Privacy Policy");

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
          Privacy <span className="font-serif-italic text-cream">Policy</span>
        </h1>
        <p className="text-sm text-muted-foreground mb-2">
          Effective Date: 28th August 2025
        </p>
        <p className="text-sm text-muted-foreground mb-10">
          See also our{" "}
          <Link to="/terms" className="text-cream hover:underline">
            Terms of Service
          </Link>
          .
        </p>

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
          <p className="border-b border-border pb-8 mb-8">
            At LevelUp Edu Pvt Ltd ("LevelUp", "we", "us", or "our"), we value
            your privacy and are committed to protecting your personal data.
            This Privacy Policy explains how we collect, use, disclose, and
            safeguard your information when you visit www.leveluplearning.in,
            register for our programs, or engage with our services.
          </p>

          <section id="info-collect" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              1. Information We Collect
            </h2>
            <p className="mb-3">We collect the following types of information:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong className="text-foreground">Personal Information:</strong>{" "}
                Name, email address, phone number, billing information, etc.,
                provided during sign-ups, applications, purchases, or contact
                forms.
              </li>
              <li>
                <strong className="text-foreground">Usage Data:</strong>{" "}
                Information about your device, browser, IP address, time of
                visit, and interaction with the site via cookies or analytics
                tools.
              </li>
              <li>
                <strong className="text-foreground">Program Data:</strong>{" "}
                Assignments, submissions, feedback, and activity from
                participation in our programs, workshops, or bootcamps.
              </li>
              <li>
                <strong className="text-foreground">Communications:</strong>{" "}
                Emails, WhatsApp messages, or other interactions with our
                support and admissions teams.
              </li>
            </ul>
          </section>

          <section id="how-use" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              2. How We Use Your Information
            </h2>
            <p className="mb-3">We use the collected data to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Deliver and improve our educational services and experiences</li>
              <li>Process payments and provide invoices</li>
              <li>
                Send program-related updates, reminders, or promotions (opt-out
                available)
              </li>
              <li>Offer customer support and respond to queries</li>
              <li>Analyze and optimize website performance and learner engagement</li>
            </ul>
          </section>

          <section id="data-sharing" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              3. Data Sharing and Disclosure
            </h2>
            <p className="mb-3">
              We do not sell or rent your data. However, we may share your
              information with:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Third-party service providers (e.g., payment processors,
                communication tools like Interakt, Zoom, or Mailchimp)
              </li>
              <li>Mentors or instructors (if relevant to program delivery)</li>
              <li>Legal or regulatory bodies if required by law</li>
            </ul>
          </section>

          <section id="data-retention" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              4. Data Retention
            </h2>
            <p>
              We retain your personal data only for as long as necessary to
              fulfill the purposes outlined above, unless a longer retention
              period is required by law.
            </p>
          </section>

          <section id="your-rights" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              5. Your Rights
            </h2>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded">
              <p className="mb-3 text-foreground font-medium text-sm">
                You have the right to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access the personal data we hold about you</li>
                <li>Request correction, deletion, or restriction of your data</li>
                <li>Withdraw consent at any time (for marketing communication)</li>
                <li>Request a copy of your data in a portable format</li>
              </ul>
            </div>
          </section>

          <section id="data-security" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              6. Data Security
            </h2>
            <p>
              We take commercially reasonable steps to protect your personal
              data through encryption, secure access controls, and regular
              audits.
            </p>
          </section>

          <section id="children-privacy" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              7. Children's Privacy
            </h2>
            <p>
              Our website and programs are not directed toward individuals
              under the age of 13. We do not knowingly collect data from minors.
            </p>
          </section>

          <section id="updates-policy" className="border-b border-border pb-8 mb-8">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              8. Updates to This Policy
            </h2>
            <p>
              This policy may be updated from time to time. Changes will be
              posted on this page with an updated effective date.
            </p>
          </section>

          <section id="contact-us">
            <h2 className="text-xl font-semibold text-foreground mb-3">
              9. Contact Us
            </h2>
            <div className="bg-surface-2 border-l-2 border-cream p-4 rounded">
              <p className="text-foreground text-sm">
                For questions or concerns regarding this Privacy Policy, please
                contact:
              </p>
              <p className="mt-2">
                <a
                  href="mailto:admin@leveluplearning.in"
                  className="text-cream hover:underline font-medium"
                >
                  admin@leveluplearning.in
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

export default PrivacyPolicy;
