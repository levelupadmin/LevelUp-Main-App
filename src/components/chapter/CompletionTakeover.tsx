import { useEffect } from "react";
import { Share2, ArrowRight, X, Check } from "lucide-react";
import Confetti from "@/components/Confetti";
import { hapticImpact, hapticNotification } from "@/lib/haptics";

interface Props {
  open: boolean;
  /** "lesson" tweaks copy/CTA vs. a whole-course completion. */
  variant?: "lesson" | "course";
  /** Headline, e.g. "Lesson complete" or the course title. */
  title: string;
  /** Optional supporting line under the title. */
  subtitle?: string;
  /** Course/lesson key-art shown inside the champagne medallion. */
  artUrl?: string | null;
  /** Continue CTA label. Defaults by variant. */
  continueLabel?: string;
  onContinue: () => void;
  onShare: () => void;
  /** Dismiss (backdrop/close). Falls back to onContinue when omitted. */
  onClose?: () => void;
}

/**
 * Full-screen cinematic "complete" takeover for the lesson player. A champagne
 * ring medallion frames the course key-art (or a check fallback), a one-shot
 * confetti burst fires on open, and the student gets Share + Continue actions.
 * Entirely props-driven and reusable for both a single-lesson and a
 * whole-course completion. ChapterViewer owns the open/close lifecycle and
 * wires onContinue/onShare to real navigation/share handlers.
 */
export default function CompletionTakeover({
  open,
  variant = "lesson",
  title,
  subtitle,
  artUrl,
  continueLabel,
  onContinue,
  onShare,
  onClose,
}: Props) {
  // Celebratory haptic on open, and lock body scroll while the takeover is up.
  useEffect(() => {
    if (!open) return;
    void hapticNotification("success");
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Escape closes (or continues) the takeover.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") (onClose ?? onContinue)();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, onContinue]);

  if (!open) return null;

  const isCourse = variant === "course";
  const kicker = isCourse ? "Course complete" : "Lesson complete";
  const ctaLabel = continueLabel ?? (isCourse ? "Back to course" : "Next lesson");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${kicker}: ${title}`}
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center px-6 text-center safe-top safe-bottom"
      style={{
        background:
          "radial-gradient(120% 90% at 50% 35%, hsl(var(--surface)) 0%, hsl(var(--canvas)) 55%, #000 100%)",
      }}
      onClick={() => (onClose ?? onContinue)()}
    >
      <Confetti active={open} duration={3500} />

      {onClose && (
        <button
          type="button"
          aria-label="Close"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="absolute top-4 right-4 safe-top z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/40 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      )}

      {/* Inner stops backdrop-close clicks from propagating. anim-rise gives a
          subtle entrance; reduced-motion users get it statically. */}
      <div
        className="anim-rise relative flex flex-col items-center"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Champagne ring medallion framing the key-art. */}
        <div className="relative mb-7">
          <span
            className="absolute -inset-2 rounded-full opacity-60 blur-xl"
            style={{
              background:
                "conic-gradient(from 180deg, hsl(var(--champagne-from)), hsl(var(--champagne-to)), hsl(var(--cream)))",
            }}
            aria-hidden
          />
          <div
            className="relative h-32 w-32 sm:h-36 sm:w-36 rounded-full p-[3px]"
            style={{
              background:
                "conic-gradient(from 200deg, hsl(var(--cream)), hsl(var(--cream) / 0.35), hsl(var(--cream)))",
            }}
          >
            <div className="h-full w-full overflow-hidden rounded-full bg-surface-2 ring-1 ring-black/40">
              {artUrl ? (
                <img
                  src={artUrl}
                  alt=""
                  className="h-full w-full object-cover"
                  loading="eager"
                  decoding="async"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Check
                    className="h-12 w-12 text-[hsl(var(--cream))]"
                    strokeWidth={2.5}
                  />
                </div>
              )}
            </div>
          </div>
          {/* Small check medal over the medallion's lower edge. */}
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--cream))] text-[hsl(var(--cream-text))] shadow-lg shadow-black/40 ring-2 ring-[hsl(var(--canvas))]">
            <Check className="h-4 w-4" strokeWidth={3} />
          </span>
        </div>

        <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-[hsl(var(--cream))]/70">
          {kicker}
        </p>
        <h2 className="mt-2 max-w-[22ch] text-2xl sm:text-3xl font-semibold leading-tight text-foreground">
          {title}
        </h2>
        {subtitle && (
          <p className="mt-3 max-w-[34ch] text-sm leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}

        <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full max-w-sm">
          <button
            type="button"
            onClick={() => {
              void hapticImpact("light");
              onShare();
            }}
            className="pressable inline-flex items-center justify-center gap-2 rounded-full border border-[hsl(var(--cream))]/30 bg-black/30 px-5 py-3 text-sm font-medium text-foreground hover:bg-black/50 min-h-[48px] flex-1"
          >
            <Share2 className="h-4 w-4" />
            Share
          </button>
          <button
            type="button"
            onClick={() => {
              void hapticImpact("medium");
              onContinue();
            }}
            className="btn-champagne pressable inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm font-semibold text-[hsl(var(--cream-text))] min-h-[48px] flex-1"
          >
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
