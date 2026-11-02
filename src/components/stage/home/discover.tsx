import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { tapTick } from "@/lib/haptics";
import { isNative } from "@/lib/platform";
import { media } from "@/components/stage/landing/landing";
import { inr, type CatalogItem, type StageCatalog, type Tier } from "./catalog";

/*
 * Home for someone who hasn't bought yet, round 3 (founder, 2026-11-02; vault
 * 03_Specs/01_Home_New_Person_Plan.md): a carousel of five programmes, each
 * playing its own loop, then the masterclasses, the live cohorts and the
 * workshops as the same wide cards, and the page ends. Someone who owns
 * something gets BuyerHome instead. No prices in the phone apps (store rules).
 */

/** The carousel, in order. Cohorts use the headline from their page; a masterclass gets its own line. */
const SLIDES: { slug: string; title?: string }[] = [
  { slug: "breakthrough-filmmakers-program" },
  { slug: "nelson-dilipkumar-teaches-filmmaking", title: "Learn filmmaking from Nelson Dilipkumar" },
  { slug: "video-editing-academy" },
  { slug: "ravi-basrur-teaches-music-composition", title: "Learn music from Ravi Basrur" },
  { slug: "creator-academy" },
];
/** Live cohorts with a page, in this order. */
const COHORTS = ["breakthrough-filmmakers-program", "video-editing-academy", "creator-academy"];
/** A workshop without its own picture: a real LevelUp live session. */
const WORKSHOP_ART = "cohort/l3c/a7bd60764e98.png";

/* ---- what each product's page (offerings.landing) says about itself ---- */
type Pair = string | { d?: string | null; m?: string | null } | null | undefined;
export interface Head {
  id: string; slug: string; title: string; product_tier: string; price_inr: number | string | null; v: number | null;
  hero: { headline?: string; image?: Pair; video?: Pair; video_m?: string | null; once?: boolean } | null;
  facts: { label: string; value: string }[] | null;
  /** a wide picture for the masterclass's card */
  card: string | null;
}
export function useLandingHeads() {
  return useQuery({
    queryKey: ["stage-landing-heads"],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<Head[]> => {
      const { data, error } = await supabase
        .from("offerings")
        .select("id, slug, title, product_tier, price_inr, v:landing->v, hero:landing->hero, facts:landing->facts, card:landing->card")
        .eq("is_public", true).eq("status", "active")
        .not("landing", "is", null);
      if (error) throw error;
      return (data ?? []) as unknown as Head[];
    },
  });
}
const pick = (p: Pair, wide: boolean) => (!p ? null : typeof p === "string" ? p : (wide ? p.d ?? p.m : p.m ?? p.d) ?? null);
const fact = (h: Head | undefined, re: RegExp) => h?.facts?.find((f) => re.test(f.label))?.value ?? null;

function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 900px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return wide;
}
const still = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- the carousel ---- */
interface Slide { slug: string; eyebrow: string; title: string; line: string; cta: string; video: string | null; poster: string | null; once: boolean }

function toSlide(s: (typeof SLIDES)[number], h: Head | undefined, wide: boolean, native: boolean): Slide | null {
  if (!h?.hero) return null;
  const cohort = h.product_tier === "live_cohort";
  const price = Number(h.price_inr) || 0;
  const video = cohort ? (wide ? pick(h.hero.video, true) ?? h.hero.video_m : h.hero.video_m ?? pick(h.hero.video, false)) : pick(h.hero.video, wide);
  return {
    slug: h.slug,
    eyebrow: cohort ? "Live cohort · Applications open" : "Masterclass",
    title: s.title ?? h.hero.headline ?? h.title,
    line: cohort
      ? [h.title, fact(h, /next cohort/i)].filter(Boolean).join(" · ")
      : ["Watch at your own pace", !native && price > 0 ? inr(price) : null].filter(Boolean).join(" · "),
    cta: cohort ? "See the program" : "See the masterclass",
    video: video ?? null,
    poster: pick(h.hero.image, wide),
    once: !!h.hero.once,
  };
}

