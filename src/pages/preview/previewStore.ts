/**
 * The playable state for the Creator Studio prototype.
 *
 * "Make it functional for me to go and fuck around" — so the whole learning
 * loop is now real, just local: complete a day → XP and streak move → the next
 * day unlocks → submit the block → Week 5 (and its recording) unlock → the
 * mentor desk can approve it → the approved work can be placed in the Album →
 * a feed post actually posts. Progress persists in localStorage so it survives
 * a refresh, and a reset button puts everything back.
 *
 * 🔴 STILL ZERO DATABASE. This file is the entire backend: a reducer and
 * localStorage. When this graduates, the reducer's action names become the RPC
 * names (`complete_day`, `submit_block`, …) — that mapping is the point.
 */
import { useEffect, useReducer } from "react";

export interface PlayDay {
  id: string;
  label: string;
  title: string;
  xp: number;
  state: "done" | "current" | "locked";
  isBlock?: boolean;
  note?: string;
}

export interface PlayState {
  xp: number;
  streak: number;
  days: PlayDay[];
  /** Week 4's block submission. */
  blockText: string;
  blockStatus: "none" | "submitted" | "accepted";
  week5Unlocked: boolean;
  albumFilled: string[]; // slot codes
  feedPosts: Array<{ id: string; author: string; body: string; url?: string; ts: number }>;
  brain: { url: string; status: "idle" | "working" | "done" } ;
}

export const INITIAL: PlayState = {
  xp: 840,
  streak: 6,
  days: [
    { id: "d1", label: "Sun 3 PM", title: "Live class — lighting depth + the B-roll Bank", xp: 20, state: "done" },
    { id: "d2", label: "Mon", title: "Build your reusable B-roll bank", xp: 10, state: "done" },
    { id: "d3", label: "Wed", title: "Write 3 hooks for one idea", xp: 10, state: "current", note: "Unlocks Second Brain" },
    { id: "d4", label: "Thu 9 PM", title: "The block — 3 reels from one sitting", xp: 25, state: "locked", isBlock: true },
    { id: "d5", label: "Sat 6 PM", title: "Ship / Fix / Hold", xp: 15, state: "locked" },
  ],
  blockText: "",
  blockStatus: "none",
  week5Unlocked: false,
  albumFilled: [],
  feedPosts: [],
  brain: { url: "", status: "idle" },
};

export type PlayAction =
  | { type: "complete_day"; id: string }
  | { type: "submit_block"; text: string }
  | { type: "mentor_accept" }
  | { type: "add_to_album"; slot: string }
  | { type: "post_feed"; body: string; url?: string }
  | { type: "brain_capture"; url: string }
  | { type: "brain_done" }
  | { type: "reset" };

export function reduce(s: PlayState, a: PlayAction): PlayState {
  switch (a.type) {
    case "complete_day": {
      const i = s.days.findIndex((d) => d.id === a.id);
      if (i < 0 || s.days[i].state !== "current") return s;
      const days = s.days.map((d, j) =>
        j === i ? { ...d, state: "done" as const } : j === i + 1 && d.state === "locked" ? { ...d, state: "current" as const } : d,
      );
      return { ...s, days, xp: s.xp + s.days[i].xp, streak: s.streak + 1 };
    }
    case "submit_block": {
      if (!a.text.trim()) return s;
      const days = s.days.map((d) => (d.isBlock ? { ...d, state: "done" as const } : d));
      // Submitting the block is what opens Week 5 — the gate rule, played out.
      return { ...s, days, blockText: a.text.trim(), blockStatus: "submitted", week5Unlocked: true, xp: s.xp + 25 };
    }
    case "mentor_accept":
      return s.blockStatus === "submitted" ? { ...s, blockStatus: "accepted" } : s;
    case "add_to_album":
      return s.blockStatus === "accepted" && !s.albumFilled.includes(a.slot)
        ? { ...s, albumFilled: [...s.albumFilled, a.slot] }
        : s;
    case "post_feed":
      if (!a.body.trim() && !a.url) return s;
      return {
        ...s,
        feedPosts: [{ id: `p${Date.now()}`, author: "You", body: a.body.trim(), url: a.url, ts: Date.now() }, ...s.feedPosts],
      };
    case "brain_capture":
      return { ...s, brain: { url: a.url, status: "working" } };
    case "brain_done":
      return { ...s, brain: { ...s.brain, status: "done" } };
    case "reset":
      return INITIAL;
    default:
      return s;
  }
}

const KEY = "creator-studio-preview-v1";

export function usePlayState(): [PlayState, React.Dispatch<PlayAction>] {
  const [state, dispatch] = useReducer(reduce, INITIAL, (init) => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return init;
      const saved = JSON.parse(raw) as PlayState;
      // A shape mismatch after a prototype update must reset, not crash.
      return Array.isArray(saved.days) && typeof saved.xp === "number" ? saved : init;
    } catch {
      return init;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full/blocked — fine */ }
  }, [state]);
  return [state, dispatch];
}

/** Detect what a pasted link is, for the feed's preview card. */
export function linkKind(url: string): "youtube" | "instagram" | "drive" | "generic" {
  if (/youtu\.?be/i.test(url)) return "youtube";
  if (/instagram\.com/i.test(url)) return "instagram";
  if (/drive\.google/i.test(url)) return "drive";
  return "generic";
}
