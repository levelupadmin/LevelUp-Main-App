import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { errMsg } from "../components/bits";
import { rpc } from "../lib/api";
import { sound } from "../lib/sound";

/** The demo cohort's days, in order, and where each one lands. */
const STOPS: { k: string; t: string; s: string; to: string }[] = [
  { k: "browse", t: "First look", s: "The program page, before applying", to: "program" },
  { k: "applied", t: "Applied", s: "Application in, fee paid, interview booked", to: "status" },
  { k: "decision", t: "Accepted", s: "The offer, with the seat on hold", to: "offer" },
  { k: "prestart", t: "Before day one", s: "Paid, setting up, the Clan still a mystery", to: "today" },
  { k: "orientation", t: "Orientation, live", s: "The first session is on now", to: "today" },
  { k: "week1", t: "Week 1", s: "Pre-watch, first assignment, Clans out", to: "today" },
  { k: "week5", t: "Week 5", s: "A Fix to send before tonight's review", to: "today" },
  { k: "sprint", t: "The Sprint", s: "Day 9, today's post not in yet", to: "today" },
  { k: "demo", t: "Demo Day, live", s: "On stage in a few minutes", to: "today" },
  { k: "alumni", t: "After Demo Day", s: "The wrap, the certificate", to: "today" },
];

/**
 * Staff only, demo cohort only. Slides the demo timeline so "now" lands on the
 * chosen day and rebuilds your own demo state around it. Never touches a real
 * cohort (the server refuses).
 */
export default function DemoSwitch() {
  const { slug, room, refresh } = useLuca();
  const ui = useUI();
  const nav = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  if (!room.program.is_demo) return <Navigate to={`/luca/${slug}`} replace />;

  const go = async (k: string, to: string) => {
    if (busy) return;
    setBusy(k);
    try {
      await rpc("luca_demo_scenario", { p_slug: slug, p_stage: k });
      await refresh();
      sound.play("success");
      nav(`/luca/${slug}/${to}`, { replace: true });
    } catch (e) { sound.play("error"); ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(null); }
  };

  return (
    <Page cls="page--me">
      <NavBar title="Demo cohort" back />
      <div className="sec sec--hero">
        <div className="eyebrow rv">Staff only · sample data</div>
        <h1 className="h1 rv">Pick the day.</h1>
        <p className="muted rv">The whole demo cohort moves so that today is that day: sessions, deadlines, the Sprint, your coins and your Clan. Payments here are simulated; no money moves.</p>
      </div>
      <div className="sec">
        <div className="tw rv">
          {STOPS.map((x, i) => (
            <button key={x.k} type="button" className="tw-r" disabled={!!busy} onClick={() => go(x.k, x.to)}>
              <span className="lc-ck" style={{ display: "grid", placeItems: "center", fontWeight: 700 }}>{i + 1}</span>
              <span className="tw-b"><b>{x.t}</b><span>{busy === x.k ? "Moving the cohort…" : x.s}</span></span>
              <Icon name="caret-right" />
            </button>
          ))}
        </div>
        <p className="fine rv mt-3">Each switch takes a second or two. Your real account, enrolments and payments are not touched.</p>
      </div>
    </Page>
  );
}
