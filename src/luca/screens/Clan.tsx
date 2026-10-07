import type { CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Av, CountUp } from "../components/ui";
import { DemoBar, Page, useLuca } from "../components/shell";
import { useFeedbackSheet, useNudge } from "../components/bits";
import { firstName, num } from "../lib/format";
import { sound } from "../lib/sound";
import * as T from "../lib/time";
import type { Derived } from "../lib/derive";

const TABS: [string, string][] = [["clan", "Clan"], ["board", "Leaderboard"], ["coins", "Coins"]];

function Mystery({ d, board }: { d: Derived; board?: boolean }) {
  const first = d.sessions[0];
  if (board) {
    const start = d.members().find((m) => m.id === d.me?.id)?.coins ?? d.me?.coins ?? 0;
    return (
      <div className="lc-mystery lc-mystery--big rv">
        <div className="lc-big-n">{num(start)}</div>
        <b>Everyone starts on {num(start)}</b>
        <span>The leaderboard opens {first ? `at ${first.title}` : "on day one"}. Coins come from showing up, shipping on time and helping your Clan.</span>
      </div>
    );
  }
  return (
    <div className="lc-mystery lc-mystery--big rv">
      <div className="lc-my-row">{Array.from({ length: d.p.clan_size ?? 6 }, (_, i) => <span key={i} style={{ ["--i" as string]: i } as CSSProperties}>?</span>)}</div>
      <b>Your Clan drops {first ? `at ${first.title}` : "on day one"}</b>
      <span>{first ? `${T.day(first.starts_at)}, ${T.time(first.starts_at)}. ` : ""}A small group, together for the whole cohort.</span>
    </div>
  );
}

