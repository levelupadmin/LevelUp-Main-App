import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ArrowUpRight, Check } from "lucide-react";
import { Cta, Faqs, Loop, Player, Section, StickyBar } from "./parts";
import { media, priceFree, type CohortLanding as Data, type CommunityTile, type LandingAction, type Story } from "./landing";

/**
 * A live cohort's sales page (/p/:slug under Stage), v2. Every cohort has the
 * same sections in the same order (founder, 2026-11-02), carrying only what
 * someone needs to decide:
 *   hero · facts · trailer · what you'll make · how it works · what you'll
 *   learn · mentors · proof · who it's for · how to get in · the fee · FAQ ·
 *   the closing call
 * The one action is "Request invite" (the cohort's Tally form); "See the full
 * program" opens its page on leveluplearning.live for everything else.
 * Logos are never a box each (founder, second review): brands are one line
 * that sums them up and one strip that flows; tools are their app icons.
 */
export default function CohortLanding({ d, action, after }: { d: Data; action: LandingAction; after?: ReactNode }) {
  const native = action.kind === "native";
  const ok = priceFree(native);
  const heroCta = useRef<HTMLDivElement | null>(null);
  const [openModule, setOpenModule] = useState<number | null>(null);
  const label = "Request invite";
  const facts = d.facts.filter((f) => ok(f.value));

  return (
    <div className="stage-ui ld ld--cohort">
      {/* 1 · hero */}
      <section className="ld-hero ld-hero--cohort" aria-labelledby="ld-h1">
        {d.hero.mosaic && d.hero.mosaic.length > 0 ? (
          <div className="ld-hero-media ld-mosaic">
            {d.hero.mosaic.slice(0, 6).map((m) => <img key={m} src={media(m)} alt="" fetchPriority="high" />)}
          </div>
        ) : (
          <div className={`ld-hero-media${d.hero.wide ? " ld-hero-media--wide" : ""}`}>
            {d.hero.image && <img src={media(d.hero.image)} alt="" fetchPriority="high" style={d.hero.position ? { objectPosition: d.hero.position } : undefined} />}
            {(d.hero.video || d.hero.video_m) && <CohortLoop d={d} />}
          </div>
        )}
        <div className="ld-hero-body">
          <span className="ld-pill">{d.hero.eyebrow}</span>
          <h1 className="ld-h1" id="ld-h1">{d.hero.headline}</h1>
          <div className="ld-hero-lines"><p>{d.hero.sub}</p></div>
          <div className="ld-hero-cta" ref={heroCta}>
            <Cta action={action} label={label} surface="hero" />
            {d.trailer && <a className="btn btn--secondary" href="#ld-trailer">Watch the trailer</a>}
          </div>
        </div>
      </section>

      {/* 2 · facts */}
      {facts.length > 0 && (
        <dl className="ld-facts">
          {facts.map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      )}

      {/* 3 · trailer */}
      {d.trailer && (
        <Section id="ld-trailer" eyebrow="Watch first" title={d.trailer.title ?? `Inside ${d.name}`}>
          <Player video={d.trailer} />
        </Section>
      )}

      {/* 4 · what you'll make */}
      <Section id="ld-make" eyebrow="What you'll make" title={d.make.title} body={d.make.body}>
        <div className="ld-cards">
          {d.make.items.map((o) => (
            <article key={o.title} className="ld-card">
              {o.image && (/\.(mp4|webm)$/i.test(o.image)
                ? <Loop className="ld-card-media" src={o.image} />
                : <img className="ld-card-media" src={media(o.image)} alt="" loading="lazy" decoding="async" />)}
              <h3>{o.title}</h3>
              <p>{o.body}</p>
            </article>
          ))}
        </div>
      </Section>

      {/* 5 · how it works */}
      <Section id="ld-how" eyebrow="How it works" title={d.how.title}>
        <ol className="ld-cards ld-cards--steps">
          {d.how.items.map((f, n) => (
            <li key={f.title} className="ld-card">
              <span className="eyebrow">{String(n + 1).padStart(2, "0")}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      {/* 6 · what you'll learn */}
      <Section id="ld-learn" eyebrow="What you'll learn" title={d.learn.title} body={d.learn.body}>
        <div className="ld-modules">
          {d.learn.modules.map((m, n) => (
            <div key={m.title} className={`ld-module${openModule === n ? " is-open" : ""}`}>
              <button type="button" aria-expanded={openModule === n} onClick={() => setOpenModule(openModule === n ? null : n)}>
                <span className="ld-module-l">{m.label ?? `Module ${n + 1}`}</span>
                <span className="ld-module-t">{m.title}</span>
                <span aria-hidden className="ld-faq-x" />
              </button>
              {openModule === n && <p className="ld-module-line">{m.line}</p>}
            </div>
          ))}
        </div>
        {d.learn.tools && d.learn.tools.items.length > 0 && (
          <div className="ld-flow">
            <h3 className="ld-sub-h">{d.learn.tools.title}</h3>
            {d.learn.tools.body && <p className="ld-flow-sum">{d.learn.tools.body}</p>}
            <ul className="ld-tools">
              {d.learn.tools.items.map((t) => (
                <li key={t.name}><img src={media(t.icon)} alt="" loading="lazy" decoding="async" /><span>{t.name}</span></li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* 7 · mentors */}
      <Section id="ld-mentors" eyebrow="Your mentors" title={d.mentors.title} body={d.mentors.body}>
        {d.mentors.items.length > 0 && (
          <div className="ld-mentors">
            {d.mentors.items.map((m) => (
              <article key={m.name} className="ld-mentor">
                {m.photo && <img src={media(m.photo)} alt={m.name} loading="lazy" decoding="async" />}
                <h3>{m.name}</h3>
                {m.role && <span className="ld-mentor-r">{m.role}</span>}
                {m.line && <p>{m.line}</p>}
              </article>
            ))}
          </div>
        )}
        {d.mentors.work && d.mentors.work.length > 0 && (
          <div className="ld-gallery is-many ld-work">
            {d.mentors.work.map((m) => <img key={m} className="ld-gallery-m" src={media(m)} alt="" loading="lazy" decoding="async" />)}
          </div>
        )}
      </Section>

      {/* 8 · proof: the community the way the program's website shows it, then its people */}
      <Section id="ld-proof" eyebrow="The community" title={d.proof.community?.title ?? d.proof.title} body={d.proof.community?.body}>
        {d.proof.community?.film && <Player video={d.proof.community.film} caption={d.proof.community.film.title} />}
        <dl className="ld-stats">
          {d.proof.stats.map((s) => <div key={s.label}><dd>{s.value}</dd><dt>{s.label}</dt></div>)}
        </dl>
        {d.proof.community && d.proof.community.tiles.length > 0 && <Tiles tiles={d.proof.community.tiles} />}
        {!d.proof.community && d.proof.photos && d.proof.photos.length > 0 && (
          <div className={`ld-gallery${d.proof.photos.length > 4 ? " is-many" : ""}`}>
            {d.proof.photos.map((m) => <img key={m} className="ld-gallery-m ld-photo" src={media(m)} alt="" loading="lazy" decoding="async" />)}
          </div>
        )}
        {d.proof.stories && d.proof.stories.items.length > 0 && (
          <div className="ld-flow">
            <h3 className="ld-sub-h">{d.proof.stories.title}</h3>
            {d.proof.stories.body && <p className="ld-flow-sum">{d.proof.stories.body}</p>}
            <div className="ld-wins">{d.proof.stories.items.map((st) => <Win key={st.name} s={st} />)}</div>
          </div>
        )}
        {d.proof.creators && d.proof.creators.length > 0 && (
          <div className="ld-creators">
            {d.proof.creators.map((c) => (
              <div key={c.name} className="ld-creator">
                {c.photo && <img src={media(c.photo)} alt="" loading="lazy" decoding="async" />}
                <b>{c.name}</b>
                {(c.handle || c.followers) && <span>{[c.handle, c.followers].filter(Boolean).join(" · ")}</span>}
              </div>
            ))}
          </div>
        )}
        {d.proof.quotes && d.proof.quotes.length > 0 && (
          <div className="ld-reviews">
            {d.proof.quotes.map((q) => (
              <article key={q.name} className="ld-review">
                <p className="ld-review-t">{q.text}</p>
                <footer><span className="ld-review-who"><b>{q.name}</b>{q.role && <span>{q.role}</span>}</span></footer>
              </article>
            ))}
          </div>
        )}
        {d.proof.logos && d.proof.logos.items.length > 0 && (
          <div className="ld-flow">
            <h3 className="ld-sub-h">{d.proof.logos.title}</h3>
            {d.proof.logos.summary && <p className="ld-flow-sum">{d.proof.logos.summary}</p>}
            <LogoStrip items={d.proof.logos.items} />
          </div>
        )}
      </Section>

      {/* 9 · who it's for */}
      {d.fit && d.fit.yes.length > 0 && (
        <Section id="ld-fit" eyebrow="Who it's for" title="Is this you?">
          <ul className="ld-cards ld-fit">{d.fit.yes.map((t) => <li key={t.title} className="ld-card"><b>{t.title}</b><span>{t.body}</span></li>)}</ul>
          {d.fit.no && (
            <div className="ld-panel ld-panel--quiet ld-notfor">
              <h3>Not for you if</h3>
              <p>{d.fit.no}</p>
            </div>
          )}
        </Section>
      )}

      {/* 10 · how to get in */}
      <Section id="ld-admission" eyebrow="How to get in" title={d.admission.title}>
        <ol className="ld-steps">
          {d.admission.steps.filter((s) => ok(s.title) && ok(s.body)).map((s, n) => (
            <li key={s.title}><span className="ld-step-n">{n + 1}</span><b>{s.title}</b>{s.body && <span>{s.body}</span>}</li>
          ))}
        </ol>
      </Section>

      {/* 11 · the fee (never in the phone apps: store rules) */}
      {!native && (
        <Section id="ld-fee" eyebrow="The fee">
          <div className="ld-get">
            <div className="ld-panel ld-price ld-fee">
              <span className="eyebrow">Program fee</span>
              <p className="ld-price-n">{d.fee.price}</p>
              {d.fee.note && <p className="ld-fee-l">{d.fee.note}</p>}
              <Cta action={action} label={label} surface="price_card" block />
              {d.fee.extras?.map((t) => <p key={t} className="ld-fine">{t}</p>)}
            </div>
            <div className="ld-panel">
              <h3>Included</h3>
              <ul className="ld-ticks">{d.fee.includes.map((t) => <li key={t}><Check className="ic" /><span>{t}</span></li>)}</ul>
            </div>
          </div>
        </Section>
      )}

      {/* 12 · FAQ */}
      {d.faqs.length > 0 && (
        <Section id="ld-faq" eyebrow="FAQ" title="Questions people ask">
          <Faqs items={d.faqs.filter((f) => ok(f.question) && ok(f.answer))} />
        </Section>
      )}

      {/* 13 · the closing call: apply, or read everything on the program's own page */}
      <section className="ld-closing" aria-label={label}>
        <h2 className="ld-h2">{d.closing.title}</h2>
        {d.closing.body && <p className="ld-lede">{d.closing.body}</p>}
        <div className="ld-closing-cta">
          <Cta action={action} label={label} surface="closing" />
          <a className="ld-full" href={d.full_page_url} target="_blank" rel="noopener noreferrer">
            See the full program<ArrowUpRight className="ic" />
          </a>
        </div>
      </section>

      {after}

      {action.kind === "apply" && (
        <StickyBar watch={heroCta}>
          <span className="ld-sticky-t"><b>Applications open</b><span>{d.facts.find((f) => /duration/i.test(f.label))?.value ?? d.name}</span></span>
          <Cta action={action} label={label} surface="sticky" />
        </StickyBar>
      )}
    </div>
  );
}

function CohortLoop({ d }: { d: Data }) {
  const [wide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches);
  const src = wide ? d.hero.video ?? d.hero.video_m ?? null : d.hero.video_m ?? d.hero.video ?? null;
  return <Loop className="ld-hero-video" src={src} poster={d.hero.image} once={d.hero.once} />;
}

/** Brand logos as one strip that drifts sideways (transform only); still, and scrollable, for reduced motion. */
function LogoStrip({ items }: { items: string[] }) {
  return (
    <div className="ld-marquee">
      <div className="ld-marquee-track" style={{ "--n": items.length } as CSSProperties}>
        {items.map((m) => <img key={m} src={media(m)} alt="" loading="lazy" decoding="async" />)}
        {items.map((m) => <img key={`${m}-2`} className="ld-marquee-dup" src={media(m)} alt="" aria-hidden loading="lazy" decoding="async" />)}
      </div>
    </div>
  );
}

/** The community's photos with their captions, as the program's website lays them out: wide ones first, then the small ones in pairs. */
function Tiles({ tiles }: { tiles: CommunityTile[] }) {
  const wide = tiles.filter((t) => t.wide).length;
  const shape = tiles.length === 1 ? " ld-net--solo" : wide === 1 ? " ld-net--lead" : "";
  return (
    <ul className={`ld-net${shape}`}>
      {tiles.map((t) => (
        <li key={t.title} className={`ld-net-t${t.wide ? " is-wide" : ""}`}>
          <img src={media(t.image)} alt="" loading="lazy" decoding="async" />
          <span className="ld-net-c"><b>{t.title}</b>{t.body && <span>{t.body}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

/** One person's before and after, the structure creators.forgebylevelup.com uses. */
function Win({ s }: { s: Story }) {
  const initials = s.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("");
  return (
    <article className="ld-win">
      <header className="ld-win-top">
        {s.photo ? <img src={media(s.photo)} alt="" loading="lazy" decoding="async" /> : <span className="ld-win-av" aria-hidden>{initials}</span>}
        <span className="ld-win-who"><b>{s.name}</b><span>{[s.handle, s.role].filter(Boolean).join(" · ")}</span></span>
      </header>
      <dl className="ld-win-stats">
        {s.stats.slice(0, 2).map((x) => <div key={x.label}><dd>{x.value}</dd><dt>{x.label}</dt></div>)}
      </dl>
      <div className="ld-win-ba">
        <p><b>Before</b>{s.before}</p>
        <p><b>After</b>{s.after}</p>
      </div>
      {s.how && <p className="ld-win-how"><b>How the Forge helped</b>{s.how}</p>}
      {s.quote && <blockquote className="ld-win-q">{s.quote}</blockquote>}
    </article>
  );
}
