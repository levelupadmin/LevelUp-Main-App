import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Download, Share2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import CertificateShareMenu from "./CertificateShareMenu";
import { useAuth } from "@/contexts/AuthContext";
import { hapticImpact } from "@/lib/haptics";
import { useMotionSafe, durations, easings } from "@/lib/motion";

interface Certificate {
  id: string;
  image_url: string;
  certificate_number: string;
  course_name: string;
  created_at: string;
}

interface CertificateCardProps {
  certificate: Certificate;
}

// Press-and-hold threshold before the blacklight reveal fires (STEAL-3).
const HOLD_MS = 250;

// Baked champagne glow — a static text-shadow (not a filter, not backdrop-filter)
// so the "UV ink" reads as light on black without any per-frame paint work.
const glow = {
  textShadow:
    "0 0 22px hsl(var(--champagne-from) / 0.55), 0 0 8px hsl(var(--champagne-from) / 0.45)",
} as const;

const CertificateCard = ({ certificate }: CertificateCardProps) => {
  const { profile } = useAuth();
  const { reduced, springs } = useMotionSafe();
  const [revealed, setRevealed] = useState(false);
  const holdTimer = useRef<number | null>(null);

  const dateEarned = new Date(certificate.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const reveal = () => {
    setRevealed((r) => {
      if (!r) void hapticImpact("light");
      return true;
    });
  };
  const hide = () => setRevealed(false);
  const toggle = () => {
    setRevealed((r) => {
      if (!r) void hapticImpact("light");
      return !r;
    });
  };

  const clearHold = () => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };
  // Hold-to-reveal: arm a timer on pointer-down; a scroll (pointercancel) or an
  // early release cancels it. We never preventDefault, so vertical scroll is
  // untouched.
  const onPointerDown = () => {
    clearHold();
    holdTimer.current = window.setTimeout(() => {
      holdTimer.current = null;
      reveal();
    }, HOLD_MS);
  };
  const endHold = () => {
    const wasArmed = holdTimer.current !== null;
    clearHold();
    // Release after a completed hold reverses the reveal; a cancelled hold (or a
    // reveal opened via the chip) leaves the chip's toggle in charge.
    if (!wasArmed && revealed) hide();
  };

  // Crossfade timings — collapse to an instant cut under reduced motion.
  const fadeIn = reduced ? { duration: 0 } : { duration: durations.slow, ease: easings.inOut };
  const fadeOut = reduced ? { duration: 0 } : { duration: durations.base, ease: easings.inOut };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
      <div
        className="relative w-full rounded-lg border border-white/10 overflow-hidden select-none"
        style={{ aspectRatio: "2480 / 1754" }}
        onPointerDown={onPointerDown}
        onPointerUp={endHold}
        onPointerLeave={endHold}
        onPointerCancel={endHold}
      >
        <img
          src={certificate.image_url}
          alt={`Certificate for ${certificate.course_name}`}
          className="w-full h-full object-cover"
          draggable={false}
        />

        {/* UV "blacklight" layer — deep black with champagne-glowing security
            print. Only opacity + a ±1.5° settle animate; the glow is baked. */}
        <motion.div
          aria-hidden={!revealed}
          initial={false}
          animate={{
            opacity: revealed ? 1 : 0,
            rotate: revealed ? 0 : reduced ? 0 : 1.5,
            scale: 1.04,
          }}
          transition={{
            opacity: revealed ? fadeIn : fadeOut,
            rotate: reduced ? { duration: 0 } : springs.glide,
            scale: { duration: 0 },
          }}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black px-4 text-center pointer-events-none"
        >
          <span
            className="font-serif italic text-2xl text-[hsl(var(--champagne-from))]"
            style={glow}
          >
            ✦
          </span>
          <p
            className="font-mono text-[10px] uppercase tracking-[0.28em] text-[hsl(var(--champagne-from))]"
            style={glow}
          >
            Member {profile?.member_number ?? "—"}
          </p>
          <p
            className="font-serif italic text-base leading-tight text-[hsl(var(--champagne-from))] line-clamp-2"
            style={glow}
          >
            {certificate.course_name}
          </p>
          <p
            className="font-mono text-[10px] tracking-wider text-[hsl(var(--champagne-from))]"
            style={glow}
          >
            {certificate.certificate_number}
          </p>
          <p
            className="font-mono text-[10px] tracking-wider text-[hsl(var(--champagne-from))]"
            style={glow}
          >
            {dateEarned}
          </p>
        </motion.div>

        {/* ✦ toggle chip — instant on tap, ≥44px, screen-reader pressed state. */}
        <button
          type="button"
          aria-pressed={revealed}
          aria-label={revealed ? "Hide certificate details" : "Reveal certificate details"}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className="absolute right-2 top-2 z-10 inline-flex h-11 min-w-[44px] items-center justify-center gap-1.5 rounded-full border border-cream/20 bg-black/55 px-3 text-cream transition-colors [@media(hover:hover)]:hover:bg-black/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold text-white">{certificate.course_name}</h3>
        <p className="text-xs text-white/50 font-mono">{certificate.certificate_number}</p>
        <p className="text-sm text-white/70">Earned on {dateEarned}</p>
      </div>

      <div className="flex items-center gap-2 mt-auto">
        <CertificateShareMenu
          imageUrl={certificate.image_url}
          courseName={certificate.course_name}
          certificateNumber={certificate.certificate_number}
        >
          <Button variant="champagne" haptic={false} className="flex-1 min-h-[44px] gap-2 text-sm">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
        </CertificateShareMenu>
        <Button variant="outline" asChild className="min-h-[44px] gap-2">
          <a href={certificate.image_url} download={`certificate-${certificate.certificate_number}.png`}>
            <Download className="h-4 w-4" />
            Download
          </a>
        </Button>
      </div>
    </div>
  );
};

export default CertificateCard;
