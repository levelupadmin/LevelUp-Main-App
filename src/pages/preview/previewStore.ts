/**
 * The playable state for the Creator Studio prototype.
 *
 * The whole learning loop is real, just local: watch the recording → it
 * completes the day and hands you to the unfinished assignment → submit the
 * block → Week 5 (and its recording) unlock → the mentor desk can approve it →
 * the approved work can be placed in the Album → the feed takes posts, likes
 * and comments. Progress persists in localStorage so it survives a refresh,
 * and a reset button puts everything back.
 *
 * 🔴 STILL ZERO DATABASE. This file is the entire backend: a reducer and
 * localStorage. When this graduates, the reducer's action names become the RPC
 * names (`complete_day`, `watch_recording`, `submit_block`, …) — that mapping
 * is the point.
 */
import { useEffect, useReducer } from "react";
import { SEED_POSTS, type PostType } from "./previewData";

export interface PlayDay {
  id: string;
  label: string;
  title: string;
  xp: number;
  state: "done" | "current" | "locked";
  isBlock?: boolean;
  note?: string;
}

export interface PlayPost {
  id: string;
  author: string;
  initials: string;
  type: PostType;
  body: string;
  url?: string;
  urlTitle?: string;
  when: string;
  likes: number;
  likedByMe: boolean;
  comments: Array<{ author: string; body: string }>;
  mine?: boolean;
}

export interface PlayState {
  xp: number;
  streak: number;
  days: PlayDay[];
  /** Recording ids (`rec-w4`) the student marked watched. */
  watched: string[];
  /** Week 4's block submission. */
  blockText: string;
  blockStatus: "none" | "submitted" | "accepted";
  week5Unlocked: boolean;
  albumFilled: string[]; // slot codes
  posts: PlayPost[];
}

const SEEDED: PlayPost[] = SEED_POSTS.map((p) => ({
  id: p.id,
  author: p.author,
  initials: p.initials,
  type: p.type,
  body: p.body,
  url: p.url,
  urlTitle: p.urlTitle,
  when: p.when,
  likes: p.likes,
  likedByMe: false,
  comments: p.comments,
}));

export const INITIAL: PlayState = {
  xp: 840,
  streak: 6,
  days: [
    { id: "d1", label: "Sun 3 PM", title: "Live class — lighting depth + the B-roll Bank", xp: 20, state: "done" },
    { id: "d2", label: "Mon", title: "Build your reusable B-roll bank", xp: 10, state: "done" },
    { id: "d3", label: "Wed", title: "Watch the class recording", xp: 10, state: "current", note: "Hands you straight to the block" },
    { id: "d4", label: "Thu 9 PM", title: "The block — 3 reels from one sitting", xp: 25, state: "locked", isBlock: true },
    { id: "d5", label: "Sat 6 PM", title: "Ship / Fix / Hold", xp: 15, state: "locked" },
  ],
  watched: [],
  blockText: "",
  blockStatus: "none",
  week5Unlocked: false,
  albumFilled: [],
  posts: SEEDED,
};

export type PlayAction =
  | { type: "complete_day"; id: string }
  | { type: "watch_recording"; week: number }
  | { type: "submit_block"; text: string }
  | { type: "mentor_accept" }
  | { type: "add_to_album"; slot: string }
  | { type: "post_feed"; postType: PostType; body: string; url?: string }
  | { type: "toggle_like"; id: string }
  | { type: "add_comment"; id: string; body: string }
  | { type: "reset" };

function completeDay(s: PlayState, id: string): PlayState {
  const i = s.days.findIndex((d) => d.id === id);
  if (i < 0 || s.days[i].state !== "current") return s;
  const days = s.days.map((d, j) =>
    j === i ? { ...d, state: "done" as const } : j === i + 1 && d.state === "locked" ? { ...d, state: "current" as const } : d,
  );
  return { ...s, days, xp: s.xp + s.days[i].xp, streak: s.streak + 1 };
}

export function reduce(s: PlayState, a: PlayAction): PlayState {
  switch (a.type) {
    case "complete_day":
      return completeDay(s, a.id);
    case "watch_recording": {
      const id = `rec-w${a.week}`;
      if (s.watched.includes(id)) return s;
      // Watching the CURRENT week's recording is the Wed day — completing it
      // is what hands the student to the block. Past weeks are pure revisit.
      const afterDay = a.week === 4 ? completeDay(s, "d3") : s;
      return { ...afterDay, watched: [...s.watched, id] };
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
    case "post_feed": {
      if (!a.body.trim() && !a.url) return s;
      const post: PlayPost = {
        id: `p${Date.now()}`,
        author: "You",
        initials: "YO",
        type: a.postType,
        body: a.body.trim(),
        url: a.url,
        when: "just now",
        likes: 0,
        likedByMe: false,
        comments: [],
        mine: true,
      };
      return { ...s, posts: [post, ...s.posts] };
    }
    case "toggle_like":
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === a.id ? { ...p, likedByMe: !p.likedByMe, likes: p.likes + (p.likedByMe ? -1 : 1) } : p,
        ),
      };
    case "add_comment":
      if (!a.body.trim()) return s;
      return {
        ...s,
        posts: s.posts.map((p) =>
          p.id === a.id ? { ...p, comments: [...p.comments, { author: "You", body: a.body.trim() }] } : p,
        ),
      };
    case "reset":
      return INITIAL;
    default:
      return s;
  }
}

const KEY = "creator-studio-preview-v2";

export function usePlayState(): [PlayState, React.Dispatch<PlayAction>] {
  const [state, dispatch] = useReducer(reduce, INITIAL, (init) => {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return init;
      const saved = JSON.parse(raw) as PlayState;
      // A shape mismatch after a prototype update must reset, not crash.
      return Array.isArray(saved.days) && Array.isArray(saved.posts) && Array.isArray(saved.watched) ? saved : init;
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
