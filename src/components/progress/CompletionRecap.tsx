import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { X, ChevronRight, Trophy, Clock, BookOpen, User, Sparkles } from "lucide-react";
import { CountUp } from "@/components/motion/CountUp";
import Confetti from "@/components/Confetti";
import { hapticImpact, hapticSelection } from "@/lib/haptics";
import { useMotionSafe } from "@/lib/motion";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface CompletionRecapProps {
  open: boolean;
  onClose: () => void;
  /**
   * Fired once the glide-out exit animation has fully played and the recap has
   * unmounted. The completion arc uses this to defer navigation until AFTER the
   * exit finishes — `onClose` merely flips `open` false so the exit can play,
   * and the actual route change happens here (mirrors CompletionTakeover's
   * `onExited`). Without this split, navigating inside `onClose` unmounts the
   * portal synchronously and AnimatePresence never plays the exit.
   */
  onExited?: () => void;
  courseTitle: string;
  instructorName?: string | null;
  /** Total chapters/lessons finished in this course. */
  lessonsCompleted: number;
  /** Total watch time for the course, in minutes. */
  minutesWatched: number;
  /** Course thumbnail / hero, used as a dimmed backdrop. */
  imageUrl?: string | null;
}

interface Slide {
  key: string;
  icon: typeof Trophy;
  eyebrow: string;
  big: React.ReactNode;
  caption: string;
}

const accentForIndex = (i: number) => {
  // Each slide tints the radial glow a touch differently for a "story" feel,
  // all within the warm champagne/emerald palette.
  const tints = [
    "hsl(var(--cream) / 0.22)",
    "hsl(var(--accent-emerald) / 0.20)",
    "hsl(var(--champagne-to) / 0.24)",
    "hsl(var(--cream) / 0.20)",
  ];
  return tints[i % tints.length];
};

/**
 * Spotify-Wrapped-style full-screen completion story. Reusable + props-driven:
 * render it with `open` once a course hits 100%. Tappable slides advance the
 * story; the final slide is a celebratory recap. Portal-rendered so it escapes
 * any card/overflow context, with safe-area padding for notched devices.
 */
