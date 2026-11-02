import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, CalendarDays, Check, ChevronLeft, ChevronRight, Clock, Lock, PlayCircle, Smartphone, Video } from "lucide-react";
import { toast } from "sonner";
import { tapTick } from "@/lib/haptics";
import { sessionTimeState } from "@/lib/room";
import type { ApplicantStageView } from "@/hooks/useApplicantStage";
import {
  buildAgenda, downloadIcs, endOf, joinWindow, pickLoud, recordingHref, sessionPath, sessionWho, zoomLinkFor,
  type AgendaRow, type BuyerHome as BuyerData, type CohortItem, type CourseItem, type LiveWorkshopItem, type Loud, type OwnedThing, type Session,
} from "./buyer";
import { FORMAT_COPY, TIERS, formatFacts, type StageCatalog, type Tier } from "./catalog";
import { ProductCard } from "./sections";
import StageApplicantCard from "./ApplicantCard";

/*
 * Home for someone who owns something: the round-4 mockup
 * (15_LMS_Experience_Lab/home.html, every persona but "Nothing bought yet").
 * In the order people ask: what do I do next (the one loud card, only when
 * something of theirs is on today), where is each thing I own (one card per
 * thing), what is coming up (the next 7 days), then the catalogue, quietly.
 */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const IST = 5.5 * 36e5;
const ist = (ms: number) => new Date(ms + IST);
const dayKey = (ms: number) => ist(ms).toISOString().slice(0, 10);
const time = (ms: number) => { const x = ist(ms); const h = x.getUTCHours(), m = x.getUTCMinutes(); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`; };
const short = (ms: number) => { const x = ist(ms); return `${DAYS[x.getUTCDay()].slice(0, 3)}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()].slice(0, 3)}`; };
const long = (ms: number) => { const x = ist(ms); return `${DAYS[x.getUTCDay()]}, ${x.getUTCDate()} ${MONTHS[x.getUTCMonth()]}`; };
const relDay = (ms: number, now: number) => (dayKey(ms) === dayKey(now) ? "today" : dayKey(ms) === dayKey(now + 864e5) ? "tomorrow" : short(ms));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const pad2 = (x: number) => String(x).padStart(2, "0");
const TIER_WORD: Record<string, string> = { cohort: "Live cohort", liveworkshop: "Workshop", masterclass: "Masterclass", workshop: "Workshop", course: "Course" };

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const iv = window.setInterval(() => setNow(Date.now()), ms); return () => window.clearInterval(iv); }, [ms]);
  return now;
}

async function join(s: Session) {
  void tapTick();
  const link = await zoomLinkFor(s);
  if (link) window.open(link, "_blank", "noopener,noreferrer");
  else toast(`The Zoom link opens at ${time(joinWindow(s).opens)}.`);
}

const hours = (mins: number) => (mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? "" : "s"}` : `${mins} min`);

function sessionMeta(l: Loud) {
  if (l.item.kind === "cohort") {
    const wk = l.item.weeks.find((w) => w.id === l.s.week_id);
    return <>{l.item.batchName}{wk && <> <span className="sep">·</span> Week {wk.week_number}</>} <span className="sep">·</span> Zoom</>;
  }
  const mins = l.s.duration_minutes ?? 60;
  // A live session on a course (a masterclass Q&A): the course's name.
  const what = l.item.kind === "liveworkshop" ? "Workshop" : l.item.courseTitle;
  return <>{what} <span className="sep">·</span> {hours(mins)} <span className="sep">·</span> Zoom</>;
}

