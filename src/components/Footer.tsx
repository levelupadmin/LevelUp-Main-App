import { Link } from "react-router-dom";
import { Instagram, Youtube, Twitter, Linkedin } from "lucide-react";
import LevelUpWordmark from "@/components/LevelUpWordmark";
import { isNative } from "@/lib/platform";

interface FooterLink {
  label: string;
  href: string;
  /** when true, treat href as an external URL (rendered as <a target="_blank">) */
  external?: boolean;
}

const MARKETING_ORIGIN = "https://leveluplearning.in";
const SUPPORT_URL = "https://api.whatsapp.com/send?phone=919791520177&text=Hi";

const footerLinks: Record<string, FooterLink[]> = {
  Learn: [
    { label: "Browse Programs", href: "/browse" },
    { label: "My Courses", href: "/my-courses" },
    { label: "Events", href: "/events" },
    { label: "Community", href: "/community" },
  ],
  Company: [
    { label: "About LevelUp", href: `${MARKETING_ORIGIN}/about`, external: true },
    { label: "Student Stories", href: `${MARKETING_ORIGIN}/student-stories`, external: true },
    { label: "Careers", href: `${MARKETING_ORIGIN}/careers`, external: true },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Refund Policy", href: "/refunds" },
    { label: "Delete Account", href: "/delete-account" },
    {
      label: "Contact Support",
      href: SUPPORT_URL,
      external: true,
    },
  ],
};

const socialLinks = [
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/leveluplearning.in/" },
  { icon: Youtube, label: "YouTube", href: "https://www.youtube.com/@leveluplearning_in/" },
  { icon: Twitter, label: "X / Twitter", href: "https://x.com/LevelUp_edu" },
  { icon: Linkedin, label: "LinkedIn", href: "https://www.linkedin.com/company/levelup-learning/" },
];

const renderLink = (link: FooterLink) => {
  const className =
    "text-sm text-muted-foreground hover:text-foreground transition-colors duration-300 py-2 inline-block";
  if (link.external || /^https?:\/\//.test(link.href)) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className={className}
      >
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.href} className={className}>
      {link.label}
    </Link>
  );
};

interface FooterProps {
  /**
   * "marketing" (default) — full link-column footer for public pages.
   * "app" — slim one-row footer (wordmark + copyright + Support) for the
   * authed app shell.
   */
  variant?: "marketing" | "app";
}

/** Minimal one-row footer for inside the authed app shell. */
const AppFooter = () => (
  <footer aria-label="App footer" className="border-t border-border bg-canvas">
    <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
      <LevelUpWordmark className="h-6 w-auto text-foreground" />
      <p className="text-xs text-muted-foreground">
        (c) 2026 LevelUp Edu Pvt Ltd. All rights reserved.
      </p>
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
      >
        Support
      </a>
    </div>
  </footer>
);

const Footer = ({ variant = "marketing" }: FooterProps) => {
  // Native (iOS + Android) app shells get no footer chrome — the
  // sitemap-style link columns, external company links, and social icons
  // read as "this is a website" inside the app. Web keeps the footer.
  if (isNative()) return null;

  if (variant === "app") return <AppFooter />;

  return (
    <footer
      aria-label="Site footer"
      className="relative overflow-hidden border-t border-border bg-canvas"
    >
      {/* Cream glow at top edge */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-cream/30 to-transparent" />

      <div className="max-w-6xl mx-auto px-6 md:px-12 lg:px-20 pt-16 md:pt-20 pb-12 md:pb-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 md:gap-12 lg:gap-8">
          <div className="lg:col-span-1">
            <div className="mb-4">
              <LevelUpWordmark className="h-8 w-auto text-foreground" />
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-[260px]">
              A creative education ecosystem for serious creators.
            </p>
            <a
              href="mailto:admin@leveluplearning.in"
              className="text-sm text-muted-foreground hover:text-cream transition-colors duration-300"
            >
              admin@leveluplearning.in
            </a>
          </div>

          {Object.entries(footerLinks).map(([category, links]) => (
            <div key={category}>
              <h3 className="text-xs font-medium uppercase tracking-widest text-cream mb-5">
                {category}
              </h3>
              <ul className="space-y-1">
                {links.map((link) => (
                  <li key={link.label}>{renderLink(link)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center md:justify-start gap-5 md:gap-4 mt-12">
          {socialLinks.map((social) => (
            <a
              key={social.label}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={social.label}
              className="flex items-center justify-center w-11 h-11 md:w-10 md:h-10 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all duration-300"
            >
              <social.icon size={18} strokeWidth={1.5} />
            </a>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-10 pt-8 border-t border-border">
          <p className="text-xs text-muted-foreground">
            (c) 2026 LevelUp Edu Pvt Ltd. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <Link
              to="/terms"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Terms
            </Link>
            <Link
              to="/privacy"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Privacy
            </Link>
            <Link
              to="/refunds"
              className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-300"
            >
              Refunds
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
