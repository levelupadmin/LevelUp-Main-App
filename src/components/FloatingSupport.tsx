import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";

const WHATSAPP_URL =
  "https://api.whatsapp.com/send?phone=919791520177&text=Hi";

/**
 * Floating WhatsApp support bubble.
 *
 * Mounted globally in App.tsx so it is visible across every page (logged-in
 * or not). Hidden on the ChapterViewer route because that view is full-bleed
 * video and the bubble would overlap the player UI.
 */
const FloatingSupport = () => {
  const { pathname } = useLocation();

  // Hide on the full-bleed chapter player.
  if (pathname.startsWith("/chapters/")) return null;

  // Hide on conversion pages (offering + checkout) on MOBILE only — they
  // already have a sticky CTA at the bottom and the bubble would overlap
  // it. On desktop the right-side bubble has plenty of room.
  const hasStickyCta = pathname.startsWith("/p/") || pathname.startsWith("/checkout/");

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`fixed right-4 md:bottom-8 md:right-8 z-50 items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 rounded-full bg-surface/90 backdrop-blur-md border border-border text-foreground text-xs md:text-sm shadow-lg hover:border-cream/50 hover:shadow-[0_0_24px_hsl(var(--cream)/0.15)] transition-all duration-300 ${
        hasStickyCta ? "hidden md:inline-flex" : "bottom-20 inline-flex"
      }`}
    >
      <MessageCircle className="w-4 h-4 text-cream" strokeWidth={1.5} />
      <span className="hidden sm:inline">Need help?</span>
    </a>
  );
};

export default FloatingSupport;
