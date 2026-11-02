import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ChevronDown, Download, Lock, Play, Share2 } from "lucide-react";
import { tapTick } from "@/lib/haptics";
import type { ChapterSibling, Resource } from "@/components/chapter/types";
import "@/styles/stage-ui.css";
import "@/components/stage/home/home.css";
import "@/components/stage/course/course.css";
import "./player.css";

/**
 * The lesson player (/chapters/:id) under Stage, spec 12.1 and the round-4
 * mockup's player view: the player on pure black, the lesson's title, "Mark
 * as done" and one Ember "Next lesson", then Lessons, Notes, About, Files and
 * Q&A as tabs. From 1024px the lessons sit in a sticky column on the right.
 * ChapterViewer keeps every rule (access, progress, the completion arc, the
 * swipe-down dismiss) and hands this view the results.
 */

export type StageSibling = ChapterSibling & { make_free?: boolean | null };
export type StageProgress = Record<string, { done: boolean; pos: number }>;
type Tab = "lessons" | "notes" | "about" | "files" | "qna";

interface Props {
  /** swipe-down-to-dismiss handlers for the top bar (ChapterViewer owns the gesture) */
  grab: HTMLAttributes<HTMLDivElement>;
  showGrab: boolean;
  loading: boolean;
  courseTitle: string | null;
  backLabel: string;
  onBack: () => void;
  onShare: () => void;
  player: ReactNode;
  title: string;
  description: string | null;
  siblings: StageSibling[];
  currentId: string;
  currentIndex: number;
  progress: StageProgress;
  /** playback of the current lesson, 0 to 100 */
  livePct: number;
  done: boolean;
  busy: boolean;
  onDone: () => void;
  course: { pct: number; done: number; total: number } | null;
  /** false only when we know they don't own the course (a free lesson) */
  owned: boolean;
  upsell: { text: string; label: string; open: () => void } | null;
  notes: { value: string; onChange: (v: string) => void; saved: boolean };
  about: ReactNode | null;
  resources: Resource[];
  qna: ReactNode;
  qnaCount: number;
  qnaDot: boolean;
  quizzes: ReactNode | null;
}