function NextCard({ loud }: { loud: Loud }) {
  const now = useNow(1000);
  const s = loud.s, i = loud.item;
  const start = Date.parse(s.scheduled_at), end = endOf(s);
  const state = sessionTimeState(s, now);
  const w = joinWindow(s);
  const zoomOk = now >= w.opens && now < w.closes && s.status !== "cancelled";
  const recording = state === "recorded" ? recordingHref(s.recording_url) : null;
  const pic = i.kind === "masterclass" || i.kind === "workshop" || i.kind === "course" ? i.art : i.offering.thumbnail_url;
  const art = <div className="next-art">{pic && <img src={pic} alt="" />}</div>;
  const title = <h2 className="next-t">{s.title}</h2>;
  const joinLabel = i.kind === "cohort" ? "Join class" : i.kind === "liveworkshop" ? "Join workshop" : "Join session";

  if (state === "live") {
    return (
      <section className="next next--live" aria-label="Live now">
        <span className="live-pill"><i className="pulse" />LIVE</span>{art}
        <div className="next-body">{title}<div className="next-m">{sessionMeta(loud)}</div>
          <div className="next-m">Started {Math.max(1, Math.round((now - start) / 6e4))} min ago · ends {time(end)}</div></div>
        <div className="next-acts"><button className="btn btn--block" type="button" onClick={() => void join(s)}><Video className="ic" />{joinLabel}</button></div>
      </section>
    );
  }
  if (state === "ended" || state === "recorded") {
    return (
      <section className="next next--done" aria-label="Today's class">
        <span className="next-pill"><Check className="ic" />Ended at {time(end)}</span>{art}
        <div className="next-body">{title}<div className="next-m">{sessionMeta(loud)}</div>
          <div className="next-m dim">{recording ? "The recording is ready." : "The recording shows up here once it is uploaded."}</div></div>
        <div className="next-acts">
          {recording
            ? <a className="btn btn--block" href={recording} target="_blank" rel="noopener noreferrer" onClick={() => void tapTick()}><PlayCircle className="ic" />Watch the recording</a>
            : zoomOk ? <button className="btn btn--block btn--secondary" type="button" onClick={() => void join(s)}><Video className="ic" />Rejoin on Zoom</button> : null}
        </div>
      </section>
    );
  }
  const left = Math.max(0, Math.floor((start - now) / 1000));
  return (
    <section className="next next--soon" aria-label="Up next">
      <span className="next-pill"><Clock className="ic" />{cap(relDay(start, now))}, {time(start)}</span>{art}
      <div className="next-body">
        <div className="count" aria-label="Time until it starts">
          <span>{pad2(Math.floor(left / 3600))}</span><small>h</small><span>{pad2(Math.floor((left % 3600) / 60))}</span><small>m</small><span>{pad2(left % 60)}</span><small>s</small>
        </div>
        {title}<div className="next-m">{sessionMeta(loud)}</div>
      </div>
      <div className="next-acts">
        {zoomOk
          ? <button className="btn btn--block" type="button" onClick={() => void join(s)}><Video className="ic" />{joinLabel}</button>
          : <>
              <button className="btn btn--block" type="button" onClick={() => { void tapTick(); downloadIcs(s, i.kind === "cohort" ? i.batchName : i.kind === "liveworkshop" ? i.offering.title : i.courseTitle); }}><CalendarDays className="ic" />Add to calendar</button>
              <span className="next-unlock"><Lock className="ic" />Zoom link opens at {time(w.opens)}</span>
            </>}
      </div>
    </section>
  );
}

export interface CardView { key: string; fmt: React.ReactNode; title: string; img: string | null; prog: React.ReactNode; next: React.ReactNode; where: React.ReactNode | null; go: string; path: string; side: React.ReactNode }

