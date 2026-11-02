import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Check } from "lucide-react";
import { Cta, Faqs, ForYou, Loop, Player, Reviews, Section, StickyBar } from "./parts";
import { callName, clock, inr, media, priceFree, runtime, type LandingAction, type MasterclassLanding as Data } from "./landing";

/**
 * A masterclass sales page as a landing page (/p/:slug under Stage), built
 * from the copy and media of its leveluplearning.in page: the hero loop, the
 * trailer, the films, three ideas from the lessons, every lesson, what you'll
 * be able to do, quotes, what you get, reviews, who it's for, the refund
 * rule and the FAQ. One Ember action throughout: buy (or, in the phone apps,
 * continue on web, with every price left out).
 */
export default function MasterclassLanding({ d, action, after }: { d: Data; action: LandingAction; after?: ReactNode }) {
  const native = action.kind === "native";
  const ok = priceFree(native);
  const heroCta = useRef<HTMLDivElement | null>(null);
  const [allLessons, setAllLessons] = useState(false);
  const price = action.kind === "buy" ? action.price : d.facts.price;
  const lessonItems = d.lessons?.items ?? [];
  const lessons = allLessons ? lessonItems : lessonItems.slice(0, 6);

  const facts = [
    { label: "Lessons", value: String(d.facts.lessons) },
    { label: "Runtime", value: runtime(d.facts.minutes) },
    { label: "Language", value: d.facts.language },
    ...(native ? [] : [{ label: "Price", value: `${inr(price)} once` }]),
    ...(native || !d.refund ? [] : [{ label: "Refund", value: `Within ${d.refund.days} days` }]),
  ];

  return (
    <div className="stage-ui ld ld--mc">
      {/* Hero: the mentor's own loop, the claim, one action */}
      <section className="ld-hero" aria-labelledby="ld-h1">
        <div className="ld-hero-media ld-hero-media--fit" style={heroShape(d)}>
          <picture>
            {d.hero.image.m && <source media="(max-width: 899px)" srcSet={media(d.hero.image.m)} />}
            <img src={media(d.hero.image.d)} alt={d.hero.alt} style={d.hero.position ? { objectPosition: d.hero.position } : undefined} fetchPriority="high" />
          </picture>
          {(d.hero.video.d || d.hero.video.m) && <HeroLoop d={d} />}
        </div>
        <div className="ld-hero-body">
          {d.hero.kicker && <span className="ld-pill">{d.hero.kicker}</span>}
          {d.hero.eyebrow && <span className="eyebrow ld-hero-eyebrow">{d.hero.eyebrow}</span>}
          <h1 className="ld-h1" id="ld-h1">
            {d.hero.headline}
            {d.hero.headline2 && <span className="ld-h1-2">{d.hero.headline2}</span>}
          </h1>
          {d.hero.lines.length > 0 && (
            <div className="ld-hero-lines">{d.hero.lines.filter(ok).map((l) => <p key={l}>{l}</p>)}</div>
          )}
          <div className="ld-hero-cta" ref={heroCta}>
            <Cta action={action} label={d.cta.hero} surface="hero" />
            {!native && d.refund && <p className="ld-fine">{d.refund.short} <a href="/refund-policy">Refund policy</a></p>}
          </div>
          {d.hero.proof && <p className="ld-proof">{d.hero.proof}</p>}
        </div>
      </section>

      <dl className="ld-facts">
        {facts.map((f) => (
          <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>
        ))}
      </dl>

      {d.trailer && (
        <Section id="ld-trailer" eyebrow="Watch first" title={`See ${callName(d.name)} before you buy`}>
          <Player video={{ kind: "youtube", id_or_url: d.trailer.youtube, title: d.trailer.title, poster: d.trailer.poster ?? null }} caption={d.trailer.caption} />
        </Section>
      )}

      {d.films && d.films.items.length > 0 && (
        <Section id="ld-films" eyebrow="The work" title={d.films.heading} body={d.films.body}>
          {d.films.items.some((f) => !f.image) ? (
            // No posters: the website's own layout, its reel beside the list (never empty boxes).
            <div className="ld-reel">
              {d.films.reel && <Loop className="ld-reel-v" src={d.films.reel.video} poster={d.films.reel.poster ?? null} />}
              <ol className="ld-taught">
                {d.films.items.map((f) => (
                  <li key={f.title}><b>{f.title}</b>{f.note && <span>{f.note}</span>}</li>
                ))}
              </ol>
            </div>
          ) : (
          <div className="ld-rail ld-films">
            {d.films.items.map((f) => (
              <figure key={f.title} className={`ld-film${f.wide ? " is-wide" : ""}`}>
                <div className="ld-film-art">
                  <img src={media(f.image)} alt={f.alt ?? f.title} loading="lazy" decoding="async" />
                  {f.isNew && <span className="ld-tag">New</span>}
                </div>
                <figcaption>
                  <b>{f.title}</b>{f.year ? <span> ({f.year})</span> : null}
                  {f.note && <em>{f.note}</em>}
                </figcaption>
              </figure>
            ))}
          </div>
          )}
        </Section>
      )}

      {d.ideas && d.ideas.items.length > 0 && (
        <Section id="ld-ideas" eyebrow="From the lessons" title={d.ideas.heading ?? `What ${callName(d.name)} shows you`} body={d.ideas.body}>
          <div className="ld-rail ld-ideas">
            {d.ideas.items.map((it, i) => (
              <article key={it.title} className="ld-idea">
                <Loop className="ld-idea-media" src={it.video} poster={it.image} alt={it.alt} />
                <div className="ld-idea-b">
                  <span className="ld-idea-n">{String(i + 1).padStart(2, "0")} · {it.title}</span>
                  <p>{it.body}</p>
                  {it.lesson && <span className="ld-note">{it.lesson}</span>}
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}

      <Section id="ld-lessons" eyebrow="The lessons" title={`${d.facts.lessons} lessons, ${runtime(d.facts.minutes)}`} body={d.lessons?.body}>
        <div className="cd-lessons ld-lessons">
          {lessons.map((l) => (
            <div key={l.n} className="cd-lesson ld-lesson">
              <span className="cd-n">{String(l.n).padStart(2, "0")}</span>
              <span className="cd-lb">
                <span className="cd-lt">{l.title}</span>
                {l.line && <span className="cd-lm">{l.line}</span>}
              </span>
              <span className="cd-li ld-dur">{l.seconds ? clock(l.seconds) : ""}</span>
            </div>
          ))}
        </div>
        {lessonItems.length > 6 && (
          <button type="button" className="btn btn--md btn--secondary ld-more" onClick={() => setAllLessons((v) => !v)}>
            {allLessons ? "Show fewer lessons" : `Show all ${lessonItems.length} lessons`}
          </button>
        )}
      </Section>

      {d.skills.length > 0 && (
        <Section id="ld-skills" eyebrow="What you learn" title="What you'll know how to do">
          <ul className="ld-skills">
            {d.skills.map((s) => (
              <li key={s.skill}><span>{s.skill}</span>{s.lesson && <em>{s.lesson}</em>}</li>
            ))}
          </ul>
        </Section>
      )}

      {d.on_set && (
        <figure className="ld-wide-photo">
          <img src={media(d.on_set.image)} alt={d.on_set.alt} loading="lazy" decoding="async" />
        </figure>
      )}

      {d.quotes && d.quotes.items.length > 0 && (
        <Section id="ld-quotes" eyebrow="From the lessons" title={`In ${callName(d.name)}'s words`} body={d.quotes.body}>
          <div className="ld-rail ld-quotes">
            {d.quotes.items.map((q) => (
              <blockquote key={q.text} className="ld-quote">
                <p>{q.text}</p>
                {q.lesson && <cite>{q.lesson}</cite>}
              </blockquote>
            ))}
          </div>
        </Section>
      )}

      <Section id="ld-get" eyebrow="What you get" title={native ? `${d.facts.lessons} lessons. ${runtime(d.facts.minutes)}.` : `${d.facts.lessons} lessons. ${runtime(d.facts.minutes)}. ${inr(price)}.`}>
        <div className="ld-get">
          <div className="ld-panel">
            <h3>Included</h3>
            <ul className="ld-ticks">
              {d.included.filter((i) => ok(i.title) && ok(i.detail)).map((i) => (
                <li key={i.title}><Check className="ic" /><span><b>{i.title}</b>{i.detail && <span>{i.detail}</span>}</span></li>
              ))}
            </ul>
            {d.bonuses && d.bonuses.items.length > 0 && (
              <>
                <h3 className="ld-bonus-h">{ok(d.bonuses.heading) ? d.bonuses.heading : "Bonuses, for every buyer"}</h3>
                <ul className="ld-ticks">
                  {d.bonuses.items.map((i) => (
                    <li key={i.title}><Check className="ic" /><span><b>{i.title}</b>{i.detail && <span>{i.detail}</span>}</span></li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <div className="ld-panel ld-price">
            {!native && (
              <>
                <span className="eyebrow">One payment</span>
                <p className="ld-price-n">{inr(price)}</p>
                <p className="ld-fine">GST included. Yours for life, no subscription.</p>
              </>
            )}
            <Cta action={action} label={d.cta.card} surface="price_card" block withPrice={false} />
            {!native && d.refund && <p className="ld-fine">{d.refund.sentence}</p>}
            {!native && <p className="ld-fine">Pay by UPI or card, through Razorpay.</p>}
          </div>
        </div>
      </Section>

      {d.reviews && d.reviews.items.length > 0 && (
        <Section id="ld-reviews" eyebrow="Reviews" title="What buyers wrote" body={d.reviews.body}>
          <Reviews items={d.reviews.items} />
        </Section>
      )}

      {(d.for_you.length > 0 || d.not_for_you.length > 0) && (
        <Section id="ld-fit" eyebrow="Before you buy" title="Is this for you?">
          <ForYou yes={d.for_you} no={d.not_for_you} />
        </Section>
      )}

      {!native && d.value.length > 0 && (
        <Section id="ld-value" eyebrow="Value" title="Value against price">
          <dl className="ld-rows">
            <div><dt>You pay</dt><dd>{inr(price)} once</dd></div>
            <div><dt>Video lessons</dt><dd>{d.facts.lessons}</dd></div>
            <div><dt>Total running time</dt><dd>{runtime(d.facts.minutes)}</dd></div>
            {d.value.map((v) => <div key={v.label}><dt>{v.label}</dt><dd>{v.value}{v.note && <em>{v.note}</em>}</dd></div>)}
          </dl>
        </Section>
      )}

      {d.certificate && (
        <Section id="ld-cert" eyebrow="Certificate" title={`Signed by ${d.name}`} body="Finish the lessons and get a Certificate of Completion. Download it as a PDF, print it or share it.">
          <img className="ld-cert" src={media(d.certificate.image)} alt={d.certificate.alt} loading="lazy" decoding="async" />
        </Section>
      )}

      {!native && d.refund && (
        <Section id="ld-try" eyebrow="No risk" title={`Try it for ${d.refund.days} days`}>
          <ol className="ld-steps">
            {d.refund.steps.map((s, i) => (
              <li key={s.title}><span className="ld-step-n">{i + 1}</span><b>{s.title}</b><span>{s.body}</span></li>
            ))}
          </ol>
        </Section>
      )}

      {d.faqs.length > 0 && (
        <Section id="ld-faq" eyebrow="FAQ" title="Questions buyers ask">
          <Faqs items={d.faqs.filter((f) => ok(f.question) && ok(f.answer))} />
        </Section>
      )}

      <section className="ld-closing" aria-label="Get the masterclass">
        <h2 className="ld-h2">{d.closing ?? `Learn from ${d.name}.`}</h2>
        <Cta action={action} label={d.cta.hero} surface="closing" />
      </section>

      {after}

      {action.kind === "buy" && (
        <StickyBar watch={heroCta}>
          <span className="ld-sticky-t"><b>{inr(price)}</b><span>{d.facts.lessons} lessons</span></span>
          <Cta action={action} label={d.cta.card} surface="sticky" withPrice={false} />
        </StickyBar>
      )}
    </div>
  );
}

/**
 * The hero frame takes the photo's own shape (founder, 2026-11-02: a portrait
 * squeezed into a wide box cut G Venket Ram's face): --ar-m on phones and
 * tablets, --ar-d on laptops, kept between portrait 4:5 and wide 3:2.
 */
function heroShape(d: Data): CSSProperties | undefined {
  const s = d.hero.size;
  if (!s) return undefined;
  const clamp = (r: number) => Math.min(1.5, Math.max(0.8, r));
  const m = s.m ?? s.d;
  return { "--ar-d": clamp(s.d[0] / s.d[1]), "--ar-m": clamp(m[0] / m[1]) } as CSSProperties;
}

/** The hero loop, phone or desktop cut, playing only on screen. */
function HeroLoop({ d }: { d: Data }) {
  const [wide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches);
  const src = wide ? d.hero.video.d ?? d.hero.video.m : d.hero.video.m ?? d.hero.video.d;
  const poster = wide ? d.hero.image.d : d.hero.image.m ?? d.hero.image.d;
  return <Loop className="ld-hero-video" src={src} poster={poster} />;
}
