import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "../components/Icon";
import { Graph } from "../components/Logo";
import { AvStack, SecHead } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { fill, inr, balanceOf } from "../lib/format";
import * as T from "../lib/time";
import { sound } from "../lib/sound";

/** The program page: what someone deciding sees. All copy comes from the program's content. */
export default function ProgramPage() {
  const { slug, room } = useLuca();
  const p = room.program;
  const S = p.content.sales ?? {};
  const nav = useNavigate();
  const ui = useUI();
  const { user } = useAuth();
  const [sticky, setSticky] = useState(false);
  const markRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [formUrl, setFormUrl] = useState<string | null>(null);
  const f = (t?: string) => fill(t, p);
  const loc = useLocation();
  useEffect(() => {
    if (!loc.hash) return;
    const t = setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }), 450);
    return () => clearTimeout(t);
  }, [loc.hash]);

  useEffect(() => {
    const on = () => setSticky(window.scrollY > 380);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  useEffect(() => {
    const el = markRef.current;
    if (!el) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { setDrawn(true); if (sound.running()) sound.nodes(220, 200); io.disconnect(); }
    }), { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  // When this cohort takes applications on the form, Apply goes to the form.
  useEffect(() => {
    if (p.features?.application !== false || !p.offering_id) return;
    void supabase.from("offerings").select("slug, tally_form_url").eq("id", p.offering_id).maybeSingle()
      .then(({ data }) => { if (data) setFormUrl((data.tally_form_url as string | null) || `/p/${data.slug}`); });
  }, [p.features, p.offering_id]);

  const mine = room.access === "learner" ? "learner" : room.access === "applicant" || room.access === "locked" ? "applicant" : null;
  const ctaLabel = mine === "learner" ? "Open the cohort" : mine === "applicant" ? "See your application" : f(S.apply_cta) || "Apply";

  const apply = () => {
    sound.play("tap");
    if (mine === "learner") return nav(`/luca/${slug}/today`);
    if (mine === "applicant") return nav(`/luca/${slug}/status`);
    if (p.features?.application === false) {
      if (formUrl?.startsWith("http")) window.open(formUrl, "_blank", "noopener");
      else if (formUrl) nav(formUrl);
      return;
    }
    if (!user) return nav(`/login?next=${encodeURIComponent(`/luca/${slug}/apply/1`)}`);
    nav(`/luca/${slug}/apply/1`);
  };
  const share = async () => {
    const url = `${window.location.origin}/luca/${slug}/program`;
    try {
      if (navigator.share) await navigator.share({ title: p.name, url });
      else { await navigator.clipboard.writeText(url); ui.toast("Link copied", "link-simple"); }
    } catch { /* cancelled */ }
  };

  const mech = S.mech?.cards ?? [];
  const demoDay = p.demo_day_at ? T.parts(p.demo_day_at) : null;

  return (
    <Page cls="page--luca">
      <DemoBar />
      <NavBar title={S.nav_title ?? p.short_name} over solidAt={320} actions={<button className="icon-btn" type="button" aria-label="Share" onClick={share}><Icon name="share-network" /></button>} />
      <section className="lc-hero">
        {p.hero_url ? <img className="lc-hero-img" src={p.hero_url} alt="" /> : null}
        <div className="lc-hero-in">
          <span className="lc-k rv">{f(S.kicker)}</span>
          <h1 className="display lc-title rv">{S.title ?? p.name}</h1>
          {S.lede ? <p className="lc-lede rv">{S.lede}</p> : null}
          <div className="lc-when rv">{(S.when ?? []).map((x, i) => (i === 0 ? <b key={i}>{f(x)}</b> : <span key={i}>{f(x)}</span>))}</div>
        </div>
      </section>

      {S.trailer ? (
        <div className="sec sec--hero">
          <Link to={`/luca/${slug}/trailer`} className="lc-trailer rv" onClick={() => sound.play("open")}>
            {S.trailer.img ? <img src={S.trailer.img} alt="" /> : null}
            <span className="lc-tr-play"><Icon name="play-fill" /></span>
            <span className="lc-tr-b"><b>{S.trailer.title}</b><span>{S.trailer.sub}</span></span>
          </Link>
        </div>
      ) : null}

      {S.nums?.length ? <div className="sec"><div className="lc-nums rv">{S.nums.map(([b, s], i) => <div key={i}><b>{b}</b><span>{s}</span></div>)}</div></div> : null}

      {S.outcomes ? (
        <div className="sec">
          <SecHead title={S.outcomes.title} sub={S.outcomes.sub} />
          <ol className="lc-out rv">{S.outcomes.items.map(([b, s], i) => <li key={i}><b>{b}</b><span>{s}</span></li>)}</ol>
        </div>
      ) : null}

      {p.content.sample_review ? (
        <div className="sec">
          <Link to={`/luca/${slug}/review`} className="lc-rv rv">
            <span className="lc-rv-b"><span className="eyebrow">{S.sample?.eyebrow}</span><b>{S.sample?.title}</b><span>{S.sample?.sub}</span></span>
            <span className="lc-rv-mock" aria-hidden="true"><i /><i className="is-hl" /><i /><i className="s" /><em>Fix</em></span>
          </Link>
        </div>
      ) : null}

      {p.content.phases?.length ? (
        <div className="sec">
          <SecHead title={S.phases?.title ?? "How it runs"} sub={S.phases?.sub} />
          <div className="lc-ph rv">
            <div ref={markRef} className={`lc-ph-mark${drawn ? " is-drawn" : ""}`}><Graph /></div>
            <ol>
              {p.content.phases.map((ph, i) => (
                <li className="lc-ph-row" key={i}>
                  <span className="lc-ph-n">{i + 1}</span>
                  <span className="lc-ph-b"><b>{ph.name}</b><em>Weeks {ph.from} to {ph.to}</em><span>{ph.out}.</span></span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      {S.week ? (
        <div className="sec">
          <SecHead title={S.week.title} sub={S.week.sub} />
          <div className="lc-wk rv">
            {S.week.rows.map((r, i) => (
              <div className="lc-wk-r" key={i}>
                <span className="lc-wk-t"><b>{r.day}</b>{r.time}</span>
                <span><b>{r.title}</b>{r.sub}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {mech.length ? (
        <div className="sec">
          <SecHead title={S.mech?.title ?? ""} sub={S.mech?.sub} />
          <div className="lc-mech rv">
            {mech.map((c, i) => (
              <div className="lc-mc" key={i}>
                {c.v === "avs" ? <span className="lc-mc-v"><AvStack people={room.mentors.slice(1, 6).map((m) => ({ name: m.name, photo_url: m.photo_url }))} /></span>
                  : c.v === "grid" ? <span className="lc-mc-v lc-mc-grid">{Array.from({ length: Number(c.n ?? 21) }, (_, j) => <i key={j} className={j < (c.on ?? 9) ? "is-on" : ""} />)}</span>
                  : c.v === "date" ? <span className="lc-mc-v lc-mc-date"><b>{c.d ?? demoDay?.d ?? ""}</b>{c.m ?? (demoDay ? T.MON[demoDay.mo] : "")}</span>
                  : <span className="lc-mc-v lc-mc-coin"><Icon name="coin-vertical-fill" /><b>{c.n ?? "+150"}</b></span>}
                <b>{c.b}</b><span>{c.s}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {room.mentors.length ? (
        <div className="sec" id="mentors">
          <SecHead title={S.mentors?.title ?? "Your mentors"} sub={S.mentors?.sub} />
          <div className="rail lc-mentors rv">
            {room.mentors.map((m) => (
              <div className="lc-m" key={m.id}>
                <span className="lc-m-ph">{m.photo_url ? <img src={m.photo_url} alt="" loading="lazy" decoding="async" /> : <b>{m.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}</b>}</span>
                <span className="lc-m-n">{m.name}</span>
                <span className="lc-m-a">{m.angle}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {S.proof?.items?.length ? (
        <div className="sec">
          <SecHead title={S.proof.title} sub={S.proof.sub} />
          <div className="lc-eco rv">{S.proof.items.map(([n, fl], i) => <span key={i}><b>{n}</b><em>{fl}</em></span>)}</div>
        </div>
      ) : null}

      {S.vs ? (
        <div className="sec">
          <SecHead title={S.vs.title} />
          <div className="lc-vs rv">
            <div className="lc-vs-h"><span>{S.vs.head[0]}</span><span>{S.vs.head[1]}</span></div>
            {S.vs.rows.map(([a, b], i) => <div className="lc-vs-r" key={i}><span>{a}</span><span>{b}</span></div>)}
          </div>
        </div>
      ) : null}

      {S.price ? (
        <div className="sec">
          <SecHead title={S.price.title} />
          <div className="lc-price rv">
            <div className="lc-price-top"><b>{inr(p.pricing.price)}</b><span>{p.pricing.emi ? S.price.top : null}</span></div>
            <div className="lc-bill">
              {S.price.bill.map(([t, e, k], i) => {
                const n = k === "app_fee" ? p.pricing.app_fee : k === "deposit" ? p.pricing.deposit : k === "balance" ? balanceOf(p) : Number(k);
                return <div key={i}><span>{t}<em>{e}</em></span><b>{inr(n)}</b></div>;
              })}
            </div>
          </div>
        </div>
      ) : null}

      {S.steps ? (
        <div className="sec">
          <SecHead title={S.steps.title} />
          <ol className="steps rv">{S.steps.items.map(([b, s], i) => <li key={i}><b>{f(b)}</b><span>{f(s)}</span></li>)}</ol>
        </div>
      ) : null}

      {S.faq ? (
        <div className="sec">
          <SecHead title={S.faq.title} />
          <div className="lc-faq rv">
            {S.faq.items.map(([q, a], i) => (
              <details key={i} onToggle={() => sound.play("toggle")}><summary>{q}<Icon name="plus" /></summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      ) : null}

      <div className="sec">
        <div className="lc-final rv">
          <span className="eyebrow">{f(S.final?.eyebrow)}</span>
          <b>{S.final?.title}</b>
          <button className="btn btn-lg btn-block" type="button" onClick={apply}>{ctaLabel}</button>
          {room.is_staff ? <Link className="btn-text" to={`/luca/${slug}/desk`}>Mentor desk</Link> : null}
        </div>
      </div>
      <div className="end-space" style={{ height: 110 }} />

      <div className={`sticky-cta lc-sticky${sticky ? " is-shown" : ""}`}>
        <span className="lc-sc"><b>{mine ? (mine === "learner" ? "You're in" : "Application in") : f(S.sticky?.b)}</b><span>{mine ? p.cohort_label : f(S.sticky?.s)}</span></span>
        <button className="btn" type="button" onClick={apply}>{mine === "learner" ? "Open" : mine ? "Status" : "Apply"}</button>
      </div>
    </Page>
  );
}