/** Plays only while its slide is the one showing and the carousel is on screen. */
function SlideVideo({ src, poster, playing, once }: { src: string; poster: string | null; playing: boolean; once: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    if (playing) {
      if (once && v.ended) v.currentTime = 0;
      void v.play().catch(() => {});
    } else v.pause();
  }, [playing, once]);
  return <video ref={ref} className="hc-media" src={media(src)} poster={media(poster)} muted loop={!once} playsInline preload={playing ? "auto" : "none"} aria-hidden />;
}

export function HomeCarousel({ heads }: { heads: Head[] }) {
  const navigate = useNavigate();
  const wide = useWide();
  const native = isNative();
  const slides = useMemo(
    () => SLIDES.map((s) => toSlide(s, heads.find((h) => h.slug === s.slug), wide, native)).filter((s): s is Slide => !!s),
    [heads, wide, native],
  );
  const box = useRef<HTMLElement | null>(null);
  const track = useRef<HTMLDivElement | null>(null);
  const [at, setAt] = useState(0);
  const [seen, setSeen] = useState(true);
  const atRef = useRef(0);
  atRef.current = at;
  const hold = useRef(0);
  const calm = still();

  const stride = (el: HTMLElement) => {
    const [a, b] = Array.from(el.children) as HTMLElement[];
    return a && b ? b.offsetLeft - a.offsetLeft : el.clientWidth;
  };
  const go = (n: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: n * stride(el), behavior: calm ? "auto" : "smooth" });
  };
  const nudge = (n: number) => { hold.current = Date.now() + 10_000; go((n + slides.length) % slides.length); };

  // Which slide is showing, from the scroll position (swipes included).
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const onScroll = () => setAt(Math.min(slides.length - 1, Math.max(0, Math.round(el.scrollLeft / (stride(el) || 1)))));
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [slides.length]);

  // Videos rest while the carousel is scrolled out of view.
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // It turns by itself, except while someone is touching it, it's hidden, or motion is reduced.
  useEffect(() => {
    if (calm || slides.length < 2) return;
    const t = window.setInterval(() => {
      if (document.hidden || Date.now() < hold.current) return;
      go((atRef.current + 1) % slides.length);
    }, 6000);
    return () => window.clearInterval(t);
  }, [calm, slides.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!slides.length) return null;
  return (
    <section
      ref={box}
      className="hc-hero"
      aria-roledescription="carousel"
      aria-label="Featured programmes"
      onPointerEnter={(e) => { if (e.pointerType === "mouse") hold.current = Infinity; }}
      onPointerLeave={(e) => { if (e.pointerType === "mouse") hold.current = 0; }}
      onTouchStart={() => { hold.current = Date.now() + 10_000; }}
    >
      <div ref={track} className="hc-track">
        {slides.map((s, n) => (
          <button key={s.slug} type="button" className="hc-slide" onClick={() => { void tapTick(); navigate(`/p/${s.slug}`); }}>
            <span className="hc-slide-art">
              {s.video && !calm
                ? <SlideVideo src={s.video} poster={s.poster} playing={seen && n === at} once={s.once} />
                : s.poster && <img className="hc-media" src={media(s.poster)} alt="" decoding="async" fetchPriority={n === 0 ? "high" : "auto"} />}
            </span>
            <span className="hc-slide-b">
              <span className="hc-eyebrow">{s.eyebrow}</span>
              <b className="hc-slide-t">{s.title}</b>
              <span className="hc-slide-l">{s.line}</span>
              <span className="hc-go">{s.cta}<ArrowRight className="ic" /></span>
            </span>
          </button>
        ))}
      </div>
      {slides.length > 1 && (
        <div className="hc-ctrl">
          <span className="hc-dots">
            {slides.map((s, n) => (
              <button key={s.slug} type="button" className={`hc-dot${n === at ? " is-on" : ""}`} aria-label={`Show slide ${n + 1} of ${slides.length}`} aria-current={n === at} onClick={() => nudge(n)}>
                <span />
              </button>
            ))}
          </span>
          <span className="rail-nav">
            <button type="button" onClick={() => nudge(at - 1)} aria-label="Previous slide"><ChevronLeft className="ic" /></button>
            <button type="button" onClick={() => nudge(at + 1)} aria-label="Next slide"><ChevronRight className="ic" /></button>
          </span>
        </div>
      )}
    </section>
  );
}

