import { useSearchParams } from "react-router-dom";
import { Empty, SecHead } from "../components/ui";
import { DemoBar, Page, TitleBar, useLuca } from "../components/shell";
import { RecCard } from "../components/bits";
import type { Session } from "../lib/types";
import * as T from "../lib/time";
import { sound } from "../lib/sound";

const CHIPS: [string, string, (s: Session, hot: boolean) => boolean][] = [
  ["all", "All", () => true],
  ["reviews", "Reviews", (s) => ["review", "standup", "demo"].includes(s.kind)],
  ["classes", "Classes", (s) => ["class", "double", "plan", "orientation"].includes(s.kind)],
  ["hot", "Your hot seats", (_s, hot) => hot],
];

/** Every session that has a recording, newest week first, with where you left off. */
export default function Recordings() {
  const { d } = useLuca();
  const [q, setQ] = useSearchParams();
  const f = CHIPS.some((c) => c[0] === q.get("f")) ? (q.get("f") as string) : "all";
  const all = d.recordings();
  const keep = CHIPS.find((c) => c[0] === f)![2];
  const list = all.filter((s) => keep(s, d.myHot(s.id)?.rec_at_sec != null));
  const cont = all.slice().reverse().find((s) => { const w = d.watched(s.id); return w > 30 && w < (s.recording_minutes ?? 0) * 60 * 0.95; });
  const byWeek = new Map<number, Session[]>();
  list.forEach((s) => byWeek.set(s.week_n, [...(byWeek.get(s.week_n) ?? []), s]));
  const weeks = [...byWeek.keys()].sort((a, b) => b - a);

  return (
    <Page cls="page--library" tabbar>
      <DemoBar />
      <TitleBar title="Recordings" />
      <div className="chips lc-chips rv">
        {CHIPS.map(([k, l]) => (
          <button key={k} type="button" className={`chip${k === f ? " is-on" : ""}`} onClick={() => { setQ(k === "all" ? {} : { f: k }, { replace: true }); sound.play("toggle"); }}>{l}</button>
        ))}
      </div>
      {!list.length ? (
        <div className="sec">
          <Empty title={f === "hot" ? "No hot seats yet" : "Nothing here yet"} sub={f === "hot" ? "When your work is reviewed live, that moment gets its own chapter here." : "Each session lands here a few hours after it ends, with chapters."} />
        </div>
      ) : null}
      {cont && f === "all" ? <div className="sec sec--hero"><SecHead title="Continue watching" /><RecCard s={cont} d={d} big cls="rv" /></div> : null}
      {weeks.map((w) => {
        const row = d.weekRow(w);
        const ss = byWeek.get(w)!;
        return (
          <div className="sec" key={w}>
            <div className="rec-wk2 rv"><b>{row?.is_demo_week ? "Demo Day" : w === 0 ? "Orientation" : `Week ${w}`}</b><span>{row?.module ?? ""}{ss[0] ? ` · ${T.dm(ss[0].starts_at)}` : ""}</span></div>
            <div className="rcs rv">{ss.map((s) => <RecCard key={s.id} s={s} d={d} />)}</div>
          </div>
        );
      })}
    </Page>
  );
}
