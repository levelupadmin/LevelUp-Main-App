/**
 * RoomEntrance.tsx — the arrival beat for a cohort room (R1-T3).
 *
 * A room is a PLACE, and you arrive at a place once. This module owns the
 * "once per session per room" bookkeeping and hands back ready-to-spread framer
 * props for the two staged layers of the title card:
 *
 *   1. `art`   — the hero/crest layer fades (and settles a hair) into place.
 *   2. `plate` — the nameplate rises under it, one short beat later.
 *
 * Both stages ride `springs.glide` (src/lib/motion.ts) and animate OPACITY and
 * TRANSFORM only, so nothing here can shift layout or cost a paint on the
 * Android WebView compositor. The whole sequence is budgeted at
 * `ROOM_ENTRANCE_BUDGET_MS`; `ROOM_ENTRANCE_PLATE_DELAY_S` is the only timing
 * knob and it is deliberately small so the plate is legible almost immediately.
 *
 * Reduced motion: `useMotionSafe()` already collapses `glide` to an instant cut,
 * and on top of that the stages resolve to `initial: false` — the room paints
 * fully composed on the first frame, with no animation to sit through.
 *
 * Consumers: `<RoomMasthead>` reads this automatically. A shell that wants other
 * surfaces to join the same beat can wrap the subtree in `<RoomEntrance slug>`
 * (a context provider — it renders no DOM of its own) and read
 * `useRoomEntranceContext()`.
 */
import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import type { TargetAndTransition, Transition } from "framer-motion";
import { instant, useMotionSafe } from "@/lib/motion";

/** `sessionStorage` key prefix — one entry per room slug, per tab session. */
export const ROOM_ENTRANCE_STORAGE_PREFIX = "lu_room_entered_";

/**
 * Delay (seconds) before the nameplate rises, so the art reads first. Kept
 * short: the plate carries the room's name, and a name you wait for is a name
 * you notice missing.
 */
export const ROOM_ENTRANCE_PLATE_DELAY_S = 0.08;

/** How far the nameplate travels (px). Transform-only — it never moves layout. */
export const ROOM_ENTRANCE_PLATE_RISE_PX = 12;

/** The hard ceiling for the whole sequence (R1-T3 acceptance: ≤600ms total). */
export const ROOM_ENTRANCE_BUDGET_MS = 600;

/** How far the art settles in, as a scale. Sub-2%: a settle, not a zoom. */
const ART_SETTLE_SCALE = 1.015;

/**
 * Rest thresholds — WHEN the spring is allowed to declare itself finished, not
 * how it moves. `springs.glide` is only just overdamped, and framer's defaults
 * (restDelta 0.01, restSpeed 0.01/s) hold it "running" for ~200ms after the
 * motion stops being visible: measured, the untuned sequence settles at ~630ms,
 * i.e. a third of the budget spent travelling distances no eye can resolve.
 * The physics are untouched; only the stop condition moves.
 *
 * They are split by unit because the two scales are not comparable:
 *  - `UNIT` for opacity/scale (0–1): 1/100th of an opacity step, invisible.
 *  - `PX` for the translate: 0.4px is under half a device pixel at 2× DPR.
 */
const REST_UNIT = { restDelta: 0.1, restSpeed: 20 } as const;
const REST_PX = { restDelta: 0.4, restSpeed: 8 } as const;

/** Ready to spread onto a `motion.*` element: `<motion.div {...stage} />`. */
export interface RoomEntranceStage {
  /** `false` = paint at rest, no animation (already entered / reduced motion). */
  initial: false | TargetAndTransition;
  animate: TargetAndTransition;
  transition: Transition;
}

/** The two staged layers of the title card, plus whether this mount plays. */
export interface RoomEntranceStages {
  /** True only on the first mount of this room in this tab session. */
  playing: boolean;
  /** The hero art / monogram crest layer. */
  art: RoomEntranceStage;
  /** The nameplate (monogram, wordmark, tagline, status line). */
  plate: RoomEntranceStage;
}

/** The `sessionStorage` key for a room. Exported so QA can clear one room. */
export function roomEntranceKey(slug: string): string {
  return `${ROOM_ENTRANCE_STORAGE_PREFIX}${slug}`;
}

/**
 * Rooms already entered during THIS page load. `sessionStorage` is the source of
 * truth across reloads, but it throws on write in locked-down/private modes —
 * this set guarantees the sequence still plays at most once per load there,
 * rather than replaying on every in-app navigation back into the room.
 */
