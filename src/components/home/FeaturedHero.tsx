import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useScroll, useTransform, type MotionValue } from "framer-motion";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion/MotionButton";
import { useCatalog } from "@/components/catalog/useCatalog";
import { parseMasterclassTitle } from "@/components/catalog/CatalogCard";
import { useEnrolmentCounts } from "@/hooks/useEnrolmentCounts";
import { durations, easings, instant, useMotionSafe } from "@/lib/motion";

const ROTATE_MS = 6000;

interface HeroSlide {
  key: string;
  image: string;
  headline: string;
  subtitle: string | null;
  slug: string;
}

/**
 * Slow transform-only drift on the artwork — the ken-burns one-off, now driven
 * by a tokenized framer transition (durations.kenburns timing, easings.inOut)
 * so there are zero one-off durations/easings in the diff. Reduced motion holds
 * it perfectly still.
 */
const HeroArtwork = ({
  src,
  eager,
  parallaxY,
  active,
}: {
  src: string;
  eager: boolean;
  parallaxY: MotionValue<string>;
  active: boolean;
}) => {
  const { enabled } = useMotionSafe();
  return (
    // Vertical overscan (-inset-y-[10%] → 120% tall, centred) gives the parallax
    // translate headroom so moving the artwork never reveals a gap at the edges.
    <motion.div
      className="absolute -inset-y-[10%] inset-x-0 transform-gpu"
      style={{ y: parallaxY }}
    >
      <motion.img
        src={src}
        alt=""
        loading={eager ? "eager" : "lazy"}
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        // Ken-burns drift, transform-only. Runs on the active slide only so
        // off-screen crossfaded copies don't animate. Tokenized timing/easing.
        initial={false}
        animate={enabled && active ? { scale: 1.04 } : { scale: 1 }}
        transition={{
          duration: durations.kenburns, // 9s slow drift (mirrors the .kenburns CSS class)
          ease: easings.inOut,
          repeat: Infinity,
          repeatType: "reverse",
        }}
      />
    </motion.div>
  );
};

