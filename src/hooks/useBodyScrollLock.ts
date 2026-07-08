import { useEffect } from "react";

/**
 * Reference-counted body-scroll lock — the app's SINGLE code path that writes
 * `document.body.style.overflow`.
 *
 * This retires the phase-2/phase-4 "sole writer by convention" invariant (where
 * CompletionTakeover was the only component allowed to touch body overflow, and
 * a second ad-hoc writer caused the June-14-class wedged-scroll race). Instead
 * of trusting every overlay to coordinate, the assignment lives HERE and is
 * shared through a module-level reference count:
 *
 *   • The FIRST locker captures the pre-lock `overflow` value and sets "hidden".
 *   • Nested/concurrent lockers just bump the count — they never re-capture, so
 *     an inner overlay can't snapshot the outer's "hidden" and re-apply it.
 *   • Only the LAST release restores the originally-captured value.
 *
 * Because capture/restore is impossible to interleave (one counter, one owner of
 * the captured value), two overlays open at once — or unmounting in either order
 * — can no longer leave the document wedged unscrollable. A June-14-class audit
 * greps for `body.style.overflow` writers: after adoption this file is the only
 * hit outside comments.
 *
 * Usage: `useBodyScrollLock(isOpen)` — pass the live open/lock state. The lock is
 * acquired on the true→ effect and released on cleanup (dismissal, unmount,
 * route change, Android back), all of which flip the argument or unmount the
 * host.
 */

// Module-scoped so every caller shares ONE lock. SSR-safe: these are only read
// inside effects, which never run on the server.
let lockCount = 0;
let capturedOverflow = "";

function acquireBodyScrollLock(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) {
    // First locker owns the restore value; inner lockers must not re-capture
    // (that would snapshot our own "hidden" and re-apply it on their release).
    capturedOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  lockCount += 1;
}

function releaseBodyScrollLock(): void {
  if (typeof document === "undefined") return;
  if (lockCount === 0) return;
  lockCount -= 1;
  if (lockCount === 0) {
    document.body.style.overflow = capturedOverflow;
  }
}

/**
 * Lock body scroll while `locked` is true. Reference-counted, so multiple
 * concurrent callers cooperate and the body only unlocks once the last one
 * releases. No-ops (and never acquires) while `locked` is false.
 */
export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    acquireBodyScrollLock();
    return releaseBodyScrollLock;
  }, [locked]);
}

export default useBodyScrollLock;