const enteredThisLoad = new Set<string>();

function hasEntered(slug: string): boolean {
  if (enteredThisLoad.has(slug)) return true;
  try {
    if (typeof sessionStorage === "undefined") return false;
    return sessionStorage.getItem(roomEntranceKey(slug)) !== null;
  } catch {
    // Storage unavailable — the in-memory set above is the only ledger.
    return false;
  }
}

function markEntered(slug: string): void {
  enteredThisLoad.add(slug);
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(roomEntranceKey(slug), "1");
    }
  } catch {
    // Private mode / storage disabled — the in-memory set still holds for this load.
  }
}

/** Fully-composed stages: what every mount after the first one renders. */
const AT_REST: RoomEntranceStages = {
  playing: false,
  art: { initial: false, animate: { opacity: 1, scale: 1 }, transition: instant },
  plate: { initial: false, animate: { opacity: 1, y: 0 }, transition: instant },
};

const RoomEntranceContext = createContext<RoomEntranceStages | null>(null);

export interface UseRoomEntranceOptions {
  /**
   * Set false to opt out of owning the sequence (the masthead passes this when a
   * `<RoomEntrance>` provider above it is already driving the beat). A disabled
   * hook never reads or writes the session ledger.
   */
  enabled?: boolean;
}

/**
 * The staged entrance for one room. Plays on the first mount of `slug` in this
 * tab session and is a no-op (fully-composed, no animation) forever after.
 */
export function useRoomEntrance(
  slug: string | null | undefined,
  { enabled = true }: UseRoomEntranceOptions = {},
): RoomEntranceStages {
  const { reduced, springs } = useMotionSafe();

  // Decided once per slug, during render, so the first painted frame is already
  // the correct one — deciding in an effect would flash the composed plate and
  // then animate it in. The read is side-effect free; the ledger is only written
  // in the effect below.
  const decided = useRef<{ slug?: string | null; play: boolean }>({ play: false });
  if (decided.current.slug !== slug) {
    decided.current = {
      slug,
      play: Boolean(slug) && enabled && !hasEntered(slug as string),
    };
  }
  const play = decided.current.play && enabled && !reduced;

  useEffect(() => {
    if (!slug || !enabled || !decided.current.play) return;
    markEntered(slug);
  }, [slug, enabled]);

  return useMemo<RoomEntranceStages>(() => {
    if (!play) return AT_REST;
    return {
      playing: true,
      art: {
        // A 1.5% settle reads as the art "arriving" rather than blinking on.
        // Transform-only, on a layer that is absolutely positioned — no reflow.
        initial: { opacity: 0, scale: ART_SETTLE_SCALE },
        animate: { opacity: 1, scale: 1 },
        transition: {
          ...springs.glide,
          opacity: { ...springs.glide, ...REST_UNIT },
          scale: { ...springs.glide, ...REST_UNIT },
        },
      },
      plate: {
        initial: { opacity: 0, y: ROOM_ENTRANCE_PLATE_RISE_PX },
        animate: { opacity: 1, y: 0 },
        // A per-value transition REPLACES the parent for that value, so the
        // delay is restated inside each one on purpose.
        transition: {
          ...springs.glide,
          delay: ROOM_ENTRANCE_PLATE_DELAY_S,
          opacity: { ...springs.glide, ...REST_UNIT, delay: ROOM_ENTRANCE_PLATE_DELAY_S },
          y: { ...springs.glide, ...REST_PX, delay: ROOM_ENTRANCE_PLATE_DELAY_S },
        },
      },
    };
  }, [play, springs]);
}

export interface RoomEntranceProps {
  /** The room slug — the identity the once-per-session ledger is keyed on. */
  slug: string;
  children: ReactNode;
}

/**
 * Drives one entrance for a whole room subtree. Renders no DOM (so it cannot
 * affect layout); descendants read the stages via `useRoomEntranceContext()`.
 * Optional — `<RoomMasthead>` runs its own entrance when there is no provider.
 */
export const RoomEntrance = ({ slug, children }: RoomEntranceProps) => {
  const stages = useRoomEntrance(slug);
  return (
    <RoomEntranceContext.Provider value={stages}>{children}</RoomEntranceContext.Provider>
  );
};

/** The stages from the nearest `<RoomEntrance>`, or null when there is none. */
export function useRoomEntranceContext(): RoomEntranceStages | null {
  return useContext(RoomEntranceContext);
}

export default RoomEntrance;
