import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Graph } from "../components/Logo";
import { Av } from "../components/ui";
import { NavBar, Page, useLuca } from "../components/shell";
import { fill } from "../lib/format";
import { sound } from "../lib/sound";

/** "Watch a script go from Fix to Ship" — the product's taste, in one screen. */
export default function SampleReview() {
  const { slug, room } = useLuca();
  const p = room.program;
  const SR = p.content.sample_review;
  const nav = useNavigate();
  const docRef = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<number | null>(null);
  const [phase, setPhase] = useState<"fix" | "cutting" | "moving" | "ship">("fix");
  const [run, setRun] = useState(0);

  if (!SR) return <Page><NavBar title="Sample review" back /><div className="lu-err"><p className="muted">No sample review for this cohort yet.</p></div></Page>;

  const scrollDoc = () => {
    const el = docRef.current;
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 110, behavior: "smooth" });
  };
  const note = (k: number) => { setOn(k); sound.play("tap"); scrollDoc(); };
  const apply = () => {
    setOn(null);
    scrollDoc();
    setTimeout(() => { setPhase("cutting"); sound.play("close"); }, 450);
    setTimeout(() => setPhase("moving"), 1100);
    setTimeout(() => {
      setPhase("ship");
      sound.nodes(160, 0);
      sound.buzz([10, 40, 10, 40, 18]);
    }, 2100);
  };
  const again = () => { setPhase("fix"); setOn(null); setRun((n) => n + 1); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const highlighted = on != null ? SR.notes[on]?.lines ?? [] : [];
  const cut = phase !== "fix";
  const moved = phase === "moving" || phase === "ship";
  let shown = 0;

  return (
    <Page cls="page--review" key={run}>
      <NavBar title={SR.nav ?? "Sample review"} back />
      <div className="sec sec--hero rvw">
        <div className="rvw-tag rv"><span className="vd vd--soon">Sample</span><span>{SR.tag}</span></div>
        <h1 className="h1 rv">{SR.title}</h1>
        <p className="muted rv">{SR.sub}</p>

        <div className="rvw-doc rv" ref={docRef}>
          <div className="rvw-doc-h"><span className="ls-word">DOC</span><b>{SR.doc}</b></div>
          <ol className="rvw-lines">
            {SR.script.map((l, k) => {
              const isCut = cut && !!l.cut;
              if (!isCut) shown++;
              const cls = [
                highlighted.includes(k) ? "is-on" : "",
                l.cut ? "is-cuttable" : "", l.hook ? "is-hook" : "",
                isCut ? "is-cut" : "",
                moved && l.hook ? "is-moved" : "",
                moved && l.end ? "is-new" : "",
              ].join(" ");
              return (
                <li key={k} className={cls}>
                  <span className="rvw-n">{isCut ? k + 1 : moved ? shown : k + 1}</span>
                  <span className="rvw-t">{moved && l.end && l.fix ? l.fix : l.t}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="rvw-verdict rv" data-v={phase === "ship" ? "ship" : "fix"}>
          <div className="rvw-vd">
            <span className="rvw-vk">Mentor&apos;s call</span>
            <b className="rvw-vw">{phase === "ship" ? "Ship" : "Fix"}</b>
            <div className={`rvw-mark done-mark${phase === "ship" ? " is-drawn" : ""}`}><Graph /></div>
          </div>
          {SR.by ? <div className="rvw-by"><Av p={{ initials: SR.by.ini, name: SR.by.name }} /><span><b>{SR.by.name}</b><em>{SR.by.when}</em></span></div> : null}
          <ul className="rvw-notes">
            {phase === "ship"
              ? <li className="rvw-shipnote">{SR.ship_note}</li>
              : SR.notes.map((n, k) => (
                <li key={k}><button type="button" className={on === k ? "is-on" : ""} onClick={() => note(k)}><span className="mono">{n.at}</span><span>{n.text}</span></button></li>
              ))}
          </ul>
          {phase === "fix" ? <button className="btn btn-lg btn-block rvw-go" type="button" onClick={apply}>Apply the notes</button> : null}
        </div>

        {phase === "ship" ? (
          <div className="rvw-after">
            <p className="lede">{SR.after}</p>
            <div className="stack-2 mt-4">
              <button className="btn btn-lg btn-block" type="button" onClick={() => nav(room.access === "learner" ? `/luca/${slug}/today` : `/luca/${slug}/apply/1`)}>
                {room.access === "learner" ? "Open the cohort" : fill(p.content.sales?.apply_cta, p) || "Apply"}
              </button>
              <button className="btn btn-lg btn-block btn-secondary" type="button" onClick={again}>Run it again</button>
            </div>
          </div>
        ) : null}
      </div>
    </Page>
  );
}
