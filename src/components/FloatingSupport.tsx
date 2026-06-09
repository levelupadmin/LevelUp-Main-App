import { useState } from "react";
import { useLocation } from "react-router-dom";
import { MessageCircle } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { hapticImpact, hapticSelection } from "@/lib/haptics";

const WHATSAPP_PHONE = "919791520177";

/** Build a wa.me deep link with a prefilled message. */
const waLink = (text: string) =>
  `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(text)}`;

/**
 * Topic chips prefill the WhatsApp message so the team lands on context, and
 * the user doesn't face an empty thread. Keep it to a handful — the surfaces
 * this renders on (offerings, checkout, profile) all share these intents.
 */
const TOPICS: { label: string; text: string }[] = [
  { label: "Which course is right for me?", text: "Hi! I'd like help choosing the right course for me." },
  { label: "Payment / access issue", text: "Hi! I'm having an issue with payment or course access." },
  { label: "Something else", text: "Hi! I have a question about LevelUp." },
];

const DEFAULT_TEXT = "Hi! I have a question about LevelUp.";

/**
 * Floating WhatsApp support bubble.
 *
 * Mounted in App.tsx but route-gated here: it only renders on the surfaces
 * where a human nudge actually helps — the offering pages (/p/*), checkout,
 * and the profile/account page. Everywhere else (the Home feed, course
 * player, community…) it was visual noise hovering over content.
 *
 * Tapping the bubble opens a branded bottom sheet (team avatar + reassurance
 * + topic chips) instead of bouncing straight to WhatsApp — the chips prefill
 * the deep link so the conversation starts with context.
 */
const FloatingSupport = () => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  const onOffering = pathname.startsWith("/p/");
  const onCheckout = pathname.startsWith("/checkout/");
  const onProfile = pathname === "/profile" || pathname.startsWith("/profile/");

  if (!onOffering && !onCheckout && !onProfile) return null;

  // Conversion pages (offering + checkout) have a sticky CTA at the bottom
  // on MOBILE — hide the bubble there so they don't overlap. On desktop the
  // right-side bubble has plenty of room.
  const hasStickyCta = onOffering || onCheckout;

  const openWhatsApp = (text: string) => {
    hapticImpact("medium");
    window.open(waLink(text), "_blank", "noopener,noreferrer");
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          hapticSelection();
          setOpen(true);
        }}
        aria-label="Chat with us on WhatsApp"
        className={`focus-ring fixed right-4 md:bottom-8 md:right-8 z-50 items-center gap-2 px-4 py-2.5 md:px-5 md:py-3 rounded-full bg-surface/90 backdrop-blur-md border border-border text-foreground text-xs md:text-sm shadow-lg hover:border-cream/50 hover:shadow-[0_0_24px_hsl(var(--cream)/0.15)] transition-all duration-300 ${
          hasStickyCta
            ? "hidden md:inline-flex"
            : "bottom-[calc(6rem+env(safe-area-inset-bottom))] inline-flex"
        }`}
      >
        <MessageCircle className="w-4 h-4 text-cream" strokeWidth={1.5} />
        <span className="hidden sm:inline">Need help?</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl border-border bg-surface px-6 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          {/* Grabber */}
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />

          <div className="flex items-center gap-3">
            {/* Team / initials avatar */}
            <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-cream text-cream-text font-semibold">
              LU
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-[hsl(var(--accent-emerald))]" />
            </div>
            <div className="min-w-0">
              <SheetTitle className="text-left text-base font-semibold text-foreground">
                LevelUp Support
              </SheetTitle>
              <SheetDescription className="text-left text-xs text-muted-foreground">
                Typically replies within minutes on WhatsApp
              </SheetDescription>
            </div>
          </div>

          {/* Topic chips */}
          <div className="mt-5 flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">What can we help with?</p>
            {TOPICS.map((t) => (
              <button
                key={t.label}
                type="button"
                onClick={() => openWhatsApp(t.text)}
                className="focus-ring pressable flex items-center justify-between rounded-2xl border border-border bg-surface-2/60 px-4 py-3 text-left text-sm text-foreground transition-colors hover:border-cream/40 hover:bg-surface-2"
              >
                <span>{t.label}</span>
                <MessageCircle className="h-4 w-4 flex-shrink-0 text-cream" strokeWidth={1.5} />
              </button>
            ))}
          </div>

          {/* Primary deep link — keeps a generic entry working regardless of chip choice */}
          <button
            type="button"
            onClick={() => openWhatsApp(DEFAULT_TEXT)}
            className="btn-champagne focus-ring pressable mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-full font-semibold"
          >
            <MessageCircle className="h-4 w-4" strokeWidth={2} />
            Open WhatsApp
          </button>
        </SheetContent>
      </Sheet>
    </>
  );
};

export default FloatingSupport;
