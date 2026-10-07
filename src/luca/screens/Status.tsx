import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Count, SecHead } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { fill, firstName, inr } from "../lib/format";
import { usePay } from "../lib/pay";
import { downloadIcs } from "../lib/ics";
import * as T from "../lib/time";
import { sound } from "../lib/sound";
import { rpc } from "../lib/api";

/** One screen that answers "where am I?" from the first fee to the decision. */
export default function Status() {
  const { slug, room, refresh } = useLuca();
  const p = room.program;
  const app = room.application;
  const nav = useNavigate();
  const ui = useUI();
  const pay = usePay(room);
  const C = p.content.status ?? {};
  const st = app?.status;

  useEffect(() => {
    if (room.access === "learner") nav(`/luca/${slug}/today`, { replace: true });
    else if (room.access === "locked") nav(`/luca/${slug}/balance`, { replace: true });
    else if (!app) nav(`/luca/${slug}/program`, { replace: true });
  }, [room.access, app, nav, slug]);
  if (!app) return null;

  const decided = st === "accepted" || st === "rejected" || st === "waitlisted";
  const iv = app.interview_at ? new Date(app.interview_at) : null;
  const ivFuture = !!iv && iv.getTime() > T.now().getTime();

  const openDecision = () => {
    sound.unlock();
    ui.welcome({
      eyebrow: fill(C.decision_eyebrow ?? p.name, p),
      title: st === "accepted" ? fill(C.decision_title ?? "You're in, {name}.", p, { name: firstName(room.me?.name ?? app.answers?.name as string ?? "") }) : "Your decision is in.",
      onReveal: () => nav(`/luca/${slug}/offer`),
    });
  };
  const payFee = () => pay("app_fee", { title: "Application fee", sub: "Refundable under our refund policy", amount: p.pricing.app_fee, applicationId: app.id, onPaid: async () => { await refresh(); nav(`/luca/${slug}/interview`); } });

  let card;
  if (st === "submitted") {
    card = (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="note-pencil" /><span>Application saved</span></span></div>
        <div className="hs-title hs-title--big">One step left: the {inr(p.pricing.app_fee)} fee.</div>
        <div className="hs-meta">Refundable under our refund policy. Then you pick your interview.</div>
        <div className="hs-actions"><button className="btn btn-block" type="button" onClick={payFee}>Pay {inr(p.pricing.app_fee)}</button></div>
      </div></article>
    );
  } else if (decided) {
    card = (
      <article className="hs lc-dec rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="seal-check" /><span>Decision ready</span></span></div>
        <div className="hs-title hs-title--big">Open it when you&apos;re ready.</div>
        <div className="hs-meta">{iv ? `From your interview on ${T.day(iv)}. ` : ""}Sound on, if you can.</div>
        <div className="hs-actions"><button className="btn btn-lg btn-block" type="button" onClick={openDecision}>Open my decision</button></div>
      </div></article>
    );
  } else if (iv && ivFuture) {
    card = (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="video-camera" /><span>{C.iv_label ?? "Interview · on video"}</span></span></div>
        <Count to={iv} fmt="dhm" />
        <div className="hs-title">{T.dayLong(iv)}, {T.time(iv)}</div>
        <div className="hs-meta">{C.iv_meta}</div>
        <div className="hs-actions"><div className="hs-row">
          <button className="btn btn-sm" type="button" onClick={() => downloadIcs({ title: `${p.short_name || p.name} interview`, start: iv, description: C.iv_meta })}><Icon name="calendar-plus" />Add to calendar</button>
          <Link className="btn btn-secondary btn-sm" to={`/luca/${slug}/interview`}>Reschedule</Link>
        </div></div>
      </div></article>
    );
  } else if (st === "app_fee_paid") {
    card = (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="video-camera" /><span>Interview</span></span></div>
        <div className="hs-title hs-title--big">Pick your interview.</div>
        <div className="hs-meta">A video call. A vibe check and a commitment check.</div>
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/interview`}>See the times</Link></div>
      </div></article>
    );
  } else {
    card = (
      <article className="hs hs--after rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state hs-state--done"><Icon name="check-circle-fill" /><span>Interview done</span></span></div>
        <div className="hs-title">Your decision comes within 12 to 48 hours.</div>
        <div className="hs-meta">In the app and on WhatsApp.</div>
      </div></article>
    );
  }

  const rows: [string, string, "done" | "now" | "todo"][] = [
    ["Applied", T.day(app.applied_at), "done"],
    [`${inr(p.pricing.app_fee)} fee paid`, app.app_fee_paid ? "Refundable" : "Pay to finish applying", app.app_fee_paid ? "done" : "now"],
    ["Interview", iv ? `${T.day(iv)}, ${T.time(iv)}` : "Pick a time", !app.app_fee_paid ? "todo" : decided || (iv && !ivFuture) ? "done" : "now"],
    ["Decision", decided ? "Ready to open" : "Within 12 to 48 hours of your interview", decided ? "now" : "todo"],
    ["Confirm your seat", `${inr(p.pricing.deposit)} deposit`, "todo"],
  ];
  const wait: [string, string, string, string][] = [
    ["trailer", p.content.sales?.trailer?.img ?? p.hero_url ?? "", "The trailer", "30 seconds"],
    ["review", p.content.trailer?.beats?.[3]?.[0] ?? p.hero_url ?? "", "A real review", "Fix to Ship"],
    ["program#mentors", room.mentors.find((m) => m.photo_url)?.photo_url ?? p.hero_url ?? "", "Your mentors", `${room.mentors.length} working creators`],
  ];

  return (
    <Page cls="page--status">
      <DemoBar />
      <NavBar title="Your application" back={`/luca/${slug}/program`} actions={<Link className="link nb-link" to={`/luca/${slug}/program`}>Program</Link>} />
      <div className="sec sec--hero">
        <div className="eyebrow rv">{fill(C.eyebrow ?? "{program} · {cohort}", p)}</div>
        <h1 className="h1 lc-st-h rv">
          {decided ? "Your decision is in." : iv && ivFuture ? `Your interview is on ${T.wdLong(iv)}.` : st === "submitted" ? "Almost there." : "Your application is in."}
        </h1>
        {card}
      </div>
      <div className="sec">
        <SecHead title="Where you are" />
        <ol className="trk rv">
          {rows.map(([t, s, k]) => <li key={t} className={`trk-${k}`}><span className="trk-dot">{k === "done" ? <Icon name="check" /> : null}</span><span><b>{t}</b><em>{s}</em></span></li>)}
        </ol>
      </div>
      {!decided && C.prep ? (
        <div className="sec">
          <SecHead title={C.prep.title} sub={C.prep.sub} />
          <ol className="lc-out lc-prep rv">{C.prep.items.map(([b, s]) => <li key={b}><b>{b}</b><span>{fill(s, p)}</span></li>)}</ol>
        </div>
      ) : null}
      <div className="sec">
        <SecHead title="While you wait" />
        <div className="rail rail--ws lc-wait rv">
          {wait.map(([to, img, b, e]) => (
            <Link key={to} className="lc-wt" to={`/luca/${slug}/${to}`}>{img ? <img src={img} alt="" /> : null}<span><b>{b}</b><em>{e}</em></span></Link>
          ))}
        </div>
      </div>
      {p.is_demo && st !== "submitted" && !decided ? (
        <div className="sec"><div className="lc-note rv"><b>Demo:</b> skip to decision day.
          <button className="btn btn-sm btn-secondary mt-3" type="button" onClick={async () => { await rpc("luca_demo_advance", { p_slug: slug, p_step: "decide" }); await refresh(); ui.toast("Skipped ahead to decision day", "clock-countdown"); }}>Make the decision</button>
        </div></div>
      ) : null}
    </Page>
  );
}
