import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Bar, Check } from "../components/ui";
import { NavBar, Page, useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { LinkSlot, errMsg, useSlots } from "../components/bits";
import { VideoFrame, canEmbed } from "../components/VideoFrame";
import { rpc } from "../lib/api";
import { sound } from "../lib/sound";
import * as T from "../lib/time";
import type { AssignmentPart } from "../lib/types";

const SUMMARY: AssignmentPart[] = [{ k: "loom", label: "Your 60-second summary", where: "Loom, or a voice note in Drive" }];

/** Watch, answer the questions (first answer counts), then paste a 60-second summary. */
export default function Prewatch() {
  const { week } = useParams();
  const w = Number(week);
  const { slug, d, refresh } = useLuca();
  const ui = useUI();
  const nav = useNavigate();
  const row = d.weekRow(w);
  const done = d.pwDone(w);
  const quiz = row?.quiz ?? [];
  const sum = useSlots(`pw${w}`, SUMMARY);
  const [step, setStep] = useState(done ? 4 : 1);
  const [watched, setWatched] = useState(0);
  const [qi, setQi] = useState(0);
  const [score, setScore] = useState(0);
  const [pick, setPick] = useState<{ chosen: number; answer: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const stepRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const sim = useRef<number | null>(null);

  useEffect(() => {
    if (step > 1 && step < 4) setTimeout(() => stepRefs.current[step]?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }, [step]);
  useEffect(() => () => { if (sim.current) clearInterval(sim.current); }, []);

  if (!row || !d.hasPrewatch(w)) return <Navigate to={`/luca/${slug}/today`} replace />;
  const pw = row.prewatch;
  const mins = pw.minutes ?? 15;
  const due = d.pwDue(w);
  const opensAt = row.starts_on ? T.add(T.dateOnly(row.starts_on), -7) : null;
  const notOpen = !!opensAt && T.now() < opensAt;
  const video = pw.video_url && canEmbed(pw.video_url) ? pw.video_url : null;

  const finishWatch = () => { setWatched(1); sound.play("soft"); setStep(quiz.length ? 2 : 3); };
  const simulate = () => {
    if (sim.current) return;
    sound.play("tap");
    sim.current = window.setInterval(() => setWatched((x) => {
      const n = Math.min(1, x + 0.04);
      if (n >= 1 && sim.current) { clearInterval(sim.current); sim.current = null; setTimeout(finishWatch, 0); }
      return n;
    }), 90);
  };

  const answer = async (choice: number) => {
    if (pick || busy) return;
    setBusy(true);
    try {
      const r = await rpc<{ correct: boolean; answer: number; chosen: number }>("luca_prewatch_check", { p_slug: slug, p_week: w, p_q: qi, p_choice: choice });
      setPick({ chosen: r.chosen, answer: r.answer });
      if (r.correct) setScore((x) => x + 1);
      sound.play(r.correct ? "success" : "error"); sound.buzz(r.correct ? 8 : [20, 30, 20]);
      setTimeout(() => {
        setPick(null);
        if (qi + 1 < quiz.length) setQi(qi + 1);
        else { setQi(quiz.length); setTimeout(() => setStep(3), 700); }
      }, r.correct ? 650 : 1100);
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(false); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const r = await rpc<{ score: number; of: number; awarded: number }>("luca_prewatch_complete", {
        p_slug: slug, p_week: w, p_answers: [], p_summary_url: sum.slots[0]?.url,
      });
      sum.clear();
      ui.moment({
        eyebrow: `Pre-watch · Week ${w}`, title: "Done.",
        sub: w === 0 ? "One more setup step ticked." : r.of ? `${r.score} of ${r.of} on the quiz. Your hot seat this week is safe.` : "Your hot seat this week is safe.",
        coins: r.awarded || undefined, coinsWhy: "Pre-watch, quiz and summary",
        onDone: () => { void refresh(); nav(-1); },
      });
    } catch (e) { sound.play("error"); ui.toast(errMsg(e), "warning-circle"); }
    finally { setBusy(false); }
  };

  const q = quiz[qi];
  const cls = (n: number) => `pw-step rv${done || step > n ? " is-done" : step === n ? " is-on" : ""}`;
  return (
    <Page cls="page--pw">
      <NavBar title="Pre-watch" back close />
      <div className="sec sec--hero">
        <div className="eyebrow rv">Pre-watch · Week {w}</div>
        <h1 className="h1 rv">{pw.title ?? row.module}</h1>
        <p className="muted rv">
          {done ? "Done. Your hot seat this week is safe."
            : notOpen ? `Opens ${T.day(opensAt!)}. Come back then.`
            : `Three steps, about ${mins + 6} minutes.${due ? ` Finish by ${T.day(due)}, ${T.time(due)} to keep your hot seat.` : ""}`}
        </p>
      </div>
      {!notOpen ? (
        <div className="sec">
          <div className={cls(1)} ref={(el) => { stepRefs.current[1] = el; }}>
            <div className="pw-h"><span className="pw-n">1</span><b>Watch</b><em>{mins} min</em><Check on={done || step > 1} /></div>
            {video && !done ? (
              <div className="pl2-v" style={{ borderRadius: 14, marginTop: 10 }}>
                <VideoFrame url={video} title={pw.title ?? row.module} onTick={(pos, dur) => { if (dur) setWatched(Math.min(1, pos / dur)); }} onEnded={finishWatch} />
              </div>
            ) : (
              <button type="button" className="pw-v" disabled={done || step > 1} onClick={simulate}>
                {row.image_url ? <img src={row.image_url} alt="" /> : null}
                <span className="pw-play"><Icon name={done || watched >= 1 ? "check" : sim.current ? "pause-fill" : "play-fill"} /></span>
                <Bar p={done ? 1 : watched} cls="bar--on-art pw-bar" />
              </button>
            )}
            {video && step === 1 && !done ? (
              <button className="btn btn-sm btn-secondary mt-3" type="button" disabled={watched < 0.85} onClick={finishWatch}>
                {watched < 0.85 ? `Watched ${Math.round(watched * 100)}%` : "I've watched it"}
              </button>
            ) : null}
            {!video && !d.p.is_demo && step === 1 && !done ? <p className="fine mt-2">The video goes up before the week opens.</p> : null}
          </div>
          {quiz.length ? (
            <div className={cls(2)} ref={(el) => { stepRefs.current[2] = el; }}>
              <div className="pw-h"><span className="pw-n">2</span><b>{quiz.length === 5 ? "Five" : quiz.length} questions</b><em>about 3 min</em><Check on={done || step > 2} /></div>
              {step === 2 && !done ? (
                <div className="pw-q">
                  {q ? (
                    <>
                      <div className="pw-qn">Question {qi + 1} of {quiz.length}</div>
                      <b className="pw-qt">{q.q}</b>
                      <div className="pw-opts">
                        {q.options.map((o, i) => (
                          <button key={i} type="button" disabled={!!pick || busy}
                            className={`pw-o${pick && i === pick.answer ? " is-right" : ""}${pick && i === pick.chosen && pick.chosen !== pick.answer ? " is-wrong" : ""}`}
                            onClick={() => answer(i)}>{o}</button>
                        ))}
                      </div>
                    </>
                  ) : <div className="pw-res"><b>{score} of {quiz.length}.</b> {score >= Math.ceil(quiz.length * 0.6) ? "Passed." : "Passed. Rewatch the bits you missed before the session."}</div>}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className={cls(3)} ref={(el) => { stepRefs.current[3] = el; }}>
            <div className="pw-h"><span className="pw-n">{quiz.length ? 3 : 2}</span><b>A 60-second summary</b><em>1 min</em><Check on={done} /></div>
            {step === 3 && !done ? (
              <div className="pw-sum">
                <p className="muted">Record a voice note or a Loom on your phone. Three things you learned, one thing you&apos;ll do. Then paste the link.</p>
                <div className="lss"><LinkSlot part={SUMMARY[0]} i={0} slots={sum.slots} setSlots={sum.setSlots} /></div>
                <button className="btn btn-lg btn-block" type="button" disabled={!sum.allIn || busy} onClick={finish}>{busy ? "Saving" : `Finish the pre-watch · +${d.p.coin_rules?.prewatch?.value ?? 50}`}</button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </Page>
  );
}
