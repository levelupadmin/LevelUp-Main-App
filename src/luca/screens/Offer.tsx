import { useEffect } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Count, SecHead } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { balanceOf, fill, firstName, inr } from "../lib/format";
import { usePay } from "../lib/pay";
import * as T from "../lib/time";

/** Accepted: a held seat with a clock on it, the money broken down, and one button. */
export default function Offer() {
  const { slug, room, refresh } = useLuca();
  const p = room.program;
  const app = room.application;
  const nav = useNavigate();
  const ui = useUI();
  const pay = usePay(room);
  const O = p.content.offer ?? {};

  useEffect(() => {
    if (room.access === "learner") nav(`/luca/${slug}/today`, { replace: true });
    else if (!app) nav(`/luca/${slug}/program`, { replace: true });
  }, [room.access, app, nav, slug]);
  if (!app) return null;

  const name = firstName(room.me?.name ?? (app.answers?.name as string | undefined) ?? "");
  if (app.status === "rejected" || app.status === "waitlisted") {
    return (
      <Page cls="page--offer">
        <NavBar title="Your decision" back={`/luca/${slug}/status`} />
        <div className="sec sec--hero">
          <div className="eyebrow rv">{p.name} · {p.cohort_label}</div>
          <h1 className="h1 rv">{app.status === "waitlisted" ? "You're on the waitlist." : "Not this cohort."}</h1>
          <p className="muted rv mt-3">
            {app.status === "waitlisted"
              ? "Every seat is taken for now. If one opens, it comes to you first, in the app and on WhatsApp."
              : "Thank you for applying and for the time on the interview. This cohort isn't the right fit right now. Your application fee is refundable under our refund policy, and the next cohort opens soon."}
          </p>
          <Link className="btn btn-lg btn-block mt-5" to="/refunds">Refund policy</Link>
        </div>
      </Page>
    );
  }
  if (app.status !== "accepted") return <Navigate to={`/luca/${slug}/status`} replace />;

  const hold = app.deposit_hold_until ? new Date(app.deposit_hold_until) : null;
  const confirm = () => pay("confirmation", {
    title: "Seat deposit", sub: `${p.cohort_label}. The balance is ${inr(balanceOf(p))}.`, amount: p.pricing.deposit, applicationId: app.id,
    onPaid: () => ui.moment({
      eyebrow: p.cohort_label || p.name, title: "Seat confirmed.", sonic: true, sub: fill(O.seat_sub, p),
      coins: p.coin_rules?.joined?.value, coinsWhy: "Joined the cohort", cta: "Open the cohort",
      onDone: async () => { await refresh(); nav(`/luca/${slug}/today`, { replace: true }); },
    }),
  });

  const bill: [string, string, number][] = [
    ["Program fee", `${p.cohort_label}, ${p.hours_per_week ? "12 weeks" : "the full program"}`, p.pricing.price],
    ["Application fee", "Already paid", -p.pricing.app_fee],
    ["Today", "Confirms your seat", p.pricing.deposit],
    ["The balance", p.pricing.emi ? "In full, or No-Cost EMI" : "Before the balance deadline", balanceOf(p)],
  ];

  return (
    <Page cls="page--offer">
      <DemoBar />
      <NavBar title="Your seat" back={`/luca/${slug}/status`} />
      <div className="sec sec--hero">
        <div className="eyebrow rv">You&apos;re in</div>
        <h1 className="h1 rv">{fill(O.title ?? "Welcome to {cohort}, {name}.", p, { name })}</h1>
        <p className="muted rv">{O.intro}</p>
        <article className="hs lc-hold rv"><div className="hs-in">
          <div className="hs-top"><span className="hs-state"><Icon name="lock-simple" /><span>Seat held for you</span></span></div>
          {hold ? <Count to={hold} fmt="hms" /> : null}
          {hold ? <div className="hs-title">Until {T.dayLong(hold)}, {T.time(hold)}</div> : null}
          <div className="hs-meta">After that it goes to the next person on the list.</div>
          <div className="hs-actions"><button className="btn btn-lg btn-block" type="button" onClick={confirm}>Confirm my seat · {inr(p.pricing.deposit)}</button></div>
        </div></article>
      </div>
      <div className="sec">
        <SecHead title="The money" />
        <div className="lc-bill lc-bill--card rv">
          {bill.map(([t, e, n]) => <div key={t}><span>{t}<em>{e}</em></span><b>{n < 0 ? `−${inr(-n)}` : inr(n)}</b></div>)}
        </div>
      </div>
      {O.opens?.length ? (
        <div className="sec">
          <SecHead title="What opens when you confirm" />
          <ol className="lc-out lc-out--sm rv">{O.opens.map(([b, s]) => <li key={b}><b>{fill(b, p)}</b><span>{fill(s, p)}</span></li>)}</ol>
        </div>
      ) : null}
    </Page>
  );
}
