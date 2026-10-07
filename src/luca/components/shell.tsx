import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { Icon } from "./Icon";
import { Logo } from "./Logo";
import { CountUp } from "./ui";
import { useUI } from "./overlays";
import { useRefreshRoom, useRoom } from "../lib/api";
import { Derived } from "../lib/derive";
import type { Room } from "../lib/types";
import { sound } from "../lib/sound";
import * as T from "../lib/time";

/* ==========================================================================
   The room context: one envelope per program, re-derived every 30s so
   countdown-driven states (live / after) flip on their own.
   ========================================================================== */
interface RoomCtx { slug: string; room: Room; d: Derived; refresh: () => Promise<unknown> }
const Ctx = createContext<RoomCtx | null>(null);
export const useLuca = (): RoomCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLuca outside a program");
  return c;
};

export function RoomProvider({ slug, room, children }: { slug: string; room: Room; children: ReactNode }) {
  const refresh = useRefreshRoom(slug);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- tick re-derives against the moving clock
  const d = useMemo(() => new Derived(room, T.now()), [room, tick]);
  useRankWatch(d);
  return <Ctx.Provider value={{ slug, room, d, refresh }}>{children}</Ctx.Provider>;
}

/** "You're #6 now. You passed Aarav." — after any change that moves the board. */
function useRankWatch(d: Derived) {
  const ui = useUI();
  const prev = useRef<{ rank: number | null; clan: number | null; coins: number; ids: string[] } | null>(null);
  useEffect(() => {
    const rank = d.rank(), clan = d.clanRank(), coins = d.me?.coins ?? 0;
    const p = prev.current;
    const board = d.members();
    if (p && rank && p.rank && rank < p.rank && coins > p.coins) {
      const passed = board.slice(rank, p.rank).filter((m) => m.id !== d.me?.id).map((m) => m.name.split(" ")[0]);
      const who = passed.length === 1 ? passed[0] : passed.length === 2 ? passed.join(" and ") : passed.length ? `${passed[0]}, ${passed[1]} and ${passed.length - 2} more` : "";
      setTimeout(() => { ui.toast(<>You&apos;re <b>#{rank}</b> now.{who ? ` You passed ${who}.` : ""}</>, "trend-up"); sound.play("complete"); }, 1500);
    }
    if (p && clan && p.clan && clan < p.clan) {
      setTimeout(() => ui.toast(<>{d.myClan()?.name} moved up to <b>#{clan}</b> of {d.clans().length} Clans.</>, "users-three"), 3100);
    }
    prev.current = { rank, clan, coins, ids: board.map((m) => m.id) };
  }, [d, ui]);
}

/** Load a program by slug and provide it (or render the error/empty states). */
export function useProgramRoom() {
  const { slug = "" } = useParams();
  const q = useRoom(slug);
  return { slug, ...q };
}

/* ==========================================================================
   Chrome
   ========================================================================== */
export function Page({ cls, children, tabbar, bare }: { cls?: string; children: ReactNode; tabbar?: boolean; bare?: boolean }) {
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    window.scrollTo(0, 0);
    const t = setTimeout(() => setEntering(false), 900);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className={`page ${cls ?? ""}${entering ? " is-entering" : ""}${tabbar ? " has-tabbar" : ""}`}>
      {children}
      {!bare && <div className="end-space" />}
    </div>
  );
}

export function NavBar({ title, back, close, over, solidAt = 6, actions }: { title?: ReactNode; back?: string | true; close?: boolean; over?: boolean; solidAt?: number; actions?: ReactNode }) {
  const nav = useNavigate();
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    const on = () => setSolid(window.scrollY > solidAt);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [solidAt]);
  const goBack = () => {
    sound.play("tap");
    if (typeof back === "string") nav(back);
    else if (window.history.length > 1) nav(-1);
    else nav("..");
  };
  return (
    <header className={`navbar${over ? " navbar--over" : ""}${solid ? " is-solid" : ""}`}>
      {back ? <button className="icon-btn nb-back" type="button" aria-label={close ? "Close" : "Back"} onClick={goBack}><Icon name={close ? "x" : "caret-left"} /></button> : <span />}
      <div className="nb-title">{title}</div>
      <div className="nb-actions">{actions}</div>
    </header>
  );
}

const TABS = [
  { to: "today", icon: "house", label: "Today" },
  { to: "calendar", icon: "calendar-blank", label: "Calendar" },
  { to: "work", icon: "note-pencil", label: "Work" },
  { to: "recordings", icon: "play-circle", label: "Recordings" },
  { to: "clan", icon: "users-three", label: "Clan" },
];
export function TabBar() {
  const { slug } = useLuca();
  return (
    <nav className="tabbar" aria-label="Cohort">
      {TABS.map((t) => (
        <NavLink key={t.to} to={`/luca/${slug}/${t.to}`} className={({ isActive }) => `tb-item${isActive ? " is-on" : ""}`} onClick={() => sound.play("tap")}>
          <Icon name={t.icon} /><span>{t.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}

/** The top of every tab: logo, streak, coins, you. */
export function AppBar({ onStreak }: { onStreak: () => void }) {
  const { slug, d } = useLuca();
  const me = d.me;
  return (
    <header className="appbar lc-appbar rv">
      <span className="ab-logo"><Logo className="lu-logo--bar" /></span>
      <span className="ab-actions">
        <button className="lc-pill" type="button" aria-label="Streak" onClick={onStreak}><Icon name="flame-fill" /><b>{me?.streak ?? 0}</b></button>
        <Link className="lc-pill" to={`/luca/${slug}/clan?tab=coins`} aria-label="Coins"><Icon name="coin-vertical-fill" /><CountUp value={me?.coins ?? 0} /></Link>
        <Link className="avatar lc-me" to={`/luca/${slug}/me`} aria-label="You">{me?.initials || "Me"}</Link>
      </span>
    </header>
  );
}

export function TitleBar({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <header className="appbar appbar--title rv">
      <h1 className="h1">{title}</h1>
      {actions ? <span className="ab-actions">{actions}</span> : null}
    </header>
  );
}

/** A strip that says this is the hidden demo cohort, with a way to the day switcher. */
export function DemoBar() {
  const { slug, room } = useLuca();
  if (!room.program.is_demo) return null;
  return (
    <div className="lu-demo-bar">
      <span><b>Demo cohort</b> · sample data, no money moves</span>
      {room.is_staff ? <Link className="link" to={`/luca/${slug}/demo`}>Change day</Link> : null}
    </div>
  );
}
