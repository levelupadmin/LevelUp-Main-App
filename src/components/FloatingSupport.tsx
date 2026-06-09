import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";

const WHATSAPP_URL =
  "https://api.whatsapp.com/send?phone=919791520177&text=Hi";

/**
 * Floating WhatsApp support bubble.
 *
 * Mounted in App.tsx but route-gated here: it only renders on the surfaces
 * where a human nudge actually helps — the offering pages (/p/*), checkout,
 * and the profile/account page. Everywhere else (the Home feed, course
 * player, community…) it was visual noise hovering over content.
 */
const FloatingSupport = () => {
  const { pathname } = useLocation();

  const onOffering = pathname.startsWith("/p/");
  const onCheckout = pathname.startsWith("/checkout/");
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile/");

  if (!onOffering && !onCheckout && !onProfile) return null;

  // Conversion pages (offering + checkout) have a sticky CTA at the bottom
  // on MOBILE — hide the bubble there so they don't overlap. On desktop the
  // right-side bubble has plenty of room.
  const hasStickyCta = onOffering || onCheckout;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className={`fixed right-4 md:bottom-8 md:right-8 z-50 items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 rounded-full bg-surface/90 backdrop-blur-md border border-border text-foreground text-xs md:text-sm shadow-lg hover:border-cream/50 hover:shadow-[0_0_24px_hsl(var(--cream)/0.15)] transition-all duration-300 ${
        hasStickyCta ? "hidden md:inline-flex" : "bottom-[calc(6rem+env(safe-area-inset-bottom))] inline-flex"
      }`}
    >
      <MessageCircle className="w-4 h-4 text-cream" strokeWidth={1.5} />
      <span className="hidden sm:inline">Need help?</span>
    </a>
  );
};

export default FloatingSupport;
