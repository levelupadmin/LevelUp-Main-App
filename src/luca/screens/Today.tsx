import { useMemo, type CSSProperties } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Arc, Av, AvStack, Bar, Check, Count, LivePill, SecHead } from "../components/ui";
import { AppBar, DemoBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { RecCard, SessRow, errMsg, useCelebrate, useFeedbackSheet, useJoin, useNudge, useStreakSheet, useSyncSheet } from "../components/bits";
import { andList, fill, firstName, num } from "../lib/format";
import { KIND_LABEL, type Derived } from "../lib/derive";
import { rpc } from "../lib/api";
import * as T from "../lib/time";
import { sound } from "../lib/sound";
import type { Session } from "../lib/types";

function greet(name: string) {
  const h = T.hour();
  const n = firstName(name);
  return h < 5 ? `Still up, ${n}?` : h < 12 ? `Good morning, ${n}.` : h < 17 ? `Good afternoon, ${n}.` : `Good evening, ${n}.`;
}

function eyebrow(d: Derived) {
  const p = d.p, w = d.week();
  if (d.alumni) return `${p.cohort_label} · complete`;
  if (w < 0) return `${p.cohort_label} · starts ${p.starts_at ? T.day(p.starts_at) : "soon"}`;
  const row = d.weekRow(w);
  if (row?.is_demo_week) return `${p.cohort_label} · Demo Day`;
  const total = Math.max(0, ...d.weeks.filter((x) => !x.is_demo_week).map((x) => x.n));
  return `${p.cohort_label} · Week ${w} of ${total} · ${d.phaseOf(w)?.name ?? row?.module ?? ""}`;
}

/** The one loud card: what to do next, chosen from the real state of the day. */
function NextCard() {
  const { slug, d } = useLuca();
  const nav = useNavigate();
  const join = useJoin();
  const sync = useSyncSheet();
  const live = d.live();
  const p = d.p;

  if (live) {
    const joined = d.attended(live.id);
    const mins = Math.max(0, Math.round((T.now().getTime() - Date.parse(live.starts_at)) / 6e4));
    const slot = live.kind === "demo" ? d.mySlot(live.id) : undefined;
    return (
      <article className="hs hs--live rv"><div className="hs-in">
        <div className="hs-top"><LivePill label="Live now" /></div>
        <div className="hs-title hs-title--big">{live.title}</div>
        <div className="hs-meta">Started {mins} min ago · {d.mentorNames(live.mentor_ids)}</div>
        {slot?.at ? <div className="hs-next"><Icon name="microphone" /><span><b>You&apos;re on at {T.time(slot.at)}.</b> Slot {slot.slot_n}, in <Count to={slot.at} fmt="left" /></span></div>
          : <div className="hs-people"><AvStack people={live.mentor_ids.map((id) => d.mentor(id)).filter(Boolean).map((m) => ({ name: m!.name, photo_url: m!.photo_url }))} cls="lc-avs--tk" /><span>{KIND_LABEL[live.kind]}</span></div>}
        <div className="hs-actions">
          <button className="btn btn-block" type="button" onClick={() => join(live)}><Icon name="video-camera" />{joined ? "Back to Zoom" : "Join on Zoom"}</button>
          <p className="hs-note"><Icon name="seal-check" />{joined ? "You're marked present" : `Joining from here marks you present · +${p.coin_rules?.attend?.value ?? 100}`}</p>
        </div>
      </div></article>
    );
  }

  if (!d.started) {
    const first = d.sessions[0];
    const setupDone = ["seat", "whatsapp", "calendar", "drive", "pw0"].every((k) => d.me?.setup?.[k]);
    return (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="clock" /><span>{first ? `${KIND_LABEL[first.kind]} · ${T.day(first.starts_at)}, ${T.time(first.starts_at)}` : "Starts soon"}</span></span></div>
        {first ? <Count to={first.starts_at} fmt="dhm" /> : null}
        <div className="hs-title">{setupDone ? "You're all set. See you there." : `${Math.max(1, T.diffDays(first?.starts_at ?? T.now(), T.now()))} days to go. Get set up first.`}</div>
        <div className="hs-meta">{setupDone ? "Camera on, a quiet corner. Your Clan drops on the day." : `Setup done before the first session is worth ${p.coin_rules?.setup?.value ?? 100} coins.`}</div>
        <div className="hs-actions"><div className="hs-row">
          {first ? <Link className="btn btn-sm" to={`/luca/${slug}/session/${first.id}`}><Icon name="arrow-right" />About {KIND_LABEL[first.kind]}</Link> : null}
          <button className="btn btn-secondary btn-sm" type="button" onClick={sync}><Icon name="calendar-plus" />Add all {d.sessions.length}</button>
        </div></div>
      </div></article>
    );
  }

  if (d.alumni) {
    const posts = (d.r.sprint_posts ?? []).filter((x) => x.kind === "post").length;
    const shipped = (d.r.submissions ?? []).filter((s) => s.verdict === "ship").length;
    const demo = d.sessions.find((s) => s.kind === "demo");
    return (
      <article className="hs hs--after lc-wrap rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state hs-state--done"><Icon name="check-circle-fill" /><span>{p.cohort_label}, complete</span></span></div>
        <div className="hs-title hs-title--big">You shipped.</div>
        <div className="lc-wrap-n">
          <div><b>{posts}</b><span>Sprint posts</span></div>
          <div><b>{shipped}</b><span>pieces shipped</span></div>
          <div><b>{num(d.me?.coins)}</b><span>coins</span></div>
          <div><b>#{d.rank() ?? "–"}</b><span>of {d.members().length}</span></div>
        </div>
        <div className="hs-actions"><div className="hs-row">
          <Link className="btn btn-sm" to={`/luca/${slug}/certificate`}><Icon name="certificate" />Certificate</Link>
          {demo ? <Link className="btn btn-secondary btn-sm" to={`/luca/${slug}/rec/${demo.id}`}><Icon name="play-fill" />Demo Day</Link> : null}
        </div></div>
      </div></article>
    );
  }

  if (d.sprintOn()) {
    const day = d.sprintDay();
    const close = new Date(T.sod(T.now()).getTime() + T.DAYMS - 6e4);
    if (d.postedToday()) {
      return (
        <article className="hs hs--after rv"><div className="hs-in">
          <div className="hs-top"><span className="hs-state hs-state--done"><Icon name="check-circle-fill" /><span>Done for today</span></span></div>
          <div className="hs-title hs-title--big">Day {day} is in.</div>
          <div className="hs-meta">Streak: {d.me?.streak} days. Day {day + 1} opens at midnight.</div>
          <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/sprint`}>See the Sprint</Link></div>
        </div></article>
      );
    }
    return (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="flame-fill" /><span>Sprint · Day {day} of {d.sprintDays}</span></span></div>
        <Count to={close} fmt="hms" />
        <div className="hs-title">Today&apos;s {d.me?.track === "B" ? "entry" : "post"} isn&apos;t in yet</div>
        <div className="hs-meta">Your {d.me?.streak}-day streak is on the line · +{p.coin_rules?.sprint_post?.value ?? 250} when it&apos;s in</div>
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/sprint`}><Icon name="clipboard-text" />Paste today&apos;s link</Link></div>
      </div></article>
    );
  }

  // A review or standup later today: the hot seat and what keeps it.
  const tonight = d.sessions.find((s) => ["review", "standup"].includes(s.kind) && T.same(s.starts_at, T.now()) && d.sState(s) === "before");
  if (tonight) {
    const w = tonight.week_n;
    const pwDue = d.pwDue(w);
    const needPw = d.hasPrewatch(w) && !d.pwDone(w);
    const fix = d.fixAsked();
    const fixSub = fix ? d.submission(fix.id) : undefined;
    const hot = d.myHot(tonight.id);
    const ready = !needPw && !fix;
    return (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="broadcast" /><span>{T.hour() >= 17 ? "Tonight" : "Today"} · {T.time(tonight.starts_at)} · {KIND_LABEL[tonight.kind]}</span></span></div>
        <Count to={tonight.starts_at} fmt="hms" />
        <div className="hs-title">{tonight.title}</div>
        <div className="hs-meta">{d.mentorNames(tonight.mentor_ids)}{hot ? ` · you're #${hot.position} on the hot seat` : ""}</div>
        {(needPw || fix || ready) ? (
          <div className="hs-todo">
            <div className="hs-todo-h">{ready ? "You're set." : pwDue ? <>Before {T.time(pwDue)}, <Count to={pwDue} fmt="left" zero="closed" /> left</> : "Before it starts"}</div>
            {d.hasPrewatch(w) ? (
              <button type="button" className={`hs-t${!needPw ? " is-done" : ""}`} onClick={() => nav(`/luca/${slug}/prewatch/${w}`)}>
                <Check on={!needPw} /><span><b>Pre-watch + quiz</b><em>{needPw ? "About 20 min. Keeps your hot seat." : "Done. Your hot seat is safe."}</em></span>{needPw ? <Icon name="caret-right" /> : null}
              </button>
            ) : null}
            {fix ? (
              <button type="button" className="hs-t" onClick={() => nav(`/luca/${slug}/assign/${fix.id}`)}>
                <Check on={false} /><span><b>Fix: {fix.title}</b><em>{fixSub?.notes?.[0] ?? "Your mentor asked for a fix."}</em></span><Icon name="caret-right" />
              </button>
            ) : null}
          </div>
        ) : null}
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/session/${tonight.id}`}>See {T.hour() >= 17 ? "tonight's" : "today's"} session</Link></div>
      </div></article>
    );
  }

  const cur = d.current();
  if (cur) {
    const n = Object.values((() => { try { return JSON.parse(sessionStorage.getItem(`luca.draft.${cur.id}`) || "{}") as Record<string, { ok?: boolean }>; } catch { return {}; } })()).filter((x) => x?.ok).length;
    const parts = cur.parts.filter((x) => x.k !== "sign").length || cur.parts.length;
    return (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="note-pencil" /><span>Due {T.day(cur.due_at)}, {T.time(cur.due_at)}</span></span></div>
        <Count to={cur.due_at} fmt="dhm" />
        <div className="hs-title">{cur.title}</div>
        <div className="hs-meta">{n} of {parts} links in · +{cur.coins ?? p.coin_rules?.submit_on_time?.value ?? 150} if it&apos;s in on time</div>
        <Bar p={n / parts} cls="lc-hs-bar" />
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/assign/${cur.id}`}>{n ? "Keep going" : `Start Week ${cur.week_n}`}</Link></div>
      </div></article>
    );
  }

  const nx = d.next();
  if (nx) {
    const far = Date.parse(nx.starts_at) - T.now().getTime() > 2 * T.DAYMS;
    return (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="clock" /><span>Next · {T.rel(nx.starts_at)}, {T.time(nx.starts_at)}</span></span></div>
        <Count to={nx.starts_at} fmt={far ? "dhm" : "hms"} />
        <div className="hs-title">{nx.title}</div>
        <div className="hs-meta">{KIND_LABEL[nx.kind]} · {d.mentorNames(nx.mentor_ids)}</div>
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/session/${nx.id}`}>See the session</Link></div>
      </div></article>
    );
  }
  return null;
}

function Standing() {
  const { d } = useLuca();
  if (!d.boardOpen()) {
    return (
      <div className="lc-stand rv">
        <div className="lc-st is-wait"><span className="eyebrow">Leaderboard</span><b>{num(d.me?.coins)}</b><span>Everyone starts here. It opens at {d.sessions[0] ? KIND_LABEL[d.sessions[0].kind] : "the start"}.</span></div>
        <div className="lc-st is-wait"><span className="eyebrow">Your Clan</span><b>?</b><span>{d.p.clan_size ?? 6} or so people, revealed on day one.</span></div>
      </div>
    );
  }
  const nu = d.nextUp();
  const { slug } = d.p;
  return (
    <div className="lc-stand rv">
      <Link className="lc-st" to={`/luca/${slug}/clan?tab=board`}><span className="eyebrow">Leaderboard</span><b>#{d.rank()}</b>
        <span>of {d.members().length} · <em>{nu ? `${num(nu.gap)} coins to pass ${firstName(nu.p.name)}` : "Top of the board"}</em></span></Link>
      {d.myClan() ? (
        <Link className="lc-st" to={`/luca/${slug}/clan`}><span className="eyebrow">Your Clan</span><b>#{d.clanRank()}</b><span>{d.myClan()?.name}, of {d.clans().length} Clans</span></Link>
      ) : (
        <div className="lc-st is-wait"><span className="eyebrow">Your Clan</span><b>?</b><span>Clans are formed soon.</span></div>
      )}
    </div>
  );
}

function ThisWeek() {
  const { slug, d } = useLuca();
  const w = d.week();
  const p = d.p;
  const items = useMemo(() => {
    if (w < 0 || d.alumni) return null;
    const out: { t: string; s: string; done: boolean; live?: boolean; to: string }[] = [];
    if (d.sprintOn()) out.push({ t: `Post today: Sprint day ${d.sprintDay()}`, s: `Before 11:59 PM · +${p.coin_rules?.sprint_post?.value ?? 250}`, done: d.postedToday(), to: "sprint" });
    else if (d.hasPrewatch(w)) {
      const due = d.pwDue(w);
      out.push({ t: `Pre-watch: ${d.weekRow(w)?.prewatch?.title ?? d.weekRow(w)?.module}`, s: `Quiz + 60-second summary${due ? ` · by ${T.wd(due)} ${T.time(due)}` : ""} · +${p.coin_rules?.prewatch?.value ?? 50}`, done: d.pwDone(w), to: `prewatch/${w}` });
    }
    const fix = d.fixAsked();
    if (fix) out.push({ t: `Fix: ${fix.title}`, s: d.submission(fix.id)?.fix_due_at ? `By ${T.day(d.submission(fix.id)!.fix_due_at!)}, ${T.time(d.submission(fix.id)!.fix_due_at!)}` : "Your mentor asked for a fix", done: false, to: `assign/${fix.id}` });
    d.sessions.filter((s) => s.week_n === w).forEach((s: Session) => out.push({
      t: ["review", "orientation", "demo"].includes(s.kind) || s.title.toLowerCase().startsWith((KIND_LABEL[s.kind] ?? "").toLowerCase()) ? s.title : `${KIND_LABEL[s.kind]}: ${s.title}`,
      s: `${T.wd(s.starts_at)} ${T.range(s.starts_at, s.ends_at)} · +${p.coin_rules?.attend?.value ?? 100} for showing up`,
      done: d.attended(s.id), live: d.sState(s) === "live", to: `session/${s.id}`,
    }));
    d.assignments.filter((a) => a.week_n === w).forEach((a) => out.push({ t: `Submit: ${a.title}`, s: `${T.day(a.due_at)}, ${T.time(a.due_at)} · +${a.coins ?? p.coin_rules?.submit_on_time?.value ?? 150} on time`, done: !!d.submission(a.id), to: `assign/${a.id}` }));
    if (d.clanFeed().length || (d.r.feedback_given ?? []).length) {
      const given = (d.r.feedback_given ?? []).length;
      out.push({ t: "Feedback on 2 Clan posts", s: `+${p.coin_rules?.feedback?.value ?? 25} each`, done: given >= 2, to: "clan" });
    }
    return out;
  }, [d, w, p]);
  if (!items?.length) return null;
  const n = items.filter((x) => x.done).length;
  return (
    <div className="sec">
      <div className="sec-head rv"><div><h2 className="h2">This week</h2><p className="sec-sub">{n} of {items.length} done</p></div><Link className="link" to={`/luca/${slug}/calendar`}>Calendar</Link></div>
      <Bar p={n / items.length} cls="lc-tw-bar rv" />
      <div className="tw rv">
        {items.map((x, k) => (
          <Link key={k} className={`tw-r${x.done ? " is-done" : ""}${x.live ? " is-live" : ""}`} to={`/luca/${slug}/${x.to}`}>
            <Check on={x.done} /><span className="tw-b"><b>{x.t}</b><span>{x.live ? <><i className="tw-live">Live now</i> · </> : null}{x.s}</span></span><Icon name="caret-right" />
          </Link>
        ))}
      </div>
    </div>
  );
}

function Setup() {
  const { slug, d, refresh } = useLuca();
  const ui = useUI();
  const sync = useSyncSheet();
  const celebrate = useCelebrate();
  const p = d.p;
  const items = p.content.setup ?? [];
  const setup = d.me?.setup ?? {};
  const n = items.filter((x) => setup[x.key]).length;
  const step = async (key: string) => {
    if (key === "calendar") return sync();
    const url = key === "whatsapp" ? p.whatsapp_url : key === "drive" ? p.drive_url : null;
    if (url) window.open(url, "_blank", "noopener");
    try {
      const after = await rpc<Record<string, boolean>>("luca_setup", { p_slug: slug, p_key: key });
      sound.play("success");
      ui.toast(key === "whatsapp" ? (url ? "Opening WhatsApp. Join the group there." : "Marked done. The group link comes from your cohort team.") : (url ? "Opened Drive. Make your copy there." : "Marked done."), key === "whatsapp" ? "whatsapp-logo" : "google-drive-logo");
      if (["seat", "whatsapp", "calendar", "drive", "pw0"].every((k) => after?.[k])) setTimeout(() => celebrate(p.coin_rules?.setup?.value, "All set up"), 900);
      await refresh();
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };
  if (!items.length) return null;
  return (
    <div className="sec">
      <div className="sec-head rv"><div><h2 className="h2">Get set up</h2><p className="sec-sub">{n} of {items.length} done · +{p.coin_rules?.setup?.value ?? 100} when all are</p></div></div>
      <Bar p={n / items.length} cls="lc-tw-bar rv" />
      <div className="tw rv">
        {items.map((x) => {
          const done = !!setup[x.key];
          const inner = <><Check on={done} /><span className="tw-b"><b>{fill(x.title, p)}</b><span>{done && x.key === "seat" ? "Done" : x.sub}</span></span>{done ? null : <Icon name="caret-right" />}</>;
          if (x.key === "pw0" && !done) return <Link key={x.key} className="tw-r" to={`/luca/${slug}/prewatch/0`}>{inner}</Link>;
          return <button key={x.key} type="button" className={`tw-r${done ? " is-done" : ""}`} disabled={done || x.key === "seat"} onClick={() => step(x.key)}>{inner}</button>;
        })}
      </div>
    </div>
  );
}

function ClanPulse() {
  const { slug, d } = useLuca();
  const nudge = useNudge();
  const fb = useFeedbackSheet();
  const cs = d.clanStatus();
  if (!cs) return null;
  const ms = d.clanMembers();
  const doneN = ms.filter((m) => cs.done(m.id)).length;
  const notDone = ms.filter((m) => m.id !== d.me?.id && !cs.done(m.id));
  const names = notDone.map((m) => firstName(m.name));
  const f = d.clanFeed()[0];
  const fm = f ? d.member(f.member_id) : undefined;
  return (
    <div className="sec">
      <SecHead title={d.myClan()?.name} sub="Your Clan, today" link="Open" to={`/luca/${slug}/clan`} />
      <div className="cp rv">
        <div className="cp-row" style={{ gridTemplateColumns: `repeat(${Math.max(ms.length, 1)}, 1fr)` }}>
          {ms.map((m) => <span key={m.id} className={`cp-m${cs.done(m.id) ? " is-done" : ""}`}><Av p={m} /><em>{m.id === d.me?.id ? "You" : firstName(m.name)}</em></span>)}
        </div>
        <p className="cp-s"><b>{doneN} of {ms.length}</b> {cs.label.toLowerCase()}.{notDone.length && notDone.length < 4 ? ` ${andList(names)} ${notDone.length > 1 ? "haven't" : "hasn't"} yet.` : ""}</p>
        {notDone.length && !d.live() ? (
          <div className="cp-acts">
            {notDone.slice(0, 2).map((m) => (
              <button key={m.id} className="btn btn-sm btn-secondary" type="button" disabled={d.nudged(m.id)} onClick={() => nudge(m.id)}>
                {d.nudged(m.id) ? <><Icon name="check" />Nudged</> : <><Icon name="hand-waving" />Nudge {firstName(m.name)}</>}
              </button>
            ))}
          </div>
        ) : null}
        {f && fm ? (
          <button type="button" className="cp-feed" onClick={() => fb(f.member_id, f.ref, f.title, f.url)}>
            <Av p={fm} /><span><b>{firstName(fm.name)} posted</b><em>&ldquo;{f.title}&rdquo;</em></span><span className="cp-fb">Feedback · +{d.p.coin_rules?.feedback?.value ?? 25}</span>
          </button>
        ) : null}
      </div>
    </div>
  );
}

function SprintMini() {
  const { slug, d } = useLuca();
  if (!d.sprintOn()) return null;
  const day = d.sprintDay();
  return (
    <div className="sec">
      <SecHead title="Your Sprint" sub={d.me?.track === "B" ? "Track B · 3 to 4 posts a week, a daily log" : "Track A · one post a day"} link="Open" to={`/luca/${slug}/sprint`} />
      <div className="sps sps--mini rv">
        {Array.from({ length: d.sprintDays }, (_, k) => k + 1).map((n) => {
          const post = d.sprintPost(n);
          const today = n === day && !post;
          return <Link key={n} to={`/luca/${slug}/sprint`} className={`sp${post ? " is-on" : ""}${today ? " is-today" : ""}`} aria-label={`Day ${n}`}><span className="sp-d">{n}</span></Link>;
        })}
      </div>
    </div>
  );
}

export default function Today() {
  const { slug, room, d, refresh } = useLuca();
  const ui = useUI();
  const streak = useStreakSheet();
  const nav = useNavigate();
  const me = d.me!;
  const labels = (d.p.content.arc_labels as [number, string][] | undefined) ?? [[0, "W0"], [Math.max(0, d.weeks.length - 1), "Demo"]];
  const sprintWeeks = d.weeks.filter((w) => w.is_sprint).map((w) => w.n);
  const special: [number, number] | undefined = sprintWeeks.length ? [Math.min(...sprintWeeks), Math.max(...sprintWeeks)] : undefined;
  const latest = d.lastRec();
  const upcoming = d.sessions.filter((s) => Date.parse(s.starts_at) > T.now().getTime()).slice(0, 3);
  const showReveal = !!room.clans_open && !!me.clan_id && !me.revealed_at;
  const announcements = (room.announcements ?? []).slice(0, 2);

  const reveal = () => {
    const clan = d.myClan();
    if (!clan) return;
    ui.reveal({
      kicker: (d.p.content.reveal?.k ?? "{cohort} · Your Clan").replace("{cohort}", d.p.cohort_label),
      name: clan.name,
      sub: d.p.content.reveal?.s ?? "Your Clan's score is everyone's coins added up.",
      cta: d.p.content.reveal?.cta ?? "Meet your Clan",
      people: d.clanMembers().map((m) => ({ ...m, label: m.id === me.id ? "You" : m.name })),
      onDone: async () => {
        try { await rpc("luca_update_me", { p_slug: slug, p_patch: { revealed: true } }); } catch { /* cosmetic */ }
        await refresh();
        nav(`/luca/${slug}/clan`);
      },
    });
  };

  return (
    <Page cls="page--today" tabbar>
      <DemoBar />
      <AppBar onStreak={streak} />
      <div className="greet lc-greet">
        <div className="eyebrow rv">{eyebrow(d)}</div>
        <h1 className="h1 greet-h rv">{greet(me.name)}</h1>
      </div>
      <div className="sec lc-arc-sec rv"><Arc n={d.weeks.length} cur={d.arcCur()} labels={labels} special={special} to={`/luca/${slug}/calendar?v=all`} /></div>
      <div className="sec sec--hero lc-next"><NextCard /></div>
      {showReveal ? (
        <div className="sec"><button type="button" className="lc-clanout rv" onClick={() => { sound.play("tap"); reveal(); }}><span className="eyebrow">Clans are out</span><b>Meet your Clan</b><span>Tap to meet yours</span><Icon name="arrow-right" /></button></div>
      ) : null}
      {announcements.map((a) => (
        <div className="sec" key={a.id}><div className="lc-note rv"><b>{a.title}</b>{a.body ? <> {a.body}</> : null}{a.link_url ? <> <a className="linkish" href={a.link_url} target="_blank" rel="noopener noreferrer">Open</a></> : null}</div></div>
      ))}
      <div className="sec"><Standing /></div>
      {!d.started ? <Setup /> : <ThisWeek />}
      <ClanPulse />
      {!d.started && !room.clans_open ? (
        <div className="sec"><div className="lc-mystery rv">
          <div className="lc-my-row">{Array.from({ length: d.p.clan_size ?? 6 }, (_, k) => <span key={k} style={{ ["--i" as string]: k } as CSSProperties}>?</span>)}</div>
          <b>Your Clan drops on day one</b><span>A small group, together for the whole cohort. Your coins add up to one Clan score.</span>
        </div></div>
      ) : null}
      <SprintMini />
      {latest && !d.alumni ? <div className="sec"><SecHead title="Latest recording" link="All" to={`/luca/${slug}/recordings`} /><RecCard s={latest} d={d} cls="rv" /></div> : null}
      {upcoming.length && !d.alumni ? <div className="sec"><SecHead title="Coming up" link="Calendar" to={`/luca/${slug}/calendar`} /><div className="srs rv">{upcoming.map((s) => <SessRow key={s.id} s={s} d={d} />)}</div></div> : null}
      {d.alumni ? (
        <div className="sec">
          <SecHead title="What's yours to keep" />
          <div className="tw rv">
            <Link className="tw-r" to={`/luca/${slug}/recordings`}><Icon name="play-circle" /><span className="tw-b"><b>Every recording</b><span>{d.recordings().length} sessions, with chapters and your notes</span></span><Icon name="caret-right" /></Link>
            <Link className="tw-r" to={`/luca/${slug}/work`}><Icon name="note-pencil" /><span className="tw-b"><b>Your body of work</b><span>Every verdict and every link</span></span><Icon name="caret-right" /></Link>
          </div>
          <div className="lc-invite rv"><b>Know someone who should be in the next cohort?</b><span>Send them the program page.</span>
            <button className="btn btn-sm" type="button" onClick={async () => { const url = `${window.location.origin}/luca/${slug}/program`; try { if (navigator.share) await navigator.share({ url }); else { await navigator.clipboard.writeText(url); ui.toast("Link copied", "link-simple"); } } catch { /* cancelled */ } }}><Icon name="share-network" />Share</button>
          </div>
        </div>
      ) : null}
    </Page>
  );
}
