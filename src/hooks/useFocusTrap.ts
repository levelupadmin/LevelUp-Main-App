import { useEffect, useRef } from "react";

/**
 * Accessible focus management for modal overlays (role="dialog" aria-modal).
 *
 * While `active` is true, this hook:
 *   1. MOVES focus into the container (first focusable element, or the
 *      container itself if none), so keyboard/SR users land inside the dialog
 *      instead of on the now-covered trigger.
 *   2. TRAPS Tab / Shift+Tab so focus cycles within the container and can never
 *      reach the inert background behind an aria-modal surface.
 *   3. RESTORES focus to whatever element was focused before activation once
 *      `active` flips false or the container unmounts.
 *
 * Attach the returned ref to the dialog surface. Safe to drive off an `open`
 * flag whose node is kept mounted by AnimatePresence for an exit animation:
 * cleanup (and thus focus restore) fires the instant `active` goes false, well
 * before the node is removed.
 *
 * Escape / backdrop dismissal remain the caller's concern — this hook only owns
 * focus.
 */
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function useFocusTrap<T extends HTMLElement>(active: boolean) {
  const containerRef = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    // Remember where focus was so we can hand it back on close.
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((el) => el.offsetParent !== null || el === document.activeElement);

    // Move focus in: first focusable, else the container itself.
    const initial = focusables()[0];
    if (initial) {
      initial.focus();
    } else {
      container.tabIndex = -1;
      container.focus();
    }

    // Trap Tab within the container; pull focus back if it ever escapes.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        container.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement as HTMLElement | null;

      if (!container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      // Restore focus to the pre-open element (e.g. the "Mark complete" trigger).
      if (previouslyFocused && typeof previouslyFocused.focus === "function") {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return containerRef;
}

export default useFocusTrap;