export function cardView(i: OwnedThing, now: number): CardView {
  const img = i.offering.thumbnail_url;
  if (i.kind === "cohort") {
    const pct = i.week && i.weekCount ? Math.max(4, Math.round((i.week.week_number / i.weekCount) * 100)) : 4;
    const nextAt = i.next ? Date.parse(i.next.scheduled_at) : 0;
    return {
      key: i.offering.id, img, title: i.offering.title, path: i.roomPath, go: "Open cohort",
      fmt: <><span>Live cohort</span><b>· {i.batchName}</b></>,
      prog: i.week ? <div className="prog"><div className="prog-bar"><i style={{ width: `${pct}%` }} /></div><span><b>Week {i.week.week_number}</b> of {i.weekCount}</span></div> : null,
      next: i.live
        ? <><i className="pulse" /><span><span className="live-t">Live now</span> <span className="dim">· {i.live.title}</span></span></>
        : i.next
          ? <><CalendarDays className="ic" /><span>Next class {relDay(nextAt, now)}, {time(nextAt)}{i.due?.assignment_due_at && <span className="dim"> · assignment due {short(Date.parse(i.due.assignment_due_at))}</span>}</span></>
          : <><Check className="ic" /><span>No more classes scheduled</span></>,
      where: <><Video className="ic" /><span>Classes on Zoom</span></>,
      side: i.live ? <><span className="live-t"><i className="pulse" />LIVE</span>Live cohort</> : <>Live cohort · {i.batchName}</>,
    };
  }
  if (i.kind === "liveworkshop") {
    const d = Date.parse(i.session.scheduled_at);
    const live = sessionTimeState(i.session, now) === "live";
    const mins = i.session.duration_minutes ?? 60;
    return {
      key: i.offering.id, img, title: i.session.title || i.offering.title, path: i.path, go: "Open workshop",
      fmt: <><span>Workshop</span><b>· live</b></>,
      prog: <div className="prog"><CalendarDays className="ic" /><span><b>{cap(relDay(d, now))}</b>, {time(d)}</span></div>,
      next: live ? <><i className="pulse" /><span><span className="live-t">Live now</span></span></> : <><Clock className="ic" /><span>One live session, {hours(mins)}</span></>,
      where: <><Video className="ic" /><span>On Zoom</span></>,
      side: live ? <><span className="live-t"><i className="pulse" />LIVE</span>Workshop</> : <>Workshop · {short(d)}</>,
    };
  }
  const c = i as CourseItem;
  const unit = c.kind === "workshop" ? "video" : "lesson";
  const pct = Math.max(c.done ? 4 : 0, Math.round((c.done / Math.max(1, c.total)) * 100));
  return {
    // One card per course: a bundle's courses share the offering id.
    key: `${c.offering.id}:${c.courseId ?? ""}`, img: c.art, title: c.courseTitle,
    path: c.next ? `/chapters/${c.next.id}` : c.courseId ? `/courses/${c.courseId}` : `/p/${c.offering.slug}`,
    go: c.next ? (c.started ? `Resume ${unit} ${c.nextIndex}` : `Start ${unit} 1`) : "Watch again",
    fmt: c.partOf ? <><span>{TIER_WORD[c.kind]}</span><b className="oc-from">· {c.partOf}</b></> : <span>{TIER_WORD[c.kind]}</span>,
    prog: <div className="prog"><div className="prog-bar"><i style={{ width: `${pct}%` }} /></div><span><b>{c.done}</b> of {c.total} {unit}s</span></div>,
    next: c.next
      ? <><PlayCircle className="ic" /><span>{unit === "lesson" ? "Lesson" : "Video"} {c.nextIndex}: {c.next.title}{c.position > 0 && <span className="dim"> · resume at {mmss(c.position)}</span>}</span></>
      : <><Check className="ic" /><span>All {c.total} {unit}s watched</span></>,
    where: <><Smartphone className="ic" /><span>{c.videos} video{c.videos === 1 ? "" : "s"}{c.others ? ` · ${c.others} file${c.others === 1 ? "" : "s"}` : ""}</span></>,
    side: <>{TIER_WORD[c.kind]} · {c.done} of {c.total}</>,
  };
}

/** One thing owned: format, name, where you are, what is next, where it happens, the way in. */
export function OwnCard({ o, onOpen }: { o: CardView; onOpen: (path: string) => void }) {
  return (
    <button className="oc" type="button" onClick={() => onOpen(o.path)} aria-label={`${o.title}. ${o.go}`}>
      <span className="oc-art">{o.img && <img src={o.img} alt="" loading="lazy" />}</span>
      <span className="oc-head"><span className="fmt">{o.fmt}</span><span className="oc-t">{o.title}</span></span>
      <span className="oc-body">
        {o.prog}
        <span className="oc-next">{o.next}</span>
        <span className="oc-foot">{o.where ? <span className="oc-where">{o.where}</span> : <span />}<span className="oc-go">{o.go}<ChevronRight className="ic" /></span></span>
      </span>
    </button>
  );
}

