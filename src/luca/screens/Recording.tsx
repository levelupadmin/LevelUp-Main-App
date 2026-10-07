import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Icon } from "../components/Icon";
import { useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { VideoFrame, canEmbed, type VideoHandle } from "../components/VideoFrame";
import { errMsg } from "../components/bits";
import { rpc, useNotes } from "../lib/api";
import { sound } from "../lib/sound";
import * as T from "../lib/time";

const SPEEDS = [1, 1.5, 2, 0.75];
const HOT = "Your hot seat";

/**
 * The player: the unlisted recording with chapters, your hot-seat moment,
 * timestamped notes and the session files. Progress is saved as you watch.
 * The demo cohort has no real videos, so it plays a simulated timeline.
 */
export default function Recording() {
  const { id } = useParams();
  const [q] = useSearchParams();
  const nav = useNavigate();
  const { slug, d } = useLuca();
  const ui = useUI();
  const s = d.sess(id);
  const notesQ = useNotes(s?.id, !!s);
  const player = useRef<VideoHandle | null>(null);
  const embed = canEmbed(s?.recording_url);
  const simulated = !!s && !embed && d.p.is_demo;

  const [dur, setDur] = useState(() => (s?.recording_minutes ?? 0) * 60 || 0);
  const resumeAt = useMemo(() => {
    const at = Number(q.get("t"));
    if (Number.isFinite(at) && at > 0) return at;
    const w = s ? d.watched(s.id) : 0;
    return dur && w >= dur * 0.95 ? 0 : w;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [t, setT] = useState(resumeAt);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [tab, setTab] = useState<"ch" | "notes" | "files">("ch");
  const [note, setNote] = useState("");
  const saved = useRef(resumeAt);
  const tRef = useRef(t);
  tRef.current = t;

  const hot = s ? d.myHot(s.id) : undefined;
  const chapters = useMemo<[number, string][]>(() => {
    if (!s) return [];
    const base: [number, string][] = s.chapters?.length
      ? s.chapters.map((c) => [c.at_sec, c.title])
      : ((d.p.content.default_chapters?.[s.kind] ?? d.p.content.default_chapters?.class ?? []) as [number, string][]).map(([m, x]) => [m * 60, x]);
    const out = base.filter(([sec]) => !dur || sec < dur);
    if (hot?.rec_at_sec != null) out.push([hot.rec_at_sec, HOT]);
    return out.sort((a, b) => a[0] - b[0]);
  }, [s, d.p.content.default_chapters, hot?.rec_at_sec, dur]);

  // Save the furthest point every 15s and when leaving.
  const save = useCallback(() => {
    if (!s) return;
    const at = Math.floor(tRef.current);
    if (at <= saved.current + 5) return;
    saved.current = at;
    void rpc("luca_rec_progress", { p_session: s.id, p_seconds: at }).catch(() => undefined);
  }, [s]);
  useEffect(() => {
    const iv = setInterval(save, 15_000);
    const onHide = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onHide);
    return () => { clearInterval(iv); document.removeEventListener("visibilitychange", onHide); save(); };
  }, [save]);

  // The simulated demo timeline.
  useEffect(() => {
    if (!simulated || !playing) return;
    const iv = setInterval(() => setT((x) => {
      const n = Math.min(dur, x + 0.25 * speed * 8);
      if (n >= dur) setPlaying(false);
      return n;
    }), 250);
    return () => clearInterval(iv);
  }, [simulated, playing, speed, dur]);

  if (!s) return <Navigate to={`/luca/${slug}/recordings`} replace />;

  const go = (sec: number) => {
    setT(sec);
    if (embed) player.current?.seek(sec);
    else setPlaying(true);
    sound.play("tap");
  };
  const jump = (k: number) => go(Math.max(0, Math.min(dur || 1e9, t + k)));
  const toggle = () => {
    if (embed) { if (playing) player.current?.pause(); else player.current?.play(); }
    else setPlaying((p) => !p);
    sound.play("tap");
  };
  const cycleSpeed = () => {
    const n = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(n);
    if (embed) player.current?.rate(n);
    sound.play("toggle");
  };

  let ci = 0;
  chapters.forEach(([sec], i) => { if (t >= sec) ci = i; });
  const notes = notesQ.data ?? [];

  const addNote = async () => {
    const body = note.trim();
    if (!body) return;
    try {
      await rpc("luca_note_add", { p_session: s.id, p_at_sec: Math.floor(t), p_body: body });
      setNote("");
      sound.play("success");
      ui.toast(`Note saved at ${T.fmtT(t)}`, "note-pencil");
      await notesQ.refetch();
    } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };
  const delNote = async (nid: string) => {
    try { await rpc("luca_note_delete", { p_note: nid }); sound.play("close"); await notesQ.refetch(); } catch (e) { ui.toast(errMsg(e), "warning-circle"); }
  };

  const p = dur ? t / dur : 0;
  return (
    <div className={`page page--rec${playing ? " is-playing" : ""}`}>
      <div className="pl2">
        <div className="pl2-top">
          <button className="icon-btn" type="button" aria-label="Close" onClick={() => { save(); if (window.history.length > 1) nav(-1); else nav(`/luca/${slug}/recordings`); }}><Icon name="caret-down" /></button>
          <span>{d.kindLine(s)}</span>
          <button className="icon-btn" type="button" aria-label="Speed" onClick={cycleSpeed}>{speed}x</button>
        </div>
        <div className="pl2-v">
          {embed && s.recording_url ? (
            <VideoFrame ref={player} url={s.recording_url} title={s.title} start={resumeAt}
              onTick={(pos, total, on) => { setT(pos); setPlaying(on); if (total && Math.abs(total - dur) > 1) setDur(total); }}
              onEnded={() => { setPlaying(false); save(); }} />
          ) : (
            <>
              {s.image_url ? <img src={s.image_url} alt="" /> : null}
              <span className="pl2-shade" />
              {simulated ? <button className="pl2-play" type="button" aria-label={playing ? "Pause" : "Play"} onClick={toggle}><Icon name={playing ? "pause-fill" : "play-fill"} /></button> : null}
              {simulated && dur ? (
                <div className="pl2-bar">
                  <div className="pl2-scrub" onClick={(e) => { const b = e.currentTarget.getBoundingClientRect(); go(Math.max(0, Math.min(1, (e.clientX - b.left) / b.width)) * dur); }}>
                    <i className="pl2-fill" style={{ width: `${p * 100}%` }} />
                    {chapters.map(([sec, x], i) => <b key={i} className={x === HOT ? "is-hot" : ""} style={{ left: `${(sec / dur) * 100}%` }} />)}
                    <span className="pl2-knob" style={{ left: `${p * 100}%` }} />
                  </div>
                  <div className="pl2-t"><span className="pl2-now">{T.fmtT(t)}</span><span className="pl2-ch">{chapters[ci]?.[1] ?? ""}</span><span>{T.fmtT(dur)}</span></div>
                </div>
              ) : null}
            </>
          )}
        </div>
        <div className="pl2-body">
          <div className="pl2-meta">
            <h1 className="h2">{s.title}</h1>
            <p className="muted">{T.day(s.starts_at)} · {d.mentorFull(s.mentor_ids)}{simulated ? " · demo playback" : ""}</p>
            {!embed && !simulated ? (
              s.recording_url
                ? <a className="btn btn-sm mt-3" href={s.recording_url} target="_blank" rel="noopener noreferrer"><Icon name="arrow-up-right" />Open the recording</a>
                : <div className="lc-note mt-3"><b>Recording on its way.</b> It lands here a few hours after the session.</div>
            ) : (
              <div className="pl2-acts">
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => jump(-10)}><Icon name="rewind" />10s</button>
                <button className="btn btn-sm btn-secondary" type="button" onClick={() => jump(30)}>30s<Icon name="fast-forward" /></button>
                {hot?.rec_at_sec != null ? <button className="btn btn-sm" type="button" onClick={() => go(hot.rec_at_sec!)}><Icon name="flame-fill" />{HOT} · {T.fmtT(hot.rec_at_sec)}</button> : null}
              </div>
            )}
          </div>
          <div className="seg pl2-tabs" role="tablist">
            <button type="button" className={tab === "ch" ? "is-on" : ""} onClick={() => { setTab("ch"); sound.play("toggle"); }}>Chapters</button>
            <button type="button" className={tab === "notes" ? "is-on" : ""} onClick={() => { setTab("notes"); sound.play("toggle"); }}>Notes · {notes.length}</button>
            <button type="button" className={tab === "files" ? "is-on" : ""} onClick={() => { setTab("files"); sound.play("toggle"); }}>Files</button>
          </div>
          {tab === "ch" ? (
            <div className="pl2-pane">
              <ol className="pl2-chs">
                {chapters.map(([sec, x], i) => (
                  <li key={i}><button type="button" className={`${x === HOT ? "is-hot" : ""}${i === ci ? " is-now" : ""}`} onClick={() => go(sec)} disabled={!embed && !simulated}>
                    <span className="mono">{T.fmtT(sec)}</span><span>{x}</span>
                  </button></li>
                ))}
              </ol>
            </div>
          ) : null}
          {tab === "notes" ? (
            <div className="pl2-pane">
              <div className="pl2-add">
                <span className="input-wrap"><input className="input" maxLength={500} placeholder={`Note at ${T.fmtT(t)}`} autoComplete="off" value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void addNote(); }} /></span>
                <button className="btn btn-sm" type="button" disabled={!note.trim()} onClick={addNote}>Add</button>
              </div>
              <ol className="pl2-notes">
                {notes.map((n) => (
                  <li key={n.id} style={{ display: "flex", alignItems: "center" }}>
                    <button type="button" onClick={() => go(n.at_sec)} style={{ flex: 1 }}><span className="mono">{T.fmtT(n.at_sec)}</span><span>{n.body}</span></button>
                    <button type="button" className="icon-btn" aria-label="Delete note" onClick={() => delNote(n.id)}><Icon name="x" /></button>
                  </li>
                ))}
              </ol>
              {!notes.length ? <p className="fine mt-2">Notes are private to you and stay with the recording.</p> : null}
            </div>
          ) : null}
          {tab === "files" ? (
            <div className="pl2-pane">
              {s.files?.length ? (
                <div className="files">
                  {s.files.map((f, i) => f.url ? (
                    <a key={i} className="file" href={f.url} target="_blank" rel="noopener noreferrer"><span className="file-badge">{f.badge}</span><span><b>{f.title}</b><em>{f.sub}</em></span><Icon name="arrow-square-out" /></a>
                  ) : (
                    <div key={i} className="file"><span className="file-badge">{f.badge}</span><span><b>{f.title}</b><em>{f.sub}</em></span></div>
                  ))}
                </div>
              ) : <p className="fine mt-2">No files for this session.</p>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
