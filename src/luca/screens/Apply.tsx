import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Icon } from "../components/Icon";
import { useLuca } from "../components/shell";
import { useUI } from "../components/overlays";
import { AsyncBtn } from "../components/ui";
import { fill, inr } from "../lib/format";
import { rpc, LucaError } from "../lib/api";
import { usePay } from "../lib/pay";
import { sound } from "../lib/sound";
import type { ApplyStep } from "../lib/types";

type Answers = { niche: string; handle: string; track: string; why: string; hours: boolean; email?: string; name?: string };
const blank: Answers = { niche: "", handle: "", track: "", why: "", hours: false };

/** An unsent application is a per-device draft (sessionStorage), nothing more. */
function useDraft(slug: string) {
  const key = `luca.apply.${slug}`;
  const [a, setA] = useState<Answers>(() => {
    try { return { ...blank, ...(JSON.parse(sessionStorage.getItem(key) || "{}") as Partial<Answers>) }; } catch { return blank; }
  });
  useEffect(() => { try { sessionStorage.setItem(key, JSON.stringify(a)); } catch { /* storage unavailable */ } }, [a, key]);
  return [a, setA] as const;
}

export default function Apply() {
  const { slug, room, refresh } = useLuca();
  const p = room.program;
  const nav = useNavigate();
  const ui = useUI();
  const pay = usePay(room);
  const { profile } = useAuth();
  const { step: stepParam } = useParams();
  const step = Math.max(1, Math.min(3, parseInt(stepParam || "1", 10) || 1));
  const steps = (p.content.apply?.steps ?? []) as ApplyStep[];
  const q = steps[step - 1];
  const [a, setA] = useDraft(slug);
  const needEmail = !profile?.email;
  const needName = !profile?.full_name;

  // Already applied: the application status is the right place.
  useEffect(() => {
    const st = room.application?.status;
    if (st && st !== "submitted") nav(`/luca/${slug}/status`, { replace: true });
  }, [room.application, nav, slug]);
  useEffect(() => {
    if (room.access === "learner") nav(`/luca/${slug}/today`, { replace: true });
  }, [room.access, nav, slug]);

  if (!q) return null;
  const set = (patch: Partial<Answers>) => setA((x) => ({ ...x, ...patch }));
  const goNext = () => { sound.play("tap"); nav(`/luca/${slug}/apply/${step + 1}`); };

  const submit = async () => {
    try {
      const res = await rpc<{ application_id: string; status: string; demo: boolean }>("luca_apply", {
        p_slug: slug,
        p_answers: { niche: a.niche, handle: a.handle, track: a.track, why: a.why, hours: a.hours, email: a.email, name: a.name },
      });
      await refresh();
      if (res.status !== "submitted") { nav(`/luca/${slug}/interview`); return; }
      pay("app_fee", {
        title: "Application fee", sub: "Refundable under our refund policy", amount: p.pricing.app_fee,
        applicationId: res.application_id,
        onPaid: async () => {
          try { sessionStorage.removeItem(`luca.apply.${slug}`); } catch { /* ignore */ }
          await refresh();
          nav(`/luca/${slug}/interview`);
        },
      });
    } catch (e) {
      sound.play("error");
      ui.toast(e instanceof LucaError ? e.message : "That didn't go through. Try once more?", "warning-circle");
    }
  };

  const dots = (
    <div className="ob-steps" aria-label={`Step ${step} of 3`}>
      {[1, 2, 3].map((k) => <i key={k} className={k <= step ? "is-on" : ""} />)}
    </div>
  );
  const head = (
    <>
      <div className="eyebrow rv">{fill(q.eyebrow, p)}</div>
      <h1 className="h1 rv">{q.title}</h1>
      {q.sub ? <p className="muted rv">{q.sub}</p> : null}
    </>
  );

  let body = null;
  if (q.kind === "text") {
    const v = (a as Record<string, unknown>)[q.field.key] as string;
    const demoFill = () => {
      const target = "Money for your first salary", handle = "@diya.firstsalary";
      let i = 0;
      const iv = setInterval(() => {
        i++; set({ [q.field.key]: target.slice(0, i), ...(q.field2 ? { [q.field2.key]: handle.slice(0, i) } : {}) } as Partial<Answers>);
        sound.play("key");
        if (i >= target.length) clearInterval(iv);
      }, 30);
    };
    body = (
      <>
        {head}
        <label className="field rv"><span className="label">{q.field.label}</span>
          <span className="input-wrap"><input className="input" value={v} placeholder={q.field.ph} autoComplete="off" maxLength={160} onChange={(e) => set({ [q.field.key]: e.target.value } as Partial<Answers>)} /></span>
        </label>
        {q.chips?.length ? (
          <div className="ap-chips rv">
            {q.chips.map((c) => <button key={c} type="button" className={`chip${v === c ? " is-on" : ""}`} onClick={() => { set({ [q.field.key]: c } as Partial<Answers>); sound.play("toggle"); }}>{c}</button>)}
          </div>
        ) : null}
        {q.field2 ? (
          <label className="field rv"><span className="label">{q.field2.label} <em className="ap-opt">optional</em></span>
            <span className="input-wrap"><input className="input" value={(a as Record<string, unknown>)[q.field2.key] as string} placeholder={q.field2.ph} autoComplete="off" maxLength={80} onChange={(e) => set({ [q.field2!.key]: e.target.value } as Partial<Answers>)} /></span>
          </label>
        ) : null}
        {needName ? (
          <label className="field rv"><span className="label">Your full name</span>
            <span className="input-wrap"><input className="input" value={a.name ?? ""} autoComplete="name" onChange={(e) => set({ name: e.target.value })} /></span>
          </label>
        ) : null}
        {needEmail ? (
          <label className="field rv"><span className="label">Your email</span>
            <span className="input-wrap"><input className="input" type="email" inputMode="email" value={a.email ?? ""} autoComplete="email" onChange={(e) => set({ email: e.target.value })} /></span>
          </label>
        ) : null}
        <button className="btn btn-lg btn-block rv" type="button" disabled={v.trim().length < 3 || (needEmail && !/^\S+@\S+\.\S+$/.test(a.email ?? "")) || (needName && (a.name ?? "").trim().length < 2)} onClick={goNext}>Next</button>
        {p.is_demo ? <p className="fine rv"><button type="button" className="linkish" onClick={demoFill}>Fill a demo answer</button> to move fast.</p> : null}
      </>
    );
  } else if (q.kind === "choice") {
    const v = (a as Record<string, unknown>)[q.key] as string;
    body = (
      <>
        {head}
        <div className="stack-2 rv">
          {q.options.map((o) => (
            <button key={o.v} type="button" className={`pref${v === o.v ? " is-on" : ""}`} onClick={() => { set({ [q.key]: o.v } as Partial<Answers>); sound.play("toggle"); }}>
              <span><span className="pref-t">{o.t}</span><span className="pref-d">{o.d}</span></span><span className="pref-radio" />
            </button>
          ))}
        </div>
        <button className="btn btn-lg btn-block rv" type="button" disabled={!v} onClick={goNext}>Next</button>
      </>
    );
  } else {
    const v = (a as Record<string, unknown>)[q.key] as string;
    const ready = !!v && a.hours && a.niche.trim().length >= 3 && !!a.track;
    body = (
      <>
        {head}
        <div className="ap-whys rv">
          {q.options.map((w) => <button key={w} type="button" className={`ap-why${v === w ? " is-on" : ""}`} onClick={() => { set({ [q.key]: w } as Partial<Answers>); sound.play("toggle"); }}>{w}</button>)}
        </div>
        {q.hours ? (
          <div className="ap-hours rv">
            <span><b>{q.hours.b}</b><em>{q.hours.em}</em></span>
            <button type="button" className={`switch${a.hours ? " is-on" : ""}`} role="switch" aria-checked={a.hours} aria-label="I can give that" onClick={() => { set({ hours: !a.hours }); sound.play("toggle"); sound.buzz(8); }}><i /></button>
          </div>
        ) : null}
        <AsyncBtn cls="btn-lg btn-block rv" disabled={!ready} onClick={submit}>Continue to the {inr(p.pricing.app_fee)} fee</AsyncBtn>
        <p className="fine center rv">{fill(p.content.apply?.fee_fine, p)}</p>
        {!a.niche || !a.track ? <p className="fine center rv"><button type="button" className="linkish" onClick={() => nav(`/luca/${slug}/apply/1`)}>Finish questions 1 and 2 first</button></p> : null}
      </>
    );
  }

  return (
    <div className="page page--form page--apply is-entering">
      <header className="navbar">
        <button className="icon-btn nb-back" type="button" aria-label="Back" onClick={() => nav(step > 1 ? `/luca/${slug}/apply/${step - 1}` : `/luca/${slug}/program`)}><Icon name="caret-left" /></button>
        <div className="nb-title">{dots}</div>
        <div className="nb-actions" />
      </header>
      <div className="form-wrap">{body}</div>
    </div>
  );
}