/* ---- the three rows: the same wide card for every format ---- */
interface Card { id: string; slug: string; art: string | null; kicker: string | null; title: string; meta: string }

function CardRow({ id, title, tier, cards }: { id: string; title: string; tier: Tier; cards: Card[] }) {
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  if (!cards.length) return null;
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section className="sec" aria-labelledby={id}>
      <div className="sec-head">
        <h2 className="sec-h" id={id}>{title}</h2>
        <span className="sec-tools">
          {cards.length > 3 && (
            <span className="rail-nav">
              <button type="button" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft className="ic" /></button>
              <button type="button" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight className="ic" /></button>
            </span>
          )}
          <button className="sec-link" type="button" onClick={() => navigate(`/explore?tier=${tier}`)}>See all</button>
        </span>
      </div>
      <div ref={ref} className="hc-rail">
        {cards.map((c) => (
          <button key={c.id} type="button" className="hc-card" onClick={() => { void tapTick(); navigate(`/p/${c.slug}`); }}>
            <span className="hc-card-art">{c.art && <img src={c.art} alt="" loading="lazy" decoding="async" />}</span>
            <span className="hc-card-b">
              {c.kicker && <span className="hc-eyebrow">{c.kicker}</span>}
              <b className="hc-card-t">{c.title}</b>
              {c.meta && <span className="hc-card-m">{c.meta}</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export function HomeRows({ data, heads }: { data: StageCatalog; heads: Head[] }) {
  const native = isNative();
  const bySlug = new Map(heads.map((h) => [h.slug, h]));
  const list = (t: Tier) => data.formats.find((f) => f.tier === t)?.list.filter((x) => !x.owned) ?? [];
  const price = (x: CatalogItem) => (!native && x.offering.price > 0 ? inr(x.offering.price) : null);

  const masterclasses: Card[] = list("masterclass").map((x) => ({
    id: x.offering.id, slug: x.offering.slug,
    art: media(bySlug.get(x.offering.slug)?.card) ?? x.offering.thumbnail_url,
    kicker: null,
    title: x.offering.title,
    meta: [x.lessons ? `${x.lessons} lessons` : null, price(x)].filter(Boolean).join(" · "),
  }));
  const cohorts: Card[] = list("live_cohort")
    .filter((x) => bySlug.get(x.offering.slug)?.v === 2)
    .sort((a, b) => (COHORTS.indexOf(a.offering.slug) + 99) % 99 - (COHORTS.indexOf(b.offering.slug) + 99) % 99)
    .map((x) => {
      const h = bySlug.get(x.offering.slug);
      return {
        id: x.offering.id, slug: x.offering.slug,
        art: media(pick(h?.hero?.image, true)) ?? x.offering.thumbnail_url,
        kicker: fact(h, /next cohort/i),
        title: x.offering.title,
        meta: [fact(h, /duration/i), fact(h, /format/i)].filter(Boolean).join(" · "),
      };
    });
  const workshops: Card[] = list("workshop").map((x) => ({
    id: x.offering.id, slug: x.offering.slug,
    art: x.offering.thumbnail_url ?? media(WORKSHOP_ART) ?? null,
    kicker: null,
    title: x.offering.title,
    meta: [x.videos ? `${x.videos} videos` : null, x.files ? `${x.files} files` : null, price(x)].filter(Boolean).join(" · "),
  }));

  return (
    <>
      <CardRow id="hcMcH" title="Masterclasses" tier="masterclass" cards={masterclasses} />
      <CardRow id="hcCoH" title="Live cohorts" tier="live_cohort" cards={cohorts} />
      <CardRow id="hcWsH" title="Workshops" tier="workshop" cards={workshops} />
    </>
  );
}
