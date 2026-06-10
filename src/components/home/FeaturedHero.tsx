import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useCatalog } from "@/components/catalog/useCatalog";
import { parseMasterclassTitle } from "@/components/catalog/CatalogCard";
import { useEnrolmentCounts } from "@/hooks/useEnrolmentCounts";

const ROTATE_MS = 6000;

interface HeroSlide {
  key: string;
  image: string;
  headline: string;
  subtitle: string | null;
  slug: string;
}

// Full-bleed rotating banner of up to 3 masterclass offerings. No prices,
// purely editorial, so no native price gating is needed here.
const FeaturedHero = () => {
  const { data: courses } = useCatalog();

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
    const t = setInterval(() => {
      if (!pausedRef.current) setIndex((i) => (i + 1) % slides.length);
    }, ROTATE_MS);
    return () => clearInterval(t);
  }, [slides.length, paused]);

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
      aria-label="Featured masterclasses"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onTouchStart={pause}
      onTouchEnd={resume}
      className="relative -mx-4 md:mx-0 rounded-none md:rounded-3xl overflow-hidden ring-0 md:ring-1 ring-white/5 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6)]"
    >
      <div className="relative aspect-[4/5] sm:aspect-[16/8] lg:aspect-[21/8] max-h-[520px] w-full bg-surface-2">
        {slides.map((s, i) => (
          <div
            key={s.key}
            aria-hidden={i !== index}
            className={cn(
              "absolute inset-0 transition-opacity duration-700 ease-out",
              i === index ? "opacity-100" : "opacity-0 pointer-events-none"
            )}
          >
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={s.image}
                alt=""
                loading={i === 0 ? "eager" : "lazy"}
                className="kenburns absolute inset-0 w-full h-full object-cover"
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
                  <Link
                    to={`/p/${s.slug}`}
                    aria-label={`Explore ${s.headline}`}
                    className="pressable inline-flex items-center justify-center h-11 px-6 rounded-full bg-cream text-cream-text text-sm font-semibold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--cream))] focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                  >
                    Explore
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))}

        {slides.length > 1 && (
          <div className="absolute bottom-4 right-5 sm:right-8 flex items-center gap-1.5 z-10">
            {slides.map((s, i) => (
              <button
                key={s.key}
                aria-label={`Show featured masterclass ${i + 1}`}
                aria-current={i === index}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === index ? "w-5 bg-[hsl(var(--cream))]" : "w-1.5 bg-white/40 hover:bg-white/60"
                )}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FeaturedHero;
