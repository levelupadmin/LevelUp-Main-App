import { useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { asVideo, Cta, Faqs, Loop, Player, Section, StickyBar } from "./parts";
import { media, priceFree, type CohortLanding as Data, type LandingAction } from "./landing";

/**
 * A live cohort's sales page as a landing page (/p/:slug under Stage), built
 * from its leveluplearning.live page and in that page's own section order:
 * the hero loop, the trailer, what you make, the curriculum, how it works,
 * the mentors, students' own stories, who it's for, how to get in, the fee
 * and the FAQ. The one action is "Request invite": the program's Tally form.
 */

const isChip = (s: string) => s.length <= 34 && !s.includes("\n");

/** "Title\nrest" as a bold first line and the rest. */
function Split({ text }: { text: string }) {
  const [head, ...rest] = text.split("\n");
  return rest.length ? <><b>{head}</b><span>{rest.join(" ")}</span></> : <span>{head}</span>;
}

export default function CohortLanding({ d, action, after }: { d: Data; action: LandingAction; after?: ReactNode }) {
  const native = action.kind === "native";
  const ok = priceFree(native);
  const heroCta = useRef<HTMLDivElement | null>(null);
  const [openModule, setOpenModule] = useState<number | null>(0);
  const label = d.cta.label.replace(/\s*[→>]+\s*$/, "");
  const lede = d.hero.lines.filter((l) => !isChip(l));
  const chips = d.hero.lines.filter(isChip);
  /** The page's own eyebrow / title / intro for a section, else the defaults. */
  const T = (key: string, eyebrow: string | null, title: string | null = null) => {
    const t = d.titles?.[key];
    const head = t?.title ?? title;
    return { eyebrow: t?.eyebrow ?? eyebrow, title: head ? <Lines text={head} /> : undefined, body: t?.body ?? null };
  };
  const playable = (url: string | null) => !!url && (d.vimeo_embeds !== false || !/vimeo\.com/.test(url));

  let other = 0;
  const block = (key: string, i: number): ReactNode => {
    switch (key) {
      case "trailer":
        return d.trailer && (
          <Section key={`${key}${i}`} id="ld-trailer" {...T("trailer", "Watch first", d.trailer.title ?? "The showcase")}>
            <Player video={d.trailer} />
          </Section>
        );
      case "facts":
        return d.facts.length > 0 && (
          <dl key={`${key}${i}`} className="ld-facts">
            {d.facts.filter((f) => ok(f.value)).map((f) => <div key={f.label}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
          </dl>
        );
      case "intro":
        return d.intro && (
          <Section key={`${key}${i}`} id="ld-intro" {...T("intro", null, d.intro.heading)} body={null}>
            <div className="ld-prose">{d.intro.body.map((p) => <p key={p}>{p}</p>)}</div>
          </Section>
        );
      case "outcomes":
        return d.outcomes.length > 0 && (
          <Section key={`${key}${i}`} id="ld-outcomes" {...T("outcomes", "What you walk out with")}>
            <div className="ld-cards">
              {d.outcomes.map((o, n) => (
                <article key={o.title} className={`ld-card${n === 0 ? " ld-card--lead" : ""}`}>
                  {o.image && (/\.(mp4|webm)$/i.test(o.image)
                    ? <Loop className="ld-card-media" src={o.image} />
                    : <img className="ld-card-media" src={media(o.image)} alt="" loading="lazy" decoding="async" />)}
                  {o.kicker && <span className="eyebrow">{o.kicker}</span>}
                  <h3><Lines text={o.title} /></h3>
                  {o.body && <p>{o.body}</p>}
                </article>
              ))}
            </div>
          </Section>
        );
      case "curriculum":
        return d.curriculum && d.curriculum.modules.length > 0 && (
          <Section key={`${key}${i}`} id="ld-curriculum" {...T("curriculum", "Curriculum", d.curriculum.heading ?? "What you learn")} body={d.curriculum.body}>
            <div className="ld-modules">
              {d.curriculum.modules.map((m, n) => (
                <div key={m.title} className={`ld-module${openModule === n ? " is-open" : ""}`}>
                  <button type="button" aria-expanded={openModule === n} onClick={() => setOpenModule(openModule === n ? null : n)}>
                    {m.label && <span className="ld-module-l">{m.label}</span>}
                    <span className="ld-module-t">{m.title}</span>
                    <span aria-hidden className="ld-faq-x" />
                  </button>
                  {openModule === n && (
                    <ul>{m.points.map((pt, k) => <li key={k} className={/^(week|assignment)/i.test(pt) ? "is-head" : undefined}>{pt}</li>)}</ul>
                  )}
                </div>
              ))}
            </div>
          </Section>
        );
      case "format":
        return d.format.length > 0 && (
          <Section key={`${key}${i}`} id="ld-format" {...T("format", "How it works")}>
            <ol className="ld-cards ld-cards--steps">
              {d.format.map((f, n) => (
                <li key={f.title} className="ld-card">
                  <span className="eyebrow">{f.kicker ?? String(n + 1).padStart(2, "0")}</span>
                  <h3>{f.title}</h3>
                  {f.body && <p>{f.body}</p>}
                </li>
              ))}
            </ol>
          </Section>
        );
      case "mentors":
        return d.mentors.length > 0 && (
          <Section key={`${key}${i}`} id="ld-mentors" {...T("mentors", "Your mentors", `${d.mentors.length} mentors who work in the industry`)}>
            <div className="ld-mentors">
              {d.mentors.map((m) => (
                <article key={m.name} className="ld-mentor">
                  {m.photo && <img src={media(m.photo)} alt={m.name} loading="lazy" decoding="async" />}
                  <h3>{m.name}</h3>
                  {m.role && <span className="ld-mentor-r">{m.role}</span>}
                  {m.credits && <p>{m.credits}</p>}
                </article>
              ))}
            </div>
          </Section>
        );
      case "student_work":
        return d.student_work.some((w) => w.kind === "image" || playable(w.url)) && (
          <Section key={`${key}${i}`} id="ld-work" {...T("student_work", "Student work", "Made in the cohort")}>
            <div className="ld-rail ld-stories">
              {d.student_work.filter((w) => w.kind === "image" || playable(w.url)).map((w, n) => w.kind === "video"
                ? <Player key={n} video={asVideo(w.url, w.title, w.poster)} caption={[w.title, w.by].filter(Boolean).join(" · ") || null} />
                : <figure key={n} className="ld-film"><div className="ld-film-art"><img src={media(w.url)} alt={w.title ?? ""} loading="lazy" decoding="async" /></div>{w.title && <figcaption><b>{w.title}</b>{w.by && <em>{w.by}</em>}</figcaption>}</figure>)}
            </div>
          </Section>
        );
      case "testimonials": {
        const vids = d.testimonials.filter((t) => playable(t.video));
        const quotes = d.testimonials.filter((t) => !t.video && t.quote);
        return (vids.length > 0 || quotes.length > 0) && (
          <Section key={`${key}${i}`} id="ld-stories" {...T("testimonials", "Student stories", "In their words")}>
            {vids.length > 0 && (
              <div className="ld-rail ld-stories">
                {vids.map((t) => <Player key={t.video} className="ld-story" video={asVideo(t.video as string, t.name ? `${t.name}'s story` : "Student story", t.photo)} caption={[t.name, t.role].filter(Boolean).join(" · ") || null} />)}
              </div>
            )}
            {quotes.length > 0 && (
              <div className="ld-reviews">
                {quotes.map((t) => (
                  <article key={t.quote} className="ld-review">
                    <p className="ld-review-t">{t.quote}</p>
                    <footer><span className="ld-review-who"><b>{t.name}</b>{t.role && <span>{t.role}</span>}</span></footer>
                  </article>
                ))}
              </div>
            )}
          </Section>
        );
      }
      case "stats":
        return d.stats.length > 0 && (
          <dl key={`${key}${i}`} className="ld-stats">
            {d.stats.map((s) => <div key={s.label}><dd>{s.value}</dd><dt>{s.label}</dt></div>)}
          </dl>
        );
      case "for_you":
        return d.for_you.length > 0 && (
          <Section key={`${key}${i}`} id="ld-fit" {...T("for_you", "Who it's for", "Is this you?")}>
            <ul className="ld-cards ld-fit">{d.for_you.map((t) => <li key={t} className="ld-card"><Split text={t} /></li>)}</ul>
          </Section>
        );
      case "not_for_you":
        return d.not_for_you.length > 0 && (
          <div key={`${key}${i}`} className="ld-panel ld-panel--quiet ld-notfor">
            <h3>Not for you if</h3>
            {d.not_for_you.map((t) => <p key={t}>{t}</p>)}
          </div>
        );
      case "admission":
        return d.admission && d.admission.steps.length > 0 && (
          <Section key={`${key}${i}`} id="ld-admission" {...T("admission", "How to get in", d.admission.heading ?? "How to get in")}>
            <ol className="ld-steps">
              {d.admission.steps.filter((s) => ok(s.title) && ok(s.body)).map((s, n) => (
                <li key={s.title}><span className="ld-step-n">{n + 1}</span><b>{s.title}</b>{s.body && <span>{s.body}</span>}</li>
              ))}
            </ol>
          </Section>
        );
      case "fees":
        return !native && d.fees && d.fees.price_text.length > 0 && (
          <Section key={`${key}${i}`} id="ld-fees" {...T("fees", "The fee")}>
            <div className="ld-get">
              <div className="ld-panel ld-price ld-fee">
                {d.fees.price_text.map((t) => /^₹[\d,]+$/.test(t.trim()) ? <p key={t} className="ld-price-n">{t}</p> : <p key={t} className="ld-fee-l">{t}</p>)}
                <Cta action={action} label={label} surface="price_card" block />
                {d.fees.notes.map((t) => <p key={t} className="ld-fine">{t}</p>)}
              </div>
              {d.fees.includes && d.fees.includes.length > 0 && (
                <div className="ld-panel">
                  <h3>Included</h3>
                  <ul className="ld-ticks">{d.fees.includes.map((t) => <li key={t}><Check className="ic" /><span>{t}</span></li>)}</ul>
                </div>
              )}
            </div>
          </Section>
        );
      case "faqs":
        return d.faqs.length > 0 && (
          <Section key={`${key}${i}`} id="ld-faq" {...T("faqs", "FAQ", "Questions people ask")}>
            <Faqs items={d.faqs.filter((f) => ok(f.question) && ok(f.answer))} />
          </Section>
        );
      case "other_sections": {
        const o = d.other_sections[other++];
        if (!o) return null;
        const chipsOnly = o.body.length >= 4 && o.body.every(isChip);
        return (
          <Section key={`${key}${i}`} id={`ld-x${i}`} title={<Lines text={o.heading} />}>
            {chipsOnly
              ? <ul className="ld-chips">{o.body.map((b) => <li key={b}>{b}</li>)}</ul>
              : o.body.length > 0 && <div className="ld-prose">{o.body.filter(ok).map((b) => <p key={b}>{b}</p>)}</div>}
            {o.media.length > 0 && (
              <div className={`ld-gallery${o.media.length === 1 ? " is-one" : o.media.length > 4 ? " is-many" : ""}`}>
                {o.media.map((m) => /\.(mp4|webm)(\?|$)/i.test(m)
                  ? <Loop key={m} className="ld-gallery-m" src={m} />
                  : <img key={m} className="ld-gallery-m" src={media(m)} alt="" loading="lazy" decoding="async" />)}
              </div>
            )}
          </Section>
        );
      }
      default:
        return null;
    }
  };

  // Hero first, the closing call last; everything between in the page's own order.
  const seen = new Set<string>();
  const order = d.section_order.filter((k) => k !== "hero" && k !== "cta" && (k === "other_sections" || (!seen.has(k) && seen.add(k))));

  return (
    <div className="stage-ui ld ld--cohort">
      <section className="ld-hero ld-hero--cohort" aria-labelledby="ld-h1">
        <div className="ld-hero-media">
          {d.hero.image && <img src={media(d.hero.image)} alt="" fetchPriority="high" />}
          {(d.hero.video || d.hero.video_m) && <CohortLoop d={d} />}
        </div>
        <div className="ld-hero-body">
          {d.hero.eyebrow && <span className="eyebrow ld-hero-eyebrow">{d.hero.eyebrow}</span>}
          <h1 className="ld-h1" id="ld-h1"><Lines text={d.hero.headline} /></h1>
          {lede.length > 0 && <div className="ld-hero-lines">{lede.map((l) => <p key={l}>{l}</p>)}</div>}
          {chips.length > 0 && <ul className="ld-chips ld-chips--hero">{chips.map((c) => <li key={c}>{c}</li>)}</ul>}
          <div className="ld-hero-cta" ref={heroCta}>
            <Cta action={action} label={label} surface="hero" />
            {d.trailer && <a className="btn btn--secondary" href="#ld-trailer">Watch the showcase</a>}
          </div>
        </div>
      </section>

      {order.map(block)}

      <section className="ld-closing" aria-label={label}>
        {d.cta.image && <img className="ld-closing-art" src={media(d.cta.image)} alt="" loading="lazy" decoding="async" />}
        <h2 className="ld-h2">{d.cta.heading ?? `Apply to ${d.name}`}</h2>
        {d.cta.body && <p className="ld-lede">{d.cta.body}</p>}
        <Cta action={action} label={label} surface="closing" />
      </section>

      {after}

      {action.kind === "apply" && (
        <StickyBar watch={heroCta}>
          <span className="ld-sticky-t"><b>Applications open</b><span>{d.facts.find((f) => /duration|weeks/i.test(f.label + f.value))?.value ?? d.name}</span></span>
          <Cta action={action} label={label} surface="sticky" />
        </StickyBar>
      )}
    </div>
  );
}

/** Headings keep the page's deliberate line breaks. */
function Lines({ text }: { text: string }) {
  const parts = text.split("\n");
  return <>{parts.map((p, i) => <span key={i} className="ld-line">{p}</span>)}</>;
}

function CohortLoop({ d }: { d: Data }) {
  const [wide] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 900px)").matches);
  const src = wide ? d.hero.video ?? d.hero.video_m ?? null : d.hero.video_m ?? d.hero.video ?? null;
  return <Loop className="ld-hero-video" src={src} poster={d.hero.image} />;
}
