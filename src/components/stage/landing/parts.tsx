import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowRight, Play, Star } from "lucide-react";
import ContinueOnWebCTA from "@/components/ContinueOnWebCTA";
import { inr, media, type CtaSurface, type LandingAction, type Review, type Video } from "./landing";

/* The pieces both landing templates share. Everything sits inside
   .stage-ui.ld, so the Stage buttons and tokens apply. */

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function Section({ id, eyebrow, title, body, className, children }: {
  id?: string;
  eyebrow?: string | null;
  title?: ReactNode;
  body?: string | null;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <section id={id} className={`ld-sec${className ? ` ${className}` : ""}`} aria-labelledby={id && title ? `${id}-h` : undefined}>
      {(eyebrow || title || body) && (
        <header className="ld-sec-head">
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          {title && <h2 className="ld-h2" id={id ? `${id}-h` : undefined}>{title}</h2>}
          {body && <p className="ld-lede">{body}</p>}
        </header>
      )}
      {children}
    </section>
  );
}

/** The one Ember action: buy (checkout), apply (the Tally form) or, in the phone apps, continue on web. */
export function Cta({ action, label, surface, block, withPrice = true }: {
  action: LandingAction;
  label: string;
  surface: CtaSurface;
  block?: boolean;
  withPrice?: boolean;
}) {
  const cls = `btn${block ? " btn--block" : ""}`;
  if (action.kind === "native") return <ContinueOnWebCTA webPath={action.webPath} className="ld-native" />;
  if (action.kind === "apply") {
    return (
      <a className={cls} href={action.href} target="_blank" rel="noopener noreferrer">
        {label}<ArrowRight className="ic" />
      </a>
    );
  }
  return (
    <button type="button" className={cls} onClick={() => action.go(surface)}>
      {label}{withPrice && action.price > 0 ? <span className="ld-cta-price">{inr(action.price)}</span> : null}
    </button>
  );
}

/** A short silent loop, playing only while on screen (and never under reduced motion). */
export function Loop({ src, poster, alt, className, once }: { src: string | null; poster?: string | null; alt?: string | null; className?: string; once?: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !src || reduced()) return;
    const io = new IntersectionObserver(([e]) => {
      // once: after the last frame it stays there, scrolling back doesn't replay it
      if (e.isIntersecting) { if (!(once && v.ended)) void v.play().catch(() => {}); }
      else v.pause();
    }, { threshold: 0.35 });
    io.observe(v);
    return () => io.disconnect();
  }, [src, once]);
  if (!src) return poster ? <img className={className} src={media(poster)} alt={alt ?? ""} loading="lazy" decoding="async" /> : null;
  return (
    <video
      ref={ref}
      className={className}
      src={media(src)}
      poster={media(poster)}
      muted
      loop={!once}
      playsInline
      preload="none"
      aria-label={alt ?? undefined}
    />
  );
}

const ytId = (v: Video) => v.kind === "youtube" ? v.id_or_url : null;
const vimeoId = (v: Video) => v.kind === "vimeo" ? v.id_or_url.replace(/\D/g, "") : null;

/** A video from a URL, as the right kind. */
export function asVideo(url: string, title: string | null = null, poster: string | null = null): Video {
  const yt = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: "youtube", id_or_url: yt[1], title, poster };
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: "vimeo", id_or_url: vm[1], title, poster };
  return { kind: "mp4", id_or_url: url, title, poster };
}

/** A poster with a play button; the player loads only when tapped. */
export function Player({ video, caption, className }: { video: Video; caption?: string | null; className?: string }) {
  const [on, setOn] = useState(false);
  const yt = ytId(video);
  const vm = vimeoId(video);
  const poster = media(video.poster) ?? (yt ? `https://i.ytimg.com/vi/${yt}/hqdefault.jpg` : undefined);
  const title = video.title ?? "Video";
  return (
    <figure className={`ld-player${className ? ` ${className}` : ""}`}>
      <div className="ld-player-box">
        {on ? (
          yt ? (
            <iframe src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&rel=0&playsinline=1`} title={title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
          ) : vm ? (
            <iframe src={`https://player.vimeo.com/video/${vm}?autoplay=1&title=0&byline=0&portrait=0`} title={title} allow="autoplay; fullscreen; picture-in-picture" allowFullScreen />
          ) : (
            <video src={media(video.id_or_url)} poster={poster} controls autoPlay playsInline />
          )
        ) : (
          <button type="button" className="ld-player-poster" onClick={() => setOn(true)} aria-label={`Play: ${title}`}>
            {poster && <img src={poster} alt="" loading="lazy" decoding="async" />}
            <span className="ld-play"><Play className="ic" fill="currentColor" /></span>
          </button>
        )}
      </div>
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

export function Faqs({ items }: { items: { question: string; answer: string }[] }) {
  return (
    <div className="ld-faqs">
      {items.map((f) => (
        <details key={f.question} className="ld-faq">
          <summary>{f.question}<span aria-hidden className="ld-faq-x" /></summary>
          <p>{f.answer}</p>
        </details>
      ))}
    </div>
  );
}

export function Stars({ n }: { n: number }) {
  return (
    <span className="ld-stars" aria-label={`${n} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => <Star key={i} className={`ic${i < n ? " on" : ""}`} fill={i < n ? "currentColor" : "none"} />)}
    </span>
  );
}

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
const month = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-IN", { month: "short", year: "numeric" });
};

export function Reviews({ items, first = 6 }: { items: Review[]; first?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, first);
  return (
    <>
      <div className="ld-reviews">
        {shown.map((r, i) => (
          <article key={`${r.name}-${i}`} className="ld-review">
            <Stars n={r.score} />
            <p className="ld-review-t">{r.text}</p>
            <footer>
              <span className="ld-av" aria-hidden>{initials(r.name)}</span>
              <span className="ld-review-who">
                <b>{r.name}</b>
                {r.role && <span>{r.role}</span>}
              </span>
            </footer>
            {(!r.own && r.program) || r.date ? (
              <p className="ld-review-src">{[!r.own ? r.program : null, month(r.date)].filter(Boolean).join(" · ")}</p>
            ) : null}
          </article>
        ))}
      </div>
      {items.length > first && (
        <button type="button" className="btn btn--md btn--secondary ld-more" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer reviews" : `Show ${items.length - first} more reviews`}
        </button>
      )}
    </>
  );
}

export function ForYou({ yes, no }: { yes: string[]; no: string[] }) {
  if (!yes.length && !no.length) return null;
  return (
    <div className="ld-foryou">
      {yes.length > 0 && (
        <div className="ld-panel">
          <h3>For you if</h3>
          <ul>{yes.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
      {no.length > 0 && (
        <div className="ld-panel ld-panel--quiet">
          <h3>Not for you if</h3>
          <ul>{no.map((s) => <li key={s}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

/** The phone bar that rises once the hero's button scrolls away (spec 12.1, sales page). */
export function StickyBar({ watch, children }: { watch: React.RefObject<HTMLElement>; children: ReactNode }) {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const el = watch.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setUp(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, [watch]);
  // Hidden with visibility (in the CSS), so its button leaves the tab order too.
  return <div className={`ld-sticky${up ? " is-up" : ""}`}>{children}</div>;
}
