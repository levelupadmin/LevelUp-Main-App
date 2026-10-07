import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Icon } from "../components/Icon";
import { Graph, Logo } from "../components/Logo";
import { useLuca } from "../components/shell";
import { fill } from "../lib/format";
import { youTubeId } from "../lib/links";
import { sound } from "../lib/sound";

const BEAT_MS = 3300;

/** Full-screen story trailer: one promise per beat, tap to pause, edges to skip. */
export default function Trailer() {
  const { slug, room } = useLuca();
  const p = room.program;
  const tr = p.content.trailer;
  const nav = useNavigate();
  const beats = tr?.beats ?? [];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [prog, setProg] = useState(0);
  const start = useRef(performance.now());
  const pausedAt = useRef(0);
  const raf = useRef(0);
  const yt = youTubeId(tr?.video_url);

  const close = useCallback(() => { sound.play("close"); nav(-1); }, [nav]);
  const show = useCallback((n: number) => { setI(n); start.current = performance.now(); setProg(0); }, []);

  useEffect(() => {
    if (yt || !playing || ended || !beats.length) return;
    const loop = (now: number) => {
      const k = (now - start.current) / BEAT_MS;
      if (k >= 1) {
        setI((cur) => {
          if (cur + 1 < beats.length) { start.current = now; setProg(0); return cur + 1; }
          setEnded(true); sound.nodes(160, 150);
          return cur;
        });
      } else setProg(k);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, ended, beats.length, yt]);
  useEffect(() => { sound.play("soft"); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const toggle = () => {
    if (ended) return;
    sound.play("tap");
    if (playing) { pausedAt.current = performance.now() - start.current; setPlaying(false); }
    else { start.current = performance.now() - pausedAt.current; setPlaying(true); }
  };
  const next = () => { if (ended) return; if (i + 1 < beats.length) { show(i + 1); setPlaying(true); } else { setEnded(true); sound.nodes(160, 150); } };
  const prev = () => { if (ended) return; show(Math.max(0, i - 1)); setPlaying(true); };
  const again = () => { setEnded(false); show(0); setPlaying(true); };
  const apply = () => nav(room.access === "learner" ? `/luca/${slug}/today` : `/luca/${slug}/apply/1`, { replace: true });

  const beat = beats[i];
  return (
    <div className={`page page--trailer${playing ? "" : " is-paused"}`}>
      <div className="tr">
        {yt ? (
          <iframe className="lu-yt" title="Trailer" src={`https://www.youtube-nocookie.com/embed/${yt}?autoplay=1&playsinline=1&rel=0&modestbranding=1`} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
        ) : (
          <div className="tr-frames">
            {beats.map((b, j) => <div key={j} className={`tr-f${j === i ? " is-on" : ""}`}><img src={b[0]} alt="" /></div>)}
          </div>
        )}
        {!yt && <div className="tr-shade" />}
        <div className="tr-top">
          {!yt && (
            <div className="tr-bars">
              {beats.map((_, j) => <i key={j}><b style={{ width: `${ended || j < i ? 100 : j === i ? Math.min(100, prog * 100) : 0}%` }} /></i>)}
            </div>
          )}
          <div className="tr-head">
            <span className="tr-logo"><Logo className="lu-logo--bar" /></span>
            <span className="tr-lbl">{tr?.label ?? "Trailer"}</span>
            <button className="icon-btn tr-x" type="button" aria-label="Close" onClick={close}><Icon name="x" /></button>
          </div>
        </div>
        {!yt && beat && (
          <div className="tr-cap is-in" aria-live="polite" key={i}>
            <div className="tr-k">{fill(beat[1], p)}</div>
            <div className="tr-t">{fill(beat[2], p)}</div>
          </div>
        )}
        {!yt && (
          <>
            <button className="tr-tap tr-tap--prev" type="button" aria-label="Previous" onClick={prev} />
            <button className="tr-tap tr-tap--mid" type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle} />
            <button className="tr-tap tr-tap--next" type="button" aria-label="Next" onClick={next} />
            {!playing && !ended ? <div className="tr-paused"><Icon name="pause-fill" /></div> : null}
          </>
        )}
        {(ended || yt) && (
          <div className={`tr-end${ended ? " is-in" : ""}`} hidden={!ended}>
            <div className={`tr-end-mark done-mark${ended ? " is-drawn" : ""}`}><Graph /></div>
            <div className="tr-end-k">{fill(tr?.end_kicker, p)}</div>
            <div className="tr-end-t">{tr?.end_title ?? "That's the cohort."}</div>
            <div className="tr-end-acts">
              <button className="btn btn-lg btn-block" type="button" onClick={apply}>{room.access === "learner" ? "Open the cohort" : fill(p.content.sales?.apply_cta, p) || "Apply"}</button>
              {p.content.sample_review ? <button className="btn btn-lg btn-block btn-glass" type="button" onClick={() => nav(`/luca/${slug}/review`, { replace: true })}>{tr?.review_cta ?? "See a real review"}</button> : null}
              <button className="btn-text tr-again" type="button" onClick={again}><Icon name="arrow-counter-clockwise" />Watch again</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