function ClanBody() {
  const { d } = useLuca();
  const nudge = useNudge();
  const fb = useFeedbackSheet();
  const clan = d.myClan();
  if (!clan) return <Mystery d={d} />;
  const cs = d.clanStatus();
  const ms = d.clanMembers();
  const clans = d.clans();
  const max = Math.max(1, clans[0]?.score ?? 1);
  const feed = d.clanFeed();
  const quiet = !!d.live() || d.alumni;
  return (
    <>
      <article className="hs lc-clanc rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="users-three" /><span>Your Clan · #{d.clanRank()} of {clans.length}</span></span></div>
        <div className="hs-title hs-title--big">{clan.name}</div>
        <div className="hs-meta">{num(clan.score)} coins between the {ms.length} of you{cs ? ` · ${ms.filter((m) => cs.done(m.id)).length} of ${ms.length} ${cs.label.toLowerCase()}` : ""}</div>
        <div className="lc-clan-avs">{ms.map((m) => <Av key={m.id} p={m} />)}</div>
      </div></article>
      <div className="cms rv">
        {ms.map((m) => {
          const me = m.id === d.me?.id;
          const done = cs?.done(m.id);
          const f = feed.find((x) => x.member_id === m.id);
          const can = cs && !done && !me && !quiet;
          return (
            <div key={m.id} className={`cm${me ? " is-me" : ""}`}>
              <Av p={m} cls="lc-av--md" />
              <span className="cm-b"><b>{me ? "You" : m.name}</b><span>{m.niche ?? ""}</span>
                {cs ? <em className={done ? "is-done" : ""}>{done ? <><Icon name="check" />{cs.label}</> : "Not yet"}</em> : null}
              </span>
              <span className="cm-r"><b>{num(m.coins)}</b>
                {can ? <button className="btn btn-sm btn-secondary" type="button" disabled={d.nudged(m.id)} onClick={() => nudge(m.id)}>{d.nudged(m.id) ? "Nudged" : "Nudge"}</button>
                  : f ? <button className="btn btn-sm" type="button" onClick={() => fb(f.member_id, f.ref, f.title, f.url)}>Feedback</button> : null}
              </span>
            </div>
          );
        })}
      </div>
      {feed.length ? (
        <>
          <div className="sec-head rv mt-5"><div><h2 className="h2">Needs your eyes</h2><p className="sec-sub">+{d.p.coin_rules?.feedback?.value ?? 25} coins for each piece of feedback</p></div></div>
          <div className="fbs rv">
            {feed.map((f) => {
              const m = d.member(f.member_id);
              return (
                <button key={f.ref} type="button" className="fbr" onClick={() => fb(f.member_id, f.ref, f.title, f.url)}>
                  <span className="fbr-art">{m ? <Av p={m} /> : null}</span>
                  <span className="fbr-b"><em>{firstName(m?.name)}</em><b>{f.title}</b></span>
                  <span className="fbr-c">+{d.p.coin_rules?.feedback?.value ?? 25}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
      {(d.r.feedback_received ?? []).length ? (
        <>
          <div className="sec-head rv mt-5"><div><h2 className="h2">Feedback for you</h2><p className="sec-sub">From your Clan</p></div></div>
          <div className="ch rv">
            {(d.r.feedback_received ?? []).slice(0, 8).map((f, i) => {
              const m = d.member(f.from);
              return <div key={i} className="ch-r"><span><b>{firstName(m?.name)}: {[...f.chips, f.body].filter(Boolean).join(" · ")}</b><em>{T.day(f.at)}, {T.time(f.at)}</em></span></div>;
            })}
          </div>
        </>
      ) : null}
      <div className="sec-head rv mt-5"><div><h2 className="h2">All {clans.length} Clans</h2><p className="sec-sub">A Clan&apos;s score is its members&apos; coins, added up.</p></div></div>
      <div className="clbs rv">
        {clans.map((c, i) => (
          <div key={c.id} className={`clb${c.id === clan.id ? " is-me" : ""}`}>
            <span className="clb-r">{i + 1}</span><span className="clb-n">{c.name}</span>
            <span className="clb-bar"><i style={{ width: `${Math.round((c.score / max) * 100)}%` }} /></span><b>{num(c.score)}</b>
          </div>
        ))}
      </div>
    </>
  );
}

function Mv({ m }: { m: number }) {
  return m > 0 ? <span className="mv mv--up"><Icon name="arrow-up" />{m}</span> : m < 0 ? <span className="mv mv--dn"><Icon name="arrow-down" />{-m}</span> : <span className="mv"><Icon name="minus" /></span>;
}

function BoardBody({ week }: { week: boolean }) {
  const { d } = useLuca();
  const [, setQ] = useSearchParams();
  const b = [...d.members()];
  if (week) b.sort((x, y) => y.week - x.week || (x.id === d.me?.id ? -1 : 1));
  const val = (c: number, w: number) => num(week ? w : c);
  const meI = b.findIndex((m) => m.id === d.me?.id);
  const me = b[meI];
  const ahead = meI > 0 ? b[meI - 1] : null;
  const gap = ahead && me ? (week ? ahead.week - me.week : ahead.coins - me.coins) + 10 : 0;
  const pod = b.slice(0, 3);
  const clan = d.myClan();
  const onTime = d.p.coin_rules?.submit_on_time?.value ?? 150;
  return (
    <>
      <div className="seg seg--sm lb-when rv">
        <button type="button" className={week ? "" : "is-on"} onClick={() => { setQ({ tab: "board" }, { replace: true }); sound.play("toggle"); }}>All time</button>
        <button type="button" className={week ? "is-on" : ""} onClick={() => { setQ({ tab: "board", when: "week" }, { replace: true }); sound.play("toggle"); }}>This week</button>
      </div>
      {me ? (
        <div className="lb-you rv">
          <span className="lb-you-r">#{meI + 1}</span>
          <span className="lb-you-b"><b>You · {val(me.coins, me.week)} coins</b><span>{ahead ? `${num(gap)} to pass ${firstName(ahead.name)}. An on-time submit is ${onTime}.` : "Top of the board. Stay there."}</span></span>
          <Mv m={week ? 0 : d.move(me.id)} />
        </div>
      ) : null}
      <div className="lb-pod rv">
        {[1, 0, 2].map((i) => {
          const p = pod[i];
          if (!p) return null;
          const isMe = p.id === d.me?.id;
          return <div key={p.id} className={`lb-p lb-p--${i + 1}${isMe ? " is-me" : ""}`}><Av p={p} /><b>{isMe ? "You" : firstName(p.name)}</b><span>{val(p.coins, p.week)}</span><i>{i + 1}</i></div>;
        })}
      </div>
      <ol className="lb rv">
        {b.slice(3).map((p, i) => {
          const isMe = p.id === d.me?.id;
          const mate = !isMe && clan && p.clan_id === clan.id;
          return (
            <li key={p.id} className={`${isMe ? "is-me" : ""}${mate ? " is-clan" : ""}`}>
              <span className="lb-r">{i + 4}</span><Av p={p} />
              <span className="lb-n">{isMe ? "You" : p.name}{mate ? <em>{clan!.name}</em> : null}</span>
              <b>{val(p.coins, p.week)}</b>{week ? null : <Mv m={d.move(p.id)} />}
            </li>
          );
        })}
      </ol>
      <p className="fine rv mt-3">Visible to everyone in {d.p.cohort_label}. &ldquo;This week&rdquo; resets each week, so a slow start never locks you out.</p>
    </>
  );
}

function CoinsBody() {
  const { d } = useLuca();
  const me = d.me!;
  const mine = d.members().find((m) => m.id === me.id);
  const rules = Object.entries(d.p.coin_rules ?? {}).filter(([, r]) => r.value > 0 && r.label);
  const hist = (d.r.ledger ?? []).filter((h) => h.amount !== 0);
  return (
    <>
      <div className="cn-top rv"><span className="eyebrow">Your coins</span><CountUp value={me.coins} /><span>{d.boardOpen() ? `#${d.rank()} of ${d.members().length} · +${num(mine?.week ?? 0)} this week` : "Everyone starts here"}</span></div>
      <div className="sec-head rv mt-5"><div><h2 className="h2">How to earn</h2><p className="sec-sub">Set by your cohort team.</p></div></div>
      <div className="cr rv">{rules.map(([k, r]) => <div key={k} className="cr-r"><span>{r.label}</span><b>+{num(r.value)}</b></div>)}</div>
      <div className="sec-head rv mt-5"><div><h2 className="h2">History</h2></div></div>
      {hist.length ? (
        <div className="ch rv">
          {hist.slice(0, 40).map((h, i) => <div key={i} className="ch-r"><span><b>{h.reason}</b><em>{T.day(h.at)}, {T.time(h.at)}</em></span><b>{h.amount > 0 ? "+" : ""}{num(h.amount)}</b></div>)}
        </div>
      ) : <p className="fine rv">Nothing yet. Your first coins come from showing up.</p>}
    </>
  );
}

/** Your Clan, the cohort leaderboard and your coins. */
export default function Clan() {
  const { d } = useLuca();
  const [q, setQ] = useSearchParams();
  const tab = TABS.some((t) => t[0] === q.get("tab")) ? (q.get("tab") as string) : "clan";
  const pre = !d.boardOpen();
  return (
    <Page cls="page--clan" tabbar>
      <DemoBar />
      <header className="appbar appbar--title rv">
        <h1 className="h1">{tab === "board" ? "Leaderboard" : tab === "coins" ? "Coins" : "Clan"}</h1>
        <span className="ab-actions"><button className="lc-pill" type="button" onClick={() => setQ({ tab: "coins" }, { replace: true })}><Icon name="coin-vertical-fill" /><CountUp value={d.me?.coins ?? 0} /></button></span>
      </header>
      <div className="sec sec--hero">
        <div className="seg rv" role="tablist">
          {TABS.map(([k, l]) => <button key={k} type="button" role="tab" aria-selected={k === tab} className={k === tab ? "is-on" : ""} onClick={() => { setQ(k === "clan" ? {} : { tab: k }, { replace: true }); sound.play("toggle"); }}>{l}</button>)}
        </div>
      </div>
      <div className="sec">
        {tab === "clan" ? (d.r.clans_open ? <ClanBody /> : <Mystery d={d} />)
          : tab === "board" ? (pre ? <Mystery d={d} board /> : <BoardBody week={q.get("when") === "week"} />)
          : <CoinsBody />}
      </div>
    </Page>
  );
}
