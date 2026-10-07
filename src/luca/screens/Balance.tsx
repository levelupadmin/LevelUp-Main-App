import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Count, SecHead } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { balanceOf, inr } from "../lib/format";
import { usePay } from "../lib/pay";
import * as T from "../lib/time";

/** The balance: due after the deposit; the room locks if it runs past the deadline. */
export default function Balance() {
  const { slug, room, refresh } = useLuca();
  const p = room.program;
  const app = room.application;
  const nav = useNavigate();
  const ui = useUI();
  const pay = usePay(room);
  const due = app?.balance_due_at ? new Date(app.balance_due_at) : null;
  const locked = room.access === "locked";
  const owed = app?.status === "confirmation_paid";

  const payNow = () => app && pay("balance", {
    title: "Balance", sub: `${p.cohort_label}. This completes your fee.`, amount: balanceOf(p), applicationId: app.id,
    onPaid: () => ui.moment({
      eyebrow: p.cohort_label, title: "Paid in full.", sub: "Thank you. Nothing else to pay for this cohort.",
      cta: "Back to the cohort", onDone: async () => { await refresh(); nav(`/luca/${slug}/today`, { replace: true }); },
    }),
  });

  return (
    <Page cls="page--offer">
      <DemoBar />
      <NavBar title="Your balance" back={locked ? undefined : `/luca/${slug}/me`} />
      <div className="sec sec--hero">
        <div className="eyebrow rv">{p.name} · {p.cohort_label}</div>
        <h1 className="h1 rv">{!owed ? "You're paid in full." : locked ? "Your balance is overdue." : "Your balance"}</h1>
        <p className="muted rv">
          {!owed ? "Nothing left to pay." : locked
            ? "The cohort opens again the moment it's paid. Everything you've done is saved."
            : "Pay it any time before the deadline. Your seat and everything in the cohort stay open until then."}
        </p>
        {owed ? (
          <article className={`hs rv${locked ? " hs--live" : ""}`}><div className="hs-in">
            <div className="hs-top"><span className="hs-state"><Icon name="clock" /><span>{due ? `Due ${T.day(due)}` : "Balance"}</span></span></div>
            {due && !locked ? <Count to={due} fmt="dhm" /> : null}
            <div className="hs-title hs-title--big">{inr(balanceOf(p))}</div>
            <div className="hs-meta">{p.pricing.emi ? "In full, or on No-Cost EMI at checkout." : "In full."}</div>
            <div className="hs-actions"><button className="btn btn-lg btn-block" type="button" onClick={payNow}>Pay {inr(balanceOf(p))}</button></div>
          </div></article>
        ) : null}
      </div>
      <div className="sec">
        <SecHead title="Questions about money" />
        <div className="lc-note rv"><b>Talk to the cohort team</b> on WhatsApp{p.support_whatsapp ? "" : " from the You tab"}. Refunds follow our <a className="linkish" href="/refunds">refund policy</a>.</div>
      </div>
    </Page>
  );
}
