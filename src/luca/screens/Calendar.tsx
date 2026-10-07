import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Arc } from "../components/ui";
import { DemoBar, Page, TitleBar, useLuca } from "../components/shell";
import { useSyncSheet } from "../components/bits";
import { KIND_LABEL, type Derived } from "../lib/derive";
import { sound } from "../lib/sound";
import * as T from "../lib/time";

interface Ev { at: Date; t: string; k: string; cls: "sess" | "live" | "due" | "pw"; to: string; sub: string }

const STATE_WORD: Record<string, string> = {
  ship: "Shipped", fix: "Fix asked", pending: "In, waiting for review", due: "Open", soon: "Opens soon", late: "Late", fixed: "Fixed, in review", hold: "On hold",
};

/** Weeks start on the weekday of the cohort's first week (Saturday in the mockup). */
function anchorOf(d: Date, startWd: number): Date {
  let x = T.sod(d);
  for (let i = 0; i < 7 && T.parts(x).wd !== startWd; i++) x = T.sod(T.add(x, -1));
  return x;
}

function dayEvents(d: Derived, day: Date): Ev[] {
  const ev: Ev[] = [];
  d.sessions.filter((s) => T.same(s.starts_at, day)).forEach((s) => ev.push({
    at: new Date(s.starts_at), t: s.title, k: KIND_LABEL[s.kind] ?? "Session", cls: d.sState(s) === "live" ? "live" : "sess",
    to: `session/${s.id}`, sub: `${T.range(s.starts_at, s.ends_at)} · ${d.mentorNames(s.mentor_ids)}`,
  }));
  d.assignments.filter((a) => T.same(a.due_at, day)).forEach((a) => {
    const st = d.aState(a);
    ev.push({ at: new Date(a.due_at), t: `Submit: ${a.title}`, k: "Deadline", cls: "due", to: `assign/${a.id}`, sub: `${T.time(a.due_at)} · ${STATE_WORD[st.v] ?? ""}` });
  });
  d.weeks.forEach((w) => {
    if (!d.hasPrewatch(w.n)) return;
    const pd = d.pwDue(w.n);
    if (pd && T.same(pd, day)) ev.push({ at: pd, t: `Pre-watch closes: ${w.prewatch?.title ?? w.module}`, k: "Pre-watch", cls: "pw", to: `prewatch/${w.n}`, sub: `${T.time(pd)} · ${d.pwDone(w.n) ? "Done" : "Keeps your hot seat"}` });
  });
  (d.r.submissions ?? []).forEach((s) => {
    if (s.verdict === "fix" && s.fix_due_at && T.same(s.fix_due_at, day)) {
      const a = d.asg(s.assignment_id);
      if (a) ev.push({ at: new Date(s.fix_due_at), t: `Fix due: ${a.title}`, k: "Fix", cls: "due", to: `assign/${a.id}`, sub: T.time(s.fix_due_at) });
    }
  });
  const start = d.sprintStart;
  if (start && d.p.features?.sprint) {
    const sd = T.diffDays(day, start) + 1;
    if (sd >= 1 && sd <= d.sprintDays) {
      const posted = !!d.sprintPost(sd);
      const past = T.diffDays(day, T.now()) < 0;
      ev.push({ at: new Date(T.sod(day).getTime() + T.DAYMS - 6e4), t: `Sprint day ${sd} post`, k: "Sprint", cls: "due", to: "sprint", sub: `Before 11:59 PM · ${posted ? "Posted" : past ? "Missed" : `+${d.p.coin_rules?.sprint_post?.value ?? 250}`}` });
    }
  }
  return ev.sort((a, b) => a.at.getTime() - b.at.getTime());
}

function weekLabel(d: Derived, start: Date): string {
  const end = T.add(start, 7);
  const ss = d.sessions.filter((s) => Date.parse(s.starts_at) >= start.getTime() && Date.parse(s.starts_at) < end.getTime());
  if (ss.length) {
    const row = d.weekRow(ss[0].week_n);
    return row?.is_demo_week ? "Demo Day weekend" : `Week ${ss[0].week_n} · ${row?.module ?? ""}`;
  }
  const br = d.breaks().find((b) => b.start < end && b.end >= start);
  if (br) return br.label.split(".")[0];
  if (d.p.starts_at && start.getTime() < Date.parse(d.p.starts_at)) return "Before the start";
  return "After Demo Day";
}