const WIDE = "(min-width: 1024px)";
function useWide() {
  const [wide, setWide] = useState(() => typeof window !== "undefined" && window.matchMedia(WIDE).matches);
  useEffect(() => {
    const m = window.matchMedia(WIDE);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide;
}

const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const kb = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);
const ext = (name: string) => (name.includes(".") ? name.split(".").pop()!.slice(0, 4).toUpperCase() : "FILE");

export default function StagePlayer(p: Props) {
  const navigate = useNavigate();
  const wide = useWide();
  const [tab, setTab] = useState<Tab>("lessons");
  const sideRef = useRef<HTMLDivElement | null>(null);

  // Keep the playing lesson in view in the side column, moving it only when it's out of sight.
  useEffect(() => {
    const box = sideRef.current;
    const row = box?.querySelector<HTMLElement>(".cd-lesson.is-current");
    if (!wide || !box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top || r.bottom > b.bottom) box.scrollTop += r.top - b.top - box.clientHeight / 3;
  }, [wide, p.currentId, p.siblings]);

  const locked = (s: StageSibling) => !p.owned && !s.make_free;
  const next = p.siblings[p.currentIndex + 1] ?? null;
  const total = p.siblings.length;
  const n = p.currentIndex + 1;

  const open = (s: StageSibling) => {
    if (s.id === p.currentId) return;
    if (locked(s)) { p.upsell?.open(); return; }
    navigate(`/chapters/${s.id}`);
  };

  const tabs: { key: Tab; label: string; count?: number; dot?: boolean }[] = [
    { key: "lessons", label: "Lessons", count: total },
    { key: "notes", label: "Notes" },
    ...(p.about ? [{ key: "about" as Tab, label: "About" }] : []),
    { key: "files", label: "Files", count: p.resources.length },
    { key: "qna", label: "Q&A", count: p.qnaCount, dot: p.qnaDot },
  ];
  // The lessons live in the side column from 1024px, so the strip starts at Notes there.
  let shown: Tab = wide && tab === "lessons" ? "notes" : tab;
  if (shown === "about" && !p.about) shown = wide ? "notes" : "lessons";
  const pick = (k: Tab) => { if (k !== shown) { void tapTick(); setTab(k); } };

  const progressLine = p.course && p.course.total > 0 && (
    <div className="prog pl-prog">
      <span className="prog-bar"><i style={{ width: `${p.course.pct}%` }} /></span>
      <span><b>{p.course.pct}%</b> · {p.course.done} of {p.course.total} done</span>
    </div>
  );

  const lessons = (
    <div className="cd-lessons pl-lessons">
      {p.siblings.map((s, i) => {
        const cur = s.id === p.currentId;
        const info = p.progress[s.id];
        const isDone = (info?.done ?? false) || (cur && p.done);
        const lock = locked(s);
        const dur = s.duration_seconds ?? 0;
        const watched = isDone ? 1 : dur > 0 ? Math.min(1, Math.max(cur ? p.livePct / 100 : 0, (info?.pos ?? 0) / dur)) : cur ? p.livePct / 100 : 0;
        const meta: ReactNode[] = [];
        if (dur > 0) meta.push(<span key="d" className="mono">{clock(dur)}</span>);
        if (cur) meta.push("Playing");
        else if (!isDone && info && info.pos > 0 && dur > 0) meta.push(`${Math.max(1, Math.round((dur - info.pos) / 60))} min left`);
        return (
          <button
            key={s.id}
            type="button"
            className={`cd-lesson${lock ? " is-locked" : ""}${isDone ? " is-done" : ""}${cur ? " is-current" : ""}`}
            onClick={() => open(s)}
            aria-current={cur ? "true" : undefined}
            aria-label={`Lesson ${i + 1}: ${s.title}${cur ? ", playing" : lock ? ", locked" : isDone ? ", done" : ""}`}
          >
            {cur && watched > 0 && <span className="pl-fill" aria-hidden style={{ transform: `scaleX(${watched})` }} />}
            <span className="cd-n">{isDone && !cur ? <Check className="ic" /> : String(i + 1).padStart(2, "0")}</span>
            <span className="cd-lb">
              <span className="cd-lt">{s.title}</span>
              {(meta.length > 0 || (!p.owned && s.make_free)) && (
                <span className="cd-lm">
                  {meta.map((m, k) => <span key={k}>{k > 0 && " · "}{m}</span>)}
                  {!p.owned && s.make_free && <>{meta.length ? " · " : ""}<em>Free</em></>}
                </span>
              )}
            </span>
            <span className="cd-li">{lock ? <Lock className="ic" /> : <Play className="ic" fill="currentColor" />}</span>
          </button>
        );
      })}
    </div>
  );

  const pane = () => {
    if (shown === "lessons") {
      return total > 0 ? <>{progressLine}{lessons}</> : <p className="pl-empty">This is the only lesson so far.</p>;
    }
    if (shown === "notes") {
      return (
        <div className="pl-notes">
          <p className="pl-note-h">
            <span>Private to you. They sync to every device you sign in on.</span>
            {p.notes.saved && <b>Saved</b>}
          </p>
          {/* 16px text, or iOS zooms the page in on focus */}
          <textarea
            className="pl-note-in"
            value={p.notes.value}
            onChange={(e) => p.notes.onChange(e.target.value)}
            placeholder="Jot down what stood out"
            rows={8}
            aria-label="Your notes for this lesson"
          />
        </div>
      );
    }
    if (shown === "about") return <div className="pl-more pl-about">{p.about}</div>;
    if (shown === "files") {
      return p.resources.length === 0 ? (
        <p className="pl-empty">No files for this lesson.</p>
      ) : (
        <div className="pl-files">
          {p.resources.map((r) => (
            <a key={r.id} className="pl-file" href={r.file_url} target="_blank" rel="noopener noreferrer">
              <span className="pl-file-b">{ext(r.filename)}</span>
              <span className="pl-file-t"><b>{r.filename}</b>{r.file_size_bytes ? <em>{kb(r.file_size_bytes)}</em> : null}</span>
              <Download className="ic" aria-hidden />
            </a>
          ))}
        </div>
      );
    }
    return <div className="pl-more">{p.qna}</div>;
  };

  return (
    <div className="stage-ui pl-page">
      <div className="pl-bar" {...p.grab}>
        {p.showGrab && <span className="pl-grab" aria-hidden />}
        <button type="button" className="pl-ib pl-back" onClick={p.onBack} aria-label={`Back to ${p.backLabel}`}>
          <ChevronDown className="ic pl-ic-down" />
          <ArrowLeft className="ic pl-ic-left" />
          <span className="pl-back-l">{p.backLabel}</span>
        </button>
        <span className="pl-bar-t">{total > 0 ? `Lesson ${n} of ${total}` : p.courseTitle}</span>
        <button type="button" className="pl-ib pl-share" onClick={p.onShare} aria-label="Share">
          <Share2 className="ic" />
        </button>
        {p.loading && <i className="pl-load" aria-hidden />}
      </div>

      <div className="pl-grid">
        <div className="pl-main">
          <div className="pl-stage">{p.player}</div>

          <div className="pl-body">
            <div className="pl-head">
              <span className="eyebrow">{[total > 0 ? `Lesson ${n}` : null, p.courseTitle].filter(Boolean).join(" · ")}</span>
              <h1 className="pl-title">{p.title}</h1>
              {p.description && <p className="pl-desc">{p.description}</p>}
              <div className="pl-actions">
                {p.done ? (
                  <span className="pl-done"><CheckCircle2 className="ic" />Done</span>
                ) : (
                  <button type="button" className="btn btn--md btn--secondary" onClick={p.onDone} disabled={p.busy}>
                    <CheckCircle2 className="ic" />Mark as done
                  </button>
                )}
                {next && !locked(next) && (
                  <button type="button" className="btn btn--md" onClick={() => open(next)}>
                    Next lesson<ArrowRight className="ic" />
                  </button>
                )}
              </div>
              {p.upsell && (
                <div className="pl-upsell">
                  <Lock className="ic" aria-hidden />
                  <span>{p.upsell.text}</span>
                  <button type="button" className="btn btn--sm" onClick={p.upsell.open}>{p.upsell.label}</button>
                </div>
              )}
            </div>

            <div className="ex-tabs pl-tabs" role="tablist" aria-label="This lesson">
              {tabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={shown === t.key}
                  aria-label={t.dot ? `${t.label}, new reply` : undefined}
                  className={`pl-t-${t.key}${shown === t.key ? " is-on" : ""}`}
                  onClick={() => pick(t.key)}
                >
                  {t.label}
                  {t.count ? <span>{t.count}</span> : null}
                  {t.dot && <i className="pl-dot" aria-hidden />}
                </button>
              ))}
            </div>
            <div className="pl-pane" role="tabpanel">{pane()}</div>

            {p.quizzes && (
              <section className="sec pl-quiz" aria-labelledby="pl-quiz-h">
                <h2 className="sec-h" id="pl-quiz-h">Check what you learned</h2>
                <div className="pl-more">{p.quizzes}</div>
              </section>
            )}
          </div>
        </div>

        <aside className="pl-side" aria-label="Lessons">
          <div className="pl-side-h">
            <span className="eyebrow">{total} lesson{total === 1 ? "" : "s"}</span>
            {p.courseTitle && <p className="pl-side-t">{p.courseTitle}</p>}
            {progressLine}
          </div>
          {total > 0 && <div className="pl-side-list" ref={sideRef}>{lessons}</div>}
        </aside>
      </div>
    </div>
  );
}

/** The screen for a lesson they can't open yet, in place of "Enrolment required". */
export function StageLocked({ courseTitle, primary, secondary }: {
  courseTitle: string | null;
  primary: { label: string; onClick: () => void };
  secondary: { label: string; onClick: () => void };
}) {
  return (
    <div className="stage-ui pl-locked">
      <button type="button" className="pl-ib pl-locked-x" onClick={secondary.onClick} aria-label={secondary.label}>
        <ArrowLeft className="ic" />
      </button>
      <span className="pl-locked-i"><Lock className="ic" /></span>
      <h1 className="pl-locked-h">{courseTitle ? <>This lesson comes with {courseTitle}</> : "This lesson comes with the course"}</h1>
      <p className="pl-locked-s">Get the course to watch every lesson. The free ones are marked Free on the course page.</p>
      <div className="pl-locked-cta">
        <button type="button" className="btn btn--block" onClick={primary.onClick}>{primary.label}</button>
        <button type="button" className="btn btn--block btn--secondary" onClick={secondary.onClick}>{secondary.label}</button>
      </div>
    </div>
  );
}
