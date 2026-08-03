/* The two clock hooks live beside the provider they read, which is what makes
   "one timer per room" enforceable by import rather than by convention. Fast
   Refresh only loses this module's state, and this module's state IS a clock
   that re-reads Date.now() on its next tick, so the trade costs nothing. */
/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * RoomClockProvider — ONE ticking clock for a whole room.
 *
 * Every timed surface in a room (the doors-open countdown, the six session
 * states, anything later that wants a live "now") reads this instead of owning
 * a `setInterval`. A room with twelve session slots on screen therefore runs
 * ONE timer, not twelve, which is the difference between a smooth Android
 * WebView and a hot phone.
 *
 * ── The three rules this file exists to keep ──────────────────────────────
 *  1. **One interval.** The provider hands the subtree a stable store; the
 *     store owns the only timer. Subscribers come and go without touching it.
 *  2. **1s only when a countdown is on screen.** The default cadence is
 *     `SLOW_TICK_MS` (a minute is ample for "is this session tonight?").
 *     A component inside T-60 calls `useRoomClockFastTick()` and the store
 *     switches to `FAST_TICK_MS` for as long as at least one such request is
 *     outstanding, then drops back.
 *  3. **Nothing ticks in the background.** A hidden document pauses the timer
 *     outright — a 1s tick in a backgrounded WebView is battery the student
 *     did not agree to spend. Coming back to the foreground reads the wall
 *     clock immediately, so the countdown is CORRECT on the first paint back,
 *     not one tick stale.
 *
 * ── Why there is no drift ─────────────────────────────────────────────────
 * Every tick RE-READS `Date.now()`. Nothing counts down a local number, so a
 * throttled interval, a paused background tab, or a device that slept cannot
 * accumulate error: the displayed remaining time is always
 * `target - Date.now()`, however late the tick that recomputed it arrived.
 */

/** Sub-second cadence, used only while something is inside its T-60 window. */
export const FAST_TICK_MS = 1_000;

/** The resting cadence: enough for date/state copy, cheap enough to ignore. */
export const SLOW_TICK_MS = 60_000;

/**
 * The store behind the context. Deliberately not a React value: subscribers
 * read it through `useSyncExternalStore`, so a tick re-renders the components
 * that asked for the time and nothing else in the room.
 */
export interface RoomClock {
  /** React store subscribe. Stable identity. */
  subscribe: (listener: () => void) => () => void;
  /** Epoch ms as of the last tick. Stable identity. */
  getSnapshot: () => number;
  /** Ask for 1s cadence; call the returned function to give it back. */
  requestFastTick: () => () => void;
}

export function createRoomClock(): RoomClock {
  const listeners = new Set<() => void>();
  let nowMs = Date.now();
  let fastRequests = 0;
  let timerId: number | null = null;
  /** The period the live timer was created with, or null when there is none. */
  let period: number | null = null;
  let visibilityBound = false;

  const isHidden = (): boolean =>
    typeof document !== "undefined" && document.visibilityState === "hidden";

  const tick = () => {
    nowMs = Date.now();
    listeners.forEach((listener) => listener());
  };

  /** Null means "no timer at all": nobody is listening, or we are backgrounded. */
  const desiredPeriod = (): number | null => {
    if (listeners.size === 0) return null;
    if (isHidden()) return null;
    return fastRequests > 0 ? FAST_TICK_MS : SLOW_TICK_MS;
  };

  const onVisibilityChange = () => {
    // Catch the clock up BEFORE restarting the timer, so the first frame back
    // shows the true time rather than whatever it was when we were hidden.
    if (!isHidden()) tick();
    sync();
  };

  function sync() {
    const wantsVisibility = listeners.size > 0;
    if (wantsVisibility !== visibilityBound && typeof document !== "undefined") {
      if (wantsVisibility) {
        document.addEventListener("visibilitychange", onVisibilityChange);
      } else {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
      visibilityBound = wantsVisibility;
    }

    const next = desiredPeriod();
    if (next === period) return;
    if (timerId !== null) {
      window.clearInterval(timerId);
      timerId = null;
    }
    period = next;
    if (next !== null && typeof window !== "undefined") {
      timerId = window.setInterval(tick, next);
    }
  }

  return {
    subscribe: (listener: () => void) => {
      // The first subscriber after an idle stretch inherits whatever the last
      // tick left behind, which may be minutes old. Refresh on the way in.
      if (listeners.size === 0) nowMs = Date.now();
      listeners.add(listener);
      sync();
      return () => {
        listeners.delete(listener);
        sync();
      };
    },
    getSnapshot: () => nowMs,
    requestFastTick: () => {
      fastRequests += 1;
      sync();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        fastRequests = Math.max(0, fastRequests - 1);
        sync();
      };
    },
  };
}

const RoomClockContext = createContext<RoomClock | null>(null);

/**
 * The clock a consumer rendered OUTSIDE a provider falls back to.
 *
 * Shared and reference-counted like the real one, so an orphan slot degrades to
 * "one extra interval per document" rather than one per component, and only
 * while such a component is actually mounted. In practice every room surface
 * renders under `RoomShell`, which mounts the provider.
 */
let fallbackClock: RoomClock | null = null;
const getFallbackClock = (): RoomClock => (fallbackClock ??= createRoomClock());

/**
 * Mounts the room's clock. Rendered ONCE, by `RoomShell`, around the module
 * outlet — mounting it per module would put the count back to one timer each.
 */
export function RoomClockProvider({ children }: { children: ReactNode }) {
  // Created once per mounted room and never replaced; the store is idle (no
  // timer, no listener) until something subscribes, so remounting is cheap.
  const [clock] = useState(createRoomClock);
  return <RoomClockContext.Provider value={clock}>{children}</RoomClockContext.Provider>;
}

/** The room's current time, in epoch ms. Re-renders the caller on each tick. */
export function useRoomClock(): number {
  const clock = useContext(RoomClockContext) ?? getFallbackClock();
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot);
}

/**
 * Hold the room's clock at 1s cadence while `enabled` — the T-60 window, and
 * nothing else. Released automatically on unmount or when `enabled` goes false,
 * so the room falls back to its minute cadence the moment the last countdown
 * leaves the screen.
 */
export function useRoomClockFastTick(enabled = true): void {
  const clock = useContext(RoomClockContext) ?? getFallbackClock();
  useEffect(() => {
    if (!enabled) return;
    return clock.requestFastTick();
  }, [clock, enabled]);
}

export default RoomClockProvider;