// Full-bleed rotating banner of up to 3 masterclass offerings. No prices,
// purely editorial, so no native price gating is needed here.
const FeaturedHero = () => {
  const { data: courses } = useCatalog();
  const { enabled, springs, pressTap } = useMotionSafe();

  const masterclasses = useMemo(
    () =>
      (courses ?? []).filter(
        (c) =>
          c.product_tier === "masterclass" &&
          c.status === "published" &&
          c.offering_slug &&
          (c.offering_banner_url || c.thumbnail_url)
      ),
    [courses]
  );

  const offeringIds = useMemo(
    () => masterclasses.map((c) => c.offering_id).filter((id): id is string => Boolean(id)),
    [masterclasses]
  );
  const { counts } = useEnrolmentCounts(offeringIds);

  const slides: HeroSlide[] = useMemo(() => {
    const sorted = [...masterclasses].sort((a, b) => {
      // Prefer entries with a real banner, then by enrolment count when we
      // have it, then by catalogue sort_order.
      const bannerDelta =
        Number(!!b.offering_banner_url) - Number(!!a.offering_banner_url);
      if (bannerDelta !== 0) return bannerDelta;
      const ca = a.offering_id ? counts[a.offering_id] ?? 0 : 0;
      const cb = b.offering_id ? counts[b.offering_id] ?? 0 : 0;
      if (ca !== cb) return cb - ca;
      return a.sort_order - b.sort_order;
    });
    return sorted.slice(0, 3).map((c) => {
      const parsed = parseMasterclassTitle(c.title);
      return {
        key: c.id,
        image: (c.offering_banner_url || c.thumbnail_url) as string,
        headline: parsed ? parsed.name : c.title,
        subtitle:
          c.offering_subtitle ?? (parsed ? `Teaches ${parsed.craft.toLowerCase()}` : null),
        slug: c.offering_slug as string,
      };
    });
  }, [masterclasses, counts]);

  const [index, setIndex] = useState(0);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);

  // Subtle scroll parallax: the artwork translates SLOWER than the page as the
  // hero scrolls through the viewport (transform-only, no layout reads). Tracked
  // against the section's own scroll progress so it eases in/out of frame.
  const sectionRef = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  // Reduced motion ⇒ the artwork stays put (range collapses to 0), so scrolling
  // never translates it.
  const parallaxY = useTransform(scrollYProgress, [0, 1], ["0%", enabled ? "7%" : "0%"]);

  // Both the ken-burns scale drift and the auto-rotation only run while the hero
  // is actually on screen. A long-running transform on a large image (and the
  // crossfades each rotation triggers) is a WebView battery/jank tax when the
  // banner is scrolled away — useInView flips false once it leaves the viewport,
  // parking the scale at 1 and halting the timer until it returns.
  const inView = useInView(sectionRef, { amount: 0.2 });

  // Keep index valid if the slide list shrinks (e.g. cache refresh).
  useEffect(() => {
    if (index >= slides.length && slides.length > 0) setIndex(0);
  }, [slides.length, index]);

  useEffect(() => {
    if (slides.length < 2) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    if (paused) return;
    if (!inView) return;
    const t = setInterval(() => {
      if (!pausedRef.current) setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [slides.length, paused, inView]);

  if (!slides.length) return null;

  const pause = () => {
    pausedRef.current = true;
    setPaused(true);
  };
  const resume = () => {
    pausedRef.current = false;
    setPaused(false);
  };

  return (
    <section
      ref={sectionRef}
      aria-label="Featured masterclasses"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
      className="relative -mx-4 md:mx-0 rounded-none md:rounded-3xl overflow-hidden ring-0 md:ring-1 ring-white/5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]"
    >
      <div className="relative aspect-[4/5] sm:aspect-[16/8] lg:aspect-[21/8] max-h-[520px] w-full bg-surface-2">
        {slides.map((s, i) => (
          <motion.div
            key={s.key}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0",
              i === index ? "" : "pointer-events-none"
            )}
            // Tokenized opacity crossfade (was `transition-opacity duration-700
            // ease-out`) — now a framer transition on durations.slow / easings.out
            // so the timing lives on the motion tokens, not a one-off class.
            // Gated on motionSafe like the ken-burns/parallax above: reduced motion
            // ⇒ `instant` (duration 0) so slides swap without a fade.
            initial={false}
            animate={{ opacity: i === index ? 1 : 0 }}
            transition={
              enabled ? { duration: durations.slow, ease: easings.out } : instant
            }
          >
            <div className="absolute inset-0 overflow-hidden">
              <HeroArtwork
                src={s.image}
                eager={i === 0}
                parallaxY={parallaxY}
                active={i === index && inView}
              />
            </div>
            {/* Dark gradients keep the overlaid copy legible on any art. */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/45 to-black/10" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute inset-0 flex flex-col justify-end p-5 sm:p-8 lg:p-10">
              <div className="max-w-xl space-y-2.5 sm:space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-[0.22em] text-[hsl(var(--cream))]/80">
                  Masterclass
                </p>
                <h2 className="text-2xl sm:text-4xl lg:text-5xl font-bold tracking-[-0.01em] leading-[1.05] text-white">
                  {s.headline}
                </h2>
                {s.subtitle && (
                  <p className="font-serif-italic text-base sm:text-lg text-white/80 line-clamp-1">
                    {s.subtitle}
                  </p>
                )}
                <div className="pt-1.5">
                  {/* Shared spring press (whileTap pressTap via MotionButton),
                      replacing the one-off .pressable CSS so the highest-intent
                      Home CTA matches the pagination dots below. Focus-visible
                      ring stays on the Link. */}
                  <MotionButton asChild>
                    <Link
                      to={`/p/${s.slug}`}
                      aria-label={`Explore ${s.headline}`}
                      className="inline-flex items-center justify-center h-11 px-6 rounded-full bg-cream text-cream-text text-sm font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                    >
                      Explore
                    </Link>
                  </MotionButton>
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {slides.length > 1 && (
          // -mr-2 pulls the last dot's padding flush to the frame edge so the
          // visual dots keep their bottom-4/right-5 inset while each button is a
          // 44px tap target.
          <div className="absolute bottom-4 right-5 sm:right-8 -mr-2 flex items-center z-10">
            {slides.map((s, i) => (
              <motion.button
                key={s.key}
                aria-label={`Show featured masterclass ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                // Hit area ≥44px via padding; the visual dot lives on the inner
                // span so its size is unchanged. Press feedback via motionSafe
                // pressTap (reduced motion ⇒ no scale).
                className="group grid place-items-center min-h-[44px] min-w-[44px] px-0.5 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                whileTap={pressTap}
              >
                <motion.span
                  aria-hidden
                  className={cn(
                    "block h-1.5 rounded-full",
                    i === index ? "w-5 bg-[hsl(var(--cream))]" : "w-1.5 bg-white/40 group-hover:bg-white/60"
                  )}
                  // Width/colour settle on the glide spring (reduced motion ⇒ instant).
                  layout
                  transition={springs.glide}
                />
              </motion.button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedHero;