export default function Calendar() {
  const { slug, d } = useLuca();
  const [q, setQ] = useSearchParams();
  const view = q.get("v") === "all" ? "all" : "week";
  const sync = useSyncSheet();
  const startWd = d.weeks[0]?.starts_on ? T.parts(T.dateOnly(d.weeks[0].starts_on)).wd : 6;
  const home = d.week() < 0 && d.p.starts_at ? new Date(d.p.starts_at) : T.now();
  const [anchor, setAnchor] = useState(() => anchorOf(home, startWd).getTime());
  const [sel, setSel] = useState(() => T.sod(home).getTime());

  const first = d.sessions[0] ? anchorOf(new Date(d.sessions[0].starts_at), startWd).getTime() - 7 * T.DAYMS : anchor;
  const lastS = d.sessions[d.sessions.length - 1];
  const last = lastS ? anchorOf(new Date(lastS.starts_at), startWd).getTime() + 7 * T.DAYMS : anchor;

  const start = new Date(anchor);
  const days = Array.from({ length: 7 }, (_, i) => T.sod(new Date(start.getTime() + i * T.DAYMS + 12 * T.HOUR)));
  const selD = new Date(sel);
  const ev = useMemo(() => dayEvents(d, selD), [d, sel]); // eslint-disable-line react-hooks/exhaustive-deps
  const offNote = d.breakOn(selD);

  const move = (k: number) => {
    const nx = anchor + k * 7 * T.DAYMS;
    if (nx < first || nx > last) { sound.play("error"); return; }
    const a = anchorOf(new Date(nx + 12 * T.HOUR), startWd).getTime();
    setAnchor(a); setSel(a); sound.play("tap");
  };
  const goWeek = (at: Date) => {
    setAnchor(anchorOf(at, startWd).getTime()); setSel(T.sod(at).getTime());
    setQ({}, { replace: true }); sound.play("tap");
  };

  const cur = d.week();
  const sprintWeeks = d.weeks.filter((w) => w.is_sprint).map((w) => w.n);
  const special: [number, number] | undefined = sprintWeeks.length ? [Math.min(...sprintWeeks), Math.max(...sprintWeeks)] : undefined;
  const labels = (d.p.content.arc_labels as [number, string][] | undefined) ?? [];
  const phases = d.p.content.phases ?? [{ name: d.p.short_name || d.p.name, from: 0, to: d.lastWeek, out: "" }];
  const teachWeeks = d.weeks.filter((w) => w.n > 0 && !w.is_demo_week).length;
  const demoWeek = d.weeks.find((w) => w.is_demo_week);
  const demoSess = d.sessions.filter((s) => s.week_n === demoWeek?.n);
  // A break is listed after the week it starts in.
  const breakAfter: Record<number, ReturnType<Derived["breaks"]>[number]> = {};
  d.breaks().forEach((b) => { const n = d.weekOf(b.start); if (n >= 0) breakAfter[n] = b; });

  return (
    <Page cls="page--cal" tabbar>
      <DemoBar />
      <TitleBar title="Calendar" actions={<button className="btn btn-sm btn-secondary" type="button" onClick={sync}><Icon name="calendar-plus" />Sync</button>} />
      <div className="sec sec--hero">
        <div className="seg rv" role="tablist">
          <button type="button" role="tab" aria-selected={view === "week"} className={view === "week" ? "is-on" : ""} onClick={() => setQ({}, { replace: true })}>This week</button>
          <button type="button" role="tab" aria-selected={view === "all"} className={view === "all" ? "is-on" : ""} onClick={() => setQ({ v: "all" }, { replace: true })}>All {teachWeeks} weeks</button>
        </div>
      </div>
      {view === "week" ? (
        <div className="sec">
          <div className="cal-h rv">
            <button className="icon-btn" type="button" aria-label="Previous week" onClick={() => move(-1)}><Icon name="caret-left" /></button>
            <span><b>{weekLabel(d, start)}</b><em>{T.dm(start)} to {T.dm(T.add(start, 6))}</em></span>
            <button className="icon-btn" type="button" aria-label="Next week" onClick={() => move(1)}><Icon name="caret-right" /></button>
          </div>
          <div className="cds rv">
            {days.map((day) => {
              const e = dayEvents(d, day);
              const today = T.same(day, T.now()), on = T.same(day, selD);
              const off = !!d.breakOn(day);
              return (
                <button key={day.getTime()} type="button" className={`cd${on ? " is-on" : ""}${today ? " is-today" : ""}${off ? " is-off" : ""}`} onClick={() => { setSel(day.getTime()); sound.play("toggle"); }}>
                  <span className="cd-w">{today ? "Today" : T.wd(day)}</span><b>{T.parts(day).d}</b>
                  <span className="cd-dots">{e.slice(0, 3).map((x, i) => <i key={i} className={x.cls} />)}</span>
                </button>
              );
            })}
          </div>
          <div className="ce-day rv"><b>{T.same(selD, T.now()) ? "Today" : T.dayLong(selD)}</b>{T.same(selD, T.now()) ? <span>{T.dayLong(selD)}</span> : null}</div>
          <div className="ces rv">
            {ev.length ? ev.map((e, i) => (
              <Link key={i} className={`ce ce--${e.cls}`} to={`/luca/${slug}/${e.to}`}>
                <span className="ce-t">{T.time(e.at)}</span>
                <span className="ce-b"><span className="ce-k">{e.cls === "live" ? <i className="tw-live">Live now</i> : e.k}</span><b>{e.t}</b><span>{e.sub}</span></span>
                <Icon name="caret-right" />
              </Link>
            )) : (
              <div className="ce-empty">{offNote ? <><b>{offNote.label.split(".")[0]}.</b> {offNote.label.split(".").slice(1).join(".").trim()}</> : <><b>Nothing scheduled.</b> A good day to make something.</>}</div>
            )}
          </div>
          <div className="cal-key rv"><span><i className="sess" />Session</span><span><i className="due" />Deadline</span><span><i className="pw" />Pre-watch</span><span><i className="live" />Live now</span></div>
        </div>
      ) : (
        <div className="sec">
          <Arc n={d.weeks.length} cur={d.arcCur()} labels={labels} special={special} cls="rv" />
          <p className="fine rv lc-arc-note">Each week: review, class, then make and post.</p>
          <div className="cws rv">
            {phases.map((ph, pi) => (
              <div key={pi} style={{ display: "contents" }}>
                <div className="cw-ph"><span>{pi + 1}</span>{ph.name}</div>
                {d.weeks.filter((w) => !w.is_demo_week && w.n >= ph.from && w.n <= ph.to).map((w) => {
                  const ss = d.sessions.filter((s) => s.week_n === w.n);
                  const st = w.n < cur || d.alumni ? "done" : w.n === cur ? "now" : "todo";
                  const at = ss[0] ? new Date(ss[0].starts_at) : d.weekStart(w.n) ?? T.now();
                  return (
                    <div key={w.n} style={{ display: "contents" }}>
                      <button type="button" className={`cw cw--${st}${w.is_sprint ? " cw--sprint" : ""}`} onClick={() => goWeek(at)}>
                        <span className="cw-n">W{w.n}</span>
                        <span className="cw-b"><b>{w.module}</b><span>{ss.map((s) => `${T.wd(s.starts_at)} ${T.parts(s.starts_at).d}`).join(" · ")}{ss[0] ? ` ${T.MON[T.parts(ss[0].starts_at).mo]}` : ""}{w.post_note ? ` · ${w.post_note}` : ""}</span></span>
                        <span className="cw-s">{st === "done" ? <Icon name="check" /> : st === "now" ? "This week" : w.is_sprint ? "Sprint" : ""}</span>
                      </button>
                      {breakAfter[w.n] ? (
                        <div className="cw cw--off"><span className="cw-n" /><span className="cw-b"><b>{breakAfter[w.n].label.split(".")[0]}</b><span>{T.day(breakAfter[w.n].start)} to {T.day(breakAfter[w.n].end)}</span></span></div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ))}
            {demoWeek && demoSess[0] ? (
              <button type="button" className={`cw cw--demo${cur === demoWeek.n ? " cw--now" : cur > demoWeek.n || d.alumni ? " cw--done" : ""}`} onClick={() => goWeek(new Date(demoSess[0].starts_at))}>
                <span className="cw-n"><Icon name="star-fill" /></span>
                <span className="cw-b"><b>{demoSess[0].title}</b><span>{demoSess.map((s) => `${T.day(s.starts_at)}, ${T.time(s.starts_at)}`).join(" · ")}</span></span>
                <span className="cw-s">{demoSess.some((s) => T.same(s.starts_at, T.now())) ? "Today" : ""}</span>
              </button>
            ) : null}
          </div>
        </div>
      )}
    </Page>
  );
}
