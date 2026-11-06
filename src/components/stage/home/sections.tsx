import { useRef } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, Compass, Play } from "lucide-react";
import { tapTick } from "@/lib/haptics";
import { media } from "@/components/stage/landing/landing";
import {
  FORMAT_COPY, LANG, formatFacts, inr, runtime,
  type CatalogItem, type FormatSummary, type FreeLesson, type StageCatalog, WORKSHOP_ART } from "./catalog";

/*
 * The discovery sections of the round-4 Home (15_LMS_Experience_Lab/home.html):
 * the free-lesson start, the three formats, the comparison, the shelves and
 * the catalogue link. Markup and class names follow the mockup, so home.css
 * (ported from it) styles them as designed. Home and Explore share these.
 */

const TIER_WORD: Record<string, string> = { live_cohort: "Live cohort", masterclass: "Masterclass", workshop: "Workshop" };
const PlayFill = ({ className = "ic" }: { className?: string }) => <Play className={className} fill="currentColor" strokeWidth={0} />;

export function StartFree({ free }: { free: FreeLesson[] }) {
  const navigate = useNavigate();
  if (!free.length) return null;
  const [lead, ...rest] = free;
  const open = (f: FreeLesson) => { void tapTick(); navigate(`/chapters/${f.chapter.id}`); };
  return (
    <section className="sec" aria-labelledby="startH">
      <div className="sec-head"><h2 className="sec-h" id="startH">Start with a free lesson</h2></div>
      <div className="start">
        <button className="start-art" type="button" onClick={() => open(lead)} aria-label={`Play free lesson: ${lead.chapter.title}`}>
          {lead.offering.thumbnail_url && <img src={lead.offering.thumbnail_url} alt="" />}
          <span className="play play--lg"><PlayFill /></span>
        </button>
        <div className="start-body">
          <span className="eyebrow">Free lesson</span>
          <h3 className="start-t">{lead.chapter.title}</h3>
          <p className="start-s">From {lead.course.title}</p>
          <button className="btn" type="button" onClick={() => open(lead)}><PlayFill />Play free lesson</button>
          <span className="start-note">No payment, no card.</span>
        </div>
      </div>
      {rest.length > 0 && (
        <div className="free-mini">
          {rest.slice(0, 6).map((f) => (
            <button className="fm-mini" type="button" key={f.chapter.id} onClick={() => open(f)}>
              <span className="fm-mini-art">
                {f.offering.thumbnail_url && <img src={f.offering.thumbnail_url} alt="" loading="lazy" />}
                <span className="play"><PlayFill /></span>
              </span>
              <span className="fm-mini-t"><b>{f.offering.instructor_name || f.course.title}</b><span>{f.chapter.title}</span></span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function Formats({ formats, onSeeShelf }: { formats: FormatSummary[]; onSeeShelf: (tier: string) => void }) {
  const fs = formats.filter((f) => f.count);
  return (
    <section className="sec" aria-labelledby="fmH">
      <div className="sec-head"><h2 className="sec-h" id="fmH">Three ways to learn at LevelUp</h2></div>
      <div className="fmts">
        {fs.map((f) => {
          const C = FORMAT_COPY[f.tier];
          const art = f.list.slice(0, 3).map((x) => x.offering.thumbnail_url).filter(Boolean) as string[];
          return (
            <div className="fm" key={f.tier}>
              <span className={`fm-art${art.length < 3 ? " fm-art--one" : ""}`} aria-hidden="true">
                {art.map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
              </span>
              <span className="fm-k">{C.word}</span>
              <h3 className="fm-line">{C.line}</h3>
              <p className="fm-body">{C.body}</p>
              <ul className="fm-facts">{formatFacts(f).map((t) => <li key={t}>{t}</li>)}</ul>
              <button className="btn btn--secondary btn--md fm-cta" type="button" onClick={() => { void tapTick(); onSeeShelf(f.tier); }}>
                See {f.count === 1 ? "the workshop" : `all ${f.count} ${C.plural.toLowerCase()}`}<ArrowRight className="ic" />
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function Compare({ formats }: { formats: FormatSummary[] }) {
  const fs = formats.filter((f) => f.count);
  const m = formats.find((f) => f.tier === "masterclass");
  const l = formats.find((f) => f.tier === "live_cohort");
  const time: Record<string, string> = {
    masterclass: m?.runtime ? `${runtime(m.runtime[0])} to ${runtime(m.runtime[1])} of video` : "At your pace",
    live_cohort: l?.weeks ? (l.weeks[0] === l.weeks[1] ? `${l.weeks[0]} weeks` : `${l.weeks[0]} to ${l.weeks[1]} weeks`) : "Several weeks",
    workshop: "One recorded session",
  };
  const price: Record<string, string> = {
    masterclass: m?.price ? `${inr(m.price[0])} to ${inr(m.price[1])}, once` : "On the class page",
    live_cohort: "On the program page",
    workshop: "On the workshop page",
  };
  const rows: [string, (f: FormatSummary) => string][] = [
    ["Time it takes", (f) => time[f.tier]],
    ["Feedback on your work", (f) => FORMAT_COPY[f.tier].fb],
    ["Price", (f) => price[f.tier]],
    ["Best if", (f) => FORMAT_COPY[f.tier].best],
  ];
  return (
    <section className="sec" aria-labelledby="cmpH">
      <div className="sec-head"><h2 className="sec-h" id="cmpH">Which one is for you?</h2></div>
      <div className="cmp" role="table" aria-labelledby="cmpH">
        <div className="cmp-row cmp-row--head" role="row">
          <span role="columnheader" />
          {fs.map((f) => <span role="columnheader" key={f.tier}>{FORMAT_COPY[f.tier].word}</span>)}
        </div>
        {rows.map(([label, fn]) => (
          <div className="cmp-row" role="row" key={label}>
            <span className="cmp-l" role="rowheader">{label}</span>
            {fs.map((f) => <span className="cmp-v" role="cell" data-fmt={FORMAT_COPY[f.tier].word} key={f.tier}>{fn(f)}</span>)}
          </div>
        ))}
      </div>
    </section>
  );
}

export function ProductCard({ x, showTag }: { x: CatalogItem; showTag?: boolean }) {
  const navigate = useNavigate();
  const o = x.offering, c = x.course, t = o.product_tier;
  const meta: string[] = [];
  if (t === "masterclass") {
    if (x.lessons) meta.push(`${x.lessons} lessons`);
    if (c && Number(c.duration_minutes) > 0) meta.push(runtime(Number(c.duration_minutes)));
    if (c?.language && LANG[c.language]) meta.push(LANG[c.language]);
  } else if (t === "live_cohort") {
    if (c?.duration_text) meta.push(c.duration_text);
  } else if (x.videos) {
    meta.push(`${x.videos} videos, ${x.files} files`);
  }
  const blurb = o.highlight ?? (t !== "live_cohort" ? o.subtitle : null);
  return (
    <button className="pd" type="button" onClick={() => { void tapTick(); navigate(x.href ?? `/p/${o.slug}`); }}>
      <span className="pd-art">
        {(x.page?.card_image_url || o.thumbnail_url || t === "workshop") && <img src={x.page?.card_image_url || o.thumbnail_url || media(WORKSHOP_ART)} alt="" loading="lazy" />}
        {showTag && <span className="tag">{TIER_WORD[t]}</span>}
        {x.owned && <span className="tag tag--yours">Yours</span>}
      </span>
      <span className="pd-body">
        {t === "masterclass" && o.instructor_name && <span className="pd-k">{o.instructor_name}</span>}
        <span className="pd-t">{o.title}</span>
        {t === "live_cohort" && o.subtitle && <span className="pd-s">{o.subtitle}</span>}
        {blurb && <span className="pd-hl">{blurb}</span>}
        <span className="pd-foot">
          <span className="pd-meta">
            {meta.map((m, i) => (
              <span key={m} style={{ display: "contents" }}>{i > 0 && <i />}<span>{m}</span></span>
            ))}
          </span>
          {o.price > 0 && <span className="pd-price">{inr(o.price)}</span>}
        </span>
      </span>
    </button>
  );
}

function Shelf({ f, grid, onSeeAll }: { f: FormatSummary; grid?: boolean; onSeeAll?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const C = FORMAT_COPY[f.tier];
  const scroll = (dir: number) => ref.current?.scrollBy({ left: dir * ref.current.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section className="sec shelf" id={`shelf-${f.tier}`} aria-labelledby={`sh-${f.tier}`}>
      <div className="sec-head">
        <h2 className="sec-h" id={`sh-${f.tier}`}>{C.plural}</h2>
        <span className="sec-tools">
          {!grid && f.list.length > 3 && (
            <span className="rail-nav">
              <button type="button" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft className="ic" /></button>
              <button type="button" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight className="ic" /></button>
            </span>
          )}
          {onSeeAll && <button className="sec-link" type="button" onClick={onSeeAll}>See all</button>}
        </span>
      </div>
      <div ref={ref} className={`pds pds--${f.tier}${grid ? " pds--grid" : ""}`}>
        {f.list.map((x) => <ProductCard key={x.offering.id} x={x} />)}
      </div>
    </section>
  );
}

export function Shelves({ formats, grid, onSeeAll }: { formats: FormatSummary[]; grid?: boolean; onSeeAll?: (tier: string) => void }) {
  return (
    <>
      {formats.filter((f) => f.count).map((f) => (
        <Shelf key={f.tier} f={f} grid={grid} onSeeAll={onSeeAll ? () => onSeeAll(f.tier) : undefined} />
      ))}
    </>
  );
}

export function CatalogCta({ data }: { data: StageCatalog }) {
  const navigate = useNavigate();
  return (
    <section className="cat-cta">
      <p>{data.catalog.length} programs across masterclasses, live cohorts and workshops.</p>
      <button className="btn btn--secondary" type="button" onClick={() => { void tapTick(); navigate("/explore"); }}>
        <Compass className="ic" />See the full catalogue
      </button>
    </section>
  );
}

/** Skeleton while the catalogue loads: the shapes of the sections, no spinner. */
export function SectionsSkeleton() {
  return (
    <div className="hm-skel" role="status" aria-busy="true">
      <span className="sr">Loading</span>
      <div className="skeleton-shimmer" style={{ height: 28, width: "55%", borderRadius: 10 }} />
      <div className="skeleton-shimmer" style={{ aspectRatio: "16 / 9", borderRadius: 20 }} />
      <div className="skeleton-shimmer" style={{ height: 180, borderRadius: 22 }} />
      <div className="skeleton-shimmer" style={{ height: 180, borderRadius: 22 }} />
    </div>
  );
}

/** A read failed: say what did not load and offer Retry (never an empty state). */
export function SectionsError({ onRetry, message = "We couldn't load the catalogue. Check your connection and try again." }: { onRetry: () => void; message?: string }) {
  return (
    <div className="cat-cta" role="alert">
      <p>{message}</p>
      <button className="btn btn--secondary" type="button" onClick={onRetry}>Retry</button>
    </div>
  );
}

/** What My learning, Home and the sidebar say when the read of what someone owns fails. */
export const LEARNING_LOAD_ERROR = "We couldn't load your learning. Check your connection and try again.";
