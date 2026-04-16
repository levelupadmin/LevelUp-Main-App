import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// Editorial chapter imagery — curated cinematic stills rather than marketing
// posters. Each still evokes the discipline; no mentor-portrait collages, no
// "iPad mock-up" visuals, no promotional cube overlays.
import bgDirection from "@/assets/hero-filmmaking-1.jpg";
import bgCinematography from "@/assets/hero-cinematography-1.jpg";
import bgWriting from "@/assets/skill-writing.jpg";
import bgEditing from "@/assets/hero-editing-1.jpg";
import bgSound from "@/assets/skill-music.jpg";

/**
 * HeroCarousel — Anthology edition
 *
 * A quiet, editorial carousel built for the target audience: aspiring Indian
 * filmmakers and creators who respond to craft, story, and restraint — not to
 * hard-sell marketing posters. The language is pulled from film periodicals
 * (Criterion, Notebook, Sight & Sound) rather than ad creatives.
 *
 * Intentional choices:
 *   • Each slide is a "chapter" — the dashboard reads like the cover of an
 *     anthology, not a sale rack.
 *   • Single full-bleed still + deep vertical gradient. No split posters, no
 *     portrait collages, no CTA buttons competing for attention.
 *   • A serif display headline (Instrument Serif) carries each slide. A
 *     monospaced eyebrow acts as a magazine section rule. Italic accents and
 *     tall letter-spacing supply the craft feel.
 *   • One discreet underlined link. A slim progress rule at the base of the
 *     card. A small "01 / 05" counter. That's all the UI asks of you.
 *   • Slides are intentionally curated editorial copy — the dashboard speaks
 *     with a single curated voice. Admin-editable hero slides can be re-wired
 *     later if desired.
 */

type Chapter = {
  id: string;
  eyebrow: string;
  headlinePrefix: string;
  headlineAccent: string;
  subtitle: string;
  cta: string;
  background: string;
  backgroundPosition?: string;
};

const CHAPTERS: Chapter[] = [
  {
    id: "direction",
    eyebrow: "Chapter 01 · Direction",
    headlinePrefix: "Every frame",
    headlineAccent: "is a decision.",
    subtitle:
      "Staging, shot rhythm, and the quiet art of guiding a performance — the craft of directing the picture.",
    cta: "/browse?focus=direction",
    background: bgDirection,
    backgroundPosition: "center 30%",
  },
  {
    id: "cinematography",
    eyebrow: "Chapter 02 · Cinematography",
    headlinePrefix: "Light writes the",
    headlineAccent: "story first.",
    subtitle:
      "Read a scene before you shoot it. Compose with intention, and let the frame do the talking.",
    cta: "/browse?focus=cinematography",
    background: bgCinematography,
    backgroundPosition: "center 40%",
  },
  {
    id: "writing",
    eyebrow: "Chapter 03 · Screenwriting",
    headlinePrefix: "Begin",
    headlineAccent: "at the ending.",
    subtitle:
      "Structure, character, and voice — the craft of the page before the first camera moves.",
    cta: "/browse?focus=writing",
    background: bgWriting,
    backgroundPosition: "center 35%",
  },
  {
    id: "editing",
    eyebrow: "Chapter 04 · Editing",
    headlinePrefix: "The cut is where",
    headlineAccent: "film happens.",
    subtitle:
      "Pace, continuity, and the invisible grammar of the edit — where footage becomes a film.",
    cta: "/browse?focus=editing",
    background: bgEditing,
    backgroundPosition: "center 45%",
  },
  {
    id: "sound",
    eyebrow: "Chapter 05 · Sound & Score",
    headlinePrefix: "Half of what you see,",
    headlineAccent: "you hear.",
    subtitle:
      "Score, foley, and dialogue — the craft that decides what a film actually feels like.",
    cta: "/browse?focus=sound",
    background: bgSound,
    backgroundPosition: "center 50%",
  },
];

const AUTOPLAY_MS = 6800;

