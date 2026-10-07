import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Count } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { errMsg, useSyncSheet } from "../components/bits";
import { rpc } from "../lib/api";
import { useLook } from "../lib/theme";
import { balanceOf, inr } from "../lib/format";
import { sound } from "../lib/sound";
import * as T from "../lib/time";

const REMINDERS: [string, string, boolean][] = [
  ["remind_day_before", "Sessions, a day before", true],
  ["remind_10_min", "Sessions, 10 minutes before", true],
  ["remind_deadline", "Deadlines, 6 hours before", true],
  ["remind_sprint", "Sprint, 8 PM if today's post isn't in", true],
  ["remind_nudge", "When a clanmate nudges you", true],
  ["remind_passed", "Leaderboard: when someone passes you", false],
];

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return <button type="button" className={`switch${on ? " is-on" : ""}`} role="switch" aria-checked={on} aria-label={label} onClick={onClick}><i /></button>;
}

/** You: profile, look, reminders, calendar, money and support. */
export default function Me() {
  const { slug, room, d, refresh } = useLuca();
  const ui = useUI();
  const look = useLook();
  const sync = useSyncSheet();
  const me = d.me!;
  const p = d.p;
  const app = room.application;
  const [snd, setSnd] = useState(sound.enabled());
  const owed = app?.status === "confirmation_paid";
  const pref = (k: string, dflt: boolean) => (k in (me.prefs ?? {}) ? !!me.prefs[k] : dflt);

  const setPref = async (k: string, v: boolean) => {
    sound.play("toggle");
    try { await rpc("luca_update_me", { p_slug: slug, p_patch: { prefs: { [k]: v } } }); await refresh(); }
    catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };

  const editProfile = () => {
    function Body({ close }: { close: () => void }) {
      const [niche, setNiche] = useState(me.niche ?? "");
      const [handle, setHandle] = useState(me.handle ?? "");
      const [busy, setBusy] = useState(false);
      return (
        <div className="sheet-pad">
          <h3 className="h2">Your profile</h3>
          <label className="field mt-4"><span className="label">Niche, in a line</span><span className="input-wrap"><input className="input" maxLength={160} value={niche} onChange={(e) => setNiche(e.target.value)} /></span></label>
          <label className="field mt-3"><span className="label">Your handle</span><span className="input-wrap"><input className="input" maxLength={80} value={handle} placeholder="@yourname" onChange={(e) => setHandle(e.target.value)} /></span></label>
          <button className="btn btn-lg btn-block mt-4" type="button" disabled={busy || niche.trim().length < 3} onClick={async () => {
            setBusy(true);
            try { await rpc("luca_update_me", { p_slug: slug, p_patch: { niche: niche.trim(), handle: handle.trim() } }); close(); sound.play("success"); await refresh(); }
            catch (e) { setBusy(false); ui.toast(errMsg(e), "warning-circle"); }
          }}>{busy ? "Saving" : "Save"}</button>
        </div>
      );
    }
    ui.sheet({ label: "Your profile", render: (close) => <Body close={close} /> });
  };

  const rotate = () => {
    ui.sheet({
      label: "New calendar link",
      render: (close) => (
        <div className="sheet-pad">
          <h3 className="h2">Make a new calendar link?</h3>
          <p className="muted">The old link stops working. Any calendar you subscribed with it stops updating, so add the new one after.</p>
          <button className="btn btn-lg btn-block mt-4" type="button" onClick={async () => {
            try { await rpc("luca_rotate_cal_token", { p_slug: slug }); close(); await refresh(); ui.toast("New calendar link made. Add it again.", "calendar-plus"); }
            catch (e) { ui.toast(errMsg(e), "warning-circle"); }
          }}>Make a new link</button>
          <button className="btn-text mt-2" type="button" onClick={close}>Keep the current one</button>
        </div>
      ),
    });
  };

  const wa = p.support_whatsapp ? `https://wa.me/${p.support_whatsapp.replace(/[^\d]/g, "")}?text=${encodeURIComponent(`Hi, I'm ${me.name} from ${p.cohort_label}.`)}` : null;

  return (
    <Page cls="page--me">
      <DemoBar />
      <NavBar title="You" back />
      <div className="sec sec--hero">
        <div className="me-top rv">
          <span className="avatar avatar--xl lc-me">{me.photo_url ? <img src={me.photo_url} alt="" /> : me.initials}</span>
          <div><h1 className="h2">{me.name}</h1><p className="muted">{me.handle ? `${me.handle} · ` : ""}Track {me.track}</p></div>
        </div>
        <div className="me-k rv">
          <button type="button" onClick={editProfile} style={{ textAlign: "left" }}><span className="eyebrow">Niche</span><b>{me.niche || "Add your niche"}</b></button>
          <div><span className="eyebrow">Clan</span><b>{room.clans_open ? d.myClan()?.name ?? "Coming soon" : "On day one"}</b></div>
        </div>
      </div>

      {owed && app ? (
        <div className="sec">
          <Link className="hs rv" to={`/luca/${slug}/balance`} style={{ display: "block" }}><div className="hs-in">
            <div className="hs-top"><span className="hs-state"><Icon name="wallet" /><span>Balance{app.balance_due_at ? ` · due ${T.day(app.balance_due_at)}` : ""}</span></span></div>
            {app.balance_due_at ? <Count to={app.balance_due_at} fmt="dhm" /> : null}
            <div className="hs-title">{inr(balanceOf(p))} left to pay</div>
            <div className="hs-meta">Pay before the deadline to keep the cohort open.</div>
          </div></Link>
        </div>
      ) : null}

      <div className="set">
        <div className="set-h">Look</div>
        <div className="set-row set-row--col"><span className="set-l">Accent</span>
          <div className="me-acc">
            {([["ember", "Ember", "#f0561a"], ["mono", "Mono", ""]] as const).map(([k, l, c]) => (
              <button key={k} type="button" className={`me-a${look.accent === k ? " is-on" : ""}`} onClick={() => { look.setAccent(k); sound.play("toggle"); }}>
                <i className={`me-a-${k}`} style={c ? { background: c } : undefined} />{l}
              </button>
            ))}
          </div>
        </div>
        <div className="set-row set-row--col"><span className="set-l">Appearance</span>
          <div className="seg">
            {([["dark", "Dark"], ["light", "Light"]] as const).map(([k, l]) => (
              <button key={k} type="button" className={look.theme === k ? "is-on" : ""} onClick={() => { look.setTheme(k); sound.play("toggle"); }}>{l}</button>
            ))}
          </div>
        </div>
        <div className="set-row"><span className="set-l">Sounds</span><Switch label="Sounds" on={snd} onClick={() => { sound.setEnabled(!snd); setSnd(!snd); if (!snd) sound.play("toggle"); }} /></div>
      </div>

      <div className="set">
        <div className="set-h">Reminders · in the app and by email</div>
        {REMINDERS.map(([k, label, dflt]) => (
          <div key={k} className="set-row"><span className="set-l">{label}</span><Switch label={label} on={pref(k, dflt)} onClick={() => setPref(k, !pref(k, dflt))} /></div>
        ))}
      </div>

      <div className="set">
        <div className="set-h">Cohort</div>
        <button type="button" className="set-row set-row--btn" onClick={sync}><span className="set-l">Calendar sync</span><Icon name="caret-right" /></button>
        <button type="button" className="set-row set-row--btn" onClick={rotate}><span className="set-l">Make a new calendar link</span><Icon name="arrows-clockwise" /></button>
        {d.alumni ? <Link className="set-row set-row--btn" to={`/luca/${slug}/certificate`}><span className="set-l">Your certificate</span><Icon name="certificate" /></Link> : null}
        {owed ? <Link className="set-row set-row--btn" to={`/luca/${slug}/balance`}><span className="set-l">Pay the balance</span><Icon name="caret-right" /></Link> : null}
        <Link className="set-row set-row--btn" to="/refunds"><span className="set-l">Refund policy</span><Icon name="arrow-square-out" /></Link>
        {wa ? <a className="set-row set-row--btn" href={wa} target="_blank" rel="noopener noreferrer"><span className="set-l">Talk to the cohort team</span><Icon name="whatsapp-logo" /></a> : null}
        {p.whatsapp_url ? <a className="set-row set-row--btn" href={p.whatsapp_url} target="_blank" rel="noopener noreferrer"><span className="set-l">Cohort WhatsApp group</span><Icon name="whatsapp-logo" /></a> : null}
        {p.drive_url ? <a className="set-row set-row--btn" href={p.drive_url} target="_blank" rel="noopener noreferrer"><span className="set-l">Cohort Drive</span><Icon name="google-drive-logo" /></a> : null}
      </div>

      {room.is_staff ? (
        <div className="set">
          <div className="set-h">Staff</div>
          <Link className="set-row set-row--btn" to={`/luca/${slug}/desk`}><span className="set-l">Mentor desk</span><Icon name="caret-right" /></Link>
          {p.is_demo ? <Link className="set-row set-row--btn" to={`/luca/${slug}/demo`}><span className="set-l">Demo: change the day</span><Icon name="caret-right" /></Link> : null}
          <a className="set-row set-row--btn" href="/admin/luca"><span className="set-l">Admin console</span><Icon name="arrow-square-out" /></a>
        </div>
      ) : null}

      <div className="set">
        <Link className="set-row set-row--btn" to="/luca"><span className="set-l">All your cohorts</span><Icon name="caret-right" /></Link>
        <a className="set-row set-row--btn" href="/home"><span className="set-l">Back to LevelUp</span><Icon name="arrow-square-out" /></a>
      </div>
    </Page>
  );
}