function OwnCards({ items, now, onOpen }: { items: OwnedThing[]; now: number; onOpen: (path: string) => void }) {
  const cards = items.map((i) => cardView(i, now));
  return (
    <section className="sec" aria-labelledby="ownH">
      <div className="sec-head">
        <h2 className="sec-h" id="ownH">My learning</h2>
        {cards.length > 4 && <button className="sec-link" type="button" onClick={() => onOpen("/learn")}>See all</button>}
      </div>
      <div className="own">{cards.slice(0, 4).map((o) => <OwnCard key={o.key} o={o} onOpen={onOpen} />)}</div>
    </section>
  );
}

/** Agenda rows (classes and assignments due), grouped by day. Shared with My learning's Schedule. */
export function AgendaList({ rows, now, onOpen }: { rows: AgendaRow[]; now: number; onOpen: (path: string) => void }) {
  let prev = "";
  return (
    <div className="agenda">
      {rows.map((x) => {
        const k = dayKey(x.at), same = k === prev;
        prev = k;
        const today = k === dayKey(now);
        const who = sessionWho(x.item);
        const path = sessionPath(x.item);
        return (
          <button className={`ag-row${same ? " same-day" : ""}`} type="button" key={x.key} onClick={() => onOpen(path)}>
            <span className={`ag-day${today ? " is-today" : ""}`}>{!same && <><span className="dl">{today ? "Today" : DAYS[ist(x.at).getUTCDay()].slice(0, 3)}</span><span className="dn">{ist(x.at).getUTCDate()}</span></>}</span>
            <span className={`ag-bar t-${x.kind}`} />
            <span className="ag-main"><span className="ag-t">{x.title}</span><span className="ag-m"><b>{time(x.at)}</b><span>·</span><span>{x.kind === "due" ? "Assignment due" : "On Zoom"} · {who}</span></span></span>
          </button>
        );
      })}
    </div>
  );
}

function Week({ agenda, now, sfx, onOpen }: { agenda: AgendaRow[]; now: number; sfx: string; onOpen: (path: string) => void }) {
  if (!agenda.length) return null;
  const days = Array.from({ length: 7 }, (_, k) => now + k * 864e5);
  return (
    <section className="sec wk" aria-labelledby={`wkH${sfx}`}>
      <div className="sec-head"><h2 className="sec-h" id={`wkH${sfx}`}>Next 7 days</h2><button className="sec-link" type="button" onClick={() => onOpen("/learn?seg=live")}>Schedule</button></div>
      <div className="wk-strip" aria-hidden="true">
        {days.map((d, k) => (
          <div className={`wk-d${k === 0 ? " is-today" : ""}`} key={k}>
            <span className="dl">{DAYS[ist(d).getUTCDay()].slice(0, 3)}</span>
            <span className="dn">{ist(d).getUTCDate()}</span>
            <span className="ticks">{agenda.filter((x) => dayKey(x.at) === dayKey(d)).map((x) => <i key={x.key} className={`t-${x.kind}`} />)}</span>
          </div>
        ))}
      </div>
      <AgendaList rows={agenda} now={now} onOpen={onOpen} />
    </section>
  );
}

