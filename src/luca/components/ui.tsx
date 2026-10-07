import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";
import { Graph } from "./Logo";
import * as T from "../lib/time";
import { num } from "../lib/format";

/** Re-render every `ms` so countdowns move. */
export function useNow(ms = 1000): Date {
  const [n, setN] = useState(() => T.now());
  useEffect(() => {
    const id = setInterval(() => setN(T.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** hms / dhm big ticker, or a short "2h 04m" inline. */
export function Count({ to, fmt, zero = "now", cls }: { to: string | Date; fmt: "hms" | "dhm" | "left"; zero?: string; cls?: string }) {
  const now = useNow(1000);
  const ms = T.toDate(to).getTime() - now.getTime();
  if (fmt === "left") return <span className={`lc-cnt ${cls ?? ""}`}>{ms <= 0 ? zero : T.left(ms)}</span>;
  const s = Math.max(0, Math.floor(ms / 1000));
  const cells: [string, number][] = fmt === "dhm"
    ? [["d", Math.floor(s / 86400)], ["h", Math.floor((s % 86400) / 3600)], ["m", Math.floor((s % 3600) / 60)]]
    : [["h", Math.floor(s / 3600)], ["m", Math.floor((s % 3600) / 60)], ["s", s % 60]];
  return (
    <div className={`hs-count ${cls ?? ""}`} role="timer">
      {cells.map(([k, v]) => <span key={k} className="hs-num"><b>{pad2(v)}</b><i>{k}</i></span>)}
    </div>
  );
}

export function Bar({ p, cls }: { p: number; cls?: string }) {
  return <span className={`bar ${cls ?? ""}`}><i style={{ width: `${Math.round(Math.max(0, Math.min(1, p)) * 100)}%` }} /></span>;
}

export function Check({ on }: { on: boolean }) {
  return <span className={`lc-ck ${on ? "is-on" : ""}`} aria-hidden="true"><Icon name="check" /></span>;
}

const V_LABEL: Record<string, string> = {
  ship: "Ship", fix: "Fix", hold: "Hold", pending: "In review", due: "Due", open: "Open", soon: "Upcoming",
  fixed: "Fixed, in review", late: "Late", missed: "Missed",
};
export function VChip({ v, cls }: { v: string; cls?: string }) {
  return <span className={`vd vd--${v} ${cls ?? ""}`}>{V_LABEL[v] ?? v}</span>;
}

export interface Person { name?: string | null; initials?: string | null; photo_url?: string | null }
export function Av({ p, cls }: { p: Person | null | undefined; cls?: string }) {
  if (!p) return null;
  if (p.photo_url) return <span className={`lc-av ${cls ?? ""}`}><img src={p.photo_url} alt="" loading="lazy" decoding="async" /></span>;
  const ini = p.initials || (p.name ?? "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
  return <span className={`lc-av lc-av--ini ${cls ?? ""}`}>{ini}</span>;
}
export function AvStack({ people, cls }: { people: Person[]; cls?: string }) {
  return <span className={`lc-avs ${cls ?? ""}`}>{people.map((p, i) => <Av key={i} p={p} />)}</span>;
}

export function LivePill({ label = "Live", cls }: { label?: string; cls?: string }) {
  return <span className={`live-pill ${cls ?? ""}`}><i />{label}</span>;
}

export function SecHead({ title, sub, link, to, onLink, cls }: { title: ReactNode; sub?: ReactNode; link?: string; to?: string; onLink?: () => void; cls?: string }) {
  return (
    <div className={`sec-head rv ${cls ?? ""}`}>
      <div><h2 className="h2">{title}</h2>{sub ? <p className="sec-sub">{sub}</p> : null}</div>
      {link && to ? <Link className="link" to={to}>{link}</Link> : link && onLink ? <button className="link" type="button" onClick={onLink}>{link}</button> : null}
    </div>
  );
}

export function Empty({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="empty rv">
      <span className="empty-mark"><GraphMark /></span>
      <div className="empty-t">{title}</div>
      {sub ? <p className="empty-s">{sub}</p> : null}
      {children}
    </div>
  );
}

export function GraphMark({ cls, drawn }: { cls?: string; drawn?: boolean }) {
  return <Graph className={`${cls ?? ""}${drawn ? " is-drawn" : ""}`} />;
}

/** A number that counts up when it grows, and bumps. */
export function CountUp({ value, cls }: { value: number; cls?: string }) {
  const [shown, setShown] = useState(value);
  const prev = useRef(value);
  const [bump, setBump] = useState(false);
  useEffect(() => {
    const from = prev.current, to = value;
    prev.current = value;
    if (from === to) return;
    if (to < from) { setShown(to); return; }
    setBump(true);
    const t0 = performance.now(), d = 800;
    let raf = 0;
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / d), e = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const off = setTimeout(() => setBump(false), 600);
    return () => { cancelAnimationFrame(raf); clearTimeout(off); };
  }, [value]);
  return <b className={`${cls ?? ""}${bump ? " is-bump" : ""}`}>{num(shown)}</b>;
}

/**
 * The cohort drawn as the logo's rising line: one node per week, Week 0 to
 * Demo Day. `cur` is the current week (-1 before Orientation; n = past the end).
 */
export function Arc({ n, cur, special, labels, to, cls }: { n: number; cur: number; special?: [number, number]; labels: [number, string][]; to?: string; cls?: string }) {
  const W = 358, H = 66, pad = 7, zig = 9;
  const SP = special ?? [Math.max(0, n - 4), Math.max(0, n - 2)];
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = pad + (i * (W - 2 * pad)) / Math.max(1, n - 1);
    const y = H - pad - 4 - (i * (H - 2 * pad - 4 - zig)) / Math.max(1, n - 1) - (i % 2 ? zig : 0);
    pts.push([x, y]);
  }
  const iStyle = (i: number) => ({ ["--i" as string]: i }) as CSSProperties;
  const body = (
    <>
      <div className="arc-c">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {pts.slice(0, -1).map(([x1, y1], i) => {
            const [x2, y2] = pts[i + 1];
            const st = i < cur ? "done" : "todo";
            const sprint = i >= SP[0] && i < SP[1];
            return <line key={`l${i}`} className={`arc-l arc-l--${st}${sprint ? " arc-l--sprint" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2} style={iStyle(i)} />;
          })}
          {pts.map(([x, y], i) => {
            const st = i < cur ? "done" : i === cur ? "now" : "todo";
            const r = i === n - 1 ? 6 : 4.2;
            return (
              <g key={`n${i}`}>
                {st === "now" && <circle className="arc-halo" cx={x} cy={y} r={r + 5} />}
                <circle className={`arc-n arc-n--${st}${i === n - 1 ? " arc-n--demo" : ""}`} cx={x} cy={y} r={r} style={iStyle(i)} />
              </g>
            );
          })}
        </svg>
        {cur >= 0 && cur <= n - 1 && pts[cur] ? (
          <span className="arc-you" style={{ left: `${(pts[cur][0] / W) * 100}%`, top: `${(pts[cur][1] / H) * 100}%` }}>You</span>
        ) : null}
      </div>
      <div className="arc-labels">
        {labels.filter(([i]) => pts[i]).map(([i, t]) => (
          <span key={i} className={`arc-t ${i === cur ? "is-now" : ""}`} style={{ left: `${(pts[i][0] / W) * 100}%` }}>{t}</span>
        ))}
      </div>
    </>
  );
  return to
    ? <Link className={`arc ${cls ?? ""}`} to={to} aria-label="Open the cohort calendar">{body}</Link>
    : <div className={`arc ${cls ?? ""}`}>{body}</div>;
}

export function Spinner() {
  return <span className="lu-loader"><Graph /></span>;
}

/** A button that shows the logo loader while its async action runs. */
export function AsyncBtn({ onClick, children, cls, disabled, busyLabel }: { onClick: () => Promise<unknown> | void; children: ReactNode; cls?: string; disabled?: boolean; busyLabel?: string }) {
  const [busy, setBusy] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  return (
    <button type="button" className={`btn ${cls ?? ""}${busy ? " is-loading" : ""}`} disabled={disabled || busy}
      onClick={async () => {
        if (busy) return;
        setBusy(true);
        try { await onClick(); } finally { if (alive.current) setBusy(false); }
      }}>
      {busy ? <><Spinner /><span className="btn-label">{busyLabel ?? "Working"}</span></> : children}
    </button>
  );
}
