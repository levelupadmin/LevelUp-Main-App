import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "./Icon";
import { Graph } from "./Logo";
import { Av, type Person } from "./ui";
import { sound } from "../lib/sound";

/* ==========================================================================
   Toasts, sheets and moments. Rendered inside the .luca root so the scoped
   styles apply; all of them are fixed to the viewport (see luca.css).
   ========================================================================== */

export interface MomentOpts {
  eyebrow?: string; title: string; sub?: string;
  coins?: number; coinsWhy?: string; extra?: ReactNode;
  cta?: string; alt?: string; sonic?: boolean;
  onDone?: () => void; onAlt?: () => void;
}
export interface RevealOpts {
  kicker: string; name: string; sub: string; cta: string;
  people: (Person & { label: string; niche?: string | null })[];
  onDone?: () => void;
}
interface SheetOpts { label: string; cls?: string; render: (close: () => void) => ReactNode; onClose?: () => void }
interface Toast { id: number; node: ReactNode; icon?: string; out?: boolean }
interface Sheet extends SheetOpts { id: number; out?: boolean }

interface UI {
  toast: (node: ReactNode, icon?: string) => void;
  sheet: (opts: SheetOpts) => () => void;
  moment: (opts: MomentOpts) => void;
  reveal: (opts: RevealOpts) => void;
  welcome: (opts: { eyebrow: string; title: string; onReveal?: () => void }) => void;
}
const Ctx = createContext<UI | null>(null);
export const useUI = (): UI => {
  const ui = useContext(Ctx);
  if (!ui) throw new Error("useUI outside LucaUIProvider");
  return ui;
};

let seq = 1;