function ExploreMore({ catalog, data, onOpen }: { catalog: StageCatalog; data: BuyerData; onOpen: (path: string) => void }) {
  const fs = TIERS.map((t) => {
    const f = catalog.formats.find((x) => x.tier === t)!;
    return { ...f, avail: f.list.filter((x) => !x.owned && !(data.inCohort && t === "live_cohort")) };
  }).filter((f) => f.avail.length);
  const ownsAny = (t: Tier) => data.items.some((i) => (t === "live_cohort" && i.kind === "cohort") || (t === "masterclass" && i.kind === "masterclass") || (t === "workshop" && (i.kind === "workshop" || i.kind === "liveworkshop")));
  const [tier, setTier] = useState<Tier | null>(null);
  const cur = fs.find((f) => f.tier === tier) ?? fs.find((f) => !ownsAny(f.tier)) ?? fs[0];
  const [railRef, setRailRef] = useState<HTMLDivElement | null>(null);
  if (!cur) return null;
  const C = FORMAT_COPY[cur.tier];
  const body = cur.tier === "live_cohort" && data.items.some((i) => i.kind === "masterclass") ? "The step after a masterclass: make your own work, with mentors reviewing it." : C.body;
  const scroll = (dir: number) => railRef?.scrollBy({ left: dir * railRef.clientWidth * 0.9, behavior: "smooth" });
  return (
    <section className="sec" aria-labelledby="exH">
      <div className="sec-head">
        <h2 className="sec-h" id="exH">Explore more</h2>
        <span className="sec-tools">
          {cur.avail.length > 3 && <span className="rail-nav"><button type="button" onClick={() => scroll(-1)} aria-label="Scroll left"><ChevronLeft className="ic" /></button><button type="button" onClick={() => scroll(1)} aria-label="Scroll right"><ChevronRight className="ic" /></button></span>}
          <button className="sec-link" type="button" onClick={() => onOpen("/explore")}>See the full catalogue</button>
        </span>
      </div>
      {fs.length > 1 && (
        <div className="ex-tabs" role="tablist">
          {fs.map((f) => (
            <button key={f.tier} type="button" role="tab" aria-selected={f.tier === cur.tier} className={f.tier === cur.tier ? "is-on" : undefined} onClick={() => { void tapTick(); setTier(f.tier); }}>
              {FORMAT_COPY[f.tier].plural}<span>{f.avail.length}</span>
            </button>
          ))}
        </div>
      )}
      <div className="ex-intro">
        <div className="ex-copy"><h3 className="fm-line">{C.line}</h3><p className="fm-body">{body}</p></div>
        <ul className="fm-facts">{formatFacts(cur).filter((t) => !/^\d+ (masterclasses|programs|workshops?)$/.test(t)).map((t) => <li key={t}>{t}</li>)}</ul>
      </div>
      <div ref={setRailRef} className={`pds pds--${cur.tier} pds--rail`}>{cur.avail.map((x) => <ProductCard key={x.offering.id} x={x} />)}</div>
      <button className="ex-all" type="button" onClick={() => onOpen(`/explore?tier=${cur.tier}`)}>See all {C.plural.toLowerCase()}<ArrowRight className="ic" /></button>
    </section>
  );
}

export default function BuyerHome({ data, catalog, firstName, applicant }: { data: BuyerData; catalog: StageCatalog | null; firstName: string; applicant?: ApplicantStageView | null }) {
  const navigate = useNavigate();
  const now = useNow(30_000);
  const loud = useMemo(() => pickLoud(data.items, now), [data.items, now]);
  const agenda = useMemo(() => buildAgenda(data.items, now, loud), [data.items, now, loud]);
  const open = (path: string) => { void tapTick(); navigate(path); };
  const h = ist(now).getUTCHours();
  const hello = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const hasRail = agenda.length > 0;
  return (
    <div className="hm-inner">
      <div className="hm-hello">
        <span className="eyebrow">{long(now)}</span>
        <h1 className="hm-h1">{firstName ? `${hello}, ${firstName}` : hello}</h1>
      </div>
      <div className={`hm-grid${hasRail ? " has-rail" : ""}`}>
        <div className="hm-main">
          {loud && <NextCard loud={loud} />}
          {applicant && <StageApplicantCard view={applicant} />}
          <OwnCards items={data.items} now={now} onOpen={open} />
          {hasRail && <div className="only-narrow-week"><Week agenda={agenda} now={now} sfx="p" onOpen={open} /></div>}
          {catalog && <ExploreMore catalog={catalog} data={data} onOpen={open} />}
        </div>
        {hasRail && <aside className="hm-rail"><Week agenda={agenda} now={now} sfx="d" onOpen={open} /></aside>}
      </div>
    </div>
  );
}

export type { CohortItem, LiveWorkshopItem };
