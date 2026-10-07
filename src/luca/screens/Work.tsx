import { Link } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Count, SecHead, VChip } from "../components/ui";
import { DemoBar, Page, TitleBar, useLuca } from "../components/shell";
import type { AState } from "../lib/derive";
import type { Assignment } from "../lib/types";
import * as T from "../lib/time";

function linksIn(id: string): number {
  try {
    const s = JSON.parse(sessionStorage.getItem(`luca.draft.${id}`) || "{}") as Record<string, { ok?: boolean }>;
    return Object.values(s).filter((x) => x?.ok).length;
  } catch { return 0; }
}

/** Every assignment and its call, with the one that needs you now on top. */
export default function Work() {
  const { slug, d } = useLuca();
  const states: [Assignment, AState][] = d.assignments.map((a) => [a, d.aState(a)]);
  const count = (...v: string[]) => states.filter(([, s]) => v.includes(s.v)).length;
  const cur = d.current();
  const fixA = states.find(([, s]) => s.v === "fix");
  const p = d.p;
  const resources = (d.r.resources ?? []);
  const teachWeeks = d.weeks.filter((w) => w.n > 0 && !w.is_demo_week).length;

  let loud: JSX.Element | null = null;
  if (fixA && "sub" in fixA[1]) {
    const [a, s] = fixA;
    const by = s.sub.reviewed_by ? d.mentor(s.sub.reviewed_by) : undefined;
    loud = (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="note-pencil" /><span>Fix asked · Week {a.week_n}</span></span></div>
        {s.sub.fix_due_at ? <Count to={s.sub.fix_due_at} fmt="hms" /> : null}
        <div className="hs-title">{a.title}</div>
        {s.sub.notes?.[0] ? <div className="hs-meta">{by ? `${by.name.split(" ")[0]}: ` : ""}&ldquo;{s.sub.notes[0]}&rdquo;</div> : null}
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/assign/${a.id}`}>Paste the fixed link</Link></div>
      </div></article>
    );
  } else if (cur) {
    const n = linksIn(cur.id);
    const parts = cur.parts.length;
    loud = (
      <article className="hs rv"><div className="hs-in">
        <div className="hs-top"><span className="hs-state"><Icon name="note-pencil" /><span>Week {cur.week_n} · due {T.day(cur.due_at)}, {T.time(cur.due_at)}</span></span></div>
        <Count to={cur.due_at} fmt="dhm" />
        <div className="hs-title">{cur.title}</div>
        <div className="hs-meta">{n} of {parts} links in · +{cur.coins ?? p.coin_rules?.submit_on_time?.value ?? 150} on time</div>
        <div className="hs-actions"><Link className="btn btn-block" to={`/luca/${slug}/assign/${cur.id}`}>{n ? "Keep going" : "Start"}</Link></div>
      </div></article>
    );
  }

  return (
    <Page cls="page--work" tabbar>
      <DemoBar />
      <TitleBar title="Work" />
      <div className="sec sec--hero">
        <div className="wk-sum rv">
          <div><b>{count("ship")}</b><span>Ship</span></div>
          <div><b>{count("fix")}</b><span>Fix</span></div>
          <div><b>{count("pending", "fixed")}</b><span>In review</span></div>
          <div><b>{count("due")}</b><span>Open</span></div>
        </div>
      </div>
      {loud ? <div className="sec lc-next">{loud}</div> : null}
      <div className="sec"><div className="lc-note rv"><b>Everything is a link.</b> Docs, Sheets, Drive, your post. Paste it and you&apos;re done. Nothing to upload.</div></div>
      <div className="sec">
        <SecHead title={`Your ${teachWeeks} weeks`} sub="Every piece gets a call: Ship, Fix or Hold." />
        {states.length ? (
          <div className="wrs rv">
            {states.map(([a, s]) => {
              const fut = s.v === "soon";
              const opens = d.weekStart(a.week_n);
              const sub = "sub" in s ? s.sub : undefined;
              const by = sub?.reviewed_by ? d.mentor(sub.reviewed_by) : undefined;
              const line = fut ? `Opens ${opens ? T.day(opens) : "soon"}`
                : s.v === "pending" || s.v === "fixed" ? `Reviewed ${s.sess ? (T.same(s.sess.starts_at, T.now()) ? "tonight" : T.day(s.sess.starts_at)) : "soon"}`
                : s.v === "due" ? `Due ${T.day(a.due_at)}`
                : s.v === "late" ? `Was due ${T.day(a.due_at)} · still send it`
                : `${a.parts.length} ${a.parts.length > 1 ? "links" : "link"}${by ? ` · ${by.name.split(" ")[0]}` : ""}`;
              return (
                <Link key={a.id} className={`wr${fut ? " is-fut" : ""}`} to={`/luca/${slug}/assign/${a.id}`}>
                  <span className="wr-w">W{a.week_n}</span>
                  <span className="wr-b"><b>{a.title}</b><span>{line}</span></span>
                  <VChip v={sub?.was_fix && s.v === "ship" ? "ship" : s.v} />
                </Link>
              );
            })}
          </div>
        ) : <div className="lc-note rv"><b>No assignments yet.</b> They show up here week by week.</div>}
      </div>
      {resources.length ? (
        <div className="sec">
          <SecHead title="Resources" sub="Templates and references from your mentors." />
          <div className="tw rv">
            {resources.map((r) => (
              <a key={r.id} className="tw-r" href={r.url} target="_blank" rel="noopener noreferrer">
                <span className="ls-word">{r.kind.toUpperCase().slice(0, 5)}</span>
                <span className="tw-b"><b>{r.title}</b><span>{r.week_n != null ? `Week ${r.week_n}` : "Whole cohort"}</span></span>
                <Icon name="arrow-up-right" />
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </Page>
  );
}