const HeroCarousel = () => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const progressRef = useRef<HTMLSpanElement>(null);

  const total = CHAPTERS.length;
  const chapter = CHAPTERS[activeIndex];

  const next = useCallback(() => setActiveIndex((i) => (i + 1) % total), [total]);
  const prev = useCallback(
    () => setActiveIndex((i) => (i - 1 + total) % total),
    [total]
  );
  const goTo = useCallback((i: number) => setActiveIndex(i), []);

  // Autoplay — pauses on hover / focus
  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(next, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [next, paused, activeIndex]);

  // Restart the progress rule whenever the active chapter changes
  useEffect(() => {
    if (!progressRef.current) return;
    progressRef.current.style.animation = "none";
    // Force reflow so the animation restarts cleanly
    void progressRef.current.offsetHeight;
    progressRef.current.style.animation = "";
  }, [activeIndex]);

  const counter = useMemo(
    () =>
      `${String(activeIndex + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`,
    [activeIndex, total]
  );

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label="Chapters of the creative craft"
      tabIndex={0}
      className="group relative isolate w-full overflow-hidden rounded-[28px] bg-black focus-ring"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") prev();
        else if (e.key === "ArrowRight") next();
      }}
    >
      <div className="relative w-full aspect-[16/9] min-h-[440px] md:aspect-[16/7] md:min-h-[520px]">
        {/* ───────── Full-bleed cinematic still ───────── */}
        <AnimatePresence initial={false} mode="sync">
          <motion.img
            key={chapter.id + "-bg"}
            src={chapter.background}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
            style={{ objectPosition: chapter.backgroundPosition ?? "center" }}
            initial={{ opacity: 0, scale: 1.03 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          />
        </AnimatePresence>

        {/* Editorial gradient — deep at the base so type has room to breathe */}
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10"
        />
        {/* Soft left-side vignette for legibility in the copy zone */}
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-2/3 bg-gradient-to-r from-black/60 via-black/20 to-transparent"
        />
        {/* Grain — ties the hero to the rest of the app */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 grain opacity-40"
        />

        {/* ───────── Top rule: masthead + counter ───────── */}
        <div className="absolute inset-x-6 top-6 z-10 flex items-center justify-between md:inset-x-10 md:top-8">
          <span className="font-mono text-[11px] uppercase tracking-[0.28em] text-cream/80">
            LevelUp · Anthology
          </span>
          <span className="font-mono text-[11px] tabular-nums uppercase tracking-[0.28em] text-cream/60">
            {counter}
          </span>
        </div>

        {/* ───────── Copy block ───────── */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-14 md:px-12 md:pb-16">
          <div className="max-w-3xl">
            <AnimatePresence mode="wait">
              <motion.div
                key={chapter.id + "-copy"}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-cream/80">
                  {chapter.eyebrow}
                </p>

                <h2 className="mt-4 font-serif text-[44px] leading-[1.02] tracking-[-0.01em] text-white sm:text-[56px] md:text-[72px]">
                  <span className="block">{chapter.headlinePrefix}</span>
                  <span className="block italic text-cream">{chapter.headlineAccent}</span>
                </h2>

                <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-white/80 md:text-base">
                  {chapter.subtitle}
                </p>

                <div className="mt-7 flex items-center gap-6">
                  <Link
                    to={chapter.cta}
                    className="group/cta inline-flex items-center gap-2 text-[12px] uppercase tracking-[0.22em] text-white transition-colors hover:text-cream"
                  >
                    <span className="relative">
                      Explore this chapter
                      <span className="absolute inset-x-0 -bottom-1 block h-px bg-white/40 transition-colors group-hover/cta:bg-cream" />
                    </span>
                    <ArrowUpRight className="h-4 w-4 transition-transform group-hover/cta:translate-x-0.5 group-hover/cta:-translate-y-0.5" />
                  </Link>

                  <Link
                    to="/browse"
                    className="hidden text-[12px] uppercase tracking-[0.22em] text-white/60 transition-colors hover:text-white sm:inline-flex"
                  >
                    Browse all
                  </Link>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* ───────── Chapter navigator — slim rules along the base ───────── */}
        <div className="absolute inset-x-6 bottom-6 z-10 flex items-center gap-2 md:inset-x-10 md:bottom-7">
          {CHAPTERS.map((c, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={c.id}
                type="button"
                aria-label={`Go to ${c.eyebrow}`}
                aria-current={isActive ? "true" : undefined}
                onClick={() => goTo(i)}
                className="relative h-[2px] flex-1 overflow-hidden rounded-full bg-white/15 transition-colors hover:bg-white/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-cream/70"
              >
                {isActive && !paused && (
                  <span
                    ref={progressRef}
                    className="absolute inset-y-0 left-0 block bg-cream"
                    style={{
                      animationName: "heroProgress",
                      animationDuration: `${AUTOPLAY_MS}ms`,
                      animationTimingFunction: "linear",
                      animationFillMode: "forwards",
                    }}
                  />
                )}
                {isActive && paused && (
                  <span className="absolute inset-y-0 left-0 block w-full bg-cream/60" />
                )}
              </button>
            );
          })}
        </div>

        {/* Keyframes for the progress rule */}
        <style>{`
          @keyframes heroProgress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </div>
    </section>
  );
};

export default HeroCarousel;