export const CompletionRecap = ({
  open,
  onClose,
  onExited,
  courseTitle,
  instructorName,
  lessonsCompleted,
  minutesWatched,
  imageUrl,
}: CompletionRecapProps) => {
  const [index, setIndex] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const motionSafe = useMotionSafe();

  // Full dialog focus management: move focus into the story on open, trap Tab,
  // and restore it to the trigger on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

  const hours = Math.floor(minutesWatched / 60);
  const mins = minutesWatched % 60;
  const watchLabel =
    hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${minutesWatched}m`;

  const slides: Slide[] = [
    {
      key: "intro",
      icon: Trophy,
      eyebrow: "Course complete",
      big: <span className="line-clamp-3">{courseTitle}</span>,
      caption: "You saw it through to the end. Here's your recap.",
    },
    {
      key: "time",
      icon: Clock,
      eyebrow: "Time invested",
      big: (
        <>
          {hours > 0 ? (
            <>
              <CountUp value={hours} />
              <span className="text-3xl align-top">h</span>
              {mins > 0 && (
                <>
                  {" "}
                  <CountUp value={mins} />
                  <span className="text-3xl align-top">m</span>
                </>
              )}
            </>
          ) : (
            <>
              <CountUp value={minutesWatched} />
              <span className="text-3xl align-top">m</span>
            </>
          )}
        </>
      ),
      caption: `That's ${watchLabel} of focused craft. Real time, real reps.`,
    },
    {
      key: "lessons",
      icon: BookOpen,
      eyebrow: "Lessons finished",
      big: <CountUp value={lessonsCompleted} />,
      caption:
        lessonsCompleted === 1
          ? "One lesson down, and a habit started."
          : `Every one of ${lessonsCompleted} lessons, watched to completion.`,
    },
    ...(instructorName
      ? [
          {
            key: "instructor",
            icon: User,
            eyebrow: "Learned from",
            big: <span className="line-clamp-2">{instructorName}</span>,
            caption: "Mentorship from someone who's done the work.",
          } as Slide,
        ]
      : []),
    {
      key: "outro",
      icon: Sparkles,
      eyebrow: "Certificate unlocked",
      big: <span>Well done.</span>,
      caption: "Your certificate is ready in your profile. On to the next one.",
    },
  ];

  const isLast = index >= slides.length - 1;

  const advance = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    hapticSelection();
    setIndex((i) => Math.min(i + 1, slides.length - 1));
  }, [isLast, onClose, slides.length]);

  // Reset to first slide whenever the recap re-opens, and fire celebration.
  useEffect(() => {
    if (open) {
      setIndex(0);
      setConfetti(true);
      hapticImpact("medium");
      const t = setTimeout(() => setConfetti(false), 2600);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Fire confetti again when the user reaches the final slide.
  useEffect(() => {
    if (open && isLast) {
      setConfetti(true);
      hapticImpact("heavy");
      const t = setTimeout(() => setConfetti(false), 2600);
      return () => clearTimeout(t);
    }
  }, [open, isLast]);

  // Keyboard: Esc closes; Arrow keys drive the story so advancing isn't
  // pointer-only. NOTE: this component deliberately does NOT touch
  // document.body.style.overflow — CompletionTakeover is the app's SOLE
  // body-scroll-lock owner (the completion-arc invariant; a second writer here
  // caused the wedged-scroll race the arc was built to fix). The recap is a
  // full-screen `fixed inset-0` portal with `overflow-hidden`, so the covered
  // page is not visible or interactive behind it regardless.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, advance]);

  if (typeof document === "undefined") return null;

  const slide = slides[index];
  const Icon = slide.icon;

  return createPortal(
    <AnimatePresence onExitComplete={onExited}>
      {open && (
        <motion.div
          key="completion-recap"
          role="dialog"
          aria-modal="true"
          aria-label={`Course recap: ${courseTitle}`}
          className="fixed inset-0 z-[9998] bg-canvas text-foreground safe-top pb-safe overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionSafe.springs.glide}
        >
          {/* Focus-trap scope. `display:contents` adds no box (layout is
              unchanged); the ref lives here rather than on the AnimatePresence
              child to avoid framer-motion's PopChild ref warning while still
              wrapping every focusable in the dialog. */}
          <div ref={dialogRef} className="contents">
          <Confetti active={confetti} />

      {/* Dimmed course art backdrop */}
      {imageUrl && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.08] kenburns"
          style={{ backgroundImage: `url(${imageUrl})` }}
          aria-hidden="true"
        />
      )}
      {/* Per-slide radial glow */}
      <div
        className="absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(120% 80% at 50% 18%, ${accentForIndex(index)}, transparent 62%)`,
        }}
        aria-hidden="true"
      />

      {/* Progress segments (story-style) */}
      <div className="relative z-10 flex gap-1.5 px-4 pt-3">
        {slides.map((s, i) => (
          <div key={s.key} className="flex-1 h-1 rounded-full bg-cream/15 overflow-hidden">
            <div
              className="h-full bg-cream transition-all duration-300"
              style={{ width: i < index ? "100%" : i === index ? "100%" : "0%" }}
            />
          </div>
        ))}
      </div>

      {/* Close */}
      <div className="relative z-10 flex justify-end px-4 pt-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close recap"
          className="pressable flex h-11 w-11 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Tappable story body */}
      <button
        type="button"
        onClick={advance}
        className="relative z-10 flex flex-1 h-[calc(100%-7rem)] w-full flex-col items-center justify-center px-8 text-center"
      >
        <div key={slide.key} className="anim-rise flex flex-col items-center max-w-md">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cream/10 text-cream mb-7">
            <Icon className="h-8 w-8" strokeWidth={1.5} />
          </div>
          <p className="text-xs font-mono uppercase tracking-[0.2em] text-cream/70 mb-4">
            {slide.eyebrow}
          </p>
          <div className="text-5xl font-bold leading-tight tabular-nums text-foreground mb-5">
            {slide.big}
          </div>
          <p className="text-base text-muted-foreground leading-relaxed max-w-sm">
            {slide.caption}
          </p>
        </div>
      </button>

      {/* Footer CTA */}
      <div className="relative z-10 px-6 pb-2">
        <button
          type="button"
          onClick={advance}
          className="btn-champagne pressable flex h-12 w-full items-center justify-center gap-1.5 rounded-full font-semibold text-base"
        >
          {isLast ? "Done" : "Next"}
          {!isLast && <ChevronRight className="h-4 w-4" />}
        </button>
        <p className="text-center text-[11px] text-muted-foreground/60 mt-2">
          Tap anywhere to continue
        </p>
      </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};

export default CompletionRecap;
