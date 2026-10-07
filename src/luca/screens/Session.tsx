import { useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Av, Check, Count, LivePill, SecHead } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { RecCard, errMsg, useJoin } from "../components/bits";
import { KIND_LABEL } from "../lib/derive";
import { downloadIcs } from "../lib/ics";
import { rpc } from "../lib/api";
import { sound } from "../lib/sound";
import * as T from "../lib/time";

/** One session: before (countdown, prep), live (join marks you present), after (recording). */
export default function Session() {
  const { id } = useParams();
  const { slug, d, refresh } = useLuca();
  const ui = useUI();
  const join = useJoin();
  const [ticked, setTicked] = useState<Record<number, boolean>>({});
  const s = d.sess(id);
  if (!s) return <Navigate to={`/luca/${slug}/calendar`} replace />;

  const st = d.sState(s);
  const w = s.week_n;
  const hotseat = ["review", "standup"].includes(s.kind);
  const pwOk = !d.hasPrewatch(w) || d.pwDone(w);
  const pwDue = d.pwDue(w);
  const opens = new Date(Date.parse(s.starts_at) - 15 * 6e4);
  const canJoin = T.now() >= opens && st !== "after";
  const queue = d.hotseatFor(s.id);
  const mine = d.myHot(s.id);
  const slot = s.kind === "demo" ? d.mySlot(s.id) : undefined;
  const reviewed = d.assignments.find((a) => d.reviewFor(a)?.id === s.id && d.submission(a.id));
  const reminded = !!d.me?.prefs?.remind_10_min;

  const remind = async () => {
    try {
      await rpc("luca_update_me", { p_slug: slug, p_patch: { prefs: { remind_10_min: true, remind_day_before: true } } });
      sound.play("success");
      ui.toast("We'll remind you here and by email, before it starts", "bell");
      await refresh();
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };

  let card: JSX.Element;
  if (st === "before") {
    const far = Date.parse(s.starts_at) - T.now().getTime() > 2 * T.DAYMS;
    card = (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="clock" /><span>{T.rel(s.starts_at)}, {T.time(s.starts_at)}</span></span></div>
        <Count to={s.starts_at} fmt={far ? "dhm" : "hms"} />
        <div className="hs-title">{T.dayLong(s.starts_at)}</div>
        <div className="hs-meta">{T.range(s.starts_at, s.ends_at)} · on Zoom</div>
        {slot?.at ? <div className="hs-next"><Icon name="microphone" /><span><b>You&apos;re on at {T.time(slot.at)}.</b> Slot {slot.slot_n}</span></div> : null}
        <div className="hs-actions">
          {canJoin
            ? <button className="btn btn-block" type="button" onClick={() => join(s)}><Icon name="video-camera" />Join on Zoom</button>
            : <button className="btn btn-block" type="button" disabled><Icon name="video-camera" />Join opens at {T.time(opens)}</button>}
          <div className="hs-row">
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => { downloadIcs({ title: s.title, start: s.starts_at, end: s.ends_at, description: `${KIND_LABEL[s.kind]} · ${d.p.cohort_label}. Join from the app.`, url: `${window.location.origin}/luca/${slug}/session/${s.id}` }); sound.play("success"); }}><Icon name="calendar-plus" />Add to calendar</button>
            <button className="btn btn-secondary btn-sm" type="button" disabled={reminded} onClick={remind}><Icon name={reminded ? "check" : "bell"} />{reminded ? "Reminder on" : "Remind me"}</button>
          </div>
        </div>
      </div></article>
    );
  } else if (st === "live") {
    const joined = d.attended(s.id);
    const mins = Math.max(0, Math.round((T.now().getTime() - Date.parse(s.starts_at)) / 6e4));
    card = (
      <article className="hs hs--live rv"><div className="hs-in">
        <div className="hs-top"><LivePill label="Live now" /></div>
        <div className="hs-title hs-title--big">Started {mins} min ago</div>
        <div className="hs-meta">{d.mentorNames(s.mentor_ids)}</div>
        <div className="hs-actions">
          <button className="btn btn-block" type="button" onClick={() => join(s)}><Icon name="video-camera" />{joined ? "Back to Zoom" : "Join on Zoom"}</button>
          <p className="hs-note"><Icon name="seal-check" />{joined ? "You're marked present" : `Joining from here marks you present · +${d.p.coin_rules?.attend?.value ?? 100}`}</p>
        </div>
      </div></article>
    );
  } else {
    card = (s.recording_url || (d.p.is_demo && s.recording_minutes))
      ? <RecCard s={s} d={d} big cls="rv" />
      : <div className="lc-note rv"><b>Recording on its way.</b> It lands here a few hours after the session, with chapters.</div>;
  }

  const agenda: [number, string][] = st === "after" && s.chapters?.length
    ? s.chapters.map((c) => [c.at_sec, c.title])
    : ((d.p.content.default_chapters?.[s.kind] ?? d.p.content.default_chapters?.class ?? []) as [number, string][]).map(([m, t]) => [m * 60, t]);

  return (
    <Page cls="page--session">
      <DemoBar />
      <NavBar title={s.title} back over solidAt={150} />
      <div className="ss-hero">{s.image_url ? <img src={s.image_url} alt="" /> : null}<span className="ss-shade" /></div>
      <div className="sec ss-head">
        <div className="eyebrow rv">{d.kindLine(s)}</div>
        <h1 className="h1 rv">{s.title}</h1>
        <p className="muted rv">{T.dayLong(s.starts_at)} · {T.range(s.starts_at, s.ends_at)}</p>
      </div>
      <div className="sec sec--hero">{card}</div>

      {hotseat && st !== "after" && (queue.length || d.hasPrewatch(w)) ? (
        <div className="sec">
          <SecHead title="Hot seat" sub={st === "live" ? "In order. Your turn is coming." : queue.length ? `${queue.length} people get reviewed live.${mine ? ` You are #${mine.position}.` : ""}` : "The order goes up before the session."} />
          {d.hasPrewatch(w) ? (pwOk
            ? <div className="hsq-ok rv"><Icon name="seal-check" /><span>Pre-watch done. Your seat is safe.</span></div>
            : <Link className="hsq-gate rv" to={`/luca/${slug}/prewatch/${w}`}><Icon name="warning-circle" /><span><b>Finish the pre-watch{pwDue ? ` by ${T.time(pwDue)}` : ""}</b>Or your seat goes to the next person. About 20 minutes.</span><Icon name="caret-right" /></Link>) : null}
          {queue.length ? (
            <ol className="hsq rv">
              {queue.map((h) => {
                const m = d.member(h.member_id);
                const me = h.member_id === d.me?.id;
                return (
                  <li key={h.member_id} className={me ? "is-me" : ""}>
                    <span className="hsq-n">{h.position}</span><Av p={m} /><span>{me ? "You" : m?.name ?? "Learner"}</span>
                    {me && reviewed ? <Link className="link" to={`/luca/${slug}/assign/${reviewed.id}`}>Your work</Link> : null}
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      ) : null}

      {s.prep?.length && st !== "after" ? (
        <div className="sec">
          <SecHead title="Have ready" />
          <div className="tw rv">
            {s.prep.map((p, i) => (
              <button key={i} type="button" className={`tw-r${ticked[i] ? " is-done" : ""}`} onClick={() => { setTicked((t) => ({ ...t, [i]: !t[i] })); sound.play("toggle"); }}>
                <Check on={!!ticked[i]} /><span className="tw-b"><b>{p}</b></span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {s.mentor_ids.length ? (
        <div className="sec">
          <SecHead title={s.mentor_ids.length > 1 ? "Mentors" : "Mentor"} />
          <div className="mts rv">
            {s.mentor_ids.map((mid) => { const m = d.mentor(mid); return m ? <div key={mid} className="mt"><Av p={m} cls="lc-av--md" /><span><b>{m.name}</b><em>{m.angle}</em></span></div> : null; })}
          </div>
        </div>
      ) : null}

      {agenda.length ? (
        <div className="sec">
          <SecHead title={st === "after" ? "Chapters" : "How it runs"} />
          <ol className="ag rv">
            {agenda.map(([sec, t], i) => (
              <li key={i}>
                {st === "after" && (s.recording_url || d.p.is_demo)
                  ? <Link className="mono" to={`/luca/${slug}/rec/${s.id}?t=${sec}`}>{T.fmtT(sec)}</Link>
                  : <span className="mono">{st === "after" ? T.fmtT(sec) : `+${Math.round(sec / 60)}m`}</span>}
                {t}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {s.files?.length && st === "after" ? (
        <div className="sec">
          <SecHead title="Files from the session" />
          <div className="tw rv">
            {s.files.map((f, i) => f.url ? (
              <a key={i} className="tw-r" href={f.url} target="_blank" rel="noopener noreferrer"><span className="ls-word">{f.badge}</span><span className="tw-b"><b>{f.title}</b><span>{f.sub}</span></span><Icon name="arrow-up-right" /></a>
            ) : (
              <div key={i} className="tw-r"><span className="ls-word">{f.badge}</span><span className="tw-b"><b>{f.title}</b><span>{f.sub}</span></span></div>
            ))}
          </div>
        </div>
      ) : null}
    </Page>
  );
}