export function LucaUIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [sheets, setSheets] = useState<Sheet[]>([]);
  const [moment, setMoment] = useState<(MomentOpts & { id: number }) | null>(null);
  const [reveal, setReveal] = useState<(RevealOpts & { id: number }) | null>(null);
  const [welcome, setWelcome] = useState<{ id: number; eyebrow: string; title: string; onReveal?: () => void } | null>(null);

  const toast = useCallback((node: ReactNode, icon?: string) => {
    const id = seq++;
    setToasts((ts) => [...ts.slice(-2), { id, node, icon }]);
    setTimeout(() => setToasts((ts) => ts.map((t) => (t.id === id ? { ...t, out: true } : t))), 2800);
    setTimeout(() => setToasts((ts) => ts.filter((t) => t.id !== id)), 3100);
  }, []);

  const closeSheet = useCallback((id: number) => {
    setSheets((ss) => ss.map((s) => (s.id === id ? { ...s, out: true } : s)));
    setTimeout(() => setSheets((ss) => {
      const s = ss.find((x) => x.id === id);
      s?.onClose?.();
      return ss.filter((x) => x.id !== id);
    }), 280);
  }, []);

  const sheet = useCallback((opts: SheetOpts) => {
    const id = seq++;
    sound.play("open");
    setSheets((ss) => [...ss, { ...opts, id }]);
    return () => closeSheet(id);
  }, [closeSheet]);

  const ui = useMemo<UI>(() => ({
    toast,
    sheet,
    moment: (o) => setMoment({ ...o, id: seq++ }),
    reveal: (o) => setReveal({ ...o, id: seq++ }),
    welcome: (o) => setWelcome({ ...o, id: seq++ }),
  }), [toast, sheet]);

  // Escape / Android back closes the top sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const top = [...sheets].reverse().find((s) => !s.out);
      if (top) closeSheet(top.id);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheets, closeSheet]);

  return (
    <Ctx.Provider value={ui}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.out ? " is-out" : ""}`} role="status">
            {t.icon ? <Icon name={t.icon} /> : null}<span>{t.node}</span>
          </div>
        ))}
      </div>
      {sheets.map((s) => (
        <div key={s.id} className={`sheet-wrap${s.out ? " is-out" : ""}`} data-overlay-open="true">
          <div className="sheet-backdrop" onClick={() => closeSheet(s.id)} />
          <div className={`sheet ${s.cls ?? ""}`} role="dialog" aria-modal="true" aria-label={s.label}>
            <div className="sheet-grip"><span /></div>
            <div className="sheet-body">{s.render(() => closeSheet(s.id))}</div>
          </div>
        </div>
      ))}
      <div className="fx-layer">
        {moment && <Moment key={moment.id} o={moment} onGone={() => setMoment(null)} />}
        {reveal && <Reveal key={reveal.id} o={reveal} onGone={() => setReveal(null)} />}
        {welcome && <Welcome key={welcome.id} o={welcome} onGone={() => setWelcome(null)} />}
      </div>
    </Ctx.Provider>
  );
}

function Moment({ o, onGone }: { o: MomentOpts; onGone: () => void }) {
  const [inn, setIn] = useState(false);
  const [out, setOut] = useState(false);
  const done = useRef(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setIn(true)));
    if (o.sonic) setTimeout(() => sound.sonicLogo(), 120); else sound.nodes(160, 120);
    sound.buzz([10, 40, 10, 40, 18]);
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once, on open
  }, []);
  const close = (alt: boolean) => {
    if (done.current) return;
    done.current = true;
    setOut(true);
    setTimeout(onGone, 380);
    if (alt) o.onAlt?.(); else o.onDone?.();
  };
  return (
    <div className={`moment${inn ? " is-in" : ""}${out ? " is-out" : ""}`} role="status">
      <div className="mo-bg" />
      <div className="mo-in">
        <div className={`mo-mark done-mark${inn ? " is-drawn" : ""}`}><Graph /></div>
        {o.eyebrow ? <div className="mo-k">{o.eyebrow}</div> : null}
        <div className="mo-t">{o.title}</div>
        {o.sub ? <p className="mo-s">{o.sub}</p> : null}
        {o.coins ? <div className="mo-coins"><Icon name="coin-vertical-fill" /><b>+{o.coins}</b><span>{o.coinsWhy ?? "coins"}</span></div> : null}
        {o.extra}
        <div className="mo-acts">
          <button className="btn btn-lg btn-block mo-cta" type="button" onClick={() => { sound.play("tap"); close(false); }}>{o.cta ?? "Done"}</button>
          {o.alt ? <button className="btn-text mo-alt" type="button" onClick={() => close(true)}>{o.alt}</button> : null}
        </div>
      </div>
    </div>
  );
}

function Reveal({ o, onGone }: { o: RevealOpts; onGone: () => void }) {
  const [inn, setIn] = useState(false);
  const [out, setOut] = useState(false);
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setIn(true)));
    setTimeout(() => sound.sonicLogo(), 250);
    o.people.forEach((_, i) => setTimeout(() => sound.play("key"), 1500 + i * 180));
    sound.buzz([10, 50, 10, 50, 20]);
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- plays once, on open
  }, []);
  const iStyle = (i: number) => ({ ["--i" as string]: i }) as CSSProperties;
  return (
    <div className={`reveal${inn ? " is-in" : ""}${out ? " is-out" : ""}`}>
      <div className="rvl-bg" />
      <div className="rvl-in">
        <div className="rvl-k">{o.kicker}</div>
        <div className="rvl-name">{o.name.split("").map((c, i) => <span key={i} style={iStyle(i)}>{c === " " ? " " : c}</span>)}</div>
        <ul className="rvl-list">
          {o.people.map((p, i) => (
            <li key={i} style={iStyle(i)}><Av p={p} cls="lc-av--md" /><span><b>{p.label}</b><em>{p.niche ?? ""}</em></span></li>
          ))}
        </ul>
        <p className="rvl-s">{o.sub}</p>
        <button className="btn btn-lg btn-block" type="button" onClick={() => { setOut(true); setTimeout(onGone, 380); o.onDone?.(); }}>{o.cta}</button>
      </div>
    </div>
  );
}

function Welcome({ o, onGone }: { o: { eyebrow: string; title: string; onReveal?: () => void }; onGone: () => void }) {
  const [playing, setPlaying] = useState(false);
  const [out, setOut] = useState(false);
  const cb = useRef({ o, onGone });
  cb.current = { o, onGone };
  useEffect(() => {
    const r = requestAnimationFrame(() => setPlaying(true));
    sound.sonicLogo();
    sound.buzz([10, 60, 10, 60, 10, 60, 24]);
    const t1 = setTimeout(() => { setOut(true); cb.current.o.onReveal?.(); }, 2300);
    const t2 = setTimeout(() => cb.current.onGone(), 2950);
    return () => { cancelAnimationFrame(r); clearTimeout(t1); clearTimeout(t2); };
  }, []);
  return (
    <div className={`welcome welcome--marquee${playing ? " is-playing" : ""}${out ? " is-out" : ""}`}>
      <div className="wl-bg" />
      <div className="wl-graph"><Graph ripples /></div>
      <div className="wl-text"><div className="wl-eyebrow">{o.eyebrow}</div><div className="wl-title">{o.title}</div></div>
    </div>
  );
}
