import { useState } from "react";
import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Av, Count, SecHead } from "../components/ui";
import { DemoBar, NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { LinkSlot, errMsg, useSlots } from "../components/bits";
import { detect } from "../lib/links";
import { rpc } from "../lib/api";
import { firstName } from "../lib/format";
import { sound } from "../lib/sound";
import * as T from "../lib/time";
import type { AssignmentPart, SprintPost } from "../lib/types";

/** The Sprint: one entry a day. Track A posts daily; Track B posts 3–4 times a week and logs the rest. */
export default function Sprint() {
  const { slug, d, refresh } = useLuca();
  const ui = useUI();
  const on = d.sprintOn();
  const day = d.sprintDay();
  const days = d.sprintDays;
  const start = d.sprintStart;
  const end = start ? T.add(start, days - 1) : null;
  const pre = !start || day < 1;
  const over = d.sprintOver();
  const trackB = d.me?.track === "B";
  const part: AssignmentPart[] = [{ k: "post", label: `Day ${day} post`, where: "Instagram or YouTube link" }];
  const slot = useSlots(`sprint${day}`, part);
  const [mode, setMode] = useState<"post" | "log">("post");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const posts = d.r.sprint_posts ?? [];
  const weekPosts = posts.filter((p) => p.kind === "post" && p.day_n > day - 7).length;
  const perWeek = d.p.sprint?.track_b_posts_per_week ?? 3;
  const close = new Date(T.sod(T.now()).getTime() + T.DAYMS - 6e4);
  const done = d.postedToday();

  const send = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const kind = trackB ? mode : "post";
      const r = await rpc<{ id: string; day: number; awarded: number }>("luca_sprint_log", {
        p_slug: slug, p_kind: kind, p_url: kind === "post" ? slot.slots[0]?.url : null, p_log: kind === "log" ? log : null, p_title: slot.slots[0]?.title ?? null,
      });
      slot.clear(); setLog("");
      const cs = d.clanStatus();
      const ms = d.clanMembers();
      const left = cs ? ms.filter((m) => m.id !== d.me?.id && !cs.done(m.id)).length : 0;
      ui.moment({
        eyebrow: `Sprint · Day ${r.day}`, title: `Day ${r.day}. Done.`,
        sub: cs ? (left ? `${left} of your Clan still to post today.` : "Your whole Clan posted today.") : "Your mentor calls it in the next standup.",
        coins: r.awarded || undefined, coinsWhy: kind === "post" ? "Sprint day published" : "Sprint day logged",
        extra: (() => { const n = (d.me?.streak ?? 0) + (d.me?.streak_today ? 0 : 1); return <div className="mo-streak"><Icon name="flame-fill" /><b>{n}</b><span>{n === 1 ? "day" : "days"} in a row</span></div>; })(),
        onDone: () => { void refresh(); },
      });
    } catch (e) { sound.play("error"); ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(false); }
  };

  const tile = (n: number, p: SprintPost) => {
    const k = p.url ? detect(p.url) : null;
    ui.sheet({
      label: `Sprint day ${n}`,
      render: () => (
        <div className="sheet-pad">
          <div className="eyebrow">Day {n}{start ? ` · ${T.day(T.add(start, n - 1))}` : ""}</div>
          <h3 className="h2">{p.kind === "log" ? "Logged" : p.title || "Your post"}</h3>
          {p.kind === "log" ? <p className="muted mt-2">{p.log}</p> : <p className="muted">{d.me?.handle ?? ""}</p>}
          {p.verdict !== "pending" ? (
            <div className={`vb vb--${p.verdict} vb--sm mt-4`}><span className="vb-k">Mentor&apos;s call</span><b className="vb-w">{p.verdict === "ship" ? "Ship" : "Fix"}</b>{p.verdict_note ? <p>{p.verdict_note}</p> : null}</div>
          ) : <div className="vb vb--pending vb--sm mt-4"><span className="vb-k">Mentor&apos;s call</span><b className="vb-w">In review</b></div>}
          {p.url ? <a className="btn btn-lg btn-block btn-secondary mt-4" href={p.url} target="_blank" rel="noopener noreferrer"><Icon name={k?.icon ?? "link"} />Open {k?.name ? `on ${k.name.replace(/^Instagram.*/, "Instagram").replace(/^YouTube.*/, "YouTube")}` : "the post"}</a> : null}
        </div>
      ),
    });
  };

  const ms = d.clanMembers();
  const prog = d.r.clan_progress ?? [];
  const today = on ? (done ? (
    <article className="hs hs--after rv"><div className="hs-in">
      <div className="hs-top"><span className="hs-state hs-state--done"><Icon name="check-circle-fill" /><span>Day {day} is in</span></span></div>
      <div className="hs-title hs-title--big">{d.me?.streak} days in a row.</div>
      <div className="hs-meta">Day {day + 1} opens at midnight. Your mentor calls today&apos;s post in the next standup.</div>
    </div></article>
  ) : (
    <article className="hs rv"><div className="hs-in">
      <div className="hs-top"><span className="hs-state"><Icon name="flame-fill" /><span>Day {day} · closes 11:59 PM</span></span></div>
      <Count to={close} fmt="hms" />
      {trackB ? (
        <div className="seg seg--sm mt-3" role="tablist">
          <button type="button" className={mode === "post" ? "is-on" : ""} onClick={() => setMode("post")}>I posted</button>
          <button type="button" className={mode === "log" ? "is-on" : ""} onClick={() => setMode("log")}>Log today</button>
        </div>
      ) : null}
      {mode === "post" || !trackB ? (
        <>
          <div className="hs-title">Paste today&apos;s post</div>
          <div className="hs-meta">Keeps your {d.me?.streak}-day streak · +{d.p.coin_rules?.sprint_post?.value ?? 250}</div>
          <div className="lss lss--on-ticket"><LinkSlot part={part[0]} i={0} slots={slot.slots} setSlots={slot.setSlots} onTicket /></div>
          <div className="hs-actions"><button className="btn btn-block" type="button" disabled={!slot.allIn || busy} onClick={send}>{busy ? "Logging" : `Log Day ${day}`}</button></div>
        </>
      ) : (
        <>
          <div className="hs-title">What did you do today?</div>
          <div className="hs-meta">Scripted, shot, edited, studied a creator. One line keeps your streak · +{d.p.coin_rules?.sprint_log?.value ?? 100}</div>
          <label className="field mt-3"><span className="input-wrap"><textarea className="input" rows={3} maxLength={600} value={log} onChange={(e) => setLog(e.target.value)} placeholder="Shot three hooks for Thursday's post." /></span></label>
          <div className="hs-actions"><button className="btn btn-block" type="button" disabled={log.trim().length < 3 || busy} onClick={send}>{busy ? "Logging" : `Log Day ${day}`}</button></div>
        </>
      )}
    </div></article>
  )) : null;

  return (
    <Page cls="page--sprint">
      <DemoBar />
      <NavBar title="Sprint" back />
      <div className="sec sec--hero">
        <div className="eyebrow rv">{days}-day Sprint · Track {d.me?.track ?? "A"} · {trackB ? `${perWeek} to ${perWeek + 1} posts a week, a daily log` : "one post a day"}</div>
        <div className="sp-head rv">
          <h1 className="display">{pre ? (start ? `Starts ${T.day(start)}` : "Dates soon") : over ? `${posts.length} of ${days}` : `Day ${day} of ${days}`}</h1>
          {pre ? null : <span className="lc-pill lc-pill--lg"><Icon name="flame-fill" /><b>{d.me?.streak ?? 0}</b></span>}
        </div>
        <p className="muted rv">
          {start && end ? `${T.day(start)} to ${T.day(end)}. ` : ""}
          {pre ? "You sign the Sprint contract first, and from Day 1 every post gets a mentor call." : "Paste each day's entry before midnight. Every post gets a call: Ship or Fix."}
          {trackB && on ? ` This week: ${weekPosts} of ${perWeek} posts.` : ""}
        </p>
        {pre && !d.me?.contract_signed_at ? (() => {
          const a = d.assignments.find((x) => x.parts.some((p) => p.k === "sign"));
          return a ? <Link className="btn btn-sm mt-3" to={`/luca/${slug}/assign/${a.id}`}><Icon name="signature" />Sign the contract</Link> : null;
        })() : null}
      </div>
      {today ? <div className="sec lc-next">{today}</div> : null}
      <div className="sec">
        <SecHead title={`Your ${days} days`} sub={pre ? "Each tile fills with a post." : "Tap a day to see the post and its call."} />
        <div className="sps rv">
          {Array.from({ length: days }, (_, i) => i + 1).map((n) => {
            const p = d.sprintPost(n);
            const isToday = on && n === day && !p;
            const missed = !p && !pre && n < day;
            return (
              <button key={n} type="button" className={`sp${p ? " is-on" : ""}${isToday ? " is-today" : ""}${missed ? " is-miss" : ""}`} disabled={!p && !isToday}
                onClick={() => { if (p) tile(n, p); else document.querySelector(".lc-next")?.scrollIntoView({ behavior: "smooth", block: "center" }); }}>
                <span className="sp-d">{n}</span>
                {p && p.kind === "log" ? <span className="sp-v">log</span> : p && p.verdict !== "pending" ? <span className="sp-v">{p.verdict === "ship" ? "Ship" : "Fix"}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      {ms.length && (on || over) ? (
        <div className="sec">
          <SecHead title={`${d.myClan()?.name ?? "Your Clan"} in the Sprint`} sub="Who has posted, day by day" />
          <div className="sbd rv">
            {ms.map((m) => {
              const isMe = m.id === d.me?.id;
              const dd = isMe ? posts.map((p) => p.day_n) : prog.find((x) => x.member_id === m.id)?.sprint_days ?? [];
              return (
                <div key={m.id} className={`sb-r${isMe ? " is-me" : ""}`}>
                  <Av p={m} /><span className="sb-n">{isMe ? "You" : firstName(m.name)}</span>
                  <span className="sb-c">
                    {Array.from({ length: days }, (_, i) => {
                      const n = i + 1;
                      const c = dd.includes(n) ? "on" : n < day || over ? "miss" : n === day ? (isMe ? "now" : "todo") : "todo";
                      return <i key={n} className={`sc-${c}`} />;
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </Page>
  );
}
