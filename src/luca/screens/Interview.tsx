import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useInterviewSlots, calendlyBookingUrl } from "@/hooks/useInterviewSlots";
import { Icon } from "../components/Icon";
import { NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { AsyncBtn, Spinner } from "../components/ui";
import { inr } from "../lib/format";
import { rpc, LucaError } from "../lib/api";
import * as T from "../lib/time";
import { sound } from "../lib/sound";

type Slot = { startTime: string; bookingUrl?: string; taken?: boolean };

/** Demo cohorts get a believable grid; real ones read Calendly's live openings. */
function demoSlots(): Slot[] {
  const out: Slot[] = [];
  const base = T.sod(T.now());
  const times = [[11, 0], [16, 0], [19, 0], [20, 0], [21, 0], [21, 30]];
  for (let d = 1; d <= 3; d++) {
    const day = T.add(base, d);
    times.forEach(([h, m], i) => {
      out.push({ startTime: new Date(day.getTime() + (h * 60 + m) * 6e4).toISOString(), taken: (d * 7 + i * 3) % 5 === 0 });
    });
  }
  return out;
}

export default function Interview() {
  const { slug, room, refresh } = useLuca();
  const p = room.program;
  const nav = useNavigate();
  const ui = useUI();
  const { profile, user } = useAuth();
  const app = room.application;
  const demo = p.is_demo;
  const live = useInterviewSlots(demo ? undefined : p.offering_id ?? undefined, { enabled: !demo && !!p.offering_id, applicationId: app?.id });
  const slots: Slot[] = useMemo(() => (demo ? demoSlots() : live.slots), [demo, live.slots]);
  const days = useMemo(() => {
    const seen = new Map<number, Date>();
    slots.forEach((s) => { const d = T.sod(s.startTime); seen.set(d.getTime(), d); });
    return [...seen.values()].sort((x, y) => x.getTime() - y.getTime());
  }, [slots]);
  const [day, setDay] = useState<number | null>(null);
  const [pick, setPick] = useState<Slot | null>(null);
  const [opened, setOpened] = useState(false);
  const selDay = day ?? days[0]?.getTime() ?? null;
  const daySlots = slots.filter((s) => T.sod(s.startTime).getTime() === selDay);

  const book = async () => {
    if (!pick) return;
    if (demo) {
      try {
        await rpc("luca_demo_advance", { p_slug: slug, p_step: "book", p_at: pick.startTime });
        ui.moment({
          eyebrow: "Application in", title: `See you ${T.wdLong(pick.startTime)}.`,
          sub: `Your interview is ${T.day(pick.startTime)} at ${T.time(pick.startTime)}, ${p.content.interview?.how ?? "on video"}. We'll remind you on WhatsApp.`,
          cta: "See my application",
          onDone: async () => { await refresh(); nav(`/luca/${slug}/status`, { replace: true }); },
        });
      } catch (e) { ui.toast(e instanceof LucaError ? e.message : "Couldn't book that. Try another time.", "warning-circle"); }
      return;
    }
    // Real cohorts: Calendly stays the only writer of the calendar. The slot opens
    // on Calendly's own page with this application's token; its webhook updates
    // the application, and the status screen picks it up.
    const url = calendlyBookingUrl(pick.bookingUrl as string, { name: profile?.full_name ?? null, email: profile?.email ?? user?.email ?? null }, { applicationToken: live.applicationToken });
    window.open(url, "_blank", "noopener");
    setOpened(true);
    sound.play("open");
  };

  const hosted = !demo ? p.pricing.calendly_url : null;
  const paid = !!app?.app_fee_paid;

  return (
    <Page cls="page--form page--slot">
      <NavBar title="Interview" back={`/luca/${slug}/status`} />
      <div className="form-wrap">
        {paid ? <div className="pay-done rv"><Icon name="check-circle-fill" /><span>{inr(p.pricing.app_fee)} paid. Application saved.</span></div> : null}
        <h1 className="h1 rv">Pick your interview</h1>
        <p className="muted rv">{p.content.interview?.sub}</p>

        {!demo && live.isWaiting ? <div className="lu-load" style={{ minHeight: 160 }}><Spinner /></div> : null}

        {slots.length > 0 ? (
          <>
            <div className="slot-days rv">
              {days.map((d) => (
                <button key={d.getTime()} type="button" className={`slot-day${d.getTime() === selDay ? " is-on" : ""}`} onClick={() => { setDay(d.getTime()); setPick(null); sound.play("toggle"); }}>
                  {T.wd(d)}<b>{T.parts(d).d}</b>{T.MON[T.parts(d).mo]}
                </button>
              ))}
            </div>
            <div className="slots rv">
              {daySlots.map((s) => (
                <button key={s.startTime} type="button" className={`slot${pick?.startTime === s.startTime ? " is-on" : ""}`} disabled={s.taken} onClick={() => { setPick(s); sound.play("toggle"); }}>{T.time(s.startTime)}</button>
              ))}
            </div>
            <AsyncBtn cls="btn-lg btn-block rv" disabled={!pick} onClick={book}>{pick ? `Book ${T.day(pick.startTime)}, ${T.time(pick.startTime)}` : "Pick a time"}</AsyncBtn>
            <p className="fine center rv">{demo ? "You get a calendar invite and a WhatsApp reminder." : "You confirm it on Calendly. You get a calendar invite and a WhatsApp reminder."}</p>
          </>
        ) : !demo && !live.isWaiting ? (
          <div className="lc-note rv"><b>No openings showing right now.</b> {hosted ? "Pick any time on the full calendar." : "We'll message you with times on WhatsApp."}</div>
        ) : null}

        {opened ? (
          <div className="lc-note rv">
            <b>Finish on Calendly.</b> Once you confirm there, your interview shows up here.
            <button className="btn btn-sm btn-secondary mt-3" type="button" onClick={async () => { await refresh(); nav(`/luca/${slug}/status`); }}>I&apos;ve booked it</button>
          </div>
        ) : null}
        {hosted ? <a className="btn-text" href={hosted} target="_blank" rel="noopener noreferrer">See every opening on Calendly</a> : null}
      </div>
    </Page>
  );
}
