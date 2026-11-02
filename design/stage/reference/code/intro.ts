// Who gets which opening moment. Kept out of BrandIntro.tsx so that file
// only exports components (react-refresh lint rule).
// Target path: src/lib/intro.ts

import { returnBeat } from "@/lib/brand-moments";

const INTRO_SEEN_KEY = "lu.introSeen";

/**
 * Which intro (if any) this cold start gets.
 * - Deep link / notification open → none.
 * - Signed in → "return", unless Home is cached, or the app mounted too late
 *   for the beat to finish inside the 1s budget → none.
 * - Not signed in and never seen the intro on this device → "first".
 * Existing installs that are signed in never see "first" when Stage turns on.
 *
 * homeCached: call only after the persisted cache has finished restoring
 * (TanStack's useIsRestoring() === false). It is true when BOTH of Home's
 * first-paint queries already have data: the enrolled-progress query for this
 * user and the catalogue query (the two Home.tsx gates its skeleton crossfade on).
 */
export function pickIntroMode(opts: {
  signedIn: boolean;
  homeCached: boolean;
  openedFromLink: boolean;
  /** ms since navigation start; defaults to performance.now() */
  nowMs?: number;
}): "first" | "return" | null {
  if (opts.openedFromLink) return null;
  if (opts.signedIn) {
    const now = opts.nowMs ?? performance.now();
    return opts.homeCached || now >= returnBeat.latestExitStartMs ? null : "return";
  }
  let seen = false;
  try {
    seen = localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    seen = true; // no storage: never risk replaying the intro on every launch
  }
  return seen ? null : "first";
}

export function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, "1");
  } catch {
    /* storage unavailable */
  }
}
