import type { ReactNode } from "react";
import { Check, Lock, Play, Sparkles } from "lucide-react";
import "@/styles/stage-ui.css";
import "@/components/stage/home/home.css";
import "./course.css";

/**
 * The course page (/courses/:id) under Stage, spec 12.1 and the round-4
 * mockup's detail view: the artwork with a scrim into the page, the title,
 * the facts as words, progress, one Ember action, then the lessons as plain
 * numbered rows (spec 7.8). CourseDetail keeps every rule (access, drip,
 * free lessons, locks) and hands this view the results.
 */

export interface StageLesson {
  id: string;
  n: number;
  title: string;
  meta: string[];
  free: boolean;
  locked: boolean;
  done: boolean;
  current: boolean;
  open: () => void;
}
export interface StageLessonGroup { id: string; title: string; done: number; lessons: StageLesson[] }
interface Action { label: string; onClick?: () => void; disabled?: boolean }

interface Props {
  art: string | null;
  kicker: string;
  title: string;
  subtitle: string | null;
  facts: string[];
  progress: { pct: number; done: number; total: number } | null;
  primary: Action;
  secondary?: (Action & { icon: "play" | "recap" }) | null;
  groups: StageLessonGroup[];
  /** the certificate card (CourseCertificate), shown under the header */
  certificate?: ReactNode;
  /** the legacy content blocks (about, outcomes, instructor...) */
  children?: ReactNode;
}

export default function StageCourse({ art, kicker, title, subtitle, facts, progress, primary, secondary, groups, certificate, children }: Props) {
  const total = groups.reduce((n, g) => n + g.lessons.length, 0);
  return (
    <div className="stage-ui cd-page">
      <header className="cd-top">
        <div className={`cd-art${art ? "" : " cd-art--none"}`}>{art && <img src={art} alt="" />}</div>
        <div className="cd-body">
          {kicker && <span className="eyebrow">{kicker}</span>}
          <h1 className="cd-title">{title}</h1>
          {subtitle && <p className="cd-lede">{subtitle}</p>}
          {facts.length > 0 && <p className="cd-meta">{facts.join(" · ")}</p>}
          {progress && (
            <div className="prog cd-prog">
              <span className="prog-bar"><i style={{ width: `${progress.pct}%` }} /></span>
              <span><b>{progress.pct}%</b> · {progress.done} of {progress.total} done</span>
            </div>
          )}
          <div className="cd-cta">
            <button type="button" className="btn btn--block" onClick={primary.onClick} disabled={primary.disabled}>
              {primary.label}
            </button>
            {secondary && (
              <button type="button" className="btn btn--block btn--secondary" onClick={secondary.onClick}>
                {secondary.icon === "play" ? <Play className="ic" fill="currentColor" /> : <Sparkles className="ic" />}
                {secondary.label}
              </button>
            )}
          </div>
        </div>
      </header>

      {certificate}

      {total > 0 && (
        <section className="sec cd-sec" aria-labelledby="cd-lessons-h">
          <div className="sec-head">
            <h2 className="sec-h" id="cd-lessons-h">Lessons</h2>
            <span className="cd-count">{total}</span>
          </div>
          {groups.map((g) => (
            <div key={g.id} className="cd-group">
              {groups.length > 1 && (
                <div className="cd-group-h">
                  <span>{g.title}</span>
                  <span className="cd-count">{g.done} of {g.lessons.length}</span>
                </div>
              )}
              <div className="cd-lessons">
                {g.lessons.map((l) => (
                  <button
                    key={l.id}
                    type="button"
                    className={`cd-lesson${l.locked ? " is-locked" : ""}${l.done ? " is-done" : ""}${l.current ? " is-current" : ""}`}
                    onClick={l.open}
                    aria-label={`Lesson ${l.n}: ${l.title}${l.locked ? ", locked" : l.done ? ", done" : ""}`}
                  >
                    <span className="cd-n">{l.done ? <Check className="ic" /> : String(l.n).padStart(2, "0")}</span>
                    <span className="cd-lb">
                      <span className="cd-lt">{l.title}</span>
                      {(l.meta.length > 0 || l.free) && (
                        <span className="cd-lm">
                          {l.meta.join(" · ")}
                          {l.free && <>{l.meta.length ? " · " : ""}<em>Free</em></>}
                        </span>
                      )}
                    </span>
                    <span className="cd-li">{l.locked ? <Lock className="ic" /> : <Play className="ic" fill="currentColor" />}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      {children && <div className="cd-more">{children}</div>}
    </div>
  );
}
